"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Edit, Plus, Trash2 } from "lucide-react";
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
import Loading01 from "@/features/template/component/Loading/Loading01";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useCreateMineralCategoryMutation,
  useDeleteMineralCategoryMutation,
  useGetMineralCategoriesQuery,
  useUpdateMineralCategoryMutation,
} from "@/redux/api/companyApi";
import { MineralCategory } from "@/redux/types/company";

/** Base Data → Mineral Categories: the editable grouping used on the Minerals page and dashboards. */
export default function MineralCategoriesList() {
  const router = useRouter();
  const { check } = usePermissions();
  const canCreate = check({ allPermissions: ["MINERALS:CREATE"] });
  const canUpdate = check({ allPermissions: ["MINERALS:UPDATE"] });
  const { data: categories = [], isLoading } = useGetMineralCategoriesQuery();
  const [deleteCategory, { isLoading: deleting }] = useDeleteMineralCategoryMutation();
  const [editing, setEditing] = useState<MineralCategory | "new" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<MineralCategory | null>(null);

  if (isLoading) return <Loading01 />;

  const handleDelete = async () => {
    if (!confirmDelete) return;
    try {
      await deleteCategory(confirmDelete.category_id).unwrap();
      toast.success("Category deleted.");
      setConfirmDelete(null);
    } catch (e: any) {
      toast.error(e?.data?.message || "Could not delete the category.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start gap-3">
        <Button variant="outline" size="icon" onClick={() => router.push("/basedata/minerals")} aria-label="Back to minerals">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold text-primary">Mineral categories</h1>
          <p className="text-sm text-slate-500">
            How minerals are grouped on the Minerals page and in dashboards. A category that still has minerals can only be
            deactivated, not deleted.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setEditing("new")} className="gap-2">
            <Plus className="h-4 w-4" /> Add category
          </Button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2.5">Order</th>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">ስም (አማርኛ)</th>
              <th className="px-4 py-2.5">Minerals</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {categories.map((c) => {
              const isFallback = c.code === "other";
              return (
                <tr key={c.category_id}>
                  <td className="px-4 py-2.5 tabular-nums text-slate-500">{c.sort_order}</td>
                  <td className="px-4 py-2.5 font-medium text-slate-900">
                    {c.name}
                    {isFallback && <span className="ml-2 text-xs font-normal text-slate-400">(fallback)</span>}
                  </td>
                  <td className="px-4 py-2.5" lang="am">
                    {c.name_am || <span className="italic text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-2.5 tabular-nums">{c.mineral_count ?? 0}</td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${c.is_active !== false ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${c.is_active !== false ? "bg-green-600" : "bg-slate-400"}`} />
                      {c.is_active !== false ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {canUpdate && (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" aria-label={`Edit ${c.name}`} onClick={() => setEditing(c)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        {!isFallback && (c.mineral_count ?? 0) === 0 && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Delete ${c.name}`}
                            className="text-red-600 hover:bg-red-50 hover:text-red-700"
                            onClick={() => setConfirmDelete(c)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      <CategoryDialog category={editing} onClose={() => setEditing(null)} />

      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete category?</DialogTitle>
            <DialogDescription>“{confirmDelete?.name}” has no minerals and will be removed.</DialogDescription>
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

function CategoryDialog({ category, onClose }: { category: MineralCategory | "new" | null; onClose: () => void }) {
  const isNew = category === "new";
  const [createCategory, { isLoading: creating }] = useCreateMineralCategoryMutation();
  const [updateCategory, { isLoading: updating }] = useUpdateMineralCategoryMutation();
  const saving = creating || updating;
  const [name, setName] = useState("");
  const [nameAm, setNameAm] = useState("");
  const [order, setOrder] = useState("");
  const [active, setActive] = useState(true);
  const isFallback = category !== "new" && category?.code === "other";

  useEffect(() => {
    if (!category) return;
    const c = category === "new" ? null : category;
    setName(c?.name ?? "");
    setNameAm(c?.name_am ?? "");
    setOrder(c?.sort_order != null ? String(c.sort_order) : "");
    setActive(c?.is_active !== false);
  }, [category]);

  const save = async () => {
    if (name.trim().length < 2) {
      toast.error("Name is required.");
      return;
    }
    const sortOrder = order.trim() === "" ? undefined : Number(order);
    if (sortOrder !== undefined && (!Number.isInteger(sortOrder) || sortOrder < 0)) {
      toast.error("Order must be a whole number.");
      return;
    }
    const data = { name: name.trim(), name_am: nameAm.trim() || null, ...(sortOrder !== undefined && { sort_order: sortOrder }) };
    try {
      if (isNew) await createCategory(data).unwrap();
      else if (category) await updateCategory({ id: category.category_id, data: { ...data, is_active: active } }).unwrap();
      toast.success("Saved.");
      onClose();
    } catch (e: any) {
      toast.error(e?.data?.message || "Could not save.");
    }
  };

  return (
    <Dialog open={!!category} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? "Add category" : "Edit category"}</DialogTitle>
          <DialogDescription>Lower order numbers are listed first. Leave empty to add at the end.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cat-name">Name *</Label>
            <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} disabled={saving} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-name-am">ስም (አማርኛ)</Label>
            <Input id="cat-name-am" lang="am" value={nameAm} onChange={(e) => setNameAm(e.target.value)} disabled={saving} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-order">Order</Label>
            <Input id="cat-order" inputMode="numeric" value={order} onChange={(e) => setOrder(e.target.value)} placeholder="e.g. 25" disabled={saving} />
          </div>
          {!isNew && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                disabled={saving || isFallback}
                className="h-4 w-4 accent-primary"
              />
              Active
              <span className="text-slate-500">
                {isFallback ? "(the fallback category is always active)" : "(new minerals can't be put in an inactive category)"}
              </span>
            </label>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
