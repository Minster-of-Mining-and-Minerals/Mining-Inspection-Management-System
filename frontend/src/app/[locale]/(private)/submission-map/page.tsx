"use client";

import { PermissionGuard } from "@/components/auth/PermissionGuard";
import SubmissionMapPage from "@/features/dashboard/component/SubmissionMapPage";

export default function Page() {
  return (
    <PermissionGuard allPermissions={["DASHBOARD:VIEW", "INSPECTIONS:READ_ALL"]}>
      <SubmissionMapPage />
    </PermissionGuard>
  );
}
