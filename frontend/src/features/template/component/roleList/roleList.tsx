"use client";

import { useState } from "react";
import { DataTable } from "@/features/template/component/tableList/DataTable";
import { TableLayout } from "@/features/template/component/tableList/TableLayout";
import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, Plus, Eye } from "lucide-react";

import { useGetRolesQuery } from "@/redux/api/roleApi";
import type { Role } from "@/redux/types/auth";
import type { FilterField, ActionButton } from "@/types/tableLayout";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { usePermissions } from "@/hooks/usePermissions";
import { localizedName } from "@/utils/localizedName";
import { CopyRoleButton } from "./CopyRoleButton";
import { useSectorFilter } from "@/components/common/SectorFilter";

const columns: ColumnDef<Role>[] = [
  {
    accessorKey: "name",
    header: "Role Name",
    cell: ({ row }) => (
      <span className="font-medium text-primary">{row.getValue("name")}</span>
    ),
  },
  {
    accessorKey: "description",
    header: "Description",
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
];

/** Global roles are shared by every sector; sector roles belong to one sector. */
const sectorColumn = (locale: string): ColumnDef<Role> => ({
  id: "sector",
  header: "Used by",
  cell: ({ row }) =>
    row.original.sector_node_id ? (
      <span className="text-sm text-primary">
        {localizedName(row.original.sector, locale) || "Sector"}
        {row.original.copiedFrom && <span className="block text-xs text-slate-500">Copy of {row.original.copiedFrom.name}</span>}
      </span>
    ) : (
      <Badge status="outline" className="border-slate-300 text-primary">All sectors (global)</Badge>
    ),
});

const getColumns = (onView: (role: Role) => void, locale: string, canCopy: boolean): ColumnDef<Role>[] => [
  columns[0],
  sectorColumn(locale),
  ...columns.slice(1),
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => (
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => onView(row.original)}
        >
          <Eye className="h-4 w-4" />
          View
        </Button>
        {/* Copy into a sector to change it there (only roles the user could give out) */}
        {canCopy && row.original.can_assign !== false && <CopyRoleButton role={row.original} />}
      </div>
    ),
  },
];

export default function RoleList() {
  const { data = [], isLoading, isError, refetch } = useGetRolesQuery();
  const router = useRouter();
  const locale = useLocale();
  const { can } = usePermissions();
  // Pagination states
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const handlePagination = (index: number, size: number) => {
    setPageIndex(index);
    setPageSize(size);
  };

  // Filters
  const [statusFilter, setStatusFilter] = useState("");
  // Central admin: global roles plus one sector's own roles, or every sector's
  const sectorField = useSectorFilter().field;

  const filters: FilterField[] = [
    ...(sectorField ? [sectorField] : []),
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

  // Actions
  const actions: ActionButton[] = [
    {
      label: "Export",
      icon: <Download className="h-4 w-4" />,
      variant: "outline",
      onClick: () => console.log("Export clicked"),
      permissions: ["DATA:EXPORT"],
    },
    {
      label: "New Role",
      icon: <Plus className="h-4 w-4" />,
      variant: "default",
      onClick: () => router.push("roles/new"),
      permissions: ["ROLES:CREATE"],
    },
  ];

  // Apply filters locally (client-side)
  const filteredData = data.filter((role) => {
    if (statusFilter === "active") return role.is_active === true;
    if (statusFilter === "inactive") return role.is_active === false;
    return true;
  });

  // Pagination slice
  const paginatedData = filteredData.slice(
    pageIndex * pageSize,
    pageIndex * pageSize + pageSize
  );

  return (
    <TableLayout
      title="Role Management"
      description="View and manage user roles"
      actions={actions}
      filters={filters}
      filterColumnsPerRow={2}
    >
      <DataTable
        columns={getColumns((role) => router.push(`/users/roles/${role.role_id}`), locale, can("ROLES:CREATE"))}
        data={paginatedData}
        totalPageCount={Math.ceil(filteredData.length / pageSize)}
        handlePagination={handlePagination}
        tablePageSize={pageSize}
        currentIndex={pageIndex}
      />
    </TableLayout>
  );
}
