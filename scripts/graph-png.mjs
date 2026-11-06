// Draw the knowledge graph as a PNG at build time: dist/graph.png from dist/graph.json, so another site can show
// the current graph with one <img>. Same picture as the graph page's Save PNG: every node reachable from the
// Report, its colour, shape and image, no links, transparent background. Run after `astro build`.
//
// ponytail: its own small radial layout, not the page's simulation (that lives inside a React effect). If the two
// drift apart, render the page's Save PNG in a headless browser instead.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const DIST = process.argv[2] || 'dist', SIZE = 1800, OUT = path.join(DIST, 'graph.png');
// The palette of WikiGraph.jsx (COLORS, OUTLINED, tint): keep them in step.
const GREEN = '#0b9a4a', PINK = '#e44c9a', ORANGE = '#ff6e1b', GREY = '#7c7e7f';
const COLORS = { element: PINK, checklist: PINK, source: '#1295d8', concept: '#005581', analysis: '#005581', overview: '#005581', page: '#005581', report: '#005581',
  entity: ORANGE, legislative: GREEN, shared: GREEN, web: GREEN, human: GREEN, calls: GREEN, zulip: GREEN, email: GREEN, meet: GREEN, drive: GREEN, readme: GREY };
const OUTLINED = new Set(['calls', 'zulip', 'email', 'meet', 'drive']);
const tint = (hex, k = 0.22) => '#' + [1, 3, 5].map((i) => Math.round(255 - (255 - parseInt(hex.slice(i, i + 2), 16)) * k).toString(16).padStart(2, '0')).join('');
const colorOf = (n) => n.color ?? (n.hub ? GREY : COLORS[n.type] || GREY);

const g = JSON.parse(fs.readFileSync(path.join(DIST, 'graph.json'), 'utf8'));
// Only what the Report reaches, as the page's PNG does; catalog pages stay out.
const nbr = new Map(g.nodes.map((n) => [n.id, []]));
for (const e of g.edges) { nbr.get(e.source)?.push(e.target); nbr.get(e.target)?.push(e.source); }
const joined = new Set(['#report']);
for (const q = ['#report']; q.length;) for (const v of nbr.get(q.shift()) || []) if (!joined.has(v)) { joined.add(v); q.push(v); }
const nodes = g.nodes.filter((n) => joined.has(n.id) && !n.hub);
const idx = new Map(nodes.map((n, i) => [n.id, i]));
const edges = g.edges.map((e) => [idx.get(e.source), idx.get(e.target)]).filter(([a, b]) => a != null && b != null);

// Radii as the page: by sqrt of size, 6..22; the Report is a 76x96 document.
const sizes = nodes.map((n) => Math.sqrt(Math.max(1, n.size || 1)));
const minS = Math.min(...sizes), maxS = Math.max(...sizes);
const DOC_W = 76, DOC_H = 96, GAP = 10, PACK = 0.62;
for (const [i, n] of nodes.entries()) {
  n.r = n.type === 'report' ? 56 : 6 + ((sizes[i] - minS) / (maxS - minS || 1)) * 16;
  n.hit = n.type === 'report' ? Math.hypot(DOC_W, DOC_H) / 2 : n.r * (n.system === 'zulip' ? 1.2 : n.system === 'mail' ? 1.3 : n.system === 'drive' ? 1.15 : 1);
  n.ring = n.ring ?? 3;
}
// Ring radii: each ring a band just wide enough for its nodes, outside the one before (as WikiGraph.jsx).
const target = new Map(), band = new Map(); // ring -> middle radius; ring -> [inner, outer] radii of its band
let inner = 0;
for (const k of [...new Set(nodes.map((n) => n.ring))].sort((a, b) => a - b)) {
  const m = nodes.filter((n) => n.ring === k), maxHit = Math.max(...m.map((n) => n.hit));
  if (k === 0) { inner = maxHit + GAP; target.set(0, 0); band.set(0, [0, 0]); continue; }
  const area = m.reduce((a, n) => a + Math.PI * (n.hit + GAP / 2) ** 2, 0) / PACK;
  const outer = Math.sqrt(inner * inner + area / Math.PI);
  target.set(k, Math.max(inner + maxHit + GAP / 2, (inner + outer) / 2));
  const lo = inner;
  inner = Math.max(outer, target.get(k) + maxHit + GAP / 2);
  band.set(k, [lo, inner]);
}
// Start: the Report at the centre, the element hubs on a clock face (A at the top), the rest on their ring.
const hubs = nodes.filter((n) => n.ring === 1).sort((a, b) => a.label.localeCompare(b.label));
hubs.forEach((n, k) => { const a = -Math.PI / 2 + (k / hubs.length) * Math.PI * 2; n.x = Math.cos(a) * target.get(1); n.y = Math.sin(a) * target.get(1); n.fixed = true; });
nodes.forEach((n, i) => { if (n.fixed) return; const a = i * 2.39996; n.x = Math.cos(a) * target.get(n.ring); n.y = Math.sin(a) * target.get(n.ring); if (n.ring === 0) n.x = n.y = 0; n.fixed = n.ring === 0; });

