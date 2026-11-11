// The California Compute Directory's records, read from the library's directory page and its federal and state
// programs page as written (../library-wiki). The directory page and the home page's section both use them.
// A cell may hold several values, separated by "; " (library-wiki AGENTS.md, Directory page).
import { parseTable, inline, plain, slugSeg, resolveHref, LINK_RE } from './wiki.js';
import { markForEntity } from './brand.js';

const rowsOf = (p) => (p ? parseTable(p.body).rows : []);
const list = (cell) => plain(cell || '').split(/\s*;\s*/).filter(Boolean);
const field = (label, cell, rel) => (plain(cell || '') ? [[label, inline(cell, rel)]] : []);
export const directoryPage = (m) => m.byRel.get('wiki/directories/California AI compute programs and resources.md');
export const institutionsPage = (m) => m.byRel.get('wiki/directories/California research institutions.md');
export const programsPage = (m) => m.byRel.get('wiki/concepts/Federal and state AI compute programs.md');

// One record of components/Directory.jsx: what the card shows (name, meta, summary, tags), what the filters read (kind,
// regions, serves, domains, status) and what the detail panel lists (fields, as HTML with the library's links).
// The address of the record itself, only when it is a plain https address.
const linkOf = (cell) => plain(cell || '').match(/^https:\/\/[^\s<>"']+$/)?.[0] ?? '';
// "Fee (recharge rates)" -> ["Fee", "recharge rates"]
const costOf = (cell) => { const x = plain(cell || '').match(/^([^(]*?)\s*(?:\((.*)\))?$/); return [x?.[1]?.trim() ?? '', x?.[2]?.trim() ?? '']; };
const stated = (cell) => (/^not stated$/i.test(plain(cell || '')) ? '' : cell);

export function directoryRecords(m) {
  const page = directoryPage(m);
  return rowsOf(page).map((r) => {
    const rel = page.rel, regions = list(r['California region']), serves = list(r.Serves), domains = list(r.Domains), offers = list(r.Offers);
    const name = plain(r.Name), kind = plain(r.Kind), status = plain(r.Status), access = plain(r.Access), getAccess = plain(stated(r['Get access']));
    const [cost, costNote] = costOf(r.Cost);
    return {
      id: slugSeg(name), name, kind, regions, serves, domains, offers, status, cost, costNote, getAccess, link: linkOf(r.Link),
      summary: access, tags: offers.length ? offers : domains, checked: plain(r.Checked),
      meta: [kind && kind[0].toUpperCase() + kind.slice(1), regions.length > 2 ? `${regions.length} regions` : regions.join(', ')].filter(Boolean),
      text: [name, kind, access, getAccess, status, cost, ...regions, ...serves, ...domains, ...offers].join(' ').toLowerCase(),
      fields: [...field('Who can use it', r.Access, rel), ...field('What you get', offers.join(', '), rel), ...field('Cost', stated(r.Cost), rel), ...field('How to get access', stated(r['Get access']), rel),
        ...field('Topics', offers.length ? domains.join(', ') : '', rel), ...field('Region', regions.join(', '), rel), ...field('Evidence', r.Sources, rel)],
    };
  });
}
// What a visitor can use, and the rest: the research projects and the organizations.
export const USABLE = ['resource', 'program'];

// The programs and resources as plain text, for CaliforniaCompute.org's California Compute Directory, which reads them
// when it builds (pages/directory.json.ts). A value the sources do not state is empty. Each source is its title and its
// address: its page in this library, from `origin`, or its own address. The order is by stated facts, what is
// operating first, then what is free; the directory does not rate a record.
const STATUS_ORDER = ['operating', '', 'funded', 'selected', 'announced', 'paused', 'closed', 'historical'];
const COST_ORDER = ['Free', 'Credits', 'Fee', ''];
const unstated = (v) => (/^not stated$/i.test(v) ? '' : v);
export function serviceRecords(m, origin) {
  const page = directoryPage(m);
  const sources = new Map(rowsOf(page).map((r) => [slugSeg(plain(r.Name)), [...(r.Sources || '').matchAll(LINK_RE)].map(([, title, href]) => {
    const x = resolveHref(page.rel, href);
    return { title: plain(title), href: x.external ? href : x.route && origin + x.route };
  }).filter((s) => s.href)]));
  return directoryRecords(m).filter((r) => USABLE.includes(r.kind))
    .map(({ id, name, kind, regions, serves, offers, status, cost, costNote, summary, getAccess, link, checked }) =>
      ({ id, name, kind, regions, serves, offers, status, cost: unstated(cost), costNote, access: unstated(summary), getAccess, link, checked, sources: sources.get(id) ?? [] }))
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) || COST_ORDER.indexOf(a.cost) - COST_ORDER.indexOf(b.cost) || a.name.localeCompare(b.name));
}

export function programRecords(m) {
  const page = programsPage(m);
  return rowsOf(page).map((r) => {
    const rel = page.rel, name = plain(r.Program), body = plain(r.Body), funds = plain(r['What it funds']);
    return {
      id: slugSeg(name), name, kind: '', regions: [], serves: [], domains: [], offers: [], status: '', cost: '', link: '', summary: funds, tags: [], checked: '',
      meta: [body].filter(Boolean),
      text: [name, body, funds, plain(r.Amount), plain(r.Dates), plain(r.Status)].join(' ').toLowerCase(),
      fields: [...field('What it funds', r['What it funds'], rel), ...field('Amount', r.Amount, rel), ...field('Dates', r.Dates, rel), ...field('Status', r.Status, rel), ...field('Evidence', r.Sources, rel)],
    };
  });
}

// The research institutions page: California's colleges and universities with a 2025 Carnegie research designation,
// and the three DOE national laboratories. Kind is the designation's short name, the filter and the pin's colour;
// Domain is the control. Each record links to its entity page and, when the row gives coordinates, carries its pin
// (x, y) on the region map, placed by the map's own projection (data/ca-regions.json, proj).
export const DESIGNATIONS = ['Research 1', 'Research 2', 'Research Colleges and Universities', 'National laboratory'];
const RAD = Math.PI / 180;
export const pinAt = ({ scale, translate: [tx, ty] }, lat, lon) =>
  [tx + scale * lon * RAD, ty - scale * Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2))];
