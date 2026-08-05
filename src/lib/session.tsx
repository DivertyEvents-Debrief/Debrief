import * as React from 'react'
import type { Session } from '@supabase/supabase-js'
import { getSupabase } from '@/lib/supabase/client'
import type { AppPermission, UserRole } from '@/lib/types'

/**
 * Session du navigateur.
 *
 * Ce contexte remplace le middleware Next.js, qui n'a plus de serveur où
 * s'exécuter. La nuance est importante : il ne SÉCURISE rien. Un visiteur
 * peut forcer l'affichage d'un écran de l'espace permanent en bricolant le
 * JavaScript — il n'en obtiendra aucune donnée, parce que le contrôle réel
 * vit dans les politiques RLS et dans `filter_debriefs()`. Ce que fait ce
 * contexte, c'est éviter d'afficher des écrans vides et des menus inutiles.
 */

export interface CurrentProfile {
  id: string
  first_name: string
  last_name: string | null
  role: UserRole
  active: boolean
  permissions: AppPermission[]
}

interface SessionState {
  loading: boolean
  session: Session | null
  profile: CurrentProfile | null
  signOut: () => Promise<void>
  refresh: () => Promise<void>
}

const SessionContext = React.createContext<SessionState | null>(null)

async function fetchProfile(userId: string): Promise<CurrentProfile | null> {
  const supabase = getSupabase()

  const [{ data: profile }, { data: permissions }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, first_name, last_name, role, active')
      .eq('id', userId)
      .maybeSingle(),
    supabase.from('profile_permissions').select('permission').eq('profile_id', userId),
  ])

  if (!profile) return null

  return {
    ...(profile as Omit<CurrentProfile, 'permissions'>),
    permissions: (permissions ?? []).map((p: { permission: AppPermission }) => p.permission),
  }
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = React.useState(true)
  const [session, setSession] = React.useState<Session | null>(null)
  const [profile, setProfile] = React.useState<CurrentProfile | null>(null)

  const load = React.useCallback(async (next: Session | null) => {
    setSession(next)
    setProfile(next?.user ? await fetchProfile(next.user.id) : null)
    setLoading(false)
  }, [])

  React.useEffect(() => {
    const supabase = getSupabase()
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (active) void load(data.session)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) void load(next)
    })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [load])

  const value = React.useMemo<SessionState>(
    () => ({
      loading,
      session,
      profile,
      signOut: async () => {
        await getSupabase().auth.signOut()
      },
      refresh: async () => {
        const { data } = await getSupabase().auth.getSession()
        await load(data.session)
      },
    }),
    [loading, session, profile, load],
  )

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionState {
  const context = React.useContext(SessionContext)
  if (!context) throw new Error('useSession doit être utilisé dans un SessionProvider.')
  return context
}

/** Confort d'affichage uniquement : la base tranche, pas le navigateur. */
export function useCan(permission: AppPermission): boolean {
  const { profile } = useSession()
  if (!profile) return false
  return profile.role === 'admin' || profile.permissions.includes(permission)
}
