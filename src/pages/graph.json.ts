import { load } from '../lib/load.js';
export async function GET() {
  const m = await load();
  return new Response(JSON.stringify(m.graph), { headers: { 'Content-Type': 'application/json' } });
}
