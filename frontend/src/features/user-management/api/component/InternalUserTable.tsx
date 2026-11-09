"use client";

import { useState, useEffect } from "react";
import { DataTable } from "@/features/template/component/tableList/DataTable";
import { TableLayout } from "@/features/template/component/tableList/TableLayout";
import { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download, Plus, Eye, Edit, Users, KeyRound } from "lucide-react";

import type { FilterField, ActionButton } from "@/types/tableLayout";
import {
    useExportUsersMutation,
    useGetUsersQuery,
    useGetUserTypesQuery,
    useResetUserPasswordMutation,
} from "@/redux/api/userApi";
import { User } from "@/redux/types/user";
import { formatStatus } from "@/utils/statusFormatter";
import { CreateUserModal } from "@/components/common/modals/CreateUserModal";
import { EditUserModal } from "@/components/common/modals/EditUserModal";
import { TemporaryPasswordDialog } from "@/components/common/modals/TemporaryPasswordDialog";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "react-toastify";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const getColumns = (
    onEdit: (user: User) => void,
    onResetPassword: (user: User) => void
): ColumnDef<User>[] => [
    {
        accessorKey: "full_name",
        header: "Full Name",
        cell: ({ row }) => (
            <span className="font-medium text-primary">
                {row.getValue("full_name")}
            </span>
        ),
    },
    {
        accessorKey: "email",
        header: "Email",
        cell: ({ row }: any) => <div>{row.getValue("email")}</div>,
    },
    {
        accessorKey: "phone_number",
        header: "Phone Number",
        cell: ({ row }: any) => <div>{row.getValue("phone_number")}</div>,
    },
    // {
    //     id: "internalUserType",
    //     header: "User Type",
    //     cell: ({ row }) => {
    //         const type = row.original.internalUserType;
    //         return <span className="text-sm font-medium">{type?.name ?? "—"}</span>;
    //     },
    // },
    {
        id: "team",
        header: "Team",
        cell: ({ row }) => {
            const team = row.original.current_team;
            if (!team) return <span className="text-sm text-slate-400">—</span>;
            return (
                <span className="text-sm font-medium">
                    {team.name}
                    {team.member_role === "leader" && <span className="ml-1 text-xs text-golden-deep">(leader)</span>}
                </span>
            );
        },
    },
    {
        id: "sector",
        header: "Sector",
        cell: ({ row }) => {
            const sector = row.original.sectorNode;
            return (
                <span className="text-sm font-medium">{sector?.name ?? "—"}</span>
            );
        },
    },
    {
        accessorKey: "is_active",
        header: "Status",
        cell: ({ row }) => {
            const isActive = row.getValue("is_active") as boolean;
            return (
                <Badge className="text-white" status={isActive ? "active" : "inactive"}>
                    {formatStatus(isActive ? "Active" : "Inactive")}
                </Badge>
            );
        },
    },
    {
        id: "actions",
        header: "Actions",
        cell: ({ row }) => (
            <div className="flex items-center gap-1">
                <Link href={`/users/list/${row.original.user_id}`}>
                    <Button variant="ghost" size="icon" title="View" aria-label="View user">
                        <Eye className="h-4 w-4" />
                    </Button>
                </Link>
                <Button variant="ghost" size="icon" title="Edit" aria-label="Edit user" onClick={() => onEdit(row.original)}>
                    <Edit className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    title="Reset Password"
                    aria-label="Reset password"
                    onClick={() => onResetPassword(row.original)}
                    className="text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                >
                    <KeyRound className="h-4 w-4" />
                </Button>
            </div>
        ),
    },
];

export interface UserTableProps {
    sideActions?: ActionButton[];
}

