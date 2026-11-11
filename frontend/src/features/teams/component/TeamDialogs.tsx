"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, UserPlus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TextArea } from "@/components/ui/textarea";
import { SearchableSelect, SelectOption } from "@/components/ui/searchable-select";
import {
  useAddTeamLicensesMutation,
  useAddTeamMemberMutation,
  useCreateTeamMutation,
  useGetAssignableUsersQuery,
  useUpdateTeamMutation,
} from "@/redux/api/teamApi";
import { useGetLicensesQuery } from "@/redux/api/companyApi";
import { LICENSE_TYPE_LABEL, areaPath } from "@/redux/types/company";
import { Team, TeamRole } from "@/redux/types/team";

/* =================== Create / edit team =================== */
export function TeamDialog({ open, team, onClose }: { open: boolean; team: Team | null; onClose: () => void }) {
  const router = useRouter();
  const [createTeam, { isLoading: creating }] = useCreateTeamMutation();
  const [updateTeam, { isLoading: updating }] = useUpdateTeamMutation();
  const saving = creating || updating;
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(team?.name ?? "");
    setCode(team?.code ?? "");
    setDescription(team?.description ?? "");
  }, [open, team]);

  const save = async () => {
    if (name.trim().length < 2) {
      toast.error("Team name is required.");
      return;
    }
    const data = { name: name.trim(), code: code.trim() || null, description: description.trim() || null };
    try {
      if (team) {
        await updateTeam({ id: team.team_id, data }).unwrap();
        toast.success("Team updated.");
        onClose();
      } else {
        const created = await createTeam(data).unwrap();
        toast.success("Team created. Now add its members.");
        onClose();
        router.push(`/teams/${created.team_id}`);
      }
    } catch (e: any) {
      toast.error(e?.data?.message || "Could not save the team.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{team ? "Edit team" : "New team"}</DialogTitle>
          <DialogDescription>The code is a short reference, e.g. the team number used in the license list.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="team-name">Name *</Label>
            <Input id="team-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Team 13" disabled={saving} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="team-code">Code</Label>
            <Input id="team-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="13" disabled={saving} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="team-desc">Description</Label>
            <TextArea id="team-desc" value={description} onChange={setDescription} rows={3} disabled={saving} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : team ? "Save" : "Create team"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* =================== Add member: an existing user, or create a new one =================== */
export function AddMemberDialog({
  open,
  teamId,
  onClose,
  onCreateNew,
}: {
  open: boolean;
  teamId: string;
  onClose: () => void;
  /** Open the Create User form with this team filled in */
  onCreateNew?: () => void;
}) {
  const [user, setUser] = useState<SelectOption | null>(null);
  const [role, setRole] = useState<TeamRole>("leader");
  const { data: users = [], isLoading: usersLoading } = useGetAssignableUsersQuery(undefined, { skip: !open });
  const [addMember, { isLoading }] = useAddTeamMemberMutation();

  useEffect(() => {
    if (!open) return;
    setUser(null);
    setRole("leader");
  }, [open]);

  // A person can be in one team only: those already in a team are listed separately
  const free = useMemo(() => users.filter((u) => !u.current_team), [users]);
  const taken = useMemo(() => users.filter((u) => u.current_team && u.current_team.team_id !== teamId), [users, teamId]);
  const options = useMemo<SelectOption[]>(
    () => free.map((u) => ({ value: u.user_id, label: u.full_name, data: { description: u.email } })),
    [free],
  );

  const save = async () => {
    if (!user) return toast.error("Choose a person.");
    try {
      await addMember({ teamId, data: { user_id: user.value, role } }).unwrap();
      toast.success("Member added.");
      onClose();
    } catch (e: any) {
      toast.error(e?.data?.message || "Could not add the member.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add member</DialogTitle>
          <DialogDescription>Choose a user who is not in a team yet. A person can be in only one team.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Person</Label>
            <SearchableSelect
              options={options}
              value={user}
              onChange={(o) => setUser(o as SelectOption | null)}
              placeholder={usersLoading ? "Loading…" : "Search by name or email"}
            />
            <p className="text-xs text-slate-500">Lists active staff with an inspector, team leader or supervisor role.</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={role === "leader"} onChange={(e) => setRole(e.target.checked ? "leader" : "member")} className="h-4 w-4 accent-primary" />
            Team leader
          </label>
          {taken.length > 0 && (
            <details className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
              <summary className="cursor-pointer">{taken.length} people are already in another team</summary>
              <ul className="mt-2 space-y-0.5">
                {taken.map((u) => (
                  <li key={u.user_id}>
                    {u.full_name} — {u.current_team?.name}
                  </li>
                ))}
              </ul>
              <p className="mt-2">To move someone, remove them from their team first.</p>
            </details>
          )}
          {onCreateNew && (
            <div className="flex items-center justify-between gap-3 border-t pt-3 text-sm">
              <span className="text-slate-600">Not in the list?</span>
              <Button type="button" variant="outline" size="sm" className="gap-1" onClick={onCreateNew}>
                <UserPlus className="h-4 w-4" /> Create new user
              </Button>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={save} disabled={isLoading || !user}>
            {isLoading ? "Adding…" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* =================== Add licenses the team covers =================== */
export function AddLicensesDialog({
  open,
  teamId,
  existingIds,
  onClose,
}: {
  open: boolean;
  teamId: string;
  existingIds: string[];
  onClose: () => void;
}) {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [addLicenses, { isLoading }] = useAddTeamLicensesMutation();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    if (open) {
      setSearch("");
      setSelected(new Set());
    }
  }, [open]);

  const { data, isFetching } = useGetLicensesQuery({ search: debounced || undefined, limit: 50 }, { skip: !open });
  const rows = (data?.data ?? []).filter((l) => !existingIds.includes(l.license_id));

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = async () => {
    if (!selected.size) return toast.error("Choose at least one license.");
    try {
      await addLicenses({ teamId, license_ids: [...selected] }).unwrap();
      toast.success(`${selected.size} license${selected.size === 1 ? "" : "s"} added.`);
      onClose();
    } catch (e: any) {
      toast.error(e?.data?.message || "Could not add the licenses.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add licenses</DialogTitle>
          <DialogDescription>Search by company name or license number. Licenses already in this team are not listed.</DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search licenses…" className="pl-9" />
        </div>
        <div className={`max-h-[50vh] divide-y overflow-y-auto rounded-lg border ${isFetching ? "opacity-60" : ""}`}>
          {rows.length === 0 ? (
            <p className="p-6 text-center text-sm text-slate-500">No licenses found.</p>
          ) : (
            rows.map((l) => (
              <label key={l.license_id} className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-slate-50">
                <input type="checkbox" checked={selected.has(l.license_id)} onChange={() => toggle(l.license_id)} className="mt-1 h-4 w-4 accent-primary" />
                <span className="min-w-0 flex-1 text-sm">
                  <span className="font-medium text-slate-900">{l.company?.name}</span>
                  <span className="block font-mono text-xs text-slate-500">
                    {l.license_number} · {LICENSE_TYPE_LABEL[l.license_type]}
                  </span>
                  {l.areas.length > 0 && <span className="block text-xs text-slate-500">{l.areas.map(areaPath).join("; ")}</span>}
                  {!!l.teams?.length && <span className="block text-xs text-amber-700">Already with {l.teams.map((t) => t.name).join(", ")}</span>}
                </span>
              </label>
            ))
          )}
        </div>
        <DialogFooter>
          <span className="mr-auto self-center text-sm text-slate-500">{selected.size} selected</span>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={save} disabled={isLoading || !selected.size}>
            {isLoading ? "Adding…" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
