"use client";

import React from "react";
import { Link } from "@/i18n/navigation";
import Image from "next/image";
import LocaleSwitcher from "@/components/common/LanguageSwitcher/LocaleSwitcher";
import { useTranslations } from "next-intl";

interface PublicHeaderProps {
  /** "dark" sits on the navy home hero; "light" is the default for inner pages */
  variant?: "light" | "dark";
}

const PublicHeader = ({ variant = "light" }: PublicHeaderProps) => {
  const t = useTranslations("PublicHeader");
  const isDark = variant === "dark";

  return (
    <header
      className={`w-full z-30 fixed top-0 left-0 ${isDark
        ? "bg-primary text-white border-b border-white/10"
        : "bg-white/90 backdrop-blur-md shadow-md border-b border-gray-100"
        }`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-3 min-w-0">
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${isDark ? "bg-white" : ""}`}
          >
            <Image
              src="/logo-only.png"
              alt="Logo"
              width={40}
              height={40}
              className={`object-contain ${isDark ? "h-8 w-8" : "h-10 w-10"}`}
            />
          </span>
          <div className="min-w-0 leading-tight">
            <p
              className={`text-sm sm:text-[0.9375rem] font-bold tracking-wide truncate ${isDark ? "text-white" : "text-golden-deep"}`}
            >
              የማዕድን ሚኒስቴር
            </p>
            <p
              className={`text-xs sm:text-[0.8125rem] truncate ${isDark ? "text-slate-300" : "font-semibold text-golden-deep"}`}
            >
              {t("logoLine1")}
            </p>
          </div>
        </Link>

        {/* Language + login */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          <LocaleSwitcher />
          <Link
            href="/login"
            className={`px-4 py-2 sm:px-5 sm:py-2.5 rounded-lg text-sm font-semibold transition-colors shadow-sm
              focus:outline-none focus:ring-2 focus:ring-offset-2
              ${isDark
                ? "bg-golden-bright text-primary hover:bg-golden-bright/90 focus:ring-golden-bright focus:ring-offset-primary"
                : "bg-golden-deep text-white hover:bg-golden-deep/90 focus:ring-golden-deep"
              }`}
          >
            {t("login")}
          </Link>
        </div>
      </div>
    </header>
  );
};

export default PublicHeader;
