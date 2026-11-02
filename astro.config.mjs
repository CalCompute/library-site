// Content comes from ../library-wiki at build and dev time. After a clean build, restart `astro dev` (or save this file) to reload it.
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
import remarkWiki from './src/lib/remark-wiki.mjs';

export default defineConfig({
  site: 'https://research.californiacompute.org',
  output: 'static',
  build: { format: 'directory' },
  trailingSlash: 'ignore',
  markdown: { remarkPlugins: [remarkWiki], syntaxHighlight: false },
  integrations: [react()],
  vite: {
    plugins: [tailwindcss()],
    server: { fs: { allow: ['..'] } }, // the library lives in ../library-wiki
  },
});
