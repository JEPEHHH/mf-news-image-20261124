/**
 * THE WORLD — the press.
 *
 * Everything that touches pixels lives here, and nothing here knows what a
 * newspaper is: a flat RGBA buffer on a supersampled device grid, the drawing
 * primitives, the typesetter, the two photographic plates, and the PNG writer.
 *
 *   raster    one flat RGBA buffer on a 3x supersampled device grid, box-filtered
 *             down to the page size, so strokes and pictures carry real
 *             anti-aliasing instead of pixel steps.
 *   type      glyph polylines from ./glyphs.ts stroked with round caps and joins,
 *             measured before they are set, justified to the measure.
 *   pictures  photographs: raw RGB plates resampled to device resolution with a
 *             Catmull-Rom separable filter, graded, and darkened under a gradient
 *             wherever type sits on top of them.
 *   png       IHDR + IDAT (zlib.deflateSync) + IEND with a table-driven CRC32.
 *
 * The canvas is not allocated at import time: call initCanvas(w, h) once, before
 * the first drawing call, with the page size the layout asks for.
 */

import * as fs from "node:fs";
import * as zlib from "node:zlib";
import { CAP, XH, GLYPH, inkBox, type Pt } from "./glyphs.ts";

/* =============================================================== 1. colour == */

export type RGB = [number, number, number];

export const INK: RGB = [18, 24, 31];          // #12181f
export const INK_2: RGB = [44, 52, 62];
export const PAPER: RGB = [245, 239, 228];     // #f5efe4
export const PAPER_HI: RGB = [250, 246, 238];
export const PAPER_LO: RGB = [233, 225, 210];
export const BRICK: RGB = [166, 58, 42];       // #a63a2a
export const BRICK_DK: RGB = [132, 44, 32];
export const TEAL: RGB = [47, 111, 106];       // #2f6f6a
export const WHITE: RGB = [250, 247, 241];

export function mix(a: RGB, b: RGB, t: number): RGB {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return [
    a[0] + (b[0] - a[0]) * u,
    a[1] + (b[1] - a[1]) * u,
    a[2] + (b[2] - a[2]) * u,
  ];
}
export const INK_SOFT = mix(INK, PAPER, 0.38);
export const HAIR = mix(INK, PAPER, 0.64);
export const RULE = mix(INK, PAPER, 0.46);

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
export const smooth = (t: number) => { const u = clamp01(t); return u * u * (3 - 2 * u); };
export const ss01 = (a: number, b: number, x: number) => smooth((x - a) / (b - a || 1e-9));

export function ramp(stops: [number, RGB][], t: number): RGB {
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 0; i + 1 < stops.length; i++) {
    const [p0, c0] = stops[i], [p1, c1] = stops[i + 1];
    if (t <= p1) return mix(c0, c1, (t - p0) / (p1 - p0 || 1e-9));
  }
  return stops[stops.length - 1][1];
}

/* =============================================================== 2. raster = */

export const SS = 3;                           // supersampling factor

let W = 0;                                     // page width in pixels
let H = 0;                                     // page height in pixels
let DW = 0;                                    // device grid, W * SS
let DH = 0;                                    // device grid, H * SS

let dev = new Uint8Array(0);
let out = new Uint8Array(0);

export function initCanvas(w: number, h: number) {
  W = w; H = h; DW = w * SS; DH = h * SS;
  dev = new Uint8Array(DW * DH * 4);
  out = new Uint8Array(W * H * 4);
}

export const pageWidth = () => W;
export const pageHeight = () => H;

export type Clip = [number, number, number, number] | null;

/** artwork is clipped to its own frame, so nothing bleeds onto the paper */
let CLIP: Clip = null;

export function clipTo(x: number, y: number, w: number, h: number): Clip {
  const prev = CLIP;
  CLIP = [
    Math.max(0, Math.round(x * SS)), Math.max(0, Math.round(y * SS)),
    Math.min(DW, Math.round((x + w) * SS)), Math.min(DH, Math.round((y + h) * SS)),
  ];
  return prev;
}

export function restoreClip(prev: Clip) { CLIP = prev; }

