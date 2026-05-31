#!/usr/bin/env node
// gen-assets.mjs — generate Lattice brand assets from the design-canvas
// renderer (direction C "Shell"). Port of lattice-core.js into Node;
// emits SVGs to ./assets/. Run once when the design changes.
//
// Source: Claude.ai design bundle "Lattice Logo" (chat 2026-05-31), file
// project/lattice-core.js + project/app.jsx. The design intent is in
// chats/chat1.md.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(__dirname, "..", "assets");
mkdirSync(ASSETS, { recursive: true });

// ---------------------------------------------------------------------------
// Renderer (port of lattice-core.js)
// ---------------------------------------------------------------------------

const ISO_X = Math.atan(1 / Math.SQRT2);
const ISO_Y = Math.PI / 4;

function rot(p, ax, ay) {
  const cy = Math.cos(ay), sy = Math.sin(ay);
  let x = p.x * cy + p.z * sy;
  let z = -p.x * sy + p.z * cy;
  const cx = Math.cos(ax), sx = Math.sin(ax);
  let y = p.y * cx - z * sx;
  z = p.y * sx + z * cx;
  return { x, y, z };
}

function geometry(opts) {
  const n = Math.max(2, opts.n || 3);
  const ax = opts.rotX != null ? opts.rotX : ISO_X;
  const ay = opts.rotY != null ? opts.rotY : ISO_Y;
  const raw = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      for (let k = 0; k < n; k++) {
        const x = i / (n - 1) - 0.5;
        const y = j / (n - 1) - 0.5;
        const z = k / (n - 1) - 0.5;
        const r = rot({ x, y, z }, ax, ay);
        raw.push({ i, j, k, x: r.x, y: r.y, z: r.z });
      }
  let minZ = Infinity, maxZ = -Infinity;
  for (const p of raw) {
    if (p.z < minZ) minZ = p.z;
    if (p.z > maxZ) maxZ = p.z;
  }
  const idx = (i, j, k) => i * n * n + j * n + k;
  // Fixed-fit projection (constant silhouette under rotation).
  const REF = opts.refSpan || Math.sqrt(3);
  for (const p of raw) {
    p.sx = p.x / REF + 0.5;
    p.sy = 0.5 - p.y / REF;
    p.d = (p.z - minZ) / (maxZ - minZ || 1);
  }
  return { n, pts: raw, idx };
}

const isExtreme = (v, n) => v === 0 || v === n - 1;

function edges(g, mode) {
  const { n, pts, idx } = g;
  const out = [];
  const push = (a, b) => out.push([pts[a], pts[b]]);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++)
      for (let k = 0; k < n; k++) {
        const onFace = (oa, ob) => isExtreme(oa, n) || isExtreme(ob, n);
        const onCage = (oa, ob) => isExtreme(oa, n) && isExtreme(ob, n);
        if (i + 1 < n) {
          if (mode === "all" ||
              (mode === "faces" && onFace(j, k)) ||
              (mode === "cage" && onCage(j, k)))
            push(idx(i, j, k), idx(i + 1, j, k));
        }
        if (j + 1 < n) {
          if (mode === "all" ||
              (mode === "faces" && onFace(i, k)) ||
              (mode === "cage" && onCage(i, k)))
            push(idx(i, j, k), idx(i, j + 1, k));
        }
        if (k + 1 < n) {
          if (mode === "all" ||
              (mode === "faces" && onFace(i, j)) ||
              (mode === "cage" && onCage(i, j)))
            push(idx(i, j, k), idx(i, j, k + 1));
        }
      }
  return out;
}

function nodes(g, mode) {
  const { n, pts } = g;
  if (mode === "corners")
    return pts.filter((p) => isExtreme(p.i, n) && isExtreme(p.j, n) && isExtreme(p.k, n));
  if (mode === "surface")
    return pts.filter((p) => isExtreme(p.i, n) || isExtreme(p.j, n) || isExtreme(p.k, n));
  return pts;
}

