import { baseApi } from "../baseApi";
import { PaginationMeta } from "../types/common";
import { MyTasks, OpeningPreview, OpeningScopeQuery, OpeningTotals, Schedule, ScheduleDetail, SchedulePayload, SchedulePreview, SectionOpening, SectionOpeningDetail, TaskDetail, TaskListItem } from "../types/inspection";

export interface TaskListParams {
  schedule_id?: string;
  occurrence_date?: string;
  status?: "todo" | "in_progress" | "open" | "submitted" | "late" | "on_time" | "overdue" | "no_team" | "returned" | "open_update" | "updated";
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

    /* ---- Sections of submitted inspections opened for update ---- */
    /** Team: save the open sections (autosave, no reload) */
    saveUpdateAnswers: builder.mutation<{ last_saved_at: string; status: string; changed: string[] }, { id: string; answers: Record<string, unknown>; base_saved_at: string | null }>({
      query: ({ id, ...body }) => ({ url: `/inspections/${id}/update-answers`, method: "PUT", body }),
      transformResponse: (response: { data: { last_saved_at: string; status: string; changed: string[] } }) => response.data,
    }),
    /** Team: finished; the sections lock again */
    doneUpdating: builder.mutation<{ message: string }, string>({
      query: (id) => ({ url: `/inspections/${id}/done-updating`, method: "POST" }),
      invalidatesTags: ["Inspection", "Opening"],
    }),
    /** Reviewer: which submitted inspections a scope covers, and their sections */
    previewOpening: builder.query<OpeningPreview, OpeningScopeQuery>({
      query: ({ inspection_ids, ...q }) => ({ url: "/inspections/openings/preview", params: { ...q, ...(inspection_ids ? { inspection_ids: inspection_ids.join(",") } : {}) } }),
      transformResponse: (response: { data: OpeningPreview }) => response.data,
    }),
    /** until: end of a day; only_not_open skips those already open; merge_into adds to an open opening */
    createOpening: builder.mutation<
      { message: string },
      OpeningScopeQuery & { section_keys: string[]; until?: string; reason?: string; region_name?: string; only_not_open?: boolean; merge_into?: string }
    >({
      query: (body) => ({ url: "/inspections/openings", method: "POST", body }),
      invalidatesTags: ["Inspection", "Opening"],
    }),
    getOpenings: builder.query<SectionOpening[], { inspection_id?: string; schedule_id?: string; occurrence_date?: string; state?: "open" | "closed" }>({
      query: (params) => ({ url: "/inspections/openings", params }),
      transformResponse: (response: { data: SectionOpening[] }) => response.data,
      providesTags: ["Opening"],
    }),
    getOpening: builder.query<SectionOpeningDetail, string>({
      query: (id) => `/inspections/openings/${id}`,
      transformResponse: (response: { data: SectionOpeningDetail }) => response.data,
      providesTags: ["Opening"],
    }),
    /** The "Opened for update" page: openings with filters, and the totals */
    getOpeningsPage: builder.query<{ data: SectionOpening[]; totals: OpeningTotals }, { state?: "open" | "closed"; team_id?: string; search?: string }>({
      query: (params) => ({ url: "/inspections/openings", params: { ...params, totals: 1 } }),
      transformResponse: (response: { data: SectionOpening[]; totals: OpeningTotals }) => ({ data: response.data, totals: response.totals }),
      providesTags: ["Opening"],
    }),
    updateOpening: builder.mutation<{ message: string }, { id: string; section_keys?: string[]; until?: string; reason?: string }>({
      query: ({ id, ...body }) => ({ url: `/inspections/openings/${id}`, method: "PUT", body }),
      invalidatesTags: ["Inspection", "Opening"],
    }),
    /** Every open opening of a round, or of one inspection */
    closeAllOpenings: builder.mutation<{ message: string }, { schedule_id?: string; occurrence_date?: string; inspection_id?: string; all?: boolean }>({
      query: (body) => ({ url: "/inspections/openings/close-all", method: "POST", body }),
      invalidatesTags: ["Inspection", "Opening"],
    }),
    closeOpening: builder.mutation<{ message: string }, string>({
      query: (id) => ({ url: `/inspections/openings/${id}/close`, method: "POST" }),
      invalidatesTags: ["Inspection", "Opening"],
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
  useSaveUpdateAnswersMutation,
  useDoneUpdatingMutation,
  usePreviewOpeningQuery,
  useCreateOpeningMutation,
  useGetOpeningsQuery,
  useGetOpeningQuery,
  useCloseOpeningMutation,
  useGetOpeningsPageQuery,
  useUpdateOpeningMutation,
  useCloseAllOpeningsMutation,
} = inspectionApi;
