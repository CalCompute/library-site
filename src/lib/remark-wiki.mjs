// Remark plugin for every wiki and raw page. Adapted from ap0110's remark-wiki.mjs.
//   1. Relative .md links -> site routes; links to originals -> the copied file; links to
//      files outside the mirror (bin/, setup.sh) -> a dotted "missing" span. Nothing is dropped.
//   2. ⚠️ / 🔍 / 💡 blockquotes get a class (wiki flags).
//   3. In the SB-53 statute file only: ids on (a)..(k), (1).., (A).. paragraphs under SEC. 3,
//      e.g. sec3-f-2-d, so pages can link to a subdivision.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WIKI, resolveHref } from './wiki.js';

const KIND = [[/^\s*⚠️/u, 'callout callout-warning'], [/^\s*🔍/u, 'callout callout-gap'], [/^\s*💡/u, 'callout callout-connection']];
export const STATUTE = 'raw/legislative/SB-53 Gov Code 11546.8.md';

const firstText = (n) => (n?.type === 'text' ? n.value : n?.children?.length ? firstText(n.children[0]) : '');
const setProps = (n, props) => { n.data = n.data || {}; n.data.hProperties = { ...(n.data.hProperties || {}), ...props }; };

function relOf(file) {
  let p = file.path || file.history?.[0] || '';
  if (p.startsWith('file:')) p = fileURLToPath(p);
  return path.relative(WIKI, path.resolve(p)).split(path.sep).join('/');
}

export default function remarkWiki() {
  return (tree, file) => {
    const rel = relOf(file);
    const statute = rel === STATUTE;
    const pos = { inSec3: false, sub: null, para: null };

    const walk = (node) => {
      if (node.type === 'link') {
        const r = resolveHref(rel, node.url);
        if (r.foreign) node.data = { hName: 'span', hProperties: { className: 'missing-link', title: `Link on the original web page: ${node.url}` } };
        else if (!r.external) {
          if (r.route) node.url = r.route;
          else { node.data = { hName: 'span', hProperties: { className: 'missing-link', title: `Not in the mirror: ${r.target}` } }; }
        }
      }
      if (node.type === 'image') {
        const r = resolveHref(rel, node.url);
        if (r.foreign) Object.assign(node, { type: 'text', value: `[image on the original web page: ${node.alt || node.url}]` });
        else if (!r.external) {
          if (r.route) node.url = r.route; // absolute URL: Astro leaves it alone
          else Object.assign(node, { type: 'text', value: `[image not in the wiki: ${node.alt || node.url}]` });
        }
      }
      if (node.type === 'blockquote') {
        const hit = KIND.find(([re]) => re.test(firstText(node)));
        if (hit) setProps(node, { className: hit[1] });
      }
      if (statute) {
        if (node.type === 'heading' && /SEC\.\s*3\b/.test(firstText(node) + JSON.stringify(node.children))) pos.inSec3 = true;
        if (pos.inSec3 && node.type === 'paragraph') {
          const t = firstText(node);
          const m = t.match(/^\(([a-z])\)/) ;
          const n = t.match(/^\((\d+)\)/);
          const u = t.match(/^\(([A-Z])\)/);
          let id = null;
          if (m) { pos.sub = m[1]; pos.para = null; id = `sec3-${m[1]}`; }
          else if (n && pos.sub) { pos.para = n[1]; id = `sec3-${pos.sub}-${n[1]}`; }
          else if (u && pos.sub && pos.para) id = `sec3-${pos.sub}-${pos.para}-${u[1].toLowerCase()}`;
          if (id) setProps(node, { id, className: 'statute-anchor' });
        }
      }
      for (const c of node.children || []) walk(c);
    };
    walk(tree);
  };
}
