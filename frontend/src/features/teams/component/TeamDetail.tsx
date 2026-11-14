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
import { TeamDetail as TeamDetailData, TeamLicenseInspection, TeamMember, memberName } from "@/redux/types/team";
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
  const [licenseFilter, setLicenseFilter] = useState<LicenseFilter>("all");
  const [removingLicense, setRemovingLicense] = useState<TeamDetailData["licenses"][number] | null>(null);
  const [removeLicenseBusy, setRemoveLicenseBusy] = useState(false);

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
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="min-w-0 break-words text-xl font-bold text-primary sm:text-2xl">{team.name}</h1>
            <span
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${team.is_active ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${team.is_active ? "bg-green-600" : "bg-slate-400"}`} />
              {team.is_active ? "Active" : "Inactive"}
            </span>
          </div>
          {team.description && <p className="mt-0.5 break-words text-sm text-slate-600">{team.description}</p>}
        </div>
        {canUpdate && (
          // Phone: a row of two equal buttons under the name; computer: on the right
          <div className="flex w-full gap-2 sm:w-auto">
            <Button
              variant="outline"
              className="flex-1 gap-2 sm:flex-none"
              disabled={toggling}
              onClick={() =>
                run(() => updateTeam({ id: team.team_id, data: { is_active: !team.is_active } }).unwrap(), team.is_active ? "Team deactivated." : "Team activated.")
              }
            >
              <Power className="h-4 w-4" /> {team.is_active ? "Deactivate" : "Activate"}
            </Button>
            <Button className="flex-1 gap-2 sm:flex-none" onClick={() => setEditing(true)}>
              <Edit className="h-4 w-4" /> Edit
            </Button>
          </div>
        )}
      </div>

      {/* Members */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
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
              <li key={m.team_member_id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium text-slate-900">
                    {m.role === "leader" && <Crown className="h-4 w-4 shrink-0 text-golden-deep" aria-label="Team leader" />}
                    <span className="min-w-0 break-words">{memberName(m)}</span>
                    {m.role === "leader" && <span className="rounded-full bg-golden-dark/10 px-2 py-0.5 text-[11px] font-semibold text-golden-deep">Leader</span>}
                  </p>
                  <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-slate-500">
                    <span className="min-w-0 break-all">{m.user.email}</span>
                    {m.user.phone_number && <span className="whitespace-nowrap">· {m.user.phone_number}</span>}
                    {!m.user.is_active && <span className="font-medium text-red-600">(account inactive)</span>}
                  </p>
                  <p className="text-xs text-slate-400">Joined {formatCalendarDate(m.joined_on)}</p>
                </div>
                {canManageMembers && (
                  <div className="-ml-3 flex flex-wrap gap-1 sm:ml-0 sm:shrink-0">
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
                <li key={m.team_member_id} className="break-words">
                  {memberName(m)} · {formatCalendarDate(m.joined_on)} – {formatCalendarDate(m.left_on)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      {/* Licenses */}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <h2 className="font-semibold text-slate-900">Licenses covered ({team.licenses.length})</h2>
          {canUpdate && (
            <Button size="sm" className="gap-1" onClick={() => setAddingLicenses(true)}>
              <Plus className="h-4 w-4" /> Add licenses
            </Button>
          )}
        </div>
        {team.licenses.length > 0 && (
          <nav aria-label="Inspection status" className="flex gap-1 overflow-x-auto border-b px-2">
            {LICENSE_FILTERS.map(([k, label]) => {
              const n = team.licenses.filter((l) => matchesFilter(l.latest_inspection, k)).length;
              const on = licenseFilter === k;
              return (
                <button
                  key={k}
                  type="button"
                  aria-current={on ? "page" : undefined}
                  onClick={() => setLicenseFilter(k)}
                  className={`shrink-0 whitespace-nowrap border-b-[3px] px-3 py-2.5 text-sm font-semibold transition-colors ${on ? "border-golden-bright text-primary" : "border-transparent text-slate-600 hover:text-primary"}`}
                >
                  {label} <span className="font-normal text-slate-500">({n})</span>
                </button>
              );
            })}
          </nav>
        )}
        {team.licenses.length === 0 ? (
          <p className="p-6 text-center text-sm text-slate-500">No licenses assigned yet.</p>
        ) : !team.licenses.some((l) => matchesFilter(l.latest_inspection, licenseFilter)) ? (
          <p className="p-6 text-center text-sm text-slate-500">No licenses here.</p>
        ) : (
          <ul className="divide-y">
            {team.licenses.filter((l) => matchesFilter(l.latest_inspection, licenseFilter)).map((l) => (
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
                  <InspectionBadge task={l.latest_inspection} onOpen={(id) => router.push(`/inspections/${id}`)} />
                </div>
                {canUpdate && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove ${l.license_number} from the team`}
                    onClick={() => setRemovingLicense(l)}
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

      <Dialog open={!!removingLicense} onOpenChange={(o) => !o && !removeLicenseBusy && setRemovingLicense(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removingLicense?.license_number} from {team.name}?</DialogTitle>
            <DialogDescription>
              {removingLicense?.company?.name ? `${removingLicense.company.name}'s license` : "The license"} will no longer be covered by this team, and new rounds won&apos;t be given to it.
            </DialogDescription>
          </DialogHeader>
          {removingLicense?.latest_inspection && removingLicense.latest_inspection.status !== "submitted" && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Its current inspection ({STATUS_TEXT[removingLicense.latest_inspection.status]}, due {formatCalendarDate(lastDay(removingLicense.latest_inspection.due_at))}) is not submitted. It stays with this team until you give it to another team on the Inspections page.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemovingLicense(null)} disabled={removeLicenseBusy}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={removeLicenseBusy}
              onClick={async () => {
                if (!removingLicense) return;
                setRemoveLicenseBusy(true);
                await run(() => removeLicense({ teamId: team.team_id, licenseId: removingLicense.license_id }).unwrap(), "License removed from the team.");
                setRemoveLicenseBusy(false);
                setRemovingLicense(null);
              }}
            >
              {removeLicenseBusy ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

type LicenseFilter = "all" | "submitted" | "in_progress" | "not_submitted";
const LICENSE_FILTERS: [LicenseFilter, string][] = [
  ["all", "All"],
  ["submitted", "Submitted"],
  ["in_progress", "In progress"],
  ["not_submitted", "Not submitted"],
];
const STATUS_TEXT: Record<TeamLicenseInspection["status"], string> = { todo: "not started", in_progress: "in progress", submitted: "submitted" };
/** The last day to submit (due_at is midnight after it) */
/** Ethiopia date of a moment, as YYYY-MM-DD… */
const localDay = (iso: string) => new Date(new Date(iso).getTime() + 3 * 3600e3).toISOString();
const lastDay = (due: string) => localDay(new Date(new Date(due).getTime() - 1).toISOString());
const isOverdue = (t: TeamLicenseInspection) => t.status !== "submitted" && new Date(t.due_at) < new Date();

/** Filter on the team's current inspection of a license. "Not submitted" = not started or overdue. */
function matchesFilter(t: TeamLicenseInspection | null | undefined, f: LicenseFilter) {
  if (f === "all") return true;
  if (!t) return false;
  if (f === "submitted") return t.status === "submitted";
  if (f === "in_progress") return t.status === "in_progress" && !isOverdue(t);
  return t.status === "todo" || isOverdue(t);
}

/** The team's current inspection of a license: its status, opens the inspection. */
function InspectionBadge({ task, onOpen }: { task?: TeamLicenseInspection | null; onOpen: (id: string) => void }) {
  if (!task) return <p className="mt-1 text-xs text-slate-500">No inspection given to the team yet</p>;
  const overdue = isOverdue(task);
  const [label, cls] =
    task.status === "submitted"
      ? [task.is_late ? "Submitted late" : "Submitted", task.is_late ? "bg-amber-100 text-amber-900" : "bg-green-100 text-green-800"]
      : overdue
        ? ["Overdue", "bg-red-100 text-red-800"]
        : task.status === "in_progress"
          ? ["In progress", "bg-sky-100 text-sky-800"]
          : ["Not started", "bg-slate-100 text-slate-700"];
  const when = task.status === "submitted" && task.submitted_at ? `on ${formatCalendarDate(localDay(task.submitted_at))}` : `due ${formatCalendarDate(lastDay(task.due_at))}`;
  return (
    <a
      href={`/inspections/${task.inspection_id}`}
      onClick={(e) => {
        e.preventDefault();
        onOpen(task.inspection_id);
      }}
      className="mt-1.5 inline-flex items-center gap-2 text-xs hover:underline"
      title="Open the inspection"
    >
      <span className={`rounded-full px-2 py-0.5 font-semibold ${cls}`}>{label}</span>
      <span className="text-slate-500">
        Round of {formatCalendarDate(task.occurrence_date)} · {when}
      </span>
    </a>
  );
}
