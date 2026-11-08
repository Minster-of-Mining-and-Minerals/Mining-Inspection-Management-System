export type AreaLevel = "region" | "zone" | "woreda";

export interface AreaRef {
  area_id: string;
  parent_id: string | null;
  level: AreaLevel;
  name: string;
  name_am: string | null;
  pcode?: string | null;
}

export interface AreaAlias {
  alias_id: string;
  alias: string;
  /** official = alternative name from the COD-AB dataset; confirmed = saved by a user */
  source: "official" | "confirmed";
  created_at: string;
}

export interface AdminArea extends AreaRef {
  pcode: string | null;
  source: "official" | "manual";
  center_lat: number | null;
  center_lng: number | null;
  area_sqkm: number | null;
  data_version: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  child_count?: number;
  /** In list results: parent, with its own parent (grandparent) */
  parent?: (AreaRef & { parent?: AreaRef | null }) | null;
}

export interface AdminAreaDetail extends AdminArea {
  ancestors: AreaRef[];
  aliases: AreaAlias[];
}

export interface AdminAreaStats {
  region: number;
  zone: number;
  woreda: number;
  inactive: number;
  aliases: number;
}

export interface AdminAreaListParams {
  level?: AreaLevel;
  /** an area id, or "null" for top level */
  parent_id?: string;
  search?: string;
  is_active?: boolean;
  page?: number;
  limit?: number;
}

export interface CreateAdminAreaPayload {
  level: AreaLevel;
  parent_id?: string | null;
  name: string;
  name_am?: string | null;
}

export interface UpdateAdminAreaPayload {
  name?: string;
  name_am?: string | null;
  is_active?: boolean;
}

export const CHILD_LEVEL: Record<AreaLevel, AreaLevel | null> = { region: "zone", zone: "woreda", woreda: null };

export const LEVEL_LABEL: Record<AreaLevel, { one: string; many: string; am: string }> = {
  region: { one: "Region", many: "Regions", am: "ክልል" },
  zone: { one: "Zone", many: "Zones", am: "ዞን" },
  woreda: { one: "Woreda", many: "Woredas", am: "ወረዳ" },
};
