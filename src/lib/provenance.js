// Where a source came from, for search results: the original link, the publisher, dates, tier and license.
// Read from the raw file's frontmatter, then the source page's frontmatter and Citation paragraph. Never who
// suggested it (AGENTS.md, "No member attribution"). Only fields that exist are returned.
import { section, day } from './wiki.js';

const str = (v) => (v instanceof Date ? day(v) : v == null ? '' : String(v).trim());
// "not stated", "unknown", "none" and template placeholders are not facts.
const real = (v) => (v = str(v)) && !/^(not stated|unknown|none|n\/a)\.?$/i.test(v) && !v.includes('<') ? v : '';
const first = (...vs) => vs.map(real).find(Boolean) ?? '';

export function provenance(page, raw, info) {
  const r = raw?.data ?? {}, d = page.data ?? {};
  const cite = page.tree === 'wiki' ? section(page.body, 'Citation') : '';
  const out = {
    url: first(r.url, r.sourceUrl, d.url, d.sourceUrl, cite.match(/https?:\/\/[^\s<>)\]]+/)?.[0]?.replace(/[.,;]$/, '')),
    publisher: first(r.publisher, d.publisher),
    published: first(r.published, r.publishedDate, d.published, d.publishedDate),
    license: first(r.license, d.license),
    tier: real(info?.tier ?? d.tier),
  };
  const prov = Object.fromEntries(Object.entries(out).filter(([, v]) => v));
  return { ...prov, text: Object.entries(prov).filter(([k]) => !['url', 'tier'].includes(k)).map(([, v]) => v).join(' · ') };
}
