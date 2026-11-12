import { AlertTriangle, ClipboardCheck, Shield } from "lucide-react";
import type { ElementType } from "react";
import type { Notification } from "@/redux/types/notification";

/**
 * Notification types sent by the backend, grouped for the bell dropdown and
 * the notifications page. Unknown types fall into SYSTEM.
 */
export const NOTIFICATION_CATEGORY_MAP = {
  INSPECTION: [
    "INSPECTION_ASSIGNED",
    "INSPECTION_DUE_SOON",
    "INSPECTION_OVERDUE",
    "INSPECTION_SUBMITTED",
    "INSPECTION_RETURNED",
    "INSPECTION_APPROVED",
    "INSPECTION_OFFICE_UPDATED",
    "ROUND_STARTED",
    "TEAM_MEMBERSHIP_CHANGED",
  ],
  FINDING: ["FINDING_CREATED", "FINDING_DUE_SOON", "FINDING_CLOSED", "LOCATION_FLAGGED", "DEVICE_FLAGGED"],
  SYSTEM: ["SYSTEM_ALERT", "BROADCAST_MESSAGE"],
} as const;

export type NotificationCategory = keyof typeof NOTIFICATION_CATEGORY_MAP;

export const NOTIFICATION_CATEGORIES: { key: NotificationCategory; label: string; icon: ElementType }[] = [
  { key: "INSPECTION", label: "Inspections", icon: ClipboardCheck },
  { key: "FINDING", label: "Findings & Alerts", icon: AlertTriangle },
  { key: "SYSTEM", label: "System", icon: Shield },
];

export const matchesNotificationCategory = (category: NotificationCategory, type: string): boolean =>
  (NOTIFICATION_CATEGORY_MAP[category] as readonly string[]).includes(type);

export const getNotificationCategory = (type: string): NotificationCategory =>
  NOTIFICATION_CATEGORIES.find((c) => matchesNotificationCategory(c.key, type))?.key ?? "SYSTEM";

/** Page a notification should open, or null when it has nothing to link to. */
export const getNotificationLink = (n: Notification): string | null => {
  // Several tasks at once (new round, reminders): the task list
  if (n.related_entity_type === "tasks") return "/my-tasks";
  // About the person's own account (new sign-in, password changed): their profile
  if (n.related_entity_type === "account") return "/profile";
  if (!n.related_entity_id) return null;
  switch (n.related_entity_type) {
    case "inspection":
      return `/inspections/${n.related_entity_id}`;
    case "round":
      return `/rounds/${n.related_entity_id}`;
    case "finding":
      return `/findings?focus=${n.related_entity_id}`;
    case "team":
      return `/teams/${n.related_entity_id}`;
    default:
      return null;
  }
};