// Pins that would cover each other move to the nearest free spot on a ring around their true place, in order of
// designation, so an R1 campus keeps its spot. The pass CaliforniaCompute.org's map uses (CampusMap.astro). Map units.
const GAP = 7;
function spread(recs) {
  const placed = [];
  for (const r of [...recs].sort((a, b) => DESIGNATIONS.indexOf(a.kind) - DESIGNATIONS.indexOf(b.kind))) {
    const free = (x, y) => placed.every((q) => Math.hypot(x - q.x, y - q.y) >= GAP - 0.01);
    if (!free(r.x, r.y)) {
      const [ox, oy] = [r.x, r.y];
      search: for (let ring = 1; ring <= 4; ring++)
        for (let step = 0; step < 16; step++) {
          const a = (step / 16) * 2 * Math.PI, x = ox + Math.cos(a) * GAP * ring, y = oy + Math.sin(a) * GAP * ring;
          if (free(x, y)) { r.x = x; r.y = y; break search; }
        }
    }
    placed.push(r);
  }
}

export function institutionRecords(m, map) {
  const page = institutionsPage(m);
  if (!page) return [];
  const recs = rowsOf(page).map((r) => {
    const rel = page.rel, name = plain(r.Name), designation = plain(r.Designation), kind = designation.split(':')[0].trim();
    const control = plain(r.Control), city = plain(r.City), regions = list(r['California region']);
    const href = r.Name.match(/\]\(([^)]+)\)/)?.[1];
    const lat = parseFloat(plain(r.Latitude || '')), lon = parseFloat(plain(r.Longitude || ''));
    const [x, y] = Number.isFinite(lat) && Number.isFinite(lon) && map?.proj ? pinAt(map.proj, lat, lon) : [null, null];
    return {
      id: slugSeg(name), name, kind, regions, serves: [], domains: control ? [control] : [], offers: [], status: '', cost: '', link: '',
      summary: '', tags: control ? [control] : [], checked: plain(r.Checked), mark: markForEntity(name), page: href ? resolveHref(rel, href).route : null, x, y,
      meta: [kind, city].filter(Boolean),
      text: [name, designation, control, city, ...regions].join(' ').toLowerCase(),
      fields: [...field('Designation', r.Designation, rel), ...field('Control', r.Control, rel), ...field('City', r.City, rel), ...field('Region', regions.join(', '), rel),
        ...field('Website', r.Link, rel), ...field('In the library', r.Name, rel), ...field('Evidence', r.Sources, rel)],
    };
  });
  spread(recs.filter((r) => r.x !== null));
  return recs;
}

// How many public source pages the directory's records cite.
export const directorySources = (m) => new Set(rowsOf(directoryPage(m)).flatMap((r) => [...(r.Sources || '').matchAll(/\]\(([^)]+)\)/g)].map((x) => x[1]))).size;
