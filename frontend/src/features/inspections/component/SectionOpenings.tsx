"use client";

/**
 * "Open sections for update": reviewers open chosen sections of SUBMITTED inspections so the team can fill
 * in or correct them until a deadline. The inspection stays submitted (time, on time / late, location).
 *
 *   OpenSectionsDialog  choose which inspections (one, chosen licenses, a round, a team, a region),
 *                       which sections, the deadline and the reason
 *   OpeningsPanel       the openings with progress ("12 of 30 done"), the list of done / waiting, Close
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle2, Clock, Loader2, LockOpen, Search, Unlock, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCloseOpeningMutation, useCreateOpeningMutation, useGetOpeningQuery, useGetOpeningsQuery, usePreviewOpeningQuery } from "@/redux/api/inspectionApi";
import { useGetSubmissionMapOptionsQuery } from "@/redux/api/dashboardApi";
import type { OpeningScope, OpeningScopeQuery, SectionOpening } from "@/redux/types/inspection";
import { formatCalendarDate, formatDate, formatDateTime } from "@/utils/date";

/** The server's message of a failed request */
const messageOf = (e: unknown, fallback: string) => (e as { data?: { message?: string } } | undefined)?.data?.message || fallback;

const inputCls = "h-10 w-full rounded-md border border-input bg-white px-3 text-sm";

/** YYYY-MM-DD in Addis Ababa, `days` from today */
const dayFromToday = (days: number) => new Date(Date.now() + days * 864e5).toLocaleDateString("en-CA", { timeZone: "Africa/Addis_Ababa" });

/** Sections as "7, 8" → "Section 7" / "Sections 7, 8" */
export const sectionsText = (labels: string[]) => (labels.length === 1 ? `Section ${labels[0]}` : `Sections ${labels.join(", ")}`);

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

