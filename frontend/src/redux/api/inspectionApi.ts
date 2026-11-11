import { baseApi } from "../baseApi";
import { PaginationMeta } from "../types/common";
import { MyTasks, Schedule, ScheduleDetail, SchedulePayload, SchedulePreview, TaskDetail, TaskListItem } from "../types/inspection";

export interface TaskListParams {
  schedule_id?: string;
  occurrence_date?: string;
  status?: "todo" | "in_progress" | "open" | "submitted" | "late" | "on_time" | "overdue" | "no_team" | "returned";
  form_id?: string;
  submitted_by?: string;
  license_type?: string;
  region_id?: string;
  /** YYYY-MM-DD; of the submission day (default) or, with date_field=assigned, of the round day */
  from?: string;
  to?: string;
  date_field?: "submitted" | "assigned";
  sort?: "score";
  team_id?: string;
  license_id?: string;
  company_id?: string;
  search?: string;
  page?: number;
  limit?: number;
}

/** Tasks of one team (or no team) matching the list's other filters */
export interface TeamProgress {
  team_id: string | null;
  name: string;
  total: number;
  todo: number;
  in_progress: number;
  submitted: number;
  overdue: number;
}

/** Inspection schedules (admin) and their tasks (teams fill them). */
export const inspectionApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getSchedules: builder.query<Schedule[], { form_id?: string; status?: string } | void>({
      query: (params) => ({ url: "/inspection-schedules", params: params || undefined }),
      transformResponse: (response: any): Schedule[] => response.data ?? [],
      providesTags: ["Schedule"],
    }),
    getScheduleById: builder.query<ScheduleDetail, string>({
      query: (id) => `/inspection-schedules/${id}`,
      transformResponse: (response: any): ScheduleDetail => response.data,
      providesTags: (_r, _e, id) => [{ type: "Schedule", id }],
    }),
    previewSchedule: builder.mutation<SchedulePreview, SchedulePayload>({
      query: (body) => ({ url: "/inspection-schedules/preview", method: "POST", body }),
      transformResponse: (response: any): SchedulePreview => response.data,
    }),
    createSchedule: builder.mutation<{ schedule_id: string; tasks_created: number; message: string }, SchedulePayload>({
      query: (body) => ({ url: "/inspection-schedules", method: "POST", body }),
      transformResponse: (response: any) => ({ ...response.data, message: response.message }),
      invalidatesTags: ["Schedule", "Inspection"],
    }),
    updateSchedule: builder.mutation<{ schedule_id: string; tasks_created: number; message: string }, { id: string; data: SchedulePayload }>({
      query: ({ id, data }) => ({ url: `/inspection-schedules/${id}`, method: "PUT", body: data }),
      transformResponse: (response: any) => ({ ...response.data, message: response.message }),
      invalidatesTags: ["Schedule", "Inspection"],
    }),
    deleteSchedule: builder.mutation<unknown, string>({
      query: (id) => ({ url: `/inspection-schedules/${id}`, method: "DELETE" }),
      invalidatesTags: ["Schedule", "Inspection"],
    }),

    getTasks: builder.query<{ data: TaskListItem[]; meta: PaginationMeta }, TaskListParams>({
      query: (params) => ({ url: "/inspections", params }),
      transformResponse: (response: any) => ({ data: response.data ?? [], meta: response.meta }),
      providesTags: ["Inspection"],
    }),
    getTeamProgress: builder.query<TeamProgress[], Omit<TaskListParams, "team_id" | "status" | "page" | "limit">>({
      query: (params) => ({ url: "/inspections/team-progress", params }),
      transformResponse: (response: { data?: TeamProgress[] }): TeamProgress[] => response.data ?? [],
      providesTags: ["Inspection"],
    }),
    getMyTasks: builder.query<MyTasks, void>({
      query: () => "/inspections/my",
      transformResponse: (response: any): MyTasks => response.data,
      providesTags: ["Inspection"],
    }),
    getLicenseHistory: builder.query<TaskListItem[], string>({
      query: (licenseId) => `/inspections/license/${licenseId}`,
      transformResponse: (response: any): TaskListItem[] => response.data ?? [],
      providesTags: ["Inspection"],
    }),
    getTask: builder.query<TaskDetail, string>({
      query: (id) => `/inspections/${id}`,
      transformResponse: (response: any): TaskDetail => response.data,
      providesTags: (_r, _e, id) => [{ type: "Inspection", id }],
    }),
    /** Autosave: no tag invalidation, so the form being filled isn't reloaded under the user */
    saveAnswers: builder.mutation<{ last_saved_at: string; status: string }, { id: string; answers: Record<string, any>; base_saved_at: string | null }>({
      query: ({ id, ...body }) => ({ url: `/inspections/${id}/answers`, method: "PUT", body }),
      transformResponse: (response: any) => response.data,
    }),
    /** After submitting: the sections filled in at the office (after_submit) only */
    saveOfficeAnswers: builder.mutation<{ last_saved_at: string; status: string }, { id: string; answers: Record<string, unknown>; base_saved_at: string | null }>({
      query: ({ id, ...body }) => ({ url: `/inspections/${id}/office-answers`, method: "PUT", body }),
      transformResponse: (response: { data: { last_saved_at: string; status: string } }) => response.data,
    }),
    submitTask: builder.mutation<
      { status: string; is_late: boolean; score: number | null },
      { id: string; answers: Record<string, any>; base_saved_at: string | null; location: Record<string, any> | null; device: Record<string, any> | null }
    >({
      query: ({ id, ...body }) => ({ url: `/inspections/${id}/submit`, method: "POST", body }),
      transformResponse: (response: any) => response.data,
      invalidatesTags: ["Inspection", "Schedule"],
    }),
    returnTask: builder.mutation<unknown, { id: string; reason: string }>({
      query: ({ id, reason }) => ({ url: `/inspections/${id}/return`, method: "POST", body: { reason } }),
      invalidatesTags: ["Inspection", "Schedule"],
    }),
    updateTaskAssignment: builder.mutation<unknown, { id: string; team_id?: string | null; due_at?: string }>({
      query: ({ id, ...body }) => ({ url: `/inspections/${id}/assignment`, method: "PUT", body }),
      invalidatesTags: ["Inspection", "Schedule"],
    }),
  }),
});

export const {
  useGetSchedulesQuery,
  useGetScheduleByIdQuery,
  usePreviewScheduleMutation,
  useCreateScheduleMutation,
  useUpdateScheduleMutation,
  useDeleteScheduleMutation,
  useGetTasksQuery,
  useGetTeamProgressQuery,
  useGetMyTasksQuery,
  useGetLicenseHistoryQuery,
  useGetTaskQuery,
  useSaveAnswersMutation,
  useSaveOfficeAnswersMutation,
  useSubmitTaskMutation,
  useReturnTaskMutation,
  useUpdateTaskAssignmentMutation,
} = inspectionApi;
