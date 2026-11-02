// Filter state in the URL hash, so a link is a saved filter: #Status=open&Owner=Daniel%20Romo&q=cost
// No imports: the browser scripts and the tests both load this.
export function parseHash(hash) {
  const out = {};
  for (const part of String(hash || '').replace(/^#/, '').split('&')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const k = decodeURIComponent(part.slice(0, i)), v = decodeURIComponent(part.slice(i + 1));
    (out[k] ??= []).push(v);
  }
  return out;
}
export const toHash = (state) =>
  Object.entries(state).flatMap(([k, vs]) => vs.filter((v) => v !== '').map((v) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)).join('&');
