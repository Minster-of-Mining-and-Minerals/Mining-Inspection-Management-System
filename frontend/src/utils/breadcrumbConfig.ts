export interface BreadcrumbItem {
    title: string;
    path: string;
}

export const breadcrumbConfig: Record<string, BreadcrumbItem[]> = {
    // ================================================
    // Dashboard Routes
    // ================================================
    "/dashboard": [{ title: "Dashboard", path: "/dashboard" }],

    // ================================================
    // Base Data Routes
    // ================================================
    "/basedata": [
        { title: "Base Data", path: "/basedata" },
    ],
    "/basedata/sectors": [
        { title: "Base Data", path: "/basedata" },
        { title: "Organization", path: "/basedata/sectors" },
    ],
    // ================================================
    // Notifications Routes
    // ================================================
    "/notifications": [
        { title: "Notifications", path: "/notifications" },
    ],

    // ================================================
    // Users Routes
    // ================================================
    "/users/list": [
        { title: "Users", path: "/users/list" },
    ],
    "/users/list/[userId]": [
        { title: "Users", path: "/users/list" },
        { title: "User Details", path: "/users/list/[userId]" },
    ],
    "/users/permissions": [
        { title: "Users", path: "/users/list" },
        { title: "Permissions", path: "/users/permissions" },
    ],
    "/users/roles": [
        { title: "Users", path: "/users/list" },
        { title: "Roles", path: "/users/roles" },
    ],
    "/users/roles/new": [
        { title: "Users", path: "/users/list" },
        { title: "Roles", path: "/users/roles" },
        { title: "New Role", path: "/users/roles/new" },
    ],
    "/users/roles/[id]": [
        { title: "Users", path: "/users/list" },
        { title: "Roles", path: "/users/roles" },
        { title: "Role Details", path: "/users/roles/[id]" },
    ],

    // ================================================
    // Auth Routes
    // ================================================
    "/login": [{ title: "Login", path: "/login" }],
};