export interface Notification {
  notification_id: string;
  recipient_id: string;
  recipient_type: "internal" | "external";
  type: string;
  title: string;
  message: string;
  related_entity_type: "inspection" | "round" | "finding" | "team" | "tasks" | "account" | null;
  related_entity_id: string | null;
  is_read: boolean;
  created_at: string;
  updated_at: string;
}

export interface MarkAsReadResponse {
  success: boolean;
  message: string;
}

export interface GetNotificationsResponse {
  success: boolean;
  data: Notification[];
}
