// The Landscape, from one list of records (lib/directory.js reads them from the library's directory pages). Two modes:
//   browse  a map of the 13 Jobs First regions with kind and domain filters: the programs and resources, the research
//           projects and organizations, and the research institutions, whose map also carries a pin for each record
//           (`pins`).
//   list    a plain card list with search: the Funding and policy view.
// The map and the region list are two views of the same counts and the same selection. Finding a program to use is
// CaliforniaCompute.org's California Compute Directory, built from the same records (pages/directory.json.ts).
// Filter state lives in the URL hash (lib/hash.js), so a link is a saved view: #region=Bay%20Area&kind=resource&r=<id>
import { useEffect, useMemo, useRef, useState } from 'react';
import { parseHash, toHash } from '../lib/hash.js';

// Records per region, in fixed bins, so a shade means the same count whatever the filters. One hue, light to dark;
// the count is printed on each region, so colour is never the only signal.
export const BINS = [[0, '#dfe3e8', '0'], [1, '#b9dbe3', '1 to 4'], [5, '#7fbccb', '5 to 9'], [10, '#3590a5', '10 to 24'], [25, '#0b5567', '25 or more']];
export const shade = (n) => BINS.findLast(([min]) => n >= min)[1];
export const SHORT = { 'North San Joaquin': 'N. San Joaquin', 'Central San Joaquin': 'C. San Joaquin', 'Kern County': 'Kern', 'Los Angeles County': 'LA', 'Orange County': 'OC' };
export const WIDE = ['Statewide', 'National'];
// Status as a dot and its word, never the dot alone.
const DOT = { operating: '#15803d', announced: '#1295d8', funded: '#1295d8', selected: '#1295d8', paused: '#b45309', closed: '#6b7280', historical: '#6b7280' };
const FACETS = [['region', 'Region'], ['kind', 'Kind'], ['domain', 'Domain'], ['status', 'Status']];
const valuesOf = (r, f) => (f === 'kind' ? [r.kind] : f === 'region' ? r.regions : f === 'domain' ? r.domains : [r.status || 'not stated']);
// The order of the kinds. An order by stated facts; the directory does not rate a record.
export const KINDS = ['resource', 'program', 'organization', 'project'];
const ORDERS = {
  kind: (a, b, kinds) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind),
  name: () => 0,
};
// Pins, one per record with a place (lib/directory.js institutionRecords): colour and shape by kind. The three college
// tiers are UC Blue, Orange and Pink, a set that passes the colour-vision checks on the map's fill; the laboratories
// are UC Dark Blue squares, told apart by shape. Larger for the higher tier. Name, legend and the card list carry the
// identity too, so colour is never the only signal.
export const PIN = {
  'Research 1': { fill: '#1295d8', r: 4 }, 'Research 2': { fill: '#ff6e1b', r: 3.4 },
  'Research Colleges and Universities': { fill: '#e44c9a', r: 2.8 }, 'National laboratory': { fill: '#002033', r: 3.2, square: true },
};
const PIN_FILL = '#eef1f4';
const EMPTY = { q: '', region: [], kind: [], domain: [], status: [], sort: '', r: '' };
const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
// "2 programs"; a noun of several words takes its plural on each: "2 programs or resources".
export const plural = (n, word) => `${n} ${n === 1 ? word : word.replace(/(\w+)( or |$)/g, '$1s$2')}`;

function Tag({ children }) {
  return <span className="rounded border border-gray-200 px-1.5 py-px font-mono text-[10px] uppercase tracking-wide text-gray-500">{children}</span>;
}
function Status({ value }) {
  if (!value) return null;
  return <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: DOT[value] ?? '#9ca3af' }} aria-hidden="true" />{cap(value)}</span>;
}
function Chip({ on, count, onClick, children }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick} disabled={!count && !on}
      className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-uc-blue-dark bg-uc-blue-dark text-white' : 'border-gray-300 bg-white text-gray-700 hover:border-gray-500'} disabled:opacity-40 disabled:hover:border-gray-300`}>
      {children} <span className={`font-mono text-xs ${on ? 'text-white/70' : 'text-gray-400'}`}>{count}</span>
    </button>
  );
}
function Go({ item, className = '' }) {
  if (!item.link) return null;
  return <a href={item.link} target="_blank" rel="noopener" className={className}>Go to the {item.kind || 'program'}'s page ↗</a>;
}

