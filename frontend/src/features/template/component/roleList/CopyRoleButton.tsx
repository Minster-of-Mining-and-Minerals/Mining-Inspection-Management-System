"use client";

/**
 * Copy a role (usually a global one) into a sector, to change the copy there.
 * Sector users copy into their own sector; central users into the sector chosen in the
 * Sector filter.
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCopyRoleMutation } from "@/redux/api/roleApi";
import { useSelectedSectorId } from "@/lib/sectorSelection";
import type { Role } from "@/redux/types/auth";

export function CopyRoleButton({ role, label = "Copy", size = "sm" }: { role: Role; label?: string; size?: "sm" | "default" }) {
  const router = useRouter();
  const { data: session } = useSession();
  const isCentral = !!session?.user?.is_central;
  const sectorId = useSelectedSectorId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [copyRole, { isLoading }] = useCopyRoleMutation();

  const start = () => {
    if (isCentral && !sectorId) {
      toast.error("Choose a sector in the Sector filter first: the copy belongs to that sector.");
      return;
    }
    setName(`${role.name} (copy)`);
    setOpen(true);
  };

  const submit = async () => {
    if (!name.trim()) return;
    try {
      const copy = await copyRole({ id: role.role_id, name: name.trim(), ...(isCentral && sectorId && { sector_node_id: sectorId }) }).unwrap();
      toast.success(`Copied "${role.name}". Change the copy as you need.`);
      setOpen(false);
      router.push(`/users/roles/${copy.role_id}`);
    } catch (error) {
      toast.error((error as { data?: { message?: string } })?.data?.message || "Failed to copy the role");
    }
  };

  return (
    <>
      <Button type="button" variant="outline" size={size} className="gap-1.5" onClick={start}>
        <Copy className="h-4 w-4" />
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy role</DialogTitle>
            <DialogDescription>
              The copy gets the same permissions as &quot;{role.name}&quot; and belongs to one sector only. You can change it afterwards.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="copy-role-name">Name of the copy</Label>
            <Input id="copy-role-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="button" onClick={submit} disabled={isLoading || !name.trim()}>
              {isLoading ? "Copying…" : "Copy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
