/**
 * THE WORLD — front page for Monday 24 November 2026.
 *
 * Standalone: `node main.ts` writes /output/entry.png.
 * No dependencies, no network, no Date/Math.random: every run is byte-identical.
 *
 *   type      single-stroke letterforms in the Hershey simplex lineage: A-Z, a-z, 0-9
 *             and the punctuation press English actually needs, defined as polylines
 *             on a fixed 100-unit cap grid and stroked with round caps and joins.
 *             Display type is heavy, body copy is light and condensed; every line is
 *             measured before it is set and long lines are justified.
 *   raster    one flat RGBA buffer on a 3x supersampled device grid (4560 x 7560),
 *             box-filtered down to 1520 x 2520, so strokes and pictures carry real
 *             anti-aliasing instead of pixel steps.
 *   pictures  photographs: two raw RGB plates, resampled to device resolution with a
 *             Catmull-Rom separable filter, graded, and darkened under a gradient
 *             wherever type sits on top of them.
 *   png       IHDR + IDAT (zlib.deflateSync) + IEND with a table-driven CRC32.
 *
 * Page grid: 1520 x 2520. The lead package occupies exactly 60% of the page height.
 */

import * as fs from "node:fs";
import * as zlib from "node:zlib";

/* ============================================================ 1. geometry == */

const SS = 3;                                 // supersampling factor
const W = 1520;
const H = 2520;
const DW = W * SS;
const DH = H * SS;

const M = 56;                                 // page margin
const CONTENT = W - 2 * M;                    // 1408

const GUT = 38;                               // column gutter
const SIDE_W = 442;                           // right hand column
const LEAD_W = CONTENT - GUT - SIDE_W;        // 928
const SIDE_X = M + LEAD_W + GUT;              // 1022

const LEAD_TOP = 352;                         // first row of the lead package
const LEAD_H = Math.round(H * 0.6);           // the lead is 60% of the page height
const LEAD_BOT = LEAD_TOP + LEAD_H;           // 1864
const TICK_TOP = LEAD_BOT + 24;               // 1888

/* =============================================================== 2. colour == */

type RGB = [number, number, number];

const INK: RGB = [18, 24, 31];                // #12181f
const INK_2: RGB = [44, 52, 62];
const PAPER: RGB = [245, 239, 228];           // #f5efe4
const PAPER_HI: RGB = [250, 246, 238];
const PAPER_LO: RGB = [233, 225, 210];
const BRICK: RGB = [166, 58, 42];             // #a63a2a
const BRICK_DK: RGB = [132, 44, 32];
const TEAL: RGB = [47, 111, 106];             // #2f6f6a
const WHITE: RGB = [250, 247, 241];

function mix(a: RGB, b: RGB, t: number): RGB {
  const u = t < 0 ? 0 : t > 1 ? 1 : t;
  return [
    a[0] + (b[0] - a[0]) * u,
    a[1] + (b[1] - a[1]) * u,
    a[2] + (b[2] - a[2]) * u,
  ];
}
const INK_SOFT = mix(INK, PAPER, 0.38);
const HAIR = mix(INK, PAPER, 0.64);
const RULE = mix(INK, PAPER, 0.46);

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);
const smooth = (t: number) => { const u = clamp01(t); return u * u * (3 - 2 * u); };
const ss01 = (a: number, b: number, x: number) => smooth((x - a) / (b - a || 1e-9));

function ramp(stops: [number, RGB][], t: number): RGB {
  if (t <= stops[0][0]) return stops[0][1];
  for (let i = 0; i + 1 < stops.length; i++) {
    const [p0, c0] = stops[i], [p1, c1] = stops[i + 1];
    if (t <= p1) return mix(c0, c1, (t - p0) / (p1 - p0 || 1e-9));
  }
  return stops[stops.length - 1][1];
}

/* ================================================================ 3. raster = */

const dev = new Uint8Array(DW * DH * 4);

/** artwork is clipped to its own frame, so nothing bleeds onto the paper */
let CLIP: [number, number, number, number] | null = null;
function clipTo(x: number, y: number, w: number, h: number) {
  const prev = CLIP;
  CLIP = [
    Math.max(0, Math.round(x * SS)), Math.max(0, Math.round(y * SS)),
    Math.min(DW, Math.round((x + w) * SS)), Math.min(DH, Math.round((y + h) * SS)),
  ];
  return prev;
}

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
function rect(x: number, y: number, w: number, h: number, c: RGB, a = 1) {
  fillD(x * SS, y * SS, (x + w) * SS, (y + h) * SS, c, a);
}

/** vertical gradient across a page-space band */
function gradV(x: number, y: number, w: number, h: number, stops: [number, RGB][]) {
  const n = Math.max(1, Math.round(h));
  for (let j = 0; j < n; j++) rect(x, y + j, w, 1, ramp(stops, n <= 1 ? 0 : j / (n - 1)));
}

/** per-device-pixel shader over a page-space box; fn writes into SHADE, true to paint */
const SHADE = new Float64Array(4);
function shadeRect(x: number, y: number, w: number, h: number,
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

function discAA(cx: number, cy: number, r: number, c: RGB, a = 1) {
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
function lineAA(x0: number, y0: number, x1: number, y1: number, c: RGB, thick = 1, a = 1) {
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

type Pt = [number, number];

/** a stroked polyline: round caps, round joins, constant weight */
function strokePoly(pts: Pt[], c: RGB, thick: number, a = 1) {
  if (!pts.length) return;
  if (pts.length === 1) { discAA(pts[0][0], pts[0][1], thick / 2, c, a); return; }
  for (let i = 0; i + 1 < pts.length; i++)
    lineAA(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], c, thick, a);
}

function poly(pts: Pt[], c: RGB, a = 1) {
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

/* ============================================================== 4. the type = */
/* A single-stroke face drawn the way Hershey drew his: every letterform is a set
   of polylines on one fixed grid — cap height at 0, x-height at 30, baseline at
   100, descender at 140 — stroked with round caps and joins. Curves are polygonal,
   as they were on the original plotters, and read as curves at 3x supersampling.   */

const CAP = 100;             // cap height in glyph units
const XH = 30;               // x-height top
const DESC = 140;            // descender bottom

const P = (s: string): Pt[] =>
  s.trim().split(/\s+/).map((t) => {
    const [a, b] = t.split(",");
    return [Number(a), Number(b)] as Pt;
  });

/**
 * Polyline arc: angles in degrees, 0 = right, 90 = down (y grows downward).
 * The sweep runs from a0 to a1, so a bowl that bulges to the RIGHT goes
 * 270 -> 450 (top, right, bottom) and one that bulges to the LEFT goes
 * 270 -> 90 (top, left, bottom). Full turns run 270 -> -90.
 */
const ARC = (cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n = 12): Pt[] => {
  const outv: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const a = ((a0 + (a1 - a0) * (i / n)) * Math.PI) / 180;
    outv.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]);
  }
  return outv;
};
const cat = (...parts: Pt[][]): Pt[] => parts.reduce((acc, p) => acc.concat(p), [] as Pt[]);

