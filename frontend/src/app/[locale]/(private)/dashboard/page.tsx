"use client";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import { useSession } from "next-auth/react";
import { Building2, ClipboardCheck, MapPin, Users } from "lucide-react";

// Placeholder until the inspection dashboard is built (plan step 7).
const AREAS = [
  { icon: Building2, title: "Companies", text: "Licensed companies, inspection coverage by region and mineral." },
  { icon: Users, title: "Teams", text: "Progress of each inspection team in the current round." },
  { icon: ClipboardCheck, title: "Compliance", text: "Checklist scores by section, findings and corrective actions." },
  { icon: MapPin, title: "Location integrity", text: "On-site check-ins, flagged locations and unknown devices." },
];

function Dashboard() {
  const { data: session } = useSession();

  return (
    <main className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-primary">Dashboard</h1>
        <p className="text-sm text-slate-500">
          Welcome{session?.user?.name ? `, ${session.user.name}` : ""}. Inspection statistics will appear here once
          companies, teams and inspection rounds are set up.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {AREAS.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-xl border border-slate-200 bg-white p-5">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </span>
            <h2 className="mt-3 font-semibold text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-500">{text}</p>
          </div>
        ))}
      </div>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <PermissionGuard anyPermissions={["DASHBOARD:VIEW"]}>
      <Dashboard />
    </PermissionGuard>
  );
}
