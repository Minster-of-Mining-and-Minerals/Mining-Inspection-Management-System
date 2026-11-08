"use client";

import { useEffect, useMemo, useState } from "react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect, SelectOption } from "@/components/ui/searchable-select";
import { useAddLicenseMutation, useGetMineralsQuery, useUpdateLicenseMutation } from "@/redux/api/companyApi";
import {
  CompanyLicense,
  LICENSE_STATUS_LABEL,
  LICENSE_TYPE_LABEL,
  LicenseAreaRef,
  LicenseStatus,
  LicenseType,
} from "@/redux/types/company";
import { AreaPicker } from "./AreaPicker";

interface Props {
  open: boolean;
  companyId: string;
  /** The license to edit; null to add a new one */
  license: CompanyLicense | null;
  onClose: () => void;
}

export function LicenseDialog({ open, companyId, license, onClose }: Props) {
  const { data: minerals = [] } = useGetMineralsQuery({ is_active: true });
  const [addLicense, { isLoading: adding }] = useAddLicenseMutation();
  const [updateLicense, { isLoading: updating }] = useUpdateLicenseMutation();
  const saving = adding || updating;

  const [number, setNumber] = useState("");
  const [type, setType] = useState<LicenseType>("exploration");
  const [status, setStatus] = useState<LicenseStatus>("active");
  const [selectedMinerals, setSelectedMinerals] = useState<SelectOption[]>([]);
  const [areas, setAreas] = useState<LicenseAreaRef[]>([]);
  const [issuedOn, setIssuedOn] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [dateNote, setDateNote] = useState("");
  const [siteName, setSiteName] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setNumber(license?.license_number ?? "");
    setType(license?.license_type ?? "exploration");
    setStatus(license?.status ?? "active");
    setSelectedMinerals((license?.minerals ?? []).map((m) => ({ value: m.mineral_id, label: m.name })));
    setAreas(license?.areas ?? []);
    setIssuedOn(license?.issued_on ?? "");
    setExpiresOn(license?.expires_on ?? "");
    setDateNote(license?.date_note ?? "");
    setSiteName(license?.site_name ?? "");
    setNotes(license?.notes ?? "");
  }, [open, license]);

  // Minerals grouped by category in the list, e.g. "Gold · Precious metals"
  const mineralOptions = useMemo<SelectOption[]>(
    () =>
      minerals.map((m) => ({
        value: m.mineral_id,
        label: m.name,
        data: { description: m.category?.name },
      })),
    [minerals],
  );

  const handleSave = async () => {
    if (number.trim().length < 3) {
      toast.error("License number is required.");
      return;
    }
    if (issuedOn && expiresOn && expiresOn < issuedOn) {
      toast.error("Expiry date cannot be before the issue date.");
      return;
    }
    const data = {
      license_number: number.trim(),
      license_type: type,
      status,
      mineral_ids: selectedMinerals.map((m) => m.value),
      area_ids: areas.map((a) => a.area_id),
      issued_on: issuedOn || null,
      expires_on: expiresOn || null,
      date_note: dateNote.trim() || null,
      site_name: siteName.trim() || null,
      notes: notes.trim() || null,
    };
    try {
      if (license) await updateLicense({ licenseId: license.license_id, companyId, data }).unwrap();
      else await addLicense({ companyId, data }).unwrap();
      toast.success(license ? "License updated." : "License added.");
      onClose();
    } catch (e: any) {
      toast.error(e?.data?.message || "Could not save the license.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{license ? `Edit license ${license.license_number}` : "Add license"}</DialogTitle>
          <DialogDescription>License details, minerals and where the license is located.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="lic-number">License number *</Label>
            <Input
              id="lic-number"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="MOM\EL\00055\2025"
              className="font-mono"
              disabled={saving}
            />
          </div>

          <div className="space-y-2">
            <Label>Type *</Label>
            <Select value={type} onValueChange={(v) => setType(v as LicenseType)} disabled={saving}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(LICENSE_TYPE_LABEL) as LicenseType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {LICENSE_TYPE_LABEL[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as LicenseStatus)} disabled={saving}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(LICENSE_STATUS_LABEL) as LicenseStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {LICENSE_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Minerals</Label>
            <SearchableSelect
              isMulti
              options={mineralOptions}
              value={selectedMinerals}
              onChange={(v) => setSelectedMinerals((v as SelectOption[]) ?? [])}
              placeholder="Choose one or more minerals"
              isDisabled={saving}
            />
            {license?.mineral_text && (
              <p className="text-xs text-slate-500">As written on the imported list: “{license.mineral_text}”</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="lic-issued">Issue date</Label>
            <Input id="lic-issued" type="date" value={issuedOn} onChange={(e) => setIssuedOn(e.target.value)} disabled={saving} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lic-expires">Expiry date</Label>
            <Input id="lic-expires" type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} disabled={saving} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="lic-date-note">Date note</Label>
            <Input
              id="lic-date-note"
              value={dateNote}
              onChange={(e) => setDateNote(e.target.value)}
              placeholder="e.g. Reinstated on 18/09/2026"
              disabled={saving}
            />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label>Location</Label>
            <AreaPicker value={areas} onChange={setAreas} disabled={saving} />
          </div>

          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="lic-site">Mine site / project name</Label>
            <Input id="lic-site" value={siteName} onChange={(e) => setSiteName(e.target.value)} disabled={saving} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="lic-notes">Notes</Label>
            <TextArea id="lic-notes" value={notes} onChange={setNotes} rows={3} disabled={saving} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : license ? "Save" : "Add license"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
