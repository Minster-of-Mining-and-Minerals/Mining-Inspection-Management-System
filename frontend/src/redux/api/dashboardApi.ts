import { baseApi } from "../baseApi";

export interface MapPoint {
  inspection_id: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  submitted_at: string;
  is_late: boolean;
  score: number | null;
  company_name: string;
  license_number: string;
  license_type: "exploration" | "mining";
  team_name: string | null;
  submitted_by_name: string | null;
  form_name: string;
  /** Where it was submitted, named from the boundaries */
  place: { woreda?: string | null; zone?: string | null; region?: string | null; label: string; outside?: boolean } | null;
  user_agent: string | null;
  platform: string | null;
  device_id: string | null;
}

export interface MapCounts {
  submitted: number;
  on_map: number;
  no_location: number;
  low_accuracy: number;
  limited: boolean;
}

export interface MapFilters {
  from?: string;
  to?: string;
  team_id?: string;
  submitted_by?: string;
  form_id?: string;
  schedule_id?: string;
  company_id?: string;
  license_type?: string;
  region_id?: string;
  late?: string;
  score_min?: string;
  score_max?: string;
  /** metres; 0 = show all */
  max_accuracy?: number;
}

type Option = { id: string; name: string };
export interface MapOptions {
  teams: Option[];
  inspectors: Option[];
  forms: Option[];
  schedules: Option[];
  companies: Option[];
  regions: Option[];
}

export interface ResultTotals {
  submitted: number;
  on_time: number;
  late: number;
  avg_score: number | null;
  companies: number;
  licenses: number;
  returned: number;
  no_location: number;
}

export interface Analytics {
  period: { from: string | null; to: string | null; previous: { from: string; to: string } | null };
  workload: { due: number; submitted: number; overdue: number; open: number; no_team: number };
  results: ResultTotals;
  previous: ResultTotals | null;
  weekly: { week: string; on_time: number; late: number; avg_score: number | null }[];
  by_region: { region: string; region_id: string | null; submitted: number; avg_score: number | null }[];
  teams: { team: string; team_id: string | null; due: number; submitted: number; overdue: number; submitted_in_period: number; on_time: number; avg_score: number | null }[];
  lowest_companies: { company_id: string; company: string; submitted: number; avg_score: number; last_score: number | null; scores: (number | null)[] }[];
  /** Central users looking at all sectors: headline numbers per sector (otherwise null) */
  by_sector: {
    sector_node_id: string;
    sector: string;
    sector_am: string | null;
    due: number;
    completed: number;
    submitted: number;
    late: number;
    avg_score: number | null;
    overdue: number;
  }[] | null;
  answers: {
    distribution: { met: number; partial: number; not_met: number; not_counted: number };
    sections: { form: string; section: string; score: number; answers: number }[];
    top_not_met: { form: string; section: string; question: string; answered: number; not_met: number; rate: number }[];
    scanned: number;
    limited: boolean;
  };
}

/** Staff dashboard: totals and trends, and where inspections were submitted. */
export const dashboardApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getAnalytics: builder.query<Analytics, MapFilters>({
      query: (params) => ({ url: "/dashboard/analytics", params }),
      transformResponse: (response: any): Analytics => response.data,
      providesTags: ["Dashboard", "Inspection"],
    }),
    getSubmissionMap: builder.query<{ points: MapPoint[]; counts: MapCounts }, MapFilters>({
      query: (params) => ({ url: "/dashboard/submission-map", params }),
      transformResponse: (response: any) => response.data,
      providesTags: ["Dashboard", "Inspection"],
    }),
    getSubmissionMapOptions: builder.query<MapOptions, void>({
      query: () => "/dashboard/submission-map/options",
      transformResponse: (response: any) => response.data,
      providesTags: ["Dashboard"],
    }),
  }),
});

export const { useGetAnalyticsQuery, useGetSubmissionMapQuery, useGetSubmissionMapOptionsQuery } = dashboardApi;
