import { baseApi } from "../baseApi";

/** One sign-in (a device). */
export interface UserSession {
  session_id: string;
  ip: string | null;
  device: string | null;
  user_agent?: string | null;
  created_at: string;
  last_seen_at: string;
  expires_at?: string;
  ended_at?: string | null;
  end_reason?: string | null;
  /** The device this page is open on (own sessions only) */
  current?: boolean;
}

export interface SessionList {
  open: UserSession[];
  recent: UserSession[];
}

/** Sessions of the signed-in person, and of a user (administrators). */
export const sessionApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getMySessions: builder.query<SessionList, void>({
      query: () => "/auth/sessions",
      transformResponse: (response: { data: SessionList }) => response.data,
      providesTags: [{ type: "Sessions", id: "me" }],
    }),
    endMySession: builder.mutation<{ message: string }, string>({
      query: (id) => ({ url: `/auth/sessions/${id}`, method: "DELETE" }),
      invalidatesTags: [{ type: "Sessions", id: "me" }],
    }),
    endMyOtherSessions: builder.mutation<{ message: string }, void>({
      query: () => ({ url: "/auth/sessions/sign-out-others", method: "POST" }),
      invalidatesTags: [{ type: "Sessions", id: "me" }],
    }),
    getUserSessions: builder.query<SessionList, string>({
      query: (userId) => `/users/${userId}/sessions`,
      transformResponse: (response: { data: SessionList }) => response.data,
      providesTags: (_r, _e, userId) => [{ type: "Sessions", id: userId }],
    }),
    signOutUserEverywhere: builder.mutation<{ message: string }, string>({
      query: (userId) => ({ url: `/users/${userId}/sessions/sign-out`, method: "POST" }),
      invalidatesTags: (_r, _e, userId) => [{ type: "Sessions", id: userId }],
    }),
  }),
});

export const { useGetMySessionsQuery, useEndMySessionMutation, useEndMyOtherSessionsMutation, useGetUserSessionsQuery, useSignOutUserEverywhereMutation } = sessionApi;
