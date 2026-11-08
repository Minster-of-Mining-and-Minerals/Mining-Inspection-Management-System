import { createApi, fetchBaseQuery } from "@reduxjs/toolkit/query/react";
import type { BaseQueryFn } from "@reduxjs/toolkit/query";
import { getSession } from "next-auth/react";
import { performLogout } from "@/utils/logout";
import { fetchWithTimeout, resolveApiBaseUrl } from "@/utils/apiUrl";

const rawBaseQuery = fetchBaseQuery({
  baseUrl: "/api",
  fetchFn: fetchWithTimeout,
  prepareHeaders: async (headers) => {
    const session = await getSession();
    if (session?.accessToken) {
      headers.set("authorization", `Bearer ${session.accessToken}`);
    }
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
  const requestUrl =
    typeof args === "string" ? args : args?.url?.toString?.() ?? "";
  const isChangePassword = requestUrl.includes("/change-password");

  if (result.error && result.error.status === 401 && !isChangePassword) {
    // Only log out users who actually have a session — anonymous visitors on
    // pages (e.g. login, forgot password) must never be sent to login.
    const session = await getSession();
    if (session?.accessToken) {
      console.warn("Unauthorized! Forced logout triggered.");
      await performLogout();
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
    "Attachment",
    "Dashboard",
    "Notification",
    "Profile",
  ],

  endpoints: () => ({}),
});
