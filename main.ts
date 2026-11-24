/**
 * THE WORLD — front page for Monday 24 November 2026.
 *
 * Standalone: `node main.ts` writes /output/entry.png.
 * No dependencies, no network, no Date/Math.random: every run is byte-identical.
 *
 * This file is the desk, not the press. It decides what goes where and in what
 * order, and it does nothing else:
 *
 *   ./glyphs.ts    the face — every letterform as polylines on one 100-unit grid
 *   ./render.ts    the press — raster buffer, drawing primitives, typesetter,
 *                  photographic plates, PNG writer
 *   ./newsdata.ts  the copy — lead, sidebar, ticker, forty-three briefs
 *
 * Page grid: 1520 wide, margin 56, a lead package of exactly 60% of the edition's
 * height, four briefs in a band beneath it, and a three column file of
 * forty-three more below that — the page height grows to hold the file.
 */

import * as fs from "node:fs";
import { BRIEFS43, LEAD_BODY, LEAD_CAP, LEAD_CREDIT, LEAD_DECK, LEAD_HEAD, SIDE_ITEMS, TICKER } from "./newsdata.ts";
import {
  BRICK, BRICK_DK, HAIR, INK, INK_2, INK_SOFT, RULE, SHADE, TEAL, WHITE,
  clamp, cover, discAA, downscale, drawGlyph, drawJust, drawPara, drawText, encodePNG,
  fitBody, fitHead, gradePlate, gradV, initCanvas, lh, lineAA, loadPhoto, paperTexture,
  pixels, plate, plateCredit, poly, pressGrain, rect, restoreClip, sharpenPlate, shadeRect,
  ss01, strokePoly, textCenter, textRight, textW, typeAudit, wrapSplit, wrapText,
  clipTo, type Pt, type TStyle,
} from "./render.ts";

/* ============================================================ 1. geometry == */

const W = 1520;
const H_EDITION = 2520;                       // masthead, lead and the day's four briefs
const M = 56;                                 // page margin
const CONTENT = W - 2 * M;                    // 1408

const GUT = 38;                               // column gutter
const SIDE_W = 442;                           // right hand column
const LEAD_W = CONTENT - GUT - SIDE_W;        // 928
const SIDE_X = M + LEAD_W + GUT;              // 1022

const LEAD_TOP = 352;                         // first row of the lead package
const LEAD_H = Math.round(H_EDITION * 0.6);   // the lead is 60% of the edition's height
const LEAD_BOT = LEAD_TOP + LEAD_H;           // 1864
const TICK_TOP = LEAD_BOT + 24;               // 1888

/* the two bands at the foot: the day's four briefs, then the expanded file */
const BAND_H = 56;                            // black "IN BRIEF" slab
const TICK_GRID_Y = TICK_TOP + BAND_H + 28;   // 1972
const TICK_ROW_H = 238;                       // fixed, so the file below can set the page height
const TICK_BLOCK_H = 2 * TICK_ROW_H + 16;     // 492
const BRIEF_COLS = 3;
const BRIEF_GUT = 38;
const BRIEF_COL_W = Math.floor((CONTENT - (BRIEF_COLS - 1) * BRIEF_GUT) / BRIEF_COLS);  // 444
const BRIEF_ROWS = Math.ceil(BRIEFS43.length / BRIEF_COLS);
const BRIEF_ROW_H = 248;                      // one item plus its hairline
const BRIEFS_TOP = TICK_GRID_Y + TICK_BLOCK_H + 60;   // 2524, clear of the slab above
const H = BRIEFS_TOP + BRIEF_ROWS * BRIEF_ROW_H + M;  // the page grows to hold the file

/* ========================================================= 2. the plates == */

/* both plates are inflated, unsharp-masked and graded once, at load */
const COP31 = loadPhoto("assets/hero_cop31.rgb.z", 900, 514);
const CAPITOL = loadPhoto("assets/hero_capitol.rgb.z", 420, 420);
sharpenPlate(COP31, 0.55, 1);
sharpenPlate(CAPITOL, 0.5, 1);
gradePlate(COP31, 14, 1.34, 0.92, 1);
gradePlate(CAPITOL, 6, 1.12, 1.06, 0.4);

