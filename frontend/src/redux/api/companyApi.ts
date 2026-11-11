import { baseApi } from "../baseApi";
import { PaginationMeta } from "../types/common";
import {
  Company,
  CompanyLicense,
  CompanyListParams,
  CompanyPayload,
  CompanyStats,
  LicenseMapParams,
  LicensePayload,
  MapLicenseRow,
  Mineral,
  MineralCategory,
  MineralCategoryPayload,
  MineralPayload,
} from "../types/company";

/** Companies, their licenses and the standard minerals list. */
export const companyApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getCompanies: builder.query<{ data: Company[]; meta: PaginationMeta }, CompanyListParams>({
      query: (params) => ({ url: "/companies", params }),
      transformResponse: (response: any) => ({ data: response.data ?? [], meta: response.meta }),
      providesTags: ["Company"],
    }),

    getCompanyStats: builder.query<CompanyStats, void>({
      query: () => "/companies/stats",
      transformResponse: (response: any): CompanyStats => response.data,
      providesTags: ["Company"],
    }),

    getCompanyById: builder.query<Company, string>({
      query: (id) => `/companies/${id}`,
      transformResponse: (response: any): Company => response.data,
      providesTags: (_r, _e, id) => [{ type: "Company", id }],
    }),

    createCompany: builder.mutation<Company, CompanyPayload & { licenses?: LicensePayload[] }>({
      query: (body) => ({ url: "/companies", method: "POST", body }),
      transformResponse: (response: any): Company => response.data,
      invalidatesTags: ["Company"],
    }),

    updateCompany: builder.mutation<Company, { id: string; data: CompanyPayload }>({
      query: ({ id, data }) => ({ url: `/companies/${id}`, method: "PUT", body: data }),
      transformResponse: (response: any): Company => response.data,
      invalidatesTags: (_r, _e, { id }) => [{ type: "Company", id }, "Company"],
    }),

    addLicense: builder.mutation<Company, { companyId: string; data: LicensePayload }>({
      query: ({ companyId, data }) => ({ url: `/companies/${companyId}/licenses`, method: "POST", body: data }),
      transformResponse: (response: any): Company => response.data,
      invalidatesTags: (_r, _e, { companyId }) => [{ type: "Company", id: companyId }, "Company", "Mineral"],
    }),

    updateLicense: builder.mutation<Company, { licenseId: string; companyId: string; data: LicensePayload }>({
      query: ({ licenseId, data }) => ({ url: `/licenses/${licenseId}`, method: "PUT", body: data }),
      transformResponse: (response: any): Company => response.data,
      invalidatesTags: (_r, _e, { companyId }) => [{ type: "Company", id: companyId }, "Company", "Mineral"],
    }),

    deleteLicense: builder.mutation<Company, { licenseId: string; companyId: string }>({
      query: ({ licenseId }) => ({ url: `/licenses/${licenseId}`, method: "DELETE" }),
      transformResponse: (response: any): Company => response.data,
      invalidatesTags: (_r, _e, { companyId }) => [{ type: "Company", id: companyId }, "Company", "Mineral"],
    }),

    getLicenses: builder.query<{ data: CompanyLicense[]; meta: PaginationMeta }, CompanyListParams>({
      query: (params) => ({ url: "/licenses", params }),
      transformResponse: (response: any) => ({ data: response.data ?? [], meta: response.meta }),
      providesTags: ["Company"],
    }),

    /** License areas for the companies map, with the list's filters */
    getLicenseMap: builder.query<{ data: MapLicenseRow[]; meta: { licenses: number; companies: number; without_area: number } }, LicenseMapParams>({
      query: (params) => ({ url: "/licenses/map", params }),
      transformResponse: (response: any) => ({ data: response.data ?? [], meta: response.meta }),
      providesTags: ["Company", "Inspection"],
    }),

    getMinerals: builder.query<Mineral[], { search?: string; is_active?: boolean; category_id?: string } | void>({
      query: (params) => ({ url: "/minerals", params: params || undefined }),
      transformResponse: (response: any): Mineral[] => response.data ?? [],
      providesTags: ["Mineral"],
    }),

    createMineral: builder.mutation<Mineral, MineralPayload & { name: string; category_id: string }>({
      query: (body) => ({ url: "/minerals", method: "POST", body }),
      transformResponse: (response: any): Mineral => response.data,
      invalidatesTags: ["Mineral"],
    }),

    updateMineral: builder.mutation<Mineral, { id: string; data: MineralPayload }>({
      query: ({ id, data }) => ({ url: `/minerals/${id}`, method: "PUT", body: data }),
      transformResponse: (response: any): Mineral => response.data,
      invalidatesTags: ["Mineral", "Company"],
    }),

    getMineralCategories: builder.query<MineralCategory[], { is_active?: boolean } | void>({
      query: (params) => ({ url: "/mineral-categories", params: params || undefined }),
      transformResponse: (response: any): MineralCategory[] => response.data ?? [],
      providesTags: ["Mineral"],
    }),

    createMineralCategory: builder.mutation<MineralCategory, MineralCategoryPayload & { name: string }>({
      query: (body) => ({ url: "/mineral-categories", method: "POST", body }),
      transformResponse: (response: any): MineralCategory => response.data,
      invalidatesTags: ["Mineral"],
    }),

    updateMineralCategory: builder.mutation<MineralCategory, { id: string; data: MineralCategoryPayload }>({
      query: ({ id, data }) => ({ url: `/mineral-categories/${id}`, method: "PUT", body: data }),
      transformResponse: (response: any): MineralCategory => response.data,
      invalidatesTags: ["Mineral", "Company"],
    }),

    deleteMineralCategory: builder.mutation<unknown, string>({
      query: (id) => ({ url: `/mineral-categories/${id}`, method: "DELETE" }),
      invalidatesTags: ["Mineral"],
    }),
  }),
});

export const {
  useGetCompaniesQuery,
  useGetCompanyStatsQuery,
  useGetCompanyByIdQuery,
  useCreateCompanyMutation,
  useUpdateCompanyMutation,
  useAddLicenseMutation,
  useUpdateLicenseMutation,
  useDeleteLicenseMutation,
  useGetLicensesQuery,
  useGetLicenseMapQuery,
  useGetMineralsQuery,
  useCreateMineralMutation,
  useUpdateMineralMutation,
  useGetMineralCategoriesQuery,
  useCreateMineralCategoryMutation,
  useUpdateMineralCategoryMutation,
  useDeleteMineralCategoryMutation,
} = companyApi;
