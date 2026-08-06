import { getSupabase } from '@/lib/supabase/client'
import type { FormModule, FormSection } from '@/lib/types'

export type ModuleType =
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

export type FunctionalRole =
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

/** Libellés en français, groupés comme on les cherche dans un menu. */
export const MODULE_TYPES: { value: ModuleType; label: string; group: string }[] = [
  { value: 'short_text', label: 'Texte court', group: 'Saisie' },
  { value: 'long_text', label: 'Texte long', group: 'Saisie' },
  { value: 'date', label: 'Date', group: 'Saisie' },
  { value: 'select', label: 'Liste déroulante', group: 'Choix' },
  { value: 'searchable_select', label: 'Liste avec recherche', group: 'Choix' },
  { value: 'single_choice', label: 'Choix unique', group: 'Choix' },
  { value: 'multiple_choice', label: 'Choix multiple', group: 'Choix' },
  { value: 'yes_no', label: 'Oui / Non', group: 'Choix' },
  { value: 'rating_5', label: 'Note sur 5', group: 'Évaluation' },
  { value: 'custom_rating', label: 'Échelle personnalisée', group: 'Évaluation' },
  { value: 'repeatable_group', label: 'Lignes répétables (matériel)', group: 'Spécial' },
  { value: 'image_upload', label: 'Envoi de photos', group: 'Spécial' },
  { value: 'section_title', label: 'Titre intermédiaire', group: 'Mise en page' },
  { value: 'explanation', label: 'Texte explicatif', group: 'Mise en page' },
  { value: 'info_message', label: 'Encadré d\u2019information', group: 'Mise en page' },
  { value: 'divider', label: 'Séparateur', group: 'Mise en page' },
]

export const FUNCTIONAL_ROLES: { value: FunctionalRole; label: string; unique: boolean }[] = [
  { value: 'none', label: 'Aucun — question libre', unique: false },
  { value: 'referent', label: 'Référent', unique: true },
  { value: 'event_date', label: "Date de l\u2019événement", unique: true },
  { value: 'commercial', label: 'Commercial', unique: true },
  { value: 'client_name', label: 'Nom du client / prestation', unique: true },
  { value: 'overall_rating', label: 'Note globale', unique: false },
  { value: 'internal_rating', label: 'Satisfaction interne', unique: false },
  { value: 'callback_request', label: 'Demande de rappel', unique: false },
  { value: 'callback_details', label: 'Motif du rappel', unique: false },
  { value: 'material_feedback', label: 'Retours matériel', unique: false },
  { value: 'attachments', label: 'Photos', unique: false },
]

/** Ces rôles alimentent des colonnes dédiées : ils sont obligatoires. */
export const REQUIRED_ROLES: FunctionalRole[] = [
  'referent',
  'event_date',
  'commercial',
  'client_name',
]

export interface VersionSummary {
  id: string
  version_number: number
  label: string | null
  status: 'draft' | 'published' | 'archived'
  published_at: string | null
  created_at: string
  module_count: number
  debrief_count: number
  author: string | null
}

export interface VersionDetail {
  version: {
    id: string
    version_number: number
    label: string | null
    status: 'draft' | 'published' | 'archived'
    published_at: string | null
    debrief_count: number
  }
  sections: FormSection[]
  modules: FormModule[]
  used_module_ids: string[]
}

function wrap(error: { code?: string; message?: string } | null, fallback: string): never | void {
  if (!error) return
  throw new Error(
    error.code === '42501'
      ? "Vous n'avez pas l'autorisation de modifier le formulaire."
      : error.message?.startsWith('Cette version')
        ? error.message
        : fallback,
  )
}

export async function fetchVersions(): Promise<VersionSummary[]> {
  const { data, error } = await getSupabase().rpc('form_versions_overview')
  wrap(error, "Les versions n'ont pas pu être chargées.")
  return (data ?? []) as VersionSummary[]
}

export async function fetchVersion(id: string): Promise<VersionDetail> {
  const { data, error } = await getSupabase().rpc('form_version_detail', { p_version_id: id })
  wrap(error, "Cette version n'a pas pu être chargée.")
  return data as VersionDetail
}

export async function duplicateVersion(sourceId: string, label?: string): Promise<string> {
  const { data, error } = await getSupabase().rpc('duplicate_form_version', {
    p_source_id: sourceId,
    p_label: label ?? null,
  })
  wrap(error, "La copie n'a pas pu être créée.")
  return data as string
}

export async function saveModule(versionId: string, module: Record<string, unknown>) {
  const { data, error } = await getSupabase().rpc('save_form_module', {
    p_version_id: versionId,
    p_module: module,
  })
  wrap(error, "Le module n'a pas pu être enregistré.")
  return data as string
}

export async function reorderModules(versionId: string, orderedIds: string[]) {
  const { error } = await getSupabase().rpc('reorder_form_modules', {
    p_version_id: versionId,
    p_ordered_ids: orderedIds,
  })
  wrap(error, "L'ordre n'a pas pu être enregistré.")
}

/** Renvoie 'deleted' ou 'archived' selon que le module avait déjà servi. */
export async function removeModule(moduleId: string): Promise<'deleted' | 'archived'> {
  const { data, error } = await getSupabase().rpc('remove_form_module', { p_module_id: moduleId })
  wrap(error, "Le module n'a pas pu être retiré.")
  return data as 'deleted' | 'archived'
}

export async function saveSection(versionId: string, section: Record<string, unknown>) {
  const { data, error } = await getSupabase().rpc('save_form_section', {
    p_version_id: versionId,
    p_section: section,
  })
  wrap(error, "La section n'a pas pu être enregistrée.")
  return data as string
}

export async function checkVersion(versionId: string) {
  const { data, error } = await getSupabase().rpc('check_form_version', { p_version_id: versionId })
  wrap(error, "Le contrôle n'a pas pu être effectué.")
  return data as { ready: boolean; problems: string[] }
}

export async function publishVersion(versionId: string) {
  const { error } = await getSupabase().rpc('publish_form_version', { p_version_id: versionId })
  wrap(error, "La publication a échoué.")
}

/**
 * Clé technique proposée à partir du titre. Elle identifie la réponse en
 * base et dans les exports : on la garde lisible, sans accent ni espace.
 */
export function suggestKey(title: string, existing: string[]): string {
  const base =
    title
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 40) || 'question'

  if (!existing.includes(base)) return base

  let suffix = 2
  while (existing.includes(`${base}_${suffix}`)) suffix += 1
  return `${base}_${suffix}`
}