// Layout: repulsion, weak springs along links, and walls that keep each node inside its ring's band. O(n^2), fine
// at ~500 nodes. The last 40 rounds only push overlapping nodes apart.
const N = nodes.length;
for (let it = 0, alpha = 1; it < 340; it++, alpha *= it < 300 ? 0.985 : 1) {
  const fx = new Float64Array(N), fy = new Float64Array(N), settle = it >= 300;
  for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
    const dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y, d2 = dx * dx + dy * dy + 0.01, d = Math.sqrt(d2);
    const min = nodes[i].hit + nodes[j].hit + GAP, f = ((settle ? 0 : 700 / d2) + (d < min ? (min - d) * 0.5 : 0)) / d;
    fx[i] -= dx * f; fy[i] -= dy * f; fx[j] += dx * f; fy[j] += dy * f;
  }
  if (!settle) for (const [a, b] of edges) { const dx = nodes[b].x - nodes[a].x, dy = nodes[b].y - nodes[a].y; fx[a] += dx * 0.02; fy[a] += dy * 0.02; fx[b] -= dx * 0.02; fy[b] -= dy * 0.02; }
  for (let i = 0; i < N; i++) {
    const n = nodes[i]; if (n.fixed) continue;
    const r = Math.hypot(n.x, n.y) || 1, [lo, hi] = band.get(n.ring), wall = r < lo + n.hit ? lo + n.hit - r : r > hi - n.hit ? hi - n.hit - r : 0;
    fx[i] += (n.x / r) * wall * 0.5; fy[i] += (n.y / r) * wall * 0.5;
    const v = Math.min(5, Math.hypot(fx[i], fy[i]) * (settle ? 1 : alpha)) / (Math.hypot(fx[i], fy[i]) || 1);
    n.x += fx[i] * v; n.y += fy[i] * v;
  }
}

// Images: the page's photos and marks, from public/, inlined. A file sharp cannot read is left out.
const dataUri = async (src) => {
  const p = path.join('public', decodeURIComponent(src));
  if (!fs.existsSync(p)) return null;
  if (/\.svg$/i.test(p)) return 'data:image/svg+xml;base64,' + fs.readFileSync(p).toString('base64');
  try { return 'data:image/png;base64,' + (await sharp(p).resize(96, 96, { fit: 'inside' }).png().toBuffer()).toString('base64'); } catch { return null; }
};
const shape = (n, r) => n.system === 'drive' ? `<rect x="${n.x - r * 0.9}" y="${n.y - r * 0.9}" width="${r * 1.8}" height="${r * 1.8}" rx="${r * 0.315}"`
  : n.system === 'zulip' ? `<path d="M${n.x} ${n.y - r * 1.2}L${n.x + r * 1.2} ${n.y}L${n.x} ${n.y + r * 1.2}L${n.x - r * 1.2} ${n.y}Z"`
  : n.system === 'mail' ? `<path d="M${n.x} ${n.y - r * 1.3}L${n.x + r * 1.13} ${n.y + r * 0.65}L${n.x - r * 1.13} ${n.y + r * 0.65}Z"`
  : `<circle cx="${n.x}" cy="${n.y}" r="${r}"`;
const parts = [];
for (const [i, n] of nodes.entries()) {
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
  } else if (OUTLINED.has(n.type)) parts.push(`${shape(n, n.r - 0.75)} fill="${tint(c)}" stroke="${c}" stroke-width="1.5"/>`);
  else parts.push(`${shape(n, n.r)} fill="${c}"/>`);
  const L = n.type === 'element' && /^([A-G]) - /.exec(n.label)?.[1];
  if (L) parts.push(`<text x="${n.x}" y="${n.y + n.r * 0.38}" font-family="system-ui, sans-serif" font-weight="700" font-size="${n.r * 1.05}" text-anchor="middle" fill="#fff">${L}</text>`);
}
const ext = Math.max(...nodes.map((n) => Math.hypot(n.x, n.y) + n.hit)) + GAP, s = SIZE / (2 * ext);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}"><g transform="translate(${SIZE / 2} ${SIZE / 2}) scale(${s})">${parts.join('')}</g></svg>`;
await sharp(Buffer.from(svg)).png().toFile(OUT);
console.log(`${OUT}: ${nodes.length} nodes, ${SIZE}x${SIZE}`);
