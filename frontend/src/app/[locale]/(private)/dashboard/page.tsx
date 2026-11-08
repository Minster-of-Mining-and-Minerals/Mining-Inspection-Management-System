"use client";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { useSession } from "next-auth/react";
import { usePermissions } from "@/hooks/usePermissions";
import TeamDashboard from "@/features/my-work/component/TeamDashboard";
import DirectorDashboard from "@/features/dashboard/component/DirectorDashboard";

/** Staff dashboard. Charts and totals come with the dashboard step; the submission map is first. */
function Dashboard() {
  const { data: session } = useSession();
  const { check } = usePermissions();
  const canSeeInspections = check({ allPermissions: ["INSPECTIONS:READ_ALL"] });

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-primary">Dashboard</h1>
        <p className="text-sm text-slate-500">Welcome{session?.user?.name ? `, ${session.user.name}` : ""}.</p>
      </div>
      {canSeeInspections ? (
        <DirectorDashboard />
      ) : (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">Inspection statistics will appear here.</p>
      )}
    </main>
  );
}

/** Staff (dashboard:view) see the overall dashboard; field teams see their team's progress. */
export default function DashboardPage() {
  const { check } = usePermissions();
  const staff = check({ anyPermissions: ["DASHBOARD:VIEW"] });
  return (
    <PermissionGuard anyPermissions={["DASHBOARD:VIEW", "INSPECTIONS:CONDUCT", "INSPECTIONS:READ_OWN"]} redirectTo="/my-tasks">
      {staff ? <Dashboard /> : <TeamDashboard />}
    </PermissionGuard>
  );
}
