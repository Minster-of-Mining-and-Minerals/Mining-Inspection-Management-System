"use client";

import { useEffect, useState } from "react";
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
import { useCreateAdminAreaMutation } from "@/redux/api/adminAreaApi";
import { AreaLevel, LEVEL_LABEL } from "@/redux/types/adminArea";

interface Props {
  open: boolean;
  level: AreaLevel;
  parent: { area_id: string; name: string } | null;
  onClose: () => void;
}

/** Add a place that is missing from the official list, under the current parent. */
export function AddAreaDialog({ open, level, parent, onClose }: Props) {
  const [createArea, { isLoading }] = useCreateAdminAreaMutation();
  const [name, setName] = useState("");
  const [nameAm, setNameAm] = useState("");

  useEffect(() => {
    if (open) {
      setName("");
      setNameAm("");
    }
  }, [open]);

  const label = LEVEL_LABEL[level];

  const handleCreate = async () => {
    if (name.trim().length < 2) {
      toast.error("Name must be at least 2 characters.");
      return;
    }
    try {
      await createArea({ level, parent_id: parent?.area_id ?? null, name: name.trim(), name_am: nameAm.trim() || null }).unwrap();
      toast.success(`${label.one} added.`);
      onClose();
    } catch (e: any) {
      toast.error(e?.data?.message || `Could not add the ${label.one.toLowerCase()}.`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add {label.one.toLowerCase()}</DialogTitle>
          <DialogDescription>
            {parent ? `In ${parent.name}. ` : ""}Use this only for a place missing from the official list. To record another
            spelling of an existing place, edit that place instead.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-area-name">Name (English)</Label>
            <Input id="new-area-name" value={name} onChange={(e) => setName(e.target.value)} disabled={isLoading} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-area-name-am">ስም (አማርኛ)</Label>
            <Input id="new-area-name-am" lang="am" value={nameAm} onChange={(e) => setNameAm(e.target.value)} disabled={isLoading} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={isLoading}>
            {isLoading ? "Adding…" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
