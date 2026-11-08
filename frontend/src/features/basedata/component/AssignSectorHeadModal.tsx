import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { SearchableSelect, SelectOption } from "@/components/ui/searchable-select";
import { useGetUsersQuery, useGetUserTypesQuery } from "@/redux/api/userApi";
import { useUpdateSectorNodeMutation } from "@/redux/api/sectorNodeApi";
import { toast } from "sonner";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sectorNodeId: string;
}

export function AssignSectorHeadModal({ isOpen, onClose, sectorNodeId }: Props) {
  const { data: userTypes = [] } = useGetUserTypesQuery();
  const userTypeId = userTypes?.find((type: any) => type.name === "internal")?.user_type_id;
  const { data: users, isLoading: usersLoading } = useGetUsersQuery({
    is_active: true,
    user_type_id: userTypeId,
    page: 1,
    limit: 1000,
  });
  const [updateSectorNode, { isLoading: submitting }] = useUpdateSectorNodeMutation();

  const [selectedUser, setSelectedUser] = useState<SelectOption | null>(null);

  const userOptions: SelectOption[] =
    users?.data?.map((u) => ({
      value: u.user_id,
      label: u.full_name,
      data: { description: u.email },
    })) || [];

  const handleAssign = async () => {
    if (!selectedUser) return;
    try {
      await updateSectorNode({ id: sectorNodeId, data: { head_id: selectedUser.value } }).unwrap();
      toast.success("Head assigned successfully");
      setSelectedUser(null);
      onClose();
    } catch (error: any) {
      toast.error(error?.data?.message || "Failed to assign head");
    }
  };

  const handleClose = () => {
    setSelectedUser(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign Head</DialogTitle>
          <DialogDescription>Select the user who leads this unit.</DialogDescription>
        </DialogHeader>
        <div className="py-4 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Select User</label>
            <div className="min-h-[250px] relative">
              <SearchableSelect
                options={userOptions}
                value={selectedUser}
                onChange={(option) => setSelectedUser(option as SelectOption)}
                placeholder={usersLoading ? "Loading users..." : "Search user by name or email..."}
                isDisabled={usersLoading || submitting}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={submitting}>Cancel</Button>
          <Button onClick={handleAssign} disabled={!selectedUser || submitting} className="bg-primary">
            {submitting ? "Assigning..." : "Assign"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
