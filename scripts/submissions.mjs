// Prints what the community has sent, from the D1 database (schema.sql). Needs `npx wrangler login`.
//   npm run submissions          suggestions not yet read (status 'new'), as Markdown
//   npm run submissions -- all   every suggestion
//   npm run subscribers          the newsletter list, as CSV
// Mark a suggestion read once a member has decided:
//   npx wrangler d1 execute calcompute-community --remote --command "UPDATE suggestions SET status = 'done' WHERE id = 12"
import { execFileSync } from 'node:child_process';

const DB = 'calcompute-community';
const query = (sql) => {
  const out = execFileSync('npx', ['wrangler', 'd1', 'execute', DB, '--remote', '--json', '--command', sql], { encoding: 'utf8' });
  return JSON.parse(out.slice(out.indexOf('[')))[0].results;
};
const csv = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

if (process.argv[2] === 'subscribers') {
  console.log('email,source,created_at');
  for (const r of query('SELECT email, source, created_at FROM subscribers ORDER BY created_at')) console.log([r.email, r.source, r.created_at].map(csv).join(','));
} else {
  const rows = query(`SELECT * FROM suggestions ${process.argv[2] === 'all' ? '' : "WHERE status = 'new'"} ORDER BY id`);
  if (!rows.length) console.log('Nothing new.');
  for (const r of rows) {
    console.log(`### #${r.id} · ${r.kind} · ${r.created_at} UTC${r.element ? ` · ${r.element}` : ''}${r.status === 'new' ? '' : ` · ${r.status}`}`);
    for (const k of ['about', 'link', 'source', 'name', 'email', 'institution']) if (r[k]) console.log(`- ${k}: ${r[k]}`);
    console.log(`\n${r.what}\n`);
  }
}
