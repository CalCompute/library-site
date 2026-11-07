// Covers for the library's bookshelves: page one of every PDF, as a small WebP in public/covers/. Run by hand after an
// ingest (`npm run covers`), then commit public/covers/. Not part of the build: Cloudflare has no pdftoppm, and the
// build must not fetch. Local originals are read in place. An online-only PDF is fetched into ../library-wiki/.cache/pdf/
// (git-ignored, never rehosted) and only its thumbnail is kept.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { WIKI, files, idOf, coverOf, remoteCoverOf, remotePdfSources } from '../src/lib/wiki.js';

const jobs = [...files].filter((f) => /\.pdf$/i.test(f)).map((f) => ({ pdf: path.join(WIKI, f), out: coverOf(f) }));
for (const s of remotePdfSources()) {
  const pdf = path.join(WIKI, '.cache', 'pdf', `${idOf(s.rel).split('/').pop()}.pdf`);
  if (!fs.existsSync(pdf)) {
    try {
      const res = await fetch(s.url, { redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.subarray(0, 5).toString() !== '%PDF-') throw new Error('not a PDF');
      fs.mkdirSync(path.dirname(pdf), { recursive: true });
      fs.writeFileSync(pdf, buf);
    } catch (e) { console.warn(`skip ${s.rel}: ${s.url}: ${e.message}`); continue; }
  }
  jobs.push({ pdf, out: remoteCoverOf(s.rel) });
}

let made = 0;
for (const { pdf, out } of jobs) {
  const dest = path.join('public', out);
  if (fs.existsSync(dest) && fs.statSync(dest).mtimeMs >= fs.statSync(pdf).mtimeMs) continue;
  try {
    const png = execFileSync('pdftoppm', ['-f', '1', '-l', '1', '-singlefile', '-png', '-scale-to', '640', pdf], { maxBuffer: 64 << 20 });
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    await sharp(png).resize({ width: 320 }).webp({ quality: 72 }).toFile(dest);
    console.log(`${dest}`);
    made++;
  } catch (e) { console.warn(`skip ${pdf}: ${e.message.split('\n')[0]}`); }
}
console.log(`covers: ${made} made, ${jobs.length - made} already current or skipped, ${jobs.length} PDFs`);
