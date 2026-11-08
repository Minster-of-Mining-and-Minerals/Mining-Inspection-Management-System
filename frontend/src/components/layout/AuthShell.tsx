"use client";

import React from "react";
import { cn } from "@/lib/utils";

/**
 * Shared frame for the auth pages (login, forgot password, change password):
 * navy gem-facet page, white logo panel on the left (desktop) and a dark glass
 * form panel on the right.
 */
export function AuthShell({
  topAction,
  children,
}: {
  /** Back / Logout button shown in the card's top-left corner. */
  topAction?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-primary bg-[url('/images/login-facets.svg')] bg-cover bg-center px-4 py-10">
      <div className="relative flex w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-golden-bright/45 shadow-[0_30px_80px_rgba(0,0,0,0.55)] lg:min-h-[640px] lg:flex-row">
        {topAction && <div className="absolute left-4 top-4 z-20">{topAction}</div>}

        {/* Left — logo on white with gold gem shards (desktop only) */}
        <div className="relative hidden w-full items-center justify-center overflow-hidden bg-white p-8 lg:flex lg:flex-col">
          <img
            src="/images/login-shard.svg"
            alt=""
            aria-hidden
            className="pointer-events-none absolute -bottom-2.5 -left-2.5 h-60 w-60 rotate-180"
          />
          <img src="/logo-mom.png" alt="Ministry of Mines" className="relative h-80 w-auto xl:h-[22rem]" />
          <p className="relative mt-2 text-[13px] font-semibold tracking-[0.24em] text-primary">
            MINING INSPECTION MANAGEMENT SYSTEM
          </p>
        </div>

        {/* Right — dark glass form panel */}
        <div className="flex w-full items-center justify-center border-golden-bright/35 bg-[#04263A]/70 px-6 pb-10 pt-20 backdrop-blur-xl sm:px-12 lg:border-l lg:px-16 lg:py-10">
          <div className="w-full max-w-[390px] text-white">
            {/* Compact logo on small screens, where the left panel is hidden */}
            <img src="/logo-mom.png" alt="Ministry of Mines" className="mx-auto mb-6 h-28 w-auto lg:hidden" />
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Back-style link button for the card corner. Gold on the dark mobile panel, navy on the white desktop panel. */
export function AuthTopButton({
  onClick,
  icon,
  children,
  tone = "default",
}: {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-lg p-2 text-sm font-medium transition-colors [&_svg]:h-5 [&_svg]:w-5",
        tone === "danger"
          ? "text-red-300 hover:bg-white/10 lg:text-red-600 lg:hover:bg-red-50"
          : "text-golden-bright hover:bg-white/10 lg:text-primary lg:hover:bg-slate-100"
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/** Gold cut-gem mark used above the form titles. */
export function GemIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden className={className}>
      <path d="M12 6h24l10 12-22 26L2 18Z" fill="#E9C46A" />
      <path
        d="M2 18h44M12 6l6 12 6-12 6 12 6-12M18 18l6 26 6-26"
        stroke="#8A6A0E"
        strokeWidth="1.6"
        strokeLinejoin="round"
        opacity=".55"
      />
      <path d="M12 6h24l10 12-22 26L2 18Z" stroke="#8A6A0E" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

/** Round gold-outlined icon badge for step headings (mail, shield, lock...). */
export function AuthIconBadge({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-golden-bright/40 bg-golden-bright/10 text-golden-bright [&_svg]:h-6 [&_svg]:w-6">
      {children}
    </div>
  );
}

export const authLabelClass =
  "mb-1.5 block text-[13px] font-semibold text-[#DCE7EE] data-[error=true]:text-red-300";

// Glass input on the dark panel; the autofill rules stop Chrome painting it white.
export const authInputClass =
  "h-[52px] w-full rounded-xl border border-white/20 bg-white/[0.07] pl-11 pr-4 text-[15px] text-white placeholder:text-[#8FB0C4] outline-none transition " +
  "focus:border-golden-bright focus:bg-white/10 focus:ring-4 focus:ring-golden-bright/15 " +
  "aria-[invalid=true]:border-red-400/70 " +
  "autofill:shadow-[inset_0_0_0_1000px_#0B3A55] [&:-webkit-autofill]:[-webkit-text-fill-color:#fff]";

/** Icon placed inside an input (left side). */
export function AuthInputIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-golden-bright [&_svg]:h-[18px] [&_svg]:w-[18px]">
      {children}
    </span>
  );
}

export const authErrorTextClass = "mt-1.5 text-xs font-medium text-red-300";

/** Gold primary button for the dark panel. */
export function AuthSubmitButton({
  loading,
  loadingText,
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; loadingText?: string }) {
  return (
    <button
      type="submit"
      disabled={loading || props.disabled}
      className={cn(
        "flex h-[54px] w-full items-center justify-center gap-2.5 rounded-xl bg-gradient-to-br from-[#F2D88F] via-[#E9C46A] to-[#C99A2E] text-base font-bold text-primary shadow-[0_10px_26px_rgba(233,196,106,0.28)] transition hover:brightness-105 focus:outline-none focus-visible:ring-4 focus-visible:ring-golden-bright/40 disabled:cursor-not-allowed disabled:opacity-80 [&_svg]:h-5 [&_svg]:w-5",
        className
      )}
      {...props}
    >
      {loading ? (
        <>
          <svg className="animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden>
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          {loadingText}
        </>
      ) : (
        children
      )}
    </button>
  );
}
