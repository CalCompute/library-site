// Pure Node helpers over the wiki's files. No Astro imports, so `node --test` can load this.
// The site reads ../library-wiki in place and never writes to it.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const WIKI = path.resolve(process.env.WIKI_DIR || path.join(process.cwd(), '..', 'library-wiki'));
export const TREES = ['wiki', 'raw'];
export const META = { 'AGENTS.md': '/how-it-works/#agents-md', 'README.md': '/how-it-works/#readme-md' };

// Every file and folder under wiki/wiki and wiki/raw, as paths relative to WIKI ("wiki/sources/X.md").
export const files = new Set();
export const dirs = new Set();
function walk(rel) {
  dirs.add(rel);
  for (const d of fs.readdirSync(path.join(WIKI, rel), { withFileTypes: true })) {
    if (d.name.startsWith('.')) continue; // .gitkeep, .state.json, .folders.json
    const r = `${rel}/${d.name}`;
    d.isDirectory() ? walk(r) : files.add(r);
  }
}
for (const t of TREES) if (fs.existsSync(path.join(WIKI, t))) walk(t);

export const slugSeg = (s) =>
  s.normalize('NFC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'untitled';

// "wiki/sources/2026-10-08 Call D.md" -> "sources/2026-10-08-call-d" (the route id inside its tree).
export const idOf = (rel) => rel.split('/').slice(1).map((s) => slugSeg(s.replace(/\.md$/, ''))).join('/');

// Route for a file or folder path relative to WIKI, or null when it is not in the mirror
// (bin/, setup.sh ...). An original (PDF, saved web page) is not served here: its route is the
// public Drive copy, else the publisher's page (outsideUrl).
export function routeOf(rel) {
  if (META[rel]) return META[rel];
  // A raw/ folder guide is a note for the repository's keepers: shown in the GitHub view, never a page here.
  if (/^raw\/(.+\/)?README\.md$/.test(rel)) return null;
  // The skills render on How it works, one section each.
  const skill = rel.match(/^\.agents\/skills(?:\/([^/]+)(?:\/SKILL\.md)?)?$/);
  if (skill) return skill[1] ? `/how-it-works/#skill-${skill[1]}` : '/how-it-works/#skills';
  const tree = rel.split('/')[0];
  if (!TREES.includes(tree)) return null;
  if (dirs.has(rel)) return rel === tree ? `/${tree}/` : `/${tree}/${idOf(rel)}/`;
  if (!files.has(rel)) return null;
  if (rel.endsWith('.md')) return `/${tree}/${idOf(rel)}/`;
  return outsideUrl(rel);
}

// The public Google Drive hosts the originals, not this site (user, Nov. 2, 2026). An original opens its Drive copy,
// else the address its Markdown copy was downloaded from; null when it has neither.
export function outsideUrl(rel) {
  const md = copyOf(rel);
  if (!md) return null;
  const fm = readWiki(md).split('\n---', 2)[0];
  return driveHref(routeOf(md)) ?? fm.match(/^(?:url|sourceUrl):\s*"?([^"\n]+?)"?\s*$/m)?.[1] ?? null;
}

// Resolve a markdown href written in file `fromRel`. Returns {external} or {target, route}.
export function resolveHref(fromRel, href) {
  if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//')) return { external: true };
  if (href.startsWith('#')) return { external: true }; // same-page anchor
  if (href.startsWith('/')) return { foreign: true, target: href }; // root link of a downloaded page's own site
  let [p, hash] = href.split('#');
  try { p = decodeURIComponent(p); } catch { /* keep as written */ }
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), p)).replace(/\/$/, '');
  const route = routeOf(target);
  return { target, route: route && hash && !route.includes('#') ? `${route}#${hash}` : route };
}

export const LINK_RE = /\[((?:[^\[\]]|\[[^\]]*\])*)\]\(([^)\s]+)\)/g;

// Internal link targets in a markdown body: [{target, route}] for every relative link.
export function linksIn(fromRel, body) {
  const out = [];
  for (const m of body.matchAll(LINK_RE)) {
    const r = resolveHref(fromRel, m[2]);
    if (!r.external && !r.foreign) out.push(r);
  }
  return out;
}