type Glyph = { w: number; s: Pt[][] };

/** the alphabet: polylines plus the advance width that goes with each letter */
const GLYPH: Record<string, Glyph> = {
  A: { w: 76, s: [P("0,100 32,0 64,100"), P("11,62 53,62")] },
  B: { w: 82, s: [P("0,0 0,100"),
                  cat(P("0,0 38,0"), ARC(38, 25, 26, 25, 270, 450, 10), P("38,50 0,50")),
                  cat(P("0,50 42,50"), ARC(42, 75, 28, 25, 270, 450, 10), P("42,100 0,100"))] },
  C: { w: 76, s: [ARC(34, 50, 32, 50, 290, 70, 18)] },
  D: { w: 78, s: [P("0,0 0,100"),
                  cat(P("0,0 36,0"), ARC(36, 50, 30, 50, 270, 450, 18), P("36,100 0,100"))] },
  E: { w: 70, s: [P("0,0 0,100"), P("0,0 58,0"), P("0,50 44,50"), P("0,100 58,100")] },
  F: { w: 70, s: [P("0,0 0,100"), P("0,0 58,0"), P("0,50 44,50")] },
  G: { w: 80, s: [ARC(34, 50, 34, 50, 290, 26, 20), P("67,71 70,64 70,56 36,56")] },
  H: { w: 76, s: [P("0,0 0,100"), P("64,0 64,100"), P("0,50 64,50")] },
  I: { w: 28, s: [P("0,0 0,100")] },
  J: { w: 74, s: [P("52,0 52,72 46,90 30,100 12,96 2,80")] },
  K: { w: 76, s: [P("0,0 0,100"), P("58,0 0,58"), P("20,40 62,100")] },
  L: { w: 68, s: [P("0,0 0,100"), P("0,100 58,100")] },
  M: { w: 96, s: [P("0,100 0,0 42,64 84,0 84,100")] },
  N: { w: 78, s: [P("0,100 0,0 66,100 66,0")] },
  O: { w: 80, s: [ARC(34, 50, 34, 50, 270, -90, 22)] },
  P: { w: 74, s: [P("0,0 0,100"),
                  cat(P("0,0 38,0"), ARC(38, 26, 24, 26, 270, 450, 10), P("38,52 0,52"))] },
  Q: { w: 80, s: [ARC(34, 50, 34, 50, 270, -90, 22), P("42,72 68,104")] },
  R: { w: 78, s: [P("0,0 0,100"),
                  cat(P("0,0 38,0"), ARC(38, 26, 24, 26, 270, 450, 10), P("38,52 0,52")),
                  P("34,52 64,100")] },
  S: { w: 74, s: [P("62,10 48,1 16,1 4,14 6,30 20,40 48,44 62,54 62,72 50,90 18,90 4,80")] },
  T: { w: 74, s: [P("0,0 64,0"), P("32,0 32,100")] },
  U: { w: 76, s: [cat(P("0,0 0,66"), ARC(32, 66, 32, 34, 180, 0, 14), P("64,0"))] },
  V: { w: 74, s: [P("0,0 32,100 64,0")] },
  W: { w: 102, s: [P("0,0 20,100 46,34 72,100 92,0")] },
  X: { w: 74, s: [P("0,0 64,100"), P("64,0 0,100")] },
  Y: { w: 74, s: [P("0,0 32,54 64,0"), P("32,54 32,100")] },
  Z: { w: 72, s: [P("0,0 62,0 0,100 62,100")] },

  "0": { w: 74, s: [ARC(31, 50, 31, 50, 270, -90, 20)] },
  "1": { w: 56, s: [P("10,16 32,2 32,100")] },
  "2": { w: 72, s: [P("2,20 12,4 34,0 56,6 62,24 56,44 2,100 62,100")] },
  "3": { w: 72, s: [P("6,8 26,0 48,2 60,16 56,34 36,44 58,54 62,74 50,94 26,100 6,92")] },
  "4": { w: 74, s: [P("44,100 44,0 2,66 66,66")] },
  "5": { w: 70, s: [P("58,0 12,0 8,42 24,36 46,38 60,54 56,78 36,96 12,94 2,84")] },
  "6": { w: 72, s: [P("56,6 34,0 14,12 4,40 4,70 16,92 36,100 54,92 60,72 48,56 26,54 10,66")] },
  "7": { w: 70, s: [P("2,0 60,0 28,100")] },
  "8": { w: 72, s: [ARC(31, 25, 29, 25, 270, -90, 14), ARC(31, 75, 31, 25, 270, -90, 14)] },
  "9": { w: 72, s: [ARC(31, 31, 31, 31, 270, -90, 18), P("62,31 62,68 54,90 34,100")] },

  a: { w: 68, s: [P("54,30 54,100"),
                  P("54,33 40,29 22,31 8,40 2,54"),
                  ARC(28, 73, 26, 27, 270, -30, 18)] },
  b: { w: 68, s: [P("0,0 0,100"), ARC(0, 65, 56, 35, 270, 450, 14)] },
  c: { w: 62, s: [ARC(26, 65, 26, 35, 290, 70, 14)] },
  d: { w: 68, s: [P("56,0 56,100"), ARC(56, 65, 56, 35, 270, 90, 14)] },
  e: { w: 66, s: [P("0,62 54,62"), ARC(27, 65, 27, 35, 55, 335, 16)] },
  f: { w: 48, s: [P("26,6 18,1 8,10 8,100"), P("0,30 34,30")] },
  g: { w: 68, s: [ARC(28, 65, 28, 35, 270, -90, 16), P("56,30 56,110 48,130 28,138 10,132 2,118")] },
  h: { w: 70, s: [P("0,0 0,100"), P("0,72 0,44 10,32 28,32 46,42 52,60 52,100")] },
  i: { w: 26, s: [P("0,32 0,100"), P("0,4 0,8")] },
  j: { w: 30, s: [P("16,32 16,112 10,130 0,134"), P("6,4 6,8")] },
  k: { w: 62, s: [P("0,0 0,100"), P("48,32 0,68"), P("16,56 50,100")] },
  l: { w: 24, s: [P("0,0 0,100")] },
  m: { w: 84, s: [P("0,32 0,100"), P("0,48 10,33 26,33 34,46 34,100"), P("34,48 44,33 60,33 68,46 68,100")] },
  n: { w: 58, s: [P("0,32 0,100"), P("0,48 12,33 30,34 42,48 42,100")] },
  o: { w: 68, s: [ARC(28, 65, 28, 35, 270, -90, 16)] },
  p: { w: 68, s: [P("0,32 0,140"), ARC(0, 65, 56, 35, 270, 450, 14)] },
  q: { w: 68, s: [P("56,32 56,140"), ARC(56, 65, 56, 35, 270, 90, 14)] },
  r: { w: 50, s: [P("0,32 0,100"), P("0,50 12,35 26,32 36,36")] },
  s: { w: 58, s: [P("46,38 36,31 14,31 4,40 6,50 18,56 34,58 44,66 42,78 32,90 12,90 2,84")] },
  t: { w: 50, s: [P("14,8 14,88 22,100 36,98"), P("0,32 34,32")] },
  u: { w: 58, s: [cat(P("0,32 0,84"), ARC(22, 84, 22, 16, 180, 0, 10), P("44,32"))] },
  v: { w: 58, s: [P("0,32 23,100 46,32")] },
  w: { w: 74, s: [P("0,32 13,100 31,54 49,100 62,32")] },
  x: { w: 58, s: [P("0,32 46,100"), P("46,32 0,100")] },
  y: { w: 58, s: [P("0,32 22,94"), P("46,32 10,140")] },
  z: { w: 58, s: [P("0,32 46,32 0,100 46,100")] },

  " ": { w: 36, s: [] },
  ".": { w: 26, s: [P("1,99 1,100")] },
  ",": { w: 26, s: [P("1,97 4,100 0,114")] },
  ":": { w: 26, s: [P("1,56 1,57"), P("1,99 1,100")] },
  ";": { w: 26, s: [P("1,56 1,57"), P("1,97 4,100 0,114")] },
  "!": { w: 24, s: [P("1,0 1,66"), P("1,96 1,100")] },
  "?": { w: 54, s: [P("0,16 8,3 26,0 38,8 42,22 34,38 22,48 20,62"), P("20,96 20,100")] },
  "'": { w: 18, s: [P("1,0 1,18")] },
  '"': { w: 32, s: [P("1,0 1,18"), P("14,0 14,18")] },
  "-": { w: 46, s: [P("0,58 34,58")] },
  "\u2014": { w: 76, s: [P("0,58 64,58")] },
  "\u00b7": { w: 30, s: [P("1,56 1,57")] },
  "/": { w: 56, s: [P("0,100 44,0")] },
  "(": { w: 34, s: [P("16,0 6,26 6,74 16,100")] },
  ")": { w: 34, s: [P("0,0 10,26 10,74 0,100")] },
  "%": { w: 84, s: [P("1,100 52,0"), ARC(14, 20, 12, 16, 270, -90, 12), ARC(42, 80, 12, 16, 270, -90, 12)] },
  "&": { w: 74, s: [P("54,100 16,34 14,20 22,8 32,12 32,26 20,44 8,66 8,84 18,98 34,100 52,90")] },
  "+": { w: 60, s: [P("26,30 26,86"), P("0,58 52,58")] },
  "=": { w: 60, s: [P("0,42 52,42"), P("0,72 52,72")] },
  "\u00b0": { w: 40, s: [ARC(16, 16, 14, 14, 270, -90, 12)] },
};

