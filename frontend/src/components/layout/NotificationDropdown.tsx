"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
    Bell,
    CheckCircle,
    AlertCircle,
    AlertTriangle,
    ClipboardCheck,
    CheckCheck,
    Shield,
    ChevronRight,
} from "lucide-react";
import { DropdownItem } from "../ui/DropdownItem";
import { useSession } from "next-auth/react";
import { Dropdown } from "../ui/Dropdown";

import {
  useGetMyNotificationsQuery,
  useMarkAsReadMutation,
  useMarkAllAsReadMutation,
} from "@/redux/api/notificationApi";
import { Notification } from "@/redux/types/notification";
import { formatRelativeTime } from "@/utils/date";
import { getNotificationCategory, getNotificationLink } from "@/utils/notificationCategories";

/* ================= HELPERS ================= */

export const getNotificationIcon = (type: string) => {
  switch (type) {
    case "INSPECTION_APPROVED":
    case "FINDING_CLOSED":
      return <CheckCircle className="h-5 w-5 text-green-500" />;
    case "INSPECTION_RETURNED":
    case "INSPECTION_OVERDUE":
      return <AlertCircle className="h-5 w-5 text-orange-500" />;
  }

  switch (getNotificationCategory(type)) {
    case "INSPECTION":
      return <ClipboardCheck className="h-5 w-5 text-blue-500" />;
    case "FINDING":
      return <AlertTriangle className="h-5 w-5 text-red-500" />;
    default:
      return <Shield className="h-5 w-5 text-gray-700" />;
  }
};

const truncateText = (text: string, maxLength: number) =>
  text.length <= maxLength ? text : text.substring(0, maxLength) + "...";

/* ================= ITEM ================= */

const NotificationItem = ({
  notification,
  onClick,
}: {
  notification: Notification;
  onClick: (n: Notification) => void;
}) => (
  <DropdownItem
    onClick={(e) => {
      e.stopPropagation();
      onClick(notification);
    }}
    className={`group relative flex gap-3 rounded-lg border p-3 hover:bg-gray-100 ${
      !notification.is_read ? "bg-blue-50" : "bg-white"
    }`}
  >
    <div className="relative w-10 h-10 rounded-full bg-gray-100 flex items-center justify-center">
      {getNotificationIcon(notification.type)}
      {!notification.is_read && (
        <span className="absolute top-0 right-0 w-3 h-3 bg-blue-500 border-2 border-white rounded-full" />
      )}
    </div>

    <div className="flex-1 overflow-hidden">
      <div className="flex justify-between items-start">
        <span className="font-semibold text-sm truncate text-gray-900">{notification.title}</span>
      </div>
      <p className="text-xs text-gray-600 line-clamp-2 mt-0.5">
        {notification.message}
      </p>
      <span className="text-[10px] text-gray-400 mt-1 block">
        {formatRelativeTime(notification.created_at)}
      </span>
    </div>
  </DropdownItem>
);

/* ================= DROPDOWN ================= */

// "dark" = trigger styled for the navy admin top bar
export default function NotificationDropdown({ variant = "light" }: { variant?: "light" | "dark" } = {}) {
  const { data: session } = useSession();
  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);

  // Queries & Mutations
  const { data: notifications = [], isLoading } = useGetMyNotificationsQuery(undefined, {
    skip: !session,
    pollingInterval: 30000, // Poll every 30 seconds
  });
  const [markAsRead] = useMarkAsReadMutation();
  const [markAllAsRead] = useMarkAllAsReadMutation();

  /* ================= HANDLERS ================= */

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.is_read) {
      await markAsRead(notification.notification_id).unwrap();
    }

    const link = getNotificationLink(notification);
    if (link) router.push(link);

    setIsOpen(false);
  };

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead().unwrap();
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    }
  };

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications]
  );

  if (!session) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Notifications"
        className={
          variant === "dark"
            ? "relative h-10 w-10 rounded-lg border border-white/25 flex items-center justify-center bg-transparent hover:bg-white/10 transition-all active:scale-95"
            : "relative h-10 w-10 rounded-full border border-gray-200 flex items-center justify-center bg-white hover:bg-gray-50 transition-all shadow-sm active:scale-95"
        }
      >
        {unreadCount > 0 && (
          <span className={`absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 text-[10px] font-bold bg-red-500 text-white rounded-full flex items-center justify-center shadow-sm border ${variant === "dark" ? "border-primary" : "border-white"}`}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
        <Bell className={`w-5 h-5 ${variant === "dark" ? "text-white" : "text-gray-500"}`} />
      </button>

      <Dropdown
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        className="absolute right-0 mt-3 w-[360px] bg-white border border-gray-200 rounded-2xl shadow-2xl p-0 z-[100] overflow-hidden animate-in fade-in zoom-in duration-200"
      >
        <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-gray-50/50">
          <h5 className="font-bold text-gray-900">Notifications</h5>
          {unreadCount > 0 && (
            <button
              onClick={handleMarkAllAsRead}
              className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex gap-1 items-center transition-colors"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              Mark all as read
            </button>
          )}
        </div>

        <div className="flex flex-col max-h-[400px] overflow-y-auto custom-scrollbar bg-white">
          {isLoading ? (
            <div className="py-12 flex flex-col items-center gap-3 text-gray-400">
               <div className="h-5 w-5 border-2 border-blue-500 border-t-transparent animate-spin rounded-full"></div>
               <span className="text-sm">Fetching alerts...</span>
            </div>
          ) : notifications.length > 0 ? (
            <div className="divide-y divide-gray-50">
              {notifications.slice(0, 10).map((notification) => (
                <NotificationItem
                  key={notification.notification_id}
                  notification={notification}
                  onClick={handleNotificationClick}
                />
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-sm text-gray-400 flex flex-col items-center gap-2">
              <Bell className="h-8 w-8 opacity-20" />
              <span>No notifications for now</span>
            </div>
          )}
        </div>

        <button
          onClick={() => {
            setIsOpen(false);
            router.push("/notifications");
          }}
          className="w-full p-4 text-center border-t border-gray-100 text-sm font-semibold text-gray-700 hover:bg-gray-50 hover:text-blue-600 transition-all flex items-center justify-center gap-2"
        >
          View all notifications
          <ChevronRight className="h-4 w-4" />
        </button>
      </Dropdown>
    </div>
  );
}
