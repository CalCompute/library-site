// After `astro build`: copy every rehosted non-Markdown file under ../library-wiki/raw (PDF, saved HTML, DOCX ...)
// to dist/files/ or dist/saved-pages/ (see originalUrl), so pages can link to the originals. Read-only on the library.
import fs from 'node:fs';
import path from 'node:path';
import { WIKI, files, originalUrl, rehosted } from '../src/lib/wiki.js';

// Cloudflare Pages refuses files over 25 MiB, so they are skipped and their links go nowhere. Use R2 if many get this big.
const MAX = 25 * 1024 * 1024;
let n = 0;
for (const rel of files) {
  if (!rel.startsWith('raw/') || rel.endsWith('.md')) continue;
  if (!rehosted(rel)) { console.warn(`copy-raw-originals: skipped, not rehosted: ${rel}`); continue; }
  if (fs.statSync(path.join(WIKI, rel)).size > MAX) { console.warn(`copy-raw-originals: skipped, over 25 MiB: ${rel}`); continue; }
  const to = path.join('dist', decodeURIComponent(originalUrl(rel)));
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.copyFileSync(path.join(WIKI, rel), to);
  n++;
}
console.log(`copy-raw-originals: ${n} files from ${WIKI}/raw`);