/* ink extents, used to keep serifs inside the letter's own width */
const BOX: Record<string, { x0: number; x1: number }> = {};
function inkBox(ch: string) {
  let b = BOX[ch];
  if (b) return b;
  const g = GLYPH[ch];
  let x0 = 1e9, x1 = -1e9;
  if (g) for (const st of g.s) for (const pt of st) {
    if (pt[0] < x0) x0 = pt[0];
    if (pt[0] > x1) x1 = pt[0];
  }
  b = { x0, x1 };
  BOX[ch] = b;
  return b;
}

/* --------------------------------------------------------------- metrics -- */

type TStyle = {
  size: number;        // cap height in page pixels
  color: RGB;
  weight?: number;     // stroke thickness as a fraction of the cap height
  tk?: number;         // tracking in page pixels
  acw?: number;        // horizontal condense factor
  lead?: number;       // extra leading as a fraction of the cap height
  alpha?: number;
  serif?: number;      // serif length in glyph units; text sizes carry serifs
};

const USED = new Set<string>();

const trackOf = (st: TStyle) => (st.tk === undefined ? 0.045 * st.size : st.tk);

function advance(ch: string, st: TStyle) {
  const g = GLYPH[ch];
  const sc = (st.size / CAP) * (st.acw ?? 1);
  if (!g) { USED.add(ch); return 0.5 * st.size; }
  return g.w * sc + trackOf(st);
}

function textW(s: string, st: TStyle) {
  let w = 0;
  for (const ch of s) w += advance(ch, st);
  return s.length ? w - trackOf(st) : 0;
}

