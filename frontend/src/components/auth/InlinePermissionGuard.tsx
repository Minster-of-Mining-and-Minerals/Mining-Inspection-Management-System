"use client";

import React from "react";
import { PermissionKey } from "@/lib/permissions"; // your normalized permission type
import { usePermissions } from "@/hooks/usePermissions";

interface PermissionGuardProps {
    children: React.ReactNode;
    /**
     * User must have **all** these permissions to see the component
     */
    requireAll?: PermissionKey[];
    /**
     * User must have **at least one** of these permissions to see the component
     */
    requireAny?: PermissionKey[];
    fallback?: React.ReactNode; // optional component to show if permission denied
}

export const PermissionGuard: React.FC<PermissionGuardProps> = ({
    children,
    requireAll,
    requireAny,
    fallback = null,
}) => {
    const { check, isLoading } = usePermissions();

    if (isLoading) return null; // or a loading spinner

    let canAccess = true;

    if (requireAll && requireAll.length > 0) {
        canAccess = check({ allPermissions: requireAll });
    }

    if (requireAny && requireAny.length > 0) {
        canAccess = canAccess && check({ anyPermissions: requireAny });
    }

    return <>{canAccess ? children : fallback}</>;
};



// usage
{/* <PermissionGuard requireAll={["DASHBOARD:VIEW"]} fallback={<p>No access</p>}>
  <button>Open Dashboard</button>
</PermissionGuard> */}
