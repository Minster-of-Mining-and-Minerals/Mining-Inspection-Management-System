"use client";

/**
 * Coordinates of an inspection's site, to copy (design "Coordinates A · Sheet with format tabs"):
 * my location (or where it was submitted), the license centre and every corner point, in the
 * format chosen once at the top (decimal, degrees-minutes-seconds, map link, UTM). A sheet from
 * the bottom on a phone, a centred box on a computer. All values are WGS84 (phones, Google Maps).
 */
import { useEffect, useRef, useState } from "react";
import { Check, Copy, ExternalLink, Share2, X } from "lucide-react";
import { COORD_FORMATS, CoordFormat, copyText, cornersOf, formatCoord } from "@/utils/coordinates";
import type { LicenseBoundary } from "@/utils/licenseArea";

const PREF_KEY = "coord-format";
type Point = { lat: number; lng: number };

export function CoordinatesSheet({
  open,
  onClose,
  title,
  me,
  meLabel,
  center,
  boundary,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  me: (Point & { accuracy?: number }) | null;
  meLabel: string;
  center: Point | null;
  boundary: LicenseBoundary | null;
}) {
  // The format is remembered on this phone / computer
  const [format, setFormat] = useState<CoordFormat>(() => {
    try {
      const f = typeof window !== "undefined" ? (window.localStorage.getItem(PREF_KEY) as CoordFormat | null) : null;
      return f && COORD_FORMATS.some(([k]) => k === f) ? f : "decimal";
    } catch {
      return "decimal";
    }
  });
  const [copied, setCopied] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const corners = cornersOf(boundary);

  const pick = (f: CoordFormat) => {
    setFormat(f);
    try {
      window.localStorage.setItem(PREF_KEY, f);
    } catch {
      /* preference only */
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = before;
    };
  }, [open, onClose]);

  if (!open) return null;

  const copy = async (key: string, text: string) => {
    if (await copyText(text)) {
      setCopied(key);
      window.setTimeout(() => setCopied((c) => (c === key ? null : c)), 2000);
    }
  };
  const allText = () => {
    const lines: string[] = [title];
    if (center) lines.push(`Centre: ${formatCoord(center.lat, center.lng, format)}`);
    corners.forEach((c) => lines.push(`${c.label}: ${formatCoord(c.lat, c.lng, format)}`));
    if (me) lines.push(`${meLabel}: ${formatCoord(me.lat, me.lng, format)}`);
    return lines.join("\n");
  };
  const share = async () => {
    const text = allText();
    if (navigator.share) {
      try {
        await navigator.share({ title, text });
        return;
      } catch {
        /* cancelled: nothing to do */
        return;
      }
    }
    await copy("share", text);
  };
  const target = center ?? me;

  const copyButton = (id: string, text: string) => <CopyButton done={copied === id} text={text} onCopy={() => copy(id, text)} />;

  return (
    <div className="fixed inset-0 z-[1100] flex items-end justify-center bg-slate-900/55 sm:items-center sm:p-4" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-label="Coordinates"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full flex-col rounded-t-2xl bg-white shadow-2xl sm:max-w-md sm:rounded-2xl"
      >
        <div className="flex justify-center pt-2.5 sm:hidden" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-slate-300" />
        </div>
        <div className="flex items-center py-1.5 pl-5 pr-2">
          <h2 className="flex-1 text-lg font-bold text-slate-900">Coordinates</h2>
          <button ref={closeRef} type="button" aria-label="Close" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-md text-slate-700 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* The format, chosen once */}
        <div role="tablist" aria-label="Format" className="mx-4 grid grid-cols-4 rounded-lg bg-slate-100 p-1">
          {COORD_FORMATS.map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={format === k}
              onClick={() => pick(k)}
              className={`h-10 rounded-md text-[13px] font-semibold ${format === k ? "bg-white text-primary shadow-sm" : "text-slate-600"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="mx-5 mt-1.5 text-[11px] text-slate-500">WGS84, the same as phones, GPS and Google Maps.</p>

        <div className="mt-1 overflow-y-auto">
          {me && (
            <Row label={`${meLabel}${me.accuracy ? ` · ±${Math.round(me.accuracy)} m` : ""}`} value={formatCoord(me.lat, me.lng, format)} marker="me">
              {copyButton("me", formatCoord(me.lat, me.lng, format))}
            </Row>
          )}
          {center && (
            <Row label="License centre" value={formatCoord(center.lat, center.lng, format)} marker="area">
              {copyButton("center", formatCoord(center.lat, center.lng, format))}
            </Row>
          )}
          {corners.length > 0 && (
            <>
              <div className="flex items-center px-5 pb-1 pt-3">
                <p className="flex-1 text-sm font-bold text-slate-700">Corner points ({corners.length})</p>
                <button
                  type="button"
                  onClick={() => copy("all", corners.map((c) => `${c.label}  ${formatCoord(c.lat, c.lng, format)}`).join("\n"))}
                  className={`flex h-9 items-center gap-1.5 rounded-lg px-3 text-sm font-bold ${copied === "all" ? "bg-green-100 text-green-800" : "border-[1.5px] border-primary text-primary hover:bg-slate-50"}`}
                >
                  {copied === "all" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                  {copied === "all" ? "Copied" : "Copy all"}
                </button>
              </div>
              <ul className="pb-2">
                {corners.map((c) => (
                  <li key={c.label} className="flex items-center gap-3 px-5 py-1.5">
                    <span className="w-9 shrink-0 text-sm font-bold text-slate-500">{c.label}</span>
                    <span className="min-w-0 flex-1 break-all font-mono text-sm text-slate-900">{formatCoord(c.lat, c.lng, format)}</span>
                    {copyButton(`c-${c.label}`, formatCoord(c.lat, c.lng, format))}
                  </li>
                ))}
              </ul>
            </>
          )}
          {!me && !center && !corners.length && <p className="px-5 py-8 text-center text-sm text-slate-500">No coordinates for this license yet.</p>}
        </div>

        <div className="grid grid-cols-2 gap-2.5 border-t border-slate-200 px-4 pb-6 pt-3 sm:pb-4">
          <button type="button" onClick={share} className="flex h-12 items-center justify-center gap-2 rounded-xl border-[1.5px] border-primary text-[15px] font-bold text-primary">
            {copied === "share" ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
            {copied === "share" ? "Copied" : "Share"}
          </button>
          <a
            href={target ? formatCoord(target.lat, target.lng, "link") : undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!target}
            className={`flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-[15px] font-bold text-white ${target ? "" : "pointer-events-none opacity-50"}`}
          >
            <ExternalLink className="h-4 w-4" /> Open in Maps
          </a>
        </div>
      </section>
    </div>
  );
}

function Row({ label, value, marker, children }: { label: string; value: string; marker: "me" | "area"; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-3">
      <span aria-hidden="true" className={marker === "me" ? "h-3 w-3 shrink-0 rounded-full bg-sky-600 ring-4 ring-sky-100" : "h-3 w-3 shrink-0 rounded-[3px] bg-sky-600/50"} />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="break-all font-mono text-[15px] text-slate-900">{value}</p>
      </div>
      {children}
    </div>
  );
}

function CopyButton({ done, text, onCopy }: { done: boolean; text: string; onCopy: () => void }) {
  return (
    <button
      type="button"
      onClick={onCopy}
      aria-label={`Copy ${text}`}
      className={`flex h-10 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-bold ${done ? "bg-green-100 text-green-800" : "border border-slate-300 bg-white text-primary hover:bg-slate-50"}`}
    >
      {done ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {done ? "Copied" : "Copy"}
    </button>
  );
}