function putD(x: number, y: number, c: RGB, a: number) {
  if (a <= 0) return;
  if (CLIP && (x < CLIP[0] || y < CLIP[1] || x >= CLIP[2] || y >= CLIP[3])) return;
  if (x < 0 || y < 0 || x >= DW || y >= DH) return;
  const i = (y * DW + x) * 4;
  if (a >= 1) {
    dev[i] = c[0]; dev[i + 1] = c[1]; dev[i + 2] = c[2];
    return;
  }
  dev[i] = Math.round(dev[i] + (c[0] - dev[i]) * a);
  dev[i + 1] = Math.round(dev[i + 1] + (c[1] - dev[i + 1]) * a);
  dev[i + 2] = Math.round(dev[i + 2] + (c[2] - dev[i + 2]) * a);
}

/** device-space rectangle with exact area coverage — soft edges, no staircase */
function fillD(x0: number, y0: number, x1: number, y1: number, c: RGB, a = 1) {
  if (x1 <= x0 || y1 <= y0) return;
  const fx0 = x0 > 0 ? x0 : 0, fx1 = x1 < DW ? x1 : DW;
  const fy0 = y0 > 0 ? y0 : 0, fy1 = y1 < DH ? y1 : DH;
  if (fx1 <= fx0 || fy1 <= fy0) return;
  const ix0 = Math.floor(fx0), ix1 = Math.ceil(fx1) - 1;
  const iy0 = Math.floor(fy0), iy1 = Math.ceil(fy1) - 1;
  for (let yd = iy0; yd <= iy1; yd++) {
    const oy = Math.min(fy1, yd + 1) - Math.max(fy0, yd);
    if (oy <= 0) continue;
    for (let xd = ix0; xd <= ix1; xd++) {
      const ox = Math.min(fx1, xd + 1) - Math.max(fx0, xd);
      if (ox <= 0) continue;
      putD(xd, yd, c, a * (ox >= 1 && oy >= 1 ? 1 : ox * oy));
    }
  }
}

/** page-space rectangle (sub-pixel coordinates welcome) */
export function rect(x: number, y: number, w: number, h: number, c: RGB, a = 1) {
  fillD(x * SS, y * SS, (x + w) * SS, (y + h) * SS, c, a);
}

/** vertical gradient across a page-space band */
export function gradV(x: number, y: number, w: number, h: number, stops: [number, RGB][]) {
  const n = Math.max(1, Math.round(h));
  for (let j = 0; j < n; j++) rect(x, y + j, w, 1, ramp(stops, n <= 1 ? 0 : j / (n - 1)));
}

/** per-device-pixel shader over a page-space box; fn writes into SHADE, true to paint */
export const SHADE = new Float64Array(4);

export function shadeRect(x: number, y: number, w: number, h: number,
                          fn: (u: number, v: number, xl: number, yl: number) => boolean) {
  const X0 = Math.max(0, Math.floor(x * SS)), X1 = Math.min(DW - 1, Math.ceil((x + w) * SS));
  const Y0 = Math.max(0, Math.floor(y * SS)), Y1 = Math.min(DH - 1, Math.ceil((y + h) * SS));
  const col: RGB = [0, 0, 0];
  for (let yd = Y0; yd <= Y1; yd++) {
    const yl = (yd + 0.5) / SS, v = (yl - y) / h;
    for (let xd = X0; xd <= X1; xd++) {
      const xl = (xd + 0.5) / SS, u = (xl - x) / w;
      if (!fn(u, v, xl, yl)) continue;
      col[0] = SHADE[0]; col[1] = SHADE[1]; col[2] = SHADE[2];
      putD(xd, yd, col, SHADE[3]);
    }
  }
}

export function discAA(cx: number, cy: number, r: number, c: RGB, a = 1) {
  if (r <= 0) return;
  const X0 = Math.max(0, Math.floor((cx - r - 1) * SS)), X1 = Math.min(DW - 1, Math.ceil((cx + r + 1) * SS));
  const Y0 = Math.max(0, Math.floor((cy - r - 1) * SS)), Y1 = Math.min(DH - 1, Math.ceil((cy + r + 1) * SS));
  for (let yd = Y0; yd <= Y1; yd++) {
    const yl = (yd + 0.5) / SS, dy = yl - cy;
    for (let xd = X0; xd <= X1; xd++) {
      const xl = (xd + 0.5) / SS, dx = xl - cx;
      const cov = (r - Math.sqrt(dx * dx + dy * dy)) * SS + 0.5;
      if (cov > 0) putD(xd, yd, c, a * (cov < 1 ? cov : 1));
    }
  }
}

