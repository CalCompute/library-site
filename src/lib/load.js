// Build-time model of the library: every page, the link graph, and the tables the views read.
// Computed once per build (module cache). Everything here is read from ../library-wiki as it is.
import path from 'node:path';
import { getCollection } from 'astro:content';
import { WIKI, files, routeOf, linksIn, parseTable, section, plain, flagsIn, readWiki, readJson, wikiCommit, driveHref, rendersHere, day, copyOf, outsideUrl, coverOf, remoteCoverOf, remotePdfSources } from './wiki.js';
import { photoFor, markForEntity } from './brand.js';
import { todayPT } from './calendar.js';

export const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
// The catalog pages that link to nearly everything. In the graph data; hidden in the default view.
const HUBS = new Set(['wiki/index.md', 'wiki/log.md']);
// AGENTS.md: "`raw/` holds the original documents. You never change them. `wiki/` holds the pages you write."
const agentEditable = (rel) => rel.startsWith('wiki/');

const relOf = (filePath) => path.relative(WIKI, path.resolve(filePath)).split(path.sep).join('/');
const firstH1 = (body) => body.match(/^#\s+(.+)$/m)?.[1]?.trim();

let cache;
const emptyModel = () => ({ pages: [], byRel: new Map(), byRoute: new Map(), byTitle: new Map(), linksOut: new Map(), linksIn: new Map(), unresolved: [], graph: { nodes: [], edges: [] }, elements: [], requirements: { headers: [], rows: [] }, members: [], teamNames: new Set(), entityFor: () => null, sourceInfo: new Map(), sourcesTable: { headers: [], rows: [] }, flags: [], status: { entries: [] }, meta: [], folders: {}, activity: { stats: [], items: [], calendar: [] }, calendar: { today: '', items: [] }, groups: [] });
export async function load() {
  if (cache) return cache;
  const [w, r, meta] = await Promise.all([getCollection('wiki'), getCollection('raw'), getCollection('meta')]);

  const pages = [...w, ...r].filter((entry) => files.has(relOf(entry.filePath))).map((entry) => {
    const rel = relOf(entry.filePath);
    const tree = rel.split('/')[0];
    const data = entry.data || {};
    return {
      entry, rel, tree, data,
      body: entry.body || '',
      route: routeOf(rel),
      title: String(data.title ?? firstH1(entry.body || '') ?? path.basename(rel, '.md')),
      // wiki pages: frontmatter type; raw pages: their top folder (legislative, web, shared ...)
      type: tree === 'wiki' ? String(data.type ?? 'page') : /^raw\/(.+\/)?README\.md$/.test(rel) ? 'readme' : rel.split('/')[1],
      readme: /^raw\/(.+\/)?README\.md$/.test(rel),
    };
  });
  const byRel = new Map(pages.map((p) => [p.rel, p]));
  const byRoute = new Map(pages.filter((p) => p.route).map((p) => [p.route, p])); // folder guides have no route
  const byTitle = new Map(pages.filter((p) => p.tree === 'wiki').map((p) => [p.title.toLowerCase(), p]));
  if (!pages.length) { console.warn(`[wiki] no pages found under ${WIKI}; restart astro dev if its content cache was deleted`); return emptyModel(); }
  const dupes = pages.filter((p) => p.route).length - byRoute.size;
  if (dupes) throw new Error(`${dupes} pages share a route; check slugSeg`);

  // ---- link graph ----
  const linksOut = new Map(), linksIn_ = new Map(), unresolved = [];
  const add = (m, k, v) => { const a = m.get(k) ?? []; if (!a.includes(v)) a.push(v); m.set(k, a); };
  for (const p of pages) {
    for (const l of linksIn(p.rel, p.body)) {
      if (!l.route) { unresolved.push({ from: p.rel, target: l.target }); continue; }
      const t = byRoute.get(l.route.split('#')[0]);
      if (t && t !== p) { add(linksOut, p.rel, t.rel); add(linksIn_, t.rel, p.rel); }
    }
  }
  const folders = readJson('raw/drive/.folders.json') || {};

  // Ring 1: the seven element reading lists. Ring 2: the checklist and the overview.
  const isHubOfElement = (p) => p.tree === 'wiki' && p.data.type === 'element';
  const ring = (p) => isHubOfElement(p) ? 1 : p.rel.startsWith('wiki/elements/') || p.rel === 'wiki/overview.md' ? 2 : p.tree === 'wiki' ? 3 : 4;
  const imgOf = (p) => {
    if (p.type !== 'entity') return null;
    const photo = p.data.photo || photoFor(p.title);
    return photo ? { img: photo, imgKind: 'photo' } : markForEntity(p.title) ? { img: markForEntity(p.title), imgKind: 'mark' } : null;
  };
  // An original's node leaves the site (user, Nov. 2, 2026): its copy in the public Drive when it has one, else the
  // document's own web address from the raw copy's frontmatter. Wiki pages keep their page.
  const outboundOf = (p) => (p.tree === 'raw' && !p.readme ? String(p.data.url || p.data.sourceUrl || '').trim() || null : null);
  const nodes = pages.filter((p) => p.route).map((p) => { // folder guides have no page, so no node
    const im = imgOf(p);
    const here = rendersHere(p.route); // a full legislative copy: opens its own page
    const drive = here ? null : driveHref(p.route); // in the public Drive: drawn as a square, and opens there
    return {
      id: p.route, href: here ? undefined : drive ?? outboundOf(p) ?? undefined, label: p.title, desc: `${p.type} · ${p.rel}`, group: p.tree, type: p.type, system: drive ? 'drive' : 'repo',
      size: Math.max(Math.min(p.body.length, 20000), im ? 6000 : 0), ring: ring(p), hub: HUBS.has(p.rel), ...(im ?? {}),
    };
  });
  const REPORT_ID = '#report';
  nodes.push({ id: REPORT_ID, href: null, label: 'Framework Report', group: 'report', type: 'report', system: 'repo', size: 20000, ring: 0, hub: false, drafted: [],
    desc: 'The Report the statute asks for. Its seven elements are the reading lists.' });
  const edges = [], seen = new Set();
  for (const [a, ts] of linksOut) for (const b of ts) {
    const [x, y] = [byRel.get(a).route, byRel.get(b).route];
    const k = x < y ? `${x}|${y}` : `${y}|${x}`;
    if (seen.has(k)) continue;
    seen.add(k);
    // A flow: data moves out of an original document into a wiki page that uses it. Every other link is plain.
    const ea = agentEditable(a), eb = agentEditable(b);
    if (ea !== eb) edges.push(ea ? { source: y, target: x, kind: 'flow' } : { source: x, target: y, kind: 'flow' });
    else edges.push({ source: x, target: y });
  }
  for (const h of pages.filter(isHubOfElement)) edges.push({ source: REPORT_ID, target: h.route, kind: 'report' });

  // ---- the consortium's communications, as markers (activity.json; AGENTS.md, "Consortium communications appear as markers") ----
  // One node for each call, email thread and chat topic, with its kind, shape, size, ring and date
  // only. No page: graph.astro and the graph never link it.
  const act = readJson('activity.json') ?? { stats: [], nodes: [], edges: [], calendar: [] };
  const LABEL = { calls: 'Call', email: 'Email thread', zulip: 'Zulip topic', meet: 'Call' }; // a call's Meet chat is part of the call
  const short = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const marked = new Set();
  for (const n of act.nodes ?? []) {
    const id = `#${n.id}`;
    marked.add(id);
    nodes.push({ id, label: `${LABEL[n.type] ?? n.type}${n.date ? ` · ${short(n.date)}` : ''}`,
      desc: `Consortium communication${n.date ? ` · ${n.date}` : ''}`,
      group: 'consortium', type: n.type, system: n.system, size: n.size, ring: n.ring, hub: false, static: true });
  }
  const endOf = (x) => (x.startsWith('t:') ? byTitle.get(x.slice(2).toLowerCase())?.route : x.startsWith('r:') ? byRel.get(x.slice(2))?.route : `#${x}`);
  const isNode = (r) => r && (marked.has(r) || byRoute.has(r));
  const tied = new Set();
  for (const e of act.edges ?? []) {
    const a = endOf(e.a), b = endOf(e.b);
    if (!isNode(a) || !isNode(b)) continue;
    const k = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (seen.has(k)) continue;
    seen.add(k);
    edges.push(e.kind === 'flow' ? { source: a, target: b, kind: 'flow' } : { source: a, target: b });
    tied.add(a); tied.add(b);
  }
  for (const id of marked) if (!tied.has(id)) edges.push({ source: id, target: REPORT_ID });
  // The Suggestions page is not research: it stays out of the graph (user, Nov. 2, 2026).
  const off = new Set(pages.filter((p) => p.rel === 'wiki/analyses/Suggestions.md').map((p) => p.route));
  const graph = { nodes: nodes.filter((n) => !off.has(n.id)), edges: edges.filter((e) => !off.has(e.source) && !off.has(e.target)) };

  // ---- report spine: statute and reading lists ----
  const statute = readWiki('raw/legislative/SB-53 Gov Code 11546.8.md');
  const f1 = statute.match(/\(f\)\s*\(1\)\s*([^\n]+)/)?.[1]?.trim();
  const elementText = Object.fromEntries(LETTERS.map((L) => [L, statute.match(new RegExp(`>\\s*>\\s*\\(${L}\\)\\s*([^\\n]+)`))?.[1]?.trim()]));
  const elements = LETTERS.map((L) => {
    const hub = pages.find((p) => p.rel.startsWith('wiki/elements/') && p.data.element === L);
    return { L, hub, text: elementText[L], count: hub ? Number(hub.data.source_count) || 0 : 0 };
  });
  // ---- shelves on /library/: each reading list's sources that have a PDF, with its cover (scripts/covers.mjs) ----
  const pdfByCopy = new Map([...files].filter((f) => /\.pdf$/i.test(f)).map((f) => [copyOf(f), f]));
  const remote = new Map(remotePdfSources().map((s) => [s.rel, s.url]));
  // A cover and where it opens: the original in the Drive or at its publisher (outsideUrl), or an online-only PDF's url.
  const coverFor = (r) => { const pdf = pdfByCopy.get(evidenceOf({ linksOut }, r)); return pdf ? { src: coverOf(pdf), href: outsideUrl(pdf) } : remote.has(r) ? { src: remoteCoverOf(r), href: remote.get(r) } : null; };
  // Every page that shows a cover (Page.astro): each source page with a PDF, and each PDF's Markdown copy.
  const covers = new Map([...pdfByCopy].filter(([copy]) => copy).map(([copy, pdf]) => [copy, { src: coverOf(pdf), href: outsideUrl(pdf) }]));
  for (const p of pages) if (p.data.type === 'source' && coverFor(p.rel)) covers.set(p.rel, coverFor(p.rel));
  // When the team surfaced a source (user, Nov. 6, 2026): its page's `created`, which the seed carried over from the
  // research wiki, or the date its evidence file is named with when that is earlier (sources shared before that wiki began).
  const addedOf = (r) => [day(byRel.get(r).data.created), path.posix.basename(evidenceOf({ linksOut }, r) ?? '').match(/^\d{4}-\d\d-\d\d/)?.[0]].filter(Boolean).sort()[0] ?? '';
  // Most recent first; a tie keeps the reading list's order.
  const shelves = elements.filter((e) => e.hub).map((e) => ({ ...e, books: (linksOut.get(e.hub.rel) ?? [])
    .filter((r) => r.startsWith('wiki/sources/') && coverFor(r))
    .map((r) => ({ title: byRel.get(r).title, route: byRel.get(r).route, cover: coverFor(r).src, added: addedOf(r) }))
    .sort((a, b) => b.added.localeCompare(a.added)) }));
  const checklist = byRel.get('wiki/elements/Statutory requirements.md');
  const requirements = checklist ? parseTable(section(checklist.body, 'Checklist')) : { headers: [], rows: [] };

  // ---- the team: the entity pages with member: yes, in californiacompute.org's groups ----
  const members = pages.filter((p) => p.tree === 'wiki' && p.data.type === 'entity' && p.data.member)
    .map((p) => ({ name: p.title, group: p.data.group ?? 'consortium', order: Number(p.data.order ?? 999), position: p.data.position ?? '', photo: p.data.photo || null, institution: p.data.institution ?? '', role: p.data.role ?? '', profile: p.data.profile ?? '', page: p }))
    .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));
  // Two rows (user, Nov. 2, 2026): the consortium, supporting researchers and operations team with no title, then the
  // government advocates and Legislative champions under one.
  const groups = [[null, ['consortium', 'supporting', 'operations']], ['Government champions', ['advocates', 'legislative']]]
    .map(([label, ks]) => [label, ks.flatMap((k) => members.filter((x) => x.group === k))]).filter(([, list]) => list.length);
  const teamNames = new Set(members.map((x) => x.name));
  const entityFor = (name) => byTitle.get(name.toLowerCase());

  // Sources table in index.md: origin / tier / summary per source page.
  const index = byRel.get('wiki/index.md');
  const sourcesTable = index ? parseTable(section(index.body, (index.body.match(/^## (Sources.*)$/m) || [])[1] || 'Sources')) : { headers: [], rows: [] };
  const sourceInfo = new Map();
  for (const row of sourcesTable.rows) {
    const t = linksIn('wiki/index.md', row.Page || '')[0];
    if (t) sourceInfo.set(t.target, { origin: plain(row.Origin), tier: plain(row.Tier), citable: plain(row.Citable ?? ''), summary: row.Summary, date: plain(row.Date) });
  }

  const flags = pages.filter((p) => p.tree === 'wiki').flatMap((p) => flagsIn(p.body).map((f) => ({ ...f, page: p })));

  // ---- log ----
  const log = byRel.get('wiki/log.md')?.body || '';
  const entries = [...log.matchAll(/^## \[(\d{4}-\d\d-\d\d)\] (\w+) \| (.+)$\n([\s\S]*?)(?=^## |(?![\s\S]))/gm)].map((x) => ({
    date: x[1], type: x[2], title: x[3].trim(), summary: x[4].match(/^- Summary: (.+)$/m)?.[1] ?? '' }));
  const status = {
    lastLog: entries.at(-1) ?? null, logCount: entries.length, entries,
    indexUpdated: index?.body.match(/_Last updated: ([^_]+)_/)?.[1],
    built: new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC',
    commit: wikiCommit(),
  };

  // ---- calendar: element calls and the community sync, with status against today in Pacific ----
  const today = todayPT();
  const calendar = { today, items: (act.calendar ?? []).map((e) => ({ ...e,
    status: e.cancelled ? 'cancelled' : e.date < today ? 'held' : e.date === today ? 'today' : 'upcoming' })) };

  // ---- hero counts: activity.json's, with every community sync held added to the person-hours ----
  // No sync is transcribed, so the export cannot count them. Assume the whole consortium and operations team on each
  // (user, Nov. 2, 2026): held syncs x their length x those members.
  const hours = (t) => { const [h, mm] = t.split(':').map(Number); return h + mm / 60; };
  const syncHours = calendar.items.filter((e) => e.track === 'sync' && e.status === 'held' && e.start && e.end)
    .reduce((n, e) => n + hours(e.end) - hours(e.start), 0) * members.filter((x) => ['consortium', 'operations'].includes(x.group)).length;
  const stats = (act.stats ?? []).map(([n, label]) => (label === 'person-hours on calls'
    ? [n + Math.round(syncHours), label, 'Transcribed element calls, plus the consortium and operations team on every community sync held.'] : [n, label]));

  const fromWiki = unresolved.filter((u) => u.from.startsWith('wiki/'));
  console.log(`[wiki] ${pages.filter((p) => p.tree === 'wiki').length} wiki pages, ${pages.filter((p) => p.tree === 'raw').length} raw pages, ` +
    `${graph.nodes.length} nodes, ${graph.edges.length} edges, ${unresolved.length} relative links point outside the mirror (${fromWiki.length} from wiki pages)`);
  for (const t of [...new Set(unresolved.map((u) => u.target))].sort()) console.log(`[wiki]   not in the mirror: ${t} (from ${unresolved.filter((u) => u.target === t).map((u) => u.from).slice(0, 2).join('; ')})`);

  cache = {
    pages, byRel, byRoute, byTitle, linksOut, linksIn: linksIn_, unresolved, graph, REPORT_ID, folders,
    elements, shelves, covers, f1, checklist, requirements, members, groups, teamNames, entityFor, sourceInfo, sourcesTable, flags, status, meta,
    activity: { ...act, stats }, calendar,
  };
  return cache;
}

// Depth-1 neighbourhood of a page, for the hero graph.
export function localGraph(m, rel) {
  const near = new Set([rel, ...(m.linksOut.get(rel) ?? []), ...(m.linksIn.get(rel) ?? [])]);
  const routes = new Set([...near].map((r) => m.byRel.get(r).route));
  return {
    nodes: m.graph.nodes.filter((n) => routes.has(n.id)),
    edges: m.graph.edges.filter((e) => routes.has(e.source) && routes.has(e.target)),
  };
}

// A source page's evidence: the first raw/ file it links to (its Citation names it first).
export const evidenceOf = (m, rel) => (m.linksOut.get(rel) ?? []).find((r) => r.startsWith('raw/') && !r.endsWith('/README.md'));

export const linkList =(m, rels = []) => rels.map((r) => m.byRel.get(r)).map((p) => ({ id: p.route, label: p.title }));

export const folderUrl = (m, suffix) => {
  const id = Object.entries(m.folders).find(([k]) => k.endsWith(suffix))?.[1];
  return id ? `https://drive.google.com/drive/folders/${id}` : null;
};
