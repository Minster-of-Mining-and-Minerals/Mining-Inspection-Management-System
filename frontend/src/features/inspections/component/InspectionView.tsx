"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronRight, History, Loader2, Lock, MapPin, RotateCcw, Save, Send, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Loading01 from "@/features/template/component/Loading/Loading01";
import type { FormLanguage } from "@/features/forms/component/FormRenderer";
import { InspectionStepper } from "./InspectionStepper";
import { SubmitFlow, quickLocation } from "./SubmitFlow";
import { SiteView } from "./SiteView";
import { distanceText } from "@/utils/licenseArea";
import { FormFilesContext } from "@/features/forms/component/FormFiles";
import { useInspectionFiles } from "./useInspectionFiles";
import { deviceLabel } from "@/utils/device";
import { Answers, defaultTableRows, validateAnswers } from "@/features/forms/component/formLogic";
import { useGetTaskQuery, useReturnTaskMutation, useSaveAnswersMutation, useSaveOfficeAnswersMutation, useSubmitTaskMutation } from "@/redux/api/inspectionApi";
import type { AnswerProblem, TaskDetail } from "@/redux/types/inspection";
import { formatCalendarDate, formatDateTime } from "@/utils/date";
import { TaskStatusBadge, dueText } from "./taskUi";

const AUTOSAVE_MS = 3000;
/** Someone watching an inspection another team is filling (supervisor, admin) sees its saved answers this often */
const LIVE_MS = 5000;
const LANG_KEY = "mims.inspection.language";
const DEVICE_KEY = "mims.deviceId";

/** A random id kept on this device, so later checks can tell devices apart. */
const deviceInfo = () => {
  let id: string | null = null;
  try {
    id = window.localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = crypto.randomUUID();
      window.localStorage.setItem(DEVICE_KEY, id);
    }
  } catch {
    /* private window: no id */
  }
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  return {
    user_agent: navigator.userAgent,
    platform: nav.userAgentData?.platform || navigator.platform,
    language: navigator.language,
    screen: `${window.screen.width}x${window.screen.height}`,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    device_id: id,
  };
};

/** Answers to start with: saved answers, plus "prefill" questions filled from the license. */
const initialAnswers = (task: TaskDetail): Answers => {
  const a: Answers = { ...(task.answers || {}) };
  for (const s of task.version?.definition.sections ?? [])
    for (const f of s.fields) {
      if (f.type === "text" && f.prefill && (a[f.key] == null || a[f.key] === "") && task.prefill[f.prefill]) a[f.key] = task.prefill[f.prefill];
      // A table with a row per team member (the signatures): the team's names filled in
      if (f.type === "table" && f.team_rows && !a[f.key]?.rows?.length && task.status !== "submitted") a[f.key] = { rows: defaultTableRows(f, "am", task.team_member_names ?? []) };
    }
  return a;
};

export default function InspectionView() {
  const { inspectionId } = useParams<{ inspectionId: string }>();
  const { data: task, isLoading, isError, error, refetch } = useGetTaskQuery(inspectionId, { skip: !inspectionId, refetchOnMountOrArgChange: true });
  // Watching (not filling) an inspection that isn't submitted: follow the team's saves live
  const watching = !!task && !task.can.fill && task.status !== "submitted";
  useGetTaskQuery(inspectionId, { skip: !inspectionId || !watching, pollingInterval: LIVE_MS, skipPollingIfUnfocused: true });
  if (isLoading) return <Loading01 />;
  if (isError || !task) return <p className="p-8 text-center text-red-600">{(error as any)?.data?.message || "Inspection not found."}</p>;
  if (!task.version) return <p className="p-8 text-center text-red-600">The checklist of this inspection has no published version.</p>;
  // Remount when the server copy changes underneath (reload after a conflict, return for correction).
  // Someone watching isn't remounted by each save (they keep their place); the answers just update.
  return <InspectionBody key={`${task.inspection_id}-${task.status}-${task.can.fill || task.can.fill_after_submit ? task.last_saved_at : ""}`} task={task} reload={refetch} />;
}

