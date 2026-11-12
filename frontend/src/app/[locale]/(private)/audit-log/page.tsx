"use client";

import { PermissionGuard } from "@/components/auth/PermissionGuard";
import AuditLog from "@/features/audit/component/AuditLog";

export default function Page() {
  return (
    <PermissionGuard allPermissions={["AUDIT:READ"]}>
      <AuditLog />
    </PermissionGuard>
  );
}
