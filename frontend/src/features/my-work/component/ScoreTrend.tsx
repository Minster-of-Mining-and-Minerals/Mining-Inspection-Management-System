"use client";

import { scoreText } from "@/features/inspections/component/taskUi";

/** Small bars of the latest scores, oldest → newest, with a text version for screen readers. */
export function ScoreTrend({ scores }: { scores: (number | null)[] }) {
  const shown = scores.filter((s): s is number => s != null);
  if (shown.length < 2) return null;
  const label = `Scores, oldest to newest: ${shown.map((s) => scoreText(s)).join(", ")}`;
  return (
    <div className="flex items-end gap-1" role="img" aria-label={label} title={shown.map((s) => scoreText(s)).join(" → ")}>
      {shown.map((s, i) => (
        <span
          key={i}
          className={`w-2.5 rounded-sm ${s >= 0.8 ? "bg-green-600" : s >= 0.5 ? "bg-amber-500" : "bg-red-500"} ${i === shown.length - 1 ? "" : "opacity-60"}`}
          style={{ height: `${Math.max(4, Math.round(s * 28))}px` }}
        />
      ))}
    </div>
  );
}
