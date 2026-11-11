// The home page's directory section: the directory's map, and beside it the first records of the chosen region with
// links into /directory/ (the region filtered, or one record's detail panel open). It starts on Statewide.
import { useState } from 'react';
import { RegionMap, shade, BINS, SHORT, KINDS, WIDE, plural } from './Directory.jsx';
import { toHash } from '../lib/hash.js';

const FIRST = 5;

export default function DirectoryTeaser({ items, map }) {
  const [region, setRegion] = useState('Statewide');
  const [hover, setHover] = useState(null);
  const counts = {};
  for (const r of items) for (const g of r.regions) counts[g] = (counts[g] ?? 0) + 1;
  const pick = (g) => setRegion(region === g ? 'Statewide' : g);
  const shown = hover ?? region, place = map.regions.find((g) => g.name === shown);
  const inRegion = items.filter((r) => r.regions.includes(shown)).sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind) || a.name.localeCompare(b.name));
  return (
    <div className="grid md:grid-cols-2">
      <div className="border-b border-gray-200 p-4 sm:p-5 md:border-b-0 md:border-r">
        <RegionMap map={map} counts={counts} selected={WIDE.includes(region) ? null : region} onPick={pick} onHover={setHover} />
        <p className="mt-1 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] text-gray-500"><span>Records</span>
          {BINS.map(([, colour, label]) => <span key={label} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: colour }} aria-hidden="true" />{label}</span>)}
        </p>
      </div>
      <div className="flex flex-col p-4 sm:p-5">
        <p className="font-mono text-[11px] uppercase tracking-wide text-gray-500">{place ? 'Region' : 'Open to every region'}</p>
        <h3 className="flex items-center gap-2 text-lg font-bold text-uc-navy" aria-live="polite">
          <span className="h-3 w-3 rounded-sm" style={{ background: place ? shade(inRegion.length) : '#005581' }} aria-hidden="true" />{shown}
          <span className="font-mono text-sm font-normal text-gray-500">{plural(inRegion.length, 'record')}</span>
        </h3>
        <p className="mt-0.5 min-h-8 text-xs text-gray-500">
          {place ? (place.counties.length > 1 ? `${place.counties.join(', ')} counties` : `${place.counties[0]} County`)
            : shown === 'Statewide' ? 'Open across California. Choose a region on the map to see what is there.' : 'National programs that Californians can use.'}
        </p>
        {inRegion.length ? (
          <ul className="mt-2 divide-y divide-gray-100 border-y border-gray-100 text-sm">
            {inRegion.slice(0, FIRST).map((r) => (
              <li key={r.id}>
                <a href={`/directory/#${toHash({ r: [r.id] })}`} className="group flex items-baseline gap-2 py-2">
                  <span className="min-w-0 flex-1 truncate font-medium text-uc-navy group-hover:underline">{r.name}</span>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-gray-500">{r.kind}</span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 border-y border-gray-100 py-4 text-sm text-gray-600">The directory has no record in {SHORT[shown] ?? shown} yet. <a className="underline text-uc-blue-dark" href="#suggest" data-kind="data" data-about={`Directory: ${shown}`}>Suggest a record</a>.</p>
        )}
        {inRegion.length > 0 && (
          <p className="mt-3 text-sm"><a className="text-uc-blue-dark hover:underline" href={`/directory/#${toHash({ region: [shown] })}`}>See all {plural(inRegion.length, 'record')} in {SHORT[shown] ?? shown} →</a></p>
        )}
        <div className="mt-auto grid grid-cols-2 gap-2 pt-4">
          {WIDE.map((g) => (
            <button key={g} type="button" aria-pressed={region === g} onClick={() => setRegion(g)}
              className={`rounded-lg border px-3 py-2 text-left text-sm ${region === g ? 'border-uc-blue-dark bg-uc-blue-light/60 font-semibold text-uc-navy' : 'border-gray-200 hover:border-gray-400'}`}>
              {g} <span className="float-right font-mono text-xs text-gray-500">{counts[g] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
