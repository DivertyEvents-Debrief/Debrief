import { getSupabase, SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/supabase/client'
import type { GrantablePermission, UserRole } from '@/lib/types'

export type AdminResult<T> = { ok: true; data: T } | { ok: false; error: string }

export interface Account {
  id: string
  first_name: string
  last_name: string | null
  email: string
  role: UserRole
  active: boolean
  selectable_as_commercial: boolean
  notification_preference: string
  sort_order: number
  last_login_at: string | null
  created_at: string
  permissions: GrantablePermission[]
  debrief_count: number
}

export interface Referent {
  id: string
  display_name: string
  internal_identifier: string | null
  active: boolean
  sort_order: number
}

export interface Status {
  id: string
  code: string
  label: string
  description: string | null
  tone: string
  icon: string | null
  is_default: boolean
  is_terminal: boolean
  active: boolean
  sort_order: number
}

export interface Setting {
  key: string
  value: unknown
  description: string | null
  updated_at: string
}

export interface LogEntry {
  id: string
  action: string
  previous_value: unknown
  new_value: unknown
  created_at: string
  debrief_id: string | null
  reference: string | null
  author: string
}

// ---------------------------------------------------------------------
// Lectures — via les fonctions SQL, qui refont le contrôle du rôle
// ---------------------------------------------------------------------

export async function fetchAccounts(): Promise<Account[]> {
  const { data, error } = await getSupabase().rpc('admin_accounts')
  if (error) throw new Error("Les comptes n'ont pas pu être chargés.")
  return (data ?? []) as Account[]
}

export async function fetchReferents(): Promise<Referent[]> {
  const { data, error } = await getSupabase()
    .from('referents')
    .select('id, display_name, internal_identifier, active, sort_order')
    .order('sort_order')
    .order('display_name')
  if (error) throw new Error("Les référents n'ont pas pu être chargés.")
  return (data ?? []) as Referent[]
}

export async function fetchStatuses(): Promise<Status[]> {
  const { data, error } = await getSupabase().from('statuses').select('*').order('sort_order')
  if (error) throw new Error("Les statuts n'ont pas pu être chargés.")
  return (data ?? []) as Status[]
}

export async function fetchSettings(): Promise<Setting[]> {
  const { data, error } = await getSupabase().rpc('admin_settings')
  if (error) throw new Error("Les réglages n'ont pas pu être chargés.")
  return (data ?? []) as Setting[]
}

export async function fetchActivityLog(limit = 50, offset = 0) {
  const { data, error } = await getSupabase().rpc('admin_activity_log', {
    p_limit: limit,
    p_offset: offset,
  })
  if (error) throw new Error("Le journal n'a pas pu être chargé.")
  return data as { total: number; limit: number; rows: LogEntry[] }
}

// ---------------------------------------------------------------------
// Écritures directes — les politiques RLS `*_admin` font le tri
// ---------------------------------------------------------------------

export async function updateAccount(id: string, patch: Partial<Account>): Promise<void> {
  const { permissions, debrief_count, ...columns } = patch as Record<string, unknown> & {
    permissions?: unknown
    debrief_count?: unknown
  }
  void permissions
  void debrief_count

  const { error } = await getSupabase().from('profiles').update(columns).eq('id', id)
  if (error) {
    throw new Error(
      error.code === '42501'
        ? "Seul un administrateur peut modifier le rôle ou l'activation d'un compte."
        : "Le compte n'a pas pu être modifié.",
    )
  }
}

export async function setPermission(
  profileId: string,
  permission: GrantablePermission,
  granted: boolean,
): Promise<void> {
  const supabase = getSupabase()
  const { error } = granted
    ? await supabase.from('profile_permissions').insert({ profile_id: profileId, permission })
    : await supabase
        .from('profile_permissions')
        .delete()
        .eq('profile_id', profileId)
        .eq('permission', permission)

  if (error) throw new Error("La permission n'a pas pu être modifiée.")
}

export async function saveReferent(referent: Partial<Referent>): Promise<void> {
  const supabase = getSupabase()
  const { error } = referent.id
    ? await supabase.from('referents').update(referent).eq('id', referent.id)
    : await supabase.from('referents').insert(referent)
  if (error) throw new Error("Le référent n'a pas pu être enregistré.")
}

/**
 * Import en masse. Un référent déjà présent sous le même nom n'est pas
 * dupliqué : la colonne normalisée sert de repère, ce qui évite qu'un
 * accent ou une majuscule crée un doublon invisible dans les statistiques.
 */
export async function importReferents(
  rows: { display_name: string; internal_identifier?: string }[],
  existing: Referent[],
): Promise<{ created: number; skipped: number }> {
  const normalize = (value: string) =>
    value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim()

  const known = new Set(existing.map((r) => normalize(r.display_name)))
  const fresh = rows.filter((row) => row.display_name && !known.has(normalize(row.display_name)))

  if (fresh.length > 0) {
    const { error } = await getSupabase().from('referents').insert(
      fresh.map((row, index) => ({
        display_name: row.display_name.trim(),
        internal_identifier: row.internal_identifier?.trim() || null,
        sort_order: 100 + index,
      })),
    )
    if (error) throw new Error("L'import a échoué.")
  }

  return { created: fresh.length, skipped: rows.length - fresh.length }
}

export async function deleteReferent(id: string): Promise<void> {
  const { error } = await getSupabase().from('referents').delete().eq('id', id)
  if (error) {
    throw new Error(
      error.code === '23503'
        ? 'Ce référent a déjà envoyé des débriefings : désactivez-le au lieu de le supprimer.'
        : "Le référent n'a pas pu être supprimé.",
    )
  }
}

export async function saveStatus(status: Partial<Status>): Promise<void> {
  const supabase = getSupabase()
  const { error } = status.id
    ? await supabase.from('statuses').update(status).eq('id', status.id)
    : await supabase.from('statuses').insert(status)
  if (error) throw new Error("Le statut n'a pas pu être enregistré.")
}

export async function saveSetting(key: string, value: unknown): Promise<void> {
  const { error } = await getSupabase().rpc('admin_set_setting', { p_key: key, p_value: value })
  if (error) throw new Error(`Le réglage « ${key} » n'a pas pu être enregistré.`)
}

// ---------------------------------------------------------------------
// Création de comptes — passe par la fonction Edge
// ---------------------------------------------------------------------

async function callAdminFunction<T>(payload: Record<string, unknown>): Promise<AdminResult<T>> {
  const { data: sessionData } = await getSupabase().auth.getSession()
  const token = sessionData.session?.access_token

  if (!token) return { ok: false, error: 'Session expirée. Reconnectez-vous.' }

  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/admin-users`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(payload),
    })
    const body = (await response.json().catch(() => null)) as AdminResult<T> | null
    return body ?? { ok: false, error: "Le serveur n'a pas répondu correctement." }
  } catch {
    return { ok: false, error: 'Connexion perdue. Réessayez.' }
  }
}

export function createAccount(input: {
  email: string
  first_name: string
  last_name: string
  role: UserRole
}) {
  return callAdminFunction<{ id: string; email: string; password: string }>({
    action: 'create',
    ...input,
  })
}

export function resetPassword(userId: string) {
  return callAdminFunction<{ password: string }>({ action: 'reset-password', user_id: userId })
}

export function syncRole(userId: string, role: UserRole) {
  return callAdminFunction<{ synced: boolean }>({ action: 'sync-role', user_id: userId, role })
}
