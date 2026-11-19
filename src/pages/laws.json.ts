import { load } from '../lib/load.js';
import { lawRecords } from '../lib/directory.js';
// California's AI laws, for CaliforniaCompute.org's California AI Law Directory, which reads them when it builds.
// The records are the rows of the library's AI laws page, as plain text (lib/directory.js lawRecords).
export async function GET({ site }) {
  const records = lawRecords(await load(), String(site).replace(/\/$/, ''));
  const body = { checked: records.map((r) => r.checked).sort().at(-1) ?? null, records };
  return new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
}
