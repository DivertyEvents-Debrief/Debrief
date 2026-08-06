/**
 * Gestion des comptes — fonction Edge Supabase.
 *
 * Créer un compte demande la clé de service : un front statique ne peut
 * pas la détenir. Cette fonction est donc le pendant administratif de
 * `public-submission`, avec une différence de taille — elle n'est pas
 * publique. Chaque appel vérifie le jeton de l'appelant et refuse tout
 * ce qui ne vient pas d'un administrateur actif.
 *
 * Le rôle est écrit dans `app_metadata`, hors de portée du navigateur :
 * un utilisateur ne peut pas se promouvoir en modifiant sa session.
 *
 * Déploiement : supabase functions deploy admin-users
 * (la vérification de jeton peut rester active ici, contrairement au
 * formulaire public — mais on la refait nous-mêmes de toute façon.)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const normalizeOrigin = (value: string) => value.trim().replace(/\/+$/, '')
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map(normalizeOrigin)
  .filter(Boolean)

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function corsHeaders(origin: string | null): Record<string, string> {
  const candidate = origin ? normalizeOrigin(origin) : null
  const allowed =
    ALLOWED_ORIGINS.length === 0
      ? (origin ?? '*')
      : candidate && ALLOWED_ORIGINS.includes(candidate)
        ? origin!
        : ALLOWED_ORIGINS[0]

  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  }
}

const json = (body: unknown, status: number, origin: string | null) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'content-type': 'application/json; charset=utf-8' },
  })

const fail = (error: string, origin: string | null, status = 400) =>
  json({ ok: false, error }, status, origin)
const succeed = (data: unknown, origin: string | null) => json({ ok: true, data }, 200, origin)

/**
 * Mot de passe temporaire lisible mais solide. Il est affiché une seule
 * fois à l'administrateur, qui le transmet de vive voix — aucun envoi
 * d'email n'est nécessaire, donc rien à configurer côté SMTP.
 */
function temporaryPassword(): string {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('')
}

/** L'appelant est-il un administrateur actif ? */
async function requireAdmin(request: Request): Promise<{ id: string } | null> {
  const authorization = request.headers.get('Authorization') ?? ''
  const token = authorization.replace(/^Bearer\s+/i, '')
  if (!token || token === ANON_KEY) return null

  const caller = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: userData } = await caller.auth.getUser()
  if (!userData?.user) return null

  // Le rôle est relu en base avec la clé de service : on ne fait pas
  // confiance à ce que la session prétend être.
  const { data: profile } = await admin
    .from('profiles')
    .select('id, role, active')
    .eq('id', userData.user.id)
    .maybeSingle()

  if (!profile || profile.role !== 'admin' || !profile.active) return null
  return { id: profile.id }
}

const ROLES = new Set(['admin', 'commercial_plus', 'commercial', 'logistique'])

async function handleCreate(body: Record<string, unknown>, origin: string | null) {
  const email = String(body.email ?? '').trim().toLowerCase()
  const firstName = String(body.first_name ?? '').trim()
  const lastName = String(body.last_name ?? '').trim()
  const role = String(body.role ?? 'commercial')

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('Adresse email invalide.', origin)
  if (!firstName) return fail('Le prénom est obligatoire.', origin)
  if (!ROLES.has(role)) return fail('Rôle inconnu.', origin)

  const password = temporaryPassword()

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },
    user_metadata: { first_name: firstName, last_name: lastName },
  })

  if (error) {
    return fail(
      /already|exists|registered/i.test(error.message)
        ? 'Un compte existe déjà avec cette adresse.'
        : "Le compte n'a pas pu être créé.",
      origin,
    )
  }

  // Le trigger `handle_new_auth_user` a créé le profil ; on complète les
  // champs que les métadonnées ne couvrent pas toujours.
  await admin
    .from('profiles')
    .update({ first_name: firstName, last_name: lastName, role, active: true })
    .eq('id', data.user!.id)

  // Le mot de passe n'est renvoyé qu'ici, et n'est stocké nulle part.
  return succeed({ id: data.user!.id, email, password }, origin)
}

async function handleResetPassword(body: Record<string, unknown>, origin: string | null) {
  const userId = String(body.user_id ?? '')
  if (!userId) return fail('Compte introuvable.', origin)

  const password = temporaryPassword()
  const { error } = await admin.auth.admin.updateUserById(userId, { password })
  if (error) return fail("Le mot de passe n'a pas pu être réinitialisé.", origin)

  return succeed({ password }, origin)
}

/**
 * Alignement du rôle dans `app_metadata` après un changement en base.
 * Les deux doivent rester cohérents : `profiles.role` pilote les
 * politiques RLS, `app_metadata.role` sert au trigger de création.
 */
async function handleSyncRole(body: Record<string, unknown>, origin: string | null) {
  const userId = String(body.user_id ?? '')
  const role = String(body.role ?? '')
  if (!userId || !ROLES.has(role)) return fail('Paramètres invalides.', origin)

  const { error } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { role },
  })
  if (error) return fail("Le rôle n'a pas pu être synchronisé.", origin)

  return succeed({ synced: true }, origin)
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin')

  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) })
  if (request.method !== 'POST') return fail('Méthode non autorisée.', origin, 405)

  const caller = await requireAdmin(request)
  if (!caller) return fail('Action réservée aux administrateurs.', origin, 403)

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return fail('Requête illisible.', origin)
  }

  try {
    switch (body.action) {
      case 'create':
        return await handleCreate(body, origin)
      case 'reset-password':
        return await handleResetPassword(body, origin)
      case 'sync-role':
        return await handleSyncRole(body, origin)
      default:
        return fail('Action inconnue.', origin)
    }
  } catch (error) {
    console.error('admin-users', body.action, error)
    return fail('Une erreur est survenue.', origin, 500)
  }
})