/** a straight line with round caps: the workhorse of the type */
export function lineAA(x0: number, y0: number, x1: number, y1: number, c: RGB, thick = 1, a = 1) {
  const h = Math.max(thick, 0.05) / 2;
  const X0 = Math.max(0, Math.floor((Math.min(x0, x1) - h - 1) * SS));
  const X1 = Math.min(DW - 1, Math.ceil((Math.max(x0, x1) + h + 1) * SS));
  const Y0 = Math.max(0, Math.floor((Math.min(y0, y1) - h - 1) * SS));
  const Y1 = Math.min(DH - 1, Math.ceil((Math.max(y0, y1) + h + 1) * SS));
  const dx = x1 - x0, dy = y1 - y0, l2 = dx * dx + dy * dy || 1e-9;
  for (let yd = Y0; yd <= Y1; yd++) {
    const yl = (yd + 0.5) / SS;
    for (let xd = X0; xd <= X1; xd++) {
      const xl = (xd + 0.5) / SS;
      let t = ((xl - x0) * dx + (yl - y0) * dy) / l2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = x0 + dx * t, qy = y0 + dy * t;
      const d = Math.sqrt((xl - qx) * (xl - qx) + (yl - qy) * (yl - qy));
      const cov = (h - d) * SS + 0.5;
      if (cov > 0) putD(xd, yd, c, a * (cov < 1 ? cov : 1));
    }
  }
}

/** a stroked polyline: round caps, round joins, constant weight */
export function strokePoly(pts: Pt[], c: RGB, thick: number, a = 1) {
  if (!pts.length) return;
  if (pts.length === 1) { discAA(pts[0][0], pts[0][1], thick / 2, c, a); return; }
  for (let i = 0; i + 1 < pts.length; i++)
    lineAA(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], c, thick, a);
}

export function poly(pts: Pt[], c: RGB, a = 1) {
  let lo = Infinity, hi = -Infinity;
  for (const p of pts) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); }
  const X0 = Math.max(0, Math.floor((Math.min(...pts.map((p) => p[0])) - 1) * SS));
  const X1 = Math.min(DW - 1, Math.ceil((Math.max(...pts.map((p) => p[0])) + 1) * SS));
  const Y0 = Math.max(0, Math.floor(lo * SS)), Y1 = Math.min(DH - 1, Math.ceil(hi * SS));
  const xs: number[] = [];
  for (let yd = Y0; yd <= Y1; yd++) {
    const yl = (yd + 0.5) / SS;
    xs.length = 0;
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      if ((ay <= yl && by > yl) || (by <= yl && ay > yl)) xs.push(ax + ((yl - ay) / (by - ay)) * (bx - ax));
    }
    if (xs.length < 2) continue;
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(X0, Math.floor(xs[k] * SS)), xb = Math.min(X1, Math.ceil(xs[k + 1] * SS));
      for (let xd = xa; xd <= xb; xd++) {
        const xl = (xd + 0.5) / SS;
        if (xl >= xs[k] && xl < xs[k + 1]) putD(xd, yd, c, a);
      }
    }
  }
}

/* ============================================================ 3. the type == */

export type TStyle = {
  size: number;        // cap height in page pixels
  color: RGB;
  weight?: number;     // stroke thickness as a fraction of the cap height
  tk?: number;         // tracking in page pixels
  acw?: number;        // horizontal condense factor
  lead?: number;       // extra leading as a fraction of the cap height
  alpha?: number;
  serif?: number;      // serif length in glyph units; text sizes carry serifs
};

export const USED = new Set<string>();

const trackOf = (st: TStyle) => (st.tk === undefined ? 0.045 * st.size : st.tk);

export function advance(ch: string, st: TStyle) {
  const g = GLYPH[ch];
  const sc = (st.size / CAP) * (st.acw ?? 1);
  if (!g) { USED.add(ch); return 0.5 * st.size; }
  return g.w * sc + trackOf(st);
}

export function textW(s: string, st: TStyle) {
  let w = 0;
  for (const ch of s) w += advance(ch, st);
  return s.length ? w - trackOf(st) : 0;
}

