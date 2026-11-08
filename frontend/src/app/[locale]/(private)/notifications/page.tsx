"use client";

import React, { useMemo, useState } from "react";
import { Bell, CheckCheck, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
    useGetMyNotificationsQuery,
    useMarkAsReadMutation,
    useMarkAllAsReadMutation,
} from "@/redux/api/notificationApi";
import { Notification } from "@/redux/types/notification";
import { compareUtcDates, formatDateLabel, formatTime } from "@/utils/date";
import {
    NOTIFICATION_CATEGORIES as CATEGORIES,
    NotificationCategory as Category,
    getNotificationCategory as getCategory,
    getNotificationLink,
    matchesNotificationCategory as matchesCategory,
} from "@/utils/notificationCategories";

type StatusFilter = "ALL" | "UNREAD" | "READ";

const STATUS_OPTIONS: { key: StatusFilter; label: string }[] = [
    { key: "ALL", label: "All" },
    { key: "UNREAD", label: "Unread" },
    { key: "READ", label: "Read" },
];

/* =========================
   HELPERS
========================= */

const typeLabel = (type: string) =>
    type.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());

/* =========================
   COMPONENT
========================= */
const Notifications = () => {
    const router = useRouter();

    const [activeCategory, setActiveCategory] = useState<Category>("INSPECTION");
    const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

    const { data: notifications = [], isLoading } = useGetMyNotificationsQuery(undefined, {
        pollingInterval: 60000, // Refresh every minute
    });
    const [markAsRead] = useMarkAsReadMutation();
    const [markAllAsRead, { isLoading: isMarkingAll }] = useMarkAllAsReadMutation();

    const unreadByCategory = useMemo(() => {
        const counts: Record<Category, number> = { INSPECTION: 0, FINDING: 0, SYSTEM: 0 };
        notifications.forEach((n) => {
            if (!n.is_read) counts[getCategory(n.type)] += 1;
        });
        return counts;
    }, [notifications]);

    const totalUnread = unreadByCategory.INSPECTION + unreadByCategory.FINDING + unreadByCategory.SYSTEM;

    /* =========================
       HANDLERS
    ========================= */
    const handleMarkAllAsRead = async () => {
        try {
            await markAllAsRead().unwrap();
        } catch (err) {
            console.error("Failed to mark all as read:", err);
        }
    };

    const handleNotificationClick = async (notification: Notification) => {
        if (!notification.is_read) {
            // Don't block navigation if marking as read fails
            markAsRead(notification.notification_id).unwrap().catch((err) =>
                console.error("Failed to mark as read:", err)
            );
        }

        const link = getNotificationLink(notification);
        if (link) router.push(link);
    };

    const filteredNotifications = useMemo(() => {
        return notifications
            .filter((n) => {
                const statusMatch =
                    statusFilter === "ALL" ||
                    (statusFilter === "UNREAD" && !n.is_read) ||
                    (statusFilter === "READ" && n.is_read);
                return matchesCategory(activeCategory, n.type) && statusMatch;
            })
            .sort((a, b) => compareUtcDates(b.created_at, a.created_at));
    }, [notifications, activeCategory, statusFilter]);

    const ActiveIcon = CATEGORIES.find((c) => c.key === activeCategory)!.icon;

    return (
        <div className="mx-auto w-full max-w-5xl space-y-5">
            {/* Page header */}
            <div className="flex flex-wrap items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-golden-bright">
                    <Bell className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                    <h1 className="text-xl font-bold text-primary sm:text-2xl">Notifications</h1>
                    <p className="text-sm text-slate-500">
                        {totalUnread > 0
                            ? `You have ${totalUnread} unread notification${totalUnread === 1 ? "" : "s"}`
                            : "You're all caught up"}
                    </p>
                </div>
                <Button
                    onClick={handleMarkAllAsRead}
                    disabled={totalUnread === 0 || isMarkingAll}
                    className="gap-2"
                >
                    <CheckCheck className="h-4 w-4" />
                    Mark all as read
                </Button>
            </div>

            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                {/* Toolbar: category tabs + status filter */}
                <div className="flex flex-col gap-3 border-b border-slate-200 px-4 pt-3 sm:flex-row sm:items-end sm:justify-between sm:px-6">
                    <div className="-mb-px flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                        {CATEGORIES.map(({ key, label, icon: Icon }) => {
                            const active = activeCategory === key;
                            const count = unreadByCategory[key];
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setActiveCategory(key)}
                                    className={clsx(
                                        "flex shrink-0 items-center gap-2 border-b-[3px] px-3 pb-3 pt-1 text-sm font-semibold transition-colors",
                                        active
                                            ? "border-golden-bright text-primary"
                                            : "border-transparent text-slate-500 hover:text-primary"
                                    )}
                                >
                                    <Icon className="h-4 w-4" />
                                    {label}
                                    {count > 0 && (
                                        <span
                                            className={clsx(
                                                "min-w-[1.25rem] rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold leading-none",
                                                active ? "bg-primary text-white" : "bg-slate-100 text-slate-600"
                                            )}
                                        >
                                            {count}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    <div className="mb-3 inline-flex self-start rounded-lg bg-slate-100 p-1 sm:self-auto">
                        {STATUS_OPTIONS.map(({ key, label }) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setStatusFilter(key)}
                                className={clsx(
                                    "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors",
                                    statusFilter === key
                                        ? "bg-white text-primary shadow-sm"
                                        : "text-slate-500 hover:text-primary"
                                )}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* List */}
                <div className="min-h-[calc(100vh-18rem)]">
                    {isLoading ? (
                        <div className="flex flex-col items-center gap-3 py-24 text-slate-400">
                            <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                            <p className="text-sm font-medium">Loading your notifications...</p>
                        </div>
                    ) : filteredNotifications.length === 0 ? (
                        <div className="flex flex-col items-center gap-3 py-24 text-center">
                            <div className="rounded-full bg-slate-100 p-5">
                                <ActiveIcon className="h-9 w-9 text-slate-300" />
                            </div>
                            <p className="font-semibold text-slate-600">No notifications here</p>
                            <p className="text-sm text-slate-400">We'll let you know when something happens.</p>
                        </div>
                    ) : (
                        filteredNotifications.map((n, index) => {
                            const currentDate = formatDateLabel(n.created_at);
                            const prevDate =
                                index > 0 ? formatDateLabel(filteredNotifications[index - 1].created_at) : null;
                            const Icon = CATEGORIES.find((c) => c.key === getCategory(n.type))!.icon;

                            return (
                                <React.Fragment key={n.notification_id}>
                                    {currentDate !== prevDate && (
                                        <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500 sm:px-6">
                                            {currentDate}
                                        </div>
                                    )}

                                    <button
                                        type="button"
                                        onClick={() => handleNotificationClick(n)}
                                        className={clsx(
                                            "group relative flex w-full gap-4 border-b border-slate-100 px-4 py-4 text-left transition-colors last:border-b-0 sm:px-6",
                                            n.is_read ? "bg-white hover:bg-slate-50" : "bg-primary/[0.04] hover:bg-primary/[0.07]"
                                        )}
                                    >
                                        {!n.is_read && (
                                            <span className="absolute inset-y-0 left-0 w-[3px] bg-golden-bright" />
                                        )}

                                        <div
                                            className={clsx(
                                                "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                                                n.is_read ? "bg-slate-100 text-slate-400" : "bg-primary text-white"
                                            )}
                                        >
                                            <Icon className="h-[18px] w-[18px]" />
                                        </div>

                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-start gap-3">
                                                <h3
                                                    className={clsx(
                                                        "flex-1 text-sm sm:text-[15px]",
                                                        n.is_read ? "font-medium text-slate-600" : "font-bold text-slate-900"
                                                    )}
                                                >
                                                    {n.title}
                                                </h3>
                                                <span className="shrink-0 whitespace-nowrap text-xs text-slate-400">
                                                    {formatTime(n.created_at)}
                                                </span>
                                            </div>

                                            <p
                                                className={clsx(
                                                    "mt-1 text-sm leading-relaxed",
                                                    n.is_read ? "text-slate-500" : "text-slate-700"
                                                )}
                                            >
                                                {n.message}
                                            </p>

                                            <div className="mt-2 flex items-center gap-2">
                                                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                                                    {typeLabel(n.type)}
                                                </span>
                                                {!n.is_read && (
                                                    <span className="flex items-center gap-1 text-[11px] font-semibold text-golden-deep">
                                                        <span className="h-1.5 w-1.5 rounded-full bg-golden-deep" />
                                                        New
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <ChevronRight className="mt-2.5 h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
                                    </button>
                                </React.Fragment>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};

export default Notifications;
