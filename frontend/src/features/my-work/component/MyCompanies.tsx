"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown, ChevronRight, ClipboardList, List, Mail, Map as MapIcon, MapPin, Phone, Search, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import Loading01 from "@/features/template/component/Loading/Loading01";
import { useGetMyLicensesQuery } from "@/redux/api/myWorkApi";
import { useGetLicenseHistoryQuery } from "@/redux/api/inspectionApi";
import type { MyLicense } from "@/redux/types/myWork";
import { FREQUENCY_LABEL } from "@/redux/types/inspection";
import { formatCalendarDate, formatDateTime } from "@/utils/date";
import { describeDue } from "@/features/inspections/component/taskUi";
import { TaskStatusBadge, dueText } from "@/features/inspections/component/taskUi";
import { MyCompaniesMap } from "./MyCompaniesMap";

/** The companies and licenses assigned to the user's team, and the team's own results there. */
export default function MyCompanies() {
  const { data = [], isLoading, isError } = useGetMyLicensesQuery(undefined, { refetchOnMountOrArgChange: true });
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("");
  // The map first (as on a navigation app); the list one tap away
  const [view, setView] = useState<"map" | "list">("map");

  const regions = useMemo(() => [...new Set(data.map((l) => l.region).filter(Boolean) as string[])].sort(), [data]);
  const companies = useMemo(() => {
    const q = search.trim().toLowerCase();
    const shown = data.filter(
      (l) =>
        (!region || l.region === region) &&
        (!q || [l.company_name, l.license_number, l.site_name, l.minerals, l.mineral_text, l.region, l.zone, l.woreda].some((x) => x?.toLowerCase().includes(q))),
    );
    const map = new Map<string, MyLicense[]>();
    for (const l of shown) map.set(l.company_id, [...(map.get(l.company_id) || []), l]);
    return [...map.values()];
  }, [data, search, region]);

  if (isLoading) return <Loading01 />;
  if (isError) return <p className="py-10 text-center text-red-600">Could not load your companies.</p>;

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">My companies</h1>
          <p className="text-sm text-slate-500">
            Companies and licenses assigned to your team: {new Set(data.map((l) => l.company_id)).size} companies, {data.length} licenses. Results shown are your team’s inspections.
          </p>
        </div>
        {data.length > 0 && (
          <div role="group" aria-label="View" className="flex rounded-lg border border-slate-300 bg-white p-1">
            {(
              [
                ["map", "Map", MapIcon],
                ["list", "List", List],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                aria-pressed={view === key}
                onClick={() => setView(key)}
                className={`flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-semibold ${view === key ? "bg-primary text-white" : "text-primary hover:bg-slate-100"}`}
              >
                <Icon className="h-4 w-4" /> {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {view === "map" && data.length > 0 ? (
        <MyCompaniesMap licenses={data} />
      ) : (
      <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input aria-label="Search companies" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Company, license, mineral, area" className="pl-9" />
        </div>
        {regions.length > 0 && (
          <select aria-label="Region" className={`h-9 rounded-md border px-2 text-sm ${region ? "border-primary text-primary" : ""}`} value={region} onChange={(e) => setRegion(e.target.value)}>
            <option value="">All regions</option>
            {regions.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        )}
      </div>

      {data.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">
          <Building2 className="mx-auto mb-2 h-8 w-8 text-slate-300" />
          No companies are assigned to your team yet.
        </div>
      ) : companies.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">No companies match.</p>
      ) : (
        companies.map((licenses) => <CompanyCard key={licenses[0].company_id} licenses={licenses} />)
      )}
      </>
      )}
    </div>
  );
}

function CompanyCard({ licenses }: { licenses: MyLicense[] }) {
  const c = licenses[0];
  const contactPhone = c.contact_phone || c.phone;
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <header className="flex flex-wrap items-start gap-3 border-b bg-slate-50 px-4 py-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Building2 className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold text-primary">{c.company_name}</h2>
          {c.company_name_am && (
            <p lang="am" className="text-xs text-slate-500">
              {c.company_name_am}
            </p>
          )}
          {c.address && <p className="text-xs text-slate-500">{c.address}</p>}
        </div>
        <div className="space-y-0.5 text-xs text-slate-600">
          {c.contact_person && (
            <p className="flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-slate-400" /> {c.contact_person}
            </p>
          )}
          {contactPhone && (
            <a href={`tel:${contactPhone}`} className="flex items-center gap-1.5 hover:text-primary">
              <Phone className="h-3.5 w-3.5 text-slate-400" /> {contactPhone}
            </a>
          )}
          {c.email && (
            <a href={`mailto:${c.email}`} className="flex items-center gap-1.5 hover:text-primary">
              <Mail className="h-3.5 w-3.5 text-slate-400" /> {c.email}
            </a>
          )}
        </div>
      </header>
      <ul className="divide-y">
        {licenses.map((l) => (
          <LicenseRow key={l.license_id} license={l} />
        ))}
      </ul>
    </section>
  );
}

function LicenseRow({ license: l }: { license: MyLicense }) {
  const router = useRouter();
  const [showHistory, setShowHistory] = useState(false);
  const area = [l.region, l.zone, l.woreda].filter(Boolean).join(" · ");
  const minerals = l.minerals || l.mineral_text;
  return (
    <li className="space-y-3 px-4 py-3">
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-1 basis-64 space-y-1">
          <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
            {l.license_number}
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-normal capitalize text-slate-600">{l.license_type}</span>
            {l.status !== "active" && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs capitalize text-slate-500">{l.status}</span>}
            {l.expired && <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">Expired {formatCalendarDate(l.expires_on)}</span>}
          </p>
          {l.site_name && <p className="text-sm text-slate-600">{l.site_name}</p>}
          {minerals && <p className="text-xs text-slate-500">{minerals}</p>}
          <p className="flex items-center gap-1 text-xs text-slate-500">
            <MapPin className="h-3 w-3" /> {area || "Location not recorded"}
          </p>
          {l.forms.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5 pt-1">
              {l.forms.map((f) => (
                <li key={f.schedule_id} className="flex items-center gap-1 rounded bg-sky-50 px-2 py-0.5 text-xs text-sky-800" title={f.schedule_name}>
                  <ClipboardList className="h-3 w-3" /> {f.form_name} · {FREQUENCY_LABEL[f.frequency]} · {describeDue(f.due_days)}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-slate-400">No checklist is scheduled for this license.</p>
          )}
        </div>

        <div className="w-48 space-y-1 text-sm">
          <p className="text-xs text-slate-500">Last inspected</p>
          {l.last_inspection ? (
            <p className="font-semibold text-slate-900">
              {formatCalendarDate(l.last_inspection.submitted_at.slice(0, 10))}
              {l.last_inspection.is_late && <span className="font-normal text-amber-700"> · late</span>}
            </p>
          ) : (
            <p className="text-xs text-slate-400">Not inspected by your team yet</p>
          )}
        </div>

        <div className="w-56 space-y-1">
          <p className="text-xs text-slate-500">Open tasks</p>
          {l.open_tasks.length ? (
            l.open_tasks.slice(0, 3).map((t) => (
              <button
                key={t.inspection_id}
                type="button"
                onClick={() => router.push(`/inspections/${t.inspection_id}`)}
                className="flex w-full items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 text-left text-xs hover:border-primary"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-slate-800">{t.form_name}</span>
                  <span className={t.is_overdue ? "text-red-700" : "text-slate-500"}>due {dueText(t.due_at)}</span>
                </span>
                <TaskStatusBadge task={{ status: t.status as any, is_overdue: t.is_overdue, is_late: false, return_count: t.return_count }} />
              </button>
            ))
          ) : (
            <p className="text-xs text-slate-400">None</p>
          )}
        </div>
      </div>

      {l.inspection_count > 0 && (
        <div>
          <button type="button" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
            {showHistory ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
            {l.inspection_count} past inspection{l.inspection_count === 1 ? "" : "s"} by your team
          </button>
          {showHistory && <History licenseId={l.license_id} />}
        </div>
      )}
    </li>
  );
}

/** Submitted inspections of the license — only the user's own team's (enforced by the server). */
function History({ licenseId }: { licenseId: string }) {
  const router = useRouter();
  const { data = [], isFetching } = useGetLicenseHistoryQuery(licenseId);
  if (isFetching && !data.length) return <p className="mt-2 text-xs text-slate-500">Loading…</p>;
  return (
    <ul className="mt-2 divide-y rounded-lg border border-slate-200 text-sm">
      {data.map((t) => (
        <li key={t.inspection_id}>
          <button type="button" onClick={() => router.push(`/inspections/${t.inspection_id}`)} className="flex w-full flex-wrap items-center gap-3 px-3 py-2 text-left hover:bg-slate-50">
            <span className="w-32 text-xs text-slate-600">{formatDateTime(t.submitted_at)}</span>
            <span className="min-w-0 flex-1 text-xs text-slate-700">
              {t.form?.name}
              {t.submitter && <span className="text-slate-500"> · {t.submitter.full_name}</span>}
              {t.is_late && <span className="text-amber-700"> · late</span>}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}