export function drawGlyph(ch: string, x: number, y: number, st: TStyle) {
  const g = GLYPH[ch];
  if (!g) { USED.add(ch); return; }
  USED.add(ch);
  const sc = (st.size / CAP) * (st.acw ?? 1);
  const sv = st.size / CAP;
  const th = (st.weight ?? 0.105) * st.size;
  const a = st.alpha ?? 1;
  for (const stroke of g.s) {
    if (stroke.length === 1) { discAA(x + stroke[0][0] * sc, y + stroke[0][1] * sv, th / 2, st.color, a); continue; }
    const pts: Pt[] = new Array(stroke.length);
    for (let i = 0; i < stroke.length; i++) pts[i] = [x + stroke[i][0] * sc, y + stroke[i][1] * sv];
    strokePoly(pts, st.color, th, a);
  }
  const sl = st.serif ?? 0;
  if (sl <= 0) return;
  // text sizes are serifed: a stem that ends on the cap line, the x-height or the
  // baseline grows a small crossbar on each side, clamped to the letter's own ink
  const box = inkBox(ch);
  for (const stroke of g.s) {
    if (stroke.length < 2) continue;
    for (const first of [true, false]) {
      const end = first ? stroke[0] : stroke[stroke.length - 1];
      const near = first ? stroke[1] : stroke[stroke.length - 2];
      if (Math.abs(end[0] - near[0]) > 8) continue;
      if (Math.abs(end[1] - near[1]) < 22) continue;
      const atLine = Math.abs(end[1]) < 5 || Math.abs(end[1] - XH) < 5 || Math.abs(end[1] - CAP) < 5;
      if (!atLine) continue;
      const sx0 = Math.max(box.x0, end[0] - sl), sx1 = Math.min(box.x1, end[0] + sl);
      if (sx1 - sx0 < 5) continue;
      lineAA(x + sx0 * sc, y + end[1] * sv, x + sx1 * sc, y + end[1] * sv, st.color, th * 0.84, a);
    }
  }
}

export function drawText(x: number, y: number, s: string, st: TStyle) {
  let cx = x;
  for (const ch of s) {
    if (ch !== " ") drawGlyph(ch, cx, y, st);
    cx += advance(ch, st);
  }
}

export function textCenter(x: number, y: number, w: number, s: string, st: TStyle) {
  drawText(x + (w - textW(s, st)) / 2, y, s, st);
}

export function textRight(xr: number, y: number, s: string, st: TStyle) {
  drawText(xr - textW(s, st), y, s, st);
}

export const lh = (st: TStyle) => st.size * (1 + (st.lead === undefined ? 0.42 : st.lead));