// With `pins`, the regions are one light fill under the pins, and their counts stay in the region list below the map.
export function RegionMap({ map, counts, selected, onPick, onHover, pins = null, onPin, onPinHover }) {
  return (
    <svg viewBox={`0 0 ${map.width} ${map.height}`} className="mx-auto block w-full max-w-[21rem]" role="group" aria-label={pins ? "Map of California's 13 Jobs First regions with a pin for each institution. The cards list the same institutions." : "Map of California's 13 Jobs First regions. The region list below gives the same counts."}>
      {map.regions.map((g) => {
        const on = selected === g.name, n = counts[g.name] ?? 0;
        return (
          <path key={g.name} d={g.d} fill={pins ? PIN_FILL : shade(n)} stroke="white" strokeWidth="1.5" strokeLinejoin="round"
            className="cursor-pointer outline-none transition-opacity hover:opacity-80 focus-visible:opacity-80"
            opacity={selected && !on ? 0.45 : 1} role="button" tabIndex={0} aria-pressed={on} aria-label={`${g.name}, ${plural(n, 'record')}`}
            onClick={() => onPick(g.name)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(g.name); } }}
            onMouseEnter={() => onHover(g.name)} onMouseLeave={() => onHover(null)} onFocus={() => onHover(g.name)} onBlur={() => onHover(null)} />
        );
      })}
      <path d={map.counties} fill="none" stroke="white" strokeWidth="0.4" opacity="0.7" pointerEvents="none" />
      {map.regions.filter((g) => g.name === selected).map((g) => <path key={g.name} d={g.d} fill="none" stroke="#002033" strokeWidth="2" strokeLinejoin="round" pointerEvents="none" />)}
      {pins && pins.map((p) => {
        const s = PIN[p.kind] ?? PIN['Research 1'];
        const act = { role: 'button', tabIndex: 0, 'aria-label': `${p.name}, ${p.kind}`, className: 'cursor-pointer outline-none',
          opacity: p.dim ? 0.2 : 1, stroke: 'white', strokeWidth: 1, fill: s.fill,
          onClick: () => onPin(p.id), onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPin(p.id); } },
          onMouseEnter: () => onPinHover(p), onMouseLeave: () => onPinHover(null), onFocus: () => onPinHover(p), onBlur: () => onPinHover(null) };
        return s.square
          ? <rect key={p.id} x={p.x - s.r} y={p.y - s.r} width={s.r * 2} height={s.r * 2} rx="0.6" {...act} />
          : <circle key={p.id} cx={p.x} cy={p.y} r={s.r} {...act} />;
      })}
      {!pins && map.regions.map((g) => {
        const label = `${SHORT[g.name] ?? g.name} ${counts[g.name] ?? 0}`, w = label.length * 4.6 + 8;
        return (
          <g key={g.name} pointerEvents="none" aria-hidden="true">
            <rect x={g.x - w / 2} y={g.y - 7} width={w} height="13" rx="3" fill="white" stroke="#d1d5db" strokeWidth="0.5" />
            <text x={g.x} y={g.y + 2.5} textAnchor="middle" fontSize="8.5" fontWeight="600" fill="#111827">{label}</text>
          </g>
        );
      })}
    </svg>
  );
}

