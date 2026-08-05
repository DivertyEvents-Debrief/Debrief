/**
 * Tests d'autorisation exécutés contre une base Supabase locale
 * (`supabase start` puis `supabase db reset`).
 *
 * Ils vérifient la règle la plus importante du cahier des charges :
 * un commercial classique ne peut pas lire le débriefing d'un autre,
 * même en forgeant la requête lui-même.
 *
 *   TEST_SUPABASE_URL=... TEST_ANON_KEY=... npx vitest run tests/security.rls.test.ts
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { beforeAll, describe, expect, it } from 'vitest'

// Sans types générés (`supabase gen types`), le client déduit `never` pour
// toutes les tables. On travaille ici avec un schéma volontairement large :
// ces tests interrogent la base réelle, pas les types.
type AnyClient = SupabaseClient<any, 'public', any>

const url = process.env.TEST_SUPABASE_URL
const anonKey = process.env.TEST_ANON_KEY

const run = url && anonKey ? describe : describe.skip

run('périmètre des rôles', () => {
  let commercial: AnyClient
  let anonymous: AnyClient

  beforeAll(async () => {
    anonymous = createClient(url!, anonKey!)
    commercial = createClient(url!, anonKey!)
    await commercial.auth.signInWithPassword({
      email: process.env.TEST_COMMERCIAL_EMAIL!,
      password: process.env.TEST_COMMERCIAL_PASSWORD!,
    })
  })

  it('un visiteur non authentifié ne lit aucun débriefing', async () => {
    const { data } = await anonymous.from('debriefs').select('id')
    expect(data ?? []).toHaveLength(0)
  })

  it('un commercial ne voit que ses propres débriefings', async () => {
    const { data: me } = await commercial.auth.getUser()
    const { data } = await commercial.from('debriefs').select('id, commercial_id')
    expect(
      (data ?? []).every((row: { commercial_id: string }) => row.commercial_id === me.user?.id),
    ).toBe(true)
  })

  it('un commercial ne peut pas ouvrir le module de statistiques complet', async () => {
    const { error } = await commercial.rpc('stats_kpis', { p_filters: {} })
    expect(error).not.toBeNull()
  })

  it('un commercial ne peut pas se réattribuer un débriefing', async () => {
    const { data } = await commercial.from('debriefs').select('id').limit(1)
    if (!data?.length) return
    const { error } = await commercial
      .from('debriefs')
      .update({ commercial_id: '00000000-0000-0000-0000-000000000000' })
      .eq('id', (data[0] as { id: string }).id)
    expect(error).not.toBeNull()
  })
})
