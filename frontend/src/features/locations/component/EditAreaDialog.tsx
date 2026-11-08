"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";
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
import {
  useAddAreaAliasMutation,
  useDeleteAreaAliasMutation,
  useGetAdminAreaByIdQuery,
  useUpdateAdminAreaMutation,
} from "@/redux/api/adminAreaApi";
import { LEVEL_LABEL } from "@/redux/types/adminArea";

interface Props {
  areaId: string | null;
  canEdit: boolean;
  onClose: () => void;
}

export function EditAreaDialog({ areaId, canEdit, onClose }: Props) {
  const { data: area, isFetching } = useGetAdminAreaByIdQuery(areaId as string, { skip: !areaId });
  const [updateArea, { isLoading: saving }] = useUpdateAdminAreaMutation();
  const [addAlias, { isLoading: addingAlias }] = useAddAreaAliasMutation();
  const [deleteAlias] = useDeleteAreaAliasMutation();

  const [name, setName] = useState("");
  const [nameAm, setNameAm] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [newAlias, setNewAlias] = useState("");

  useEffect(() => {
    if (area && area.area_id === areaId) {
      setName(area.name);
      setNameAm(area.name_am ?? "");
      setIsActive(area.is_active);
      setNewAlias("");
    }
  }, [area, areaId]);

  const level = area ? LEVEL_LABEL[area.level] : null;
  const path = area ? [...area.ancestors.map((a) => a.name), area.name].join(" › ") : "";

  const handleSave = async () => {
    if (!area) return;
    if (name.trim().length < 2) {
      toast.error("Name must be at least 2 characters.");
      return;
    }
    try {
      await updateArea({
        id: area.area_id,
        data: { name: name.trim(), name_am: nameAm.trim() || null, is_active: isActive },
      }).unwrap();
      toast.success("Saved.");
      onClose();
    } catch (e: any) {
      toast.error(e?.data?.message || "Could not save.");
    }
  };

  const handleAddAlias = async () => {
    if (!area || !newAlias.trim()) return;
    try {
      await addAlias({ id: area.area_id, alias: newAlias.trim() }).unwrap();
      setNewAlias("");
      toast.success("Spelling saved.");
    } catch (e: any) {
      toast.error(e?.data?.message || "Could not save the spelling.");
    }
  };

  const handleDeleteAlias = async (aliasId: string) => {
    if (!area) return;
    try {
      await deleteAlias({ aliasId, areaId: area.area_id }).unwrap();
    } catch (e: any) {
      toast.error(e?.data?.message || "Could not remove the spelling.");
    }
  };

  return (
    <Dialog open={!!areaId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{area ? `${level?.one}: ${area.name}` : "Loading…"}</DialogTitle>
          <DialogDescription>{path}</DialogDescription>
        </DialogHeader>

        {!area || isFetching ? (
          <div className="flex justify-center py-10 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 rounded-lg bg-slate-50 p-3 text-sm">
              <div>
                <p className="text-xs text-slate-500">Official code</p>
                <p className="font-mono">{area.pcode ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Source</p>
                <p>{area.source === "official" ? `Official list (COD-AB ${area.data_version ?? ""})` : "Added by hand"}</p>
              </div>
              {area.area_sqkm != null && (
                <div>
                  <p className="text-xs text-slate-500">Area</p>
                  <p>{Math.round(area.area_sqkm).toLocaleString()} km²</p>
                </div>
              )}
              {area.center_lat != null && area.center_lng != null && (
                <div>
                  <p className="text-xs text-slate-500">Centre point</p>
                  <p className="font-mono text-xs">
                    {area.center_lat.toFixed(4)}, {area.center_lng.toFixed(4)}
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="area-name">Name (English)</Label>
              <Input id="area-name" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit || saving} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="area-name-am">ስም (አማርኛ)</Label>
              <Input
                id="area-name-am"
                lang="am"
                value={nameAm}
                onChange={(e) => setNameAm(e.target.value)}
                placeholder="Amharic name"
                disabled={!canEdit || saving}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                disabled={!canEdit || saving}
                className="h-4 w-4 accent-primary"
              />
              Active <span className="text-slate-500">(inactive places are not offered when matching or choosing)</span>
            </label>

            <div className="space-y-2 border-t pt-4">
              <div>
                <p className="text-sm font-semibold text-slate-800">Other spellings</p>
                <p className="text-xs text-slate-500">
                  Spellings in imports that mean this {level?.one.toLowerCase()}. They are matched automatically next time.
                </p>
              </div>
              {area.aliases.length === 0 ? (
                <p className="text-sm italic text-slate-400">None yet.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {area.aliases.map((a) => (
                    <li key={a.alias_id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <span>{a.alias}</span>
                      <span className="flex items-center gap-2">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">
                          {a.source === "official" ? "official" : "confirmed"}
                        </span>
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-500 hover:bg-red-50 hover:text-red-600"
                            aria-label={`Remove ${a.alias}`}
                            onClick={() => handleDeleteAlias(a.alias_id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {canEdit && (
                <div className="flex gap-2">
                  <Input
                    value={newAlias}
                    onChange={(e) => setNewAlias(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddAlias()}
                    placeholder="e.g. Asossa"
                    disabled={addingAlias}
                  />
                  <Button variant="outline" onClick={handleAddAlias} disabled={!newAlias.trim() || addingAlias} className="shrink-0 gap-1">
                    <Plus className="h-4 w-4" /> Add
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {canEdit ? "Cancel" : "Close"}
          </Button>
          {canEdit && (
            <Button onClick={handleSave} disabled={!area || saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
