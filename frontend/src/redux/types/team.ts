import type { CompanyLicense } from "./company";

export type TeamRole = "leader" | "member";

export interface TeamUser {
  user_id: string;
  full_name: string;
  email: string;
  phone_number: string | null;
  is_active: boolean;
}

/** A user's membership of a team (a person is in at most one team at a time). */
export interface TeamMember {
  team_member_id: string;
  team_id: string;
  user_id: string;
  role: TeamRole;
  joined_on: string;
  left_on: string | null;
  user: TeamUser;
}

export interface Team {
  team_id: string;
  name: string;
  code: string | null;
  description: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  license_count?: number;
  members: TeamMember[];
}

export interface TeamDetail extends Team {
  licenses: CompanyLicense[];
}

export interface TeamRef {
  team_id: string;
  name: string;
  code: string | null;
  is_active?: boolean;
}

/** Someone who can be put in a team, with the team they are in now (if any). */
export interface AssignableUser extends TeamUser {
  current_team: TeamRef | null;
}

export interface TeamPayload {
  name?: string;
  code?: string | null;
  description?: string | null;
  is_active?: boolean;
}

export const memberName = (m: TeamMember) => m.user?.full_name || "—";