function InspectionBody({ task, reload }: { task: TaskDetail; reload: () => void }) {
  const router = useRouter();
  const def = task.version!.definition;
  const licenseType = task.license?.license_type ?? null;
  const editable = task.can.fill;
  // Submitted: the team can still fill the sections done at the office (after_submit, e.g. 4.1)
  const officeKeys = useMemo(() => new Set(def.sections.filter((s) => s.after_submit).map((s) => s.key)), [def]);
  const office = !editable && !!task.can.fill_after_submit && officeKeys.size > 0;
  const canEdit = editable || office;
  const filesApi = useInspectionFiles(task.inspection_id, task.files ?? [], !editable);

  // Ask for location permission when filling starts; nothing is shown here. Submitting asks again and records it.
  useEffect(() => {
    if (!editable || !("geolocation" in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      () => {},
      () => {},
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 },
    );
  }, [editable]);

  const [own, setAnswers] = useState<Answers>(() => initialAnswers(task));
  // The team's latest saved answers when only watching
  const saved = useMemo(() => initialAnswers(task), [task]);
  const answers = canEdit ? own : saved;
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "unsaved" | "error" | "conflict">("saved");
  const [conflict, setConflict] = useState<string | null>(null);
  const baseSavedAt = useRef<string | null>(task.last_saved_at);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const [confirming, setConfirming] = useState(false);
  const [locating, setLocating] = useState(false);
  const [returning, setReturning] = useState(false);
  // Amharic for now; a language switch for inspectors comes later
  const language: FormLanguage = "am";
  // A task not started yet opens on the site map (where to go); otherwise on the questions
  const [view, setView] = useState<"site" | "questions" | "history">(editable && task.status === "todo" && task.site?.boundary ? "site" : "questions");
  const [jumpKey, setJumpKey] = useState<string | null>(null);


  const [saveAnswers] = useSaveAnswersMutation();
  const [saveOfficeAnswers] = useSaveOfficeAnswersMutation();
  const [submitTask, { isLoading: submitting }] = useSubmitTaskMutation();

  // ---------- autosave ----------
  const saveNow = useCallback(async () => {
    if (!canEdit || conflict) return false;
    setSaveState("saving");
    try {
      const save = office ? saveOfficeAnswers : saveAnswers;
      const r = await save({ id: task.inspection_id, answers, base_saved_at: baseSavedAt.current }).unwrap();
      baseSavedAt.current = r.last_saved_at;
      setDirty(false);
      setSaveState("saved");
      return true;
    } catch (e: any) {
      if (e?.status === 409 && e?.data?.conflict) {
        setConflict(e.data.message);
        setSaveState("conflict");
      } else setSaveState("error");
      return false;
    }
  }, [canEdit, office, conflict, saveAnswers, saveOfficeAnswers, task.inspection_id, answers]);

  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(saveNow, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [dirty, answers, saveNow]);

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const onChange = (key: string, value: any) => {
    setAnswers((a) => ({ ...a, [key]: value }));
    setDirty(true);
    setSaveState("unsaved");
    if (problems[key]) setProblems(({ [key]: _gone, ...rest }) => rest);
  };


  const goBack = async () => {
    if (dirty && canEdit) await saveNow();
    router.back();
  };

  const startSubmit = async () => {
    if (locating || submitting) return;
    const open = validateAnswers(def, licenseType, answers);
    if (Object.keys(open).length) {
      setProblems(open);
      setView("questions");
      toast.error(`${Object.keys(open).length} answer(s) need attention.`);
      setJumpKey(Object.keys(open)[0]);
      return;
    }
    // Location already allowed: get it quietly and submit at once; otherwise show the location step
    setLocating(true);
    const note = toast.loading("Getting your location…");
    const fix = await quickLocation();
    toast.dismiss(note);
    setLocating(false);
    if (fix) submit(fix);
    else setConfirming(true);
  };

  const submit = async (location: Record<string, any>) => {
    try {
      const r = await submitTask({ id: task.inspection_id, answers, base_saved_at: baseSavedAt.current, location, device: deviceInfo() }).unwrap();
      setDirty(false);
      toast.success(r.is_late ? "Submitted (late). Thank you." : "Submitted. Thank you.");
      setConfirming(false);
      reload();
    } catch (e: any) {
      setConfirming(false);
      if (e?.data?.problems) {
        const p: Record<string, string> = {};
        (e.data.problems as AnswerProblem[]).forEach((x) => (p[x.key] = x.problem));
        setProblems(p);
        setView("questions");
        if (e.data.last_saved_at) baseSavedAt.current = e.data.last_saved_at;
        setJumpKey(e.data.problems[0].key);
      } else if (e?.status === 409 && e?.data?.conflict) {
        setConflict(e.data.message);
        setSaveState("conflict");
      }
      toast.error(e?.data?.message || "Could not submit.");
    }
  };

  const lastReturn = [...task.events].reverse().find((e) => e.type === "returned");
  const saveLabel = { saved: task.last_saved_at ? "All changes saved" : "Not started", saving: "Saving…", unsaved: "Unsaved changes", error: "Not saved — check your internet", conflict: "Not saved" }[
    saveState
  ];

  return (
    <div className="w-full space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-3">
        <Button variant="outline" size="icon" onClick={goBack} aria-label="Back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1 basis-56">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-lg font-bold text-primary sm:text-xl">{task.company?.name}</h1>
            <TaskStatusBadge task={task} />
          </div>
          <p className="text-sm text-slate-600">
            {task.license?.license_number} · {task.license?.license_type}
            {task.license?.site_name ? ` · ${task.license.site_name}` : ""}
          </p>
          <p className="text-xs text-slate-500">
            {task.form?.name} (version {task.version!.version_number}) · round of {formatCalendarDate(task.occurrence_date)} · due by end of {dueText(task.due_at)} ·{" "}
            {task.team?.name ?? "no team"}
          </p>
        </div>
      </div>

      {/* Banners */}
      {conflict && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertTriangle className="h-4 w-4" />
          <span className="flex-1">{conflict}</span>
          <Button size="sm" variant="outline" onClick={reload}>
            Reload
          </Button>
        </div>
      )}
      {editable && lastReturn && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">
          <p className="flex items-center gap-2 font-semibold">
            <RotateCcw className="h-4 w-4" /> Returned for correction by {lastReturn.user?.full_name ?? "a reviewer"} on {formatDateTime(lastReturn.created_at)}
          </p>
          <p className="mt-1 whitespace-pre-line">{lastReturn.details?.reason}</p>
        </div>
      )}
      {!editable && task.status !== "submitted" && (
        <p className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
          <Lock className="h-4 w-4 shrink-0" />
          <span>
            Only members of {task.team?.name ?? "the assigned team"} can fill this inspection. You see their answers as they are saved (live, every few seconds).
            {task.last_saved_at ? ` Last saved ${formatDateTime(task.last_saved_at)}${task.lastSaver ? ` by ${task.lastSaver.full_name}` : ""}.` : " Nothing saved yet."}
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs font-semibold text-green-700">
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-600" aria-hidden="true" /> Live
          </span>
        </p>
      )}
      {task.status === "submitted" && <SubmittedSummary task={task} onReturn={task.can.return ? () => setReturning(true) : undefined} onShowPlace={() => setView("site")} />}
      {office && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          <span className="min-w-0 flex-1">
            <strong>Filled in at the office:</strong>{" "}
            {def.sections
              .filter((s) => s.after_submit)
              .map((s) => `${s.number ? `${s.number}. ` : ""}${s.title}`)
              .join(", ")}{" "}
            can still be completed. Changes are saved as you type.
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setView("questions");
              const first = def.sections.find((s) => s.after_submit)?.fields[0]?.key;
              if (first) setJumpKey(first);
            }}
          >
            Open it
          </Button>
        </div>
      )}

      {/* Tabs: the questions, and the task's history */}
      <div className="flex gap-1 border-b" role="tablist" aria-label="Inspection">
        {(
          [
            ["site", "Site"],
            ["questions", "Questions"],
            ["history", `History (${task.events.length})`],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={view === key}
            onClick={() => setView(key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${view === key ? "border-golden-bright text-primary" : "border-transparent text-slate-500 hover:text-primary"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Kept mounted while on History, so uploads in progress and where you are aren't lost */}
      <div className={view === "questions" ? "" : "hidden"} role="tabpanel" aria-label="Questions">
        <FormFilesContext.Provider value={filesApi}>
          <InspectionStepper
            definition={def}
            licenseType={licenseType}
            answers={answers}
            onChange={onChange}
            problems={problems}
            language={language}
            readOnly={!editable}
            jumpKey={jumpKey}
            onJumped={() => setJumpKey(null)}
            onFinish={editable ? startSubmit : undefined}
            onStepChange={() => dirty && canEdit && saveNow()}
            openSections={office ? officeKeys : undefined}
            resumeKey={task.inspection_id}
            title={task.company?.name ?? ""}
            finishing={submitting || locating}
            status={
              canEdit ? (
                <div className="flex shrink-0 items-center gap-2">
                  <span className={`hidden text-right text-[11px] leading-tight sm:block ${saveState === "error" || saveState === "conflict" ? "font-medium text-red-600" : "text-slate-500"}`}>
                    {saveLabel}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={saveNow}
                    disabled={!dirty || saveState === "saving" || !!conflict}
                    aria-label={saveLabel}
                    title={saveLabel}
                  >
                    {saveState === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : dirty ? <Save className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4 text-green-600" />}
                    <span className="hidden sm:inline">{dirty ? "Save" : "Saved"}</span>
                  </Button>
                </div>
              ) : null
            }
          />
        </FormFilesContext.Provider>
      </div>

      {view === "site" && <SiteView task={task} onStart={() => setView("questions")} />}

      {view === "history" &&
        (task.events.length ? (
          <EventHistory task={task} />
        ) : (
          <p className="rounded-xl border border-dashed border-slate-300 py-10 text-center text-sm text-slate-500">Nothing has happened to this task yet.</p>
        ))}

      {confirming && <SubmitFlow task={task} busy={submitting} onCancel={() => setConfirming(false)} onSubmit={submit} />}
      {returning && <ReturnDialog task={task} onClose={() => setReturning(false)} onDone={reload} />}
    </div>
  );
}

/* =================== after submitting =================== */
function SubmittedSummary({ task, onReturn, onShowPlace }: { task: TaskDetail; onReturn?: () => void; onShowPlace: () => void }) {
  const loc = task.submit_location;
  const device = task.submit_device ? deviceLabel(task.submit_device.user_agent, task.submit_device.platform) : null;
  const tile = "min-w-0 rounded-xl border border-slate-200 bg-white p-3";
  return (
    <section aria-label="Submission" className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
      {/* Banner */}
      <div className="flex items-center gap-3 bg-[#1B7A3E] px-4 py-3 text-white">
        <CheckCircle2 className="h-7 w-7 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-base font-bold">
            Submitted <span className="font-normal opacity-80">·</span>
            <span className="inline-flex items-center gap-1 font-semibold">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" /> read-only
            </span>
          </p>
          <p className="text-[13px] text-[#DDF2E4]">{formatDateTime(task.submitted_at)}</p>
        </div>
        {task.is_late && <span className="shrink-0 rounded-full bg-[#FFE2B3] px-2.5 py-0.5 text-xs font-bold text-[#6B3A00]">Late</span>}
      </div>

      <div className="space-y-3 p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <div className={tile}>
            <p className="text-xs text-slate-500">Submitted by</p>
            <p className="mt-0.5 break-words text-[15px] font-semibold leading-snug text-slate-900">{task.submitter?.full_name ?? "—"}</p>
          </div>
          <div className={tile}>
            <p className="text-xs text-slate-500">Device</p>
            <p className="mt-0.5 flex items-start gap-1.5 break-words text-[15px] font-semibold leading-snug text-slate-900">
              <Smartphone className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              {device ?? "—"}
            </p>
          </div>

          {/* Location: opens the Site tab's map */}
          {loc?.lat != null ? (
            <button type="button" onClick={onShowPlace} title="Show on the map" className={`${tile} col-span-2 flex items-center gap-3 text-left transition hover:border-primary`}>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#E7EEF4] text-primary">
                <MapPin className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-slate-500">Location · ±{loc.accuracy} m</span>
                <span className="mt-0.5 block break-words text-[15px] font-semibold leading-snug text-slate-900">{loc.place?.label ?? `${loc.lat.toFixed(5)}, ${loc.lng!.toFixed(5)}`}</span>
                {loc.site && (
                  <span className={`mt-1.5 inline-block rounded-full px-2 py-0.5 text-xs font-bold ${loc.site.inside ? "bg-[#E3F4E8] text-[#145C2F]" : "bg-orange-100 text-orange-900"}`}>
                    {loc.site.inside ? "Inside the license area" : `${distanceText(loc.site.distance_m)} from the license area`}
                  </span>
                )}
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
            </button>
          ) : (
            <div className={`${tile} col-span-2 flex items-center gap-3`}>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700">
                <MapPin className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs text-slate-500">Location</span>
                <span className="mt-0.5 block break-words text-sm font-semibold text-amber-800">Not shared{loc?.error ? `: ${loc.error}` : ""}</span>
              </span>
            </div>
          )}
        </div>

        {onReturn ? (
          <Button variant="outline" className="h-12 w-full gap-2 border-primary text-primary sm:h-10 sm:w-auto" onClick={onReturn}>
            <RotateCcw className="h-4 w-4" /> Return for correction
          </Button>
        ) : (
          <p className="text-xs text-slate-500">Ask a supervisor if something needs correcting.</p>
        )}
      </div>
    </section>
  );
}

function ReturnDialog({ task, onClose, onDone }: { task: TaskDetail; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [returnTask, { isLoading }] = useReturnTaskMutation();
  const send = async () => {
    try {
      await returnTask({ id: task.inspection_id, reason: reason.trim() }).unwrap();
      toast.success("Returned to the team.");
      onClose();
      onDone();
    } catch (e: any) {
      toast.error(e?.data?.message || "Could not return it.");
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Return for correction</DialogTitle>
          <DialogDescription>{task.team?.name ?? "The team"} can edit the answers again and must submit once more. The reason is shown to them.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Label htmlFor="ret-reason">What needs correcting *</Label>
          <textarea id="ret-reason" rows={4} className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm" value={reason} onChange={(e) => setReason(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={send} disabled={isLoading || reason.trim().length < 3}>
            {isLoading ? "Returning…" : "Return to team"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const EVENT_LABEL: Record<string, string> = {
  started: "Started",
  submitted: "Submitted",
  returned: "Returned for correction",
  reassigned: "Given to another team",
  due_changed: "Due date changed",
  office_update: "Completed at the office",
};

function EventHistory({ task }: { task: TaskDetail }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
        <History className="h-4 w-4" /> History
      </h2>
      <ol className="space-y-1.5 border-l-2 border-slate-200 pl-4 text-sm">
        {task.events.map((e) => (
          <li key={e.event_id}>
            <span className="font-medium text-slate-800">{EVENT_LABEL[e.type] ?? e.type}</span>
            {e.type === "submitted" && e.details?.late && <span className="ml-1 text-amber-700">(late)</span>}
            <span className="text-slate-500">
              {" "}
              · {formatDateTime(e.created_at)}
              {e.user && ` · ${e.user.full_name}`}
            </span>
            {e.type === "returned" && e.details?.reason && <p className="text-xs text-slate-600">“{e.details.reason}”</p>}
            {e.type === "due_changed" && e.details?.to && <p className="text-xs text-slate-600">New due: end of {dueText(e.details.to)}</p>}
          </li>
        ))}
      </ol>
    </section>
  );
}