function render(opts = {}) {
  const o = Object.assign({
    n: 3, edgeMode: "faces", nodeMode: "surface", size: 440, pad: 0.16,
    ink: "#0b1220", nodeFill: "#0b1220", glow: true, lineW: 1.7,
    rMin: 2.6, rMax: 6.8, depthFade: true, halo: 0.22, bg: "none",
    idPrefix: "lat",
  }, opts);

  const g = geometry(o);
  const S = o.size, P = o.pad * S, draw = S - 2 * P;
  const X = (p) => (P + p.sx * draw).toFixed(2);
  const Y = (p) => (P + p.sy * draw).toFixed(2);

  const E = edges(g, o.edgeMode).sort((a, b) =>
    (a[0].d + a[1].d) - (b[0].d + b[1].d));
  const N = nodes(g, o.nodeMode).slice().sort((a, b) => a.d - b.d);

  const id = (s) => `${o.idPrefix}-${s}`;
  let svg = `<svg viewBox="0 0 ${S} ${S}" xmlns="http://www.w3.org/2000/svg" width="${o.outWidth || S}" height="${o.outHeight || S}" style="display:block">`;
  svg += `<defs>`;
  svg += `<radialGradient id="${id("halo")}" cx="50%" cy="50%" r="50%">` +
         `<stop offset="0%" stop-color="${o.nodeFill}" stop-opacity="${o.halo}"/>` +
         `<stop offset="55%" stop-color="${o.nodeFill}" stop-opacity="${(o.halo * 0.35).toFixed(3)}"/>` +
         `<stop offset="100%" stop-color="${o.nodeFill}" stop-opacity="0"/></radialGradient>`;
  svg += `</defs>`;
  if (o.bg !== "none") svg += `<rect x="0" y="0" width="${S}" height="${S}" fill="${o.bg}"/>`;

  const inner = (() => {
    let s = "";
    s += `<g fill="none" stroke="${o.ink}" stroke-linecap="round">`;
    for (const [a, b] of E) {
      const dd = (a.d + b.d) / 2;
      const op = o.depthFade ? (0.32 + 0.68 * dd).toFixed(3) : 1;
      const w = (o.lineW * (o.depthFade ? (0.7 + 0.6 * dd) : 1)).toFixed(2);
      s += `<line x1="${X(a)}" y1="${Y(a)}" x2="${X(b)}" y2="${Y(b)}" stroke-width="${w}" stroke-opacity="${op}"/>`;
    }
    s += `</g>`;
    s += `<g>`;
    for (const p of N) {
      const r = (o.rMin + (o.rMax - o.rMin) * p.d);
      if (o.glow) s += `<circle cx="${X(p)}" cy="${Y(p)}" r="${(r * 3.4).toFixed(2)}" fill="url(#${id("halo")})"/>`;
    }
    for (const p of N) {
      const r = (o.rMin + (o.rMax - o.rMin) * p.d);
      const op = o.depthFade ? (0.55 + 0.45 * p.d).toFixed(3) : 1;
      s += `<circle cx="${X(p)}" cy="${Y(p)}" r="${r.toFixed(2)}" fill="${o.nodeFill}" fill-opacity="${op}"/>`;
    }
    s += `</g>`;
    return s;
  })();

  // optional in-plane animation
  if (o.animate) {
    const c = S / 2;
    svg += `<g style="transform-origin:${c}px ${c}px"><animateTransform attributeName="transform" attributeType="XML" type="rotate" from="0 ${c} ${c}" to="360 ${c} ${c}" dur="${o.animateDur || 14}s" repeatCount="indefinite"/>${inner}</g>`;
  } else {
    svg += inner;
  }
  svg += `</svg>`;
  return svg;
}

// ---------------------------------------------------------------------------
// Asset specs (direction C "Shell")
// ---------------------------------------------------------------------------

const INK = "#0b1220";
const WHITE = "#ffffff";

// Base direction C
const C = { n: 3, edgeMode: "faces", nodeMode: "surface", lineW: 1.7, rMin: 2.6, rMax: 6.8, halo: 0.22 };
// Light mode (ink on light)
const C_light = { ...C, ink: INK, nodeFill: INK };
// Dark surface (white on ink)
const C_dark = { ...C, ink: WHITE, nodeFill: WHITE, halo: 0.32 };

function write(filename, content) {
  const p = resolve(ASSETS, filename);
  writeFileSync(p, content);
  console.log(`wrote ${p}`);
}

// 1. Logo mark — light mode (ink on transparent)
write("logo-mark.svg", render({ ...C_light, size: 440, idPrefix: "mark" }));

// 2. Logo mark — dark mode (white on transparent, brighter halo)
write("logo-mark-dark.svg", render({ ...C_dark, size: 440, idPrefix: "markdk" }));

