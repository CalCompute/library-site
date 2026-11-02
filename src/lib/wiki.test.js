// node --test src/lib/   (reads the real library in ../library-wiki)
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { resolveHref, routeOf, flagsIn, pyconst, readWiki, readJson, files, rehosted, WIKI } from './wiki.js';
import { parseHash, toHash } from './hash.js';
import { suggestMail, TO, SUBJECT } from './mailto.js';

test('links resolve to site routes', () => {
  const from = 'wiki/elements/D - Use Parameters.md';
  assert.equal(resolveHref(from, '../sources/ACCESS%20Allocations%20policy.md').route, '/wiki/sources/access-allocations-policy/');
  assert.equal(resolveHref(from, '../../raw/legislative/SB-53%20Gov%20Code%2011546.8.md').route, '/raw/legislative/sb-53-gov-code-11546-8/');
  assert.equal(resolveHref('wiki/index.md', 'elements/A%20-%20Landscape%20Analysis.md').route, '/wiki/elements/a-landscape-analysis/');
  assert.equal(resolveHref('wiki/index.md', '../AGENTS.md').route, '/how-it-works/#agents-md');
  assert.equal(resolveHref('AGENTS.md', '.agents/skills/ingest/SKILL.md').route, '/how-it-works/#skill-ingest');
  assert.equal(resolveHref('AGENTS.md', '.agents/skills/').route, '/how-it-works/#skills');
  assert.equal(resolveHref(from, '../../bin/grab.py').route, null); // outside the mirror: shown, not dropped
  assert.ok(resolveHref('raw/shared/x.md', '/about').foreign);
  assert.ok(resolveHref(from, 'https://example.org').external);
});

