export interface LoginCredentials {
  email: string;
  password: string;
}

export interface Permission {
  permission_id: string;
  name: string;
  key: string;
}

export interface Role {
  role_id: string;
  name: string;
  description?: string | null;
  is_active?: boolean;
  permissions: Permission[];
  /** null = global role every sector can use; set = this sector's own role */
  sector_node_id?: string | null;
  sector?: { sector_node_id: string; name: string; name_am?: string | null } | null;
  copied_from_role_id?: string | null;
  copiedFrom?: { role_id: string; name: string } | null;
  /** Flags from the API for the signed-in user */
  is_global?: boolean;
  can_edit?: boolean;
  can_assign?: boolean;
}

export interface User {
  user_id: string;
  full_name: string;
  email: string;
  phone_number: string;
  profile_image: string | null;
  is_first_logged_in: boolean;
}

// Auth Response Matching The Backend
export interface AuthResponse {
  token: string;
  user: User | null;
  roles: Role[];
  message: string;
}
