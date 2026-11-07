// Humans go to the real Drive document, never to the mirror's copy of it (lib/wiki.js driveHref), except a
// full legislative copy, which renders here (lib/wiki.js rendersHere).
// Runs on every page and HTML fragment at build and in dev.
import { defineMiddleware } from 'astro:middleware';
import { linkOutToDrive } from './lib/wiki.js';

export const onRequest = defineMiddleware(async (_, next) => {
  const res = await next();
  if (!res.headers.get('content-type')?.includes('text/html')) return res;
  return new Response(linkOutToDrive(await res.text()), res);
});
