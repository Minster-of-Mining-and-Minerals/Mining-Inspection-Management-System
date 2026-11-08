// config/routes.ts
import { PermissionKey } from "@/lib/permissions";

export interface RouteConfig {
  path: string;
  permissions?: {
    anyPermissions?: PermissionKey[];
    allPermissions?: PermissionKey[];
    onlyPermissions?: PermissionKey[];
  };
}

export const routePermissions: RouteConfig[] = [
  {
    path: "/dashboard",
    permissions: {
      anyPermissions: ["DASHBOARD:VIEW"],
    },
  },
  {
    path: "/basedata",
    permissions: {
      allPermissions: ["SECTOR:READ"],
    },
  },
  {
    path: "/users/list",
    permissions: {
      allPermissions: ["USERS:READ"],
    },
  },
  {
    path: "/users/roles",
    permissions: {
      allPermissions: ["ROLES:READ"],
    },
  },
  {
    path: "/users/permissions",
    permissions: {
      allPermissions: ["PERMISSIONS:READ"],
    },
  },
];

// Helper to get permissions for a path (strips locale prefix, supports nested routes)
export function getPermissionsForPath(path: string) {
  const normalized = path.replace(/^\/(en|am)(?=\/|$)/, "") || "/";
  const route = routePermissions.find(
    (r) => normalized === r.path || normalized.startsWith(`${r.path}/`),
  );
  return route?.permissions;
}
