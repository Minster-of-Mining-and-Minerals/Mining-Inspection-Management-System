import { baseApi } from "../baseApi";
import { UserType, UserPosition, User } from "../types/user";
import {
  CreateUserPayload,
  UpdateUserPayload,
  ToggleUserStatusPayload,
} from "../types/user";

import { PaginatedResponse, PaginationParams } from "../types/common";

/** When the email could not be sent, the API returns the temporary password once. */
export interface AccountPasswordResult {
  message: string;
  email_sent: boolean;
  temporary_password?: string;
}

export const userApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    /** ---------------------------
     * GET ALL USERS
     * --------------------------- */
    getUsers: builder.query<
      PaginatedResponse<User>,
      PaginationParams | void
    >({
      query: (params) =>
        params ? { url: "/users", params } : { url: "/users" },
      providesTags: ["User"],
    }),

    /** ---------------------------
     * GET USER BY ID
     * --------------------------- */
    getUserById: builder.query<User, string>({
      query: (id) => `/users/${id}`,
      transformResponse: (response: any): User => response.data,
      providesTags: (_r, _e, id) => [{ type: "User", id }],
    }),

    /** ---------------------------
     * GET CURRENT USER PROFILE
     * --------------------------- */
    getProfile: builder.query<User, void>({
      query: () => `/users/profile/me`,
      transformResponse: (response: any): User => response.data,
      providesTags: ["User"],
    }),

    /** ---------------------------
     * CREATE USER
     * --------------------------- */
    createUser: builder.mutation<AccountPasswordResult & { user: User }, CreateUserPayload>({
      query: (body) => ({
        url: "/users",
        method: "POST",
        body,
      }),
      transformResponse: (response: any) => ({
        user: response.data as User,
        message: response.message,
        email_sent: response.email_sent !== false,
        temporary_password: response.temporary_password,
      }),
      invalidatesTags: ["User"],
    }),

    /** ---------------------------
     * UPDATE USER
     * --------------------------- */
    updateUser: builder.mutation<User, { id: string; data: UpdateUserPayload }>(
      {
        query: ({ id, data }) => ({
          url: `/users/${id}`,
          method: "PUT",
          body: data,
        }),
        transformResponse: (response: any): User => response.data,
        invalidatesTags: (_r, _e, { id }) => [{ type: "User", id }, "User"],
      }
    ),

    /** ---------------------------
     * DELETE USER (SOFT DELETE)
     * --------------------------- */
    deleteUser: builder.mutation<{ message: string }, string>({
      query: (id) => ({
        url: `/users/${id}`,
        method: "DELETE",
      }),
      transformResponse: (response: any) => response,
      invalidatesTags: ["User"],
    }),

    /** ---------------------------
     * TOGGLE USER ACTIVE STATUS
     * --------------------------- */
    toggleUserStatus: builder.mutation<
      User,
      { id: string; data: ToggleUserStatusPayload }
    >({
      query: ({ id, data }) => ({
        url: `/users/${id}/toggle-status`,
        method: "PATCH",
        body: data,
      }),
      transformResponse: (response: any): User => response.data,
      invalidatesTags: (_r, _e, { id }) => [{ type: "User", id }, "User"],
    }),

    /** ---------------------------
     * RESET USER PASSWORD
     * --------------------------- */
    resetUserPassword: builder.mutation<AccountPasswordResult, string>({
      query: (id) => ({
        url: `/users/${id}/reset-password`,
        method: "POST",
      }),
      transformResponse: (response: any) => response,
      invalidatesTags: ["User"],
    }),

    /** ---------------------------
     * GET USER TYPES
     * --------------------------- */
    getUserTypes: builder.query<UserType[], void>({
      query: () => "/users/types",
      transformResponse: (response: any): UserType[] => response.data ?? [],
      providesTags: ["User"],
    }),

    /** ---------------------------
     * GET USER POSITIONS
     * --------------------------- */
    getUserPositions: builder.query<UserPosition[], void>({
      query: () => "/users/positions",
      transformResponse: (response: any): UserPosition[] => response.data ?? [],
      providesTags: ["User"],
    }),

    /** ---------------------------
     * EXPORT USERS
     * --------------------------- */
    exportUsers: builder.mutation<Blob, void>({
      query: () => ({
        url: "/users/export",
        method: "GET",
        responseHandler: (response) => response.blob(), // <-- handle file
        cache: "no-cache",
      }),
    }),

    /** ---------------------------
     * CHANGE PASSWORD
     * --------------------------- */
    changePassword: builder.mutation<
      { success: boolean; message: string },
      {
        current_password?: string;
        new_password: string;
        confirm_password: string;
        confirm_change: boolean;
      }
    >({
      query: (body) => ({
        url: "/change-password",
        method: "PUT",
        body,
      }),
    }),
  }),
});

export const {
  useGetUsersQuery,
  useGetUserByIdQuery,
  useGetProfileQuery,
  useCreateUserMutation,
  useUpdateUserMutation,
  useDeleteUserMutation,
  useToggleUserStatusMutation,
  useResetUserPasswordMutation,
  useGetUserTypesQuery,
  useGetUserPositionsQuery,
  useExportUsersMutation,
  useChangePasswordMutation,
} = userApi;
