// The library is read in place from ../library-wiki. No schema: frontmatter is shown as written.
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { idOf } from './lib/wiki.js';

const tree = (t: string) =>
  defineCollection({
    loader: glob({ pattern: '**/*.md', base: `../library-wiki/${t}`, generateId: ({ entry }) => idOf(`${t}/${entry}`) }),
  });

export const collections = {
  wiki: tree('wiki'),
  raw: tree('raw'),
  meta: defineCollection({ loader: glob({ pattern: ['AGENTS.md', 'README.md', '.agents/skills/*/SKILL.md'], base: '../library-wiki' }) }),
};
