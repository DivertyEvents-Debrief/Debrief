/**
 * Envoi public d'un débriefing — fonction Edge Supabase.
 *
 * Le front est statique (GitHub Pages) : il n'existe aucun serveur
 * applicatif où faire tourner du code de confiance. Cette fonction est ce
 * serveur, réduit au strict nécessaire. Elle détient la clé de service et
 * reste l'unique surface d'écriture publique, exactement comme les Server
 * Actions qu'elle remplace.
 *
 * Quatre opérations, aucune autre :
 *   start       — ouvre un brouillon (jeton d'idempotence + dossier d'images)
 *   upload-url  — signe un envoi d'image, limité au dossier du brouillon
 *   discard     — retire une image avant l'envoi définitif
 *   submit      — appelle submit_debrief() qui valide et écrit en une transaction
 *
 * Déploiement : supabase functions deploy public-submission --no-verify-jwt
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.48.1'

const ATTACHMENTS_BUCKET = 'debrief-attachments'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FINGERPRINT_SALT = Deno.env.get('SUBMISSION_FINGERPRINT_SALT') ?? 'sel-par-defaut'
const TURNSTILE_SECRET = Deno.env.get('TURNSTILE_SECRET_KEY') ?? ''

// Origines autorisées : l'adresse GitHub Pages du site, séparées par des
// virgules. Laisser vide autorise tout le monde (pratique en local, à
// resserrer une fois l'adresse définitive connue).
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed =
    ALLOWED_ORIGINS.length === 0
      ? (origin ?? '*')
      : origin && ALLOWED_ORIGINS.includes(origin)
        ? origin
        : ALLOWED_ORIGINS[0]

  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'content-type': 'application/json; charset=utf-8' },
  })
}

const fail = (error: string, origin: string | null, status = 400) =>
  json({ ok: false, error }, status, origin)
const succeed = (data: unknown, origin: string | null) =>
  json({ ok: true, data }, 200, origin)

/**
 * Empreinte anonyme du visiteur. L'adresse IP n'est jamais stockée en
 * clair : seul un hachage salé est conservé, conformément au §22.
 */
