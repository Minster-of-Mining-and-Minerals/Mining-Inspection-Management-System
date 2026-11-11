"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Crown, Plus, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Loading01 from "@/features/template/component/Loading/Loading01";
import { usePermissions } from "@/hooks/usePermissions";
import { useGetTeamsQuery } from "@/redux/api/teamApi";
import { memberName } from "@/redux/types/team";
import { TeamDialog } from "./TeamDialogs";
import { SectorFilter } from "@/components/common/SectorFilter";

/** Teams: cards with current members and how many licenses each covers. */
export default function TeamsList() {
  const router = useRouter();
  const { check } = usePermissions();
  const canCreate = check({ allPermissions: ["TEAMS:CREATE"] });
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, isFetching, isError } = useGetTeamsQuery({
    search: debounced || undefined,
    is_active: showInactive ? undefined : true,
    limit: 100,
  });
  const teams = data?.data ?? [];

  if (isLoading) return <Loading01 />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Teams</h1>
          <p className="text-sm text-slate-500">Inspection teams, their members and the licenses each team covers.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SectorFilter />
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Team or member name…" className="w-60 pl-9" />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="h-4 w-4 accent-primary" />
            Show inactive
          </label>
          {canCreate && (
            <Button onClick={() => setCreating(true)} className="gap-2">
              <Plus className="h-4 w-4" /> New team
            </Button>
          )}
        </div>
      </div>

      {isError ? (
        <p className="py-10 text-center text-red-600">Could not load teams.</p>
      ) : teams.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">No teams found.</p>
      ) : (
        <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 ${isFetching ? "opacity-60" : ""}`}>
          {teams.map((t) => (
            <button
              key={t.team_id}
              type="button"
              onClick={() => router.push(`/teams/${t.team_id}`)}
              className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left transition-shadow hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-primary">{t.name}</p>
                  {t.description && <p className="line-clamp-1 text-xs text-slate-500">{t.description}</p>}
                </div>
                {!t.is_active && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Inactive</span>}
              </div>
              <ul className="space-y-1 text-sm">
                {t.members.length === 0 && <li className="italic text-slate-400">No members</li>}
                {t.members.map((m) => (
                  <li key={m.team_member_id} className="flex items-center gap-2">
                    {m.role === "leader" ? <Crown className="h-3.5 w-3.5 text-golden-deep" /> : <Users className="h-3.5 w-3.5 text-slate-300" />}
                    <span className="text-slate-800">{memberName(m)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-auto border-t pt-2 text-xs text-slate-500">
                {t.license_count ?? 0} license{t.license_count === 1 ? "" : "s"}
              </p>
            </button>
          ))}
        </div>
      )}

      <TeamDialog open={creating} team={null} onClose={() => setCreating(false)} />
    </div>
  );
}
