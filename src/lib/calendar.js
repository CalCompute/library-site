// Dates as YYYY-MM-DD strings, in UTC so no local offset moves a day.
// No imports: the tests load it.
export const clock = (t) => { if (!t) return ''; const h = +t.slice(0, 2); return `${h % 12 || 12}:${t.slice(3, 5)}${h < 12 ? ' am' : ' pm'}`; };
export const span = (a, b) => (a ? `${clock(a)}${b ? ` to ${clock(b)}` : ''}` : 'no time');

const D = (iso) => new Date(`${iso}T00:00:00Z`);
export const addDays = (iso, n) => { const d = D(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// Calendar weeks run Sunday to Saturday.
export const sundayOf = (iso) => addDays(iso, -D(iso).getUTCDay());
export const days7 = (start) => Array.from({ length: 7 }, (_, i) => addDays(start, i));
export const dayName = (iso, opts = { weekday: 'short', month: 'short', day: 'numeric' }) => D(iso).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' });
// Today in Pacific, the consortium's time zone.
export const todayPT = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