export function OpenSectionsDialog({ inspectionId, scheduleId, occurrenceDate, teamId, onClose }: DialogProps) {
  const inRound = !!scheduleId && !!occurrenceDate;
  const [scope, setScope] = useState<OpeningScope>(inspectionId ? "inspection" : "round");
  const [team, setTeam] = useState(teamId ?? "");
  const [region, setRegion] = useState("");
  const [picked, setPicked] = useState<Set<string>>(() => new Set(inspectionId ? [inspectionId] : []));
  const [search, setSearch] = useState("");
  const [sections, setSections] = useState<Set<string>>(new Set());
  const [until, setUntil] = useState(dayFromToday(7));
  const [reason, setReason] = useState("");
  const { data: options } = useGetSubmissionMapOptionsQuery(undefined, { skip: !inRound });

  // What the preview asks for: chosen licenses are picked from the whole round
  const query: OpeningScopeQuery | null = useMemo(() => {
    if (scope === "inspection") return inspectionId ? { scope, inspection_id: inspectionId } : null;
    if (!inRound) return null;
    const round = { schedule_id: scheduleId!, occurrence_date: occurrenceDate! };
    if (scope === "team") return team ? { scope, ...round, team_id: team } : null;
    if (scope === "region") return region ? { scope, ...round, region_id: region } : null;
    return { scope: "round", ...round };
  }, [scope, inspectionId, inRound, scheduleId, occurrenceDate, team, region]);
  const { data: preview, isFetching, error } = usePreviewOpeningQuery(query!, { skip: !query });
  const [create, { isLoading: saving }] = useCreateOpeningMutation();

  const list = preview?.inspections ?? [];
  const shown = search.trim() ? list.filter((i) => `${i.company} ${i.license_number} ${i.team?.name ?? ""}`.toLowerCase().includes(search.trim().toLowerCase())) : list;
  const count = scope === "licenses" ? list.filter((i) => picked.has(i.inspection_id)).length : preview?.count ?? 0;
  const chosenLabels = (preview?.sections ?? []).filter((s) => sections.has(s.key)).map((s) => s.number || s.title);
  const ready = count > 0 && sections.size > 0 && reason.trim().length >= 3 && !!until && !preview?.too_many;

  const toggle = (set: Set<string>, key: string) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  };

  const submit = async () => {
    if (!query || !ready) return;
    const body =
      scope === "licenses"
        ? { scope, schedule_id: scheduleId!, occurrence_date: occurrenceDate!, inspection_ids: list.filter((i) => picked.has(i.inspection_id)).map((i) => i.inspection_id) }
        : { ...query, ...(scope === "region" ? { region_name: options?.regions.find((r) => r.id === region)?.name } : {}) };
    try {
      const r = await create({ ...body, section_keys: [...sections], until: `${until}T23:59:59+03:00`, reason: reason.trim() }).unwrap();
      toast.success(r.message || "Opened for update.");
      onClose();
    } catch (e) {
      toast.error(messageOf(e, "Could not open the sections."));
    }
  };

  const scopes: { key: OpeningScope; label: string; hint: string; show: boolean }[] = [
    { key: "inspection", label: "This inspection", hint: "Only this license", show: !!inspectionId },
    { key: "licenses", label: "Chosen licenses", hint: "Pick them from this round", show: inRound },
    { key: "round", label: "All in this round", hint: "Every submitted inspection of the round", show: inRound },
    { key: "team", label: "All of a team", hint: "In this round", show: inRound },
    { key: "region", label: "All in a region", hint: "In this round", show: inRound },
  ];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-primary">
            <Unlock className="h-5 w-5" aria-hidden="true" /> Open sections for update
          </DialogTitle>
          <DialogDescription>
            The team can fill in or correct the chosen sections until the deadline, from a phone or a computer, then taps <b>Done updating</b>. The inspection stays submitted: its time, on-time status and
            location don&apos;t change.
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
                    <span>
                      <span className="block font-semibold text-slate-900">{s.label}</span>
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
                <div className="flex items-center gap-2 border-b px-3 py-2">
                  <Search className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  <input aria-label="Search licenses" placeholder="Search company, license or team" className="h-8 min-w-0 flex-1 text-sm outline-none" value={search} onChange={(e) => setSearch(e.target.value)} />
                  <span className="shrink-0 text-xs text-slate-500">{picked.size} chosen</span>
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
                        {i.open_now && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">Already open</span>}
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
                    {scope !== "licenses" && list.some((i) => i.open_now) ? ` (${list.filter((i) => i.open_now).length} already open for update)` : ""}
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
                          {s.questions} question{s.questions === 1 ? "" : "s"}
                          {s.required ? ` · ${s.required} required` : ""}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          {/* 3. Deadline and reason */}
          <div className="grid gap-4 sm:grid-cols-[200px_minmax(0,1fr)]">
            <div className="space-y-1">
              <Label htmlFor="open-until">3. Open until (end of the day) *</Label>
              <input id="open-until" type="date" className={inputCls} min={dayFromToday(0)} value={until} onChange={(e) => setUntil(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="open-reason">4. Why (the team sees this) *</Label>
              <textarea
                id="open-reason"
                rows={3}
                className="w-full rounded-md border border-input bg-white px-3 py-2 text-sm"
                placeholder="e.g. Please add the photos of the waste dump to section 7."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center">
          <p className="text-xs text-slate-500 sm:mr-auto">
            {ready ? `${sectionsText(chosenLabels)} of ${count} inspection${count === 1 ? "" : "s"} until ${formatCalendarDate(until)}. The teams are notified.` : "Choose the inspections, sections, deadline and reason."}
          </p>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!ready || saving} className="gap-1.5">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <LockOpen className="h-4 w-4" />} Open for update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* =================== progress =================== */

const stateOf = (o: SectionOpening) =>
  o.is_open
    ? { text: `Open until ${formatDate(o.until)}`, cls: "bg-amber-100 text-amber-900" }
    : o.close_reason === "all_done"
      ? { text: "All done", cls: "bg-[#E3F4E8] text-[#145C2F]" }
      : o.close_reason === "manual"
        ? { text: `Closed${o.closer ? ` by ${o.closer.full_name}` : ""}`, cls: "bg-slate-100 text-slate-700" }
        : { text: "Closed at the deadline", cls: "bg-slate-100 text-slate-700" };

/** Openings of one inspection, or of one round, with progress. Nothing is shown when there are none. */
export function OpeningsPanel({ inspectionId, scheduleId, occurrenceDate, canManage }: { inspectionId?: string; scheduleId?: string; occurrenceDate?: string; canManage: boolean }) {
  const { data } = useGetOpeningsQuery(inspectionId ? { inspection_id: inspectionId } : { schedule_id: scheduleId, occurrence_date: occurrenceDate }, { skip: !inspectionId && !scheduleId });
  const [details, setDetails] = useState<string | null>(null);
  if (!data?.length) return null;
  return (
    <section aria-label="Sections opened for update" className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Unlock className="h-4 w-4 text-amber-700" aria-hidden="true" /> Opened for update
      </h2>
      <ul className="space-y-2">
        {data.map((o) => (
          <OpeningRow key={o.opening_id} o={o} single={!!inspectionId} canManage={canManage} onDetails={() => setDetails(o.opening_id)} />
        ))}
      </ul>
      {details && <OpeningDetailsDialog id={details} canManage={canManage} onClose={() => setDetails(null)} />}
    </section>
  );
}

function OpeningRow({ o, single, canManage, onDetails }: { o: SectionOpening; single: boolean; canManage: boolean; onDetails: () => void }) {
  const state = stateOf(o);
  const pct = o.total ? Math.round((o.done / o.total) * 100) : 0;
  return (
    <li className="rounded-lg border border-slate-200 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-slate-900">{sectionsText(o.section_labels)}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${state.cls}`}>{state.text}</span>
        <span className="ml-auto text-xs text-slate-500">
          by {o.opener?.full_name ?? "—"} · {formatDate(o.created_at)}
        </span>
      </div>
      <p className="mt-1 text-sm text-slate-700">“{o.reason}”</p>
      {!single && (
        <div className="mt-2 flex items-center gap-3">
          <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-slate-200" role="progressbar" aria-valuenow={o.done} aria-valuemax={o.total} aria-label="Done updating">
            <span className="block h-full rounded-full bg-[#1B7A3E]" style={{ width: `${pct}%` }} />
          </span>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">
            {o.done} of {o.total} done
          </span>
        </div>
      )}
      {single && (
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
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        {!single && (
          <Button size="sm" variant="outline" onClick={onDetails}>
            See who is done
          </Button>
        )}
        {canManage && o.is_open && <CloseButton id={o.opening_id} />}
      </div>
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

function OpeningDetailsDialog({ id, canManage, onClose }: { id: string; canManage: boolean; onClose: () => void }) {
  const { data: o, isLoading } = useGetOpeningQuery(id);
  const [tab, setTab] = useState<"waiting" | "done">("waiting");
  const items = (o?.items ?? []).filter((i) => i.status === tab);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-primary">{o ? sectionsText(o.section_labels) : "Opened for update"}</DialogTitle>
          <DialogDescription>
            {o ? (
              <>
                {o.done} of {o.total} done · {stateOf(o).text}
                {o.schedule ? ` · ${o.schedule.name}` : ""}
                {o.scope_details?.occurrence_date ? `, round of ${formatCalendarDate(o.scope_details.occurrence_date)}` : ""}
                {o.scope_details?.region_name ? ` · ${o.scope_details.region_name}` : ""}
              </>
            ) : (
              "Loading…"
            )}
          </DialogDescription>
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
                      `${i.changed} answer${i.changed === 1 ? "" : "s"} changed`
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