export default function InternalUserTable({ sideActions }: UserTableProps) {
    const {
        data: userTypes = [],
        isLoading: isLoadingType,
        isError: typeError,
        refetch: refetchType,
    } = useGetUserTypesQuery();
    const userTypeId = userTypes?.find(
        (type: any) => type.name === "internal"
    )?.user_type_id;
    const searchParams = useSearchParams();
    const searchQuery = searchParams.get("search") || "";

    // Pagination states
    const [pageIndex, setPageIndex] = useState(0);
    const [pageSize, setPageSize] = useState(10);

    const {
        data: response,
        isLoading,
        isError,
        refetch,
    } = useGetUsersQuery({
        user_type_id: userTypeId,
        page: pageIndex + 1,
        limit: pageSize,
        search: searchQuery,
    });

    const users = response?.data ?? [];
    const totalPages = response?.meta?.totalPages ?? 0;
    const [exportUsers, { isLoading: exportLoading }] = useExportUsersMutation();

    // Reset page index when search changes
    useEffect(() => {
        setPageIndex(0);
    }, [searchQuery]);

    const [isModalOpen, setModalOpen] = useState(false);
    const [editUserId, setEditUserId] = useState<string | null>(null);
    const [resetUser, setResetUser] = useState<User | null>(null);
    const [tempPassword, setTempPassword] = useState<{ password: string; email?: string } | null>(null);
    const [resetPasswordMutation, { isLoading: isResetting }] = useResetUserPasswordMutation();

    const handleConfirmReset = async () => {
        if (!resetUser) return;
        try {
            const res = await resetPasswordMutation(resetUser.user_id).unwrap();
            toast.success(res.message || "Password reset to 'password' successfully.");
            setTempPassword({
                password: res.temporary_password || "password",
                email: resetUser.email,
            });
            setResetUser(null);
        } catch (err: any) {
            toast.error(err?.data?.message || err?.message || "Failed to reset password");
        }
    };

    const handlePagination = (index: number, size: number) => {
        setPageIndex(index);
        setPageSize(size);
    };

    // Filters
    const [statusFilter, setStatusFilter] = useState("");

    const filters: FilterField[] = [
        {
            key: "status",
            label: "Status",
            type: "multiselect",
            placeholder: "Select status",
            value: statusFilter,
            onChange: setStatusFilter,
            options: [
                { label: "Active", value: "active" },
                { label: "Inactive", value: "inactive" },
            ],
        },
    ];

    // Actions
    const actions: ActionButton[] = [
        {
            label: "Export",
            icon: <Download className="h-4 w-4" />,
            variant: "outline",
            loading: exportLoading,
            // permissions: ["USER:EXPORT"],
            onClick: async () => {
                try {
                    const blob = await exportUsers().unwrap();
                    // Create download link
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "users.csv";
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    window.URL.revokeObjectURL(url);
                } catch (err) {
                    console.error("Export failed", err);
                }
            },
        },

        {
            label: "Create User",
            icon: <Plus className="h-4 w-4" />,
            variant: "default",
            onClick: () => setModalOpen(true),
            permissions: ["USERS:CREATE"],
        },
    ];

    // Apply filters locally (optional, ideally these should also be server-side)
    const filteredData = users.filter((role) => {
        if (statusFilter === "active") return role.is_active === true;
        if (statusFilter === "inactive") return role.is_active === false;
        return true;
    });

    return (
        <>
            <TableLayout
                actions={actions}
                sideActions={sideActions}
                filters={filters}
                filterColumnsPerRow={1}
            >
                <DataTable
                    columns={getColumns(
                        (user) => setEditUserId(user.user_id),
                        (user) => setResetUser(user)
                    )}
                    data={filteredData}
                    totalPageCount={totalPages}
                    handlePagination={handlePagination}
                    tablePageSize={pageSize}
                    currentIndex={pageIndex}
                />
            </TableLayout>
            <CreateUserModal
                user_type="internal"
                isOpen={isModalOpen}
                onClose={() => setModalOpen(false)}
            />
            <EditUserModal
                userId={editUserId}
                userType="internal"
                onClose={() => setEditUserId(null)}
            />

            {/* Reset Password Confirmation Dialog */}
            <Dialog open={!!resetUser} onOpenChange={(open) => !open && setResetUser(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <KeyRound className="h-5 w-5 text-amber-600" />
                            Reset User Password
                        </DialogTitle>
                        <DialogDescription className="space-y-2 pt-2 text-left">
                            <span>
                                Are you sure you want to reset the password for{" "}
                                <strong className="text-primary">{resetUser?.full_name}</strong> ({resetUser?.email})?
                            </span>
                            <span className="block text-xs text-slate-500">
                                The password will be reset to <strong className="font-mono text-primary">password</strong> and the user will be required to change it upon their next login.
                            </span>
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="gap-2 sm:gap-0 pt-4">
                        <Button variant="outline" onClick={() => setResetUser(null)} disabled={isResetting}>
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
        </>
    );
}