"use client";

/**
 * "Open sections for update": reviewers open chosen sections of SUBMITTED inspections so the team can fill
 * in or correct them until a deadline (or with no deadline). The inspection stays submitted.
 *
 *   OpenSectionsDialog  which inspections (one, chosen licenses, a round, a team, a region, the ones not open yet),
 *                       which sections, the deadline and the reason; or add them to an open opening with the same sections
 *   OpeningsPanel       the openings of an inspection or a round, with progress, Edit, Close now and Close all
 *   OpeningCard         one opening (also used by the "Opened for update" page)
 *   EditOpeningDialog   change an open opening's sections, deadline and reason
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, Clock, Loader2, LockOpen, Pencil, Search, Unlock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useCloseAllOpeningsMutation,
  useCloseOpeningMutation,
  useCreateOpeningMutation,
  useGetOpeningQuery,
  useGetOpeningsQuery,
  usePreviewOpeningQuery,
  useUpdateOpeningMutation,
} from "@/redux/api/inspectionApi";
import { useGetSubmissionMapOptionsQuery } from "@/redux/api/dashboardApi";
import type { OpeningScope, OpeningScopeQuery, SectionOpening, SectionOpeningDetail } from "@/redux/types/inspection";
import { formatCalendarDate, formatDate, formatDateTime } from "@/utils/date";

/** The server's message of a failed request */
const messageOf = (e: unknown, fallback: string) => (e as { data?: { message?: string } } | undefined)?.data?.message || fallback;

const inputCls = "h-10 w-full rounded-md border border-input bg-white px-3 text-sm";

/** YYYY-MM-DD in Addis Ababa, `days` from today */
const dayFromToday = (days: number) => new Date(Date.now() + days * 864e5).toLocaleDateString("en-CA", { timeZone: "Africa/Addis_Ababa" });
/** A deadline as the YYYY-MM-DD of its day in Addis Ababa (deadlines are the end of a day) */
const dayOf = (iso: string) => new Date(new Date(iso).getTime() - 1000).toLocaleDateString("en-CA", { timeZone: "Africa/Addis_Ababa" });
/** The end of a chosen day in Addis Ababa */
const endOfDay = (day: string) => `${day}T23:59:59+03:00`;

/** Sections as "7, 8" → "Section 7" / "Sections 7, 8" */
export const sectionsText = (labels: string[]) => (labels.length === 1 ? `Section ${labels[0]}` : `Sections ${labels.join(", ")}`);
/** "until Nov 29" / "no deadline" */
export const untilText = (until: string | null | undefined) => (until ? `until ${formatDate(until)}` : "no deadline");

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const toggle = (set: Set<string>, key: string) => {
  const next = new Set(set);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
};
const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));

/* =================== deadline field (open and edit) =================== */

function DeadlineField({ id, day, onDay, disabled, was }: { id: string; day: string; onDay: (d: string) => void; disabled?: boolean; was?: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input id={id} type="date" className={`${inputCls} max-w-[200px]`} min={dayFromToday(0)} value={day} disabled={disabled} onChange={(e) => onDay(e.target.value)} />
      {was && dayOf(was) !== day && <span className="text-xs font-semibold text-amber-700">was {formatDate(was)}</span>}
    </div>
  );
}

/* =================== open =================== */

interface DialogProps {
  /** Opened from one submitted inspection: "This inspection" is offered (and is the default) */
  inspectionId?: string;
  /** The round (schedule + day): the round-wide choices are offered */
  scheduleId?: string | null;
  occurrenceDate?: string | null;
  /** Team of the inspection (pre-selects "All of a team") */
  teamId?: string | null;
  onClose: () => void;
}

/** "remaining": the round's submitted inspections not already open for the chosen sections */
type UiScope = OpeningScope | "remaining";