// 3. Animated logo mark — in-plane rotation, SMIL (works in browsers + GitHub raw view)
write("logo-mark-spin.svg", render({ ...C_light, size: 440, animate: true, animateDur: 14, idPrefix: "spin" }));
write("logo-mark-spin-dark.svg", render({ ...C_dark, size: 440, animate: true, animateDur: 14, idPrefix: "spindk" }));

// 4. App icon — rounded-rect ink background with white mark inset, 512×512.
{
  const S = 512;
  const inner = 384;
  const inset = (S - inner) / 2;
  const r = 116; // matches the design's 168/38 ratio scaled up
  const mark = render({ ...C_dark, size: inner, idPrefix: "app", outWidth: inner, outHeight: inner });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">` +
    `<rect x="0" y="0" width="${S}" height="${S}" rx="${r}" ry="${r}" fill="${INK}"/>` +
    `<g transform="translate(${inset} ${inset})">${mark.replace(/^<svg[^>]*>|<\/svg>$/g, "")}</g>` +
    `</svg>`;
  write("app-icon.svg", svg);
}

// 5. Favicons — 48 / 32 / 16, ink on transparent. Identical geometry; rendered
//    at output sizes so rasterizers downscale cleanly.
write("favicon-48.svg", render({ ...C_light, size: 48, pad: 0.10, idPrefix: "f48", lineW: 1.2, rMin: 1.6, rMax: 3.2 }));
write("favicon-32.svg", render({ ...C_light, size: 32, pad: 0.10, idPrefix: "f32", lineW: 1.0, rMin: 1.2, rMax: 2.4 }));
write("favicon-16.svg", render({ ...C_light, size: 16, pad: 0.08, idPrefix: "f16", lineW: 0.7, rMin: 0.7, rMax: 1.5, glow: false }));

// 6. Wordmark — horizontal lockup (mark + "Lattice"), ink on transparent
{
  const markS = 96;
  const padX = 24;
  const gap = 22;
  const fontSize = markS * 0.62; // 59.52
  const word = "Lattice";
  // estimated word width with Outfit Medium tracking -0.03em ≈ 0.5em per glyph
  const wordW = Math.round(fontSize * 0.56 * word.length);
  const W = padX + markS + gap + wordW + padX;
  const H = markS + 28;
  const markY = (H - markS) / 2;
  const wordY = H / 2 + fontSize * 0.34;
  const mark = render({ ...C_light, size: markS, idPrefix: "wm", outWidth: markS, outHeight: markS });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<g transform="translate(${padX} ${markY})">${mark.replace(/^<svg[^>]*>|<\/svg>$/g, "")}</g>` +
    `<text x="${padX + markS + gap}" y="${wordY}" font-family="Outfit, Inter, 'Plus Jakarta Sans', system-ui, sans-serif" font-weight="500" font-size="${fontSize}" letter-spacing="-1.8" fill="${INK}">${word}</text>` +
    `</svg>`;
  write("logo-wordmark.svg", svg);
}

// 7. Wordmark — horizontal lockup, dark mode (white text + white mark)
{
  const markS = 96;
  const padX = 24;
  const gap = 22;
  const fontSize = markS * 0.62;
  const word = "Lattice";
  const wordW = Math.round(fontSize * 0.56 * word.length);
  const W = padX + markS + gap + wordW + padX;
  const H = markS + 28;
  const markY = (H - markS) / 2;
  const wordY = H / 2 + fontSize * 0.34;
  const mark = render({ ...C_dark, size: markS, idPrefix: "wmdk", outWidth: markS, outHeight: markS });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<g transform="translate(${padX} ${markY})">${mark.replace(/^<svg[^>]*>|<\/svg>$/g, "")}</g>` +
    `<text x="${padX + markS + gap}" y="${wordY}" font-family="Outfit, Inter, 'Plus Jakarta Sans', system-ui, sans-serif" font-weight="500" font-size="${fontSize}" letter-spacing="-1.8" fill="${WHITE}">${word}</text>` +
    `</svg>`;
  write("logo-wordmark-dark.svg", svg);
}

