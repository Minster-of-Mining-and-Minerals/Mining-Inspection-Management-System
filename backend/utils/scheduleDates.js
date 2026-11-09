/**
 * Dates of an inspection schedule, in Ethiopian local time (UTC+3, no daylight saving).
 *
 * Every schedule has occurrences: the days a new task opens for each license.
 *   once           start_date only
 *   daily          every day, or only the chosen weekdays (0 = Sunday … 6 = Saturday)
 *   weekly         once a week, on weekdays[0] (default: start_date's weekday)
 *   monthly        on month_day (1–28; default: start_date's day)
 *   quarterly      on month_day of every third month counted from start_date's month
 *   yearly         on start_date's month and month_day
 *   every_n_days   start_date, then every interval_days days
 * A task is due at the end of day (occurrence + due_days − 1), i.e. due_days = 1 means "the same day".
 */
const OFFSET_MS = 3 * 60 * 60 * 1000; // Africa/Addis_Ababa
const DAY_MS = 24 * 60 * 60 * 1000;

const parse = (d) => {
  const [y, m, day] = String(d).slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, day);
};
const fmt = (ms) => new Date(ms).toISOString().slice(0, 10);
const addDays = (d, n) => fmt(parse(d) + n * DAY_MS);
const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / DAY_MS);
const weekday = (d) => new Date(parse(d)).getUTCDay();
const dayOfMonth = (d) => new Date(parse(d)).getUTCDate();
const monthIndex = (d) => {
  const x = new Date(parse(d));
  return x.getUTCFullYear() * 12 + x.getUTCMonth();
};

/** Today's date in Ethiopia (YYYY-MM-DD). */
const localToday = (now = new Date()) => fmt(now.getTime() + OFFSET_MS);

/** Start of a local day as a UTC Date. */
const localMidnight = (d) => new Date(parse(d) - OFFSET_MS);

const monthDayOf = (s) => Math.min(28, s.month_day || dayOfMonth(s.start_date));

/** Is this date an occurrence of the schedule? */
const isOccurrence = (s, d) => {
  if (d < String(s.start_date).slice(0, 10)) return false;
  if (s.end_date && d > String(s.end_date).slice(0, 10)) return false;
  switch (s.frequency) {
    case "once":
      return d === String(s.start_date).slice(0, 10);
    case "daily":
      return !s.weekdays?.length || s.weekdays.includes(weekday(d));
    case "weekly":
      return weekday(d) === (s.weekdays?.length ? s.weekdays[0] : weekday(s.start_date));
    case "monthly":
      return dayOfMonth(d) === monthDayOf(s);
    case "quarterly":
      return dayOfMonth(d) === monthDayOf(s) && (monthIndex(d) - monthIndex(s.start_date)) % 3 === 0;
    case "yearly":
      return dayOfMonth(d) === monthDayOf(s) && (monthIndex(d) - monthIndex(s.start_date)) % 12 === 0;
    case "every_n_days":
      return diffDays(s.start_date, d) % Math.max(1, s.interval_days || 1) === 0;
    default:
      return false;
  }
};

/** Occurrences from `from` to `to` (inclusive), at most `limit`. */
const occurrencesBetween = (s, from, to, limit = 400) => {
  const out = [];
  let d = from < String(s.start_date).slice(0, 10) ? String(s.start_date).slice(0, 10) : from;
  for (let i = 0; d <= to && i < 4000 && out.length < limit; i++, d = addDays(d, 1)) if (isOccurrence(s, d)) out.push(d);
  return out;
};

/** The latest occurrence on or before `d` (looks back up to ~13 months). */
const lastOccurrenceOnOrBefore = (s, d) => {
  for (let i = 0, x = d; i < 400; i++, x = addDays(x, -1)) {
    if (x < String(s.start_date).slice(0, 10)) return null;
    if (isOccurrence(s, x)) return x;
  }
  return null;
};

/** The next `count` occurrences from `d` (inclusive). */
const nextOccurrences = (s, d, count = 5) => occurrencesBetween(s, d, addDays(d, 4000), count);

/** When a task opened on `occurrence` is due (exclusive end: midnight after the last allowed day). */
const dueAtFor = (s, occurrence) => localMidnight(addDays(occurrence, Math.max(1, s.due_days || 1)));

/** Days between two occurrences, roughly — used to suggest how long a task may stay open. */
const DEFAULT_DUE_DAYS = { once: 7, daily: 1, weekly: 7, monthly: 30, quarterly: 30, yearly: 30, every_n_days: 1 };

module.exports = {
  localToday,
  localMidnight,
  addDays,
  diffDays,
  isOccurrence,
  occurrencesBetween,
  lastOccurrenceOnOrBefore,
  nextOccurrences,
  dueAtFor,
  DEFAULT_DUE_DAYS,
};
