/** What a field team sees about itself (backend controllers/team-controllers/myTeamController.js). */
import type { LicenseTypeKey } from "./form";
import type { Frequency } from "./inspection";
import type { LicenseBoundary } from "@/utils/licenseArea";

export interface MyTeamMember {
  team_member_id: string;
  user_id: string;
  full_name: string;
  email: string | null;
  phone_number: string | null;
  profile_image: string | null;
  is_active: boolean;
  role: "leader" | "member";
  joined_on: string;
  is_me: boolean;
}

export interface MyTeam {
  team: { team_id: string; name: string; code: string | null; is_active: boolean };
  my_role: "leader" | "member";
  members: MyTeamMember[];
  license_count: number;
  company_count: number;
}

export interface MyLicense {
  license_id: string;
  license_number: string;
  license_type: LicenseTypeKey;
  site_name: string | null;
  status: string;
  mineral_text: string | null;
  minerals: string | null;
  issued_on: string | null;
  expires_on: string | null;
  expired: boolean;
  region: string | null;
  zone: string | null;
  woreda: string | null;
  company_id: string;
  company_name: string;
  company_name_am: string | null;
  contact_person: string | null;
  contact_phone: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  forms: { schedule_id: string; schedule_name: string; form_id: string; form_name: string; frequency: Frequency; due_days: number }[];
  last_inspection: { inspection_id: string; score: number | null; submitted_at: string; is_late: boolean; form_name: string } | null;
  recent_scores: (number | null)[];
  inspection_count: number;
  open_tasks: { inspection_id: string; due_at: string; status: string; return_count: number; form_name: string; is_overdue: boolean }[];
  /** Surveyed license area (null when not in the coordinate list) */
  boundary: LicenseBoundary | null;
  center_lat: number | null;
  center_lng: number | null;
  travel_mode: "car" | "plane" | null;
  airport: string | null;
  notes: string | null;
}

export interface TeamStats {
  tasks: number;
  submitted: number;
  on_time: number;
  late: number;
  open: number;
  overdue: number;
  avg_score: number | null;
}

export interface MyStats {
  team: { team_id: string; name: string };
  overall: TeamStats;
  this_month: TeamStats;
  me: { submitted: number; late: number; returned: number; avg_score: number | null };
  weekly: { week: string; submitted: number; mine: number }[];
  by_company: { company_id: string; company_name: string; scores: (number | null)[]; last_at: string }[];
  recent: { inspection_id: string; submitted_at: string; score: number | null; is_late: boolean; company_name: string; license_number: string; form_name: string; submitted_by_name: string | null }[];
}
