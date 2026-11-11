"use client";

/**
 * Full-page map: a button on the map that makes its frame (the map and the panels over it) fill
 * the whole window, and back. Esc also goes back. Works on phones too (no Fullscreen API needed).
 *
 *   const max = useMapMaximize();
 *   <div className={`relative … ${max.frameClass}`}>
 *     <LicenseMap … />
 *     <MapMaximizeButton {...max} className="absolute right-3 top-[86px] z-10" />
 *   </div>
 */
import { useEffect, useState } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

// Over the app header and sidebar; the !s win over the frame's own size and border classes
const FULL = "!fixed !inset-0 !z-[1000] !m-0 !h-auto !min-h-0 !w-auto !max-w-none !rounded-none !border-0";

export function useMapMaximize() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!maximized) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMaximized(false);
    window.addEventListener("keydown", onKey);
    // The page behind doesn't scroll while the map fills the window
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [maximized]);

  return { maximized, toggle: () => setMaximized((m) => !m), frameClass: maximized ? FULL : "" };
}

export function MapMaximizeButton({ maximized, toggle, className = "" }: { maximized: boolean; toggle: () => void; className?: string }) {
  const label = maximized ? "Exit full page" : "Show the map full page";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      aria-pressed={maximized}
      title={maximized ? `${label} (Esc)` : label}
      className={`flex h-11 w-11 items-center justify-center rounded-full border border-slate-300 bg-white text-primary shadow-md hover:bg-slate-50 ${className}`}
    >
      {maximized ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
    </button>
  );
}
