// The public library-wiki repository as a file tree for RepoBrowser: every file git tracks or would track
// (git ls-files honours .gitignore, so .venv/ and .cache/ stay out), each linked to its page on GitHub.
// Each file and folder carries its latest commit's date and subject, from one git log, as GitHub shows them.
// Before the first commit there are none.
import { execFileSync } from 'node:child_process';
import { WIKI, RAW_FOLDERS, routeOf } from './wiki.js';

export const REPO = 'https://github.com/CalCompute/library-wiki';
const NOTES = {
  wiki: 'The pages: sources, element reading lists, entities, concepts and analyses.',
  raw: 'The originals, never edited: government documents and open-licensed files with their Markdown copies.',
  bin: 'The scripts that download sources and keep the Drive.',
  '.agents': 'The skills: how an agent ingests, answers, checks and pushes.',
  ...Object.fromEntries(Object.entries(RAW_FOLDERS).map(([k, [, note]]) => [`raw/${k}`, note])),
};

const git = (...args) => { try { return execFileSync('git', ['-C', WIKI, '-c', 'core.quotePath=false', ...args], { encoding: 'utf8', maxBuffer: 1 << 26, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return ''; } };
const enc = (p) => p.split('/').map(encodeURIComponent).join('/');

export function repoTree() {
  const paths = git('ls-files', '--cached', '--others', '--exclude-standard').split('\n').filter(Boolean).sort();
  const last = new Map(); // path -> newest [date, subject]: git log lists newest first
  let commit = ['', ''];
  for (const line of git('log', '--format=@%cs%x09%s', '--name-only').split('\n')) {
    if (line.startsWith('@')) commit = line.slice(1).split('\t');
    else if (line && !last.has(line)) last.set(line, commit);
  }
  const root = { name: 'library-wiki', id: '', url: REPO, note: '', modified: '', commit: '', children: [], files: [] };
  const dir = (segs) => segs.reduce((n, s, i) => {
    let c = n.children.find((x) => x.name === s);
    if (!c) {
      const p = segs.slice(0, i + 1).join('/');
      c = { name: s, id: p, url: `${REPO}/tree/main/${enc(p)}`, note: NOTES[p] ?? '', modified: '', commit: '', children: [], files: [] };
      n.children.push(c);
    }
    return c;
  }, root);
  for (const p of paths) {
    const segs = p.split('/'), name = segs.pop(), [modified, subject] = last.get(p) ?? ['', ''];
    dir(segs).files.push({ name, path: p, url: `${REPO}/blob/main/${enc(p)}`, route: routeOf(p), modified, commit: subject });
  }
  // A folder shows the newest commit among its contents, as GitHub does.
  const sort = (n) => {
    n.children.sort((a, b) => a.name.localeCompare(b.name)); n.files.sort((a, b) => a.name.localeCompare(b.name)); n.children.forEach(sort);
    const newest = [...n.files, ...n.children].reduce((x, y) => (y.modified > x.modified ? y : x), { modified: '', commit: '' });
    Object.assign(n, { modified: newest.modified, commit: newest.commit });
  };
  sort(root);
  return root;
}
