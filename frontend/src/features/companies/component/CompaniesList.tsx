"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ColumnDef } from "@tanstack/react-table";
import { Eye, List, Map as MapIcon, Plus } from "lucide-react";
import { DataTable } from "@/features/template/component/tableList/DataTable";
import { TableLayout } from "@/features/template/component/tableList/TableLayout";
import Loading01 from "@/features/template/component/Loading/Loading01";
import { Button } from "@/components/ui/button";
import type { ActionButton, FilterField } from "@/types/tableLayout";
import { useGetCompaniesQuery, useGetCompanyStatsQuery, useGetMineralsQuery } from "@/redux/api/companyApi";
import { useGetAdminAreasQuery } from "@/redux/api/adminAreaApi";
import { usePermissions } from "@/hooks/usePermissions";
import {
  Company,
  LICENSE_STATUS_LABEL,
  LICENSE_TYPE_LABEL,
  LicenseStatus,
  LicenseType,
  regionsOf,
} from "@/redux/types/company";
import { CompanyDialog } from "./CompanyDialog";
import { CompaniesMap } from "./CompaniesMap";
import { useSectorFilter } from "@/components/common/SectorFilter";

const ALL = "all";
const pick = (v: string) => (v && v !== ALL ? v : undefined);

export default function CompaniesList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const search = (searchParams.get("search") || "").trim();
  const { check } = usePermissions();
  const canReadAreas = check({ allPermissions: ["ADMIN_AREAS:READ"] });

  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [regionId, setRegionId] = useState(ALL);
  const [mineralId, setMineralId] = useState(ALL);
  const [licenseType, setLicenseType] = useState(ALL);
  const [licenseStatus, setLicenseStatus] = useState(ALL);
  const [activeFilter, setActiveFilter] = useState(ALL);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<"table" | "map">("table");

  useEffect(() => setPageIndex(0), [search, regionId, mineralId, licenseType, licenseStatus, activeFilter]);

  const { data: stats } = useGetCompanyStatsQuery();
  const { data: minerals = [] } = useGetMineralsQuery({ is_active: true });
  const { data: regions } = useGetAdminAreasQuery({ level: "region", limit: 50 }, { skip: !canReadAreas });

  const { data, isLoading, isFetching, isError } = useGetCompaniesQuery({
    search: search || undefined,
    area_id: pick(regionId),
    mineral_id: pick(mineralId),
    license_type: pick(licenseType) as LicenseType | undefined,
    license_status: pick(licenseStatus) as LicenseStatus | undefined,
    is_active: activeFilter === "active" ? true : activeFilter === "inactive" ? false : undefined,
    page: pageIndex + 1,
    limit: pageSize,
  });

  const columns = useMemo<ColumnDef<Company>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Company",
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => router.push(`/companies/${row.original.company_id}`)}
            className="text-left font-semibold text-primary hover:underline"
          >
            {row.original.name}
            {row.original.name_am && (
              <span lang="am" className="block text-xs font-normal text-slate-500">
                {row.original.name_am}
              </span>
            )}
          </button>
        ),
      },
      {
        id: "licenses",
        header: "Licenses",
        cell: ({ row }) => {
          const ls = row.original.licenses;
          const exploration = ls.filter((l) => l.license_type === "exploration").length;
          const mining = ls.filter((l) => l.license_type === "mining").length;
          return (
            <div className="flex flex-wrap gap-1">
              {exploration > 0 && (
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">{exploration} exploration</span>
              )}
              {mining > 0 && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">{mining} mining</span>
              )}
              {ls.length === 0 && <span className="text-xs italic text-slate-400">none</span>}
            </div>
          );
        },
      },
      {
        id: "minerals",
        header: "Minerals",
        cell: ({ row }) => {
          const names = [...new Set(row.original.licenses.flatMap((l) => l.minerals.map((m) => m.name)))];
          return names.length ? (
            <span className="text-sm">{names.slice(0, 3).join(", ")}{names.length > 3 ? ` +${names.length - 3}` : ""}</span>
          ) : (
            <span className="text-xs italic text-slate-400">—</span>
          );
        },
      },
      {
        id: "regions",
        header: "Region",
        cell: ({ row }) => {
          const names = regionsOf(row.original.licenses);
          return names.length ? <span className="text-sm">{names.join(", ")}</span> : <span className="text-xs italic text-slate-400">—</span>;
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
        header: "",
        cell: ({ row }) => (
          <Button variant="ghost" size="icon" aria-label={`Open ${row.original.name}`} onClick={() => router.push(`/companies/${row.original.company_id}`)}>
            <Eye className="h-4 w-4" />
          </Button>
        ),
      },
    ],
    [router],
  );

  // Central admin: one sector or all
  const sectorField = useSectorFilter().field;
  const filters: FilterField[] = [
    ...(sectorField ? [sectorField] : []),
    ...(canReadAreas
      ? [
          {
            key: "region",
            label: "Region",
            type: "select" as const,
            value: regionId,
            onChange: setRegionId,
            options: [{ label: "All regions", value: ALL }, ...(regions?.data ?? []).map((r) => ({ label: r.name, value: r.area_id }))],
          },
        ]
      : []),
    {
      key: "mineral",
      label: "Mineral",
      type: "select",
      value: mineralId,
      onChange: setMineralId,
      options: [{ label: "All minerals", value: ALL }, ...minerals.map((m) => ({ label: m.name, value: m.mineral_id }))],
    },
    {
      key: "type",
      label: "License type",
      type: "select",
      value: licenseType,
      onChange: setLicenseType,
      options: [{ label: "All types", value: ALL }, ...Object.entries(LICENSE_TYPE_LABEL).map(([value, label]) => ({ label, value }))],
    },
    {
      key: "license_status",
      label: "License status",
      type: "select",
      value: licenseStatus,
      onChange: setLicenseStatus,
      options: [{ label: "Any status", value: ALL }, ...Object.entries(LICENSE_STATUS_LABEL).map(([value, label]) => ({ label, value }))],
    },
    {
      key: "company_status",
      label: "Company",
      type: "select",
      value: activeFilter,
      onChange: setActiveFilter,
      options: [
        { label: "All companies", value: ALL },
        { label: "Active", value: "active" },
        { label: "Inactive", value: "inactive" },
      ],
    },
  ];

  const actions: ActionButton[] = [
    {
      label: "New company",
      icon: <Plus className="h-4 w-4" />,
      variant: "default",
      onClick: () => setCreating(true),
      permissions: ["COMPANIES:CREATE"],
    },
  ];

  if (isLoading && !data) return <Loading01 />;

  const statCards = [
    { label: "Companies", value: stats?.companies },
    { label: "Licenses", value: stats?.licenses },
    { label: "Exploration", value: stats?.exploration },
    { label: "Mining", value: stats?.mining },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Companies</h1>
          <p className="text-sm text-slate-500">Licensed exploration and mining companies. Search by company name, TIN or license number.</p>
        </div>
        <div role="group" aria-label="View" className="flex rounded-lg border border-slate-300 bg-white p-1">
          {(
            [
              ["table", "Table", List],
              ["map", "Map", MapIcon],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              aria-pressed={view === key}
              onClick={() => setView(key)}
              className={`flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-semibold ${view === key ? "bg-primary text-white" : "text-primary hover:bg-slate-100"}`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {statCards.map((s) => (
          <div key={s.label} className="rounded-xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-xs font-medium text-slate-500">{s.label}</p>
            <p className="text-2xl font-bold tabular-nums text-primary">{s.value?.toLocaleString() ?? "—"}</p>
          </div>
        ))}
      </div>

      <TableLayout actions={actions} filters={filters} filterColumnsPerRow={1}>
        {view === "map" ? (
          <CompaniesMap
            regionId={pick(regionId)}
            base={{
              search: search || undefined,
              area_id: pick(regionId),
              mineral_id: pick(mineralId),
              license_type: pick(licenseType) as LicenseType | undefined,
              license_status: pick(licenseStatus) as LicenseStatus | undefined,
              is_active: activeFilter === "active" ? true : activeFilter === "inactive" ? false : undefined,
            }}
          />
        ) : isError ? (
          <div className="py-10 text-center text-red-600">Could not load companies.</div>
        ) : (
          <div className={isFetching ? "opacity-60 transition-opacity" : ""}>
            <DataTable
              columns={columns}
              data={data?.data ?? []}
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

      <CompanyDialog open={creating} company={null} onClose={() => setCreating(false)} />
    </div>
  );
}
