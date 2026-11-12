"use client"

import { useState } from "react";
import { useParams } from "next/navigation";
import { useGetUserByIdQuery, useResetUserPasswordMutation } from "@/redux/api/userApi";
import { formatCalendarDate, formatDateTime } from "@/utils/date";
import { User2Icon, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { TemporaryPasswordDialog } from "@/components/common/modals/TemporaryPasswordDialog";
import { SessionsCard } from "@/components/common/SessionsCard";
import { toast } from "react-toastify";

const UserViewPage = () => {
    const { userId } = useParams();
    const { data: user, isLoading, isError, refetch } =
        useGetUserByIdQuery(userId as string);
    const [resetUserPassword, { isLoading: isResetting }] = useResetUserPasswordMutation();
    const [showResetConfirm, setShowResetConfirm] = useState(false);
    const [tempPassword, setTempPassword] = useState<{ password: string; email?: string } | null>(null);

    const handleConfirmReset = async () => {
        if (!user) return;
        try {
            const res = await resetUserPassword(user.user_id).unwrap();
            toast.success(res.message || "Password reset to 'password' successfully.");
            setTempPassword({
                password: res.temporary_password || "password",
                email: user.email,
            });
            setShowResetConfirm(false);
            refetch();
        } catch (err: any) {
            toast.error(err?.data?.message || err?.message || "Failed to reset password");
        }
    };

    if (isLoading) return <p>Loading user...</p>;
    if (isError) return <p>Failed to load user</p>;

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
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b px-6 py-4">
                        <div className="flex items-center gap-4">
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

                        <Button
                            variant="outline"
                            onClick={() => setShowResetConfirm(true)}
                            className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
                        >
                            <KeyRound className="h-4 w-4" />
                            Reset Password
                        </Button>
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

                    {/* Signed-in devices; an administrator can sign the user out everywhere */}
                    <div className="border-t px-6 py-6">
                        <SessionsCard userId={String(userId)} userName={mappedUser.name} canSignOut />
                    </div>
                </div>

                {/* Reset Password Confirmation Dialog */}
                <Dialog open={showResetConfirm} onOpenChange={(open) => !open && setShowResetConfirm(false)}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <KeyRound className="h-5 w-5 text-amber-600" />
                                Reset User Password
                            </DialogTitle>
                            <DialogDescription className="space-y-2 pt-2 text-left">
                                <span>
                                    Are you sure you want to reset the password for{" "}
                                    <strong className="text-primary">{mappedUser.name}</strong> ({mappedUser.email})?
                                </span>
                                <span className="block text-xs text-slate-500">
                                    The password will be reset to <strong className="font-mono text-primary">password</strong> and the user will be required to change it upon their next login.
                                </span>
                            </DialogDescription>
                        </DialogHeader>
                        <DialogFooter className="gap-2 sm:gap-0 pt-4">
                            <Button variant="outline" onClick={() => setShowResetConfirm(false)} disabled={isResetting}>
                                Cancel
                            </Button>
                            <Button
                                onClick={handleConfirmReset}
                                disabled={isResetting}
                                className="bg-amber-600 hover:bg-amber-700 text-white"
                            >
                                {isResetting ? "Resetting..." : "Reset Password"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                <TemporaryPasswordDialog
                    password={tempPassword?.password ?? null}
                    email={tempPassword?.email}
                    onClose={() => setTempPassword(null)}
                />
            </div>
        </div>

    )
}

export default UserViewPage