function Detail({ item, onClose }) {
  const ref = useRef(null);
  useEffect(() => { const d = ref.current; if (item && !d.open) d.showModal(); if (!item && d.open) d.close(); }, [item]);
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose(); }} aria-labelledby="dir-detail-title"
      className="mx-auto mt-20 max-h-[85vh] w-[min(640px,calc(100vw-2rem))] rounded-xl p-0 backdrop:bg-black/30">
      {item && (
        <div className="p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <h2 id="dir-detail-title" className="text-xl font-bold leading-snug text-uc-navy">{item.name}</h2>
            <button type="button" className="chip shrink-0" onClick={onClose}>Close</button>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-600">{item.meta.map((x, i) => <span key={i}>{i > 0 && <span className="mr-2 text-gray-300">·</span>}{x}</span>)}<Status value={item.status} /></p>
          {item.tags.length > 0 && <p className="mt-3 flex flex-wrap gap-1">{item.tags.map((t) => <Tag key={t}>{t}</Tag>)}</p>}
          {item.link && (
            <p className="mt-4 rounded-lg bg-[#eaf6fc] p-3 text-sm">
              <Go item={item} className="btn btn-primary" />
              <span className="mt-2 block text-xs text-gray-600">The {item.kind || 'program'} decides who is eligible. This record reports what its public sources say.</span>
            </p>
          )}
          <dl className="mt-4 space-y-3 text-sm">
            {item.fields.map(([label, html]) => (
              <div key={label}><dt className="font-mono text-[11px] uppercase tracking-wide text-gray-500">{label}</dt><dd className="md mt-0.5 text-gray-800" dangerouslySetInnerHTML={{ __html: html }} /></div>
            ))}
          </dl>
          <p className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 text-xs text-gray-500">
            <span>{item.checked && `Checked against its sources ${item.checked}`}</span>
            <a href="#suggest" data-kind="correction" data-about={`Directory: ${item.name}`} className="underline text-uc-blue-dark" onClick={onClose}>Run this? Correct this record</a>
          </p>
        </div>
      )}
    </dialog>
  );
}

