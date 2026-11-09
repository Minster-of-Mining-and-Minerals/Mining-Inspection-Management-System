import { PermissionKey } from "@/lib/permissions";
import {
  LayoutDashboard,
  FileText,
  User2,
  Shield,
  Key,
  Building2,
  MapPin,
  Factory,
  Gem,
  Tags,
  UsersRound,
  ClipboardList,
  ClipboardCheck,
  CalendarClock,
} from "lucide-react";

export type NavItem = {
  title: string;
  url: string;
  icon: any;
  /** Sidebar group heading for top-level items (consecutive items with the same section share one heading) */
  section?: string;
  anyPermissions?: PermissionKey[];
  /** Hidden for users with any of these (e.g. the field-team pages for staff who see everything) */
  hideIfAnyPermissions?: PermissionKey[];
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
    // Field teams get their team's progress here
    anyPermissions: ["DASHBOARD:VIEW", "INSPECTIONS:CONDUCT", "INSPECTIONS:READ_OWN"],
  },
  {
    title: "Submission Map",
    url: "/submission-map",
    icon: MapPin,
    section: "Overview",
    allPermissions: ["DASHBOARD:VIEW", "INSPECTIONS:READ_ALL"],
  },
  {
    title: "Companies",
    url: "/companies",
    icon: Factory,
    section: "Registry",
    anyPermissions: ["COMPANIES:READ"],
  },
  {
    title: "Teams",
    url: "/teams",
    icon: UsersRound,
    section: "Registry",
    anyPermissions: ["TEAMS:READ"],
  },
  // ---- Field teams: their own work only ----
  {
    title: "My Tasks",
    url: "/my-tasks",
    icon: ClipboardCheck,
    section: "My work",
    anyPermissions: ["INSPECTIONS:CONDUCT"],
    hideIfAnyPermissions: ["INSPECTIONS:READ_ALL"],
  },
  {
    title: "My Team",
    url: "/my-team",
    icon: UsersRound,
    section: "My work",
    anyPermissions: ["INSPECTIONS:CONDUCT", "INSPECTIONS:READ_OWN"],
    hideIfAnyPermissions: ["INSPECTIONS:READ_ALL"],
  },
  {
    title: "My Companies",
    url: "/my-companies",
    icon: Factory,
    section: "My work",
    anyPermissions: ["INSPECTIONS:CONDUCT", "INSPECTIONS:READ_OWN"],
    hideIfAnyPermissions: ["INSPECTIONS:READ_ALL"],
  },
  {
    title: "Inspections",
    url: "/inspections",
    icon: ClipboardCheck,
    section: "Inspections",
    anyPermissions: ["INSPECTIONS:READ_ALL"],
  },
  {
    title: "Schedules",
    url: "/schedules",
    icon: CalendarClock,
    section: "Inspections",
    anyPermissions: ["ROUNDS:READ"],
  },
  {
    title: "Checklists",
    url: "/forms",
    icon: ClipboardList,
    section: "Inspections",
    anyPermissions: ["FORMS:READ"],
  },
  {
    title: "Base Data",
    section: "Administration",
    url: "/basedata",
    icon: FileText,
    // Shown if the user can see either section; each child is filtered by its own permission
    anyPermissions: ["SECTOR:READ", "ADMIN_AREAS:READ", "MINERALS:READ", "MINERALS:UPDATE"],
    children: [
      {
        title: "Minerals",
        url: "/basedata/minerals",
        icon: Gem,
        anyPermissions: ["MINERALS:READ", "MINERALS:UPDATE"],
      },
      {
        title: "Mineral Categories",
        url: "/basedata/mineral-categories",
        icon: Tags,
        anyPermissions: ["MINERALS:READ", "MINERALS:UPDATE"],
      },
      {
        title: "Locations",
        url: "/basedata/locations",
        icon: MapPin,
        allPermissions: ["ADMIN_AREAS:READ"],
      },
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
