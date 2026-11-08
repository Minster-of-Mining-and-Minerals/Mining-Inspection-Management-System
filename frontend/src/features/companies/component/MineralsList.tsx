"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Edit, Plus, Tags } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Loading01 from "@/features/template/component/Loading/Loading01";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useCreateMineralMutation,
  useGetMineralCategoriesQuery,
  useGetMineralsQuery,
  useUpdateMineralMutation,
} from "@/redux/api/companyApi";
import { Mineral, MineralCategory } from "@/redux/types/company";

/** Base Data → Minerals: the standard list licenses are linked to, grouped by category. */
export default function MineralsList() {
  const router = useRouter();
  const { check } = usePermissions();
  const canCreate = check({ allPermissions: ["MINERALS:CREATE"] });
  const canUpdate = check({ allPermissions: ["MINERALS:UPDATE"] });
  const [search, setSearch] = useState("");
  const { data: minerals = [], isLoading } = useGetMineralsQuery();
  const { data: categories = [], isLoading: categoriesLoading } = useGetMineralCategoriesQuery();
  const [editing, setEditing] = useState<Mineral | "new" | null>(null);

  const groups = useMemo(() => {
    const term = search.trim().toLowerCase();
    const shown = minerals.filter(
      (m) =>
        !term ||
        m.name.toLowerCase().includes(term) ||
        (m.name_am ?? "").includes(term) ||
        (m.aliases ?? []).some((a) => a.toLowerCase().includes(term)),
    );
    return categories
      .map((c) => ({ category: c, items: shown.filter((m) => m.category_id === c.category_id) }))
      .filter((g) => g.items.length);
  }, [minerals, categories, search]);

  if (isLoading || categoriesLoading) return <Loading01 />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Minerals</h1>
          <p className="text-sm text-slate-500">
            The standard list that licenses are linked to. Other spellings are matched automatically when importing.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search minerals…" className="w-56" />
          <Button variant="outline" onClick={() => router.push("/basedata/mineral-categories")} className="gap-2">
            <Tags className="h-4 w-4" /> Categories
          </Button>
          {canCreate && (
            <Button onClick={() => setEditing("new")} className="gap-2">
              <Plus className="h-4 w-4" /> Add mineral
            </Button>
          )}
        </div>
      </div>

      {groups.map(({ category, items }) => (
        <section key={category.category_id} className="rounded-xl border border-slate-200 bg-white">
          <h2 className="flex items-center gap-2 border-b px-4 py-2.5 text-sm font-semibold text-slate-700">
            {category.name}
            {category.name_am && (
              <span lang="am" className="font-normal text-slate-500">
                {category.name_am}
              </span>
            )}
            {category.is_active === false && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">inactive</span>
            )}
          </h2>
          <ul className="divide-y">
            {items.map((m) => (
              <li key={m.mineral_id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className={`font-medium ${m.is_active === false ? "text-slate-400 line-through" : "text-slate-900"}`}>
                    {m.name}
                    {m.name_am && (
                      <span lang="am" className="ml-2 text-sm font-normal text-slate-500">
                        {m.name_am}
                      </span>
                    )}
                  </p>
                  {!!m.aliases?.length && <p className="truncate text-xs text-slate-500">Also: {m.aliases.join(", ")}</p>}
                </div>
                <span className="shrink-0 text-xs tabular-nums text-slate-500">
                  {m.license_count ?? 0} license{m.license_count === 1 ? "" : "s"}
                </span>
                {canUpdate && (
                  <Button variant="ghost" size="icon" aria-label={`Edit ${m.name}`} onClick={() => setEditing(m)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {groups.length === 0 && <p className="py-10 text-center text-sm text-slate-500">No minerals match.</p>}

      <MineralDialog mineral={editing} categories={categories} onClose={() => setEditing(null)} />
    </div>
  );
}

function MineralDialog({
  mineral,
  categories,
  onClose,
}: {
  mineral: Mineral | "new" | null;
  categories: MineralCategory[];
  onClose: () => void;
}) {
  const isNew = mineral === "new";
  const [createMineral, { isLoading: creating }] = useCreateMineralMutation();
  const [updateMineral, { isLoading: updating }] = useUpdateMineralMutation();
  const saving = creating || updating;
  const [name, setName] = useState("");
  const [nameAm, setNameAm] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [aliases, setAliases] = useState("");
  const [active, setActive] = useState(true);

  // Active categories can be chosen; keep the current one listed even if it was deactivated
  const current = mineral && mineral !== "new" ? mineral.category_id : "";
  const choices = categories.filter((c) => c.is_active !== false || c.category_id === current);

  useEffect(() => {
    if (!mineral) return;
    const m = mineral === "new" ? null : mineral;
    setName(m?.name ?? "");
    setNameAm(m?.name_am ?? "");
    setCategoryId(m?.category_id ?? categories.find((c) => c.code === "other")?.category_id ?? "");
    setAliases((m?.aliases ?? []).join(", "));
    setActive(m?.is_active !== false);
  }, [mineral, categories]);

  const save = async () => {
    if (name.trim().length < 2) {
      toast.error("Name is required.");
      return;
    }
    if (!categoryId) {
      toast.error("Choose a category.");
      return;
    }
    const data = {
      name: name.trim(),
      name_am: nameAm.trim() || null,
      category_id: categoryId,
      aliases: aliases.split(",").map((a) => a.trim()).filter(Boolean),
    };
    try {
      if (isNew) await createMineral(data).unwrap();
      else if (mineral) await updateMineral({ id: mineral.mineral_id, data: { ...data, is_active: active } }).unwrap();
      toast.success("Saved.");
      onClose();
    } catch (e: any) {
      toast.error(e?.data?.message || "Could not save.");
    }
  };

  return (
    <Dialog open={!!mineral} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isNew ? "Add mineral" : "Edit mineral"}</DialogTitle>
          <DialogDescription>Other spellings are used to recognise this mineral in imported lists.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="min-name">Name *</Label>
            <Input id="min-name" value={name} onChange={(e) => setName(e.target.value)} disabled={saving} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="min-name-am">ስም (አማርኛ)</Label>
            <Input id="min-name-am" lang="am" value={nameAm} onChange={(e) => setNameAm(e.target.value)} disabled={saving} />
          </div>
          <div className="space-y-2">
            <Label>Category *</Label>
            <Select value={categoryId} onValueChange={setCategoryId} disabled={saving}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a category" />
              </SelectTrigger>
              <SelectContent>
                {choices.map((c) => (
                  <SelectItem key={c.category_id} value={c.category_id}>
                    {c.name}
                    {c.is_active === false ? " (inactive)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="min-aliases">Other spellings</Label>
            <Input
              id="min-aliases"
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              placeholder="Separate with commas, e.g. alluvial gold, placer"
              disabled={saving}
            />
          </div>
          {!isNew && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} disabled={saving} className="h-4 w-4 accent-primary" />
              Active <span className="text-slate-500">(inactive minerals can't be chosen for new licenses)</span>
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