// `facets` and `kinds` default to the compute directory's; the institutions view names its own (Designation, Control).
export default function Directory({ items, map = null, mode = map ? 'browse' : 'list', noun = 'record', facets = FACETS, kinds = KINDS, pins = false }) {
  const defaultSort = 'kind';
  const [s, setS] = useState(EMPTY);
  const [hover, setHover] = useState(null);
  const [pinHover, setPinHover] = useState(null);
  // The hash is read after the first paint, so the server's page (every record, no filter) is what hydrates.
  useEffect(() => {
    const read = () => { const h = parseHash(location.hash); setS({ ...EMPTY, ...Object.fromEntries(facets.map(([f]) => [f, h[f] ?? []])), q: h.q?.[0] ?? '', sort: h.sort?.[0] ?? '', r: h.r?.[0] ?? '' }); };
    if (location.hash.includes('=')) read();
    addEventListener('hashchange', read);
    return () => removeEventListener('hashchange', read);
  }, []);
  const set = (patch) => {
    const next = { ...s, ...patch };
    setS(next);
    const hash = toHash({ ...Object.fromEntries(facets.map(([f]) => [f, next[f]])), q: [next.q.trim()], sort: [next.sort], r: [next.r] });
    history.replaceState(null, '', location.pathname + location.search + (hash ? `#${hash}` : ''));
  };
  const toggle = (f, v, single = false) => set({ [f]: s[f].includes(v) ? s[f].filter((x) => x !== v) : single ? [v] : [...s[f], v] });
  const clear = () => set({ ...EMPTY, sort: s.sort });

  // A record passes a facet when it has any of the chosen values; it must pass every facet and the search text.
  const q = s.q.trim().toLowerCase();
  const has = (r, f, v) => valuesOf(r, f).includes(v);
  const passes = (r, except) => (!q || r.text.includes(q)) && facets.every(([f]) => f === except || !s[f].length || s[f].some((v) => has(r, f, v)));
  const sort = ORDERS[s.sort || defaultSort] ?? ORDERS[defaultSort];
  const shown = useMemo(() => items.filter((r) => passes(r)).sort((a, b) => sort(a, b, kinds) || a.name.localeCompare(b.name)), [items, s]);
  // Each facet's counts are taken with that facet's own choice set aside, so a value shows what choosing it would give.
  const optionsOf = (f) => [...new Set(items.flatMap((r) => valuesOf(r, f)))].sort((a, b) => (f === 'kind' ? kinds.indexOf(a) - kinds.indexOf(b) : 0) || /^not stated$/i.test(a) - /^not stated$/i.test(b) || a.localeCompare(b));
  const counts = useMemo(() => Object.fromEntries(facets.map(([f]) => {
    const pool = items.filter((r) => passes(r, f));
    return [f, Object.fromEntries(optionsOf(f).concat(f === 'region' ? WIDE : []).map((v) => [v, pool.filter((r) => has(r, f, v)).length]))];
  })), [items, s]);
  const applied = facets.flatMap(([f, label]) => s[f].map((v) => [f, label, v]));
  const pinList = pins ? (() => { const on = new Set(shown.map((r) => r.id)); return items.filter((r) => r.x !== null && r.x !== undefined).map((r) => ({ ...r, dim: !on.has(r.id) })); })() : null;
  const region = s.region[0] ?? null;
  const focus = map?.regions.find((g) => g.name === (hover ?? region));
  const open = items.find((r) => r.id === s.r) ?? null;

  const search = (
    <label className="block">
      <span className="sr-only">Search the directory</span>
      <input type="search" value={s.q} onChange={(e) => set({ q: e.target.value })} placeholder={mode === 'list' ? 'Search programs' : 'Search by name, place or topic'}
        className="w-full rounded-lg border border-gray-300 bg-white px-4 py-3 text-base shadow-sm outline-none focus:border-uc-blue-dark focus:ring-2 focus:ring-uc-blue-light" />
    </label>
  );
  // The label column fits the longest label: the compute directory's are four rem; "Designation" needs six.
  const lw = facets.some(([, l]) => l.length > 7) ? 'w-24' : 'w-16';
  const row = (f, label, single) => (
    <div key={f} className="flex flex-wrap items-center gap-1.5" role="group" aria-label={label}>
      <span className={`font-mono text-[11px] uppercase tracking-wide text-gray-500 ${lw}`}>{label}</span>
      {optionsOf(f).map((v) => <Chip key={v} on={s[f].includes(v)} count={counts[f][v] ?? 0} onClick={() => toggle(f, v, single)}>{cap(v)}</Chip>)}
    </div>
  );
  const more = (facets, label) => (
    <details open={facets.some(([f]) => s[f].length) || undefined}>
      <summary className="cursor-pointer text-xs text-uc-blue-dark underline">{label}</summary>
      <div className="mt-3 space-y-3">{facets.map(([f, l, single]) => row(f, l, single))}</div>
    </details>
  );
  const cards = (list) => (
    <ul className={`mt-3 grid gap-3 ${map ? 'xl:grid-cols-2' : 'md:grid-cols-2'}`}>
      {list.map((r) => (
        <li key={r.id} className="card flex flex-col transition-shadow hover:border-gray-400 hover:shadow-sm">
          <button type="button" onClick={() => set({ r: r.id })} className="flex w-full flex-1 flex-col rounded-xl p-4 text-left focus-visible:outline-2 focus-visible:outline-uc-blue-dark">
            {r.mark && <img src={r.mark} alt="" loading="lazy" decoding="async" className="mb-2 h-8 w-auto max-w-[10rem] object-contain object-left" />}
            <span className="flex items-baseline gap-2 font-semibold leading-snug text-uc-navy">
              {pins && PIN[r.kind] && <span className={`inline-block h-2.5 w-2.5 shrink-0 ${PIN[r.kind].square ? 'rounded-[1px]' : 'rounded-full'}`} style={{ background: PIN[r.kind].fill }} aria-hidden="true" />}
              {r.name}
            </span>
            <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">{r.meta.map((x, i) => <span key={i}>{i > 0 && <span className="mr-2 text-gray-300">·</span>}{x}</span>)}<Status value={r.status} /></span>
            {r.summary && <span className="mt-2 line-clamp-2 text-sm text-gray-700">{r.summary}</span>}
            {r.tags.length > 0 && <span className="mt-auto flex flex-wrap gap-1 pt-3">{r.tags.map((t) => <Tag key={t}>{t}</Tag>)}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
  const results = (
    <>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <p className="font-semibold text-uc-navy" aria-live="polite">{plural(shown.length, noun)}{shown.length < items.length && <span className="font-normal text-gray-500"> of {items.length}</span>}</p>
        {applied.map(([f, label, v]) => (
          <button key={f + v} type="button" onClick={() => toggle(f, v)} className="rounded-full bg-uc-blue-light/60 px-2.5 py-0.5 text-xs text-uc-navy hover:bg-uc-blue-light" aria-label={`Remove filter ${label}: ${v}`}>{cap(v)} <span aria-hidden="true">×</span></button>
        ))}
        {(applied.length > 0 || q) && <button type="button" className="text-xs text-uc-blue-dark underline" onClick={clear}>Clear all</button>}
        {map && (
          <label className="ml-auto text-xs text-gray-500">Sort <select value={s.sort || defaultSort} onChange={(e) => set({ sort: e.target.value === defaultSort ? '' : e.target.value })} className="rounded border border-gray-300 bg-white px-1.5 py-1 text-gray-700">
<option value="kind">By kind</option><option value="name">A to Z</option>
          </select></label>
        )}
      </div>
      {shown.length === 0 ? (
        <div className="card mt-3 p-8 text-center text-sm text-gray-600">
          <p className="font-semibold text-uc-navy">No {noun} matches.</p>
          <p className="mt-1"><button type="button" className="underline text-uc-blue-dark" onClick={clear}>Clear the filters</button>, or <a className="underline text-uc-blue-dark" href="#suggest" data-kind="data" data-about="Landscape: a missing record">suggest a record</a> that belongs here.</p>
        </div>
      ) : cards(shown)}
      <Detail item={open} onClose={() => set({ r: '' })} />
    </>
  );
  if (!map) return <div className="space-y-4">{search}{results}</div>;

  return (
    <div className="space-y-4">
      {search}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[23rem_minmax(0,1fr)] lg:items-start">
        <aside className="card p-4 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto" aria-label="Regions">
          <RegionMap map={map} counts={counts.region} selected={region} onPick={(g) => toggle('region', g, true)} onHover={setHover}
            pins={pinList} onPin={(id) => set({ r: id })} onPinHover={setPinHover} />
          {pins ? (
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
              {kinds.filter((k) => PIN[k]).map((k) => <span key={k} className="inline-flex items-center gap-1"><span className={`h-2.5 w-2.5 ${PIN[k].square ? 'rounded-[1px]' : 'rounded-full'}`} style={{ background: PIN[k].fill }} aria-hidden="true" />{k}</span>)}
            </p>
          ) : (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500"><span>Records</span>
              {BINS.map(([, colour, label]) => <span key={label} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: colour }} aria-hidden="true" />{label}</span>)}
            </p>
          )}
          <p className="mt-3 min-h-10 text-xs text-gray-600">
            {pinHover ? <><b className="text-uc-navy">{pinHover.name}</b><br />{pinHover.meta.join(' · ')}</>
              : focus ? <><b className="text-uc-navy">{focus.name}</b> · {plural(counts.region[focus.name] ?? 0, 'record')}<br />{focus.counties.length > 1 ? `${focus.counties.join(', ')} counties` : `${focus.counties[0]} County`}</>
              : 'Choose a region on the map or in this list. A record in several regions counts in each.'}
          </p>
          <ul className="mt-2 grid grid-cols-2 gap-x-3 text-sm">
            {map.regions.map((g) => {
              const n = counts.region[g.name] ?? 0, on = region === g.name;
              return (
                <li key={g.name}>
                  <button type="button" aria-pressed={on} onClick={() => toggle('region', g.name, true)} onMouseEnter={() => setHover(g.name)} onMouseLeave={() => setHover(null)}
                    className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left ${on ? 'bg-uc-blue-light/60 font-semibold text-uc-navy' : 'hover:bg-gray-100'} ${n ? '' : 'text-gray-400'}`}>
                    {!pins && <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: shade(n) }} aria-hidden="true" />}
                    <span className="truncate">{SHORT[g.name] ?? g.name}</span><span className="ml-auto font-mono text-xs text-gray-500">{n}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 border-t border-gray-100 pt-3 font-mono text-[11px] uppercase tracking-wide text-gray-500">Open to every region</p>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {WIDE.map((g) => (
              <button key={g} type="button" aria-pressed={region === g} onClick={() => toggle('region', g, true)}
                className={`rounded-lg border px-3 py-2 text-left text-sm ${region === g ? 'border-uc-blue-dark bg-uc-blue-light/60 font-semibold text-uc-navy' : 'border-gray-200 hover:border-gray-400'}`}>
                {g} <span className="float-right font-mono text-xs text-gray-500">{counts.region[g] ?? 0}</span>
              </button>
            ))}
          </div>
        </aside>
        <div>
          <div className="card mb-4 space-y-3 p-4">
            {facets.filter(([f]) => f === 'kind' || f === 'domain').map(([f, l]) => row(f, l, f === 'kind'))}
            {facets.some(([f]) => f === 'status') && more([['status', 'Status']], 'More filters: status')}
          </div>
          {results}
        </div>
      </div>
    </div>
  );
}
