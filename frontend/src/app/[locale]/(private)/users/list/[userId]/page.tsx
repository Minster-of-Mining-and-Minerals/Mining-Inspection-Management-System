"use client"

import { useParams } from "next/navigation"
import { useGetUserByIdQuery } from "@/redux/api/userApi"
import { formatCalendarDate, formatDateTime } from "@/utils/date";
import { User2Icon } from "lucide-react";

const UserViewPage = () => {
    const { userId } = useParams()
    const { data: user, isLoading, isError } =
        useGetUserByIdQuery(userId as string)

    if (isLoading) return <p>Loading user...</p>
    if (isError) return <p>Failed to load user</p>

    const mappedUser = user ?
        {
            id: user.user_id,
            name: user.full_name,
            email: user.email,
            phone: user.phone_number,
            status: user.is_active ? "Active" : "Inactive",
            firstLogin: user.is_first_logged_in,
            userType: user.userType?.name,
            roles: user.roles?.map((role) => role.name),
            createdAt: formatDateTime(user.created_at),
        }
        : null

    if (!mappedUser) return <p>No user found</p>

    return (
        <div className="min-h-screen w-full bg-[#F9FBFC] p-6">
            <div className="w-full mx-auto space-y-6">

                <div className="bg-white w-full rounded-xl border shadow-sm">
                    {/* Header */}
                    <div className="flex items-center gap-4 border-b px-6 py-4">
                        <div className="relative w-20 h-20 rounded-full border overflow-hidden flex items-center justify-center">
                            <User2Icon className="h-10 w-10 text-primary" />
                        </div>

                        <div>
                            <h2 className="text-xl font-semibold text-primary">
                                {mappedUser.name}
                            </h2>
                            <p className="text-sm text-gray-600">{mappedUser.email}</p>
                        </div>
                    </div>

                    {/* User Details */}
                    <div className="px-6 py-6">
                        <h3 className="font-semibold mb-4 text-primary">User Details</h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">


                            <div>
                                <p className="text-gray-500">Phone</p>
                                <p className="font-medium">{mappedUser.phone || "—"}</p>
                            </div>

                            <div>
                                <p className="text-gray-500">Status</p>
                                <p className="font-medium">
                                    {mappedUser.status}
                                </p>
                            </div>

                            <div>
                                <p className="text-gray-500">User Type</p>
                                <p className="font-medium">{mappedUser.userType}</p>
                            </div>

                            <div>
                                <p className="text-gray-500">Roles</p>
                                <p className="font-medium">
                                    {mappedUser.roles?.join(", ")}
                                </p>
                            </div>


                            <div>
                                <p className="text-gray-500">Created At</p>
                                <p className="font-medium">{mappedUser.createdAt}</p>
                            </div>
                        </div>
                    </div>

                    {/* Teams: current team first, then history */}
                    <div className="border-t px-6 py-6">
                        <h3 className="font-semibold mb-4 text-primary">Team</h3>
                        {!user?.teamMemberships?.length ? (
                            <p className="text-sm text-gray-500">Not in a team.</p>
                        ) : (
                            <ul className="space-y-2 text-sm">
                                {user.teamMemberships.map((m) => (
                                    <li key={m.team_member_id} className="flex flex-wrap items-center gap-2">
                                        <a href={`/teams/${m.team.team_id}`} className="font-medium text-primary hover:underline">
                                            {m.team.name}
                                        </a>
                                        {m.role === "leader" && <span className="rounded-full bg-golden-dark/10 px-2 py-0.5 text-[11px] font-semibold text-golden-deep">Leader</span>}
                                        <span className="text-gray-500">
                                            {formatCalendarDate(m.joined_on)} – {m.left_on ? formatCalendarDate(m.left_on) : "now"}
                                        </span>
                                        {!m.left_on && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800">Current</span>}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

            </div>
        </div>

    )
}

export default UserViewPage
