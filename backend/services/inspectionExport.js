"use strict";
/**
 * Inspection export (GET /api/inspections/export): the inspections matching the list's filters, as
 *   detail=summary  one row per inspection (company, license, checklist, team, status, progress, dates …)
 *   detail=answers  one row per answered question (section, question, answer, files)
 * in format=csv (UTF-8 with BOM, so Excel shows Amharic) or format=json.
 * Times are Ethiopia time, 12-hour (e.g. 13 Nov 2026, 11:39 PM).
 */
const { questionText, statusOptionsFor } = require("../utils/formDefinition");
const { visibleStructure } = require("../utils/formAnswers");

const when = (d) =>
  d
    ? new Date(d)
        .toLocaleString("en-GB", { timeZone: "Africa/Addis_Ababa", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })
        .replace(/\b(am|pm)\b/, (s) => s.toUpperCase())
    : "";
// The last day to submit (due_at is midnight after it)
const lastDay = (d) => (d ? new Date(new Date(d).getTime() - 1).toLocaleDateString("en-GB", { timeZone: "Africa/Addis_Ababa", day: "numeric", month: "short", year: "numeric" }) : "");
const STATUS = { todo: "Not started", in_progress: "In progress", submitted: "Submitted" };

const statusOf = (t) => (t.status === "submitted" ? (t.is_late ? "Submitted late" : "Submitted") : new Date(t.due_at) < new Date() ? `${STATUS[t.status]} (overdue)` : STATUS[t.status] || t.status);

/** One row per inspection. */
const summaryRow = (t, area, progress) => {
  const site = t.submit_location?.site;
  return {
    Company: t.company?.name ?? "",
    "License number": t.license?.license_number ?? "",
    "License type": t.license?.license_type ?? "",
    Region: area?.region ?? "",
    Zone: area?.zone ?? "",
    Woreda: area?.woreda ?? "",
    Checklist: t.form?.name ?? "",
    Schedule: t.schedule?.name ?? "",
    "Round of": t.occurrence_date ?? "",
    "Due by": lastDay(t.due_at),
    Team: t.team?.name ?? "No team",
    Status: statusOf(t),
    "Progress %": t.status === "submitted" ? 100 : progress?.total ? Math.round((progress.answered / progress.total) * 100) : 0,
    "Submitted on": when(t.submitted_at),
    "Submitted by": t.submitter?.full_name ?? "",
    Late: t.status === "submitted" ? (t.is_late ? "Yes" : "No") : "",
    "Returned for correction": t.return_count || 0,
    "Submitted at the site": site ? (site.inside ? "Inside the license area" : `${(site.distance_m / 1000).toFixed(1)} km outside`) : "",
    "Submit location": t.submit_location?.place?.label ?? (t.submit_location?.lat != null ? `${t.submit_location.lat}, ${t.submit_location.lng}` : ""),
    "Inspection id": t.inspection_id,
  };
};

/** An answer as text. */
const answerText = (def, f, a) => {
  if (a == null || a === "") return "";
  const opt = (list, v) => (list || []).find((o) => o.value === v);
  const label = (o) => (o ? o.label_am || o.label : "");
  switch (f.type) {
    case "select":
      return label(opt(f.options, a)) || String(a);
    case "checkboxes":
      return (Array.isArray(a) ? a : []).map((v) => label(opt(f.options, v)) || v).join("; ");
    case "status": {
      const o = opt(statusOptionsFor(def, f), a?.value);
      return [label(o), a?.note, a?.action && `Action: ${a.action}`].filter(Boolean).join(" — ");
    }
    case "photo":
      return Array.isArray(a) && a.length ? `${a.length} file(s)` : "";
    case "signature": {
      const list = (Array.isArray(a) ? a : [a]).filter((x) => x?.file_id);
      return list.length ? list.map((x) => x.name || "signed").join("; ") : "";
    }
    case "table": {
      const cols = f.columns || [];
      return (a?.rows || [])
        .map((r) => {
          const cells = cols
            .map((c) => {
              const v = r.cells?.[c.key];
              if (v == null || v === "") return null;
              return `${c.label_am || c.label}: ${c.type === "signature" ? "signed" : c.type === "select" ? label(opt(c.options, v)) || v : v}`;
            })
            .filter(Boolean);
          return cells.length ? `${r.label ? `${r.label} — ` : ""}${cells.join(", ")}` : null;
        })
        .filter(Boolean)
        .join(" | ");
    }
    default:
      return String(a);
  }
};
const fileCount = (f, a) => (f.type === "photo" ? (Array.isArray(a) ? a.length : 0) : f.type === "status" ? (a?.files?.length ?? 0) : 0);

/** One row per answered question of one inspection. */
const answerRows = (t, def, area) => {
  const base = { Company: t.company?.name ?? "", "License number": t.license?.license_number ?? "", Team: t.team?.name ?? "No team", Status: statusOf(t), "Submitted on": when(t.submitted_at), Region: area?.region ?? "" };
  const answers = t.answers || {};
  const rows = [];
  for (const { section, fields } of visibleStructure(def, t.license?.license_type, answers)) {
    fields.forEach((f, i) => {
      const text = answerText(def, f, answers[f.key]);
      if (!text) return;
      rows.push({
        ...base,
        Section: `${section.number ? `${section.number}. ` : ""}${section.title_am || section.title}`,
        "Question no.": i + 1,
        Question: questionText(f),
        Answer: text,
        Files: fileCount(f, answers[f.key]) || "",
        "Inspection id": t.inspection_id,
      });
    });
  }
  return rows;
};

/** CSV text (UTF-8 BOM so Excel reads Amharic). */
const toCsv = (rows) => {
  if (!rows.length) return "﻿";
  const cols = Object.keys(rows[0]);
  const cell = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [cols.map(cell).join(","), ...rows.map((r) => cols.map((c) => cell(r[c])).join(","))].join("\r\n");
};

module.exports = { summaryRow, answerRows, toCsv };
