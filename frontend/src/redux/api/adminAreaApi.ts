import { baseApi } from "../baseApi";
import { PaginationMeta } from "../types/common";
import {
  AdminArea,
  AdminAreaDetail,
  AdminAreaListParams,
  AdminAreaStats,
  CreateAdminAreaPayload,
  UpdateAdminAreaPayload,
} from "../types/adminArea";

/** Region → Zone → Woreda reference list (/api/admin-areas). */
export const adminAreaApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getAdminAreas: builder.query<{ data: AdminArea[]; meta: PaginationMeta }, AdminAreaListParams>({
      query: (params) => ({ url: "/admin-areas", params }),
      transformResponse: (response: any) => ({ data: response.data ?? [], meta: response.meta }),
      providesTags: ["AdminArea"],
    }),

    getAdminAreaStats: builder.query<AdminAreaStats, void>({
      query: () => "/admin-areas/stats",
      transformResponse: (response: any): AdminAreaStats => response.data,
      providesTags: ["AdminArea"],
    }),

    getAdminAreaById: builder.query<AdminAreaDetail, string>({
      query: (id) => `/admin-areas/${id}`,
      transformResponse: (response: any): AdminAreaDetail => response.data,
      providesTags: (_r, _e, id) => [{ type: "AdminArea", id }],
    }),

    createAdminArea: builder.mutation<AdminArea, CreateAdminAreaPayload>({
      query: (body) => ({ url: "/admin-areas", method: "POST", body }),
      transformResponse: (response: any): AdminArea => response.data,
      invalidatesTags: ["AdminArea"],
    }),

    updateAdminArea: builder.mutation<AdminArea, { id: string; data: UpdateAdminAreaPayload }>({
      query: ({ id, data }) => ({ url: `/admin-areas/${id}`, method: "PUT", body: data }),
      transformResponse: (response: any): AdminArea => response.data,
      invalidatesTags: (_r, _e, { id }) => [{ type: "AdminArea", id }, "AdminArea"],
    }),

    addAreaAlias: builder.mutation<unknown, { id: string; alias: string }>({
      query: ({ id, alias }) => ({ url: `/admin-areas/${id}/aliases`, method: "POST", body: { alias } }),
      invalidatesTags: (_r, _e, { id }) => [{ type: "AdminArea", id }, "AdminArea"],
    }),

    deleteAreaAlias: builder.mutation<unknown, { aliasId: string; areaId: string }>({
      query: ({ aliasId }) => ({ url: `/admin-areas/aliases/${aliasId}`, method: "DELETE" }),
      invalidatesTags: (_r, _e, { areaId }) => [{ type: "AdminArea", id: areaId }, "AdminArea"],
    }),
  }),
});

export const {
  useGetAdminAreasQuery,
  useGetAdminAreaStatsQuery,
  useGetAdminAreaByIdQuery,
  useCreateAdminAreaMutation,
  useUpdateAdminAreaMutation,
  useAddAreaAliasMutation,
  useDeleteAreaAliasMutation,
} = adminAreaApi;