// ---- small markdown pieces for tables and lists (cells, bullets) ----

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Inline markdown -> HTML: links (resolved), `code`, **bold**, *em*. Everything else is escaped text.
export function inline(md, fromRel) {
  const parts = [];
  let last = 0;
  for (const m of md.matchAll(LINK_RE)) {
    parts.push(fmt(md.slice(last, m.index)));
    const r = resolveHref(fromRel, m[2]);
    const label = fmt(m[1]);
    if (r.external) parts.push(`<a href="${esc(m[2])}" rel="noopener">${label}</a>`);
    else if (r.foreign) parts.push(`<span class="missing-link" title="Link on the original web page: ${esc(m[2])}">${label}</span>`);
    else if (r.route) parts.push(`<a href="${esc(r.route)}">${label}</a>`);
    else parts.push(`<span class="missing-link" title="Not in the mirror: ${esc(r.target)}">${label}</span>`);
    last = m.index + m[0].length;
  }
  parts.push(fmt(md.slice(last)));
  return parts.join('');
}
function fmt(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>');
}

// Bulleted section -> HTML list (one level), for "Bottom line" excerpts.
export function bullets(md, fromRel) {
  const items = md.split('\n').filter((l) => /^\s*[-*] /.test(l)).map((l) => `<li>${inline(l.replace(/^\s*[-*] /, ''), fromRel)}</li>`);
  return items.length ? `<ul>${items.join('')}</ul>` : `<p>${inline(md.trim(), fromRel)}</p>`;
}

