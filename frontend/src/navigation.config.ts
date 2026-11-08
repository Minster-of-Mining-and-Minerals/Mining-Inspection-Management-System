import { PermissionKey } from "@/lib/permissions";
import {
  LayoutDashboard,
  FileText,
  User2,
  Shield,
  Key,
  Building2,
} from "lucide-react";

export type NavItem = {
  title: string;
  url: string;
  icon: any;
  /** Sidebar group heading for top-level items (consecutive items with the same section share one heading) */
  section?: string;
  anyPermissions?: PermissionKey[];
  allPermissions?: PermissionKey[];
  onlyPermissions?: PermissionKey[];
  children?: NavItem[];
};

export const NAVIGATION: NavItem[] = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
    section: "Overview",
    anyPermissions: ["DASHBOARD:VIEW"],
  },
  {
    title: "Base Data",
    section: "Administration",
    url: "/basedata",
    icon: FileText,
    // Shown if the user can see either section; each child is filtered by its own permission
    anyPermissions: ["SECTOR:READ"],
    children: [
      {
        title: "Organization",
        url: "/basedata/sectors",
        icon: Building2,
        allPermissions: ["SECTOR:READ"],
      },
    ],
  },
  {
    title: "Users",
    url: "/users",
    icon: User2,
    section: "Administration",
    anyPermissions: ["USERS:READ", "ROLES:READ", "PERMISSIONS:READ"],
    children: [
      {
        title: "Users List",
        url: "/users/list",
        icon: User2,
        allPermissions: ["USERS:READ"],
      },
      {
        title: "Role Management",
        url: "/users/roles",
        icon: Shield,
        allPermissions: ["ROLES:READ"],
      },
      {
        title: "Permission Management",
        url: "/users/permissions",
        icon: Key,
        allPermissions: ["PERMISSIONS:READ"],
      },
    ],
  },
];
