"use client";

import { DashboardFilterBar, useDashboardFilters } from "./DashboardFilters";
import SubmissionMapPanel from "./SubmissionMapPanel";

/** Where inspections were submitted: map, and the list of submissions with place and device. */
export default function SubmissionMapPage() {
  const filters = useDashboardFilters();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-primary">Submission map</h1>
        <p className="text-sm text-slate-500">Where each inspection was submitted, by whom, on what device and when.</p>
      </div>
      <DashboardFilterBar state={filters} />
      <SubmissionMapPanel base={filters.base} />
    </div>
  );
}
