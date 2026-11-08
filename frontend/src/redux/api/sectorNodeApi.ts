import { baseApi } from "../baseApi";
import { PaginationParams } from "../types/common";
import {
  CreateSectorNodePayload,
  SectorNode,
  ToggleSectorNodeStatusPayload,
  UpdateSectorNodePayload,
} from "../types/sectorNode";
import { User } from "../types/user";

export const sectorNodeApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    /** ---------------------------
     * GET ALL SECTOR NODES
     * --------------------------- */
    getSectorNodes: builder.query<
      { data: SectorNode[]; meta: any },
      PaginationParams & { is_active?: boolean; search?: string; hierarchy?: boolean } | void
    >({
      query: (params) =>
        params ? { url: "/sector-nodes", params } : { url: "/sector-nodes" },
      transformResponse: (response: any) => ({
        data: response.data ?? [],
        meta: response.meta,
      }),
      providesTags: ["SectorNode"],
    }),

    /** ---------------------------
     * GET ALL SECTOR NODES WITH FLAT CHILDRENS
     * --------------------------- */
    getSectorNodesWithFlatChildren: builder.query<
      SectorNode[],
      { is_active?: boolean; search?: string; hierarchy?: boolean } | void
    >({
      query: (params) =>
        params
          ? { url: "/sector-nodes/flat", params }
          : { url: "/sector-nodes/flat" },
      transformResponse: (response: any): SectorNode[] => response.data ?? [],
      providesTags: ["SectorNode"],
    }),

    /** ---------------------------
     * GET SECTOR NODE BY ID
     * --------------------------- */
    getSectorNodeById: builder.query<SectorNode, string>({
      query: (id) => `/sector-nodes/${id}`,
      transformResponse: (response: any): SectorNode => response.data,
      providesTags: (_r, _e, id) => [{ type: "SectorNode", id }],
    }),

    /** ---------------------------
     * CREATE SECTOR NODE
     * --------------------------- */
    createSectorNode: builder.mutation<SectorNode, CreateSectorNodePayload>({
      query: (body) => ({
        url: "/sector-nodes",
        method: "POST",
        body,
      }),
      transformResponse: (response: any): SectorNode => response.data,
      invalidatesTags: ["SectorNode"],
    }),

    /** ---------------------------
     * UPDATE SECTOR NODE
     * --------------------------- */
    updateSectorNode: builder.mutation<
      SectorNode,
      { id: string; data: UpdateSectorNodePayload }
    >({
      query: ({ id, data }) => ({
        url: `/sector-nodes/${id}`,
        method: "PUT",
        body: data,
      }),
      transformResponse: (response: any): SectorNode => response.data,
      invalidatesTags: (_r, _e, { id }) => [
        { type: "SectorNode", id },
        "SectorNode",
      ],
    }),

    /** ---------------------------
     * DELETE SECTOR NODE (SOFT DELETE)
     * --------------------------- */
    deleteSectorNode: builder.mutation<{ message: string }, string>({
      query: (id) => ({
        url: `/sector-nodes/${id}`,
        method: "DELETE",
      }),
      transformResponse: (response: any) => response,
      invalidatesTags: ["SectorNode"],
    }),

    /** ---------------------------
     * TOGGLE SECTOR NODE ACTIVE STATUS
     * --------------------------- */
    toggleSectorNodeStatus: builder.mutation<
      SectorNode,
      { id: string; data: ToggleSectorNodeStatusPayload }
    >({
      query: ({ id, data }) => ({
        url: `/sector-nodes/${id}/toggle-status`,
        method: "PATCH",
        body: data,
      }),
      transformResponse: (response: any): SectorNode => response.data,
      invalidatesTags: (_r, _e, { id }) => [
        { type: "SectorNode", id },
        "SectorNode",
      ],
    }),

    /** ---------------------------
     * GET SECTOR NODE USERS
     * --------------------------- */
    getSectorNodeUsers: builder.query<User[], string>({
      query: (id) => `/sector-nodes/users/${id}`,
      transformResponse: (response: any): User[] => response.data,
      providesTags: (_r, _e, id) => [{ type: "SectorNode", id }, "SectorNode"],
    }),

    /** ---------------------------
     * GET SECTOR NODE CHILDREN USERS
     * --------------------------- */
    getSectorNodeChildrenUsers: builder.query<User[], string>({
      query: (id) => `/sector-nodes/children-users/${id}`,
      transformResponse: (response: any): User[] => response.data,
      providesTags: (_r, _e, id) => [{ type: "SectorNode", id }, "SectorNode"],
    }),
  }),
});

export const {
  useGetSectorNodesQuery,
  useGetSectorNodesWithFlatChildrenQuery,
  useGetSectorNodeByIdQuery,
  useCreateSectorNodeMutation,
  useUpdateSectorNodeMutation,
  useDeleteSectorNodeMutation,
  useToggleSectorNodeStatusMutation,
  useGetSectorNodeChildrenUsersQuery,
  useGetSectorNodeUsersQuery,
} = sectorNodeApi;
