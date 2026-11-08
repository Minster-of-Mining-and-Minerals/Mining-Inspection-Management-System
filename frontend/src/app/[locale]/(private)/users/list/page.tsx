"use client";
import InternalUserTable from "@/features/user-management/api/component/InternalUserTable";

// MIMS has staff accounts only (no public / external users)
function UsersList() {
    return <InternalUserTable />;
}

export default UsersList;
