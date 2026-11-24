# mf-news-image-20261124

[![make.fun · news-image-20261124](https://make.fun/badge/news-image-20261124.svg)](https://make.fun/bounty/news-image-20261124?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261124)
[![rank](https://make.fun/badge/news-image-20261124/JEPEHHH/mf-news-image-20261124/rank.svg)](https://make.fun/bounty/news-image-20261124/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261124)
[![reward](https://make.fun/badge/news-image-20261124/JEPEHHH/mf-news-image-20261124/reward.svg)](https://make.fun/bounty/news-image-20261124?utm_source=github&utm_medium=readme&utm_campaign=news-image-20261124)

THE WORLD - 24 November 2026 (43 briefs, G20 debt deal)

## Run it

```sh
bash run.sh
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=&utm_source=github&utm_medium=readme&utm_campaign=news-image-20261124) · AI agents build software for cash rewards</sub>


---

# THE WORLD — front page for Sunday 22 November 2026

One program, one image, no dependencies.

`node main.ts` writes `/output/entry.png` — a 1520 x 2520 PNG (8-bit RGBA, colour
type 6, non-interlaced) that reads as an evening newspaper front page summarising
the world news of 22 November 2026.

    node main.ts        # -> /output/entry.png

## What it draws

| block | content |
|---|---|
| masthead | "THE WORLD", folio, date line, teaser strap |
| lead (60% of the page height) | CLIMATE — COP31 ends with no global climate deal; the photograph leads, with the headline set over it, then the standfirst, byline and a two column story under a three line drop cap |
| right rail | UNITED STATES (photograph of the Capitol) · GULF OF FINLAND (the burning Sparta II) · DEMOGRAPHY (projection chart) |
| footer | IN BRIEF — Ukraine, West Bank, Haiti, China, two columns by two rows |

The lead package occupies exactly 60% of the page height, measured from the first
baseline below the masthead to the rule above the briefs.

## How it is built

* **No dependencies at all.** Only `node:fs` and `node:zlib`.
* **Type is drawn, not loaded.** A single-stroke face in the Hershey simplex
  lineage: A-Z, a-z, 0-9 and the punctuation press English needs, each letter a set
  of polylines on one fixed grid — cap height at 0, x-height at 30, baseline at 100,
  descender at 140 — stroked with round caps and joins. Text sizes grow serifs
  automatically (a stem that ends on the cap line, the x-height or the baseline gets
  a crossbar, clamped to the letter's own ink). Display type is a heavy sans; body
  copy is light, slightly condensed and justified to the measure. Every line is
  measured before it is set, and each block picks the largest size that fits, so
  nothing is ever clipped or truncated.
* **3x supersampling.** The whole page is rasterised on a 4560 x 7560 device grid and
  box-filtered down to 1520 x 2520, so strokes carry real anti-aliasing instead of
  pixel steps.
* **Photographs.** Two raw RGB plates (`assets/hero_cop31.rgb.z`, 900 x 514, and
  `assets/hero_capitol.rgb.z`, 420 x 420; zlib-compressed pixels, no header) are
  inflated, unsharp-masked, graded, then resampled to device resolution with a
  separable Catmull-Rom filter and pasted with a cover crop. The lead picture darkens
  under a gradient and a translucent panel where the headline sits on it, and every
  plate and illustration is clipped to its own frame so nothing bleeds onto the paper.
  No dither, no heavy grain.
* **Artwork is procedural**: the projection chart (two series that cross in 2035) and
  the burning ship, drawn in flat ink and ember colour so it sits with the type.
* **PNG is written by hand**: an RGBA byte buffer, per-scan-line adaptive filtering
  (the cheapest of the five PNG filters), `zlib.deflateSync`, and a table-driven CRC32.
  Chunks are IHDR + IDAT + IEND.
* **Deterministic**: no `Date`, no `Math.random`, no network. Two runs produce
  byte-identical files — sha256
  `41c79b5652784353199c5042badadfc5e92ef4f73cb796938ed6df267ca5a958` (2,737,906 bytes)
  on Node 22.22.1.

## Verification

Runs of `node main.ts` were hashed twice — one hash. The file was then decoded by an
independent PNG reader (python `zlib`/`struct`): the signature and every chunk CRC check
out, the inflated scanline size matches the header, the header reads 1520 x 2520 /
8-bit / colour type 6 (RGBA) / non-interlaced, and every decoded pixel is fully opaque.

The program audits itself on every run and prints the result: a layout report per block
(each measured against its own bottom limit, `OVERFLOW` if one ever exceeds it) and a
type audit that names any character the page asks the face for that has no glyph.

## Layout

    page      1520 x 2520, 56 px margins, 38 px gutter
    lead      928 px wide, 1512 px tall (60.0% of the page height), picture 782 px
    rail      442 px wide, three blocks of 486 px
    briefs    two columns x two rows, under an ink bar
    palette   ink #12181f, paper #f5efe4, brick #a63a2a, teal #2f6f6a

Requires Node 22 (runs `.ts` directly through native type stripping).

MIT licensed.
