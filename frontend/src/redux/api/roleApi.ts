import { baseApi } from "../baseApi";
import { Role } from "../types/auth";
import { CreateRolePayload, UpdateRolePayload } from "../types/roles";

export const roleApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    /** ---------------------------
     * GET ALL ROLES
     * --------------------------- */
    getRoles: builder.query<Role[], { is_active?: boolean } | void>({
      query: (params) => {
        return params ? { url: "/roles", params } : { url: "/roles" }; // no params field when undefined
      },
      transformResponse: (response: any): Role[] => response.data ?? [],
      providesTags: ["Roles"],
    }),

    /** ---------------------------
     * GET ROLE BY ID
     * --------------------------- */
    getRoleById: builder.query<Role, string>({
      query: (role_id) => `/roles/${role_id}`,
      transformResponse: (response: any): Role => response.data,
      providesTags: (_r, _e, id) => [{ type: "Roles", id }],
    }),

    /** ---------------------------
     * CREATE ROLE
     * --------------------------- */
    createRole: builder.mutation<Role, CreateRolePayload>({
      query: (body) => ({
        url: "/roles",
        method: "POST",
        body,
      }),
      transformResponse: (response: any): Role => response.data,
      invalidatesTags: ["Roles"],
    }),

    /** ---------------------------
     * UPDATE ROLE
     * --------------------------- */
    updateRole: builder.mutation<Role, { id: string; data: UpdateRolePayload }>(
      {
        query: ({ id, data }) => ({
          url: `/roles/${id}`,
          method: "PUT",
          body: data,
        }),
        transformResponse: (response: any): Role => response.data,
        invalidatesTags: (_r, _e, { id }) => [{ type: "Roles", id }, "Roles"],
      }
    ),

    /** ---------------------------
     * COPY ROLE into a sector (to change it there)
     * --------------------------- */
    copyRole: builder.mutation<Role, { id: string; name?: string; sector_node_id?: string }>({
      query: ({ id, ...body }) => ({
        url: `/roles/${id}/copy`,
        method: "POST",
        body,
      }),
      transformResponse: (response: any): Role => response.data,
      invalidatesTags: ["Roles"],
    }),

    /** ---------------------------
     * DELETE ROLE (SOFT DELETE)
     * --------------------------- */
    deleteRole: builder.mutation<{ message: string }, string>({
      query: (id) => ({
        url: `/roles/${id}`,
        method: "DELETE",
      }),
      transformResponse: (response: any) => response,
      invalidatesTags: ["Roles"],
    }),
  }),
});

export const {
  useGetRolesQuery,
  useGetRoleByIdQuery,
  useCreateRoleMutation,
  useUpdateRoleMutation,
  useDeleteRoleMutation,
  useCopyRoleMutation,
} = roleApi;
