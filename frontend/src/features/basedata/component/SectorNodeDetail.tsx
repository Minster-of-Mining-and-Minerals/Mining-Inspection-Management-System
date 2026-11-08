"use client";

import { useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useGetSectorNodeByIdQuery } from "@/redux/api/sectorNodeApi";
import { Badge } from "@/components/ui/badge";
import Loading01 from "@/features/template/component/Loading/Loading01";
import { Button } from "@/components/ui/button";
import { Edit, Trash, ArrowLeft, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { AssignSectorHeadModal } from "./AssignSectorHeadModal";
import ChildSectorList from "./ChildSectorList";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useUpdateSectorNodeMutation } from "@/redux/api/sectorNodeApi";
import { formatDate } from "@/utils/date";
import { PermissionGuard } from "@/components/auth/InlinePermissionGuard";
import { usePermissions } from "@/hooks/usePermissions";

export default function SectorNodeDetail() {
  const params = useParams();
  const router = useRouter();
  const id = params?.sectorId as string;
  const { check } = usePermissions();

  const { data: sector, isLoading, isError } = useGetSectorNodeByIdQuery(id, {
    skip: !id,
  });

  const head = sector?.head;

  // Modals state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [confirmRemoveHead, setConfirmRemoveHead] = useState(false);

  const [updateSectorNode, { isLoading: isRemovingHead }] = useUpdateSectorNodeMutation();

  const canViewChildren = useMemo(() => check({ anyPermissions: ["SECTOR:READ"] }), [check]);

  const handleRemoveHead = async () => {
    try {
      await updateSectorNode({ id, data: { head_id: null } }).unwrap();
      toast.success("Sector Head removed successfully");
      setConfirmRemoveHead(false);
    } catch (e: any) {
      toast.error(e?.data?.message || "Failed to remove head");
    }
  };

  const openAssignModal = () => setIsModalOpen(true);

  if (isLoading) return <Loading01 />;
  if (isError || !sector) return <div className="p-8 text-center text-red-500">Error loading sector details or sector not found.</div>;

  return (
    <div className="bg-gradient-to-b from-white via-slate-50 to-white relative overflow-hidden font-sans py-6 pb-24 flex flex-col items-start min-h-screen p-4 md:p-8 hover:bg-transparent">
      {/* Background Decor */}
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-blue-500/5 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-teal-500/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full mx-auto shadow-sm rounded-xl border border-[#BFD7EA] p-6 lg:p-8 relative overflow-hidden bg-white/80 backdrop-blur-sm z-10">

        {/* Header Navigation */}
        <div className="flex items-center gap-4 mb-6 pb-4 border-b border-[#DCE7F1]">
          <Button variant="outline" size="icon" onClick={() => router.push("/basedata/sectors")} className="shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <div>
            <h2 className="text-2xl font-bold text-golden-dark">Sector Detail: {sector.name}</h2>
            <p className="text-gray-500 text-sm">Review sector properties and manage child compartments</p>
          </div>
        </div>

        {/* Sector Properties Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-slate-50 border border-[#DCE7F1] rounded-lg p-4">
            <p className="font-semibold text-golden-dark text-sm mb-1">Status</p>
            <Badge status={sector.is_active ? "active" : "inactive"}>
              {sector.is_active ? "Active" : "Inactive"}
            </Badge>
          </div>

          <div className="bg-slate-50 border border-[#DCE7F1] rounded-lg p-4">
            <p className="font-semibold text-golden-dark text-sm mb-1">Hierarchy Level</p>
            <p className="text-gray-700 font-medium">Level {sector.level}</p>
          </div>

          <div className="bg-slate-50 border border-[#DCE7F1] rounded-lg p-4">
            <p className="font-semibold text-golden-dark text-sm mb-1">Created At</p>
            <p className="text-gray-700 font-medium">
              {formatDate(sector.created_at)}
            </p>
          </div>

          <div className="bg-slate-50 border border-[#DCE7F1] rounded-lg p-4">
            <p className="font-semibold text-golden-dark text-sm mb-1">Parent Node</p>
            {sector.parent_id ? (
              <Button
                variant="link"
                className="p-0 h-auto font-medium text-blue-600 truncate max-w-full block"
                onClick={() => router.push(`/basedata/sectors/${sector.parent_id}`)}
              >
                View Parent Sector
              </Button>
            ) : (
              <p className="text-gray-500 font-medium">Root Node (No Parent)</p>
            )}
          </div>
        </div>

        {/* Head Section - Only show if user has permission to view/manage heads */}
        <PermissionGuard requireAny={["SECTOR:UPDATE", "SECTOR_HEAD:DELEGATE"]}>
          <div className="bg-slate-50 border border-[#DCE7F1] rounded-lg p-5 mb-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-golden-dark mb-1">Sector Head</p>
              {head ? (
                <div className="flex flex-col">
                  <span className="font-medium text-lg text-primary">{head.full_name || "Unknown User"}</span>
                  <span className="text-sm text-gray-500">{head.email || "No email available"}</span>
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No head assigned for this sector.</p>
              )}
            </div>
            {!head ? (
              <PermissionGuard requireAll={["SECTOR_HEAD:DELEGATE"]}>
                <Button variant="default" className="shrink-0" onClick={openAssignModal}>
                  <UserPlus className="w-4 h-4 mr-2" />
                  Assign Head
                </Button>
              </PermissionGuard>
            ) : (
              <div className="flex items-center gap-2">
                <PermissionGuard requireAll={["SECTOR_HEAD:UPDATE"]}>
                  <Button variant="outline" size="sm" className="shrink-0" onClick={openAssignModal}>
                    <Edit className="w-4 h-4 mr-2" />
                    Change Head
                  </Button>
                </PermissionGuard>
                <PermissionGuard requireAll={["SECTOR:UPDATE"]}>
                  <Button variant="outline" size="sm" className="shrink-0 text-red-500 hover:text-red-600 border-red-200 hover:bg-red-50" onClick={() => setConfirmRemoveHead(true)}>
                    <Trash className="w-4 h-4 mr-2" />
                    Remove
                  </Button>
                </PermissionGuard>
              </div>
            )}
          </div>
        </PermissionGuard>

        {/* Description */}
        <div className="bg-slate-50 border border-[#DCE7F1] rounded-lg p-5 mb-10">
          <p className="font-semibold text-golden-dark mb-2">Sector Description</p>
          <p className="text-gray-600 whitespace-pre-line leading-relaxed">
            {sector.description || "No description provided for this sector."}
          </p>
        </div>

        {canViewChildren && (
          <div className="mt-8">
            <h3 className="mb-4 text-lg font-semibold text-golden-dark">
              Child Units ({sector?.children?.length || 0})
            </h3>
            <ChildSectorList />
          </div>
        )}

        <AssignSectorHeadModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          sectorNodeId={id}
        />

        {/* Remove Head Confirmation Modal */}
        <Dialog open={confirmRemoveHead} onOpenChange={setConfirmRemoveHead}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Remove Sector Head</DialogTitle>
              <DialogDescription>
                Are you sure you want to remove the current Sector Head? This sector will no longer have a designated leader.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setConfirmRemoveHead(false)} disabled={isRemovingHead}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleRemoveHead} disabled={isRemovingHead}>
                {isRemovingHead ? "Removing..." : "Remove Head"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </div>
  );
}