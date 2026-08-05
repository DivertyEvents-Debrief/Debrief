import { getSupabase } from '@/lib/supabase/client'
import type { DebriefFilters } from '@/lib/types'

/**
 * Accès aux données de l'espace permanent.
 *
 * Tout passe par des fonctions SQL : le périmètre de rôle est appliqué
 * dans `filter_debriefs()`, avant les filtres de l'écran. Un commercial
 * qui bricole les paramètres élargit son filtre, pas son périmètre.
 */

export interface DebriefRow {
  id: string
  public_reference: string
  event_date: string
  submitted_at: string
  client_or_service_name: string
  overall_rating: number | null
  internal_satisfaction_rating: number | null
  callback_requested: boolean
  callback_handled_at: string | null
  read_at: string | null
  attachment_count: number
  material_feedback_count: number
  referent: { id: string; display_name: string }
  commercial: { id: string; display_name: string }
  status: { code: string; label: string; tone: string; icon: string }
}

export interface DebriefPage {
  total: number
  limit: number
  offset: number
  rows: DebriefRow[]
}

export type SortKey =
  | 'submitted_desc'
  | 'submitted_asc'
  | 'event_desc'
  | 'event_asc'
  | 'rating_desc'
  | 'rating_asc'
  | 'client_asc'

export const SORT_LABELS: Record<SortKey, string> = {
  submitted_desc: 'Reçus, du plus récent',
  submitted_asc: 'Reçus, du plus ancien',
  event_desc: 'Date d\u2019événement, décroissante',
  event_asc: 'Date d\u2019événement, croissante',
  rating_desc: 'Note globale, décroissante',
  rating_asc: 'Note globale, croissante',
  client_asc: 'Client, A → Z',
}

export async function fetchDebriefs(
  filters: DebriefFilters,
  page: { limit: number; offset: number },
  sort: SortKey,
): Promise<DebriefPage> {
  const { data, error } = await getSupabase().rpc('list_debriefs', {
    p_filters: filters,
    p_limit: page.limit,
    p_offset: page.offset,
    p_sort: sort,
  })

  if (error) throw new Error("La liste n'a pas pu être chargée.")
  return data as DebriefPage
}

export interface FilterOptions {
  referents: { id: string; display_name: string }[]
  commercials: { id: string; display_name: string }[]
  statuses: { code: string; label: string; tone: string; icon: string }[]
}

export async function fetchFilterOptions(): Promise<FilterOptions> {
  const { data, error } = await getSupabase().rpc('list_filter_options')
  if (error) throw new Error("Les listes de filtres n'ont pas pu être chargées.")
  return data as FilterOptions
}

export interface ResponseEntry {
  id: string
  technical_key: string
  module: {
    title: string
    help_text: string | null
    module_type: string
    functional_role: string | null
    section_key: string | null
    sort_order: number
    options?: { value: string; label: string }[]
  }
  value: unknown
}

export interface DebriefDetail {
  debrief: {
    id: string
    public_reference: string
    event_date: string
    submitted_at: string
    client_or_service_name: string
    overall_rating: number | null
    internal_satisfaction_rating: number | null
    callback_requested: boolean
    callback_details: string | null
    callback_handled_at: string | null
    callback_handled_by: string | null
    read_at: string | null
    archived_at: string | null
    attachment_count: number
    material_feedback_count: number
    form_version_number: number
    referent: { id: string; display_name: string; internal_identifier: string | null }
    commercial: { id: string; display_name: string }
    status: { code: string; label: string; tone: string; icon: string; is_terminal: boolean }
  }
  responses: ResponseEntry[]
  materials: { id: string; material_name: string; feedback: string; category: string | null }[]
  attachments: {
    id: string
    storage_path: string
    original_name: string
    mime_type: string
    file_size: number
    width: number | null
    height: number | null
  }[]
  notes: {
    id: string
    content: string
    created_at: string
    updated_at: string
    author_id: string
    author: string
  }[]
  activity: {
    id: string
    action: string
    previous_value: unknown
    new_value: unknown
    created_at: string
    user: string
  }[]
}

export async function fetchDebriefDetail(id: string): Promise<DebriefDetail> {
  const { data, error } = await getSupabase().rpc('debrief_detail', { p_debrief_id: id })
  if (error) {
    throw new Error(
      error.code === '42501'
        ? "Ce débriefing ne fait pas partie de votre périmètre."
        : "Ce débriefing n'a pas pu être chargé.",
    )
  }
  if (!data) throw new Error('Débriefing introuvable.')
  return data as DebriefDetail
}

export async function markRead(id: string): Promise<void> {
  await getSupabase().rpc('mark_debrief_read', { p_debrief_id: id })
}

export async function changeStatus(id: string, statusCode: string): Promise<void> {
  const { error } = await getSupabase().rpc('change_debrief_status', {
    p_debrief_id: id,
    p_status_code: statusCode,
  })
  if (error) throw new Error("Le statut n'a pas pu être modifié.")
}

export async function setCallbackHandled(id: string, handled: boolean): Promise<void> {
  const { error } = await getSupabase().rpc('set_callback_handled', {
    p_debrief_id: id,
    p_handled: handled,
  })
  if (error) throw new Error("Le suivi du rappel n'a pas pu être mis à jour.")
}

export async function addInternalNote(debriefId: string, content: string, authorId: string) {
  const { error } = await getSupabase()
    .from('internal_notes')
    .insert({ debrief_id: debriefId, author_id: authorId, content })
  if (error) throw new Error("La note n'a pas pu être enregistrée.")
}

export async function deleteInternalNote(noteId: string) {
  const { error } = await getSupabase().from('internal_notes').delete().eq('id', noteId)
  if (error) throw new Error("La note n'a pas pu être supprimée.")
}

/**
 * URL de lecture temporaire d'une image. Le bucket est privé : aucune URL
 * permanente n'existe, et le lien signé expire au bout d'une heure.
 */
export async function signAttachment(path: string, seconds = 3600): Promise<string | null> {
  const { data } = await getSupabase().storage
    .from('debrief-attachments')
    .createSignedUrl(path, seconds)
  return data?.signedUrl ?? null
}

/**
 * Confort d'affichage : on n'affiche la corbeille que là où la suppression
 * a une chance de passer. La règle qui tranche est la politique RLS
 * `internal_notes_delete_own`.
 */
export function deleteNoteAllowed(
  noteAuthorId: string,
  currentUserId: string,
  isAdmin: boolean,
): boolean {
  return isAdmin || noteAuthorId === currentUserId
}
