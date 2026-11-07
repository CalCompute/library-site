# CalCompute Research Library: site

The website of the [CalCompute Research Library](https://github.com/CalCompute/library-wiki). It turns the library's Markdown files into web pages: the seven element reading lists, every source, a graph of how the pages link, full-text search, the statute, and a browser for the public Google Drive. It has no sign-in and stores nothing about visitors.

## How it works

- The site reads `../library-wiki` in place (set `WIKI_DIR` to read another folder) and never writes to it. All content changes happen in the library repo, following its `AGENTS.md`.
- `npm run build` renders every page with Astro, draws the knowledge graph as `graph.png` (`scripts/graph-png.mjs`: the graph page's Save PNG, laid out by the same code as the page, `src/lib/graph-layout.js`; every node the Report reaches, no links, transparent, 1800 px square), and builds the search index with Pagefind. CaliforniaCompute.org shows `/graph.png` on its home page, so each deploy of this site updates it there. The site holds no source documents: an original opens its copy in the public Google Drive, or the publisher's page. The shelves on /library/ show each PDF source by its first page: `npm run covers` renders them into `public/covers/` (needs `pdftoppm`), and the covers are committed. For a PDF the library may not rehost, the script fetches it into `../library-wiki/.cache/` and keeps only the small cover.
- `/stats.json` is the home page's counts (`src/pages/stats.json.ts`). CaliforniaCompute.org's Framework section reads it live, so `public/_headers` lets any origin fetch it.
- The home page's Framework Report bar (`src/components/ReportProgress.astro`) fills from SB-53's signing (Sept. 29, 2025) to the report's due date (Jan. 1, 2027), with no label, dates or percent, and a shimmer on the fill; the fill grows from empty when the bar comes into view. CaliforniaCompute.org shows the same bar, labelled.
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

A Cloudflare Worker serves the built site as static assets (`wrangler.jsonc`). Cloudflare builds and deploys it from GitHub. There are no workflows, tokens or secrets: both repos are public.

- **Worker:** `calcompute-library`, connected to `CalCompute/library-site`, branch `main`, custom domain https://research.californiacompute.org.
- **Build command:** `git clone https://github.com/CalCompute/library-wiki.git ../library-wiki && npm run build`. The full clone gives the GitHub view on the home page each file's last change.
- **Deploy command:** `npx wrangler deploy`. It uploads `dist/`. Node comes from `.node-version`.
- **Library changes:** Cloudflare watches only this repo. To rebuild when `CalCompute/library-wiki` changes, add the Worker's build hook (if Cloudflare offers one for the Worker) as a push webhook on that repo, or push to this repo.

## Credits

The CalCompute wordmark, icon, favicons, member photos and institution marks in `public/` come from the CalCompute public site. The Google Drive, Docs and Sheets icons are public-domain SVGs from Wikimedia Commons. Kunst Grotesk is the site font.
