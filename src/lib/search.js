// Search helpers shared by /search/, the header box and the tests. No imports.

// Facets on /search/, in display order, with their labels. Keys are the Pagefind filters Page.astro writes.
export const FACETS = [['kind', 'Kind'], ['element', 'Element'], ['origin', 'Origin'], ['format', 'Format'], ['tag', 'Tag'], ['section', 'Section']];
const KEYS = new Set(FACETS.map(([k]) => k));

// Operators in the query box, as on Wikipedia: kind:source element:D tag:"press-release".
// Returns the remaining words as the term and the operators as { key: [values] }. type: is kind:.
export function parseQuery(q) {
  const filters = {};
  const term = String(q ?? '').replace(/(^|\s)([a-z]+):("[^"]*"|\S+)/gi, (all, pre, k, v) => {
    k = k.toLowerCase() === 'type' ? 'kind' : k.toLowerCase();
    if (!KEYS.has(k)) return all;
    v = v.replace(/^"|"$/g, '');
    if (v) (filters[k] ??= []).push(k === 'element' ? v.toUpperCase() : v);
    return pre;
  }).replace(/\s+/g, ' ').trim();
  return { term, filters };
}

// Character-bigram similarity (Dice, 0..1) of a query to the closest run of words in a title.
// Titles only, for "Did you mean"; a fuzzy full-text engine if typos in body text matter.
const grams = (s) => {
  const g = new Map(), t = ` ${s.toLowerCase()} `;
  for (let i = 0; i < t.length - 1; i++) g.set(t.slice(i, i + 2), (g.get(t.slice(i, i + 2)) || 0) + 1);
  return g;
};
const dice = (a, b) => {
  const A = grams(a), B = grams(b);
  let n = 0, t = 0;
  for (const [k, v] of A) { n += Math.min(v, B.get(k) || 0); t += v; }
  for (const v of B.values()) t += v;
  return t ? (2 * n) / t : 0;
};
export function similar(q, title) {
  const words = String(title).split(/\s+/).filter(Boolean), n = Math.max(1, String(q).trim().split(/\s+/).length);
  let best = dice(q, title);
  for (let i = 0; i + n <= words.length; i++) best = Math.max(best, dice(q, words.slice(i, i + n).join(' ')));
  return best;
}
