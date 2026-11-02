// The email the site writes for the visitor's own mail program. The site sends nothing and stores nothing.
// A consortium member reads each suggestion; the library's Suggestions page shows what came in, without names.
// No imports: the browser script and the tests both load this.
export const TO = 'team@californiacompute.org';
export const SUBJECT = 'Suggested reading';

const line = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();
const para = (s) => String(s ?? '').replace(/\r?\n/g, '\r\n').trim(); // keeps the visitor's paragraphs

// s: { url, what, element }. Any of them may be empty; a question goes in `what`.
export function suggestMail(s) {
  const body = [
    `Link: ${line(s.url)}`,
    `Element: ${line(s.element) || 'not sure'}`,
    '',
    'What it is, or my question:',
    para(s.what),
  ].join('\r\n');
  return { subject: SUBJECT, body, href: `mailto:${TO}?subject=${encodeURIComponent(SUBJECT)}&body=${encodeURIComponent(body)}` };
}
