import { load } from '../lib/load.js';
import { serviceRecords } from '../lib/directory.js';
import map from '../data/ca-regions.json';
// The programs and resources and the region map, for CaliforniaCompute.org's California Compute Directory, which reads
// them when it builds. The records are the Landscape's (pages/directory/), as plain text (lib/directory.js serviceRecords).
export async function GET({ site }) {
  const m = await load();
  const records = serviceRecords(m, String(site).replace(/\/$/, ''));
  const body = {
    checked: records.map((r) => r.checked).sort().at(-1) ?? null,
    map: { width: map.width, height: map.height, counties: map.counties, regions: map.regions.map(({ name, d, x, y }) => ({ name, d, x, y })) },
    records,
  };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
}