// Body of the `## <heading>` section (up to the next ## heading), or ''.
export function section(body, heading) {
  const lines = body.split('\n');
  const i = lines.findIndex((l) => l.replace(/^##\s+/, '').trim() === heading && /^##\s/.test(l));
  if (i < 0) return '';
  const j = lines.findIndex((l, k) => k > i && /^##?\s/.test(l));
  return lines.slice(i + 1, j < 0 ? undefined : j).join('\n').trim();
}

// An entity page's evidenced relationships: each bullet of its
// Affiliations and Connection sections, as {section, chain, how, text, cite}.
//   chain: the entity pages the bullet links, in order (wiki/entities/... paths). On the page, a chain ends at the page.
//   how:   the bullet's words after "Name:" with the citations taken out ("pointed the group to his talk").
//   text:  the whole bullet as plain text, citations kept. cite: the first source link, {label, href}.
// A bullet that links no entity is not a relationship and is left out. Nothing is inferred from names in prose.
export function relationBullets(body, fromRel) {
  const out = [];
  for (const heading of ['Affiliations', 'Connection']) {
    for (const line of section(body, heading).split('\n')) {
      if (!/^\s*[-*] /.test(line)) continue;
      const md = line.replace(/^\s*[-*] /, '');
      const chain = [], cites = [];
      // Source links become a marker, so the parentheses that hold only citations can be cut from `how`.
      const marked = md.replace(LINK_RE, (all, label, href) => {
        const r = resolveHref(fromRel, href);
        if (r.target?.startsWith('wiki/entities/')) { if (r.target !== fromRel && !chain.includes(r.target)) chain.push(r.target); return label; }
        if (!r.external && !r.foreign) cites.push({ label: plain(label), href: r.route });
        return r.external || r.foreign ? label : '\u0000';
      });
      if (!chain.length) continue;
      const bare = plain(marked.replace(/\s*\([^()]*\u0000[^()]*\)/g, '').replace(/\u0000/g, '')).replace(/\s+([.,;])/g, '$1');
      const how = (bare.match(/^[^:]{1,160}?:\s+(.+)$/)?.[1] ?? bare).replace(/\.$/, '');
      out.push({ section: heading, chain, how, text: plain(md.replace(LINK_RE, '$1')), cite: cites[0] ?? null });
    }
  }
  return out;
}

// A team page's `## Links` bullets as [{label, href}], outside links only: the profile header's link row.
export const profileLinks = (body) =>
  [...section(body, 'Links').matchAll(LINK_RE)].filter((m) => /^https?:\/\//.test(m[2])).map((m) => ({ label: plain(m[1]), href: m[2] }));

// First GFM table in `md` -> {headers, rows: [{Header: cellMarkdown}]}.
export function parseTable(md) {
  const lines = md.split('\n');
  const start = lines.findIndex((l, i) => l.trim().startsWith('|') && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] || ''));
  if (start < 0) return { headers: [], rows: [] };
  const cells = (l) => l.trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map((c) => c.trim());
  const headers = cells(lines[start]);
  const rows = [];
  for (let i = start + 2; i < lines.length && lines[i].trim().startsWith('|'); i++) {
    const c = cells(lines[i]);
    rows.push(Object.fromEntries(headers.map((h, k) => [h, c[k] ?? ''])));
  }
  return { headers, rows };
}

export const plain = (md) => md.replace(LINK_RE, '$1').replace(/\*\*|`/g, '').trim();
export const countLinks = (md) => [...md.matchAll(LINK_RE)].length;

// Flags: blockquotes that open with ⚠️ / 🔍 / 💡 (AGENTS.md, "Links and syntax").
export const FLAG_KINDS = { '⚠️': 'Contradiction', '🔍': 'Gap', '💡': 'Connection' };
export function flagsIn(body) {
  const out = [];
  const lines = body.split('\n');
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('```')) inFence = !inFence;
    const m = !inFence && lines[i].match(/^>\s*(⚠️|🔍|💡)\s*(.*)$/u);
    if (!m) continue;
    const text = [m[2]];
    while (i + 1 < lines.length && /^>/.test(lines[i + 1]) && !/^>\s*(⚠️|🔍|💡)/u.test(lines[i + 1])) text.push(lines[++i].replace(/^>\s?/, ''));
    out.push({ kind: FLAG_KINDS[m[1]], text: text.join(' ').trim().replace(/^(Contradiction|Gap|Connection):\s*/, '') });
  }
  return out;
}


// Python literal by NAME from a script (strings, tuples, dicts of strings, re.compile(r"...")).
// Used so the How-it-works page shows what the wiki's scripts actually say.
export function pyconst(src, name) {
  const m = src.match(new RegExp(`^${name}\\s*=\\s*`, 'm'));
  if (!m) return undefined;
  let i = m.index + m[0].length;
  const rc = src.slice(i).match(/^re\.compile\(r?("|')((?:\\.|(?!\1).)*)\1/);
  if (rc) return rc[2];
  const open = src[i];
  if (!'({["\''.includes(open)) return undefined;
  if (open === '"' || open === "'") return src.slice(i).match(/^("|')((?:\\.|(?!\1).)*)\1/)[2];
  let depth = 0, j = i, q = null, body = '';
  for (; j < src.length; j++) {
    const c = src[j];
    if (q) { body += c; if (c === '\\') body += src[++j]; else if (c === q) q = null; continue; }
    if (c === '#') { while (j + 1 < src.length && src[j + 1] !== '\n') j++; continue; } // comment
    body += c;
    if (c === '"' || c === "'") q = c;
    else if ('({['.includes(c)) depth++;
    else if (')}]'.includes(c) && --depth === 0) break;
  }
  const strs = [...body.matchAll(/"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/g)].map((x) => x[1] ?? x[2]);
  if (open === '{' && /:\s*["']/.test(body)) {
    const obj = {};
    for (let k = 0; k + 1 < strs.length; k += 2) obj[strs[k]] = strs[k + 1];
    return obj;
  }
  return strs;
}

export const readWiki = (rel) => fs.readFileSync(path.join(WIKI, rel), 'utf8');
export const readJson = (rel) => { try { return JSON.parse(readWiki(rel)); } catch { return null; } };
export const mtime = (rel) => { try { return fs.statSync(path.join(WIKI, rel)).mtime; } catch { return null; } };

export function wikiCommit() {
  try { return execFileSync('git', ['-C', WIKI, 'log', '-1', '--format=%h %cs'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'no commits yet'; }
  catch { return 'no commits yet'; }
}

export const day = (d) => (d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d).slice(0, 10) : '');
// A page's date for search sort and folder tables: the first frontmatter date, else a YYYY-MM-DD in the file name.
// No file mtime: a fresh checkout would date every page today.
export const pageDate = (data = {}, rel = '') =>
  [data.updated, data.modified, data.fetched, data.date, data.published, data.publishedDate, data.pulled, data.created, rel.split('/').pop()]
    .map((v) => (v instanceof Date ? v.toISOString() : String(v ?? '')).match(/\d{4}-\d\d-\d\d/)?.[0]).find(Boolean) ?? '';

// Parsed table -> FilterTable rows; chipCols become filter values.
export function toRows(table, fromRel, chipCols = []) {
  const val = (h, cell) => (h === 'Elements' ? plain(cell).split(/[,\s]+/).filter(Boolean) : [plain(cell) || 'blank']);
  return table.rows.map((r) => ({
    cells: Object.fromEntries(table.headers.map((h) => [h, inline(r[h] || '', fromRel)])),
    values: Object.fromEntries(chipCols.map((h) => [h, val(h, r[h] || '')])),
  }));
}

// How a Drive name becomes a folder name under raw/drive/.
export const driveSafe = (name) => name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '-').replace(/^[ .]+|[ .]+$/g, '').slice(0, 120) || 'untitled';

// raw/ folders: a short label for page eyebrows, and the description shown on How it works.
export const RAW_FOLDERS = {
  legislative: ['statute', 'The statute and the legislative record, word for word.'],
  web: ['original document', 'Government documents and open-licensed files downloaded with bin/grab.py: every source added since the library started.'],
  shared: ['original document', "Government documents and open-licensed files the consortium's research used before the library started."],
  human: ['written by a person', 'Documents that people wrote and sent to the library.'],
  drive: ['Drive listing', 'What is in the public Google Drive, written by bin/drive_push.py.'],
};

// A raw original the library may serve: its Markdown copy says rehost: yes (AGENTS.md, "Rehost only what may be
// rehosted"), or it is in raw/legislative/, which holds only government text.
// The Markdown copy of an original: same name, or the .md whose `original:` names it.
export function copyOf(rel) {
  const md = rel.replace(/\.[^./]+$/, '.md');
  return files.has(md) ? md : [...files].find((f) => f.endsWith('.md') && f.startsWith(path.posix.dirname(rel) + '/') && /^---[\s\S]*?\noriginal: (.+)\n/m.exec(readWiki(f))?.[1]?.trim() === path.posix.basename(rel)) ?? null;
}

export function rehosted(rel) {
  if (rel.startsWith('raw/legislative/')) return true;
  const sibling = copyOf(rel);
  return Boolean(sibling && /^rehost: yes$/m.test(readWiki(sibling).split('\n---', 2)[0]));
}

// ---- full legislative copies render here (user, Nov. 6, 2026) ----
// A raw/legislative/ file without `excerpt_lines:` is a full copy, word for word (raw/legislative/README.md). Its
// page is the document, so it renders here with its Drive PDF linked; an excerpt still opens in the Drive.
export const isExcerpt = (rel) => /^excerpt_lines:/m.test(readWiki(rel).split('\n---', 2)[0]);
let hereRoutes;
export function rendersHere(route) {
  hereRoutes ??= new Set([...files].filter((f) => /^raw\/legislative\/[^/]+\.md$/.test(f) && !f.endsWith('/README.md') && !isExcerpt(f)).map(routeOf));
  return hereRoutes.has(String(route ?? '').split('#')[0]);
}

// ---- the Drive's own links: humans go to the Drive, never to the mirror's copy, except a full legislative copy ----
// raw/drive/.listing.json (bin/drive_pull.py write_listing) lists every Drive item, with the Markdown copy the
// pull made of it. Route of each copy, and of each pulled Drive folder, -> its Drive URL.
let driveLinks;
export function driveHref(route) {
  if (!driveLinks) {
    driveLinks = new Map();
    const listing = readJson('raw/drive/.listing.json') || [];
    const folders = readJson('raw/drive/.folders.json') || {};
    for (const x of listing) {
      const rel = x.copy ?? (x.folder ? `raw/drive/${[...x.path.split('/'), x.name].map(driveSafe).join('/')}` : null);
      const r = rel && routeOf(rel);
      if (r && x.url) driveLinks.set(r, x.url);
    }
    for (const [p, id] of Object.entries(folders)) if (!p.includes('/')) {
      const r = routeOf(`raw/drive/${driveSafe(p)}`);
      if (r) driveLinks.set(r, `https://drive.google.com/drive/folders/${id}`);
    }
  }
  return driveLinks.get(String(route ?? '').split('#')[0]) ?? null;
}

// Every href="<route of a Drive copy>" in a page's HTML -> the Drive URL, opened in a new tab. A full legislative
// copy keeps its href: it renders here.
export const linkOutToDrive = (html) =>
  html.replace(/href="(\/raw\/[^"#]*)(#[^"]*)?"/g, (m, r) => { const u = !rendersHere(r) && driveHref(r); return u ? `href="${u}" target="_blank" rel="noopener"` : m; });

// ---- covers: page one of a PDF, rendered by scripts/covers.mjs into public/covers/ (user, Nov. 6, 2026) ----
// A local original is keyed by its path. An online-only PDF (rehost: no, url ends in .pdf) is keyed by its source
// page: the script fetches it into .cache/ and keeps only the thumbnail.
export const coverOf = (pdf) => `/covers/${idOf(pdf.replace(/\.pdf$/i, ''))}.webp`;
export const remoteCoverOf = (sourceRel) => `/covers/${idOf(sourceRel)}.webp`;
export const remotePdfSources = () => [...files].filter((f) => f.startsWith('wiki/sources/') && f.endsWith('.md')).flatMap((rel) => {
  const fm = readWiki(rel).split('\n---', 2)[0];
  const url = fm.match(/^url:\s*"?([^"\n]+?)"?\s*$/m)?.[1];
  return /^rehost: no$/m.test(fm) && /\.pdf(\?|$)/i.test(url ?? '') ? [{ rel, url }] : [];
});
