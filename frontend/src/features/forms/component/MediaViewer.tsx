"use client";

/**
 * Opens inspection files inside the page instead of a new browser tab: photos large (previous / next,
 * also with the arrow keys), videos with their player, PDFs in a frame. Files a browser can't show
 * (Word, Excel, HEIC photos …) get a Download button.
 */
import { useEffect } from "react";
import { ChevronLeft, ChevronRight, Download, FileText, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export interface ViewerItem {
  url?: string;
  name: string;
  mime: string;
  kind: string;
  /** Shown under the name, e.g. "Signed on the screen" */
  note?: string;
}

const isHeic = (mime: string, name: string) => /hei[cf]/i.test(mime) || /\.hei[cf]$/i.test(name);
const showAs = (it: ViewerItem): "image" | "video" | "pdf" | "other" =>
  (it.kind === "image" || it.kind === "signature") && !isHeic(it.mime, it.name)
    ? "image"
    : it.kind === "video"
      ? "video"
      : it.mime === "application/pdf" || /\.pdf$/i.test(it.name)
        ? "pdf"
        : "other";
/** The same signed link, as a download */
const downloadUrl = (url: string) => `${url}${url.includes("?") ? "&" : "?"}download=1`;

export function MediaViewer({ items, index, onIndex, onClose }: { items: ViewerItem[]; index: number | null; onIndex: (i: number) => void; onClose: () => void }) {
  const open = index != null && !!items[index];
  const it = open ? items[index!] : null;
  const many = items.length > 1;

  useEffect(() => {
    if (!open || !many) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") onIndex((index! + 1) % items.length);
      if (e.key === "ArrowLeft") onIndex((index! - 1 + items.length) % items.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, many, index, items.length, onIndex]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[95vh] w-[95vw] max-w-5xl flex-col gap-3 p-3 sm:p-4 [&>button.absolute]:hidden">
        {it && (
          <>
            <div className="flex items-start gap-3 pr-1">
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate text-sm font-semibold text-slate-900">{it.name}</DialogTitle>
                <DialogDescription className="text-xs text-slate-500">
                  {it.note ? `${it.note} · ` : ""}
                  {many ? `${index! + 1} of ${items.length}` : ""}
                </DialogDescription>
              </div>
              {it.url && (
                <a href={downloadUrl(it.url)} className="flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-slate-300 px-3 text-sm font-medium text-primary hover:bg-slate-50">
                  <Download className="h-4 w-4" /> Download
                </a>
              )}
              <button type="button" onClick={onClose} aria-label="Close" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="relative flex min-h-[40vh] flex-1 items-center justify-center overflow-hidden rounded-lg bg-slate-900/95">
              {!it.url ? (
                <p className="text-sm text-slate-300">Loading…</p>
              ) : showAs(it) === "image" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={it.url} alt={it.name} className={`max-h-[78vh] max-w-full object-contain ${it.kind === "signature" ? "bg-white" : ""}`} />
              ) : showAs(it) === "video" ? (
                <video key={it.url} src={it.url} controls playsInline className="max-h-[78vh] max-w-full" />
              ) : showAs(it) === "pdf" ? (
                <iframe key={it.url} src={it.url} title={it.name} className="h-[78vh] w-full bg-white" />
              ) : (
                <div className="flex flex-col items-center gap-3 p-8 text-center text-slate-200">
                  <FileText className="h-12 w-12" />
                  <p className="text-sm">This file can&apos;t be shown in the browser.</p>
                  <a href={downloadUrl(it.url)} className="flex items-center gap-1.5 rounded-md bg-white px-4 py-2 text-sm font-semibold text-primary">
                    <Download className="h-4 w-4" /> Download {it.name}
                  </a>
                </div>
              )}

              {many && (
                <>
                  <button
                    type="button"
                    aria-label="Previous file"
                    onClick={() => onIndex((index! - 1 + items.length) % items.length)}
                    className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow hover:bg-white"
                  >
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <button
                    type="button"
                    aria-label="Next file"
                    onClick={() => onIndex((index! + 1) % items.length)}
                    className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow hover:bg-white"
                  >
                    <ChevronRight className="h-6 w-6" />
                  </button>
                </>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
