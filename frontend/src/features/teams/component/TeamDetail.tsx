"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Crown, Edit, LogOut, MapPin, Plus, Power, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Loading01 from "@/features/template/component/Loading/Loading01";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useGetTeamByIdQuery,
  useRemoveTeamLicenseMutation,
  useRemoveTeamMemberMutation,
  useUpdateTeamMemberMutation,
  useUpdateTeamMutation,
} from "@/redux/api/teamApi";
import { LICENSE_TYPE_LABEL, areaPath } from "@/redux/types/company";
import { TeamMember, memberName } from "@/redux/types/team";
import { formatCalendarDate } from "@/utils/date";
import { CreateUserModal } from "@/components/common/modals/CreateUserModal";
import { AddLicensesDialog, AddMemberDialog, TeamDialog } from "./TeamDialogs";

export default function TeamDetail() {
  const { teamId } = useParams<{ teamId: string }>();
  const router = useRouter();
  const { check } = usePermissions();
  const canUpdate = check({ allPermissions: ["TEAMS:UPDATE"] });
  const canManageMembers = check({ allPermissions: ["TEAMS:MANAGE_MEMBERS"] });
  const canCreateUsers = canManageMembers && check({ allPermissions: ["USERS:CREATE"] });

  const { data: team, isLoading, isError } = useGetTeamByIdQuery(teamId, { skip: !teamId });
  const [updateTeam, { isLoading: toggling }] = useUpdateTeamMutation();
  const [updateMember] = useUpdateTeamMemberMutation();
  const [removeMember, { isLoading: removing }] = useRemoveTeamMemberMutation();
  const [removeLicense] = useRemoveTeamLicenseMutation();

  const [editing, setEditing] = useState(false);
  const [addingMember, setAddingMember] = useState(false);
  const [addingLicenses, setAddingLicenses] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<TeamMember | null>(null);

  if (isLoading) return <Loading01 />;
  if (isError || !team) return <div className="p-8 text-center text-red-600">Team not found.</div>;

  const current = team.members.filter((m) => !m.left_on);
  const past = team.members.filter((m) => m.left_on);

  const run = async (action: () => Promise<unknown>, ok: string) => {
    try {
      await action();
      toast.success(ok);
    } catch (e: any) {
      toast.error(e?.data?.message || "Something went wrong.");
    }
  };

  const setRole = (m: TeamMember, role: "leader" | "member") =>
    run(
      () => updateMember({ teamId: team.team_id, memberId: m.team_member_id, role }).unwrap(),
      role === "leader" ? `${memberName(m)} is now the team leader.` : `${memberName(m)} is now a member.`,
    );

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-3">
        <Button variant="outline" size="icon" onClick={() => router.push("/teams")} aria-label="Back to teams">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-primary">{team.name}</h1>
          {team.description && <p className="text-sm text-slate-600">{team.description}</p>}
          <span
            className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${team.is_active ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${team.is_active ? "bg-green-600" : "bg-slate-400"}`} />
            {team.is_active ? "Active" : "Inactive"}
          </span>
        </div>
        {canUpdate && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="gap-2"
              disabled={toggling}
              onClick={() =>
                run(() => updateTeam({ id: team.team_id, data: { is_active: !team.is_active } }).unwrap(), team.is_active ? "Team deactivated." : "Team activated.")
              }
            >
              <Power className="h-4 w-4" /> {team.is_active ? "Deactivate" : "Activate"}
            </Button>
            <Button className="gap-2" onClick={() => setEditing(true)}>
              <Edit className="h-4 w-4" /> Edit
            </Button>
          </div>
        )}
      </div>

      {/* Members */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <h2 className="font-semibold text-slate-900">Members ({current.length})</h2>
          {canManageMembers && (
            <Button size="sm" className="gap-1" onClick={() => setAddingMember(true)}>
              <Plus className="h-4 w-4" /> Add member
            </Button>
          )}
        </div>
        {current.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No members yet.</p>
        ) : (
          <ul className="divide-y">
            {current.map((m) => (
              <li key={m.team_member_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-medium text-slate-900">
                    {m.role === "leader" && <Crown className="h-4 w-4 text-golden-deep" aria-label="Team leader" />}
                    {memberName(m)}
                    {m.role === "leader" && <span className="rounded-full bg-golden-dark/10 px-2 py-0.5 text-[11px] font-semibold text-golden-deep">Leader</span>}
                  </p>
                  <p className="text-xs text-slate-500">
                    {m.user.email}
                    {m.user.phone_number ? ` · ${m.user.phone_number}` : ""}
                    {!m.user.is_active && <span className="ml-1 font-medium text-red-600">(account inactive)</span>}
                  </p>
                  <p className="text-xs text-slate-400">Joined {formatCalendarDate(m.joined_on)}</p>
                </div>
                {canManageMembers && (
                  <div className="flex flex-wrap gap-1">
                    {m.role === "member" ? (
                      <Button variant="ghost" size="sm" className="gap-1" onClick={() => setRole(m, "leader")}>
                        <Crown className="h-3.5 w-3.5" /> Make leader
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => setRole(m, "member")}>
                        Make member
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" className="gap-1 text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setConfirmRemove(m)}>
                      <LogOut className="h-3.5 w-3.5" /> Remove
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {past.length > 0 && (
          <details className="border-t px-4 py-3 text-sm">
            <summary className="cursor-pointer text-slate-600">Past members ({past.length})</summary>
            <ul className="mt-2 space-y-1 text-slate-500">
              {past.map((m) => (
                <li key={m.team_member_id}>
                  {memberName(m)} · {formatCalendarDate(m.joined_on)} – {formatCalendarDate(m.left_on)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* Licenses */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <h2 className="font-semibold text-slate-900">Licenses covered ({team.licenses.length})</h2>
          {canUpdate && (
            <Button size="sm" className="gap-1" onClick={() => setAddingLicenses(true)}>
              <Plus className="h-4 w-4" /> Add licenses
            </Button>
          )}
        </div>
        {team.licenses.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No licenses assigned yet.</p>
        ) : (
          <ul className="divide-y">
            {team.licenses.map((l) => (
              <li key={l.license_id} className="flex items-start gap-3 px-4 py-3">
                <div className="min-w-0 flex-1 text-sm">
                  <button
                    type="button"
                    onClick={() => router.push(`/companies/${l.company?.company_id}`)}
                    className="font-medium text-primary hover:underline"
                  >
                    {l.company?.name}
                  </button>
                  <p className="font-mono text-xs text-slate-500">
                    {l.license_number} · {LICENSE_TYPE_LABEL[l.license_type]}
                    {l.minerals.length ? ` · ${l.minerals.map((m) => m.name).join(", ")}` : ""}
                  </p>
                  {l.areas.length > 0 && (
                    <p className="flex items-center gap-1 text-xs text-slate-500">
                      <MapPin className="h-3 w-3 shrink-0" /> {l.areas.map(areaPath).join("; ")}
                    </p>
                  )}
                </div>
                {canUpdate && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${l.license_number} from the team`}
                    onClick={() => run(() => removeLicense({ teamId: team.team_id, licenseId: l.license_id }).unwrap(), "License removed from the team.")}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <TeamDialog open={editing} team={team} onClose={() => setEditing(false)} />
      <AddMemberDialog
        open={addingMember}
        teamId={team.team_id}
        onClose={() => setAddingMember(false)}
        onCreateNew={
          canCreateUsers
            ? () => {
                setAddingMember(false);
                setCreatingUser(true);
              }
            : undefined
        }
      />
      <CreateUserModal user_type="internal" presetTeamId={team.team_id} isOpen={creatingUser} onClose={() => setCreatingUser(false)} />
      <AddLicensesDialog
        open={addingLicenses}
        teamId={team.team_id}
        existingIds={team.licenses.map((l) => l.license_id)}
        onClose={() => setAddingLicenses(false)}
      />

      <Dialog open={!!confirmRemove} onOpenChange={(o) => !o && setConfirmRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {confirmRemove && memberName(confirmRemove)}?</DialogTitle>
            <DialogDescription>They leave the team today. Their past membership is kept in the team history.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmRemove(null)} disabled={removing}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={removing}
              onClick={async () => {
                if (!confirmRemove) return;
                await run(() => removeMember({ teamId: team.team_id, memberId: confirmRemove.team_member_id }).unwrap(), "Member removed.");
                setConfirmRemove(null);
              }}
            >
              {removing ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
