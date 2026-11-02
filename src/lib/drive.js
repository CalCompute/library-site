// The public Shared Drive exactly as it is, from raw/drive/.listing.json, which bin/drive_push.py writes:
// every file and folder. No role column: DRIVE_UI has no `short` labels.
import { readJson, readWiki, pyconst, routeOf } from './wiki.js';

const KIND = { 'application/vnd.google-apps.document': 'Doc', 'application/vnd.google-apps.spreadsheet': 'Sheet',
  'application/vnd.google-apps.presentation': 'Slides', 'application/vnd.google-apps.form': 'Form', 'application/pdf': 'PDF' };
const kindOf = (mime, name) => KIND[mime] ?? (mime.startsWith('video/') ? 'Video' : name.match(/\.(\w{1,5})$/)?.[1]?.toUpperCase() ?? 'File');

export const DRIVE_UI = {
  open: 'Open in Drive ↗', openIcon: '/images/apps/google-drive.svg', search: 'Search the Drive', hash: 'drive', context: 'Google Drive', empty: 'Nothing here.',
};

export function driveTree(m) {
  // The public root folder (bin/drive_push.py PUBLIC_ROOT): a Shared Drive's own root cannot be shared by link.
  const DRIVE = pyconst(readWiki('bin/drive_push.py'), 'PUBLIC_ROOT') || 'CalCompute Library';
  const notes = pyconst(readWiki('bin/drive_push.py'), 'GUIDE_NOTES') || {};
  const root = { name: DRIVE, id: m.folders[DRIVE] ?? null, url: m.folders[DRIVE] ? `https://drive.google.com/drive/folders/${m.folders[DRIVE]}` : '', note: '', bot: 'reads', children: [], files: [] };
  const at = (segs) => segs.reduce((n, s) => {
    let c = n.children.find((x) => x.name === s);
    if (!c) { c = { name: s, id: null, url: '', note: notes[s] ?? '', bot: '', children: [], files: [] }; n.children.push(c); }
    return c;
  }, root);
  for (const x of readJson('raw/drive/.listing.json') ?? []) {
    const segs = x.path.split('/').slice(1);
    if (x.path.split('/')[0] !== DRIVE) continue;
    if (x.folder) { Object.assign(at([...segs, x.name]), { id: x.id, url: x.url, bot: x.bot }); continue; }
    const route = x.copy && m.byRel.has(x.copy) ? routeOf(x.copy) : null;
    at(segs).files.push({ name: x.name, kind: kindOf(x.mime, x.name), modified: x.modified.slice(0, 10), by: x.by, drive: x.url, note: notes[x.name] ?? '',
      preview: null, role: x.bot, // No preview pages on this site; the row opens the Drive file
      cites: x.copy ? (m.linksIn.get(x.copy) ?? []).filter((r) => r.startsWith('wiki/')).length : 0 });
  }
  const sort = (n) => { n.children.sort((a, b) => a.name.localeCompare(b.name)); n.files.sort((a, b) => a.name.localeCompare(b.name)); n.children.forEach(sort); };
  sort(root);
  return root;
}
