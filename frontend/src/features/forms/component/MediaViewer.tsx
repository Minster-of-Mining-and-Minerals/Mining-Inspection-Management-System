"use client";

/**
 * Opens inspection files inside the page (design "Viewer A · Dark lightbox"): the file large on a
 * dark background, arrows on the sides (computer), swipe (phone), the arrow keys, and a strip of
 * thumbnails. Photos, signatures, videos and PDFs are shown; HEIC photos through a JPEG preview;
 * other files (Word, Excel …) get a Download button.
 */
import { useEffect, useRef } from "react";
import { ChevronLeft, ChevronRight, Download, FileText, Loader2, Play, X } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { isHeic, useHeicPreview } from "@/utils/heic";

export interface ViewerItem {
  url?: string;
  name: string;
  mime: string;
  kind: string;
  size?: number;
  /** Shown under the name, e.g. "Signed on the screen" */
  note?: string;
}

const showAs = (it: ViewerItem): "image" | "video" | "pdf" | "other" =>
  it.kind === "image" || it.kind === "signature"
    ? "image"
    : it.kind === "video"
      ? "video"
      : it.mime === "application/pdf" || /\.pdf$/i.test(it.name)
        ? "pdf"
        : "other";
/** The same signed link, as a download */
const downloadUrl = (url: string) => `${url}${url.includes("?") ? "&" : "?"}download=1`;
const sizeText = (n?: number) => (!n ? "" : n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function MediaViewer({ items, index, onIndex, onClose }: { items: ViewerItem[]; index: number | null; onIndex: (i: number) => void; onClose: () => void }) {
  const open = index != null && !!items[index];
  const it = open ? items[index!] : null;
  const many = items.length > 1;
  const as = it ? showAs(it) : "other";
  const heic = !!it && as === "image" && isHeic(it.mime, it.name);
  const src = useHeicPreview(it?.url, heic);
  const strip = useRef<HTMLDivElement>(null);
  const touchX = useRef<number | null>(null);

  const go = (step: number) => index != null && onIndex((index + step + items.length) % items.length);

  useEffect(() => {
    if (!open || !many) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") onIndex((index! + 1) % items.length);
      if (e.key === "ArrowLeft") onIndex((index! - 1 + items.length) % items.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, many, index, items.length, onIndex]);

  // Keep the current thumbnail in view
  useEffect(() => {
    strip.current?.querySelector('[aria-current="true"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [index]);

  const sub = [it?.note, sizeText(it?.size)].filter(Boolean).join(" · ");

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 bg-[#0E1A24] p-0 text-white sm:h-[92vh] sm:w-[95vw] sm:max-w-6xl sm:rounded-2xl [&>button.absolute]:hidden">
        {it && (
          <>
            {/* Top bar */}
            <div className="flex items-center gap-2 border-b border-[#1E2E3B] py-2.5 pl-4 pr-2 sm:gap-3 sm:py-3 sm:pl-5">
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate text-sm font-semibold text-white sm:text-[15px]">{it.name}</DialogTitle>
                <DialogDescription className="truncate text-xs text-[#A9B8C4] sm:text-[13px]">
                  {many && <span className="sm:hidden">{index! + 1} of {items.length}{sub ? " · " : ""}</span>}
                  {sub}
                </DialogDescription>
              </div>
              {many && (
                <span className="hidden shrink-0 rounded-full bg-[#1E2E3B] px-3 py-1.5 text-sm font-semibold text-[#DCE4EA] sm:block">
                  {index! + 1} / {items.length}
                </span>
              )}
              {it.url && (
                <a
                  href={downloadUrl(it.url)}
                  aria-label="Download"
                  className="flex h-11 w-11 shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-semibold text-white hover:bg-[#1E2E3B] sm:h-10 sm:w-auto sm:border sm:border-[#3C5162] sm:px-3.5"
                >
                  <Download className="h-5 w-5 sm:h-4 sm:w-4" />
                  <span className="hidden sm:inline">Download</span>
                </a>
              )}
              <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#1E2E3B] text-white hover:bg-[#2A3E4E]">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* The file */}
            <div
              className="relative flex min-h-0 flex-1 items-center justify-center p-0 sm:px-20 sm:py-4"
              onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
              onTouchEnd={(e) => {
                const start = touchX.current;
                touchX.current = null;
                if (!many || start == null) return;
                const dx = e.changedTouches[0].clientX - start;
                if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
              }}
            >
              {!it.url ? (
                <Loader2 className="h-8 w-8 animate-spin text-[#A9B8C4]" aria-label="Loading" />
              ) : as === "image" && src === undefined ? (
                <p className="flex items-center gap-2 text-sm text-[#A9B8C4]">
                  <Loader2 className="h-5 w-5 animate-spin" /> Preparing the photo…
                </p>
              ) : as === "image" && src !== "failed" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt={it.name} className={`max-h-full max-w-full select-none object-contain ${it.kind === "signature" ? "rounded bg-white p-2" : ""}`} draggable={false} />
              ) : as === "video" ? (
                <video key={it.url} src={it.url} controls playsInline className="max-h-full max-w-full" />
              ) : as === "pdf" ? (
                <iframe key={it.url} src={it.url} title={it.name} className="h-full w-full rounded bg-white" />
              ) : (
                <div className="flex flex-col items-center gap-3 p-8 text-center text-[#DCE4EA]">
                  <FileText className="h-12 w-12" />
                  <p className="text-sm">This file can&apos;t be shown in the browser.</p>
                  <a href={downloadUrl(it.url)} className="flex h-11 items-center gap-2 rounded-lg bg-white px-4 text-sm font-semibold text-[#0E1A24]">
                    <Download className="h-4 w-4" /> Download {it.name}
                  </a>
                </div>
              )}

              {many && (
                <>
                  <button type="button" aria-label="Previous file" onClick={() => go(-1)} className="absolute left-4 top-1/2 hidden h-[52px] w-[52px] -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#0E1A24] shadow-lg hover:bg-slate-100 sm:flex">
                    <ChevronLeft className="h-6 w-6" />
                  </button>
                  <button type="button" aria-label="Next file" onClick={() => go(1)} className="absolute right-4 top-1/2 hidden h-[52px] w-[52px] -translate-y-1/2 items-center justify-center rounded-full bg-white text-[#0E1A24] shadow-lg hover:bg-slate-100 sm:flex">
                    <ChevronRight className="h-6 w-6" />
                  </button>
                </>
              )}
            </div>

            {/* Thumbnails */}
            {many && (
              <>
                <p className="pt-2 text-center text-xs text-[#A9B8C4] sm:hidden">Swipe for the next file</p>
                <div ref={strip} className="flex gap-2 overflow-x-auto px-4 pb-4 pt-2 sm:justify-center sm:gap-2.5 sm:pb-5 sm:pt-3">
                  {items.map((t, i) => (
                    <Thumb key={`${t.url ?? t.name}-${i}`} item={t} current={i === index} onClick={() => onIndex(i)} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Thumb({ item, current, onClick }: { item: ViewerItem; current: boolean; onClick: () => void }) {
  const as = showAs(item);
  const plainImage = as === "image" && !isHeic(item.mime, item.name) && item.url;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${item.name}${current ? " (showing)" : ""}`}
      aria-current={current ? "true" : undefined}
      className={`flex h-11 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[#3A4E5D] text-[11px] font-bold text-white transition sm:h-[50px] sm:w-[68px] ${current ? "ring-2 ring-[#E8C468]" : "opacity-60 hover:opacity-100"}`}
    >
      {plainImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.url} alt="" className={`h-full w-full ${item.kind === "signature" ? "bg-white object-contain" : "object-cover"}`} />
      ) : as === "video" ? (
        <Play className="h-4 w-4 fill-current" />
      ) : as === "pdf" ? (
        "PDF"
      ) : as === "image" ? (
        "HEIC"
      ) : (
        <FileText className="h-4 w-4" />
      )}
    </button>
  );
}
