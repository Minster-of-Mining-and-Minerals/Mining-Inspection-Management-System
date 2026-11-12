"use client";

/**
 * Signed-in devices and recent sign-ins.
 *   - no userId: the signed-in person's own (Profile): sign out one device, or all the other devices
 *   - userId: a user's, for administrators (user page): sign them out everywhere
 * A session ends after 24 hours without activity and 7 days after sign-in.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Laptop, LogOut, MonitorSmartphone, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  UserSession,
  useEndMyOtherSessionsMutation,
  useEndMySessionMutation,
  useGetMySessionsQuery,
  useGetUserSessionsQuery,
  useSignOutUserEverywhereMutation,
} from "@/redux/api/sessionApi";
import { formatDateTime, formatRelativeTime } from "@/utils/date";

const END_REASON: Record<string, string> = {
  signed_out: "Signed out",
  signed_out_by_user: "Signed out from another device",
  signed_out_by_admin: "Signed out by an administrator",
  inactive: "Ended after 24 hours without activity",
  expired: "Expired",
  password_changed: "Ended: password changed",
  deactivated: "Ended: account deactivated",
};

const DeviceIcon = ({ device }: { device: string | null }) =>
  /android|iphone|ipad/i.test(device ?? "") ? <Smartphone className="h-5 w-5" /> : /windows|mac|linux/i.test(device ?? "") ? <Laptop className="h-5 w-5" /> : <MonitorSmartphone className="h-5 w-5" />;

const errorText = (e: unknown, fallback: string) => (e as { data?: { message?: string } })?.data?.message || fallback;

export function SessionsCard({ userId, userName, canSignOut = false }: { userId?: string; userName?: string; canSignOut?: boolean }) {
  const mine = !userId;
  const own = useGetMySessionsQuery(undefined, { skip: !mine });
  const theirs = useGetUserSessionsQuery(userId ?? "", { skip: mine });
  const { data, isLoading, isError } = mine ? own : theirs;
  const [endOne, { isLoading: endingOne }] = useEndMySessionMutation();
  const [endOthers, { isLoading: endingOthers }] = useEndMyOtherSessionsMutation();
  const [endAll, { isLoading: endingAll }] = useSignOutUserEverywhereMutation();
  const [confirmAll, setConfirmAll] = useState(false);

  const run = async (p: Promise<{ message: string }>, fallback: string) => {
    try {
      toast.success((await p).message);
    } catch (e) {
      toast.error(errorText(e, fallback));
    }
  };

  const open = data?.open ?? [];
  const others = open.filter((s) => !s.current).length;
  const history = (data?.recent ?? []).filter((s) => s.ended_at);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 sm:p-6" aria-labelledby="sessions-title">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h2 id="sessions-title" className="text-base font-bold text-primary">
            {mine ? "Signed-in devices" : "Sessions"}
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            {mine ? "Where your account is signed in now." : `Where ${userName ?? "this user"} is signed in now.`} A session ends after 24 hours without activity, and 7 days after signing in.
          </p>
        </div>
        {mine && others > 0 && (
          <Button variant="outline" size="sm" className="gap-1.5" disabled={endingOthers} onClick={() => run(endOthers().unwrap(), "Could not sign out the other devices.")}>
            <LogOut className="h-4 w-4" /> Sign out all other devices
          </Button>
        )}
        {!mine && canSignOut && open.length > 0 && (
          confirmAll ? (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-700">Sign out on all {open.length} device{open.length === 1 ? "" : "s"}?</span>
              <Button
                size="sm"
                variant="destructive"
                disabled={endingAll}
                onClick={() => run(endAll(userId!).unwrap(), "Could not sign the user out.").then(() => setConfirmAll(false))}
              >
                Sign out everywhere
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmAll(false)}>
                Cancel
              </Button>
            </span>
          ) : (
            <Button variant="outline" size="sm" className="gap-1.5 text-red-700" onClick={() => setConfirmAll(true)}>
              <LogOut className="h-4 w-4" /> Sign out everywhere
            </Button>
          )
        )}
      </div>

      {isLoading && <p className="mt-4 text-sm text-slate-500">Loading…</p>}
      {isError && <p className="mt-4 text-sm text-red-600">Could not load the sessions.</p>}
      {data && !open.length && <p className="mt-4 text-sm text-slate-500">Not signed in on any device.</p>}

      {open.length > 0 && (
        <ul className="mt-4 divide-y rounded-lg border border-slate-200">
          {open.map((s: UserSession) => (
            <li key={s.session_id} className="flex flex-wrap items-center gap-3 px-3 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <DeviceIcon device={s.device} />
              </span>
              <span className="min-w-0 flex-1 text-sm">
                <span className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                  {s.device ?? "Unknown device"}
                  {s.current && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800">This device</span>}
                </span>
                <span className="block text-xs text-slate-500">
                  {s.ip ? `${s.ip} · ` : ""}signed in {formatDateTime(s.created_at)} · active {formatRelativeTime(s.last_seen_at)}
                </span>
              </span>
              {mine && !s.current && (
                <Button variant="ghost" size="sm" className="text-red-700" disabled={endingOne} onClick={() => run(endOne(s.session_id).unwrap(), "Could not sign out that device.")}>
                  Sign out
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {history.length > 0 && (
        <details className="mt-4">
          <summary className="cursor-pointer text-sm font-medium text-primary">Recent sign-ins ({history.length})</summary>
          <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
            {history.map((s) => (
              <li key={s.session_id}>
                <span className="font-medium text-slate-800">{s.device ?? "Unknown device"}</span>
                {s.ip ? ` · ${s.ip}` : ""} · {formatDateTime(s.created_at)} → {formatDateTime(s.ended_at!)} · {END_REASON[s.end_reason ?? ""] ?? "Ended"}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
