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
  submit_location?: SubmitLocation;
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
  /** My tasks only: sections opened for update after submitting */
  open_update?: { until: string | null; section_keys: string[]; section_labels: string[] } | null;
  /** Submitted ones: the latest "open for update" (open, done, or closed before Done) */
  update_state?: UpdateState | null;
}

/** until: null = no deadline */
export interface UpdateState {
  state: "open" | "done" | "closed";
  until: string | null;
  sections: string[];
  done_at: string | null;
  closed_at: string | null;
  opening_id: string;
}

export interface TaskEvent {
  event_id: string;
  type: "started" | "submitted" | "returned" | "reassigned" | "due_changed" | "office_update" | "update_opened" | "update_saved" | "update_done" | "update_closed" | "update_changed";
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

/** Where an inspection was submitted (the phone's location when Submit was pressed) */
export type SubmitLocation = {
  lat?: number;
  lng?: number;
  accuracy?: number;
  captured_at?: string;
  error?: string;
  place?: { label: string; woreda?: string | null; zone?: string | null; region?: string | null } | null;
  /** Where the submission was relative to the license area (when the license has one) */
  site?: { inside: boolean; distance_m: number } | null;
} | null;

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
  /**
   * update: sections opened for update after submitting (update_sections); the team saves them and taps "Done updating".
   * open_sections: may open sections of this submitted inspection for update (reviewers).
   */
  can: { fill: boolean; return: boolean; reassign: boolean; fill_after_submit?: boolean; update?: boolean; update_sections?: string[]; open_sections?: boolean };
  /** Sections open for update right now (null when none) */
  open_update?: { section_keys: string[]; section_labels: string[]; until: string | null; openings: OpeningOfTask[] } | null;
  /** Answers changed after submitting: question key → when and by whom */
  updated_answers?: Record<string, { at: string; by: string }>;
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
  /** Submitted tasks with sections open for update */
  to_update?: TaskListItem[];
  counts: Record<TaskGroup | "open" | "to_update", number>;
}

/* ---- Sections of submitted inspections opened for update ---- */

export type OpeningScope = "inspection" | "licenses" | "round" | "team" | "region";

export interface OpeningOfTask {
  opening_id: string;
  section_keys: string[];
  section_labels: string[];
  until: string | null;
  reason: string;
  opened_by: { user_id: string; full_name: string } | null;
  opened_at: string;
}

export interface SectionOpening {
  opening_id: string;
  scope: OpeningScope;
  scope_details: { schedule_id?: string | null; occurrence_date?: string | null; team_id?: string | null; region_id?: string | null; region_name?: string | null } | null;
  schedule_id: string | null;
  schedule?: { schedule_id: string; name: string } | null;
  section_keys: string[];
  section_labels: string[];
  reason: string;
  /** null = no deadline */
  until: string | null;
  created_at: string;
  closed_at: string | null;
  close_reason: "manual" | "deadline" | "all_done" | null;
  opener?: { user_id: string; full_name: string } | null;
  closer?: { user_id: string; full_name: string } | null;
  is_open: boolean;
  total: number;
  done: number;
}

export interface OpeningItem {
  inspection_id: string;
  company: string | null;
  license_number: string | null;
  team: { team_id: string; name: string } | null;
  submitted_at: string | null;
  status: "waiting" | "done";
  done_at: string | null;
  done_by: { user_id: string; full_name: string } | null;
  changed: number;
}

export interface SectionOpeningDetail extends SectionOpening {
  items: OpeningItem[];
  /** Sections that can be chosen when editing */
  sections: OpeningPreview["sections"];
}

/** An open opening the same inspections could be added to (merge) */
export interface MergeCandidate {
  opening_id: string;
  section_keys: string[];
  section_labels: string[];
  until: string | null;
  reason: string;
  total: number;
  done: number;
}

/** The numbers on the "Opened for update" page */
export interface OpeningTotals {
  open_openings: number;
  waiting: number;
  done: number;
  total: number;
  closed_not_done: number;
  tabs: { open: number; closed: number; all: number };
}

export interface OpeningPreview {
  count: number;
  too_many: boolean;
  sections: { key: string; number: string | null; title: string; questions: number; required: number }[];
  inspections: {
    inspection_id: string;
    company: string | null;
    license_number: string | null;
    team: { team_id: string; name: string } | null;
    submitted_at: string | null;
    open_now: boolean;
    /** Sections open for update right now */
    open_sections: string[];
  }[];
  openings: MergeCandidate[];
}

export interface OpeningScopeQuery {
  scope: OpeningScope;
  inspection_id?: string;
  schedule_id?: string;
  occurrence_date?: string;
  inspection_ids?: string[];
  team_id?: string;
  region_id?: string;
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
