"use client";

import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, ChevronDown, Loader2, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useGetRolesQuery } from "@/redux/api/roleApi";
import { useGetUserByIdQuery, useUpdateUserMutation } from "@/redux/api/userApi";
import { useSession } from "next-auth/react";
import { useLocale } from "next-intl";
import { useGetSectorNodesQuery } from "@/redux/api/sectorNodeApi";
import { UpdateUserPayload } from "@/redux/types/user";
import { localizedName } from "@/utils/localizedName";

interface EditUserModalProps {
  /** User to edit; the modal is open while this is set. */
  userId: string | null;
  /** Internal users also have a sector (only central users can move them to another one). */
  userType: "internal" | "external";
  onClose: () => void;
}

const ETHIOPIAN_PHONE_REGEX = /^(\+251|0)(9|7)\d{8}$/;

const labelClass = "text-sm font-semibold text-slate-700";
const fieldClass = "h-11 w-full border-slate-300 bg-white text-slate-900";

type FormState = {
  fullName: string;
  email: string;
  phoneNumber: string;
  sectorId: string;
  roleIds: string[];
  isActive: boolean;
};

export const EditUserModal: React.FC<EditUserModalProps> = ({ userId, userType, onClose }) => {
  const isOpen = Boolean(userId);
  const { data: user, isFetching: loadingUser, isError } = useGetUserByIdQuery(userId ?? "", {
    skip: !userId,
    refetchOnMountOrArgChange: true,
  });
  const { data: roles = [] } = useGetRolesQuery();
  const { data: session } = useSession();
  const isCentral = !!session?.user?.is_central;
  const locale = useLocale();
  // Only central users move people between sectors
  const canChangeSector = isCentral && userType === "internal";
  const { data: sectorNodes } = useGetSectorNodesQuery({ limit: 100, is_active: true }, { skip: !canChangeSector });
  const [updateUser, { isLoading: saving }] = useUpdateUserMutation();

  // The root ("Central Admin") first, then the sectors
  const sectors = useMemo(
    () => [...(sectorNodes?.data ?? [])].sort((a, b) => Number(!!a.parent_id) - Number(!!b.parent_id)),
    [sectorNodes]
  );

  const [initial, setInitial] = useState<FormState | null>(null);
  const [form, setForm] = useState<FormState | null>(null);

  // Prefill once the user is loaded
  useEffect(() => {
    if (!user || !isOpen) return;
    const u = user as any;
    const state: FormState = {
      fullName: u.full_name ?? "",
      email: u.email ?? "",
      phoneNumber: u.phone_number ?? "",
      sectorId: u.sector_node_id ?? "",
      roleIds: (u.roles ?? []).map((r: any) => r.role_id),
      isActive: Boolean(u.is_active),
    };
    setInitial(state);
    setForm(state);
  }, [user, isOpen]);

  // Clear the form when the modal closes so the next user starts fresh
  useEffect(() => {
    if (!isOpen) {
      setInitial(null);
      setForm(null);
    }
  }, [isOpen]);

  // Roles that can be given: global or of the user's sector, and only ones this user may give
  const assignableRoles = roles.filter(
    (r) => r.is_active !== false && r.can_assign !== false && (!r.sector_node_id || r.sector_node_id === form?.sectorId),
  );

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));

  const handleSubmit = async () => {
    if (!form || !initial || !userId) return;

    if (form.fullName.trim().length < 3) return toast.error("Full name must be at least 3 characters");
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) return toast.error("Enter a valid email address");
    if (form.phoneNumber && form.phoneNumber !== initial.phoneNumber && !ETHIOPIAN_PHONE_REGEX.test(form.phoneNumber.trim())) {
      return toast.error("Phone number must be like +2519XXXXXXXX or 09XXXXXXXX");
    }
    if (form.roleIds.length === 0) return toast.error("Select at least one role");

    // Send only what changed
    const data: UpdateUserPayload = {};
    if (form.fullName.trim() !== initial.fullName) data.full_name = form.fullName.trim();
    if (form.email.trim() !== initial.email) data.email = form.email.trim();
    if (form.phoneNumber.trim() !== initial.phoneNumber) data.phone_number = form.phoneNumber.trim();
    if (form.isActive !== initial.isActive) data.is_active = form.isActive;
    if (canChangeSector && form.sectorId && form.sectorId !== initial.sectorId) data.sector_node_id = form.sectorId;
    const sameRoles =
      form.roleIds.length === initial.roleIds.length &&
      form.roleIds.every((id) => initial.roleIds.includes(id));
    if (!sameRoles) data.role_ids = form.roleIds;

    if (Object.keys(data).length === 0) {
      toast.info("No changes to save");
      return;
    }

    try {
      await updateUser({ id: userId, data }).unwrap();
      toast.success("User updated successfully");
      onClose();
    } catch (error: any) {
      toast.error(error?.data?.message || "Failed to update user");
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle className="text-xl text-primary">Edit User</DialogTitle>
          <DialogDescription>Update this user&apos;s details, roles and status.</DialogDescription>
        </DialogHeader>

        {loadingUser || !form ? (
          <div className="flex min-h-[240px] items-center justify-center">
            {isError ? (
              <p className="text-sm text-red-600">Failed to load user.</p>
            ) : (
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 py-2 md:grid-cols-2">
            <div className="space-y-2">
              <Label className={labelClass}>Full Name <span className="text-red-500">*</span></Label>
              <Input value={form.fullName} onChange={(e) => set("fullName", e.target.value)} className={fieldClass} />
            </div>
            <div className="space-y-2">
              <Label className={labelClass}>Phone Number</Label>
              <Input
                value={form.phoneNumber}
                onChange={(e) => set("phoneNumber", e.target.value)}
                placeholder="+2519XXXXXXXX"
                className={fieldClass}
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label className={labelClass}>Email <span className="text-red-500">*</span></Label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className={fieldClass} />
            </div>

            {canChangeSector && (
              <div className="space-y-2 md:col-span-2">
                <Label className={labelClass}>Sector</Label>
                <Select
                  value={form.sectorId}
                  onValueChange={(v) =>
                    // Roles of the old sector don't apply in the new one
                    setForm((prev) =>
                      prev
                        ? {
                            ...prev,
                            sectorId: v,
                            roleIds: prev.roleIds.filter((id) => {
                              const r = roles.find((x) => x.role_id === id);
                              return !r?.sector_node_id || r.sector_node_id === v;
                            }),
                          }
                        : prev
                    )
                  }
                >
                  <SelectTrigger className={fieldClass}>
                    <SelectValue placeholder="Select sector" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64 bg-white">
                    {sectors.map((s) => (
                      <SelectItem key={s.sector_node_id} value={s.sector_node_id}>
                        {s.parent_id ? localizedName(s, locale) : `${localizedName(s, locale)} (central)`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.sectorId !== initial?.sectorId && (
                  <p className="text-xs text-amber-700">Moving a user to another sector: remove them from their team first.</p>
                )}
              </div>
            )}

            {/* Roles (multi-select) */}
            <div className="space-y-2 md:col-span-2">
              <Label className={labelClass}>Roles <span className="text-red-500">*</span></Label>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex min-h-11 w-full flex-wrap items-center gap-2 rounded-md border border-slate-300 bg-white p-2 text-left hover:bg-slate-50"
                  >
                    {form.roleIds.length === 0 && <span className="text-sm text-slate-400">Select roles</span>}
                    {form.roleIds.map((id) => {
                      const r = roles.find((rr: any) => rr.role_id === id);
                      if (!r) return null;
                      return (
                        <span key={id} className="inline-flex items-center gap-1 rounded bg-primary/10 pl-2 text-xs font-medium text-primary">
                          <span className="max-w-[140px] truncate py-1">{r.name}</span>
                          <span
                            role="button"
                            tabIndex={0}
                            aria-label={`Remove ${r.name}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              set("roleIds", form.roleIds.filter((x) => x !== id));
                            }}
                            className="flex items-center rounded-r px-1 py-1 hover:bg-red-500 hover:text-white"
                          >
                            <XIcon className="h-3 w-3" />
                          </span>
                        </span>
                      );
                    })}
                    <ChevronDown className="ml-auto h-4 w-4 text-slate-400" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] bg-white p-2" align="start">
                  <div className="max-h-64 overflow-y-auto">
                    {assignableRoles.map((r) => {
                      const selected = form.roleIds.includes(r.role_id);
                      return (
                        <button
                          key={r.role_id}
                          type="button"
                          onClick={() =>
                            set("roleIds", selected ? form.roleIds.filter((x) => x !== r.role_id) : [...form.roleIds, r.role_id])
                          }
                          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-primary hover:bg-primary/10"
                        >
                          <span className={`flex h-4 w-4 items-center justify-center rounded border ${selected ? "border-primary bg-primary text-white" : "border-slate-300"}`}>
                            {selected && <Check className="h-3 w-3" />}
                          </span>
                          <span className="truncate">{r.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Status */}
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 md:col-span-2">
              <div>
                <p className="text-sm font-semibold text-slate-800">Active account</p>
                <p className="text-xs text-slate-500">Inactive users cannot sign in.</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.isActive}
                aria-label="Active account"
                onClick={() => set("isActive", !form.isActive)}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${form.isActive ? "bg-primary" : "bg-slate-300"}`}
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${form.isActive ? "translate-x-[22px]" : "translate-x-0.5"}`}
                />
              </button>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 border-t pt-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={saving || !form} className="min-w-28">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
