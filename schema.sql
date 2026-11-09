-- The D1 database behind /api/subscribe and /api/suggest (src/worker.js). Applied by hand, once:
--   npx wrangler d1 execute calcompute-community --remote --file schema.sql
-- and with --local for `npx wrangler dev`. Read it with npm run submissions and npm run subscribers.

CREATE TABLE IF NOT EXISTS subscribers (
  email TEXT PRIMARY KEY,
  source TEXT,                -- host and path of the page the form was on
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS suggestions (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('reading', 'correction', 'data', 'question')),
  about TEXT,                 -- the page or item it concerns
  link TEXT,                  -- a source the visitor points to
  what TEXT NOT NULL,
  element TEXT,
  name TEXT,
  email TEXT,
  institution TEXT,
  source TEXT,                -- host and path of the page the form was on
  status TEXT NOT NULL DEFAULT 'new', -- set to 'done' once a member has read and decided
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
