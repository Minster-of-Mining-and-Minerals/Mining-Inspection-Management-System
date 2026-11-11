"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useGetSectorNodeByIdQuery } from "@/redux/api/sectorNodeApi";
import { Badge } from "@/components/ui/badge";
import { DataTable } from "@/features/template/component/tableList/DataTable";
import { TableLayout } from "@/features/template/component/tableList/TableLayout";
import { ColumnDef } from "@tanstack/react-table";
import { SectorNode } from "@/redux/types/sectorNode";
import Loading01 from "@/features/template/component/Loading/Loading01";
import { Button } from "@/components/ui/button";
import { Eye, Edit, Trash, Plus } from "lucide-react";
import { ActionButton, FilterField } from "@/types/tableLayout";
import { CreateSectorModal } from "@/components/common/modals/CreateSectorModal";
import { PermissionGuard } from "@/components/auth/InlinePermissionGuard";

export default function ChildSectorList() {
    const params = useParams();
    const router = useRouter();
    const id = params?.sectorId as string;

    const { data: sector, isLoading, isError } = useGetSectorNodeByIdQuery(id, {
        skip: !id,
    });

    const [isModalOpen, setModalOpen] = useState(false);
    // Pagination for children table
    const [pageIndex, setPageIndex] = useState(0);
    const [pageSize, setPageSize] = useState(10);

    if (isLoading) return <Loading01 />;
    if (isError || !sector) return <div className="p-8 text-center text-red-500">Error loading sector details or sector not found.</div>;

    const childrenData = sector.children || [];
    const paginatedChildren = childrenData.slice(
        pageIndex * pageSize,
        pageIndex * pageSize + pageSize
    );

    const handlePagination = (index: number, size: number) => {
        setPageIndex(index);
        setPageSize(size);
    };

    const columns: ColumnDef<SectorNode>[] = [
        {
            accessorKey: "name",
            header: "Name",
            cell: ({ row }) => (
                <span className="font-medium text-primary">
                    {row.getValue("name")}
                </span>
            ),
        },
        {
            accessorKey: "description",
            header: "Description",
            cell: ({ row }) => (
                <div className="max-w-[300px] truncate text-muted-foreground">
                    {row.getValue("description") || "—"}
                </div>
            ),
        },
        {
            accessorKey: "is_active",
            header: "Status",
            cell: ({ row }) => {
                const isActive = row.getValue("is_active") as boolean;
                return (
                    <Badge status={isActive ? "active" : "inactive"}>
                        {isActive ? "Active" : "Inactive"}
                    </Badge>
                );
            },
        },
        {
            id: "actions",
            header: "Actions",
            cell: ({ row }) => (
                <div className="flex items-center gap-1">
                    <PermissionGuard
                        requireAll={["SECTOR:READ"]}
                    >
                        <Button
                            onClick={() => router.push(`/basedata/sectors/${row.original.sector_node_id}`)}
                            variant="ghost"
                            size="icon"
                        >
                            <Eye className="h-4 w-4" />
                        </Button>
                    </PermissionGuard>
                    <PermissionGuard
                        requireAll={["SECTOR:UPDATE"]}
                    >
                        <Button variant="ghost" size="icon">
                            <Edit className="h-4 w-4" />
                        </Button>
                    </PermissionGuard>
                    <PermissionGuard
                        requireAll={["SECTOR:DELETE"]}
                    >
                        <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600">
                            <Trash className="h-4 w-4" />
                        </Button>
                    </PermissionGuard>
                </div>
            ),
        },
    ];


    const [statusFilter, setStatusFilter] = useState("");

    const filters: FilterField[] = [
        {
            key: "status",
            label: "Status",
            type: "multiselect",
            placeholder: "Select status",
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
                { label: "Active", value: "active" },
                { label: "Inactive", value: "inactive" },
            ],
        },
    ];

    // Actions: sectors are flat, so new sectors are only added under the top level
    const actions: ActionButton[] = sector.parent_id
        ? []
        : [
              {
                  label: "New Sector",
                  icon: <Plus className="h-4 w-4" />,
                  variant: "default",
                  onClick: () => setModalOpen(true),
                  permissions: ["SECTOR:CREATE"],
              },
          ];



    return (
        <>
            <TableLayout
                actions={actions}
                filters={filters}
                filterColumnsPerRow={1}
            >
                <DataTable
                    columns={columns}
                    data={paginatedChildren}
                    totalPageCount={Math.ceil(childrenData.length / pageSize)}
                    handlePagination={handlePagination}
                    tablePageSize={pageSize}
                    currentIndex={pageIndex}
                />
            </TableLayout>
            <CreateSectorModal
                parent_sector_node_id={id}
                isOpen={isModalOpen}
                onClose={() => setModalOpen(false)}
            />
        </>

    );
}
