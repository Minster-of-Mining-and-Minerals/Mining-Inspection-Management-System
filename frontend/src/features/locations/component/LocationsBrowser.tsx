"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { ChevronRight, Edit, Eye, Globe2, Plus } from "lucide-react";
import { DataTable } from "@/features/template/component/tableList/DataTable";
import { TableLayout } from "@/features/template/component/tableList/TableLayout";
import Loading01 from "@/features/template/component/Loading/Loading01";
import { Button } from "@/components/ui/button";
import type { ActionButton, FilterField } from "@/types/tableLayout";
import { usePermissions } from "@/hooks/usePermissions";
import { useGetAdminAreaByIdQuery, useGetAdminAreasQuery, useGetAdminAreaStatsQuery } from "@/redux/api/adminAreaApi";
import { AdminArea, CHILD_LEVEL, LEVEL_LABEL } from "@/redux/types/adminArea";
import { EditAreaDialog } from "./EditAreaDialog";
import { AddAreaDialog } from "./AddAreaDialog";

/**
 * Base Data → Locations: browse Region → Zone → Woreda, search the whole
 * country (names, Amharic names, codes and saved spellings), edit and add.
 * The open area is kept in the URL (?area=<id>) so the back button works.
 */
export default function LocationsBrowser() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const areaId = searchParams.get("area") || "";
  const search = (searchParams.get("search") || "").trim();

  const { check } = usePermissions();
  const canEdit = check({ allPermissions: ["ADMIN_AREAS:UPDATE"] });

  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [statusFilter, setStatusFilter] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => setPageIndex(0), [areaId, search, statusFilter]);

  const { data: stats } = useGetAdminAreaStatsQuery();
  const { data: current, isFetching: currentLoading } = useGetAdminAreaByIdQuery(areaId, { skip: !areaId });

  // What the list shows: the children of the open area, or everything matching the search
  const listLevel = current ? CHILD_LEVEL[current.level] : "region";
  const isActive = statusFilter === "active" ? true : statusFilter === "inactive" ? false : undefined;
  const { data, isLoading, isFetching, isError } = useGetAdminAreasQuery(
    search
      ? { search, is_active: isActive, page: pageIndex + 1, limit: pageSize }
      : { parent_id: areaId || "null", is_active: isActive, page: pageIndex + 1, limit: pageSize },
    { skip: !!areaId && !current && !search },
  );
  const rows = data?.data ?? [];

  const goTo = (id: string | null) => {
    const params = new URLSearchParams();
    if (id) params.set("area", id);
    router.push(`${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
  };

  const columns = useMemo<ColumnDef<AdminArea>[]>(() => {
    const cols: ColumnDef<AdminArea>[] = [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => {
          const a = row.original;
          const hasChildren = (a.child_count ?? 0) > 0;
          return hasChildren ? (
            <button
              type="button"
              onClick={() => goTo(a.area_id)}
              className="group inline-flex items-center gap-1 text-left font-semibold text-primary hover:underline"
            >
              {a.name}
              <ChevronRight className="h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" />
            </button>
          ) : (
            <span className="font-semibold text-primary">{a.name}</span>
          );
        },
      },
      {
        id: "name_am",
        header: "ስም (አማርኛ)",
        cell: ({ row }) =>
          row.original.name_am ? (
            <span lang="am">{row.original.name_am}</span>
          ) : (
            <span className="text-sm italic text-slate-400">—</span>
          ),
      },
    ];

    if (search) {
      cols.push(
        {
          id: "level",
          header: "Level",
          cell: ({ row }) => <span className="text-sm">{LEVEL_LABEL[row.original.level].one}</span>,
        },
        {
          id: "in",
          header: "In",
          cell: ({ row }) => {
            const p = row.original.parent;
            if (!p) return <span className="text-sm text-slate-400">—</span>;
            return (
              <span className="text-sm text-slate-600">
                {p.name}
                {p.parent ? <span className="text-slate-400"> › {p.parent.name}</span> : null}
              </span>
            );
          },
        },
      );
    }

    cols.push(
      {
        id: "pcode",
        header: "Code",
        cell: ({ row }) => <span className="font-mono text-xs text-slate-500">{row.original.pcode ?? "added by hand"}</span>,
      },
      {
        id: "children",
        header: "Contains",
        cell: ({ row }) => {
          const childLevel = CHILD_LEVEL[row.original.level];
          if (!childLevel) return <span className="text-sm text-slate-400">—</span>;
          const n = row.original.child_count ?? 0;
          return (
            <span className="text-sm tabular-nums">
              {n} {n === 1 ? LEVEL_LABEL[childLevel].one.toLowerCase() : LEVEL_LABEL[childLevel].many.toLowerCase()}
            </span>
          );
        },
      },
      {
        accessorKey: "is_active",
        header: "Status",
        cell: ({ row }) => {
          const active = row.original.is_active;
          return (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${active ? "bg-green-100 text-green-800" : "bg-slate-100 text-slate-600"}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${active ? "bg-green-600" : "bg-slate-400"}`} />
              {active ? "Active" : "Inactive"}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon"
            aria-label={canEdit ? `Edit ${row.original.name}` : `View ${row.original.name}`}
            onClick={() => setEditingId(row.original.area_id)}
          >
            {canEdit ? <Edit className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </Button>
        ),
      },
    );
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, canEdit]);

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

  const actions: ActionButton[] =
    !search && listLevel
      ? [
          {
            label: `Add ${LEVEL_LABEL[listLevel].one.toLowerCase()}`,
            icon: <Plus className="h-4 w-4" />,
            variant: "default",
            onClick: () => setAdding(true),
            permissions: ["ADMIN_AREAS:CREATE"],
          },
        ]
      : [];

  if (isLoading && !data) return <Loading01 />;

  const statCards = [
    { label: "Regions", value: stats?.region },
    { label: "Zones", value: stats?.zone },
    { label: "Woredas", value: stats?.woreda },
    { label: "Saved spellings", value: stats?.aliases },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary">Locations</h1>
        <p className="text-sm text-slate-500">
          Ethiopia&apos;s regions, zones and woredas from the official list (OCHA COD-AB, CSA + Regional BoFED). Used for
          company locations, dashboard filters and checking where inspections were done.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs font-medium text-slate-500">{s.label}</p>
            <p className="text-2xl font-bold tabular-nums text-primary">{s.value?.toLocaleString() ?? "—"}</p>
          </div>
        ))}
      </div>

      {/* Where am I: Ethiopia › Region › Zone */}
      {!search && (
        <nav aria-label="Location path" className="flex flex-wrap items-center gap-1 text-sm">
          <button
            type="button"
            onClick={() => goTo(null)}
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 ${areaId ? "text-primary hover:bg-primary/5" : "font-semibold text-slate-900"}`}
          >
            <Globe2 className="h-4 w-4" /> Ethiopia
          </button>
          {current?.ancestors.map((a) => (
            <span key={a.area_id} className="inline-flex items-center gap-1">
              <ChevronRight className="h-4 w-4 text-slate-300" />
              <button type="button" onClick={() => goTo(a.area_id)} className="rounded px-1.5 py-0.5 text-primary hover:bg-primary/5">
                {a.name}
              </button>
            </span>
          ))}
          {current && (
            <span className="inline-flex items-center gap-1">
              <ChevronRight className="h-4 w-4 text-slate-300" />
              <span className="px-1.5 py-0.5 font-semibold text-slate-900">{current.name}</span>
            </span>
          )}
          {listLevel && (
            <span className="ml-2 text-slate-500">
              · {data?.meta?.totalItems ?? 0} {LEVEL_LABEL[listLevel].many.toLowerCase()}
            </span>
          )}
        </nav>
      )}
      {search && (
        <p className="text-sm text-slate-600">
          {data?.meta?.totalItems ?? 0} result{data?.meta?.totalItems === 1 ? "" : "s"} for “{search}” across the whole
          country (names, Amharic names, codes and saved spellings).
        </p>
      )}

      <TableLayout actions={actions} filters={filters} filterColumnsPerRow={1}>
        {isError ? (
          <div className="py-10 text-center text-red-600">Could not load locations.</div>
        ) : (
          <div className={isFetching || currentLoading ? "opacity-60 transition-opacity" : ""}>
            <DataTable
              columns={columns}
              data={rows}
              totalPageCount={data?.meta?.totalPages ?? 0}
              handlePagination={(index, size) => {
                setPageIndex(index);
                setPageSize(size);
              }}
              tablePageSize={pageSize}
              currentIndex={pageIndex}
            />
          </div>
        )}
      </TableLayout>

      <EditAreaDialog areaId={editingId} canEdit={canEdit} onClose={() => setEditingId(null)} />
      {listLevel && (
        <AddAreaDialog
          open={adding}
          level={listLevel}
          parent={current ? { area_id: current.area_id, name: current.name } : null}
          onClose={() => setAdding(false)}
        />
      )}
    </div>
  );
}
