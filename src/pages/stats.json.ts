import { load } from '../lib/load.js';
// The home page hero's counts, for CaliforniaCompute.org's Framework section, which reads them live (public/_headers).
export async function GET() {
  const m = await load();
  const stats = { stats: m.activity.stats, pages: m.pages.length, links: m.graph.edges.length, updated: m.status.lastLog?.date ?? null };
  return new Response(JSON.stringify(stats), { headers: { 'Content-Type': 'application/json' } });
}
