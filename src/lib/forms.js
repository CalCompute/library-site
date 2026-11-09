// The browser half of the two forms (NewsletterForm, SuggestDialog). They post to /api/* on this host (src/worker.js).
// Cloudflare Turnstile checks each post is from a person. The site key is public; its secret is the Worker's.
// The explorer and CaliforniaCompute.org carry a copy of this file: keep the three the same.
const LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
// Turnstile's test key on a local server: it always passes, and the local Worker's test secret (.dev.vars) accepts it.
export const SITEKEY = LOCAL ? '1x00000000000000000000AA' : '0x4AAAAAAF6V6KNm2begVrOQ';
export const API = '/api';
const FAIL = 'Something went wrong. Please try again, or email team@californiacompute.org.';

let script;
const ready = () => (script ??= new Promise((ok, fail) => {
  const s = document.createElement('script');
  s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
  s.async = true; s.onload = ok; s.onerror = fail;
  document.head.append(s);
}));

// Puts the check in the form's [data-turnstile] box the first time, and a fresh one after that (a token works once).
export async function check(form) {
  const box = form.querySelector('[data-turnstile]');
  await ready();
  if (box.dataset.widget) turnstile.reset(box.dataset.widget);
  else box.dataset.widget = turnstile.render(box, { sitekey: SITEKEY, appearance: 'interaction-only' });
}

// Sends the form to /api/<path>. Shows the outcome in its [data-status] line; returns true when it was stored.
export async function send(form, path, thanks) {
  const status = form.querySelector('[data-status]'), button = form.querySelector('[type="submit"]');
  const box = form.querySelector('[data-turnstile]');
  button.disabled = true; status.textContent = 'Sending…';
  try {
    if (!box.dataset.widget) await check(form);
    // The check runs while the visitor types; wait a few seconds for it if they were quicker.
    for (let i = 0; i < 40 && !turnstile.getResponse(box.dataset.widget); i++) await new Promise((r) => setTimeout(r, 250));
    form.elements.namedItem('page').value = location.href;
    const r = await fetch(`${API}/${path}`, { method: 'POST', body: new FormData(form) });
    const j = await r.json().catch(() => ({}));
    status.textContent = r.ok ? thanks : j.error ?? FAIL;
    return r.ok;
  } catch {
    status.textContent = FAIL;
    return false;
  } finally {
    button.disabled = false;
    if (box.dataset.widget) turnstile.reset(box.dataset.widget);
  }
}
