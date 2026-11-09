// The Worker's code. The built site (dist/) is served as static assets; only /api/* reaches this script.
// Two endpoints, both form posts from this site, the explorer and CaliforniaCompute.org:
//   POST /api/subscribe  an email for the newsletter (nothing is sent yet)
//   POST /api/suggest    a suggested source, a correction, data or a question
// Each is checked by Cloudflare Turnstile (secret TURNSTILE_SECRET, set in the dashboard) and stored in D1 (binding DB,
// schema.sql). A person reads every suggestion (npm run submissions); nothing here changes the library.
// No imports: the tests load the two parsers below.

// The three sites, the main site's branch previews, and local dev servers. Turnstile, not this list, keeps bots out.
const ORIGINS = /^(https:\/\/((www\.|research\.)?californiacompute\.org|[a-z0-9-]+\.californiacompute-org\.pages\.dev)|http:\/\/(localhost|127\.0\.0\.1):\d+)$/;
const KINDS = ['reading', 'correction', 'data', 'question'];
const EMAIL = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

const line = (v, n) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
const text = (v, n) => String(v ?? '').replace(/\r\n?/g, '\n').trim().slice(0, n);
const email = (v) => { const e = line(v, 254).toLowerCase(); return EMAIL.test(e) ? e : null; };
// The page a form was sent from, as host and path.
const source = (v) => { try { const u = new URL(String(v)); return (u.host + u.pathname).slice(0, 200); } catch { return null; } };

export function subscriber(f) {
  const e = email(f.get('email'));
  return e ? { row: { email: e, source: source(f.get('page')) } } : { error: 'Enter a valid email address.' };
}

export function suggestion(f) {
  const kind = line(f.get('kind'), 20), what = text(f.get('what'), 4000);
  if (!KINDS.includes(kind)) return { error: 'Choose what kind of suggestion this is.' };
  if (!what) return { error: 'Say what it is, or what should change.' };
  const given = line(f.get('email'), 254), e = given ? email(given) : null;
  if (given && !e) return { error: 'Enter a valid email address, or leave it empty.' };
  return { row: {
    kind, what, email: e,
    about: line(f.get('about'), 500) || null, link: line(f.get('link'), 500) || null, element: line(f.get('element'), 60) || null,
    name: line(f.get('name'), 200) || null, institution: line(f.get('institution'), 200) || null, source: source(f.get('page')),
  } };
}

async function human(f, request, env) {
  if (!env.TURNSTILE_SECRET) return false;
  const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({
      secret: env.TURNSTILE_SECRET,
      response: String(f.get('cf-turnstile-response') ?? '').slice(0, 2048),
      remoteip: request.headers.get('CF-Connecting-IP') ?? '',
    }),
  });
  return r.ok && (await r.json()).success === true;
}

const STORE = {
  '/api/subscribe': [subscriber, (db, r) => db.prepare('INSERT OR IGNORE INTO subscribers (email, source) VALUES (?, ?)').bind(r.email, r.source)],
  '/api/suggest': [suggestion, (db, r) => db.prepare(
    'INSERT INTO suggestions (kind, about, link, what, element, name, email, institution, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(r.kind, r.about, r.link, r.what, r.element, r.name, r.email, r.institution, r.source)],
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const origin = request.headers.get('Origin') ?? '';
    const allowed = !origin || origin === url.origin || ORIGINS.test(origin);
    const cors = allowed && origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
    const reply = (status, body) => Response.json(body, { status, headers: cors });
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' } });
    }
    const route = STORE[url.pathname];
    if (!route) return reply(404, { error: 'Not found.' });
    if (request.method !== 'POST') return reply(405, { error: 'Send the form with POST.' });
    if (!allowed) return reply(403, { error: 'This form only takes posts from CalCompute sites.' });
    const f = await request.formData().catch(() => null);
    if (!f) return reply(400, { error: 'Send the form as form data.' });
    if (f.get('website')) return reply(200, { ok: true }); // the hidden field only a bot fills in: accept, store nothing
    const [parse, insert] = route, p = parse(f);
    if (p.error) return reply(400, { error: p.error }); // before Turnstile, so the visitor can fix it with the same token
    if (!(await human(f, request, env))) return reply(400, { error: 'Please complete the check and send again.' });
    await insert(env.DB, p.row).run();
    return reply(200, { ok: true });
  },
};