export function wrapText(s: string, maxW: number, st: TStyle) {
  const words = s.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const cand = cur ? cur + " " + w : w;
    if (textW(cand, st) <= maxW) { cur = cand; continue; }
    if (cur) lines.push(cur);
    cur = w;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** wrap with a narrower measure for the first `narrow` lines, then the full one */
export function wrapSplit(text: string, narrowW: number, wideW: number, narrow: number, st: TStyle, tk: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let i = 0;
  while (i < words.length && lines.length < narrow) {
    let cur = words[i++];
    while (i < words.length && textW(cur + " " + words[i], st) <= narrowW) cur += " " + words[i++];
    lines.push(cur);
  }
  while (i < words.length) {
    let cur = words[i++];
    while (i < words.length && textW(cur + " " + words[i], st) <= wideW) cur += " " + words[i++];
    lines.push(cur);
  }
  return lines;
}

/** biggest style whose wrapped text fits maxLines inside maxW */
export function fitHead(s: string, maxW: number, sizes: number[], maxLines: number, o: Partial<TStyle>) {
  let fallback: { st: TStyle; lines: string[] } | null = null;
  for (const size of sizes) {
    const st: TStyle = { size, color: INK, ...o, tk: o.tk === undefined ? 0.05 * size : o.tk === -1 ? 0.06 * size : o.tk };
    const lines = wrapText(s, maxW, st);
    fallback = { st, lines };
    if (lines.length <= maxLines && lines.every((l) => textW(l, st) <= maxW)) return fallback;
  }
  return fallback!;
}

export type Fit = { size: number; st: TStyle; lines: string[]; per: number; lh: number };

/** biggest size in `sizes` whose wrapped text fits maxH over nCols; never splits a line */
export function fitBody(text: string, colW: number, maxH: number, sizes: number[], nCols: number,
                       acw = 1, tk?: number) {
  const last: Fit = { size: sizes[sizes.length - 1], st: { size: sizes[sizes.length - 1], color: INK }, lines: [], per: 0, lh: 0 };
  for (const size of sizes) {
    const st: TStyle = { size, acw, tk, color: INK };
    const lines = wrapText(text, colW, st);
    const per = Math.ceil(lines.length / nCols);
    const l = lh(st);
    last.size = size; last.st = st; last.lines = lines; last.per = per; last.lh = l;
    if (per * l <= maxH) return last;
  }
  return last;
}

/** one line set flush to the measure: newspaper copy is justified */
export function drawJust(x: number, y: number, s: string, st: TStyle, targetW: number) {
  const words = s.split(" ");
  if (words.length < 2) { drawText(x, y, s, st); return; }
  const space = advance(" ", st);
  let wordsW = 0;
  for (const w of words) wordsW += textW(w, st);
  const extra = (targetW - wordsW - (words.length - 1) * space) / (words.length - 1);
  if (extra > space * 1.05) { drawText(x, y, s, st); return; }   // too loose to set
  let cx = x;
  for (const w of words) { drawText(cx, y, w, st); cx += textW(w, st) + space + extra; }
}

export function drawPara(x: number, y: number, lines: string[], st: TStyle, step: number, indent = 0, colW = 0) {
  lines.forEach((l, i) => {
    const lx = x + (i === 0 ? indent : 0);
    const last = i === lines.length - 1;
    if (colW > 0 && !last) drawJust(lx, y + i * step, l, st, colW - (i === 0 ? indent : 0));
    else drawText(lx, y + i * step, l, st);
  });
}

/** every character the page asks the face for, and the ones it does not have */
export function typeAudit() {
  return { used: USED.size, missing: [...USED].filter((c) => !GLYPH[c]) };
}

/* ========================================================= 4. the plates == */

export type Photo = { w: number; h: number; px: Uint8Array };

export function loadPhoto(file: string, w: number, h: number): Photo {
  const raw = zlib.inflateSync(fs.readFileSync(file));
  if (raw.length !== w * h * 3) throw new Error(`plate ${file}: ${raw.length} bytes, want ${w * h * 3}`);
  return { w, h, px: new Uint8Array(raw) };
}

/** box blur of a raw RGB plate, used as the unsharp reference */
function blurPlate(p: Photo, radius: number): Float32Array {
  const { w, h, px } = p;
  const outv = new Float32Array(w * h * 3);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -radius; dx <= radius; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const i = (yy * w + xx) * 3;
          r += px[i]; g += px[i + 1]; b += px[i + 2]; n++;
        }
      }
      const o = (y * w + x) * 3;
      outv[o] = r / n; outv[o + 1] = g / n; outv[o + 2] = b / n;
    }
  return outv;
}

/** unsharp mask the plate so it still reads as a photograph after enlargement */
export function sharpenPlate(p: Photo, amount: number, radius: number) {
  const { w, h, px } = p;
  const ref = blurPlate(p, radius);
  for (let i = 0; i < w * h * 3; i++) px[i] = clamp(px[i] + amount * (px[i] - ref[i]), 0, 255);
}

/** lift / gain / saturation / cool shadows, in one pass */
export function gradePlate(p: Photo, lift: number, gain: number, sat: number, cool: number) {
  const { px } = p;
  for (let i = 0; i < px.length; i += 3) {
    let r = px[i], g = px[i + 1], b = px[i + 2];
    r = lift + gain * r; g = lift + gain * g; b = lift + gain * b;
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    r = y + (r - y) * sat; g = y + (g - y) * sat; b = y + (b - y) * sat;
    const shadow = 1 - ss01(40, 170, y);                        // only the dark end cools
    r -= cool * shadow * 6; g += cool * shadow * 2; b += cool * shadow * 9;
    px[i] = clamp(r, 0, 255); px[i + 1] = clamp(g, 0, 255); px[i + 2] = clamp(b, 0, 255);
  }
}

const CR = (t: number): number[] => {
  const t2 = t * t, t3 = t2 * t;
  return [
    0.5 * (-t3 + 2 * t2 - t),
    0.5 * (3 * t3 - 5 * t2 + 2),
    0.5 * (-3 * t3 + 4 * t2 + t),
    0.5 * (t3 - t2),
  ];
};

