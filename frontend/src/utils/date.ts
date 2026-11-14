import { DATE_FALLBACK, SYSTEM_TIMEZONE } from "@/config/datetime";

export { SYSTEM_TIMEZONE, DATE_FALLBACK };

const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME_NO_TZ =
  /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?$/;

/**
 * Normalize API / DB values to a parseable UTC ISO string.
 * Mobile browsers reject ambiguous formats (e.g. "2026-06-24 08:30:00").
 */
function normalizeToIsoUtcString(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (ISO_DATE_ONLY.test(trimmed)) {
    return `${trimmed}T00:00:00.000Z`;
  }

  if (/Z$/i.test(trimmed) || /[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  if (ISO_DATETIME_NO_TZ.test(trimmed)) {
    const withT = trimmed.replace(" ", "T");
    const withMs = withT.includes(".") ? withT : `${withT}.000`;
    return `${withMs}Z`;
  }

  const ms = Date.parse(trimmed);
  if (!Number.isNaN(ms)) {
    return new Date(ms).toISOString();
  }

  return null;
}

/** Parse any supported value into a valid UTC Date, or null. */
export function parseUtcDate(value: unknown): Date | null {
  if (value == null || value === "") return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  if (typeof value === "string") {
    const iso = normalizeToIsoUtcString(value);
    if (!iso) return null;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  return null;
}

export function isValidDate(value: unknown): boolean {
  return parseUtcDate(value) !== null;
}

/** Serialize to ISO UTC string for API payloads. */
export function toUtc(value: unknown): string | null {
  const d = parseUtcDate(value);
  return d ? d.toISOString() : null;
}

/** Alias — parse ISO UTC from API. */
export function fromUtc(value: unknown): Date | null {
  return parseUtcDate(value);
}

export function getUtcTimestamp(value: unknown): number | null {
  const d = parseUtcDate(value);
  return d ? d.getTime() : null;
}

export function compareUtcDates(a: unknown, b: unknown): number {
  const ta = getUtcTimestamp(a);
  const tb = getUtcTimestamp(b);
  if (ta == null && tb == null) return 0;
  if (ta == null) return -1;
  if (tb == null) return 1;
  return ta - tb;
}

function formatWithTimezone(
  value: unknown,
  options: Intl.DateTimeFormatOptions,
): string {
  const d = parseUtcDate(value);
  if (!d) return DATE_FALLBACK;

  try {
    // "2:30 pm" → "2:30 PM"
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: SYSTEM_TIMEZONE,
      ...options,
    })
      .format(d)
      .replace(/\b(am|pm)\b/, (s) => s.toUpperCase());
  } catch {
    return DATE_FALLBACK;
  }
}

/** e.g. 24 Jun 2026 */
export function formatDate(value: unknown): string {
  return formatWithTimezone(value, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/**
 * A calendar date with no time, e.g. a license issue date "2025-09-23" -> "Sep 23, 2025".
 * Never shifted by timezone (formatDate would treat it as midnight UTC).
 */
export function formatCalendarDate(value: string | null | undefined): string {
  if (!value) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return String(value);
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });
}

/** e.g. 2:30 PM */
export function formatTime(value: unknown): string {
  return formatWithTimezone(value, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** e.g. 24 Jun 2026, 2:30 PM */
export function formatDateTime(value: unknown): string {
  return formatWithTimezone(value, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/** Grouping label — date only, en-GB in system timezone */
export function formatDateLabel(value: unknown): string {
  return formatWithTimezone(value, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

export function formatRelativeTime(
  value: unknown,
  now: Date = new Date(),
): string {
  const d = parseUtcDate(value);
  if (!d) return "Recently";

  const diffMinutes = Math.floor((now.getTime() - d.getTime()) / 60000);
  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  if (diffMinutes < 1440) return `${Math.floor(diffMinutes / 60)}h ago`;
  return formatDate(d);
}

export function getYearInTimezone(value: unknown): number | null {
  const d = parseUtcDate(value);
  if (!d) return null;

  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: SYSTEM_TIMEZONE,
      year: "numeric",
    }).formatToParts(d);
    const year = parts.find((p) => p.type === "year")?.value;
    return year ? parseInt(year, 10) : null;
  } catch {
    return null;
  }
}

export function formatMonthShort(value: unknown): string {
  return formatWithTimezone(value, { month: "short" });
}

export function formatMonthYear(value: unknown): string {
  return formatWithTimezone(value, { month: "short", year: "numeric" });
}

export function formatLongMonthYear(value: unknown): string {
  return formatWithTimezone(value, { month: "long", year: "numeric" });
}

export function formatDayMonth(value: unknown): string {
  const d = parseUtcDate(value);
  if (!d) return DATE_FALLBACK;
  const day = formatWithTimezone(d, { day: "numeric" });
  const month = formatWithTimezone(d, { month: "short" });
  return `${day} ${month}`;
}

/** YYYY-MM-DD in system timezone for &lt;input type="date" /&gt; */
export function toDateInputValue(value: unknown): string {
  const d = parseUtcDate(value);
  if (!d) return "";

  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: SYSTEM_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(d);

    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    const day = parts.find((p) => p.type === "day")?.value;
    if (!y || !m || !day) return "";
    return `${y}-${m}-${day}`;
  } catch {
    return "";
  }
}

/** YYYY-MM-DD bucket key in system timezone (charts / grouping) */
export function toGroupingDayKey(value: unknown): string {
  return toDateInputValue(value);
}

/** YYYY-MM bucket key in system timezone */
export function toMonthGroupingKey(value: unknown): string {
  const d = parseUtcDate(value);
  if (!d) return "";

  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: SYSTEM_TIMEZONE,
      year: "numeric",
      month: "2-digit",
    }).formatToParts(d);
    const y = parts.find((p) => p.type === "year")?.value;
    const m = parts.find((p) => p.type === "month")?.value;
    if (!y || !m) return "";
    return `${y}-${m}`;
  } catch {
    return "";
  }
}

export function todayDateInputValue(): string {
  return toDateInputValue(new Date());
}

export function tomorrowDateInputValue(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + 1);
  return toDateInputValue(d);
}

export function nowUtcIso(): string {
  return new Date().toISOString();
}

export function isWithinDaysRange(
  value: unknown,
  rangeDays: number,
  now: Date = new Date(),
): boolean {
  const d = parseUtcDate(value);
  if (!d) return false;
  const diffDays = (now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
  return diffDays <= rangeDays;
}

export function isWithinRange(
  value: unknown,
  range: "90d" | "30d" | "7d",
  now: Date = new Date(),
): boolean {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return isWithinDaysRange(value, days, now);
}
