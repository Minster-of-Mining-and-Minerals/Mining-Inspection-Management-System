import { SectorNode } from "./sectorNode";

export interface UserType {
  user_type_id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface InternalUserType {
  internal_user_type_id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface UserPosition {
  user_position_id: string;
  name: string;
  description?: string;
  created_at: string;
  updated_at: string;
}

export interface Role {
  role_id: string;
  name: string;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface User {
  user_id: string;
  full_name: string;
  email: string;
  phone_number?: string;
  user_type_id: string;
  is_active: boolean;
  is_first_logged_in: boolean;
  last_login_at?: string;
  password_changed_at?: string;
  profile_image?: string;
  created_at: string;
  updated_at: string;
  userType?: UserType;
  internalUserType?: InternalUserType;
  sectorNode?: SectorNode;
  department?: SectorNode;
  roles?: Role[];
  /** Users list: the team the person is in now */
  current_team?: { team_id: string; name: string; code: string | null; member_role: "leader" | "member"; joined_on: string } | null;
  /** User page: all team memberships, current first */
  teamMemberships?: {
    team_member_id: string;
    role: "leader" | "member";
    joined_on: string;
    left_on: string | null;
    team: { team_id: string; name: string; code: string | null; is_active: boolean };
  }[];
}

// Payloads
export interface CreateUserPayload {
  full_name: string;
  email: string;
  phone_number?: string;
  user_type_id: string;
  sector_node_id?: string;
  department_id?: string;
  role_ids?: string[];
  /** Optional: put the new user straight into a team */
  team_id?: string;
  team_role?: "member" | "leader";
}

export interface UpdateUserPayload {
  full_name?: string;
  email?: string;
  phone_number?: string;
  user_type_id?: string;
  role_ids?: string[];
  is_active?: boolean;
  sector_node_id?: string;
  department_id?: string;
}

export interface ToggleUserStatusPayload {
  is_active: boolean;
}
