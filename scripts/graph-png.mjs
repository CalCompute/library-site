// Draw the knowledge graph as a PNG at build time: dist/graph.png from dist/graph.json, so another site can show
// the current graph with one <img>. It is the graph page's Save PNG: the same layout code (src/lib/graph-layout.js),
// settled as the page settles it and re-settled in a square as Save PNG does, then every node linked to the Report,
// its colour, shape and image, no links, transparent background. Run after `astro build`.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { createLayout, DOC_W, DOC_H, ALPHA_MIN } from '../src/lib/graph-layout.js';

const DIST = process.argv[2] || 'dist', SIZE = 1800, OUT = path.join(DIST, 'graph.png');
// The square the layout settles in: Save PNG uses one of the browser view's area; this is a desktop window's.
const S = 1100;
// The palette of WikiGraph.jsx (COLORS, OUTLINED, tint, nodeColor): keep them in step.
const GREEN = '#0b9a4a', PINK = '#e44c9a', ORANGE = '#ff6e1b', GREY = '#7c7e7f';
const COLORS = { element: PINK, checklist: PINK, source: '#1295d8', concept: '#005581', analysis: '#005581', overview: '#005581', page: '#005581', report: '#005581',
  entity: ORANGE, legislative: GREEN, shared: GREEN, web: GREEN, human: GREEN, calls: GREEN, zulip: GREEN, email: GREEN, meet: GREEN, drive: GREEN, readme: GREY };
const OUTLINED = new Set(['calls', 'zulip', 'email', 'meet', 'drive']);
const tint = (hex, k = 0.22) => '#' + [1, 3, 5].map((i) => Math.round(255 - (255 - parseInt(hex.slice(i, i + 2), 16)) * k).toString(16).padStart(2, '0')).join('');
const colorOf = (n) => n.color ?? (n.hub ? GREY : COLORS[n.type] || GREY);

// The graph page: all of graph.json (catalog pages show by default), radial, default centre and scale.
const sim = createLayout(JSON.parse(fs.readFileSync(path.join(DIST, 'graph.json'), 'utf8')), { size: () => [S, S] });
const { nodes, nbr, mainIdx, step, separate, escape } = sim;
// The page's settle() (navigator: no presettle), then Save PNG's re-settle from alpha 1 and its final no-overlap pass.
sim.settling = true;
while (sim.alpha > ALPHA_MIN) step();
for (let passes = 1, clear = false; !clear && passes <= 1600; passes++) { clear = separate(1); if (passes % 400 === 0 && !clear) escape(); }
sim.settling = false;
sim.alpha = 1; while (sim.alpha > ALPHA_MIN) step(); step();

// Only what the Report reaches, as Save PNG draws it.
const joined = new Set([Math.max(mainIdx, 0)]);
for (const i of joined) for (const j of nbr[i]) joined.add(j);
const shown = nodes.filter((n, i) => joined.has(i));

// Images: the page's photos and marks, from public/, inlined. A file sharp cannot read is left out.
const dataUri = async (src) => {
  const p = path.join('public', decodeURIComponent(src));
  if (!fs.existsSync(p)) return null;
  if (/\.svg$/i.test(p)) return 'data:image/svg+xml;base64,' + fs.readFileSync(p).toString('base64');
  try { return 'data:image/png;base64,' + (await sharp(p).resize(96, 96, { fit: 'inside' }).png().toBuffer()).toString('base64'); } catch { return null; }
};
// shapePath() in WikiGraph.jsx, as SVG.
const shape = (n, r) => n.system === 'drive' ? `<rect x="${n.x - r * 0.9}" y="${n.y - r * 0.9}" width="${r * 1.8}" height="${r * 1.8}" rx="${r * 0.315}"`
  : n.system === 'zulip' ? `<path d="M${n.x} ${n.y - r * 1.2}L${n.x + r * 1.2} ${n.y}L${n.x} ${n.y + r * 1.2}L${n.x - r * 1.2} ${n.y}Z"`
  : n.system === 'mail' ? `<path d="M${n.x} ${n.y - r * 1.3}L${n.x + r * 1.13} ${n.y + r * 0.65}L${n.x - r * 1.13} ${n.y + r * 0.65}Z"`
  : `<circle cx="${n.x}" cy="${n.y}" r="${r}"`;
const text = (n, t, size) => `<text x="${n.x}" y="${n.y}" dy="0.35em" font-family="system-ui, sans-serif" font-weight="700" font-size="${size}" text-anchor="middle" fill="#fff">${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`;
const parts = [];
for (const [i, n] of shown.entries()) {
  const c = colorOf(n);
  if (n.type === 'report') {
    const x = n.x - DOC_W / 2, y = n.y - DOC_H / 2, bars = [[0.55, 6], ...[0.92, 0.8, 0.88, 0.7, 0.85, 0.76, 0.62].map((w) => [w, 4])];
    let yy = y + 11;
    parts.push(`<rect x="${x}" y="${y}" width="${DOC_W}" height="${DOC_H}" rx="4" fill="#fff" stroke="#72cdf4" stroke-width="1.5"/>`);
    bars.forEach(([w, h], k) => { parts.push(`<rect x="${x + 10}" y="${yy}" width="${(DOC_W - 20) * w}" height="${h}" rx="${h / 2}" fill="${k && n.drafted?.includes('ABCDEFG'[k - 1]) ? '#1295d8' : '#e5e7eb'}"/>`); yy += h + (k === 0 ? 8 : 4.8); });
    continue;
  }
  const img = n.img ? await dataUri(n.img) : null;
  if (img) {
    const box = n.imgKind === 'photo' ? 2 * n.r : 2 * n.r * 0.64;
    parts.push(`<clipPath id="c${i}">${shape(n, n.r)}/></clipPath>${shape(n, n.r)} fill="#fff"/><image clip-path="url(#c${i})" href="${img}" x="${n.x - box / 2}" y="${n.y - box / 2}" width="${box}" height="${box}" preserveAspectRatio="${n.imgKind === 'photo' ? 'xMidYMid slice' : 'xMidYMid meet'}"/>${shape(n, n.r)} fill="none" stroke="${c}" stroke-width="${n.color ? 3.5 : 1.5}"/>`);
  } else if (OUTLINED.has(n.type) && !n.hub) parts.push(`${shape(n, n.r - 0.75)} fill="${tint(c)}" stroke="${c}" stroke-width="1.5"/>`);
  else {
    parts.push(`${shape(n, n.r)} fill="${c}"/>`);
    if (n.mono) parts.push(text(n, n.mono, n.r * (n.mono.length <= 2 ? 0.9 : n.mono.length === 3 ? 0.7 : 0.55)));
  }
  const L = n.type === 'element' && /^([A-G]) - /.exec(n.label)?.[1];
  if (L) parts.push(text(n, L, n.r * 1.05));
}
// Cropped to the drawing, the Report at the centre.
const ext = Math.max(...shown.map((n) => Math.max(Math.abs(n.x), Math.abs(n.y)) + n.hit)) + 10, s = SIZE / (2 * ext);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><g transform="translate(${SIZE / 2} ${SIZE / 2}) scale(${s})">${parts.join('')}</g></svg>`;
await sharp(Buffer.from(svg)).png().toFile(OUT);
console.log(`${OUT}: ${shown.length} nodes, ${SIZE}x${SIZE}`);
