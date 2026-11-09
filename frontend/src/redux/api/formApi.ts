import { baseApi } from "../baseApi";
import {
  AssignmentTarget,
  FormAssignment,
  FormCompareResult,
  FormVersionEditEntry,
  FormDefinition,
  FormDetail,
  FormListItem,
  FormVersionFull,
  LicenseTypeKey,
} from "../types/form";

const formTags = (id: string) => [{ type: "Form" as const, id }, "Form" as const];

/** Inspection forms: list, versions (draft → publish) and who they are for. */
export const formApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getForms: builder.query<FormListItem[], { search?: string; is_active?: boolean } | void>({
      query: (params) => ({ url: "/forms", params: params || undefined }),
      transformResponse: (response: any): FormListItem[] => response.data ?? [],
      providesTags: ["Form"],
    }),

    getFormById: builder.query<FormDetail, string>({
      query: (id) => `/forms/${id}`,
      transformResponse: (response: any): FormDetail => response.data,
      providesTags: (_r, _e, id) => [{ type: "Form", id }],
    }),

    getFormVersion: builder.query<FormVersionFull, { formId: string; versionId: string }>({
      query: ({ formId, versionId }) => `/forms/${formId}/versions/${versionId}`,
      transformResponse: (response: any): FormVersionFull => response.data,
    }),

    createForm: builder.mutation<FormDetail, { name: string; name_am?: string | null; code?: string | null; description?: string | null }>({
      query: (body) => ({ url: "/forms", method: "POST", body }),
      transformResponse: (response: any): FormDetail => response.data,
      invalidatesTags: ["Form"],
    }),

    updateForm: builder.mutation<FormDetail, { id: string; data: { name?: string; name_am?: string | null; code?: string | null; description?: string | null; is_active?: boolean } }>({
      query: ({ id, data }) => ({ url: `/forms/${id}`, method: "PUT", body: data }),
      transformResponse: (response: any): FormDetail => response.data,
      invalidatesTags: (_r, _e, { id }) => formTags(id),
    }),

    createDraft: builder.mutation<FormDetail, string>({
      query: (id) => ({ url: `/forms/${id}/draft`, method: "POST" }),
      transformResponse: (response: any): FormDetail => response.data,
      invalidatesTags: (_r, _e, id) => formTags(id),
    }),

    saveDraft: builder.mutation<FormDetail, { id: string; definition: FormDefinition; change_note?: string | null }>({
      query: ({ id, definition, change_note }) => ({ url: `/forms/${id}/draft`, method: "PUT", body: { definition, change_note } }),
      transformResponse: (response: any): FormDetail => response.data,
      invalidatesTags: (_r, _e, { id }) => formTags(id),
    }),

    discardDraft: builder.mutation<FormDetail, string>({
      query: (id) => ({ url: `/forms/${id}/draft`, method: "DELETE" }),
      transformResponse: (response: any): FormDetail => response.data,
      invalidatesTags: (_r, _e, id) => formTags(id),
    }),

    publishDraft: builder.mutation<FormDetail, { id: string; change_note?: string | null }>({
      query: ({ id, change_note }) => ({ url: `/forms/${id}/publish`, method: "POST", body: { change_note } }),
      transformResponse: (response: any): FormDetail => response.data,
      invalidatesTags: (_r, _e, { id }) => formTags(id),
    }),

    /** Change the current version directly (admin). Rejects unsafe changes once inspections exist. */
    editLive: builder.mutation<FormDetail, { id: string; definition: FormDefinition; note?: string | null }>({
      query: ({ id, definition, note }) => ({ url: `/forms/${id}/live`, method: "PUT", body: { definition, note } }),
      transformResponse: (response: any): FormDetail => response.data,
      invalidatesTags: (_r, _e, { id }) => formTags(id),
    }),

    /** What changes compared with the current version (and whether they are safe). */
    compareWithCurrent: builder.mutation<FormCompareResult, { id: string; definition?: FormDefinition }>({
      query: ({ id, definition }) => ({ url: `/forms/${id}/compare`, method: "POST", body: definition ? { definition } : {} }),
      transformResponse: (response: any): FormCompareResult => response.data,
    }),

    getVersionEdits: builder.query<FormVersionEditEntry[], { formId: string; versionId: string }>({
      query: ({ formId, versionId }) => `/forms/${formId}/versions/${versionId}/edits`,
      transformResponse: (response: any): FormVersionEditEntry[] => response.data ?? [],
      providesTags: (_r, _e, { formId }) => [{ type: "Form", id: formId }],
    }),

    getFormAssignments: builder.query<{ data: FormAssignment[]; license_count: number }, string>({
      query: (id) => `/forms/${id}/assignments`,
      transformResponse: (response: any) => ({ data: response.data ?? [], license_count: response.meta?.license_count ?? 0 }),
      providesTags: (_r, _e, id) => [{ type: "Form", id: `assign-${id}` }],
    }),

    addFormAssignment: builder.mutation<
      FormAssignment,
      { formId: string; target_type: AssignmentTarget; license_type?: LicenseTypeKey; company_id?: string; license_id?: string }
    >({
      query: ({ formId, ...body }) => ({ url: `/forms/${formId}/assignments`, method: "POST", body }),
      transformResponse: (response: any): FormAssignment => response.data,
      invalidatesTags: (_r, _e, { formId }) => [{ type: "Form", id: `assign-${formId}` }, ...formTags(formId)],
    }),

    removeFormAssignment: builder.mutation<unknown, { formId: string; assignmentId: string }>({
      query: ({ assignmentId }) => ({ url: `/forms/assignments/${assignmentId}`, method: "DELETE" }),
      invalidatesTags: (_r, _e, { formId }) => [{ type: "Form", id: `assign-${formId}` }, ...formTags(formId)],
    }),
  }),
});

export const {
  useGetFormsQuery,
  useGetFormByIdQuery,
  useGetFormVersionQuery,
  useCreateFormMutation,
  useUpdateFormMutation,
  useCreateDraftMutation,
  useSaveDraftMutation,
  useDiscardDraftMutation,
  usePublishDraftMutation,
  useEditLiveMutation,
  useCompareWithCurrentMutation,
  useGetVersionEditsQuery,
  useGetFormAssignmentsQuery,
  useAddFormAssignmentMutation,
  useRemoveFormAssignmentMutation,
} = formApi;
