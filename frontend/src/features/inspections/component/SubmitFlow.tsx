"use client";

/**
 * Submitting an inspection, full screen, in two steps:
 *   1. Share your location (the phone asks for permission; help when it's off or blocked)
 *   2. Confirm and submit
 * Without a location it can't be submitted (the server checks this too).
 */
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, Loader2, MapPin, Send, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TaskDetail } from "@/redux/types/inspection";
import { deviceLabel } from "@/utils/device";
import { dueText } from "./taskUi";

export type Located = { lat: number; lng: number; accuracy: number; altitude?: number | null; captured_at: string };
type Failure = { error: "insecure" | "no_service" | "denied" | "timeout" | "unavailable"; detail?: string };

/** Ask the browser for a fresh position; never throws. */
const locate = () =>
  new Promise<Located | Failure>((resolve) => {
    if (!("geolocation" in navigator)) return resolve({ error: window.isSecureContext ? "no_service" : "insecure" });
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy), altitude: p.coords.altitude, captured_at: new Date(p.timestamp).toISOString() }),
      (e) =>
        resolve({
          error: !window.isSecureContext && e.code === e.PERMISSION_DENIED ? "insecure" : e.code === e.PERMISSION_DENIED ? "denied" : e.code === e.TIMEOUT ? "timeout" : "unavailable",
          detail: e.message,
        }),
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 },
    );
  });

const HELP: Record<Failure["error"], { title: string; text: React.ReactNode }> = {
  denied: {
    title: "Location is blocked for this site",
    text: (
      <>
        Tap the lock icon next to the address → <b>Permissions</b> (or Site settings) → <b>Location</b> → <b>Allow</b>, then tap <b>Allow location</b> again.
      </>
    ),
  },
  timeout: { title: "Finding your location took too long", text: <>Make sure the phone’s Location is on, move to an open area or near a window, and try again.</> },
  unavailable: { title: "Your location could not be found", text: <>Turn on the phone’s Location (GPS) in the quick settings and try again.</> },
  no_service: { title: "This browser has no location service", text: <>Open the system in Chrome on a phone with GPS.</> },
  insecure: {
    title: "This page is not secure (http://)",
    text: (
      <>
        Browsers only share the location on <b>https://</b> pages. Open the system at <b>https://inspection.mom.gov.et</b>.
      </>
    ),
  },
};

