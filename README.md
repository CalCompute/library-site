# CalCompute Research Library: site

The website of the [CalCompute Research Library](https://github.com/CalCompute/library-wiki). It turns the library's Markdown files into web pages: the seven element reading lists, every source, a graph of how the pages link, full-text search, the statute, and a browser for the public Google Drive. It has no sign-in and stores nothing about visitors.

## How it works

- The site reads `../library-wiki` in place (set `WIKI_DIR` to read another folder) and never writes to it. All content changes happen in the library repo, following its `AGENTS.md`.
- `npm run build` renders every page with Astro and builds the search index with Pagefind. The site holds no source documents: an original opens its copy in the public Google Drive, or the publisher's page.
- **Suggest reading** opens the visitor's own email program with a message to team@californiacompute.org (`src/components/SuggestDialog.astro`, `src/lib/mailto.js`). The site sends nothing.
- The home page's five counts, the calendar, and the hollow markers in the graph for the consortium's calls and messages come from `library-wiki/activity.json`, which the consortium's team publishes. It holds kinds, dates, element letters and counts only.

## Run it

```bash
git clone https://github.com/CalCompute/library-wiki.git
git clone https://github.com/CalCompute/library-site.git
cd library-site && npm ci
npm run dev      # http://localhost:4321
npm test         # checks links, rehosting, the suggestion email, and that the library holds only its own material
```

## Deploy

Cloudflare Pages builds and publishes the site from GitHub. There are no workflows, tokens or secrets: both repos are public.

- **Project:** a Cloudflare Pages project `calcompute-library`, connected to `CalCompute/library-site`, production branch `main`, custom domain https://research.californiacompute.org.
- **Build command:** `git clone https://github.com/CalCompute/library-wiki.git ../library-wiki && npm run build`. The full clone gives the GitHub view on the home page each file's last change.
- **Output folder:** `dist`. Node comes from `.node-version`.
- **Library changes:** Cloudflare watches only this repo. A Pages deploy hook, added as a push webhook on `CalCompute/library-wiki` (Settings, Webhooks), rebuilds the site when the library changes.

## Credits

The CalCompute wordmark, icon, favicons, member photos and institution marks in `public/` come from the CalCompute public site. The Google Drive, Docs and Sheets icons are public-domain SVGs from Wikimedia Commons. Kunst Grotesk is the site font.
