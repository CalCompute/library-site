# CalCompute Research Library: site

The website of the [CalCompute Research Library](https://github.com/CalCompute/library-wiki). It turns the library's Markdown files into web pages: the seven element reading lists, every source, a graph of how the pages link, full-text search and the statute, with links to the public Google Drive. It has no sign-in and sets no cookies. It stores only what visitors send through its two forms.

## How it works

- The site reads `../library-wiki` in place (set `WIKI_DIR` to read another folder) and never writes to it. All content changes happen in the library repo, following its `AGENTS.md`.
- `npm run build` renders every page with Astro, draws the knowledge graph as `graph.png` (`scripts/graph-png.mjs`: the graph page's Save PNG, laid out by the same code as the page, `src/lib/graph-layout.js`; every node the Report reaches, no links, transparent, 1800 px square), and builds the search index with Pagefind. CaliforniaCompute.org shows `/graph.png` on its home page, so each deploy of this site updates it there. The site holds no source documents: an original opens its copy in the public Google Drive, or the publisher's page. The shelves on /library/ show each PDF source by its first page: `npm run covers` renders them into `public/covers/` (needs `pdftoppm`), and the covers are committed. For a PDF the library may not rehost, the script fetches it into `../library-wiki/.cache/` and keeps only the small cover.
- **`/explorer/` is the Compute Governance Explorer.** It is not built here. Its own Worker, from [CalCompute/compute-governance-explainer](https://github.com/CalCompute/compute-governance-explainer), takes the route `research.californiacompute.org/explorer*` and wears a copy of this site's header and footer. This site links to it (header nav, footer, the element C reading list, About, How it works and the search list), and the home page frames its two 3-D views of one system, picked at random on each visit, from `/explorer/?embed`; in `npm run dev` the frame reads the explorer's own dev server at http://localhost:5173. When you change the header or footer in `src/layouts/Layout.astro`, copy the change to that repo's `index.html` and `src/chrome.css`.
- **The header and footer share one frame with CaliforniaCompute.org's** (Nov. 10, 2026): one width for header, content and footer on both sites (`max-w-7xl`, 1280px, `px-4`; the main site's `--max-width-site`), the wordmark on the left gutter, then links, the Search button with its magnifier icon, as tall as the button beside it (`.nav-search`; the explorer has the same one and a dialog without suggestions; the main site has a search box drawn the same way; no keyboard shortcut, the user's call, Nov. 10, 2026) and the same "Take the survey" button (`.nav-cta` in `src/styles/global.css`, a value-for-value copy of the main site's header button), with a menu below 1025px. The footer's first column is the main site's, value for value (`.fb` in `src/styles/global.css`, `NewsletterForm.astro` with `dark`, and the California and US flags in `public/images/`), and the footers stack the same way below 1025px (link columns first, then that column across the row). Colours, type, links and footer columns stay each site's own. Change the frame on both sites and in the explorer. `/explorer/` returns 404 in `npm run dev` here.
- `/stats.json` is the home page's counts (`src/pages/stats.json.ts`). CaliforniaCompute.org's Framework section reads it live, so `public/_headers` lets any origin fetch it.
- **`/directory/` is the Landscape**, the library's research view of its directory pages: programs and resources, research projects and organizations, funding and policy, and research institutions, by region. Finding a program to use is a CalCompute service on CaliforniaCompute.org, the California Compute Directory at `/directory/` there (Nov. 10, 2026: services on the main site, research here). It reads `/directory.json` (`src/pages/directory.json.ts`) when it builds: the 69 programs and resources as plain text, with their sources' library addresses, and the region map. So a change to the directory page reaches that service at its next build. Its corrections post to this Worker's `/api/suggest`, like this site's.
- The home page's Framework Report bar (`src/components/ReportProgress.astro`) fills from SB-53's signing (Sept. 29, 2025) to the report's due date (Jan. 1, 2027), with no label, dates or percent, and a shimmer on the fill; the fill grows from empty when the bar comes into view. CaliforniaCompute.org shows the same bar, labelled.
- **Forms.** *Suggest or correct* (`src/components/SuggestDialog.astro`) takes a source, a correction, data or a question; the newsletter sign-up (`src/components/NewsletterForm.astro`, in the footer) takes an email address and sends nothing yet. Both post to `/api/*` on this Worker (`src/worker.js`), which checks each post with Cloudflare Turnstile and stores it in the D1 database `calcompute-community` (`schema.sql`). The explorer and CaliforniaCompute.org post to the same endpoints; their copies of `src/lib/forms.js` must match it. A person reads every suggestion: `npm run submissions` prints the new ones, `npm run subscribers` the list, and `scripts/submissions.mjs` shows how to mark one read. Nothing a visitor sends changes the library by itself.
- The home page's five counts, the calendar, and the hollow markers in the graph for the consortium's calls and messages come from `library-wiki/activity.json`, which the consortium's team publishes. It holds kinds, dates, element letters and counts only.

## Run it

```bash
git clone https://github.com/CalCompute/library-wiki.git
git clone https://github.com/CalCompute/library-site.git
cd library-site && npm ci
npm run dev      # http://localhost:4321
npm test         # checks links, rehosting, the form parsers, and that the library holds only its own material
```

## Deploy

A Cloudflare Worker serves the built site as static assets (`wrangler.jsonc`), and runs `src/worker.js` for `/api/*` only. Cloudflare builds and deploys it from GitHub. There are no workflows or tokens; the one secret, `TURNSTILE_SECRET`, is set on the Worker in the dashboard.

- **Worker:** `calcompute-public-library`, connected to `CalCompute/library-site`, branch `main`, custom domain https://research.californiacompute.org.
- **Build command:** `git clone https://github.com/CalCompute/library-wiki.git ../library-wiki && npm run build`. The full clone gives the GitHub view on the home page each file's last change.
- **Deploy command:** `npx wrangler deploy`. It uploads `dist/`. Node comes from `.node-version`.
- **Library changes:** Cloudflare watches only this repo. A push to `CalCompute/library-wiki` changes nothing on the site by itself; its content appears on the next build here. To publish library changes, push to this repo (an empty commit is enough: `git commit --allow-empty -m "Rebuild for library-wiki <sha>"`).

### Forms: one-time setup

Do these once, in this order, before the first push that carries `src/worker.js`. None of them is a deploy.

1. Cloudflare dashboard → Turnstile → Add widget, Managed mode. Hostnames `californiacompute.org` (it covers `www.` and `research.`) and `californiacompute-org.pages.dev` (the main site's previews). Put its site key in `SITEKEY` in `src/lib/forms.js` here, in the explorer's `src/forms.ts` and in CaliforniaCompute.org's `site/src/lib/forms.js`.
2. Workers & Pages → `calcompute-public-library` → Settings → Variables and Secrets → add the secret `TURNSTILE_SECRET` with the widget's secret key. Without it every post is refused.
3. `npx wrangler d1 create calcompute-community`, put the `database_id` it prints in `wrangler.jsonc`, then `npx wrangler d1 execute calcompute-community --remote --file schema.sql`.

To run the forms locally: `npm run build`, `npx wrangler d1 execute calcompute-community --local --file schema.sql`, a `.dev.vars` file with `TURNSTILE_SECRET=1x0000000000000000000000000000000AA` (Turnstile's always-pass test secret), then `npx wrangler dev` (http://localhost:8787).

## Credits

The CalCompute wordmark, icon, favicons, member photos and institution marks in `public/` come from the CalCompute public site. Most marks of the research institutions directory came to that site from Wikimedia Commons (Sept. 29, 2026); each mark is used only to name its own institution. The Google Drive, Docs and Sheets icons are public-domain SVGs from Wikimedia Commons. Kunst Grotesk is the site font.
