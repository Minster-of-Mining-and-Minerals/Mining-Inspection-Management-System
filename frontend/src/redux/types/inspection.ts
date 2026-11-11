/** Inspection schedules and their tasks. Mirrors backend controllers/inspection-controllers. */
import type { FormDefinition, LicenseTypeKey } from "./form";
import type { LicenseBoundary } from "@/utils/licenseArea";

export type Frequency = "once" | "daily" | "weekly" | "monthly" | "quarterly" | "yearly" | "every_n_days";
export type ScheduleTarget = "assigned" | "license_type" | "licenses";
export type ScheduleStatus = "active" | "paused" | "ended";
export type TaskStatus = "todo" | "in_progress" | "submitted";

export interface OccurrenceStats {
  occurrence_date: string;
  total: number;
  submitted: number;
  late: number;
  in_progress: number;
  overdue: number;
  no_team: number;
  due_at: string;
}

export interface Schedule {
  schedule_id: string;
  form_id: string;
  name: string;
  target_type: ScheduleTarget;
  license_type: LicenseTypeKey | null;
  frequency: Frequency;
  interval_days: number | null;
  weekdays: number[] | null;
  month_day: number | null;
  start_date: string;
  end_date: string | null;
  due_days: number;
  status: ScheduleStatus;
  notes: string | null;
  created_at: string;
  form?: { form_id: string; name: string; name_am: string | null; code: string | null };
  license_count: number;
  current: OccurrenceStats | null;
  occurrence_count: number;
  totals: { total: number; submitted: number; late: number; overdue: number };
  next_dates: string[];
}

export interface ScheduleDetail extends Schedule {
  licenses_without_team: number;
  occurrences: OccurrenceStats[];
  licenses: { license_id: string; license_number: string; license_type: LicenseTypeKey; site_name: string | null; company?: { company_id: string; name: string } }[];
}

export interface SchedulePayload {
  form_id?: string;
  name?: string;
  target_type?: ScheduleTarget;
  license_type?: LicenseTypeKey | null;
  license_ids?: string[];
  frequency?: Frequency;
  interval_days?: number | null;
  weekdays?: number[] | null;
  month_day?: number | null;
  start_date?: string;
  end_date?: string | null;
  due_days?: number;
  notes?: string | null;
  status?: ScheduleStatus;
}

export interface SchedulePreview {
  license_count: number;
  licenses_without_team: number;
  next: { opens: string; due_at: string }[];
}

export interface TaskListItem {
  inspection_id: string;
  schedule_id: string | null;
  form_id: string;
  form_version_id: string | null;
  license_id: string;
  company_id: string;
  team_id: string | null;
  occurrence_date: string;
  due_at: string;
  status: TaskStatus;
  score: number | null;
  started_at: string | null;
  last_saved_at: string | null;
  submitted_at: string | null;
  is_late: boolean;
  return_count: number;
  is_overdue: boolean;
  company?: { company_id: string; name: string; name_am: string | null };
  license?: { license_id: string; license_number: string; license_type: LicenseTypeKey; site_name: string | null };
  team?: { team_id: string; name: string; code: string | null } | null;
  form?: { form_id: string; name: string; name_am: string | null; code: string | null };
  schedule?: { schedule_id: string; name: string; frequency: Frequency } | null;
  submitter?: { user_id: string; full_name: string } | null;
  /** My tasks only: which tab it belongs to, the license's area and how much is answered */
  group?: TaskGroup;
  area?: { region: string | null; zone: string | null; woreda: string | null } | null;
  progress?: { answered: number; total: number } | null;
}

export interface TaskEvent {
  event_id: string;
  type: "started" | "submitted" | "returned" | "reassigned" | "due_changed";
  details: Record<string, any> | null;
  created_at: string;
  user?: { user_id: string; full_name: string } | null;
}

export interface InspectionFile {
  file_id: string;
  inspection_id: string;
  field_key: string;
  kind: "image" | "document" | "video" | "signature";
  original_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string | null;
  created_at: string;
  uploader?: { user_id: string; full_name: string } | null;
}

export interface TaskDetail extends TaskListItem {
  files: InspectionFile[];
  answers: Record<string, any>;
  submit_location: {
    lat?: number;
    lng?: number;
    accuracy?: number;
    captured_at?: string;
    error?: string;
    place?: { label: string; woreda?: string | null; zone?: string | null; region?: string | null } | null;
    /** Where the submission was relative to the license area (when the license has one) */
    site?: { inside: boolean; distance_m: number } | null;
  } | null;
  submit_device: Record<string, any> | null;
  submit_ip?: string | null;
  last_saved_by: string | null;
  lastSaver?: { user_id: string; full_name: string } | null;
  events: TaskEvent[];
  version: { version_id: string; version_number: number; definition: FormDefinition } | null;
  prefill: Record<string, string>;
  /** Current members of the team (not when submitted): rows of tables with team_rows */
  team_member_names?: string[];
  /** fill_after_submit: the team can still fill the sections marked after_submit (e.g. 4.1) once submitted */
  can: { fill: boolean; return: boolean; reassign: boolean; fill_after_submit?: boolean };
  /** The license area for the site map */
  site: {
    boundary: LicenseBoundary | null;
    center_lat: number | null;
    center_lng: number | null;
    travel_mode: "car" | "plane" | null;
    airport: string | null;
    notes: string | null;
  } | null;
}

/** returned (sent back for correction) › overdue › in_progress › todo; then submitted */
export type TaskGroup = "returned" | "overdue" | "in_progress" | "todo" | "submitted";

export interface MyTasks {
  team: { team_id: string; name: string; code: string | null } | null;
  role?: "leader" | "member";
  todo: TaskListItem[];
  submitted: TaskListItem[];
  counts: Record<TaskGroup | "open", number>;
}

export interface AnswerProblem {
  key: string;
  label: string;
  problem: string;
}

export const FREQUENCY_LABEL: Record<Frequency, string> = {
  once: "Once",
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Every 3 months",
  yearly: "Yearly",
  every_n_days: "Every few days",
};

export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const WEEKDAY_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
