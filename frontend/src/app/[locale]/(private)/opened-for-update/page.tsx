"use client";

import { Suspense } from "react";
import { PermissionGuard } from "@/components/auth/PermissionGuard";
import OpenedForUpdate from "@/features/inspections/component/OpenedForUpdate";
import Loading01 from "@/features/template/component/Loading/Loading01";

export default function Page() {
  return (
    <PermissionGuard anyPermissions={["INSPECTIONS:REVIEW", "INSPECTIONS:READ_ALL"]}>
      <Suspense fallback={<Loading01 />}>
        <OpenedForUpdate />
      </Suspense>
    </PermissionGuard>
  );
}
