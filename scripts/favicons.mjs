// Favicons for the source cards (Shelf.astro): one 64 px WebP per website in public/icons/<host>.webp. Run by hand
// after an ingest (`npm run favicons`), then commit public/icons/. Like covers.mjs, not part of the build: the build
// must not fetch. For each website, in order:
// 1. LOCAL: an image the library already holds, for a site with no icon of its own (a person's own site: their photo).
// 2. Google's favicon service, which returns a PNG whatever the site serves (.ico included), or 404 for none; on a 404
//    it tries the parent domain (bids.berkeley.edu, then berkeley.edu).
// 3. The site's own icons: the largest <link rel="...icon"> on its home page, then /favicon.ico.
// A host that already has a file is skipped; one that fails is logged and its cards show no icon.
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { files, readWiki, hostOf } from '../src/lib/wiki.js';

const LOCAL = { 'miclchen.com': 'public/images/people/michael-chen.jpeg' };
const UA = { 'User-Agent': 'Mozilla/5.0' };

const hosts = new Set([...files].filter((f) => f.startsWith('wiki/sources/') && f.endsWith('.md')).map((rel) => {
  const fm = readWiki(rel).split('\n---', 2)[0];
  return hostOf(fm.match(/^(?:url|fetched_url|sourceUrl):\s*"?([^"\n]+?)"?\s*$/m)?.[1]);
}).filter(Boolean));

const get = async (url) => { const res = await fetch(url, { headers: UA, redirect: 'follow' }); return res.ok ? Buffer.from(await res.arrayBuffer()) : null; };

// An .ico, which sharp cannot read: its largest image, when that is an embedded PNG or an uncompressed 32-bit bitmap.
const fromIco = (b) => {
  if (b.readUInt16LE(0) !== 0 || b.readUInt16LE(2) !== 1) return b;
  const n = b.readUInt16LE(4);
  const e = [...Array(n)].map((_, i) => ({ w: b[6 + 16 * i] || 256, bpp: b.readUInt16LE(12 + 16 * i), size: b.readUInt32LE(14 + 16 * i), off: b.readUInt32LE(18 + 16 * i) }))
    .sort((x, y) => y.w - x.w)[0];
  const img = b.subarray(e.off, e.off + e.size);
  if (img.readUInt32BE(0) === 0x89504e47) return img;
  if (e.bpp !== 32) throw new Error('ico: not 32-bit');
  const w = img.readInt32LE(4), h = img.readInt32LE(8) / 2, px = img.subarray(img.readUInt32LE(0)), rgba = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = ((h - 1 - y) * w + x) * 4, d = (y * w + x) * 4; // bottom-up BGRA to top-down RGBA
    rgba[d] = px[s + 2]; rgba[d + 1] = px[s + 1]; rgba[d + 2] = px[s]; rgba[d + 3] = px[s + 3];
  }
  return sharp(rgba, { raw: { width: w, height: h, channels: 4 } }).png().toBuffer();
};

const fromGoogle = async (host) => {
  for (let d = host; d.split('.').length >= 2; d = d.split('.').slice(1).join('.')) {
    const b = await get(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=64`);
    if (b) return b;
  }
  return null;
};

const fromSite = async (host) => {
  const home = `https://${host}/`;
  const html = (await get(home))?.toString() ?? '';
  const links = [...html.matchAll(/<link\b[^>]*>/gi)].map(([l]) => l).filter((l) => /rel=["']?[^"'>]*icon/i.test(l))
    .map((l) => ({ href: l.match(/href=["']?([^"'\s>]+)/i)?.[1], size: Number(l.match(/sizes=["']?(\d+)/i)?.[1] ?? 0) }))
    .filter((l) => l.href).sort((a, b) => b.size - a.size);
  for (const { href } of [...links, { href: '/favicon.ico' }]) {
    const b = await get(new URL(href, home).href).catch(() => null);
    if (b) try { return await fromIco(b); } catch { /* next */ }
  }
  return null;
};

const dir = path.join('public', 'icons');
fs.mkdirSync(dir, { recursive: true });
let made = 0;
for (const host of [...hosts].sort()) {
  const dest = path.join(dir, `${host}.webp`);
  if (fs.existsSync(dest)) continue;
  try {
    const img = LOCAL[host] ? fs.readFileSync(LOCAL[host]) : (await fromGoogle(host)) ?? (await fromSite(host));
    if (!img) throw new Error('no icon');
    await sharp(img).resize(64, 64, { fit: LOCAL[host] ? 'cover' : 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp().toFile(dest);
    made++;
  } catch (e) { console.warn(`skip ${host}: ${e.message}`); }
}
console.log(`${made} new favicons, ${hosts.size} websites`);