/* =============================================================== 3. art == */

/* A projected pair of lines on paper stock: hairline rules, small type. */

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

  const curve = (pts: Pt[], col: [number, number, number], th: number) => {
    for (let i = 0; i + 1 < pts.length; i++) lineAA(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], col, th);
  };
  curve(other, TEAL, 1.6);
  curve(series, BRICK, 1.8);

  discAA(yearX(2034), valY(2.41), 5.5, [245, 239, 228], 1);
  discAA(yearX(2034), valY(2.41), 2.6, BRICK, 1);
}

/* An illustration, not a photograph: the burning Sparta II, drawn in flat ink and
   ember colour so it sits with the type rather than with the pictures. */

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
  const hull: [number, number, number] = [11, 13, 18];
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
  ] as [number, number, number, [number, number, number], number][]) {
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
  restoreClip(prevClip);
}

/* ============================================================== 4. the page = */

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
  const bandH = BAND_H;
  rect(M, TICK_TOP, CONTENT, bandH, INK);
  rect(M, TICK_TOP + bandH - 3, CONTENT, 3, BRICK);
  drawText(M + 22, TICK_TOP + 12, "IN BRIEF", { size: SIZE.kicker, color: WHITE, weight: 0.16, tk: 3 });
  textRight(M + CONTENT - 22, TICK_TOP + 13, "THE DAY IN BRIEF  \u00b7  EDITED BY THE WORLD DESK",
    { size: 25, color: WHITE, weight: 0.12, tk: 2.2, alpha: 0.84 });

  const gridY = TICK_GRID_Y;
  const cw = (CONTENT - 74) / 2;
  const rh = TICK_ROW_H;
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
  report("briefs", TICK_TOP, TICK_TOP + bandH, TICK_GRID_Y + TICK_BLOCK_H, "band");
}

/* the expanded file: every item of BRIEFS43 on a three column grid, hairline rule
 * above each one, section word set ahead of the headline, body copy in the measure */

const BRIEF_STATS = { drawn: 0, widest: 0, tightest: 99, headSize: 0 };

