/**
 * Types métier de l'application.
 *
 * `src/lib/database.types.ts` est généré depuis Supabase
 * (`npx supabase gen types typescript --linked > src/lib/database.types.ts`).
 * Les types ci-dessous décrivent les formes réellement manipulées par l'UI,
 * y compris les retours JSON des fonctions RPC statistiques.
 */

export type UserRole = 'admin' | 'commercial_plus' | 'commercial'

export type AppPermission =
  | 'debriefs:read_all'
  | 'debriefs:update'
  | 'debriefs:reassign'
  | 'debriefs:delete'
  | 'notes:write'
  | 'statistics_full'
  | 'form_builder'
  | 'export_global'
  | 'users:manage'
  | 'referents:manage'
  | 'settings:manage'
  | 'logs:read'

export type NotificationPreference = 'immediate' | 'daily_digest' | 'callback_only' | 'none'

export type FormModuleType =
  | 'section_title'
  | 'explanation'
  | 'short_text'
  | 'long_text'
  | 'date'
  | 'select'
  | 'searchable_select'
  | 'single_choice'
  | 'multiple_choice'
  | 'yes_no'
  | 'rating_5'
  | 'custom_rating'
  | 'repeatable_group'
  | 'image_upload'
  | 'divider'
  | 'info_message'

export type ModuleFunctionalRole =
  | 'referent'
  | 'event_date'
  | 'commercial'
  | 'client_name'
  | 'overall_rating'
  | 'internal_rating'
  | 'callback_request'
  | 'callback_details'
  | 'material_feedback'
  | 'attachments'
  | 'none'

/** Rôles qu'une version publiée doit obligatoirement couvrir, une seule fois. */
export const REQUIRED_FUNCTIONAL_ROLES: ModuleFunctionalRole[] = [
  'referent',
  'event_date',
  'commercial',
  'client_name',
]

export interface ModuleConfiguration {
  options?: { value: string | number; label: string; emoji?: string }[]
  fields?: {
    key: string
    label: string
    type: 'text' | 'suggest' | 'long_text'
    source?: string
    required?: boolean
    placeholder?: string
  }[]
  source?: 'referents' | 'commercials' | 'materials'
  min_length?: number
  max_length?: number
  min_items?: number
  max_items?: number
  rows?: number
  scale?: number
  add_label?: string
  yes_label?: string
  no_label?: string
  default?: 'today' | string
  max_offset_days?: number
  max_files?: number
  max_file_size_mb?: number
  accepted_formats?: string[]
  visible_when?: { field: string; equals: unknown }
}

export interface FormModule {
  id: string
  form_version_id: string
  section_key: string
  technical_key: string
  module_type: FormModuleType
  functional_role: ModuleFunctionalRole
  title: string
  help_text: string | null
  placeholder: string | null
  required: boolean
  active: boolean
  archived_at: string | null
  include_in_statistics: boolean
  sort_order: number
  configuration: ModuleConfiguration
}

export interface FormSection {
  id: string
  section_key: string
  title: string
  description: string | null
  sort_order: number
  active: boolean
}

export interface PublicFormDefinition {
  versionId: string
  versionNumber: number
  sections: FormSection[]
  modules: FormModule[]
  referents: { id: string; display_name: string }[]
  commercials: { id: string; display_name: string }[]
  materialSuggestions: string[]
  settings: AppSettings
}

export interface AppSettings {
  platform_name: string
  logo_url: string | null
  primary_color: string
  secondary_color: string
  welcome_message: string
  confirmation_message: string
  privacy_notice: string
  privacy_policy_url: string | null
  retention_months: number
  callback_details_enabled: boolean
  max_files: number
  max_file_size_mb: number
  max_total_size_mb: number
  accepted_formats: string[]
  public_access_mode: 'open' | 'code'
  captcha_enabled: boolean
  honeypot_enabled: boolean
  rate_limit_per_hour: number
  email_notifications_enabled: boolean
}

export interface StatusRow {
  id: string
  code: string
  label: string
  description: string | null
  icon: string
  tone: 'neutral' | 'info' | 'attention' | 'progress' | 'success' | 'muted'
  is_default: boolean
  is_terminal: boolean
  sort_order: number
  active: boolean
}

export interface DebriefListItem {
  id: string
  public_reference: string
  event_date: string
  submitted_at: string
  client_or_service_name: string
  referent_name: string
  commercial_name: string
  commercial_id: string
  overall_rating: number | null
  internal_satisfaction_rating: number | null
  callback_requested: boolean
  callback_handled_at: string | null
  status_code: string
  status_label: string
  read_at: string | null
  attachment_count: number
  material_feedback_count: number
}

/** Filtres partagés par la liste et par le module de statistiques. */
export interface DebriefFilters {
  date_field?: 'event_date' | 'submitted_at'
  date_from?: string
  date_to?: string
  commercial_ids?: string[]
  referent_ids?: string[]
  status_codes?: string[]
  form_version_ids?: string[]
  overall_ratings?: string[]
  internal_ratings?: string[]
  client?: string
  callback?: 'yes' | 'no' | 'pending'
  has_images?: 'yes' | 'no'
  has_material?: 'yes' | 'no'
  read_state?: 'read' | 'unread'
  archived?: 'include'
  search?: string
}

export interface StatsKpis {
  current: Record<string, number | null>
  previous: Record<string, number | null> | null
  previous_period: { date_from: string; date_to: string } | null
  total_all_time: number
  generated_at: string
}

export interface StatAlert {
  code: string
  severity: 'attention' | 'info'
  title: string
  description: string
  filters: DebriefFilters
}

/** Payload envoyé par le formulaire public à la Server Action d'envoi. */
export interface DebriefSubmissionPayload {
  answers: Record<string, unknown>
  material_feedback: { material_name: string; feedback: string }[]
  attachments: {
    storage_path: string
    original_name: string
    mime_type: string
    file_size: number
    width?: number
    height?: number
  }[]
}