export function OpenSectionsDialog({ inspectionId, scheduleId, occurrenceDate, teamId, onClose }: DialogProps) {
  const inRound = !!scheduleId && !!occurrenceDate;
  const [scope, setScope] = useState<UiScope>(inspectionId ? "inspection" : "round");
  const [team, setTeam] = useState(teamId ?? "");
  const [region, setRegion] = useState("");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(inspectionId ? [inspectionId] : []));
  const [search, setSearch] = useState("");
  const [sections, setSections] = useState<Set<string>>(new Set());
  const [until, setUntil] = useState(dayFromToday(7));
  const [reason, setReason] = useState("");
  const [separate, setSeparate] = useState(false);
  const { data: options } = useGetSubmissionMapOptionsQuery(undefined, { skip: !inRound });

  // What the preview asks for: chosen licenses and "not open yet" are worked out from the whole round
  const query: OpeningScopeQuery | null = useMemo(() => {
    if (scope === "inspection") return inspectionId ? { scope, inspection_id: inspectionId } : null;
    if (!inRound) return null;
    const round = { schedule_id: scheduleId!, occurrence_date: occurrenceDate! };
    if (scope === "team") return team ? { scope, ...round, team_id: team } : null;
    if (scope === "region") return region ? { scope, ...round, region_id: region } : null;
    return { scope: "round", ...round };
  }, [scope, inspectionId, inRound, scheduleId, occurrenceDate, team, region]);
  // The round as a whole, for the "Not open yet" card's count
  const roundQuery: OpeningScopeQuery | null = inRound ? { scope: "round", schedule_id: scheduleId!, occurrence_date: occurrenceDate! } : null;
  const { data: preview, isFetching, error } = usePreviewOpeningQuery(query!, { skip: !query });
  const { data: roundPreview } = usePreviewOpeningQuery(roundQuery!, { skip: !roundQuery });
  const [create, { isLoading: saving }] = useCreateOpeningMutation();

  const chosenKeys = [...sections];
  // Already open for the chosen sections (or, before choosing, for any section)
  const isOpen = (i: { open_sections: string[] }) => (chosenKeys.length ? chosenKeys.every((k) => i.open_sections.includes(k)) : i.open_sections.length > 0);
  const roundList = roundPreview?.inspections ?? [];
  const remaining = roundList.filter((i) => !isOpen(i));
  const showRemaining = inRound && remaining.length > 0 && remaining.length < roundList.length;

  const list = preview?.inspections ?? [];
  const shown = search.trim() ? list.filter((i) => `${i.company} ${i.license_number} ${i.team?.name ?? ""}`.toLowerCase().includes(search.trim().toLowerCase())) : list;
  const count = scope === "licenses" ? list.filter((i) => picked.has(i.inspection_id)).length : scope === "remaining" ? remaining.length : (preview?.count ?? 0);
  const alreadyOpen = scope === "remaining" ? roundList.length - remaining.length : list.filter(isOpen).length;
  const chosenLabels = (preview?.sections ?? []).filter((s) => sections.has(s.key)).map((s) => s.number || s.title);

  // An open opening with exactly these sections: offer to add to it
  const candidate = chosenKeys.length ? (preview?.openings ?? []).find((o) => sameSet(o.section_keys, chosenKeys)) : undefined;
  const merging = !!candidate && !separate;
  const ready = count > 0 && sections.size > 0 && !preview?.too_many && (merging || (reason.trim().length >= 3 && !!until));

  const submit = async () => {
    if (!query || !ready) return;
    const who =
      scope === "licenses"
        ? { scope: "licenses" as const, schedule_id: scheduleId!, occurrence_date: occurrenceDate!, inspection_ids: list.filter((i) => picked.has(i.inspection_id)).map((i) => i.inspection_id) }
        : scope === "remaining"
          ? { scope: "round" as const, schedule_id: scheduleId!, occurrence_date: occurrenceDate!, only_not_open: true }
          : { ...query, ...(scope === "region" ? { region_name: options?.regions.find((r) => r.id === region)?.name } : {}) };
    const what = merging
      ? { merge_into: candidate!.opening_id }
      : { reason: reason.trim(), until: endOfDay(until) };
    try {
      const r = await create({ ...who, section_keys: chosenKeys, ...what }).unwrap();
      toast.success(r.message || "Opened for update.");
      onClose();
    } catch (e) {
      toast.error(messageOf(e, "Could not open the sections."));
    }
  };

  const scopes: { key: UiScope; label: string; hint: string; show: boolean; badge?: number }[] = [
    { key: "inspection", label: "This inspection", hint: "Only this license", show: !!inspectionId },
    { key: "licenses", label: "Chosen licenses", hint: "Pick them from this round", show: inRound },
    { key: "round", label: "All in this round", hint: "Every submitted inspection of the round", show: inRound },
    { key: "team", label: "All of a team", hint: "In this round", show: inRound },
    { key: "region", label: "All in a region", hint: "In this round", show: inRound },
    { key: "remaining", label: "Not open yet", hint: "Submitted inspections of this round not already open for these sections", show: showRemaining || scope === "remaining", badge: remaining.length },
  ];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <Unlock className="h-5 w-5" aria-hidden="true" /> Open sections for update
          </DialogTitle>
          <DialogDescription>
            The team can fill in or correct the chosen sections, from a phone or a computer, then taps <b>Done updating</b>. The inspection stays submitted: its time, on-time status and location don&apos;t
            change.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* 1. Which inspections */}
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-semibold text-slate-900">1. Which submitted inspections{inRound ? ` · round of ${formatCalendarDate(occurrenceDate)}` : ""}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {scopes
                .filter((s) => s.show)
                .map((s) => (
                  <label key={s.key} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 text-sm ${scope === s.key ? "border-primary bg-[#E7EEF4]" : "border-slate-200 hover:border-slate-300"}`}>
                    <input type="radio" name="open-scope" className="mt-1" checked={scope === s.key} onChange={() => setScope(s.key)} />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 font-semibold text-slate-900">
                        {s.label}
                        {s.badge != null && <span className="rounded-full bg-amber-100 px-2 text-xs font-semibold text-amber-900">{s.badge}</span>}
                      </span>
                      <span className="block text-xs text-slate-500">{s.hint}</span>
                    </span>
                  </label>
                ))}
            </div>
            {scope === "team" && (
              <select aria-label="Team" className={inputCls} value={team} onChange={(e) => setTeam(e.target.value)}>
                <option value="">Choose the team…</option>
                {options?.teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            )}
            {scope === "region" && (
              <select aria-label="Region" className={inputCls} value={region} onChange={(e) => setRegion(e.target.value)}>
                <option value="">Choose the region…</option>
                {options?.regions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            )}
            {scope === "licenses" && (
              <div className="rounded-lg border border-slate-200">
                <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
                  <Search className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  <input aria-label="Search licenses" placeholder="Search company, license or team" className="h-8 min-w-0 flex-1 text-sm outline-none" value={search} onChange={(e) => setSearch(e.target.value)} />
                  <span className="shrink-0 text-xs text-slate-500">{picked.size} chosen</span>
                </div>
                <div className="flex flex-wrap gap-1.5 border-b px-3 py-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => setPicked(new Set(list.filter((i) => !isOpen(i)).map((i) => i.inspection_id)))}>
                    Select the ones not open yet ({list.filter((i) => !isOpen(i)).length})
                  </Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => setPicked(new Set(list.map((i) => i.inspection_id)))}>
                    Select all
                  </Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => setPicked(new Set())}>
                    Clear
                  </Button>
                </div>
                <ul className="max-h-56 divide-y overflow-y-auto">
                  {shown.map((i) => (
                    <li key={i.inspection_id}>
                      <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-slate-50">
                        <input type="checkbox" checked={picked.has(i.inspection_id)} onChange={() => setPicked((p) => toggle(p, i.inspection_id))} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium text-slate-900">{i.company}</span>
                          <span className="block truncate text-xs text-slate-500">
                            {i.license_number} · {i.team?.name ?? "no team"}
                          </span>
                        </span>
                        {isOpen(i) && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">Already open</span>}
                      </label>
                    </li>
                  ))}
                  {!shown.length && <li className="px-3 py-4 text-center text-sm text-slate-500">{isFetching ? "Loading…" : "No submitted inspections in this round."}</li>}
                </ul>
              </div>
            )}
            <p className="text-sm text-slate-600" aria-live="polite">
              {isFetching ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Counting…
                </span>
              ) : error ? (
                <span className="text-red-600">{messageOf(error, "Could not find the inspections.")}</span>
              ) : query ? (
                preview?.too_many ? (
                  <span className="text-red-600">Too many inspections ({preview.count}+). Choose a smaller group.</span>
                ) : (
                  <>
                    <b className="text-slate-900">{count}</b> submitted inspection{count === 1 ? "" : "s"}
                    {scope === "remaining"
                      ? alreadyOpen
                        ? ` (${alreadyOpen} other${alreadyOpen === 1 ? " is" : "s are"} already open for ${chosenKeys.length ? "these sections" : "update"})`
                        : ""
                      : scope !== "licenses" && alreadyOpen
                        ? ` (${alreadyOpen} already open for ${chosenKeys.length ? "these sections" : "update"})`
                        : ""}
                  </>
                )
              ) : null}
            </p>
          </fieldset>

          {/* 2. Sections */}
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-semibold text-slate-900">2. Which sections</legend>
            {!preview?.sections.length ? (
              <p className="text-sm text-slate-500">{query ? (isFetching ? "Loading…" : "No sections to choose.") : "Choose the inspections first."}</p>
            ) : (
              <ul className="grid gap-1.5">
                {preview.sections.map((s) => (
                  <li key={s.key}>
                    <label className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm ${sections.has(s.key) ? "border-primary bg-[#E7EEF4]" : "border-slate-200 hover:border-slate-300"}`}>
                      <input type="checkbox" className="mt-0.5" checked={sections.has(s.key)} onChange={() => setSections((x) => toggle(x, s.key))} />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-slate-900">
                          {s.number ? `${s.number}. ` : ""}
                          {s.title}
                        </span>
                        <span className="ml-1.5 text-xs text-slate-500">
                          {plural(s.questions, "question")}
                          {s.required ? ` · ${s.required} required` : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          {/* Merge: the same sections are already open */}
          {candidate && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-950">
              <p className="font-semibold">{sectionsText(candidate.section_labels)} is already open</p>
              <p className="text-sky-900">
                {untilText(candidate.until)} · {candidate.done} of {candidate.total} done · “{candidate.reason}”
              </p>
              <div className="mt-2 space-y-1.5">
                <label className="flex items-start gap-2">
                  <input type="radio" className="mt-1" name="merge" checked={!separate} onChange={() => setSeparate(false)} />
                  <span>
                    <b>Add to that opening</b> <span className="text-xs text-sky-800">(recommended): same deadline and reason; the ones already in it are skipped</span>
                  </span>
                </label>
                <label className="flex items-start gap-2">
                  <input type="radio" className="mt-1" name="merge" checked={separate} onChange={() => setSeparate(true)} />
                  <span>
                    <b>Open separately</b> <span className="text-xs text-sky-800">with its own deadline and reason</span>
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* 3. Deadline and 4. reason (not needed when adding to an opening) */}
          <div className={`grid gap-4 sm:grid-cols-[240px_minmax(0,1fr)] ${merging ? "opacity-50" : ""}`}>
            <div className="space-y-1">
              <Label htmlFor="open-until">3. Open until (end of the day) *</Label>
              <DeadlineField id="open-until" day={until} onDay={setUntil} disabled={merging} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="open-reason">4. Why (the team sees this) *</Label>
              <textarea
                id="open-reason"
                rows={3}
                disabled={merging}
                className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm disabled:bg-slate-50"
                placeholder="e.g. Please add the photos of the waste dump to section 7."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>
          {merging && <p className="-mt-3 text-xs text-slate-500">When adding to an opening, its deadline and reason are used.</p>}
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center">
          <p className="text-xs text-slate-500 sm:mr-auto">
            {!ready
              ? "Choose the inspections, sections, deadline and reason."
              : merging
                ? `Adds ${plural(count, "inspection")} to “${sectionsText(candidate!.section_labels)} · ${untilText(candidate!.until)}”. The teams are notified.`
                : `${sectionsText(chosenLabels)} of ${plural(count, "inspection")}, until ${formatCalendarDate(until)}. The teams are notified.`}
          </p>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!ready || saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockOpen className="h-4 w-4" />} {merging ? "Add to opening" : "Open for update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* =================== progress =================== */

export const stateOf = (o: SectionOpening) =>
  o.is_open
    ? { text: o.until ? `Open until ${formatDate(o.until)}` : "Open · no deadline", cls: "bg-amber-100 text-amber-900" }
    : o.close_reason === "all_done"
      ? { text: `All done${o.closed_at ? ` · closed ${formatDate(o.closed_at)}` : ""}`, cls: "bg-[#E3F4E8] text-[#145C2F]" }
      : o.close_reason === "manual"
        ? { text: `Closed${o.closer ? ` by ${o.closer.full_name}` : ""}`, cls: "bg-slate-100 text-slate-700" }
        : { text: "Closed at the deadline", cls: "bg-slate-100 text-slate-700" };

/** What an opening covers: "round of Nov 12", "Team 3", "one inspection"… */
const scopeText = (o: SectionOpening) => {
  const d = o.scope_details;
  const round = d?.occurrence_date ? `round of ${formatCalendarDate(d.occurrence_date)}` : null;
  const by = { inspection: "one inspection", licenses: "chosen licenses", round: "all in the round", team: "one team", region: d?.region_name ?? "one region" }[o.scope];
  return [o.schedule?.name, round, by].filter(Boolean).join(" · ");
};

/** Openings of one inspection, or of one round, with progress. Nothing is shown when there are none. */
export function OpeningsPanel({ inspectionId, scheduleId, occurrenceDate, canManage }: { inspectionId?: string; scheduleId?: string; occurrenceDate?: string; canManage: boolean }) {
  const { data } = useGetOpeningsQuery(inspectionId ? { inspection_id: inspectionId } : { schedule_id: scheduleId, occurrence_date: occurrenceDate }, { skip: !inspectionId && !scheduleId });
  if (!data?.length) return null;
  const open = data.filter((o) => o.is_open);
  return (
    <section aria-label="Sections opened for update" className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
          <Unlock className="h-4 w-4 text-amber-700" aria-hidden="true" /> Opened for update
        </h2>
        {canManage && (inspectionId ? open.length > 1 : open.length > 0) && (
          <span className="ml-auto">
            <CloseAllButton openings={open} target={inspectionId ? { inspection_id: inspectionId } : { schedule_id: scheduleId, occurrence_date: occurrenceDate }} />
          </span>
        )}
      </div>
      <ul className="space-y-2">
        {data.map((o) => (
          <OpeningCard key={o.opening_id} o={o} single={!!inspectionId} canManage={canManage} compact />
        ))}
      </ul>
    </section>
  );
}

/** One opening: sections, state, reason, progress, See who is done, Edit, Close now. */
export function OpeningCard({ o, single, canManage, compact }: { o: SectionOpening; single?: boolean; canManage: boolean; compact?: boolean }) {
  const [details, setDetails] = useState(false);
  const [editing, setEditing] = useState(false);
  const state = stateOf(o);
  const pct = o.total ? Math.round((o.done / o.total) * 100) : 0;
  const waiting = o.total - o.done;
  return (
    <li className={`list-none rounded-xl border border-slate-200 ${o.is_open ? "bg-white" : "bg-slate-50"} ${compact ? "p-3" : "p-4"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className={`font-semibold text-slate-900 ${compact ? "" : "text-base"}`}>{sectionsText(o.section_labels)}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${state.cls}`}>{state.text}</span>
        {!compact && <span className="text-sm text-slate-600">{scopeText(o)}</span>}
        <span className="ml-auto text-xs text-slate-500">
          by {o.opener?.full_name ?? "—"} · {formatDate(o.created_at)}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-700">“{o.reason}”</p>
      {single ? (
        <p className="mt-1 text-xs text-slate-500">
          {o.done ? (
            <span className="inline-flex items-center gap-1 font-semibold text-[#145C2F]">
              <CheckCircle2 className="h-3.5 w-3.5" /> The team is done updating
            </span>
          ) : o.is_open ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" /> Waiting for the team
            </span>
          ) : (
            "Not marked done"
          )}
        </p>
      ) : (
        <div className="mt-2 flex items-center gap-3">
          <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={o.done} aria-valuemin={0} aria-valuemax={o.total} aria-label="Done updating">
            <span className="block h-full rounded-full bg-[#1B7A3E]" style={{ width: `${pct}%` }} />
          </span>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
            {o.done} of {o.total} done
          </span>
          {o.is_open && waiting > 0 && <span className="shrink-0 text-sm text-amber-700">{waiting} waiting</span>}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {!single && (
          <Button size="sm" variant="outline" onClick={() => setDetails(true)}>
            See who is done
          </Button>
        )}
        {canManage && o.is_open && (
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" /> Edit
          </Button>
        )}
        {canManage && o.is_open && <CloseButton id={o.opening_id} />}
      </div>
      {details && <OpeningDetailsDialog id={o.opening_id} canManage={canManage} onClose={() => setDetails(false)} />}
      {editing && <EditOpeningDialog id={o.opening_id} onClose={() => setEditing(false)} />}
    </li>
  );
}

function CloseButton({ id }: { id: string }) {
  const [asking, setAsking] = useState(false);
  const [close, { isLoading }] = useCloseOpeningMutation();
  const go = async () => {
    try {
      const r = await close(id).unwrap();
      toast.success(r.message || "Closed.");
      setAsking(false);
    } catch (e) {
      toast.error(messageOf(e, "Could not close it."));
    }
  };
  if (!asking)
    return (
      <Button size="sm" variant="outline" className="gap-1.5 text-red-700" onClick={() => setAsking(true)}>
        <X className="h-3.5 w-3.5" /> Close now
      </Button>
    );
  return (
    <span className="flex flex-wrap items-center gap-2 rounded-lg bg-red-50 px-2 py-1 text-sm text-red-800">
      Close it for everyone? Saved changes are kept.
      <Button size="sm" variant="destructive" onClick={go} disabled={isLoading}>
        {isLoading ? "Closing…" : "Close"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setAsking(false)}>
        Cancel
      </Button>
    </span>
  );
}

/** "Close all open (N)", with a confirmation listing each opening and how many are still waiting. */
export function CloseAllButton({ openings, target }: { openings: SectionOpening[]; target: { schedule_id?: string; occurrence_date?: string; inspection_id?: string; all?: boolean } }) {
  const [asking, setAsking] = useState(false);
  const [closeAll, { isLoading }] = useCloseAllOpeningsMutation();
  const go = async () => {
    try {
      const r = await closeAll(target).unwrap();
      toast.success(r.message || "Closed.");
      setAsking(false);
    } catch (e) {
      toast.error(messageOf(e, "Could not close them."));
    }
  };
  if (!openings.length) return null;
  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5 border-red-200 text-red-700" onClick={() => setAsking(true)}>
        <X className="h-3.5 w-3.5" /> Close all open ({openings.length})
      </Button>
      {asking && (
        <Dialog open onOpenChange={(v) => !v && !isLoading && setAsking(false)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-primary">Close all open sections?</DialogTitle>
              <DialogDescription>{plural(openings.length, "opening")} close now:</DialogDescription>
            </DialogHeader>
            <ul className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
              {openings.map((o) => (
                <li key={o.opening_id}>
                  • <b>{sectionsText(o.section_labels)}</b> · {o.total - o.done} of {o.total} still waiting
                </li>
              ))}
            </ul>
            <p className="text-sm text-slate-600">The teams that haven&apos;t finished are told it closed. Changes already saved are kept.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAsking(false)} disabled={isLoading}>
                Cancel
              </Button>
              <Button variant="destructive" className="gap-1.5" onClick={go} disabled={isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />} Close all
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/** Change an open opening: sections, deadline, reason. Applies to the inspections still waiting. */
export function EditOpeningDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: o, isLoading } = useGetOpeningQuery(id);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <Pencil className="h-5 w-5" aria-hidden="true" /> Edit opening
          </DialogTitle>
          <DialogDescription>
            {o ? (
              <>
                {sectionsText(o.section_labels)} · {scopeText(o)} · opened by {o.opener?.full_name ?? "—"} on {formatDate(o.created_at)} · <b>{o.done} of {o.total} done</b>
              </>
            ) : (
              "Loading…"
            )}
          </DialogDescription>
        </DialogHeader>
        {isLoading || !o ? <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" /> : <EditForm o={o} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function EditForm({ o, onClose }: { o: SectionOpeningDetail; onClose: () => void }) {
  const [sections, setSections] = useState<Set<string>>(() => new Set(o.section_keys));
  const [day, setDay] = useState(o.until ? dayOf(o.until) : dayFromToday(7));
  const [reason, setReason] = useState(o.reason);
  const [save, { isLoading }] = useUpdateOpeningMutation();
  const waiting = o.total - o.done;

  const sectionsChanged = !sameSet([...sections], o.section_keys);
  const deadlineChanged = !o.until || dayOf(o.until) !== day;
  const reasonChanged = reason.trim() !== o.reason;
  const changed = sectionsChanged || deadlineChanged || reasonChanged;
  const valid = sections.size > 0 && reason.trim().length >= 3 && !!day;
  const added = [...sections].filter((k) => !o.section_keys.includes(k)).length;

  const submit = async () => {
    try {
      const r = await save({
        id: o.opening_id,
        ...(sectionsChanged ? { section_keys: [...sections] } : {}),
        ...(deadlineChanged ? { until: endOfDay(day) } : {}),
        ...(reasonChanged ? { reason: reason.trim() } : {}),
      }).unwrap();
      toast.success(r.message || "Saved.");
      onClose();
    } catch (e) {
      toast.error(messageOf(e, "Could not save the changes."));
    }
  };

  return (
    <>
      <div className="space-y-5">
        <fieldset className="space-y-2">
          <legend className="mb-1 text-sm font-semibold text-slate-900">Sections</legend>
          <ul className="grid gap-1.5">
            {o.sections.map((s) => (
              <li key={s.key}>
                <label className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 text-sm ${sections.has(s.key) ? "border-primary bg-[#E7EEF4]" : "border-slate-200 hover:border-slate-300"}`}>
                  <input type="checkbox" className="mt-0.5" checked={sections.has(s.key)} onChange={() => setSections((x) => toggle(x, s.key))} />
                  <span>
                    <span className="font-medium text-slate-900">
                      {s.number ? `${s.number}. ` : ""}
                      {s.title}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {added > 0 && o.done > 0 && (
            <p className="text-xs text-slate-500">
              A section you add opens for the {plural(waiting, "inspection")} still waiting. The {o.done} that are done stay locked.
            </p>
          )}
        </fieldset>

        <div className="space-y-1">
          <Label htmlFor="edit-until">Open until (end of the day)</Label>
          <DeadlineField id="edit-until" day={day} onDay={setDay} was={o.until} />
        </div>

        <div className="space-y-1">
          <Label htmlFor="edit-reason">Why (the team sees this)</Label>
          <textarea id="edit-reason" rows={3} className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>

        {changed && (
          <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-950">
            <p className="font-semibold">What happens</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {waiting > 0 ? <li>The {plural(waiting, "inspection")} still waiting get the changes.</li> : <li>Every inspection is done; nothing changes for the teams.</li>}
              {waiting > 0 && <li>Their teams are notified.</li>}
              <li>History records the change, with who and when.</li>
            </ul>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={submit} disabled={!changed || !valid || isLoading} className="gap-1.5">
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />} Save changes
        </Button>
      </DialogFooter>
    </>
  );
}

function OpeningDetailsDialog({ id, canManage, onClose }: { id: string; canManage: boolean; onClose: () => void }) {
  const { data: o, isLoading } = useGetOpeningQuery(id);
  const [tab, setTab] = useState<"waiting" | "done">("waiting");
  const items = (o?.items ?? []).filter((i) => i.status === tab);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-primary">{o ? sectionsText(o.section_labels) : "Opened for update"}</DialogTitle>
          <DialogDescription>{o ? `${o.done} of ${o.total} done · ${stateOf(o).text} · ${scopeText(o)}` : "Loading…"}</DialogDescription>
        </DialogHeader>
        {isLoading || !o ? (
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" />
        ) : (
          <>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">“{o.reason}”</p>
            <div className="flex gap-1 border-b" role="tablist">
              {(
                [
                  ["waiting", `Waiting (${o.total - o.done})`],
                  ["done", `Done (${o.done})`],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="tab"
                  aria-selected={tab === k}
                  onClick={() => setTab(k)}
                  className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${tab === k ? "border-golden-bright text-primary" : "border-transparent text-slate-500"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <ul className="divide-y">
              {items.map((i) => (
                <li key={i.inspection_id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="min-w-0 flex-1">
                    <Link href={`/inspections/${i.inspection_id}`} className="block truncate font-medium text-primary hover:underline">
                      {i.company}
                    </Link>
                    <span className="block truncate text-xs text-slate-500">
                      {i.license_number} · {i.team?.name ?? "no team"}
                    </span>
                  </span>
                  <span className="shrink-0 text-right text-xs text-slate-500">
                    {i.status === "done" ? (
                      <>
                        Done {formatDateTime(i.done_at)}
                        {i.done_by ? <span className="block">{i.done_by.full_name}</span> : null}
                      </>
                    ) : i.changed ? (
                      `${plural(i.changed, "answer")} changed`
                    ) : (
                      "Not started"
                    )}
                  </span>
                </li>
              ))}
              {!items.length && <li className="py-6 text-center text-sm text-slate-500">{tab === "waiting" ? "Everyone is done." : "Nobody is done yet."}</li>}
            </ul>
          </>
        )}
        <DialogFooter>
          {canManage && o?.is_open && <CloseButton id={o.opening_id} />}
          <Button variant="outline" onClick={onClose}>
            OK
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
