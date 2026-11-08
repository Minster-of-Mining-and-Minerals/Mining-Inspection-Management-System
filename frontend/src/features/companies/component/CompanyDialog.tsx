"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { useCreateCompanyMutation, useUpdateCompanyMutation } from "@/redux/api/companyApi";
import { Company, CompanyPayload } from "@/redux/types/company";

interface Props {
  open: boolean;
  /** The company to edit; null to create one */
  company: Company | null;
  onClose: () => void;
}

const FIELDS: { key: keyof CompanyPayload; label: string; placeholder?: string; wide?: boolean; lang?: string; multiline?: boolean }[] = [
  { key: "name", label: "Company name *", wide: true },
  { key: "name_am", label: "የድርጅቱ ስም (አማርኛ)", wide: true, lang: "am" },
  { key: "tin", label: "TIN", placeholder: "10 digits" },
  { key: "phone", label: "Phone", placeholder: "0911234567" },
  { key: "email", label: "Email", placeholder: "info@company.com" },
  { key: "contact_person", label: "Focal person", placeholder: "Company representative" },
  { key: "contact_phone", label: "Focal person phone", placeholder: "0911234567" },
  { key: "address", label: "Address", wide: true, multiline: true },
  { key: "notes", label: "Notes", wide: true, multiline: true },
];

export function CompanyDialog({ open, company, onClose }: Props) {
  const router = useRouter();
  const [createCompany, { isLoading: creating }] = useCreateCompanyMutation();
  const [updateCompany, { isLoading: updating }] = useUpdateCompanyMutation();
  const saving = creating || updating;
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setForm(Object.fromEntries(FIELDS.map((f) => [f.key, (company?.[f.key as keyof Company] as string | null) ?? ""])));
  }, [open, company]);

  const set = (key: string, v: string) => setForm((f) => ({ ...f, [key]: v }));

  const handleSave = async () => {
    if ((form.name ?? "").trim().length < 2) {
      toast.error("Company name is required.");
      return;
    }
    const data: CompanyPayload = Object.fromEntries(FIELDS.map((f) => [f.key, form[f.key]?.trim() || null])) as CompanyPayload;
    data.name = form.name.trim();
    try {
      if (company) {
        await updateCompany({ id: company.company_id, data }).unwrap();
        toast.success("Company updated.");
        onClose();
      } else {
        const created = await createCompany(data).unwrap();
        toast.success("Company created. Now add its licenses.");
        onClose();
        router.push(`/companies/${created.company_id}`);
      }
    } catch (e: any) {
      toast.error(e?.data?.message || "Could not save the company.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{company ? "Edit company" : "New company"}</DialogTitle>
          <DialogDescription>
            {company ? company.name : "Company details. Licenses are added on the company page."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FIELDS.map((f) => (
            <div key={f.key} className={`space-y-2 ${f.wide ? "sm:col-span-2" : ""}`}>
              <Label htmlFor={`co-${f.key}`}>{f.label}</Label>
              {f.multiline ? (
                <TextArea
                  id={`co-${f.key}`}
                  value={form[f.key] ?? ""}
                  onChange={(v) => set(f.key, v)}
                  rows={2}
                  disabled={saving}
                />
              ) : (
                <Input
                  id={`co-${f.key}`}
                  lang={f.lang}
                  value={form[f.key] ?? ""}
                  onChange={(e) => set(f.key, e.target.value)}
                  placeholder={f.placeholder}
                  disabled={saving}
                />
              )}
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : company ? "Save" : "Create company"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
