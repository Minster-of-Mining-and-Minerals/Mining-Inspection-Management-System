"use client";

/**
 * "Opened for update": every opening of sections of submitted inspections, with how many teams are done,
 * filters (open / closed / all, team, company or license), Edit, Close now and Close all.
 */
import { useEffect, useState } from "react";
import { Loader2, Search, Unlock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useGetOpeningsPageQuery } from "@/redux/api/inspectionApi";
import { useGetSubmissionMapOptionsQuery } from "@/redux/api/dashboardApi";
import { usePermissions } from "@/hooks/usePermissions";
import { CloseAllButton, OpeningCard } from "./SectionOpenings";

type Tab = "open" | "closed" | "all";

export default function OpenedForUpdate() {
  const { check } = usePermissions();
  const canManage = check({ allPermissions: ["INSPECTIONS:REVIEW"] });
  const [tab, setTab] = useState<Tab>("open");
  const [team, setTeam] = useState("");
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setTerm(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);
  const { data: options } = useGetSubmissionMapOptionsQuery();
  const { data, isLoading, isFetching, isError, refetch } = useGetOpeningsPageQuery({ state: tab === "all" ? undefined : tab, team_id: team || undefined, search: term || undefined });
  const totals = data?.totals;
  const openings = data?.data ?? [];
  const openNow = openings.filter((o) => o.is_open);

  const tiles: [string, number | undefined, string, string][] = [
    ["Open now", totals?.open_openings, "openings", "text-primary"],
    ["Inspections waiting", totals?.waiting, "the team hasn't tapped Done", "text-amber-700"],
    ["Done updating", totals?.done, `of ${totals?.total ?? 0} opened`, "text-[#1B7A3E]"],
    ["Closed, not done", totals?.closed_not_done, "deadline passed or closed", "text-slate-600"],
  ];

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1 basis-72">
          <h1 className="flex items-center gap-2 text-xl font-bold text-primary sm:text-2xl">
            <Unlock className="h-6 w-6" aria-hidden="true" /> Opened for update
          </h1>
          <p className="text-sm text-slate-600">Sections of submitted inspections that teams were asked to fill in or correct, and who is done.</p>
        </div>
        {canManage && tab !== "closed" && !team && !term && <CloseAllButton openings={openNow} target={{ all: true }} />}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tiles.map(([label, n, note, cls]) => (
          <div key={label} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="text-xs text-slate-500">{label}</p>
            <p className={`text-2xl font-bold tabular-nums ${cls}`}>{n ?? "—"}</p>
            <p className="text-xs text-slate-500">{note}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5" role="tablist" aria-label="State">
          {(
            [
              ["open", "Open", totals?.tabs.open],
              ["closed", "Closed", totals?.tabs.closed],
              ["all", "All", totals?.tabs.all],
            ] as const
          ).map(([k, label, n]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`h-9 rounded-full border px-3.5 text-sm font-semibold ${tab === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"}`}
            >
              {label} {n != null && <span className="tabular-nums">{n}</span>}
            </button>
          ))}
        </div>
        <div className="ml-auto flex w-full flex-wrap gap-2 sm:w-auto">
          <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input aria-label="Search company or license" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Company or license" className="bg-white pl-9" />
          </div>
          <select aria-label="Team" className="h-9 rounded-md border border-input bg-white px-3 text-sm" value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">All teams</option>
            {options?.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2" aria-busy="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-36 animate-pulse rounded-xl border border-slate-200 bg-white" />
          ))}
        </div>
      ) : isError ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-6 text-center text-sm text-red-800">
          Could not load the openings.{" "}
          <button type="button" className="font-semibold underline" onClick={() => refetch()}>
            Retry
          </button>
        </p>
      ) : !openings.length ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-500">
          {term || team ? "No openings match." : tab === "open" ? "Nothing is open for update right now." : "No openings yet."} Open sections from a submitted inspection or from a schedule&apos;s round.
        </p>
      ) : (
        <ul className={`space-y-2 ${isFetching ? "opacity-70" : ""}`}>
          {openings.map((o) => (
            <OpeningCard key={o.opening_id} o={o} canManage={canManage} single={o.total === 1} />
          ))}
        </ul>
      )}
      {isFetching && !isLoading && <Loader2 className="mx-auto h-5 w-5 animate-spin text-slate-400" aria-label="Loading" />}
    </div>
  );
}