export function SubmitFlow({
  task,
  busy,
  onCancel,
  onSubmit,
}: {
  task: TaskDetail;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (location: Record<string, any>) => void;
}) {
  const [finding, setFinding] = useState(false);
  const [fix, setFix] = useState<Located | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const late = new Date(task.due_at) < new Date();

  const allow = async () => {
    setFinding(true);
    setFailure(null);
    const r = await locate();
    setFinding(false);
    if ("lat" in r) {
      setFix(r);
      setStep(2);
    } else setFailure(r);
  };

  // Close with Escape; keep the page behind from scrolling
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onCancel();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = before;
      window.removeEventListener("keydown", onKey);
    };
  }, [busy, onCancel]);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="submit-title" className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-white">
      <div className="mx-auto flex min-h-full w-full max-w-lg flex-col">
        {/* Top bar */}
        <div className="flex items-center gap-3 border-b border-slate-200 px-3 py-3">
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-11 w-11 shrink-0"
            aria-label={step === 2 ? "Back to the location step" : "Back to the questions"}
            disabled={busy}
            onClick={() => (step === 2 ? setStep(1) : onCancel())}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
            <p className="truncate text-xs text-slate-500">{task.company?.name}</p>
            <p className="text-[15px] font-semibold text-slate-900">Submit inspection · step {step} of 2</p>
          </div>
        </div>

        {step === 1 ? (
          <>
            <div className="flex flex-1 flex-col gap-5 px-6 py-7">
              {/* Map-like panel with the pin */}
              <div className="relative flex h-52 items-center justify-center overflow-hidden rounded-2xl bg-[#e8f1f6]" aria-hidden="true">
                <span className="absolute -left-10 top-14 h-0.5 w-[130%] -rotate-12 bg-[#c9dbe6]" />
                <span className="absolute -left-10 top-36 h-0.5 w-[130%] rotate-6 bg-[#c9dbe6]" />
                <span className="absolute -top-5 left-1/3 h-[130%] w-0.5 rotate-12 bg-[#c9dbe6]" />
                <span className={`flex h-24 w-24 items-center justify-center rounded-full ${finding ? "animate-pulse" : ""} bg-red-600/10`}>
                  <svg width="46" height="58" viewBox="0 0 30 40">
                    <path d="M15 1C7.3 1 1 7.2 1 14.9 1 25.3 15 39 15 39s14-13.7 14-24.1C29 7.2 22.7 1 15 1z" fill="#dc2626" stroke="#ffffff" strokeWidth="2" />
                    <circle cx="15" cy="15" r="5.2" fill="#ffffff" />
                  </svg>
                </span>
              </div>

              <div className="space-y-2">
                <h1 id="submit-title" className="text-2xl font-bold leading-tight text-slate-900">
                  Share your location to submit
                </h1>
                <p className="text-[15px] leading-relaxed text-slate-600">
                  The Ministry records where each inspection is submitted. Your location is taken once, now, and saved with this inspection only.
                </p>
              </div>

              {failure ? (
                <div className="space-y-1.5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">
                  <p className="flex items-center gap-2 font-semibold">
                    <AlertTriangle className="h-4 w-4 shrink-0" /> {HELP[failure.error].title}
                  </p>
                  <p className="leading-relaxed">{HELP[failure.error].text}</p>
                  {failure.detail && <p className="text-[11px] text-red-700/70">Browser says: {failure.detail}</p>}
                </div>
              ) : (
                <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed text-slate-700">
                  <li>
                    Turn on the phone’s <b>Location</b> (quick settings).
                  </li>
                  <li>
                    Tap <b>Allow location</b>, then <b>Allow</b> when the phone asks.
                  </li>
                  <li>
                    Blocked before? Tap the lock icon by the address → <b>Location</b> → <b>Allow</b>.
                  </li>
                </ol>
              )}
            </div>

            <div className="sticky bottom-0 space-y-2 border-t border-slate-200 bg-white px-6 pb-7 pt-4">
              <Button type="button" className="h-14 w-full gap-2 rounded-xl text-[17px]" onClick={allow} disabled={finding}>
                {finding ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" /> Finding your location…
                  </>
                ) : (
                  <>
                    <MapPin className="h-5 w-5" /> {failure ? "Try again" : "Allow location"}
                  </>
                )}
              </Button>
              <Button type="button" variant="ghost" className="h-11 w-full text-slate-600" onClick={onCancel} disabled={finding}>
                Back to the questions
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex flex-1 flex-col gap-5 px-6 py-7">
              <div className="flex items-center gap-3 rounded-2xl border border-green-200 bg-green-50 p-4">
                <CheckCircle2 className="h-7 w-7 shrink-0 text-green-700" aria-hidden="true" />
                <div>
                  <p className="font-semibold text-green-900">Location found</p>
                  <p className="text-sm text-green-800">
                    ±{fix?.accuracy} m · {fix?.lat.toFixed(5)}, {fix?.lng.toFixed(5)}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <h1 id="submit-title" className="text-2xl font-bold leading-tight text-slate-900">
                  Submit this inspection?
                </h1>
                <p className="text-[15px] leading-relaxed text-slate-600">After submitting, nobody in your team can change it.</p>
              </div>

              <dl className="divide-y rounded-xl border border-slate-200 text-sm">
                <div className="flex justify-between gap-4 px-4 py-3">
                  <dt className="text-slate-500">Company</dt>
                  <dd className="text-right font-medium text-slate-900">{task.company?.name}</dd>
                </div>
                <div className="flex justify-between gap-4 px-4 py-3">
                  <dt className="text-slate-500">License</dt>
                  <dd className="text-right font-medium text-slate-900">{task.license?.license_number}</dd>
                </div>
                <div className="flex justify-between gap-4 px-4 py-3">
                  <dt className="text-slate-500">Form</dt>
                  <dd className="text-right font-medium text-slate-900">{task.form?.name}</dd>
                </div>
                <div className="flex items-center justify-between gap-4 px-4 py-3">
                  <dt className="text-slate-500">Device</dt>
                  <dd className="flex items-center gap-1.5 text-right font-medium text-slate-900">
                    <Smartphone className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    {typeof navigator !== "undefined" ? deviceLabel(navigator.userAgent, (navigator as any).userAgentData?.platform || navigator.platform) : ""}
                  </dd>
                </div>
              </dl>

              {late && (
                <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> It was due by the end of {dueText(task.due_at)}, so it will be marked <b>late</b>.
                </p>
              )}
            </div>

            <div className="sticky bottom-0 space-y-2 border-t border-slate-200 bg-white px-6 pb-7 pt-4">
              <Button type="button" className="h-14 w-full gap-2 rounded-xl text-[17px]" onClick={() => fix && onSubmit(fix)} disabled={busy || !fix}>
                {busy ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" /> Submitting…
                  </>
                ) : (
                  <>
                    <Send className="h-5 w-5" /> Submit inspection
                  </>
                )}
              </Button>
              <Button type="button" variant="ghost" className="h-11 w-full text-slate-600" onClick={onCancel} disabled={busy}>
                Back to the questions
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
