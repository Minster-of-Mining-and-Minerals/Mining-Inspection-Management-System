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
      anyPermissions: ["DASHBOARD:VIEW", "INSPECTIONS:CONDUCT", "INSPECTIONS:READ_OWN"],
    },
  },
  // Most specific first: the first matching path wins
  {
    path: "/submission-map",
    permissions: { allPermissions: ["DASHBOARD:VIEW", "INSPECTIONS:READ_ALL"] },
  },
  {
    path: "/audit-log",
    permissions: { allPermissions: ["AUDIT:READ"] },
  },
  {
    path: "/my-team",
    permissions: { anyPermissions: ["INSPECTIONS:CONDUCT", "INSPECTIONS:READ_OWN"] },
  },
  {
    path: "/my-companies",
    permissions: { anyPermissions: ["INSPECTIONS:CONDUCT", "INSPECTIONS:READ_OWN"] },
  },
  {
    path: "/my-tasks",
    permissions: {
      anyPermissions: ["INSPECTIONS:CONDUCT", "INSPECTIONS:READ_OWN"],
    },
  },
  {
    path: "/schedules",
    permissions: {
      anyPermissions: ["ROUNDS:READ"],
    },
  },
  {
    path: "/inspections",
    permissions: {
      anyPermissions: ["INSPECTIONS:READ_ALL", "INSPECTIONS:READ_OWN"],
    },
  },
  {
    path: "/forms",
    permissions: {
      anyPermissions: ["FORMS:READ"],
    },
  },
  {
    path: "/teams",
    permissions: {
      anyPermissions: ["TEAMS:READ"],
    },
  },
  {
    path: "/companies",
    permissions: {
      anyPermissions: ["COMPANIES:READ"],
    },
  },
  {
    path: "/basedata/mineral-categories",
    permissions: {
      anyPermissions: ["MINERALS:READ", "MINERALS:UPDATE"],
    },
  },
  {
    path: "/basedata/minerals",
    permissions: {
      anyPermissions: ["MINERALS:READ", "MINERALS:UPDATE"],
    },
  },
  {
    path: "/basedata/locations",
    permissions: {
      allPermissions: ["ADMIN_AREAS:READ"],
    },
  },
  {
    path: "/basedata/sectors",
    permissions: {
      allPermissions: ["SECTOR:READ"],
    },
  },
  {
    path: "/basedata",
    permissions: {
      anyPermissions: ["SECTOR:READ", "ADMIN_AREAS:READ", "MINERALS:READ", "MINERALS:UPDATE"],
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
