import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { BaseQueryFn } from "@reduxjs/toolkit/query";
import { getSession } from "next-auth/react";
import { performLogout } from "@/utils/logout";
import { fetchWithTimeout, resolveApiBaseUrl } from "@/utils/apiUrl";
import { getSelectedSectorId, setSelectedSectorId } from "@/lib/sectorSelection";

/** The backend's answer when the chosen sector no longer exists (e.g. deactivated). */
const UNKNOWN_SECTOR = "The selected sector does not exist.";

const rawBaseQuery = fetchBaseQuery({
  baseUrl: "/api",
  fetchFn: fetchWithTimeout,
  prepareHeaders: async (headers) => {
    const session = await getSession();
    if (session?.accessToken) {
      headers.set("authorization", `Bearer ${session.accessToken}`);
    }
    // Central users: the sector chosen in the Sector filter (none = all sectors)
    const sectorId = session?.user?.is_central ? getSelectedSectorId() : null;
    if (sectorId) headers.set("x-sector-id", sectorId);
    headers.set("content-type", "application/json");
    headers.set("accept", "application/json");
    return headers;
  },
});

/** Resolve API host at request time — never use a build-time IP. */
const baseQuery: BaseQueryFn = async (args, api, extraOptions) => {
  const apiBaseUrl = resolveApiBaseUrl();
  const request =
    typeof args === "string" ? { url: args, baseUrl: apiBaseUrl } : { ...args, baseUrl: apiBaseUrl };

  return rawBaseQuery(request, api, extraOptions);
};

const baseQueryWithReauth: BaseQueryFn = async (args, api, extraOptions) => {
  let result = await baseQuery(args, api, extraOptions);

  // The remembered sector is gone: fall back to all sectors and try again
  const error = result.error as { status?: unknown; data?: { message?: string } } | undefined;
  if (error?.status === 400 && error.data?.message === UNKNOWN_SECTOR && getSelectedSectorId()) {
    setSelectedSectorId(null);
    result = await baseQuery(args, api, extraOptions);
  }

  const requestUrl =
    typeof args === "string" ? args : args?.url?.toString?.() ?? "";
  const isChangePassword = requestUrl.includes("/change-password");

  if (result.error && result.error.status === 401 && !isChangePassword) {
    // Only log out users who actually have a session — anonymous visitors on
    // pages (e.g. login, forgot password) must never be sent to login.
    const session = await getSession();
    if (session?.accessToken) {
      // The session ended on the server (signed out elsewhere, inactivity, new password …): say why on the sign-in page
      const data = (result.error as { data?: { code?: string; reason?: string } }).data;
      const reason = data?.code === "SESSION_ENDED" && data.reason ? `?ended=${encodeURIComponent(data.reason)}` : "";
      console.warn("Unauthorized! Forced logout triggered.");
      await performLogout(`/login${reason}`);
    }
  }
  return result;
};

export const baseApi = createApi({
  reducerPath: "api",
  baseQuery: baseQueryWithReauth,
  tagTypes: [
    "User",
    "Roles",
    "Permissions",
    "SectorNode",
    "AdminArea",
    "Company",
    "Mineral",
    "Team",
    "Form",
    "Schedule",
    "Inspection",
    "Attachment",
    "Dashboard",
    "Notification",
    "Profile",
    "Sessions",
  ],

  endpoints: () => ({}),
});