async function visitorFingerprint(request: Request): Promise<string> {
  const ip =
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    request.headers.get('cf-connecting-ip') ??
    'inconnue'
  const agent = request.headers.get('user-agent') ?? ''

  const bytes = new TextEncoder().encode(`${FINGERPRINT_SALT}:${ip}:${agent}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32)
}

/** Réglages applicatifs, avec repli si la table n'est pas encore peuplée. */
async function loadSettings(): Promise<Record<string, unknown>> {
  const defaults: Record<string, unknown> = {
    max_files: 10,
    max_file_size_mb: 10,
    accepted_formats: ['image/jpeg', 'image/png', 'image/webp'],
    public_access_mode: 'open',
    captcha_enabled: false,
    honeypot_enabled: true,
    rate_limit_per_hour: 20,
  }
  const { data } = await admin.from('application_settings').select('key, value')
  for (const row of data ?? []) defaults[row.key] = row.value
  return defaults
}

/** Limitation de débit glissante sur une heure, par empreinte et par type. */
async function checkRateLimit(
  fingerprint: string,
  kind: 'draft' | 'upload' | 'submit',
  maxPerHour: number,
): Promise<boolean> {
  const since = new Date(Date.now() - 3_600_000).toISOString()

  const { count } = await admin
    .from('public_submission_events')
    .select('id', { count: 'exact', head: true })
    .eq('client_fingerprint', fingerprint)
    .eq('kind', kind)
    .gte('created_at', since)

  if ((count ?? 0) >= maxPerHour) return false

  await admin.from('public_submission_events').insert({ client_fingerprint: fingerprint, kind })
  return true
}

async function verifyAccessCode(code: unknown): Promise<boolean> {
  if (typeof code !== 'string' || !code.trim()) return false
  const { data } = await admin.rpc('access_code_is_valid', { p_code: code.trim() })
  return data === true
}

/** Vérification Turnstile. Sans secret configuré, le contrôle est neutre. */
async function verifyCaptcha(token: unknown): Promise<boolean> {
  if (!TURNSTILE_SECRET) return true
  if (typeof token !== 'string' || !token) return false

  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ secret: TURNSTILE_SECRET, response: token }),
  })
  const result = (await response.json()) as { success?: boolean }
  return result.success === true
}

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
}

/** Nettoyage du nom de fichier et contrôle du type déclaré. */
function sanitizeUpload(originalName: string, mimeType: string) {
  if (!ALLOWED_MIME.has(mimeType)) throw new Error(`Format non pris en charge : ${mimeType}.`)

  const base = originalName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
    .replace(/\.[^.]*$/, '')

  return { safeName: base || 'photo', extension: EXTENSION_BY_MIME[mimeType] ?? 'bin' }
}

// ---------------------------------------------------------------------
// Opérations
// ---------------------------------------------------------------------

async function handleStart(body: Record<string, unknown>, fingerprint: string, origin: string | null) {
  const settings = await loadSettings()

  if (settings.public_access_mode === 'code' && !(await verifyAccessCode(body.accessCode))) {
    return fail("Ce code d'accès n'est pas valide.", origin)
  }

  if (!(await checkRateLimit(fingerprint, 'draft', Number(settings.rate_limit_per_hour) || 20))) {
    return fail('Trop de tentatives depuis cet appareil. Réessayez dans une heure.', origin, 429)
  }

  const { data: version } = await admin
    .from('form_versions')
    .select('id')
    .eq('status', 'published')
    .maybeSingle()

  if (!version) return fail("Le formulaire n'est pas publié pour le moment.", origin)

  const { data, error } = await admin
    .from('submission_drafts')
    .insert({ form_version_id: version.id, client_fingerprint: fingerprint })
    .select('id')
    .single()

  if (error || !data) {
    return fail("Impossible d'ouvrir le formulaire. Réessayez dans un instant.", origin, 500)
  }

  return succeed({ draftId: data.id }, origin)
}

async function handleUploadUrl(
  body: Record<string, unknown>,
  fingerprint: string,
  origin: string | null,
) {
  const settings = await loadSettings()
  const draftId = String(body.draftId ?? '')
  const file = (body.file ?? {}) as { name?: string; type?: string; size?: number }

  const accepted = (settings.accepted_formats as string[]) ?? []
  if (!file.type || !accepted.includes(file.type)) {
    return fail('Format non accepté. Formats autorisés : JPEG, PNG, WebP.', origin)
  }

  const maxBytes = (Number(settings.max_file_size_mb) || 10) * 1024 * 1024
  if ((file.size ?? 0) > maxBytes) {
    return fail(`Image trop volumineuse (maximum ${settings.max_file_size_mb} Mo).`, origin)
  }

  const maxFiles = Number(settings.max_files) || 10
  if (!(await checkRateLimit(fingerprint, 'upload', maxFiles * 5))) {
    return fail("Trop d'envois d'images depuis cet appareil.", origin, 429)
  }

  const { data: draft } = await admin
    .from('submission_drafts')
    .select('id, submitted_debrief_id, expires_at')
    .eq('id', draftId)
    .maybeSingle()

  if (!draft || draft.submitted_debrief_id || new Date(draft.expires_at) < new Date()) {
    return fail('Session expirée. Rechargez le formulaire.', origin)
  }

  const { data: existing } = await admin.storage
    .from(ATTACHMENTS_BUCKET)
    .list(`submissions/${draftId}`, { limit: maxFiles + 1 })

  if ((existing?.length ?? 0) >= maxFiles) {
    return fail(`Vous avez atteint la limite de ${maxFiles} images.`, origin)
  }

  let safe: { safeName: string; extension: string }
  try {
    safe = sanitizeUpload(file.name ?? 'photo', file.type)
  } catch (error) {
    return fail((error as Error).message, origin)
  }

  // Le chemin est construit ici, jamais transmis par le navigateur : une
  // image ne peut pas atterrir dans le dossier d'un autre brouillon.
  const path = `submissions/${draftId}/${crypto.randomUUID()}-${safe.safeName}.${safe.extension}`

  const { data, error } = await admin.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUploadUrl(path)

  if (error || !data) return fail("L'envoi de l'image a échoué. Réessayez.", origin, 500)

  return succeed({ path: data.path, token: data.token }, origin)
}

async function handleDiscard(body: Record<string, unknown>, origin: string | null) {
  const draftId = String(body.draftId ?? '')
  const path = String(body.path ?? '')

  if (!draftId || !path.startsWith(`submissions/${draftId}/`)) {
    return fail('Fichier introuvable.', origin)
  }

  const { error } = await admin.storage.from(ATTACHMENTS_BUCKET).remove([path])
  if (error) return fail("Impossible de supprimer l'image.", origin, 500)

  return succeed({ removed: true }, origin)
}

async function handleSubmit(
  body: Record<string, unknown>,
  fingerprint: string,
  origin: string | null,
) {
  const settings = await loadSettings()

  // Champ piège : rempli uniquement par un robot.
  const honeypot = typeof body.honeypot === 'string' ? body.honeypot.trim() : ''
  if (settings.honeypot_enabled && honeypot !== '') {
    return fail("Votre envoi n'a pas pu être vérifié.", origin)
  }

  if (settings.captcha_enabled && !(await verifyCaptcha(body.captchaToken))) {
    return fail('La vérification anti-robot a échoué. Réessayez.', origin)
  }

  if (!(await checkRateLimit(fingerprint, 'submit', Number(settings.rate_limit_per_hour) || 20))) {
    return fail("Trop d'envois depuis cet appareil. Réessayez dans une heure.", origin, 429)
  }

  const { data, error } = await admin.rpc('submit_debrief', {
    p_draft_id: String(body.draftId ?? ''),
    p_payload: body.payload ?? {},
  })

  if (error) {
    // Les messages levés par submit_debrief sont déjà rédigés pour
    // l'utilisateur. Toute autre erreur reste générique : pas de fuite
    // technique vers le navigateur (§20).
    const message =
      error.message && !/(?:relation|column|function|syntax|permission)/i.test(error.message)
        ? error.message
        : "L'envoi a échoué. Réessayez dans un instant."
    return fail(message, origin)
  }

  const result = data as {
    public_reference: string
    submitted_at: string
    already_submitted: boolean
  }

  return succeed(
    {
      reference: result.public_reference,
      submittedAt: result.submitted_at,
      alreadySubmitted: result.already_submitted,
    },
    origin,
  )
}

// ---------------------------------------------------------------------
// Point d'entrée
// ---------------------------------------------------------------------

Deno.serve(async (request) => {
  const origin = request.headers.get('origin')

  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(origin) })
  }
  if (request.method !== 'POST') {
    return fail('Méthode non autorisée.', origin, 405)
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return fail('Requête illisible.', origin)
  }

  const fingerprint = await visitorFingerprint(request)

  try {
    switch (body.action) {
      case 'start':
        return await handleStart(body, fingerprint, origin)
      case 'upload-url':
        return await handleUploadUrl(body, fingerprint, origin)
      case 'discard':
        return await handleDiscard(body, origin)
      case 'submit':
        return await handleSubmit(body, fingerprint, origin)
      default:
        return fail('Action inconnue.', origin)
    }
  } catch (error) {
    console.error('public-submission', body.action, error)
    return fail("Une erreur est survenue. Réessayez dans un instant.", origin, 500)
  }
})
