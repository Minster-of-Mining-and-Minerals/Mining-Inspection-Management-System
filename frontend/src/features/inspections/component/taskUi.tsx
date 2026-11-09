"use client";

import type { Schedule, SchedulePayload, TaskListItem } from "@/redux/types/inspection";
import { WEEKDAY_LONG, WEEKDAY_SHORT } from "@/redux/types/inspection";
import { formatCalendarDate, formatDateTime } from "@/utils/date";

const ordinal = (n: number) => `${n}${n % 10 === 1 && n !== 11 ? "st" : n % 10 === 2 && n !== 12 ? "nd" : n % 10 === 3 && n !== 13 ? "rd" : "th"}`;
const weekdayOf = (d: string) => new Date(`${d.slice(0, 10)}T00:00:00Z`).getUTCDay();
const dayOf = (d: string) => Number(d.slice(8, 10));

/** "Every week on Monday", "Every day (Mon–Fri)", "On the 15th of every month" … */
export const describeFrequency = (s: Pick<SchedulePayload, "frequency" | "weekdays" | "month_day" | "interval_days" | "start_date">) => {
  const start = s.start_date || "";
  const md = s.month_day || (start ? Math.min(28, dayOf(start)) : 1);
  switch (s.frequency) {
    case "once":
      return start ? `Once, on ${formatCalendarDate(start)}` : "Once";
    case "daily":
      return s.weekdays?.length && s.weekdays.length < 7 ? `Every day (${[...s.weekdays].sort().map((d) => WEEKDAY_SHORT[d]).join(", ")})` : "Every day";
    case "weekly":
      return `Every week on ${WEEKDAY_LONG[s.weekdays?.length ? s.weekdays[0] : start ? weekdayOf(start) : 1]}`;
    case "monthly":
      return `On the ${ordinal(md)} of every month`;
    case "quarterly":
      return `On the ${ordinal(md)}, every 3 months`;
    case "yearly":
      return start ? `Every year on ${formatCalendarDate(`${start.slice(0, 8)}${String(md).padStart(2, "0")}`).replace(/, \d{4}$/, "")}` : "Every year";
    case "every_n_days":
      return `Every ${s.interval_days || "?"} days`;
    default:
      return "";
  }
};

export const describeDue = (days: number) => (days === 1 ? "due the same day" : `due within ${days} days`);

export const describeTarget = (s: Pick<Schedule, "target_type" | "license_type"> & { license_count?: number }) =>
  s.target_type === "assigned"
    ? "Everyone the checklist applies to"
    : s.target_type === "license_type"
      ? `All ${s.license_type} licenses`
      : `${s.license_count ?? "Chosen"} chosen license${s.license_count === 1 ? "" : "s"}`;

/** To do / In progress / Overdue / Submitted / Submitted late */
export function TaskStatusBadge({ task, className = "" }: { task: Pick<TaskListItem, "status" | "is_overdue" | "is_late" | "return_count">; className?: string }) {
  const [label, tone] =
    task.status === "submitted"
      ? task.is_late
        ? ["Submitted late", "bg-amber-100 text-amber-800"]
        : ["Submitted", "bg-green-100 text-green-800"]
      : task.is_overdue
        ? [task.status === "in_progress" ? "Overdue · started" : "Overdue", "bg-red-100 text-red-700"]
        : task.status === "in_progress"
          ? [task.return_count ? "Returned for correction" : "In progress", task.return_count ? "bg-violet-100 text-violet-800" : "bg-sky-100 text-sky-800"]
          : ["To do", "bg-slate-100 text-slate-700"];
  return <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${tone} ${className}`}>{label}</span>;
}

/** "Due 14 Nov 2026, 00:00" shown as the last allowed day: the due time is midnight after it. */
export const dueText = (dueAt: string) => {
  const lastDay = new Date(new Date(dueAt).getTime() - 1);
  return formatDateTime(lastDay).replace(/, 23:59$/, "");
};

export const scoreText = (score: number | null | undefined) => (score == null ? "—" : `${Math.round(score * 100)}%`);

export const scoreTone = (score: number | null | undefined) =>
  score == null ? "text-slate-500" : score >= 0.8 ? "text-green-700" : score >= 0.5 ? "text-amber-700" : "text-red-700";
