"use client";

import Link from "next/link";
import { Building2, Crown, Mail, Phone, UsersRound } from "lucide-react";
import Loading01 from "@/features/template/component/Loading/Loading01";
import { useGetMyTeamQuery } from "@/redux/api/myWorkApi";
import { formatCalendarDate } from "@/utils/date";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

/** The signed-in user's team: leader, members and how to reach them. */
export default function MyTeam() {
  const { data, isLoading, isError } = useGetMyTeamQuery();
  if (isLoading) return <Loading01 />;
  if (isError) return <p className="py-10 text-center text-red-600">Could not load your team.</p>;
  if (!data)
    return (
      <div className="mx-auto max-w-md rounded-xl border border-dashed border-slate-300 p-10 text-center text-sm text-slate-600">
        <UsersRound className="mx-auto mb-2 h-8 w-8 text-slate-300" />
        You are not in an inspection team yet. Ask an administrator to add you to a team.
      </div>
    );

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">{data.team.name}</h1>
          <p className="text-sm text-slate-500">
            {data.members.length} member{data.members.length === 1 ? "" : "s"} · you are the {data.my_role === "leader" ? "team leader" : "a member"}
          </p>
        </div>
        <Link href="/my-companies" className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-primary hover:shadow-sm">
          <Building2 className="h-4 w-4" /> {data.company_count} companies · {data.license_count} licenses
        </Link>
      </div>

      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {data.members.map((m) => (
          <li key={m.team_member_id} className={`rounded-xl border bg-white p-4 ${m.is_me ? "border-primary/40" : "border-slate-200"}`}>
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ${m.role === "leader" ? "bg-golden-bright/20 text-golden-deep" : "bg-primary/10 text-primary"}`}
              >
                {initials(m.full_name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                  {m.full_name}
                  {m.is_me && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">You</span>}
                  {m.role === "leader" && (
                    <span className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      <Crown className="h-3 w-3" /> Team leader
                    </span>
                  )}
                  {!m.is_active && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">Inactive</span>}
                </p>
                <div className="mt-1 space-y-0.5 text-sm">
                  {m.phone_number ? (
                    <a href={`tel:${m.phone_number}`} className="flex items-center gap-2 text-slate-700 hover:text-primary">
                      <Phone className="h-3.5 w-3.5 text-slate-400" /> {m.phone_number}
                    </a>
                  ) : (
                    <p className="flex items-center gap-2 text-slate-400">
                      <Phone className="h-3.5 w-3.5" /> No phone
                    </p>
                  )}
                  {m.email && (
                    <a href={`mailto:${m.email}`} className="flex items-center gap-2 break-all text-slate-700 hover:text-primary">
                      <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" /> {m.email}
                    </a>
                  )}
                </div>
                <p className="mt-1 text-xs text-slate-500">In the team since {formatCalendarDate(String(m.joined_on))}</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-500">
        Your own details can be changed on your <Link href="/profile" className="text-primary hover:underline">profile</Link>. Team changes are made by an administrator.
      </p>
    </div>
  );
}
