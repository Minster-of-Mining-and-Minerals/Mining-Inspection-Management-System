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
    "/basedata/mineral-categories": [
        { title: "Base Data", path: "/basedata" },
        { title: "Minerals", path: "/basedata/minerals" },
        { title: "Categories", path: "/basedata/mineral-categories" },
    ],
    "/basedata/minerals": [
        { title: "Base Data", path: "/basedata" },
        { title: "Minerals", path: "/basedata/minerals" },
    ],
    "/basedata/locations": [
        { title: "Base Data", path: "/basedata" },
        { title: "Locations", path: "/basedata/locations" },
    ],
    "/basedata/sectors": [
        { title: "Base Data", path: "/basedata" },
        { title: "Organization", path: "/basedata/sectors" },
    ],
    // ================================================
    // Inspection schedules & tasks
    // ================================================
    "/my-tasks": [{ title: "My Tasks", path: "/my-tasks" }],
    "/my-team": [{ title: "My Team", path: "/my-team" }],
    "/my-companies": [{ title: "My Companies", path: "/my-companies" }],
    "/schedules": [{ title: "Schedules", path: "/schedules" }],
    "/schedules/[scheduleId]": [
        { title: "Schedules", path: "/schedules" },
        { title: "Schedule", path: "/schedules/[scheduleId]" },
    ],
    "/inspections/[inspectionId]": [{ title: "Inspection", path: "/inspections/[inspectionId]" }],

    // ================================================
    // Forms Routes
    // ================================================
    "/forms": [{ title: "Forms", path: "/forms" }],
    "/forms/[formId]": [
        { title: "Forms", path: "/forms" },
        { title: "Form", path: "/forms/[formId]" },
    ],

    // ================================================
    // Teams Routes
    // ================================================
    "/teams": [{ title: "Teams", path: "/teams" }],
    "/teams/[teamId]": [
        { title: "Teams", path: "/teams" },
        { title: "Team Details", path: "/teams/[teamId]" },
    ],

    // ================================================
    // Companies Routes
    // ================================================
    "/companies": [{ title: "Companies", path: "/companies" }],
    "/companies/[companyId]": [
        { title: "Companies", path: "/companies" },
        { title: "Company Details", path: "/companies/[companyId]" },
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