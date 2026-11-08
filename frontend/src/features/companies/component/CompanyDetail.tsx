"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Edit, MapPin, Plus, Power, Trash2 } from "lucide-react";
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
import { useDeleteLicenseMutation, useGetCompanyByIdQuery, useUpdateCompanyMutation } from "@/redux/api/companyApi";
import { CompanyLicense, LICENSE_STATUS_LABEL, LICENSE_TYPE_LABEL, LicenseStatus, areaPath } from "@/redux/types/company";
import { formatCalendarDate } from "@/utils/date";
import { CompanyDialog } from "./CompanyDialog";
import { LicenseDialog } from "./LicenseDialog";

const STATUS_STYLE: Record<LicenseStatus, string> = {
  active: "bg-green-100 text-green-800",
  suspended: "bg-amber-100 text-amber-800",
  expired: "bg-slate-100 text-slate-600",
  revoked: "bg-red-100 text-red-700",
};

export default function CompanyDetail() {
  const { companyId } = useParams<{ companyId: string }>();
  const router = useRouter();
  const { check } = usePermissions();
  const canUpdate = check({ allPermissions: ["COMPANIES:UPDATE"] });
  const canDelete = check({ allPermissions: ["COMPANIES:DELETE"] });

  const { data: company, isLoading, isError } = useGetCompanyByIdQuery(companyId, { skip: !companyId });
  const [updateCompany, { isLoading: toggling }] = useUpdateCompanyMutation();
  const [deleteLicense, { isLoading: deleting }] = useDeleteLicenseMutation();

  const [editingCompany, setEditingCompany] = useState(false);
  const [licenseDialog, setLicenseDialog] = useState<{ open: boolean; license: CompanyLicense | null }>({ open: false, license: null });
  const [confirmDelete, setConfirmDelete] = useState<CompanyLicense | null>(null);

  if (isLoading) return <Loading01 />;
  if (isError || !company) return <div className="p-8 text-center text-red-600">Company not found.</div>;

  const toggleActive = async () => {
    try {
      await updateCompany({ id: company.company_id, data: { is_active: !company.is_active } }).unwrap();
      toast.success(company.is_active ? "Company deactivated." : "Company activated.");
    } catch (e: any) {
      toast.error(e?.data?.message || "Could not change the status.");
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteLicense({ licenseId: confirmDelete.license_id, companyId: company.company_id }).unwrap();
      toast.success("License deleted.");
      setConfirmDelete(null);
    } catch (e: any) {
      toast.error(e?.data?.message || "Could not delete the license.");
    }
  };

  const details: [string, string | null][] = [
    ["TIN", company.tin],
    ["Phone", company.phone],
    ["Email", company.email],
    ["Focal person", company.contact_person],
    ["Focal person phone", company.contact_phone],
    ["Address", company.address],
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start gap-3">
        <Button variant="outline" size="icon" onClick={() => router.push("/companies")} aria-label="Back to companies">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-primary">{company.name}</h1>
          {company.name_am && (
            <p lang="am" className="text-slate-600">
              {company.name_am}
            </p>
          )}
          <span
            className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${company.is_active ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${company.is_active ? "bg-green-600" : "bg-slate-400"}`} />
            {company.is_active ? "Active" : "Inactive"}
          </span>
        </div>
        {canUpdate && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={toggleActive} disabled={toggling} className="gap-2">
              <Power className="h-4 w-4" />
              {company.is_active ? "Deactivate" : "Activate"}
            </Button>
            <Button onClick={() => setEditingCompany(true)} className="gap-2">
              <Edit className="h-4 w-4" /> Edit
            </Button>
          </div>
        )}
      </div>

      {/* Details */}
      <section className="rounded-xl border border-slate-200 bg-white p-5">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {details.map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-medium text-slate-500">{label}</dt>
              <dd className="mt-0.5 text-sm text-slate-900">{value || <span className="italic text-slate-400">—</span>}</dd>
            </div>
          ))}
        </dl>
        {company.notes && <p className="mt-4 whitespace-pre-line border-t pt-4 text-sm text-slate-700">{company.notes}</p>}
      </section>

      {/* Licenses */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Licenses ({company.licenses.length})</h2>
          {canUpdate && (
            <Button onClick={() => setLicenseDialog({ open: true, license: null })} className="gap-2">
              <Plus className="h-4 w-4" /> Add license
            </Button>
          )}
        </div>

        {company.licenses.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            No licenses yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {company.licenses.map((l) => (
              <article key={l.license_id} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold text-primary">{l.license_number}</p>
                    {l.site_name && <p className="text-sm text-slate-600">{l.site_name}</p>}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${l.license_type === "mining" ? "bg-amber-100 text-amber-800" : "bg-sky-100 text-sky-800"}`}
                    >
                      {LICENSE_TYPE_LABEL[l.license_type]}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[l.status]}`}>{LICENSE_STATUS_LABEL[l.status]}</span>
                  </div>
                </div>

                <dl className="mt-3 space-y-2 text-sm">
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-slate-500">Minerals</dt>
                    <dd>{l.minerals.length ? l.minerals.map((m) => m.name).join(", ") : <span className="italic text-slate-400">—</span>}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-slate-500">Issued</dt>
                    <dd>
                      {l.issued_on ? formatCalendarDate(l.issued_on) : <span className="italic text-slate-400">—</span>}
                      {l.expires_on && <span className="text-slate-500"> · expires {formatCalendarDate(l.expires_on)}</span>}
                      {l.date_note && <span className="block text-xs text-slate-500">{l.date_note}</span>}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-slate-500">Team</dt>
                    <dd>
                      {l.teams?.length ? (
                        l.teams.map((t, i) => (
                          <span key={t.team_id}>
                            {i > 0 && ", "}
                            <a href={`/teams/${t.team_id}`} onClick={(e) => { e.preventDefault(); router.push(`/teams/${t.team_id}`); }} className="text-primary hover:underline">
                              {t.name}
                            </a>
                          </span>
                        ))
                      ) : (
                        <span className="italic text-slate-400">Not assigned</span>
                      )}
                    </dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="w-20 shrink-0 text-slate-500">Location</dt>
                    <dd className="space-y-0.5">
                      {l.areas.length ? (
                        l.areas.map((a) => (
                          <span key={a.area_id} className="flex items-center gap-1">
                            <MapPin className="h-3.5 w-3.5 shrink-0 text-slate-400" /> {areaPath(a)}
                          </span>
                        ))
                      ) : (
                        <span className="italic text-slate-400">—</span>
                      )}
                    </dd>
                  </div>
                </dl>

                {(canUpdate || canDelete) && (
                  <div className="mt-3 flex justify-end gap-1 border-t pt-3">
                    {canUpdate && (
                      <Button variant="ghost" size="sm" className="gap-1" onClick={() => setLicenseDialog({ open: true, license: l })}>
                        <Edit className="h-3.5 w-3.5" /> Edit
                      </Button>
                    )}
                    {canDelete && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() => setConfirmDelete(l)}
                      >
                        <Trash2 className="h-3.5 w-3.5" /> Delete
                      </Button>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      <CompanyDialog open={editingCompany} company={company} onClose={() => setEditingCompany(false)} />
      <LicenseDialog
        open={licenseDialog.open}
        companyId={company.company_id}
        license={licenseDialog.license}
        onClose={() => setLicenseDialog({ open: false, license: null })}
      />

      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete license?</DialogTitle>
            <DialogDescription>
              {confirmDelete?.license_number} will be removed. If it was entered by mistake, delete it; if it ended, set its
              status to expired or revoked instead so its history is kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)} disabled={deleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
