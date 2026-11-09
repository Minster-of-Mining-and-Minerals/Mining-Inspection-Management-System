import { baseApi } from "../baseApi";
import type { MyLicense, MyStats, MyTeam } from "../types/myWork";

/** The signed-in user's own team, its companies and progress. */
export const myWorkApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getMyTeam: builder.query<MyTeam | null, void>({
      query: () => "/teams/mine",
      transformResponse: (response: any): MyTeam | null => response.data ?? null,
      providesTags: ["Team"],
    }),
    getMyLicenses: builder.query<MyLicense[], void>({
      query: () => "/teams/mine/licenses",
      transformResponse: (response: any): MyLicense[] => response.data ?? [],
      providesTags: ["Team", "Inspection"],
    }),
    getMyStats: builder.query<MyStats | null, void>({
      query: () => "/inspections/my/stats",
      transformResponse: (response: any): MyStats | null => response.data ?? null,
      providesTags: ["Inspection"],
    }),
  }),
});

export const { useGetMyTeamQuery, useGetMyLicensesQuery, useGetMyStatsQuery } = myWorkApi;