test('originals open outside this site: the public Drive or the publisher', () => {
  const originals = [...files].filter((f) => f.startsWith('raw/') && !f.endsWith('.md'));
  assert.ok(originals.length > 0);
  for (const f of originals) { const r = routeOf(f); if (r) assert.match(r, /^https:\/\//, f); }
  const inDrive = originals.filter((f) => /^https:\/\/drive\.google\.com\//.test(routeOf(f) ?? ''));
  assert.ok(inDrive.length >= 20, `only ${inDrive.length} originals open in the Drive`);
});

test('only rehosted originals are served', () => {
  const originals = [...files].filter((f) => f.startsWith('raw/') && !f.endsWith('.md'));
  assert.ok(originals.length > 0);
  for (const f of originals) assert.ok(rehosted(f), `not rehosted: ${f}`);
  assert.ok(rehosted('raw/legislative/anything.pdf'));
});

test('the library holds only its own material', () => {
  const internal = /zulipchat\.com|raw\/(calls|zulip|email|meet|calendar|elements|ai|assets)\/|chat with the maintainer|\b(shared_by|shared_in|drive_folder):|Proposed (by|as):|Shared in:/i;
  for (const f of files) if (f.endsWith('.md')) assert.doesNotMatch(readWiki(f), internal, f);
});

test('flags are collected from blockquotes', () => {
  const f = flagsIn('text\n> ⚠️ Contradiction: A says x.\n> B says y.\n\n> 🔍 Gap: no source.\n```\n> 💡 in a fence\n```');
  assert.deepEqual(f, [{ kind: 'Contradiction', text: 'A says x. B says y.' }, { kind: 'Gap', text: 'no source.' }]);
});

test('the Drive browser reads its name and notes from the push script', () => {
  const push = readWiki('bin/drive_push.py');
  assert.equal(pyconst(push, 'PUBLIC_ROOT'), 'CalCompute Library');
  assert.deepEqual(pyconst(push, 'FOLDERS'), ['', 'Legislative Sources']); // originals sit in the top folder
  assert.equal(typeof pyconst(push, 'GUIDE_NOTES')['0 - LIBRARY GUIDE'], 'string');
});

test('member photos and institution marks map by name, never invented', async () => {
  const { photoFor, logosFor, markForEntity } = await import('./brand.js');
  assert.equal(photoFor('Nelson'), '/images/people/jt-nelson.jpg');
  assert.equal(photoFor('Stephanie Lieggi'), '/images/people/stephanie-lieggi.jpeg');
  assert.equal(photoFor('Daniel Romo'), '/images/people/daniel-romo.jpeg');
  assert.equal(photoFor('Andrew W. Reddie'), null); // not on the team page
  assert.deepEqual(logosFor('Kapor Center').map((l) => l.name), ['Kapor Center']);
  assert.deepEqual(logosFor('Carnegie Mellon University'), []);
  assert.equal(markForEntity('UC Davis'), '/images/logos/UCD.png');
});

test('filters round-trip through the URL hash', () => {
  const state = { Tier: ['primary'], Origin: ['web', 'shared'], q: ['cost & funding'] };
  assert.deepEqual(parseHash('#' + toHash(state)), state);
  assert.deepEqual(parseHash(''), {});
});

test('search: query operators, page dates, did-you-mean score', async () => {
  const { parseQuery, similar } = await import('./search.js');
  const { pageDate } = await import('./wiki.js');
  assert.deepEqual(parseQuery('kind:source element:d "exact phrase" cost'), { term: '"exact phrase" cost', filters: { kind: ['source'], element: ['D'] } });
  assert.deepEqual(parseQuery('  '), { term: '', filters: {} });
  assert.equal(pageDate({ updated: new Date('2026-10-08'), created: '2026-01-01' }), '2026-10-08');
  assert.equal(pageDate({ published: 'unknown' }, 'raw/web/2026-10-02 NRP AUP.md'), '2026-10-02');
  assert.ok(similar('Governanse', 'Governance') > 0.7);
});

test('a suggestion is one email to the team mailbox, with no hidden fields', () => {
  const m = suggestMail({ url: ' https://example.org/report.pdf ', what: 'A state report.\nPage 4 has costs.', element: 'B - Cost & Funding' });
  assert.equal(TO, 'team@californiacompute.org');
  assert.equal(m.subject, SUBJECT);
  assert.equal(SUBJECT, 'Suggested reading');
  assert.ok(m.href.startsWith(`mailto:${TO}?subject=Suggested%20reading&body=`));
  assert.equal(decodeURIComponent(m.href.split('body=')[1]), m.body);
  assert.equal(m.body, 'Link: https://example.org/report.pdf\r\nElement: B - Cost & Funding\r\n\r\nWhat it is, or my question:\r\nA state report.\r\nPage 4 has costs.');
  assert.match(suggestMail({ what: 'Q?' }).body, /^Link: \r\nElement: not sure\r\n/);
});

test('activity.json holds only markers, edges to library pages, counts and track calendar entries', () => {
  const a = readJson('activity.json');
  assert.ok(a, 'activity.json is missing');
  assert.deepEqual(Object.keys(a).sort(), ['calendar', 'date', 'edges', 'nodes', 'stats']);
  const titles = new Set([...files].filter((f) => f.startsWith('wiki/') && f.endsWith('.md'))
    .map((f) => readWiki(f).match(/^title:\s*(.+)$/m)?.[1]?.trim()).filter(Boolean).map((t) => (t.startsWith('"') ? JSON.parse(t) : t)));
  const TYPES = ['calls', 'email', 'zulip', 'meet']; // communications only: no originals, no summaries, no Drive squares
  const ids = new Set(a.nodes.map((n) => n.id));
  for (const n of a.nodes) {
    for (const k of Object.keys(n)) assert.ok(['id', 'type', 'system', 'size', 'ring', 'date', 'elements'].includes(k), `${n.id}: ${k}`);
    assert.ok(TYPES.includes(n.type), n.type);
    assert.match(n.id, new RegExp(`^${n.type}-\\d+$`));
    assert.ok(['repo', 'zulip', 'mail'].includes(n.system), `${n.id}: ${n.system}`); // the Drive square means the public Drive
    if (n.date) assert.match(n.date, /^\d{4}-\d\d-\d\d$/);
  }
  for (const e of a.edges) {
    for (const x of [e.a, e.b]) {
      if (x.startsWith('t:')) assert.ok(titles.has(x.slice(2)), `edge to a title the library lacks: ${x}`);
      else if (x.startsWith('r:')) assert.ok(files.has(x.slice(2)), `edge to a file the library lacks: ${x}`);
      else assert.ok(ids.has(x), `edge to an unknown marker: ${x}`);
    }
    assert.ok(ids.has(e.a) || ids.has(e.b));
  }
  for (const e of a.calendar) {
    assert.deepEqual(Object.keys(e).sort(), ['cancelled', 'date', 'end', 'start', 'title', 'track']);
    assert.match(e.title, /^(Element [A-G](?: & [A-G])* call|Community sync)$/);
  }
  assert.doesNotMatch(JSON.stringify(a), /@|https?:|meet\.google|zulipchat/i);
});

test('profile pages stay off the reading lists', () => {
  const sources = [...files].filter((f) => f.startsWith('wiki/sources/'));
  assert.ok(sources.length >= 160);
  const profiles = sources.filter((f) => /^tags: \[.*\bpeople\b/m.test(readWiki(f))).map((f) => f.split('/').pop().replace(/\.md$/, ''));
  assert.ok(profiles.length > 0);
  const lists = [...files].filter((f) => /^wiki\/elements\/[A-G] - /.test(f)).map(readWiki).join('\n');
  for (const p of profiles) assert.ok(!lists.includes(`[${p}]`), `profile on a reading list: ${p}`);
});

test('an original in the public Drive maps its page to the Drive file', async () => {
  const { driveHref } = await import('./wiki.js');
  const listing = JSON.parse(readWiki('raw/drive/.listing.json'));
  const withCopy = listing.filter((x) => x.copy);
  assert.ok(withCopy.length >= 20, `only ${withCopy.length} listing entries carry a copy`);
  for (const x of withCopy) assert.ok(files.has(x.copy), `${x.copy} is not in the library`);
  const sample = withCopy.find((x) => x.copy.startsWith('raw/legislative/'));
  assert.match(driveHref(routeOf(sample.copy)) ?? '', /^https:\/\/drive\.google\.com\//);
});

test('the GitHub view lists the repository as git sees it', async () => {
  const { repoTree, REPO } = await import('./github.js');
  const t = repoTree();
  const all = [];
  const walk = (d, p) => { d.files.forEach((f) => all.push(p + f.name)); d.children.forEach((c) => walk(c, `${p}${c.name}/`)); };
  walk(t, '');
  assert.ok(all.includes('AGENTS.md') && all.includes('activity.json'));
  assert.ok(all.some((p) => p.startsWith('wiki/sources/')) && all.some((p) => p.startsWith('.agents/skills/')));
  assert.ok(!all.some((p) => /^(\.venv|\.cache|node_modules)\/|\.DS_Store$/.test(p)));
  assert.ok(!all.some((p) => p.startsWith('"')), 'git quoted a path'); // names with accents, such as Würthwein
  assert.ok(t.files.every((f) => f.url.startsWith(`${REPO}/blob/main/`)));
  assert.ok(t.files.some((f) => f.name === 'README.md'));
  const wikiIndex = t.children.find((d) => d.name === 'wiki').files.find((f) => f.name === 'index.md');
  assert.equal(wikiIndex.route, '/wiki/index/'); // "Read it on this site"
  assert.equal(t.children.find((d) => d.name === 'bin').files.find((f) => f.name === 'grab.py').route, null);
  const folders = [];
  const dirs = (d) => { folders.push(d); d.children.forEach(dirs); };
  dirs(t);
  assert.ok(folders.every((d) => 'modified' in d && 'commit' in d));
});

test('the public repos never point outside themselves', () => {
  // library-wiki and this site are complete in themselves: no other wiki, notes, export or seed, and no team vocabulary.
  const OUTSIDE = /private (wiki|notes|dashboard|site|graph|pages?|export)|research notes|research wiki|\.\.\/wiki\b|(^|[^-])wiki\/AGENTS|What may cross|seeded from|library_seed|the seed\b|wiki-reader|\brobot\b|outreach (target|stage)|\bROSTER\b|Source Leads|Research Targets|\bscrub/i;
  const own = [...files].filter((f) => f.endsWith('.md') && !f.startsWith('raw/') || /^raw\/[^/]+\/README\.md$/.test(f));
  for (const f of ['AGENTS.md', 'README.md', ...own]) assert.doesNotMatch(readWiki(f), OUTSIDE, `library-wiki/${f}`);
  const skills = fs.readdirSync(path.join(WIKI, '.agents/skills')).map((d) => `.agents/skills/${d}/SKILL.md`);
  for (const f of skills) assert.doesNotMatch(readWiki(f), OUTSIDE, `library-wiki/${f}`);
  const site = path.resolve('.');
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const mine = [...walk(path.join(site, 'src')), path.join(site, 'README.md'), path.join(site, 'astro.config.mjs')]
    .filter((f) => /\.(astro|js|jsx|ts|mjs|css|md)$/.test(f) && !f.endsWith('wiki.test.js'));
  for (const f of mine) assert.doesNotMatch(fs.readFileSync(f, 'utf8'), OUTSIDE, path.relative(site, f));
});

test('folder guides are not pages', () => {
  for (const f of files) if (/^raw\/(.+\/)?README\.md$/.test(f)) assert.equal(routeOf(f), null, f);
  assert.ok(routeOf('wiki/index.md'));
});