function drawBriefs43() {
  const top = BRIEFS_TOP;
  const slabH = 48;
  const slabY = top - slabH - 34;             // its foot clears the first hairline
  rect(M, slabY, CONTENT, slabH, INK);
  rect(M, slabY + slabH - 3, CONTENT, 3, BRICK);
  drawText(M + 22, slabY + 11, "IN BRIEF",
    { size: 26, color: WHITE, weight: 0.16, tk: 3 });
  textRight(M + CONTENT - 22, slabY + 12,
    "FORTY-THREE MORE FROM THE WORLD DESK  \u00b7  MONDAY",
    { size: 21, color: WHITE, weight: 0.12, tk: 2.0, alpha: 0.84 });

  const colW = BRIEF_COL_W;
  for (let c = 1; c < BRIEF_COLS; c++)
    rect(M + c * (colW + BRIEF_GUT) - BRIEF_GUT / 2, top, 1.6, BRIEF_ROWS * BRIEF_ROW_H - 18, RULE);

  const sSt: TStyle = { size: 19, color: BRICK_DK, weight: 0.15, tk: 2.4 };
  const KICK = 19, KICK_GAP = 16, HEAD_GAP = 7, AIR = 36;

  const headStyle = (s: number): TStyle =>
    ({ size: s, color: INK, weight: 0.175, tk: 1.43, lead: 0.2 });
  const bodyStyle = (s: number): TStyle =>
    ({ size: s, color: INK, weight: 0.108, tk: 0.045 * s, serif: 9 });

  // one setting for the whole file: every headline is measured before any is set,
  // so the grid reads evenly instead of shrinking item by item
  let headSize = 23;
  for (const s of [26, 25, 24, 23]) {
    headSize = s;
    if (BRIEFS43.every((b) => wrapText(b.head, colW, headStyle(s)).length <= 2)) break;
  }
  const hStep = headSize * 1.16;
  const heads = BRIEFS43.map((b) => wrapText(b.head, colW, headStyle(headSize)));

  let bodySize = 17;
  for (const s of [21, 20, 19, 18, 17]) {
    bodySize = s;
    const fits = BRIEFS43.every((b, i) =>
      KICK + KICK_GAP + heads[i].length * hStep + HEAD_GAP +
      wrapText(b.body, colW - 2, bodyStyle(s)).length * s * 1.32 <= BRIEF_ROW_H - AIR);
    if (fits) break;
  }
  const bSt = bodyStyle(bodySize);
  const bStep = bodySize * 1.32;
  BRIEF_STATS.tightest = bodySize;
  BRIEF_STATS.headSize = headSize;

  BRIEFS43.forEach((item, i) => {
    const col = i % BRIEF_COLS;
    const row = Math.floor(i / BRIEF_COLS);
    const x = M + col * (colW + BRIEF_GUT);
    const y = top + row * BRIEF_ROW_H;
    const limit = y + BRIEF_ROW_H - AIR;

    rect(x, y - 27, colW, 1.4, HAIR);
    drawText(x, y, item.section, sSt);
    const sw = textW(item.section, sSt);
    rect(x + sw + 12, y - 8, Math.max(0, colW - sw - 12), 1.1, HAIR);

    const head = { st: headStyle(headSize), lines: heads[i] };
    const lines = wrapText(item.body, colW - 2, bSt);

    let yy = y + KICK + KICK_GAP;
    for (const l of head.lines) { drawText(x, yy, l, head.st); yy += hStep; }
    drawPara(x, yy + HEAD_GAP, lines, bSt, bStep, 0, 0);
    const bottom = yy + HEAD_GAP + (lines.length - 1) * bStep + bodySize * 0.24;

    let widest = 0;
    for (const l of lines) { const w = textW(l, bSt); if (w > widest) widest = w; }
    for (const l of head.lines) { const w = textW(l, head.st); if (w > widest) widest = w; }
    if (widest > BRIEF_STATS.widest) BRIEF_STATS.widest = widest;
    BRIEF_STATS.drawn++;
    report("brief." + (i + 1), y - 27, bottom, limit, bodySize + "px " + lines.length + "L");
  });

  report("file43", top - slabH - 34, top + BRIEF_ROWS * BRIEF_ROW_H - AIR, H - M, BRIEF_COLS + "cols");
}

/* ============================================================== 5. the run = */

const LAYOUT: { name: string; top: number; bottom: number; limit: number; note: string }[] = [];
function report(name: string, top: number, bottom: number, limit: number, note: string) {
  LAYOUT.push({ name, top, bottom, limit, note });
}

function build() {
  initCanvas(W, H);
  paperTexture();
  drawMasthead();
  rect(SIDE_X - 18, LEAD_TOP, 2, LEAD_H, RULE);
  drawLead();
  drawSidebar();
  drawTicker();
  drawBriefs43();
  downscale();
  pressGrain();
  return encodePNG(W, H, pixels());
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
  const au = typeAudit();
  console.log(`entry.png ${W}x${H} ${(png.length / 1024).toFixed(0)} KiB  lead=${((LEAD_H / H) * 100).toFixed(1)}% of page height`);
  console.log(`type: ${au.used} glyphs used` + (au.missing.length ? `, MISSING "${au.missing.join("")}"` : ", all present"));
  console.log(`file43: ${BRIEF_STATS.drawn}/${BRIEFS43.length} items drawn, widest line ${BRIEF_STATS.widest.toFixed(1)}px of ${BRIEF_COL_W}px column, head ${BRIEF_STATS.headSize}px body ${BRIEF_STATS.tightest}px`);
  console.log(bad.length ? `LAYOUT OVERFLOW x${bad.length}` : "layout ok");
}

main();
