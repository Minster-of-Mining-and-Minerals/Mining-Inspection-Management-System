"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { SearchableSelect, SelectOption } from "@/components/ui/searchable-select";
import { useAddFormAssignmentMutation, useGetFormAssignmentsQuery, useRemoveFormAssignmentMutation } from "@/redux/api/formApi";
import { useGetCompaniesQuery, useGetLicensesQuery } from "@/redux/api/companyApi";
import type { AssignmentTarget, LicenseTypeKey } from "@/redux/types/form";

const TARGETS: { value: AssignmentTarget; label: string }[] = [
  { value: "all", label: "All licenses" },
  { value: "license_type", label: "A license type" },
  { value: "company", label: "One company (all its licenses)" },
  { value: "license", label: "One license" },
];

/** Who a form is for: all licenses, a license type, a company or one license. */
export function AssignmentsPanel({ formId, canAssign, hasPublished }: { formId: string; canAssign: boolean; hasPublished: boolean }) {
  const { data, isLoading } = useGetFormAssignmentsQuery(formId);
  const [add, { isLoading: adding }] = useAddFormAssignmentMutation();
  const [remove] = useRemoveFormAssignmentMutation();

  const [target, setTarget] = useState<AssignmentTarget>("license_type");
  const [licenseType, setLicenseType] = useState<LicenseTypeKey>("exploration");
  const [company, setCompany] = useState<SelectOption | null>(null);
  const [license, setLicense] = useState<SelectOption | null>(null);
  const { data: companies } = useGetCompaniesQuery({ limit: 200 }, { skip: target !== "company" });
  const { data: licenses } = useGetLicensesQuery({ limit: 200 }, { skip: target !== "license" });

  const submit = async () => {
    const body =
      target === "license_type"
        ? { target_type: target, license_type: licenseType }
        : target === "company"
          ? { target_type: target, company_id: company?.value }
          : target === "license"
            ? { target_type: target, license_id: license?.value }
            : { target_type: target };
    if (target === "company" && !company) return toast.error("Choose the company.");
    if (target === "license" && !license) return toast.error("Choose the license.");
    try {
      await add({ formId, ...(body as any) }).unwrap();
      toast.success("Added.");
      setCompany(null);
      setLicense(null);
    } catch (e: any) {
      toast.error(e?.data?.message || "Could not add.");
    }
  };

  return (
    <div className="space-y-4">
      {!hasPublished && (
        <p className="rounded-lg bg-amber-50 px-4 py-2 text-sm text-amber-800">
          This form has no published version yet, so it can’t be scheduled until it is published.
        </p>
      )}
      <section className="rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <div>
            <h3 className="font-semibold text-slate-900">Applies to</h3>
            <p className="text-xs text-slate-500">Which licenses this form is meant for. Teams get tasks only when a schedule uses the form (Schedules).</p>
          </div>
          <span className="text-sm text-slate-500">{isLoading ? "…" : `${data?.license_count ?? 0} licenses in total`}</span>
        </div>
        {!data?.data.length ? (
          <p className="p-6 text-center text-sm text-slate-500">Doesn’t apply to any license yet.</p>
        ) : (
          <ul className="divide-y">
            {data.data.map((a) => (
              <li key={a.assignment_id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <span className="flex-1">{a.description}</span>
                {canAssign && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove"
                    onClick={async () => {
                      try {
                        await remove({ formId, assignmentId: a.assignment_id }).unwrap();
                        toast.success("Removed.");
                      } catch (e: any) {
                        toast.error(e?.data?.message || "Could not remove.");
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {canAssign && (
        <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="font-semibold text-slate-900">Add licenses</h3>
          <div className="flex flex-wrap gap-2">
            {TARGETS.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTarget(t.value)}
                className={`rounded-full border px-3 py-1.5 text-sm ${target === t.value ? "border-primary bg-primary text-white" : "border-slate-300 text-slate-700"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          {target === "license_type" && (
            <div className="flex gap-4 text-sm">
              {(["exploration", "mining"] as LicenseTypeKey[]).map((t) => (
                <label key={t} className="flex items-center gap-2 capitalize">
                  <input type="radio" name="lt" className="accent-primary" checked={licenseType === t} onChange={() => setLicenseType(t)} />
                  {t} licenses
                </label>
              ))}
            </div>
          )}
          {target === "company" && (
            <div className="space-y-1">
              <Label>Company</Label>
              <SearchableSelect
                options={(companies?.data ?? []).map((c) => ({ value: c.company_id, label: c.name }))}
                value={company}
                onChange={(o) => setCompany(o as SelectOption | null)}
                placeholder="Search companies"
              />
            </div>
          )}
          {target === "license" && (
            <div className="space-y-1">
              <Label>License</Label>
              <SearchableSelect
                options={(licenses?.data ?? []).map((l) => ({ value: l.license_id, label: `${l.license_number} — ${l.company?.name ?? ""}` }))}
                value={license}
                onChange={(o) => setLicense(o as SelectOption | null)}
                placeholder="Search by license number or company"
              />
            </div>
          )}
          <Button onClick={submit} disabled={adding} className="gap-1">
            <Plus className="h-4 w-4" /> Add
          </Button>
        </section>
      )}
    </div>
  );
}
