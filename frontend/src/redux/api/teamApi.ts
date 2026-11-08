import { baseApi } from "../baseApi";
import { PaginationMeta } from "../types/common";
import { AssignableUser, Team, TeamDetail, TeamPayload, TeamRole } from "../types/team";

type TeamResult = TeamDetail;
const tags = (id: string) => [{ type: "Team" as const, id }, "Team" as const, "Company" as const];

/** Inspection teams, members and the licenses each team covers. */
export const teamApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getTeams: builder.query<{ data: Team[]; meta: PaginationMeta }, { search?: string; is_active?: boolean; page?: number; limit?: number } | void>({
      query: (params) => ({ url: "/teams", params: params || undefined }),
      transformResponse: (response: any) => ({ data: response.data ?? [], meta: response.meta }),
      providesTags: ["Team"],
    }),

    getTeamById: builder.query<TeamDetail, string>({
      query: (id) => `/teams/${id}`,
      transformResponse: (response: any): TeamDetail => response.data,
      providesTags: (_r, _e, id) => [{ type: "Team", id }],
    }),

    getAssignableUsers: builder.query<AssignableUser[], { search?: string } | void>({
      query: (params) => ({ url: "/teams/assignable-users", params: params || undefined }),
      transformResponse: (response: any): AssignableUser[] => response.data ?? [],
      providesTags: ["Team", "User"],
    }),

    createTeam: builder.mutation<TeamResult, TeamPayload & { name: string }>({
      query: (body) => ({ url: "/teams", method: "POST", body }),
      transformResponse: (response: any): TeamResult => response.data,
      invalidatesTags: ["Team"],
    }),

    updateTeam: builder.mutation<TeamResult, { id: string; data: TeamPayload }>({
      query: ({ id, data }) => ({ url: `/teams/${id}`, method: "PUT", body: data }),
      transformResponse: (response: any): TeamResult => response.data,
      invalidatesTags: (_r, _e, { id }) => tags(id),
    }),

    addTeamMember: builder.mutation<TeamResult, { teamId: string; data: { user_id: string; role?: TeamRole } }>({
      query: ({ teamId, data }) => ({ url: `/teams/${teamId}/members`, method: "POST", body: data }),
      transformResponse: (response: any): TeamResult => response.data,
      invalidatesTags: (_r, _e, { teamId }) => tags(teamId),
    }),

    updateTeamMember: builder.mutation<TeamResult, { teamId: string; memberId: string; role: TeamRole }>({
      query: ({ memberId, role }) => ({ url: `/team-members/${memberId}`, method: "PUT", body: { role } }),
      transformResponse: (response: any): TeamResult => response.data,
      invalidatesTags: (_r, _e, { teamId }) => tags(teamId),
    }),

    removeTeamMember: builder.mutation<TeamResult, { teamId: string; memberId: string; left_on?: string }>({
      query: ({ memberId, left_on }) => ({ url: `/team-members/${memberId}`, method: "DELETE", body: left_on ? { left_on } : {} }),
      transformResponse: (response: any): TeamResult => response.data,
      invalidatesTags: (_r, _e, { teamId }) => tags(teamId),
    }),

    addTeamLicenses: builder.mutation<TeamResult, { teamId: string; license_ids: string[] }>({
      query: ({ teamId, license_ids }) => ({ url: `/teams/${teamId}/licenses`, method: "POST", body: { license_ids } }),
      transformResponse: (response: any): TeamResult => response.data,
      invalidatesTags: (_r, _e, { teamId }) => tags(teamId),
    }),

    removeTeamLicense: builder.mutation<TeamResult, { teamId: string; licenseId: string }>({
      query: ({ teamId, licenseId }) => ({ url: `/teams/${teamId}/licenses/${licenseId}`, method: "DELETE" }),
      transformResponse: (response: any): TeamResult => response.data,
      invalidatesTags: (_r, _e, { teamId }) => tags(teamId),
    }),
  }),
});

export const {
  useGetTeamsQuery,
  useGetTeamByIdQuery,
  useGetAssignableUsersQuery,
  useCreateTeamMutation,
  useUpdateTeamMutation,
  useAddTeamMemberMutation,
  useUpdateTeamMemberMutation,
  useRemoveTeamMemberMutation,
  useAddTeamLicensesMutation,
  useRemoveTeamLicenseMutation,
} = teamApi;
