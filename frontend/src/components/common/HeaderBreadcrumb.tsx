"use client";

import { useParams, usePathname } from "next/navigation";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { breadcrumbConfig } from "../../utils/breadcrumbConfig";
import { useBreadcrumbTitle } from "../../providers/BreadcrumbProvider";
import Link from "next/link";

// "dark" = navy admin top bar: a small trail of parent pages above the current page as a title
const HeaderBreadcrumb = ({ variant = "light" }: { variant?: "light" | "dark" } = {}) => {
    const pathname = usePathname();
    const params = useParams();
    const { dynamicBreadcrumb, dynamicTitles } = useBreadcrumbTitle();
    const { check } = usePermissions();

    // ✅ extract locale from params
    const locale = params?.locale as string;

    // ✅ remove locale from pathname for matching
    const pathnameWithoutLocale =
        locale && pathname.startsWith(`/${locale}`)
            ? pathname.replace(`/${locale}`, "") || "/"
            : pathname;

    const withLocale = (path: string) =>
        path ? `/${locale}${path}` : "";

    const getBreadcrumbs = (): { title: string; path: string }[] => {
        // 1️⃣ exact match
        if (breadcrumbConfig[pathnameWithoutLocale]) {
            return breadcrumbConfig[pathnameWithoutLocale];
        }

        // 2️⃣ detail pages: routes written like "/companies/[companyId]"
        for (const [route, crumbs] of Object.entries(breadcrumbConfig)) {
            if (!route.includes("[")) continue;
            // Compare part by part; "[name]" parts take any value
            const want = route.split("/");
            const have = pathnameWithoutLocale.split("/");
            if (want.length !== have.length) continue;
            const values: Record<string, string> = {};
            const names: string[] = [];
            const fits = want.every((part, i) => {
                const param = /^\[([^\]]+)\]$/.exec(part);
                if (!param) return part === have[i];
                if (!have[i]) return false;
                values[param[1]] = decodeURIComponent(have[i]);
                names.push(param[1]);
                return true;
            });
            if (!fits) continue;
            const fill = (p: string) => p.replace(/\[([^\]]+)\]/g, (_, n) => values[n] ?? "");
            return crumbs.map((crumb, index) => {
                const isLast = index === crumbs.length - 1;
                const id = isLast ? values[names[names.length - 1]] : undefined;
                // The page's own name (set by the page once loaded), else the generic word
                const named = (id && dynamicTitles[id]) || (isLast && dynamicBreadcrumb.title) || null;
                return { title: named || crumb.title, path: fill(crumb.path) };
            });
        }

        // 3️⃣ fallback: never show an id as a title
        const looksLikeId = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s) || /^\d+$/.test(s);
        const segments = pathnameWithoutLocale.split("/").filter(Boolean);
        let currentPath = "";

        return segments.map((segment, index) => {
            currentPath += `/${segment}`;
            const isLast = index === segments.length - 1;

            return {
                title:
                    isLast && dynamicBreadcrumb.title
                        ? dynamicBreadcrumb.title
                        : looksLikeId(segment)
                            ? "Details"
                            : segment
                                .replace(/[-_]/g, " ")
                                .replace(/\b\w/g, c => c.toUpperCase()),
                path: isLast ? "" : currentPath,
            };
        });
    };

    // People who only work on their own tasks reach an inspection from My Tasks
    const seesAllInspections = check({ anyPermissions: ["INSPECTIONS:READ_ALL"] });
    const adjust = (list: { title: string; path: string }[]) =>
        !seesAllInspections && /^\/inspections\/[^/]+$/.test(pathnameWithoutLocale)
            ? list.map((c, i) => (i === 0 ? { title: "My Tasks", path: "/my-tasks" } : c))
            : list;

    const breadcrumbs = adjust(getBreadcrumbs());

    if (variant === "dark") {
        const parents = breadcrumbs.slice(0, -1);
        const current = breadcrumbs[breadcrumbs.length - 1];
        return (
            <div className="flex min-w-0 flex-col leading-tight">
                {parents.length > 0 && (
                    <nav aria-label="Breadcrumb" className="hidden items-center gap-1 truncate text-xs text-slate-400 sm:flex">
                        {parents.map((crumb, index) => (
                            <span key={index} className="flex items-center gap-1">
                                {crumb.path ? (
                                    <Link href={withLocale(crumb.path)} className="hover:text-white hover:underline">
                                        {crumb.title}
                                    </Link>
                                ) : (
                                    <span>{crumb.title}</span>
                                )}
                                <ChevronRightIcon aria-hidden className="h-3 w-3" />
                            </span>
                        ))}
                    </nav>
                )}
                {parents.length > 0 && parents[parents.length - 1].path && (
                    <Link
                        href={withLocale(parents[parents.length - 1].path)}
                        className="flex items-center gap-0.5 truncate text-xs text-slate-300 hover:text-white sm:hidden"
                    >
                        <ChevronLeftIcon aria-hidden className="h-3 w-3 shrink-0" /> {parents[parents.length - 1].title}
                    </Link>
                )}
                {current && (
                    <span className="truncate text-base font-bold text-white sm:text-lg" title={current.title}>{current.title}</span>
                )}
            </div>
        );
    }

    return (
        <nav className="flex items-center gap-1.5 text-base">
            {breadcrumbs.map((crumb, index) => (
                <div key={index} className="flex items-center gap-1.5">
                    {crumb.path ? (
                        <Link
                            href={withLocale(crumb.path)}
                            className="text-primary hover:font-medium hover:text-primary/90"
                        >
                            {crumb.title}
                        </Link>
                    ) : (
                        <span className="font-medium text-gray-800 dark:text-white/90">
                            {crumb.title}
                        </span>
                    )}
                    {index < breadcrumbs.length - 1 && (
                        <ChevronRightIcon className="h-4 w-4 text-gray-400" />
                    )}
                </div>
            ))}
        </nav>
    );
};

export default HeaderBreadcrumb;