/** Catmull-Rom resample of a sub-rectangle of a plate to dw x dh device pixels */
function resample(p: Photo, sx0: number, sy0: number, sx1: number, sy1: number, dw: number, dh: number) {
  const sw = sx1 - sx0, sh = sy1 - sy0;
  const mid = new Float32Array(dw * sh * 3);
  for (let y = 0; y < sh; y++) {
    const sy = clamp(Math.floor(sy0 + y), 0, p.h - 1);
    const row = sy * p.w * 3;
    for (let x = 0; x < dw; x++) {
      const fx = sx0 + ((x + 0.5) / dw) * sw - 0.5;
      const i0 = Math.floor(fx);
      const wgt = CR(fx - i0);
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < 4; k++) {
        const xx = clamp(i0 - 1 + k, 0, p.w - 1);
        const i = row + xx * 3, wk = wgt[k];
        r += p.px[i] * wk; g += p.px[i + 1] * wk; b += p.px[i + 2] * wk;
      }
      const o = (y * dw + x) * 3;
      mid[o] = r; mid[o + 1] = g; mid[o + 2] = b;
    }
  }
  const outv = new Uint8Array(dw * dh * 3);
  for (let x = 0; x < dw; x++)
    for (let y = 0; y < dh; y++) {
      const fy = ((y + 0.5) / dh) * sh - 0.5;
      const j0 = Math.floor(fy);
      const wgt = CR(fy - j0);
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < 4; k++) {
        const yy = clamp(j0 - 1 + k, 0, sh - 1);
        const i = (yy * dw + x) * 3, wk = wgt[k];
        r += mid[i] * wk; g += mid[i + 1] * wk; b += mid[i + 2] * wk;
      }
      const o = (y * dw + x) * 3;
      outv[o] = clamp(r, 0, 255) | 0; outv[o + 1] = clamp(g, 0, 255) | 0; outv[o + 2] = clamp(b, 0, 255) | 0;
    }
  return outv;
}

/** place a plate on the page: resample the source band, then paste at device size */
export function plate(p: Photo, sx0: number, sy0: number, sx1: number, sy1: number,
                      x: number, y: number, w: number, h: number) {
  const prevClip = clipTo(x, y, w, h);
  const dw = Math.max(1, Math.round(w * SS)), dh = Math.max(1, Math.round(h * SS));
  const buf = resample(p, sx0, sy0, sx1, sy1, dw, dh);
  const X0 = Math.round(x * SS), Y0 = Math.round(y * SS);
  const col: RGB = [0, 0, 0];
  for (let j = 0; j < dh; j++) {
    const yd = Y0 + j;
    if (yd < 0 || yd >= DH) continue;
    for (let i = 0; i < dw; i++) {
      const xd = X0 + i;
      if (xd < 0 || xd >= DW) continue;
      const s = (j * dw + i) * 3;
      col[0] = buf[s]; col[1] = buf[s + 1]; col[2] = buf[s + 2];
      putD(xd, yd, col, 1);
    }
  }
  restoreClip(prevClip);
}

/** a small credit strip printed inside a dark plate, bottom left, with a scrim */
export function plateCredit(x: number, y: number, w: number, h: number, text: string) {
  const st: TStyle = { size: 16, color: WHITE, weight: 0.13, tk: 1.5, alpha: 0.92 };
  const tw = textW(text, st);
  const bx = x + 12, by = y + h - 12 - 16;
  rect(bx - 6, by - 5, tw + 12, 26, [8, 11, 16], 0.42);
  drawText(bx, by, text, st);
}

/** source rectangle that covers a w x h box from a plate, centre-weighted */
export function cover(p: Photo, w: number, h: number, bias = 0.5): [number, number, number, number] {
  const ta = w / h, sa = p.w / p.h;
  if (sa > ta) { const cw = p.h * ta; const sx = (p.w - cw) * 0.5; return [sx, 0, sx + cw, p.h]; }
  const ch = p.w / ta;
  const sy = (p.h - ch) * bias;
  return [0, sy, p.w, sy + ch];
}

/* ===================================================== 5. paper + downres == */

