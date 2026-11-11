// The directory's map: California's 13 Jobs First regions as SVG paths, merged from county boundaries (U.S. Census
// Bureau, through the us-atlas package). Run once, and again only if the state changes a region:
//
//   npm i --no-save us-atlas topojson-client d3-geo && node scripts/regions-map.mjs
//
// Writes src/data/ca-regions.json. The three packages are needed for this run only; the site does not depend on them.
// The county lists are those of the CJF Investment Playbook (California Jobs First, January 2025), p. 7, in its order
// and spelling.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { feature, merge, mesh } from 'topojson-client';
import { geoMercator, geoPath } from 'd3-geo';

const REGIONS = {
  'North State': ['Butte', 'Glenn', 'Lassen', 'Modoc', 'Plumas', 'Shasta', 'Sierra', 'Siskiyou', 'Tehama', 'Trinity'],
  Redwood: ['Del Norte', 'Humboldt', 'Lake', 'Mendocino'],
  Capital: ['Colusa', 'El Dorado', 'Placer', 'Nevada', 'Sacramento', 'Sutter', 'Yolo', 'Yuba'],
  Sierra: ['Alpine', 'Amador', 'Calaveras', 'Inyo', 'Mariposa', 'Mono', 'Tuolumne'],
  'Bay Area': ['Alameda', 'Contra Costa', 'Marin', 'Napa', 'San Francisco', 'San Mateo', 'Santa Clara', 'Solano', 'Sonoma'],
  'North San Joaquin': ['Merced', 'San Joaquin', 'Stanislaus'],
  'Central San Joaquin': ['Fresno', 'Kings', 'Madera', 'Tulare'],
  'Central Coast': ['Monterey', 'San Benito', 'San Luis Obispo', 'Santa Barbara', 'Santa Cruz', 'Ventura'],
  'Kern County': ['Kern'],
  'Los Angeles County': ['Los Angeles'],
  'Orange County': ['Orange'],
  'Inland SoCal': ['Riverside', 'San Bernardino'],
  'Southern Border': ['Imperial', 'San Diego'],
};
const W = 400, H = 460;

const us = JSON.parse(fs.readFileSync(createRequire(import.meta.url).resolve('us-atlas/counties-10m.json'), 'utf8'));
const counties = us.objects.counties.geometries.filter((g) => String(g.id).startsWith('06'));
const regionOf = new Map(Object.entries(REGIONS).flatMap(([r, cs]) => cs.map((c) => [c, r])));
const stray = counties.filter((g) => !regionOf.has(g.properties.name)).map((g) => g.properties.name);
if (counties.length !== 58 || regionOf.size !== 58 || stray.length) throw new Error(`expected 58 counties in 13 regions; got ${counties.length}, ${regionOf.size} listed, unplaced: ${stray}`);

const california = feature(us, { type: 'GeometryCollection', geometries: counties });
const projection = geoMercator().fitSize([W, H], california);
const path = geoPath(projection);
// The fit, so a page can place a point by latitude and longitude on the same drawing (lib/directory.js, pinAt).
const proj = { scale: projection.scale(), translate: projection.translate() };
// One decimal is a tenth of a pixel at this size: enough, and a third of the bytes.
const round = (d) => d.replace(/-?\d+\.\d+/g, (n) => String(Math.round(n * 10) / 10));
const regions = Object.entries(REGIONS).map(([name, list]) => {
  const shape = merge(us, counties.filter((g) => regionOf.get(g.properties.name) === name));
  const [x, y] = path.centroid(shape);
  return { name, counties: list, d: round(path(shape)), x: Math.round(x), y: Math.round(y) };
});
// The county lines inside a region, drawn thin over the fills.
const inner = round(path(mesh(us, { type: 'GeometryCollection', geometries: counties },
  (a, b) => a !== b && regionOf.get(a.properties.name) === regionOf.get(b.properties.name))) ?? '');

fs.mkdirSync('src/data', { recursive: true });
fs.writeFileSync('src/data/ca-regions.json', JSON.stringify({ width: W, height: H, proj, regions, counties: inner }) + '\n');
console.log(`${regions.length} regions, ${counties.length} counties, ${Math.round(fs.statSync('src/data/ca-regions.json').size / 1024)} KB`);
