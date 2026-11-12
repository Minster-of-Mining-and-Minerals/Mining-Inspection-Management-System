import { baseApi } from "../baseApi";

export interface AuditChange {
  model?: string;
  op?: "create" | "update" | "delete";
  id?: string | null;
  label?: string | null;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  where?: unknown;
  count?: number;
  more?: number;
}

export interface AuditEntry {
  audit_id: string;
  occurred_at: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string | null;
  outcome: "success" | "failure";
  status_code: number | null;
  message: string | null;
  method: string | null;
  path: string | null;
  ip: string | null;
  user_agent?: string | null;
  change_count?: number;
  changes?: AuditChange[] | null;
}

export interface AuditParams {
  search?: string;
  category?: string;
  outcome?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

/** The audit log (read only). */
export const auditApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getAuditLogs: builder.query<{ data: AuditEntry[]; meta: { totalItems: number; totalPages: number; currentPage: number; itemsPerPage: number } }, AuditParams>({
      query: (params) => ({ url: "/audit-logs", params }),
    }),
    getAuditEntry: builder.query<AuditEntry, string>({
      query: (id) => `/audit-logs/${id}`,
      transformResponse: (response: { data: AuditEntry }) => response.data,
    }),
  }),
});

export const { useGetAuditLogsQuery, useGetAuditEntryQuery } = auditApi;