// 8. Social card — 1200×630 OG-standard, ink background, mark + wordmark + tagline
{
  const W = 1200, H = 630;
  const markS = 280;
  const padX = 96;
  const gap = 56;
  const markY = (H - markS) / 2;
  const titleSize = 96;
  const tagSize = 28;
  const word = "Lattice";
  const tagline = "Capability-first runtime SDK for multimodal AI applications.";
  const titleX = padX + markS + gap;
  const titleY = H / 2 - 8;
  const tagY = titleY + 56;
  const mark = render({ ...C_dark, size: markS, idPrefix: "soc", outWidth: markS, outHeight: markS, halo: 0.28 });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">` +
    `<rect x="0" y="0" width="${W}" height="${H}" fill="${INK}"/>` +
    `<g transform="translate(${padX} ${markY})">${mark.replace(/^<svg[^>]*>|<\/svg>$/g, "")}</g>` +
    `<text x="${titleX}" y="${titleY}" font-family="Outfit, Inter, 'Plus Jakarta Sans', system-ui, sans-serif" font-weight="500" font-size="${titleSize}" letter-spacing="-2.9" fill="${WHITE}">${word}</text>` +
    `<text x="${titleX}" y="${tagY}" font-family="'Plus Jakarta Sans', Inter, system-ui, sans-serif" font-weight="400" font-size="${tagSize}" fill="rgba(255,255,255,0.62)">${tagline}</text>` +
    `</svg>`;
  write("social-card.svg", svg);
}

// ---------------------------------------------------------------------------
// GIFs — render each rotation frame as a fresh SVG (crisp lines at every
// angle) and stitch via rsvg-convert + ImageMagick. The static SVG approach
// avoids the bitmap-interpolation blur you get from rotating a PNG. Period
// is 14 seconds, matching the design's CSS rotate(360deg) keyframe.
// ---------------------------------------------------------------------------

import { execSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, readFileSync as fsRead } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function which(cmd) {
  const r = spawnSync("which", [cmd], { encoding: "utf8" });
  return r.status === 0 && r.stdout.trim().length > 0;
}

if (!which("rsvg-convert") || !which("magick")) {
  console.log("Skipping GIFs (rsvg-convert + magick required).");
  console.log("Done.");
  process.exit(0);
}

const FRAMES = 60;
const PERIOD = 14;            // seconds, matches the design
const DELAY_CS = Math.round(PERIOD * 100 / FRAMES); // ImageMagick delay (centiseconds)
const OUT_SIZE = 480;         // frame raster size
const GIF_SIZE = 360;         // final GIF size
const LIGHT_BG = "#f4f5f7";
const DARK_BG  = "#0b1220";

function wrapSvgRotated(svg, angle, size) {
  const cx = size / 2;
  const cy = size / 2;
  const openEnd = svg.indexOf(">") + 1;
  const closeStart = svg.lastIndexOf("</svg>");
  const head = svg.slice(0, openEnd);
  const inner = svg.slice(openEnd, closeStart);
  return `${head}<g transform="rotate(${angle.toFixed(4)} ${cx} ${cy})">${inner}</g></svg>`;
}

function buildGif({ srcSvgPath, outGifPath, bg, label }) {
  const tmp = mkdtempSync(join(tmpdir(), `lat-spin-${label}-`));
  const src = fsRead(srcSvgPath, "utf8");
  for (let i = 0; i < FRAMES; i++) {
    const angle = (i * 360) / FRAMES;
    const rotated = wrapSvgRotated(src, angle, 440);
    const svgPath = join(tmp, `f${String(i).padStart(3, "0")}.svg`);
    const pngPath = join(tmp, `f${String(i).padStart(3, "0")}.png`);
    writeFileSync(svgPath, rotated);
    execSync(`rsvg-convert -w ${OUT_SIZE} -h ${OUT_SIZE} -b transparent ${svgPath} -o ${pngPath}`);
  }
  // Stitch + optimize.
  execSync(
    `magick -delay ${DELAY_CS} -loop 0 -dispose previous ${join(tmp, "f*.png")} ` +
    `-resize ${GIF_SIZE}x${GIF_SIZE} -background "${bg}" -alpha remove -alpha off ` +
    `-colors 48 -layers Optimize -fuzz 4% ${outGifPath}`
  );
  rmSync(tmp, { recursive: true, force: true });
  console.log(`wrote ${outGifPath} (${FRAMES} frames, ${PERIOD}s period)`);
}

buildGif({
  srcSvgPath: resolve(ASSETS, "logo-mark.svg"),
  outGifPath: resolve(ASSETS, "logo-mark-spin.gif"),
  bg: LIGHT_BG,
  label: "light",
});
buildGif({
  srcSvgPath: resolve(ASSETS, "logo-mark-dark.svg"),
  outGifPath: resolve(ASSETS, "logo-mark-spin-dark.gif"),
  bg: DARK_BG,
  label: "dark",
});

console.log("Done.");
