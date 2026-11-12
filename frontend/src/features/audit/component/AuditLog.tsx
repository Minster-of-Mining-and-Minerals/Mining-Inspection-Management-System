"use client";

/**
 * Audit log (administrators): every change made by every account, and every sign-in, newest first.
 * Read only. A row opens its details: what changed (before → after), where from, the result.
 */
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SectorFilter } from "@/components/common/SectorFilter";
import { AuditChange, AuditEntry, useGetAuditEntryQuery, useGetAuditLogsQuery } from "@/redux/api/auditApi";
import { formatDateTime } from "@/utils/date";

const selectClass = "h-9 min-w-0 rounded-md border border-input bg-white px-2 text-sm";

/** What a person did, in words. Unknown actions are shown from their code. */
const ACTION_LABEL: Record<string, string> = {
  "auth.login": "Signed in",
  "auth.logout": "Signed out",
  "auth.sessions.sign-out-others": "Signed out their other devices",
  "auth.sessions.delete": "Signed out one of their devices",
  "auth.forgot-password.request-otp": "Asked for a password reset code",
  "auth.forgot-password.verify-otp": "Entered a password reset code",
  "auth.forgot-password.reset-password": "Reset their password",
  "change-password.update": "Changed their password",
  "profile.update": "Changed their profile",
  "users.create": "Created a user",
  "users.update": "Changed a user",
  "users.delete": "Deactivated a user",
  "users.toggle-status": "Activated / deactivated a user",
  "users.reset-password": "Reset a user's password",
  "users.sessions.sign-out": "Signed a user out everywhere",
  "user-roles.create": "Gave a role",
  "user-roles.delete": "Removed a role",
  "roles.create": "Created a role",
  "roles.update": "Changed a role",
  "roles.delete": "Deleted a role",
  "roles.copy": "Copied a role",
  "teams.create": "Created a team",
  "teams.update": "Changed a team",
  "teams.delete": "Deleted a team",
  "teams.members": "Added a team member",
  "team-members.update": "Changed a team member",
  "team-members.delete": "Removed a team member",
  "inspection-schedules.create": "Created a schedule",
  "inspection-schedules.update": "Changed a schedule",
  "inspection-schedules.delete": "Deleted a schedule",
  "inspections.submit": "Submitted an inspection",
  "inspections.return": "Returned an inspection for correction",
  "inspections.assignment": "Changed an inspection's team or due date",
  "inspections.files": "Uploaded a file to an inspection",
  "inspections.files.delete": "Removed a file from an inspection",
  "forms.create": "Created a checklist",
  "forms.update": "Changed a checklist",
  "forms.publish": "Published a checklist version",
  "companies.create": "Created a company",
  "companies.update": "Changed a company",
  "companies.delete": "Deleted a company",
  "licenses.create": "Created a license",
  "licenses.update": "Changed a license",
  "licenses.delete": "Deleted a license",
};
const CATEGORIES: [string, string][] = [
  ["", "All activity"],
  ["auth", "Sign-in and sessions"],
  ["users", "Users"],
  ["user-roles", "User roles"],
  ["roles", "Roles"],
  ["teams", "Teams"],
  ["team-members", "Team members"],
  ["inspections", "Inspections"],
  ["inspection-schedules", "Schedules"],
  ["forms", "Checklists"],
  ["companies", "Companies"],
  ["licenses", "Licenses"],
  ["profile", "Profiles"],
  ["change-password", "Password changes"],
  ["sector-nodes", "Sectors"],
];
const actionText = (a: string) => ACTION_LABEL[a] ?? a.replace(/[.-]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const deviceOf = (ua?: string | null) => {
  if (!ua) return "";
  const os = /android/i.test(ua) ? "Android" : /iphone/i.test(ua) ? "iPhone" : /windows/i.test(ua) ? "Windows" : /mac os/i.test(ua) ? "Mac" : /linux/i.test(ua) ? "Linux" : "";
  const br = /edg\//i.test(ua) ? "Edge" : /firefox/i.test(ua) ? "Firefox" : /chrome|crios/i.test(ua) ? "Chrome" : /safari/i.test(ua) ? "Safari" : "";
  return [br, os].filter(Boolean).join(" on ");
};
const show = (v: unknown) => (v == null || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
const MODEL_LABEL: Record<string, string> = { User: "User", Team: "Team", TeamMember: "Team member", Inspection: "Inspection", InspectionSchedule: "Schedule", Form: "Checklist", FormVersion: "Checklist version", Company: "Company", CompanyLicense: "License", Role: "Role", UserRoles: "User role", RolePermission: "Role permission", InspectionFile: "File" };

export default function AuditLog() {
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const [category, setCategory] = useState("");
  const [outcome, setOutcome] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setTerm(search.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isFetching, isError } = useGetAuditLogsQuery({ search: term || undefined, category: category || undefined, outcome: outcome || undefined, from: from || undefined, to: to || undefined, page, limit: 50 });
  const meta = data?.meta;
  const filtersOn = !!(term || category || outcome || from || to);
  const set = (fn: (v: string) => void) => (v: string) => {
    fn(v);
    setPage(1);
  };

  return (
    <div className="w-full space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary">Audit log</h1>
        <p className="text-sm text-slate-500">Every change made by every account, and every sign-in. Entries can&apos;t be changed or deleted; they are kept for 2 years.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input aria-label="Search the audit log" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Person, email, target or message" className="h-9 bg-white pl-9" />
        </div>
        <SectorFilter />
        <select aria-label="Category" className={`${selectClass} ${category ? "border-primary text-primary" : ""}`} value={category} onChange={(e) => set(setCategory)(e.target.value)}>
          {CATEGORIES.map(([k, l]) => (
            <option key={k || "all"} value={k}>
              {l}
            </option>
          ))}
        </select>
        <select aria-label="Result" className={`${selectClass} ${outcome ? "border-primary text-primary" : ""}`} value={outcome} onChange={(e) => set(setOutcome)(e.target.value)}>
          <option value="">Any result</option>
          <option value="success">Succeeded</option>
          <option value="failure">Failed</option>
        </select>
        <input type="date" aria-label="From" className={selectClass} value={from} onChange={(e) => set(setFrom)(e.target.value)} />
        <input type="date" aria-label="To" className={selectClass} value={to} onChange={(e) => set(setTo)(e.target.value)} />
        {filtersOn && (
          <button
            type="button"
            className="flex items-center gap-1 text-sm text-primary hover:underline"
            onClick={() => {
              setSearch("");
              setCategory("");
              setOutcome("");
              setFrom("");
              setTo("");
              setPage(1);
            }}
          >
            <X className="h-4 w-4" /> Clear
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Who</th>
              <th className="px-3 py-2 font-medium">What</th>
              <th className="px-3 py-2 font-medium">Target</th>
              <th className="px-3 py-2 font-medium">Result</th>
              <th className="px-4 py-2 font-medium">From</th>
            </tr>
          </thead>
          <tbody className={`divide-y ${isFetching ? "opacity-60" : ""}`}>
            {(data?.data ?? []).map((e) => (
              <tr key={e.audit_id} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpenId(e.audit_id)}>
                <td className="whitespace-nowrap px-4 py-2 text-xs text-slate-600">{formatDateTime(e.occurred_at)}</td>
                <td className="px-3 py-2">
                  <span className="block font-medium text-slate-900">{e.actor_name ?? "—"}</span>
                  <span className="text-xs text-slate-500">{e.actor_email}</span>
                </td>
                <td className="px-3 py-2">
                  <button type="button" className="text-left font-medium text-primary hover:underline" onClick={(ev) => (ev.stopPropagation(), setOpenId(e.audit_id))}>
                    {actionText(e.action)}
                  </button>
                  {!!e.change_count && <span className="block text-xs text-slate-500">{e.change_count} change{e.change_count === 1 ? "" : "s"}</span>}
                </td>
                <td className="max-w-[16rem] px-3 py-2 text-slate-700">
                  <span className="line-clamp-2">{e.entity_label ?? "—"}</span>
                </td>
                <td className="px-3 py-2">
                  {e.outcome === "success" ? (
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">Succeeded</span>
                  ) : (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700" title={e.message ?? undefined}>
                      Failed
                    </span>
                  )}
                  {e.outcome === "failure" && e.message && <span className="mt-0.5 block max-w-[14rem] truncate text-xs text-red-700">{e.message}</span>}
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">{e.ip ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {isError && <p className="py-8 text-center text-sm text-red-600">Could not load the audit log.</p>}
        {data && !data.data.length && <p className="py-10 text-center text-sm text-slate-500">No entries match.</p>}
      </div>

      {meta && meta.totalItems > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
          <span>
            {(page - 1) * meta.itemsPerPage + 1}–{Math.min(page * meta.itemsPerPage, meta.totalItems)} of {meta.totalItems.toLocaleString()}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft className="h-4 w-4" /> Previous
            </Button>
            <Button variant="outline" size="sm" disabled={page >= meta.totalPages} onClick={() => setPage(page + 1)}>
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">{openId && <EntryDetails id={openId} />}</DialogContent>
      </Dialog>
    </div>
  );
}

function EntryDetails({ id }: { id: string }) {
  const { data: e, isLoading, isError } = useGetAuditEntryQuery(id);
  if (isLoading) return <p className="text-sm text-slate-500">Loading…</p>;
  if (isError || !e) return <p className="text-sm text-red-600">Could not load this entry.</p>;
  return (
    <>
      <DialogHeader>
        <DialogTitle>{actionText(e.action)}</DialogTitle>
        <DialogDescription>
          {formatDateTime(e.occurred_at)} · {e.actor_name ?? e.actor_email ?? "Unknown person"}
        </DialogDescription>
      </DialogHeader>
      <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1.5 text-sm">
        <Row label="Person">{[e.actor_name, e.actor_email].filter(Boolean).join(" · ") || "—"}</Row>
        <Row label="Target">{e.entity_label ?? "—"}</Row>
        <Row label="Result">
          {e.outcome === "success" ? "Succeeded" : "Failed"}
          {e.message ? ` — ${e.message}` : ""}
        </Row>
        <Row label="From">{[e.ip, deviceOf(e.user_agent)].filter(Boolean).join(" · ") || "—"}</Row>
        <Row label="Request">
          <code className="text-xs">
            {e.method} {e.path}
          </code>
        </Row>
      </dl>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-slate-900">What changed</h3>
        {e.changes?.length ? (
          e.changes.map((c, i) => <ChangeBlock key={i} c={c} />)
        ) : (
          <p className="text-sm text-slate-500">{e.outcome === "success" ? "No stored records changed." : "Nothing changed: the action failed."}</p>
        )}
      </div>
    </>
  );
}

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <>
    <dt className="text-slate-500">{label}</dt>
    <dd className="min-w-0 break-words text-slate-900">{children}</dd>
  </>
);

function ChangeBlock({ c }: { c: AuditChange }) {
  if (c.more) return <p className="text-xs text-slate-500">… and {c.more} more change(s).</p>;
  const title = `${{ create: "Created", update: "Changed", delete: "Deleted" }[c.op ?? "update"]} ${(MODEL_LABEL[c.model ?? ""] ?? c.model ?? "record").toLowerCase()}${c.label ? `: ${c.label}` : ""}${c.count ? ` (${c.count})` : ""}`;
  const keys = [...new Set([...Object.keys(c.before ?? {}), ...Object.keys(c.after ?? {})])];
  return (
    <div className="rounded-lg border border-slate-200">
      <p className="border-b bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700">{title}</p>
      {keys.length > 0 ? (
        <table className="w-full text-xs">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="px-3 py-1 font-medium">Field</th>
              {c.op === "update" && <th className="px-3 py-1 font-medium">Before</th>}
              <th className="px-3 py-1 font-medium">{c.op === "update" ? "After" : "Value"}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {keys.map((k) => (
              <tr key={k}>
                <td className="px-3 py-1 font-mono text-slate-600">{k}</td>
                {c.op === "update" && <td className="break-all px-3 py-1 text-red-700">{show(c.before?.[k])}</td>}
                <td className="break-all px-3 py-1 text-green-800">{show(c.after?.[k])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="px-3 py-1.5 text-xs text-slate-500">{c.where ? `Records matching ${show(c.where)}` : "—"}</p>
      )}
    </div>
  );
}

export type { AuditEntry };
