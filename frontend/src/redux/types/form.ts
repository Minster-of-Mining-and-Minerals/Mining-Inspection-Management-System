/** Inspection forms (checklists). Mirrors backend/utils/formDefinition.js. */

export type FieldType = "status" | "text" | "long_text" | "number" | "date" | "select" | "checkboxes" | "table" | "photo" | "signature";
export type LicenseTypeKey = "exploration" | "mining";
/** Kinds of file a question can take */
export type FileKind = "image" | "document" | "video";
/** Largest size an admin can allow per file (matches the server and nginx) */
export const MAX_FILE_MB = 100;

export interface ChoiceOption {
  value: string;
  label: string;
  label_am?: string | null;
}

export interface StatusOption extends ChoiceOption {
  /** Points for this choice (e.g. 1, 0.5, 0) or null = not counted */
  score: number | null;
  /** Kept for older versions: the inspector always writes a description now */
  note?: "optional" | "required";
  action: "none" | "required";
}

export interface ShowIf {
  field: string;
  in: string[];
}

export interface TableColumn {
  key: string;
  label: string;
  label_am?: string | null;
  /** signature: the cell holds the file id of the signature image */
  type: "text" | "number" | "date" | "select" | "signature";
  options?: ChoiceOption[];
}

export interface FormField {
  key: string;
  type: FieldType;
  label: string;
  label_am?: string | null;
  help?: string | null;
  help_am?: string | null;
  required?: boolean;
  show_if?: ShowIf;
  // type options
  /** Status questions: this question's own choices (none = the form's default choices) */
  status_options?: StatusOption[];
  evidence?: "none" | "optional" | "required";
  prefill?: string;
  unit?: string | null;
  min?: number;
  max?: number;
  options?: ChoiceOption[];
  columns?: TableColumn[];
  rows?: { label: string; label_am?: string | null }[];
  allow_add_rows?: boolean;
  /** Title of a table's first column (e.g. "Role type") */
  row_header?: string | null;
  row_header_am?: string | null;
  /** First column of a row added with "Add row", numbered ("Interviewed person 2") */
  new_row_label?: string | null;
  new_row_label_am?: string | null;
  /** Rows first, one per member of the inspection's team (their name in a "full_name" column) */
  team_rows?: { label: string; label_am?: string | null; min?: number; max?: number };
  /** photo / status evidence: which kinds, how many, how big (MB per file) */
  accept?: FileKind[];
  max_files?: number;
  max_size_mb?: number;
  multiple?: boolean;
  with_name?: boolean;
}

export interface FormSection {
  key: string;
  number?: string | null;
  title: string;
  title_am?: string | null;
  description?: string | null;
  description_am?: string | null;
  applies_to?: { license_types: LicenseTypeKey[] };
  show_if?: ShowIf;
  fields: FormField[];
}

export interface FormDefinition {
  status_options: StatusOption[];
  sections: FormSection[];
}

export interface DefinitionSummary {
  sections: number;
  questions: number;
  status_questions: number;
}

export type VersionStatus = "draft" | "published" | "retired";

export interface FormVersionMeta {
  version_id: string;
  form_id: string;
  version_number: number;
  status: VersionStatus;
  change_note: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
  summary: DefinitionSummary;
  /** Direct edits made to this version (without a new version) */
  edit_count?: number;
}

export interface FormVersionFull extends FormVersionMeta {
  definition: FormDefinition;
  /** Submitted inspections answered with this version (current version only) */
  inspection_count?: number;
}

/** Result of comparing a definition with the current version (backend utils/formDiff.js). */
export interface FormDiff {
  added: string[];
  removed: string[];
  reworded: string[];
  changed: string[];
  moved: number;
  sectionsAdded: string[];
  sectionsRemoved: string[];
  statusOptionsChanged: boolean;
  unsafe: string[];
  hasChanges: boolean;
  summary: string;
}

export interface FormCompareResult {
  first_version: boolean;
  current_version?: number;
  diff: FormDiff;
  inspections: number;
}

export interface FormVersionEditEntry {
  edit_id: string;
  version_id: string;
  summary: string;
  note: string | null;
  created_at: string;
  editor?: { user_id: string; full_name: string } | null;
}

export interface FormListItem {
  form_id: string;
  code: string | null;
  name: string;
  name_am: string | null;
  description: string | null;
  is_active: boolean;
  assignment_count: number;
  version_count: number;
  published: { version_id: string; version_number: number; published_at: string; summary: DefinitionSummary } | null;
  draft: { version_id: string; version_number: number; updated_at: string; summary: DefinitionSummary } | null;
}

export interface FormDetail extends Omit<FormListItem, "published" | "draft" | "version_count"> {
  published: FormVersionFull | null;
  draft: FormVersionFull | null;
  versions: FormVersionMeta[];
}

export type AssignmentTarget = "all" | "license_type" | "company" | "license";

export interface FormAssignment {
  assignment_id: string;
  form_id: string;
  target_type: AssignmentTarget;
  license_type: LicenseTypeKey | null;
  company_id: string | null;
  license_id: string | null;
  description: string;
  created_at: string;
}

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  status: "Status (ሁኔታ)",
  text: "Short text",
  long_text: "Long text",
  number: "Number",
  date: "Date",
  select: "One choice",
  checkboxes: "Several choices",
  table: "Table",
  photo: "File upload",
  signature: "Signature",
};

/** Where a text answer can be pre-filled from (backend PREFILL_SOURCES). */
export const PREFILL_LABEL: Record<string, string> = {
  "company.name": "Company name",
  "license.license_number": "License number",
  "license.license_type": "License type",
  "license.minerals": "License minerals",
  "license.region": "License region",
  "license.zone_woreda": "License zone / woreda",
  "license.site_name": "Mine site / project",
  "inspection.date": "Inspection date",
  "inspection.team": "Inspection team members",
  "company.contact_person": "Company focal person",
};

export const VERSION_STATUS_LABEL: Record<VersionStatus, string> = {
  draft: "Draft",
  published: "Current",
  retired: "Old version",
};
