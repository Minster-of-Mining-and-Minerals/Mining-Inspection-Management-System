"use client";

/**
 * The sector filter of the central admin's pages (dashboard, teams, companies, inspections,
 * schedules, checklists, users, roles): all sectors, or one.
 *
 * It is one setting for the whole app (lib/sectorSelection.ts), sent to the API as X-Sector-Id, so
 * every page shows the same sector until it is changed. Sector users never see it: the backend
 * limits them to their own sector anyway.
 */
import { useSession } from "next-auth/react";
import { useLocale } from "next-intl";
import { useDispatch } from "react-redux";
import { baseApi } from "@/redux/baseApi";
import { useGetSectorNodesQuery } from "@/redux/api/sectorNodeApi";
import { setSelectedSectorId, useSelectedSectorId } from "@/lib/sectorSelection";
import { localizedName } from "@/utils/localizedName";
import type { FilterField } from "@/types/tableLayout";

const ALL = "all";

export function useSectorFilter() {
  const { data: session } = useSession();
  const isCentral = !!session?.user?.is_central;
  const locale = useLocale();
  const dispatch = useDispatch();
  const selected = useSelectedSectorId();
  const { data } = useGetSectorNodesQuery({ limit: 100, is_active: true }, { skip: !isCentral });
  // The sectors themselves: everything under the root
  const options = [
    { label: locale === "am" ? "ሁሉም ዘርፎች" : "All sectors", value: ALL },
    ...(data?.data ?? []).filter((s) => s.parent_id).map((s) => ({ label: localizedName(s, locale), value: s.sector_node_id })),
  ];
  const value = selected ?? ALL;

  const change = (next: string) => {
    if (next === value) return;
    setSelectedSectorId(next === ALL ? null : next);
    // Every list on screen and in the cache belongs to the old choice
    dispatch(baseApi.util.resetApiState());
  };

  /** For pages built on TableLayout (its filters list); null for sector users. */
  const field: FilterField | null = isCentral ? { key: "sector", label: "Sector", type: "select", value, onChange: change, options } : null;

  return { isCentral, value, options, change, field, filtering: !!selected };
}

/** The filter as a select, for pages with their own filter bar. Renders nothing for sector users. */
export function SectorFilter({ className = "" }: { className?: string }) {
  const { isCentral, value, options, change, filtering } = useSectorFilter();
  if (!isCentral) return null;
  return (
    <select
      aria-label="Sector"
      value={value}
      onChange={(e) => change(e.target.value)}
      className={`h-9 rounded-md border bg-white px-2 text-sm ${filtering ? "border-primary font-semibold text-primary" : "border-input"} ${className}`}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.value === ALL ? o.label : `Sector: ${o.label}`}
        </option>
      ))}
    </select>
  );
}
