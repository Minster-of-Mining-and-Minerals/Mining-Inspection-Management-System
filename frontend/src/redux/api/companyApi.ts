import { baseApi } from "../baseApi";
import { PaginationMeta } from "../types/common";
import {
  Company,
  CompanyLicense,
  CompanyListParams,
  CompanyPayload,
  CompanyStats,
  LicenseArea,
  LicenseMapParams,
  LicensePayload,
  MapLicenseRow,
  Mineral,
  MineralCategory,
  MineralCategoryPayload,
  MineralPayload,
} from "../types/company";

/** Companies, their licenses and the standard minerals list. */

/** What deleting a license would remove */
export interface LicenseDeleteCheck {
  submitted: number;
  tasks: { inspection_id: string; status: "todo" | "in_progress"; occurrence_date: string; team: string | null; schedule: string | null; answers: number; files: number }[];
}

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

    /** What deleting a license would remove: its inspection tasks never submitted (submitted ones block it) */
    getLicenseDeleteCheck: builder.query<LicenseDeleteCheck, string>({
      query: (licenseId) => `/licenses/${licenseId}/delete-check`,
      transformResponse: (response: { data: LicenseDeleteCheck }) => response.data,
    }),
    /** withTasks: also its tasks never submitted; withAnswers: needed when some of them have saved answers or files */
    deleteLicense: builder.mutation<{ data: Company; message: string }, { licenseId: string; companyId: string; withTasks?: boolean; withAnswers?: boolean }>({
      query: ({ licenseId, withTasks, withAnswers }) => ({
        url: `/licenses/${licenseId}`,
        method: "DELETE",
        params: { ...(withTasks ? { with_tasks: 1 } : {}), ...(withAnswers ? { with_answers: 1 } : {}) },
      }),
      transformResponse: (response: { data: Company; message: string }) => response,
      invalidatesTags: (_r, _e, { companyId }) => [{ type: "Company", id: companyId }, "Company", "Mineral"],
    }),

    /** A license's surveyed area (corner points) */
    getLicenseArea: builder.query<LicenseArea, string>({
      query: (licenseId) => `/licenses/${licenseId}/area`,
      transformResponse: (response: any): LicenseArea => response.data,
      providesTags: (_r, _e, id) => [{ type: "Company", id: `area-${id}` }],
    }),

    /** Set it from typed points (Adindan or WGS84), or { clear: true } */
    setLicenseArea: builder.mutation<{ data: LicenseArea; message: string }, { licenseId: string; companyId: string; body: { datum: "adindan" | "wgs84"; parts: { lat: number; lng: number }[][] } | { clear: true } }>({
      query: ({ licenseId, body }) => ({ url: `/licenses/${licenseId}/area`, method: "PUT", body }),
      transformResponse: (response: any) => ({ data: response.data, message: response.message }),
      invalidatesTags: (_r, _e, { companyId, licenseId }) => [{ type: "Company", id: companyId }, { type: "Company", id: `area-${licenseId}` }, "Company", "Inspection"],
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
  useGetLicenseAreaQuery,
  useSetLicenseAreaMutation,
  useGetCompaniesQuery,
  useGetCompanyStatsQuery,
  useGetCompanyByIdQuery,
  useCreateCompanyMutation,
  useUpdateCompanyMutation,
  useAddLicenseMutation,
  useUpdateLicenseMutation,
  useDeleteLicenseMutation,
  useGetLicenseDeleteCheckQuery,
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