function drawGlyph(ch: string, x: number, y: number, st: TStyle) {
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

function drawText(x: number, y: number, s: string, st: TStyle) {
  let cx = x;
  for (const ch of s) {
    if (ch !== " ") drawGlyph(ch, cx, y, st);
    cx += advance(ch, st);
  }
}

function textCenter(x: number, y: number, w: number, s: string, st: TStyle) {
  drawText(x + (w - textW(s, st)) / 2, y, s, st);
}

function textRight(xr: number, y: number, s: string, st: TStyle) {
  drawText(xr - textW(s, st), y, s, st);
}

const lh = (st: TStyle) => st.size * (1 + (st.lead === undefined ? 0.42 : st.lead));

function wrapText(s: string, maxW: number, st: TStyle) {
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
function wrapSplit(text: string, narrowW: number, wideW: number, narrow: number, st: TStyle, tk: number) {
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
function fitHead(s: string, maxW: number, sizes: number[], maxLines: number, o: Partial<TStyle>) {
  let fallback: { st: TStyle; lines: string[] } | null = null;
  for (const size of sizes) {
    const st: TStyle = { size, color: INK, ...o, tk: o.tk === undefined ? 0.05 * size : o.tk === -1 ? 0.06 * size : o.tk };
    const lines = wrapText(s, maxW, st);
    fallback = { st, lines };
    if (lines.length <= maxLines && lines.every((l) => textW(l, st) <= maxW)) return fallback;
  }
  return fallback!;
}

type Fit = { size: number; st: TStyle; lines: string[]; per: number; lh: number };

/** biggest size in `sizes` whose wrapped text fits maxH over nCols; never splits a line */
function fitBody(text: string, colW: number, maxH: number, sizes: number[], nCols: number,
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
function drawJust(x: number, y: number, s: string, st: TStyle, targetW: number) {
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

function drawPara(x: number, y: number, lines: string[], st: TStyle, step: number, indent = 0, colW = 0) {
  lines.forEach((l, i) => {
    const lx = x + (i === 0 ? indent : 0);
    const last = i === lines.length - 1;
    if (colW > 0 && !last) drawJust(lx, y + i * step, l, st, colW - (i === 0 ? indent : 0));
    else drawText(lx, y + i * step, l, st);
  });
}

/* ============================================================= 5. pictures = */

type Photo = { w: number; h: number; px: Uint8Array };

function loadPhoto(file: string, w: number, h: number): Photo {
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
function sharpenPlate(p: Photo, amount: number, radius: number) {
  const { w, h, px } = p;
  const ref = blurPlate(p, radius);
  for (let i = 0; i < w * h * 3; i++) px[i] = clamp(px[i] + amount * (px[i] - ref[i]), 0, 255);
}

/** lift / gain / saturation / cool shadows, in one pass */
function gradePlate(p: Photo, lift: number, gain: number, sat: number, cool: number) {
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
function plate(p: Photo, sx0: number, sy0: number, sx1: number, sy1: number,
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
  CLIP = prevClip;
}

/** a small credit strip printed inside a dark plate, bottom left, with a scrim */
function plateCredit(x: number, y: number, w: number, h: number, text: string) {
  const st: TStyle = { size: 16, color: WHITE, weight: 0.13, tk: 1.5, alpha: 0.92 };
  const tw = textW(text, st);
  const bx = x + 12, by = y + h - 12 - 16;
  rect(bx - 6, by - 5, tw + 12, 26, [8, 11, 16], 0.42);
  drawText(bx, by, text, st);
}

/** source rectangle that covers a w x h box from a plate, centre-weighted */
function cover(p: Photo, w: number, h: number, bias = 0.5): [number, number, number, number] {
  const ta = w / h, sa = p.w / p.h;
  if (sa > ta) { const cw = p.h * ta; const sx = (p.w - cw) * 0.5; return [sx, 0, sx + cw, p.h]; }
  const ch = p.w / ta;
  const sy = (p.h - ch) * bias;
  return [0, sy, p.w, sy + ch];
}

const COP31 = loadPhoto("assets/hero_cop31.rgb.z", 900, 514);
const CAPITOL = loadPhoto("assets/hero_capitol.rgb.z", 420, 420);
sharpenPlate(COP31, 0.55, 1);
sharpenPlate(CAPITOL, 0.5, 1);
gradePlate(COP31, 14, 1.34, 0.92, 1);
gradePlate(CAPITOL, 6, 1.12, 1.06, 0.4);

/* ============================================================== 6. content = */

const LEAD_HEAD = "G20 CLOSES WITH A THIN DEAL ON DEBT";
const LEAD_DECK = "A thin compromise on poor-country debt leaves hard cuts until June.";
const LEAD_BODY =
  "The gavel came down at 4:40am. The communique binds 38 governments to a 90-day standstill and asks the fund to " +
  "report on 84 billion dollars of claims by June. Aid groups called the deal thin, and no private creditor is bound to take a loss.";
const LEAD_CAP = "The closing session ran into a second night.";
const LEAD_CREDIT = "PHOTOGRAPH: THE WORLD";

const SIDE_ITEMS: {
  kicker: string; head: string; body: string; art: "capitol" | "ship" | "chart" | "none";
  artH: number; caption: string; credit: string;
}[] = [
  {
    kicker: "ENERGY",
    head: "GRID OPERATORS AGREE A WINTER PLAN",
    body: "Eight transmission operators will share reserve power across borders this winter, a deal they value at 2.4 billion dollars. Regulators must approve it before December.",
    art: "none", artH: 0,
    caption: "",
    credit: "",
  },
  {
    kicker: "EUROPE",
    head: "BRUSSELS FINES THREE CEMENT GROUPS",
    body: "The commission ordered 640 million euros in penalties for fixing prices in eight member states. The companies said they will appeal.",
    art: "none", artH: 0,
    caption: "",
    credit: "",
  },
  {
    kicker: "DEMOGRAPHY",
    head: "ISLAM TO PASS CHRISTIANITY",
    body: "A report projects Islam as the largest faith in the world by 2035.",
    art: "chart", artH: 198,
    caption: "",
    credit: "PROJECTION: THE WORLD DESK",
  },
];

const TICKER = [
  { reg: "UKRAINE", txt: "An overnight attack on the Kyiv region left two dead and four wounded, local officials said. Air defences stayed busy until dawn." },
  { reg: "WEST BANK", txt: "Settlers attacked Palestinian villages across the occupied West Bank late on Sunday, residents and medics reported." },
  { reg: "HAITI", txt: "Two Salvadoran soldiers on a security mission were killed and two were wounded in the country, the army said." },
  { reg: "CHINA", txt: "Beijing set 2030 targets for elderly care and for childcare places across the country, as the population ages." },
];

/* =============================================================== 7. charts = */
/* A projected pair of lines on paper stock: hairline rules, small type.        */

function chartArt(x: number, y: number, w: number, h: number) {
  const cap: TStyle = { size: 21, color: INK_SOFT, weight: 0.115, tk: 1.6 };
  const lbl: TStyle = { size: 20, color: INK_2, weight: 0.12, tk: 1.4 };

  drawText(x, y, "BILLIONS", cap);
  textRight(x + w, y, "PROJECTED", cap);

  // legend sits on its own line, above the plot, where nothing can run into it
  const legY = y + 32;
  rect(x, legY + 8, 20, 2.6, BRICK);
  drawText(x + 29, legY, "ISLAM", { size: 21, color: BRICK_DK, weight: 0.16, tk: 1.8 });
  rect(x + 118, legY + 8, 20, 2.6, TEAL);
  drawText(x + 147, legY, "CHRISTIANITY", { size: 21, color: TEAL, weight: 0.16, tk: 1.8 });

  const padL = 46, padR = 18, padT = 68, padB = 32;
  const px0 = x + padL, px1 = x + w - padR, py0 = y + padT, py1 = y + h - padB;
  const yearX = (yr: number) => px0 + ((yr - 2000) / 50) * (px1 - px0);
  const valY = (v: number) => py1 - ((v - 1) / 2.2) * (py1 - py0);

  for (const v of [2, 3]) {
    const yy = valY(v);
    for (let i = 0; i < px1 - px0; i += 7) rect(px0 + i, yy, 4, 1, HAIR);
    drawText(px0 - 9 - textW(String(v), lbl), yy - 20 * 0.62, String(v), lbl);
  }

  const series: Pt[] = [[2000, 1.24], [2008, 1.50], [2016, 1.78], [2024, 2.05], [2030, 2.28], [2035, 2.42], [2042, 2.64], [2050, 2.86]]
    .map(([yr, v]) => [yearX(yr), valY(v)] as Pt);
  const other: Pt[] = [[2000, 2.02], [2008, 2.10], [2016, 2.18], [2024, 2.26], [2030, 2.34], [2035, 2.40], [2042, 2.46], [2050, 2.52]]
    .map(([yr, v]) => [yearX(yr), valY(v)] as Pt);

  poly([...series, [px1, py1], [px0, py1]], BRICK, 0.09);

  rect(px0, py1, px1 - px0, 1.3, INK_2, 0.8);
  for (const yr of [2000, 2020, 2035, 2050]) {
    rect(yearX(yr), py1, 1, 4, INK_2, 0.8);
    const st: TStyle = { size: 19, color: yr === 2035 ? BRICK_DK : INK_2, weight: 0.125, tk: 1.2 };
    const s = String(yr);
    let lx = yearX(yr) - textW(s, st) / 2;
    lx = clamp(lx, x + 3, x + w - 3 - textW(s, st));
    drawText(lx, py1 + 9, s, st);
  }
  for (let yy = py0 + 2; yy < py1; yy += 7) rect(yearX(2035), yy, 1, 4, BRICK, 0.45);

  const curve = (pts: Pt[], col: RGB, th: number) => {
    for (let i = 0; i + 1 < pts.length; i++) lineAA(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], col, th);
  };
  curve(other, TEAL, 1.6);
  curve(series, BRICK, 1.8);

  discAA(yearX(2034), valY(2.41), 5.5, [245, 239, 228], 1);
  discAA(yearX(2034), valY(2.41), 2.6, BRICK, 1);
}

/* ============================================================ 8. ship plate = */
/* An illustration, not a photograph: the burning Sparta II, drawn in flat ink and
   ember colour so it sits with the type rather than with the pictures.           */

function shipArt(x: number, y: number, w: number, h: number) {
  const prevClip = clipTo(x, y, w, h);
  const sea = y + h * 0.70;
  rect(x, y, w, h, INK);
  gradV(x, y, w, sea - y, [
    [0, [16, 21, 31]], [0.4, [44, 36, 39]], [0.72, [126, 62, 38]], [1, [178, 108, 56]],
  ]);
  const fx = x + w * 0.46;
  shadeRect(x, y, w, sea - y, (u, v, xl, yl) => {
    const d = Math.hypot(xl - fx, (yl - sea) * 1.5) / (w * 0.55);
    if (d >= 1) return false;
    const g = Math.pow(1 - d, 2.2);
    SHADE[0] = 255; SHADE[1] = 150; SHADE[2] = 62; SHADE[3] = g * 0.55;
    return true;
  });
  for (let k = 0; k < 5; k++) {
    const ox = x + w * (0.54 + k * 0.075);
    for (let t = 0; t < 1; t += 0.01) {
      const py = sea - (sea - y) * t * 0.94;
      const pxx = ox + Math.sin(t * 3.4 + k) * w * 0.06 + t * w * 0.12;
      const r = w * (0.035 + t * 0.135 + k * 0.005);
      const amt = (1 - t * 0.75) * 0.075;
      discAA(pxx, py, r, [116, 114, 118], amt);
      discAA(pxx + r * 0.4, py, r * 0.7, [96, 96, 104], amt * 0.7);
      discAA(pxx - r * 0.4, py, r * 0.7, [158, 138, 124], amt * 0.5);
    }
  }
  gradV(x, sea, w, y + h - sea, [[0, [42, 50, 60]], [0.5, [26, 32, 42]], [1, [12, 16, 24]]]);
  for (let j = 0; j < y + h - sea; j++)
    for (let i = 0; i < w; i++) {
      const u = (i - (fx - x)) / (w * 0.26);
      if (Math.abs(u) > 1) continue;
      const refl = Math.max(0, 1 - Math.abs(u)) * Math.max(0, 1 - j / ((y + h - sea) * 1.6));
      const rip = 0.55 + 0.45 * Math.sin(j * 1.7 + i * 0.21);
      rect(x + i, sea + j, 1, 1, [255, 148, 62], refl * rip * 0.7);
    }

  const hullTop = sea - h * 0.16;
  const hull: RGB = [11, 13, 18];
  poly([[x + w * 0.14, hullTop], [x + w * 0.88, hullTop], [x + w * 0.82, sea + 1], [x + w * 0.20, sea + 1]], hull);
  poly([[x + w * 0.18, hullTop - h * 0.016], [x + w * 0.85, hullTop - h * 0.016],
        [x + w * 0.86, hullTop + h * 0.010], [x + w * 0.17, hullTop + h * 0.010]], hull);
  rect(x + w * 0.26, hullTop - h * 0.15, w * 0.17, h * 0.15, hull);
  rect(x + w * 0.60, hullTop - h * 0.10, w * 0.09, h * 0.10, hull);
  rect(x + w * 0.29, hullTop - h * 0.34, w * 0.022, h * 0.34, hull);
  rect(x + w * 0.275, hullTop - h * 0.28, w * 0.07, h * 0.014, hull);
  rect(x + w * 0.44, hullTop - h * 0.12, w * 0.014, h * 0.12, hull);
  for (let k = 0; k < 4; k++)
    rect(x + w * 0.285 + k * w * 0.036, hullTop - h * 0.11, w * 0.014, h * 0.05, [8, 9, 13]);

  const fb = hullTop + h * 0.05;
  const fcx = x + w * 0.42;
  for (const [dx, hh, ww, col, al] of [
    [-0.13, 0.48, 0.11, [176, 58, 38], 0.95], [-0.04, 0.74, 0.12, [214, 92, 38], 0.95],
    [0.04, 0.98, 0.12, [238, 128, 44], 0.95], [0.12, 0.66, 0.10, [252, 176, 62], 0.95],
    [0.19, 0.40, 0.08, [255, 226, 140], 0.95],
  ] as [number, number, number, RGB, number][]) {
    const bx = fcx + w * dx, th = h * 0.52 * hh, half = (w * ww) / 2;
    const L: Pt[] = [], R: Pt[] = [];
    const N = 20;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const taper = Math.pow(1 - t, 0.45);
      const lean = w * 0.05 * t * t + Math.sin(t * 2.4 + dx * 12) * half * 0.7 * t;
      const wob = (Math.sin(t * 7.5 + dx * 30) * 0.5 + 0.5) * half * 0.7;
      const w2 = half * taper + wob * (1 - t * t);
      const yy = fb - th * t;
      L.push([bx + lean - w2, yy]);
      R.push([bx + lean + w2, yy]);
    }
    poly([...L, ...R.slice().reverse()], col, al);
  }
  for (let j = 0; j < h * 0.07; j++) {
    const w2 = w * 0.10 * (1 - j / (h * 0.07));
    rect(fcx - w2, fb - j, w2 * 2, 1.15, [255, 244, 208], 0.9);
  }
  for (const [dx, hh] of [[0.30, 0.22], [-0.24, 0.18]] as [number, number][]) {
    const bx = fcx + w * dx, th = h * 0.52 * hh;
    const L: Pt[] = [], R: Pt[] = [];
    const N = 14;
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const w2 = w * 0.013 * Math.pow(1 - t, 0.55);
      const yy = fb - th * t;
      const cx = bx + Math.sin(t * 3.1 + dx * 20) * w * 0.04 * t;
      L.push([cx - w2, yy]);
      R.push([cx + w2, yy]);
    }
    poly([...L, ...R.slice().reverse()], [255, 198, 96], 0.85);
  }
  rect(x + w * 0.15, hullTop - h * 0.02, w * 0.70, 2, [255, 158, 78], 0.5);
  rect(x + w * 0.26, hullTop - h * 0.15, w * 0.17, 2, [255, 170, 90], 0.4);
  for (const [sx2, sy2, r] of [[0.38, 0.28, 2], [0.52, 0.14, 2], [0.31, 0.40, 2], [0.58, 0.42, 2], [0.45, 0.08, 1]] as [number, number, number][])
    discAA(x + w * sx2, y + h * sy2, r, [255, 236, 176], 0.95);
  for (let k = 0; k < 12; k++)
    rect(x + ((k * 137) % (w - 70)), sea + 2 + k * 2, 20 + ((k * 53) % 70), 1, [255, 176, 96], 0.28);

  rect(x, y, w, 2, INK);
  rect(x, y + h - 2, w, 2, INK);
  rect(x, y, 2, h, INK);
  rect(x + w - 2, y, 2, h, INK);
  CLIP = prevClip;
}

/* ============================================================= 9. the page = */

const SIZE = {
  folio: 21,
  title: 124,
  date: 38,
  strap: 29,
  kicker: 32,
  deck: 39,
  byline: 25,
  caption: 23,
  credit: 19,
  body: 41,
  sideKick: 25,
  sideHead: 39,
  sideBody: 29,
  briefReg: 28,
  briefBody: 30,
};

function paperTex() {
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

function drawMasthead() {
  rect(M, 54, CONTENT, 5, INK);
  const folio: TStyle = { size: SIZE.folio, color: INK_SOFT, weight: 0.13, tk: 2.6 };
  drawText(M, 68, "VOL. CXIV  \u00b7  NO. 41,903", folio);
  textRight(M + CONTENT, 68, "WORLD DESK  \u00b7  EVENING EDITION", folio);

  const titleSt: TStyle = { size: SIZE.title, color: INK, weight: 0.18, tk: 0.075 * SIZE.title };
  const tw = textW("THE WORLD", titleSt);
  textCenter(M, 96, CONTENT, "THE WORLD", titleSt);
  const tx0 = M + (CONTENT - tw) / 2;
  rect(M, 96 + SIZE.title * 0.44, Math.max(0, tx0 - M - 28), 2, HAIR);
  rect(tx0 + tw + 28, 96 + SIZE.title * 0.44, Math.max(0, M + CONTENT - (tx0 + tw + 28)), 2, HAIR);

  rect(M, 240, CONTENT, 4, INK);
  rect(M, 247, CONTENT, 1.4, INK, 0.5);

  const dateSt: TStyle = { size: SIZE.date, color: INK, weight: 0.145, tk: 3.1 };
  const dw = textW("MONDAY 24 NOVEMBER 2026", dateSt);
  const dateY = 256;
  textCenter(M, dateY, CONTENT, "MONDAY 24 NOVEMBER 2026", dateSt);
  const rx = M + (CONTENT - dw) / 2;
  rect(M, dateY + SIZE.date * 0.72, Math.max(0, rx - M - 22), 2, HAIR);
  rect(rx + dw + 22, dateY + SIZE.date * 0.72, Math.max(0, M + CONTENT - (rx + dw + 22)), 2, HAIR);

  rect(M, 306, CONTENT, 2.4, TEAL);
  textCenter(M, 314, CONTENT,
    "KYIV HIT OVERNIGHT  \u00b7  SETTLER ATTACKS  \u00b7  CHINA SETS 2030 CARE GOALS",
    { size: SIZE.strap, color: INK, weight: 0.125, tk: 3.4 });
  rect(M, LEAD_TOP - 12, CONTENT, 5, INK);
  report("masthead", 54, LEAD_TOP - 7, LEAD_TOP, "nameplate " + Math.round(tw) + "px");
}

function drawLead() {
  const x = M, w = LEAD_W;
  let y = LEAD_TOP;

  const kSt: TStyle = { size: SIZE.kicker, color: WHITE, weight: 0.155, tk: 2.8 };
  const kw = textW("G20", kSt);
  const kh = SIZE.kicker + 18;
  rect(x, y, kw + 36, kh, BRICK);
  drawText(x + 18, y + 9, "G20", kSt);
  drawText(x + kw + 56, y + 3, "THE HARD PART IS PUSHED TO JUNE",
    { size: 28, color: INK_SOFT, weight: 0.12, tk: 2.0 });
  rect(x + kw + 56, y + 3 + 28 + 10, w - kw - 56, 1.4, HAIR);
  y += kh + 16;
  rect(x, y, w, 2.4, TEAL);
  y += 16;

  const photoH = 782;
  leadPhoto(x, y, w, photoH);
  y += photoH;

  drawText(x, y + 10, LEAD_CAP, { size: SIZE.caption, color: INK_SOFT, weight: 0.115, tk: 1.6, serif: 10 });
  y += 10 + 28;

  const dSt: TStyle = { size: SIZE.deck, color: INK_2, weight: 0.115, tk: 1.9, lead: 0.44, serif: 11 };
  const deckLines = wrapText(LEAD_DECK, w - 40, dSt);
  for (const l of deckLines) { drawText(x, y, l, dSt); y += lh(dSt); }
  y += 16;
  rect(x, y, w, 2, HAIR);
  drawText(x, y + 11, "BY OUR DIPLOMATIC EDITOR  \u00b7  LATE EDITION  \u00b7  MONDAY",
    { size: SIZE.byline, color: INK_SOFT, weight: 0.12, tk: 2.1, serif: 9 });
  y += 11 + SIZE.byline + 20;

  drawLeadCopy(x, y, w, LEAD_BOT - y);
}

/** the story: two columns, a three line drop cap, copy justified to the measure */
function drawLeadCopy(x: number, y: number, w: number, maxH: number) {
  const colW = Math.floor((w - 34) / 2);
  const dropCh = LEAD_BODY[0];
  const restText = LEAD_BODY.slice(1).trim();
  let best: { st: TStyle; step: number; dropSize: number; dropW: number; lines: string[]; per: number } | null = null;

  for (const size of [46, 43, 40, 37, 34]) {
    const st: TStyle = { size, color: INK, weight: 0.105, tk: 1.15, acw: 0.98, lead: 0.44, serif: 11 };
    const step = lh(st);
    const dropSize = Math.round(2 * step + size);
    const dropW = textW(dropCh, { ...st, size: dropSize }) + Math.round(size * 0.55);
    const lines = wrapSplit(restText, colW - dropW, colW, 3, st, 1.15);
    const per = Math.ceil(lines.length / 2);
    best = { st, step, dropSize, dropW, lines, per };
    if (per * step <= maxH) break;
  }
  const c = best!;
  const shown = Math.min(c.per * 2, c.lines.length);
  c.lines.slice(0, shown).forEach((l, i) => {
    const col = Math.floor(i / c.per);
    const ln = i % c.per;
    const underCap = col === 0 && ln < 3;
    const lx = x + col * (colW + 34) + (underCap ? c.dropW : 0);
    const avail = underCap ? colW - c.dropW : colW;
    if (i === shown - 1) drawText(lx, y + ln * c.step, l, c.st);
    else drawJust(lx, y + ln * c.step, l, c.st, avail);
  });
  // the initial, its baseline on the third line's baseline
  const dropSt: TStyle = { ...c.st, size: c.dropSize, weight: 0.125, serif: 12 };
  drawGlyph(dropCh, x, y + 2 * c.step + c.st.size - c.dropSize, dropSt);
  rect(x + colW + 17, y, 1.6, Math.min(c.per * c.step, maxH), RULE);
  report("lead.copy", y, y + c.per * c.step, y + maxH, c.st.size.toFixed(0) + "px " + c.lines.length + "L x2");
}

function leadPhoto(x: number, y: number, w: number, h: number) {
  plate(COP31, ...cover(COP31, w, h, 0.5), x, y, w, h);

  shadeRect(x, y, w, h, (u, v) => {
    const bottom = ss01(0.28, 1.0, v);
    const top = ss01(0.16, 0.0, v);
    SHADE[0] = 7; SHADE[1] = 10; SHADE[2] = 14;
    SHADE[3] = 0.10 + bottom * 0.72 + top * 0.26;
    return true;
  });
  shadeRect(x, y, w, h, (u, v) => {
    SHADE[0] = 22; SHADE[1] = 44; SHADE[2] = 62;
    SHADE[3] = 0.10 + 0.05 * (1 - v);
    return true;
  });

  const head = fitHead(LEAD_HEAD, w - 104, [94, 88, 82, 76], 3,
    { color: WHITE, weight: 0.175, tk: -1 });
  const step = head.st.size * 1.18;
  const panelH = head.lines.length * step + 44;
  const panelY = y + h - panelH;

  rect(x, panelY, w, panelH, [9, 13, 19], 0.52);
  rect(x, panelY, w, 1.8, WHITE, 0.42);
  rect(x, panelY - 8, 118, 8, BRICK, 1);
  rect(x, y + 14, textW(LEAD_CREDIT, { size: 16, color: WHITE, weight: 0.13, tk: 1.5 }) + 24, 26, [8, 11, 16], 0.40);
  drawText(x + 12, y + 19, LEAD_CREDIT, { size: 16, color: WHITE, weight: 0.13, tk: 1.5, alpha: 0.92 });

  let hy = panelY + 22;
  for (const l of head.lines) { drawText(x + 46, hy, l, head.st); hy += step; }
  report("lead.picture", y, y + h, y + h, "panel " + panelH.toFixed(0) + " " + head.st.size.toFixed(0) + "px");
}

function drawSidebar() {
  const x = SIDE_X, w = SIDE_W;
  const gap = 26;
  const block = (LEAD_BOT - LEAD_TOP - 2 * gap) / 3;
  let y = LEAD_TOP;

  SIDE_ITEMS.forEach((item, idx) => {
    const top0 = y;
    if (idx > 0) rect(x, y - gap / 2 - 1, w, 2, RULE);

    const kSt: TStyle = { size: SIZE.sideKick, color: BRICK_DK, weight: 0.15, tk: 2.6 };
    rect(x, y + 3, 11, 11, BRICK);
    drawText(x + 20, y, item.kicker, kSt);
    const kx = x + 20 + textW(item.kicker, kSt) + 12;
    rect(kx, y + 13, Math.max(0, x + w - kx), 1.2, HAIR);
    y += SIZE.sideKick + 20;

    const head = fitHead(item.head, w, [SIZE.sideHead, 36, 33], 2,
      { color: INK, weight: 0.175, tk: -1 });
    for (const l of head.lines) { drawText(x, y, l, head.st); y += head.st.size * 1.14; }
    y += 12;

    if (item.art === "capitol") {
      plate(CAPITOL, 0, 62, 420, 234, x, y, w, item.artH);
      shadeRect(x, y, w, item.artH, (u, v) => {
        SHADE[0] = 24; SHADE[1] = 30; SHADE[2] = 44; SHADE[3] = 0.06 + 0.05 * v;
        return true;
      });
      rect(x, y, w, 1.4, INK, 0.5);
      plateCredit(x, y, w, item.artH, item.credit);
    } else if (item.art === "ship") {
      shipArt(x, y, w, item.artH);
      plateCredit(x, y, w, item.artH, item.credit);
    } else if (item.art === "chart") {
      chartArt(x, y, w, item.artH);
    }
    if (item.art === "none") {
      // a brief with no picture: the measure runs on, so give the copy one line
      // of air and then let it fill the block
      y += 10;
    } else {
      y += item.artH + 8;
      const cSt: TStyle = { size: SIZE.credit, color: INK_SOFT, weight: 0.115, tk: 1.6, serif: 9 };
      if (item.caption) drawText(x, y, item.caption, cSt);
      else textRight(x + w, y, item.credit, { ...cSt, color: BRICK_DK, weight: 0.13 });
      y += 28;
    }

    const p = fitBody(item.body, w - 11, top0 + block - y, [SIZE.sideBody, 27, 25, 23], 1, 0.96, 1.1);
    p.st.serif = 10;
    drawPara(x, y, p.lines, p.st, p.lh, 11, w - 11);
    y += p.lines.length * p.lh;
    report("side." + idx, top0, y, top0 + block, p.size.toFixed(0) + "px " + p.lines.length + "L");
    y = top0 + block + gap;
  });
}

function drawTicker() {
  const bandH = SIZE.kicker + 24;
  rect(M, TICK_TOP, CONTENT, bandH, INK);
  rect(M, TICK_TOP + bandH - 3, CONTENT, 3, BRICK);
  drawText(M + 22, TICK_TOP + 12, "IN BRIEF", { size: SIZE.kicker, color: WHITE, weight: 0.16, tk: 3 });
  textRight(M + CONTENT - 22, TICK_TOP + 13, "THE DAY IN BRIEF  \u00b7  EDITED BY THE WORLD DESK",
    { size: 25, color: WHITE, weight: 0.12, tk: 2.2, alpha: 0.84 });

  const gridY = TICK_TOP + bandH + 28;
  const cw = (CONTENT - 74) / 2;
  const rh = (H - M - gridY - 16) / 2;
  rect(M + cw + 37, gridY, 1.8, rh * 2 + 16, RULE);
  rect(M, gridY + rh + 8, CONTENT, 1.8, RULE);

  TICKER.forEach((item, i) => {
    const cx = M + (i % 2) * (cw + 74);
    const cy = gridY + Math.floor(i / 2) * (rh + 16);
    const kSt: TStyle = { size: SIZE.briefReg, color: BRICK_DK, weight: 0.155, tk: 2.8 };
    rect(cx, cy + 4, 10, 10, BRICK);
    drawText(cx + 19, cy, item.reg, kSt);
    const kx = cx + 19 + textW(item.reg, kSt) + 14;
    rect(kx, cy + 13, Math.max(0, cx + cw - kx), 1.2, HAIR);
    const p = fitBody(item.txt, cw - 11, rh - SIZE.briefReg - 26, [SIZE.briefBody, 28, 26, 24], 1, 0.97, 1.2);
    p.st.serif = 10;
    drawPara(cx, cy + SIZE.briefReg + 22, p.lines, p.st, p.lh, 11, cw - 11);
    report("brief." + item.reg, cy, cy + SIZE.briefReg + 22 + p.lines.length * p.lh, cy + rh,
      p.size.toFixed(0) + "px " + p.lines.length + "L");
  });
  report("briefs", TICK_TOP, TICK_TOP + bandH, H - M, "band");
}

/* ==================================================== 10. down filter + press = */

const out = new Uint8Array(W * H * 4);

function downscale() {
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
function drawGrain() {
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

/* ============================================================== 11. encoder = */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Uint8Array) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array) {
  const outv = new Uint8Array(12 + data.length);
  const dv = new DataView(outv.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) outv[4 + i] = type.charCodeAt(i);
  outv.set(data, 8);
  dv.setUint32(8 + data.length, crc32(outv.subarray(4, 8 + data.length)));
  return outv;
}

/** pick the cheapest of the five PNG filters for every scan line */
function filterScanlines(rgba: Uint8Array, w: number, h: number) {
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

function encodePNG(w: number, h: number, rgba: Uint8Array) {
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

/* ================================================================ 12. main = */

const LAYOUT: { name: string; top: number; bottom: number; limit: number; note: string }[] = [];
function report(name: string, top: number, bottom: number, limit: number, note: string) {
  LAYOUT.push({ name, top, bottom, limit, note });
}

/** every character the page asks the face for must exist: report the strays */
function auditType() {
  const missing = [...USED].filter((c) => !GLYPH[c]);
  return { used: USED.size, missing };
}

function build() {
  paperTex();
  drawMasthead();
  rect(SIDE_X - 18, LEAD_TOP, 2, LEAD_H, RULE);
  drawLead();
  drawSidebar();
  drawTicker();
  downscale();
  drawGrain();
  return encodePNG(W, H, out);
}

function main() {
  const png = build();
  fs.mkdirSync("/output", { recursive: true });
  fs.writeFileSync("/output/entry.png", png);

  for (const b of LAYOUT) {
    const over = b.bottom > b.limit + 0.5 ? "  OVERFLOW" : "";
    console.log(`  ${b.name.padEnd(13)} ${Math.round(b.top)}..${Math.round(b.bottom)} (limit ${Math.round(b.limit)}) ${b.note}${over}`);
  }
  const bad = LAYOUT.filter((b) => b.bottom > b.limit + 0.5);
  const au = auditType();
  console.log(`entry.png ${W}x${H} ${(png.length / 1024).toFixed(0)} KiB  lead=${((LEAD_H / H) * 100).toFixed(1)}% of page height`);
  console.log(`type: ${au.used} glyphs used` + (au.missing.length ? `, MISSING "${au.missing.join("")}"` : ", all present"));
  console.log(bad.length ? `LAYOUT OVERFLOW x${bad.length}` : "layout ok");
}

main();