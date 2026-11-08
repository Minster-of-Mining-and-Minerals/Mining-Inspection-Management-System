import type { AreaRef } from "./adminArea";

export type LicenseType = "exploration" | "mining";
export type LicenseStatus = "active" | "suspended" | "expired" | "revoked";
/** Editable grouping of minerals (Base Data → Mineral Categories). */
export interface MineralCategory {
  category_id: string;
  /** Stable key; "other" is the fallback category and cannot be removed */
  code?: string;
  name: string;
  name_am: string | null;
  sort_order?: number;
  is_active?: boolean;
  mineral_count?: number;
}

export interface Mineral {
  mineral_id: string;
  name: string;
  name_am: string | null;
  category_id: string;
  category?: MineralCategory | null;
  aliases?: string[];
  is_active?: boolean;
  license_count?: number;
}

export interface MineralPayload {
  name?: string;
  name_am?: string | null;
  category_id?: string;
  aliases?: string[];
  is_active?: boolean;
}

export interface MineralCategoryPayload {
  name?: string;
  name_am?: string | null;
  sort_order?: number;
  is_active?: boolean;
}

/** A license area with its parent (zone) and grandparent (region). */
export interface LicenseAreaRef extends AreaRef {
  center_lat?: number | null;
  center_lng?: number | null;
  parent?: (AreaRef & { parent?: AreaRef | null }) | null;
}

export interface CompanyLicense {
  license_id: string;
  company_id: string;
  license_number: string;
  license_type: LicenseType;
  mineral_text?: string | null;
  issued_on: string | null;
  expires_on?: string | null;
  date_note?: string | null;
  site_name?: string | null;
  status: LicenseStatus;
  notes?: string | null;
  minerals: Mineral[];
  areas: LicenseAreaRef[];
  /** Team(s) responsible for inspecting this license */
  teams?: { team_id: string; name: string; code: string | null; is_active: boolean }[];
  company?: { company_id: string; name: string; name_am: string | null; is_active: boolean };
}

export interface Company {
  company_id: string;
  name: string;
  name_am: string | null;
  tin: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  contact_person: string | null;
  contact_phone: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  license_count?: number;
  licenses: CompanyLicense[];
}

export interface CompanyStats {
  companies: number;
  licenses: number;
  exploration: number;
  mining: number;
  active_licenses: number;
}

export interface CompanyListParams {
  search?: string;
  area_id?: string;
  mineral_id?: string;
  license_type?: LicenseType;
  license_status?: LicenseStatus;
  is_active?: boolean;
  page?: number;
  limit?: number;
}

export interface CompanyPayload {
  name?: string;
  name_am?: string | null;
  tin?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  contact_person?: string | null;
  contact_phone?: string | null;
  notes?: string | null;
  is_active?: boolean;
}

export interface LicensePayload {
  license_number?: string;
  license_type?: LicenseType;
  status?: LicenseStatus;
  mineral_ids?: string[];
  area_ids?: string[];
  mineral_text?: string | null;
  issued_on?: string | null;
  expires_on?: string | null;
  date_note?: string | null;
  site_name?: string | null;
  notes?: string | null;
}

export const LICENSE_TYPE_LABEL: Record<LicenseType, string> = {
  exploration: "Exploration",
  mining: "Mining",
};

export const LICENSE_STATUS_LABEL: Record<LicenseStatus, string> = {
  active: "Active",
  suspended: "Suspended",
  expired: "Expired",
  revoked: "Revoked",
};

/** "Sherkole, Assosa, Benishangul-Gumuz" for a woreda; shorter for a zone or region. */
export const areaPath = (a: LicenseAreaRef) =>
  [a.name, a.parent?.name, a.parent?.parent?.name].filter(Boolean).join(", ");

/** Distinct region names a set of licenses is in. */
export const regionsOf = (licenses: CompanyLicense[]) => {
  const names = new Set<string>();
  for (const l of licenses)
    for (const a of l.areas) {
      const region = a.level === "region" ? a.name : a.level === "zone" ? a.parent?.name : a.parent?.parent?.name;
      if (region) names.add(region);
    }
  return [...names].sort();
};