/** stock: a vertical tint, with the corners browned off */
export function paperTexture() {
  for (let j = 0; j < H; j++) {
    const c = ramp([[0, PAPER_HI], [0.55, PAPER], [1, PAPER_LO]], j / (H - 1));
    for (let i = 0; i < W; i++) {
      const dx = ((i + 0.5) / W) * 2 - 1, dy = ((j + 0.5) / H) * 2 - 1;
      const d = Math.sqrt(dx * dx + dy * dy) / 1.4142;
      const v = Math.max(0, (d - 0.70) / 0.30);
      const a = Math.min(0.03, v * 0.03);
      const x0 = i * SS, y0 = j * SS;
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const k = ((y0 + sy) * DW + x0 + sx) * 4;
          dev[k] = c[0] + (180 - c[0]) * a;
          dev[k + 1] = c[1] + (160 - c[1]) * a;
          dev[k + 2] = c[2] + (126 - c[2]) * a;
        }
    }
  }
}

export function downscale() {
  const n = SS * SS;
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SS; sy++) {
        const row = ((j * SS + sy) * DW + i * SS) * 4;
        for (let sx = 0; sx < SS; sx++) {
          const k = row + sx * 4;
          r += dev[k]; g += dev[k + 1]; b += dev[k + 2];
        }
      }
      const o = (j * W + i) * 4;
      out[o] = (r / n + 0.5) | 0;
      out[o + 1] = (g / n + 0.5) | 0;
      out[o + 2] = (b / n + 0.5) | 0;
      out[o + 3] = 255;
    }
}

/** a whisper of press texture: deterministic, two levels, most pixels untouched */
export function pressGrain() {
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      let hsh = (i * 374761393 + j * 668265263) | 0;
      hsh = (hsh ^ (hsh >>> 13)) * 1274126177;
      const n = ((hsh ^ (hsh >>> 16)) >>> 0) / 4294967295;
      if (n < 0.26) {
        const k = (j * W + i) * 4;
        const d = n < 0.13 ? -3 : 3;
        out[k] = clamp(out[k] + d, 0, 255);
        out[k + 1] = clamp(out[k + 1] + d, 0, 255);
        out[k + 2] = clamp(out[k + 2] + d, 0, 255);
      }
    }
}

export const pixels = () => out;

/* ============================================================ 6. encoder == */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(b: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function chunk(type: string, data: Uint8Array) {
  const outv = new Uint8Array(12 + data.length);
  const dv = new DataView(outv.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) outv[4 + i] = type.charCodeAt(i);
  outv.set(data, 8);
  dv.setUint32(8 + data.length, crc32(outv.subarray(4, 8 + data.length)));
  return outv;
}

/** pick the cheapest of the five PNG filters for every scan line */
export function filterScanlines(rgba: Uint8Array, w: number, h: number) {
  const stride = w * 4;
  const o = new Uint8Array((stride + 1) * h);
  const prev = new Uint8Array(stride);
  const cand = [0, 1, 2, 3, 4].map(() => new Uint8Array(stride));
  for (let y = 0; y < h; y++) {
    const cur = rgba.subarray(y * stride, (y + 1) * stride);
    let best = 0, bestScore = Infinity;
    for (let f = 0; f < 5; f++) {
      const dst = cand[f];
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= 4 ? cur[i - 4] : 0;
        const b = prev[i];
        const c = i >= 4 ? prev[i - 4] : 0;
        let v: number;
        if (f === 0) v = cur[i];
        else if (f === 1) v = cur[i] - a;
        else if (f === 2) v = cur[i] - b;
        else if (f === 3) v = cur[i] - ((a + b) >> 1);
        else {
          const pp = a + b - c;
          const pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
          v = cur[i] - (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
        }
        v &= 0xff;
        dst[i] = v;
        score += v < 128 ? v : 256 - v;
      }
      if (score < bestScore) { bestScore = score; best = f; }
    }
    o[y * (stride + 1)] = best;
    o.set(cand[best], y * (stride + 1) + 1);
    prev.set(cur);
  }
  return o;
}

export function encodePNG(w: number, h: number, rgba: Uint8Array) {
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", new Uint8Array(zlib.deflateSync(filterScanlines(rgba, w, h), { level: 9 }))),
    chunk("IEND", new Uint8Array(0)),
  ];
  let total = 0;
  for (const p of parts) total += p.length;
  const png = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { png.set(p, off); off += p.length; }
  return png;
}
