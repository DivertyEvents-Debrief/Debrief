import { getSupabase } from '@/lib/supabase/client'
import type { AppSettings, PublicFormDefinition } from '@/lib/types'

const SETTINGS_DEFAULTS: AppSettings = {
  platform_name: 'Débriefs',
  logo_url: null,
  primary_color: '#98C058',
  secondary_color: '#E8892B',
  welcome_message: 'Merci pour votre prestation.',
  confirmation_message: "C'est envoyé, merci !",
  privacy_notice: '',
  privacy_policy_url: null,
  retention_months: 36,
  callback_details_enabled: true,
  max_files: 10,
  max_file_size_mb: 10,
  max_total_size_mb: 60,
  accepted_formats: ['image/jpeg', 'image/png', 'image/webp'],
  public_access_mode: 'open',
  captcha_enabled: false,
  honeypot_enabled: true,
  rate_limit_per_hour: 20,
  email_notifications_enabled: false,
}

export type PublicFormResult =
  | { state: 'locked'; invalidCode: boolean; settings: AppSettings }
  | { state: 'unpublished'; settings: AppSettings }
  | { state: 'ready'; definition: PublicFormDefinition }
  | { state: 'error'; message: string }

type RawForm = {
  locked?: boolean
  invalidCode?: boolean
  published?: boolean
  versionId?: string
  versionNumber?: number
  settings?: Partial<AppSettings>
  sections?: PublicFormDefinition['sections']
  modules?: PublicFormDefinition['modules']
  referents?: PublicFormDefinition['referents']
  commercials?: PublicFormDefinition['commercials']
  materialSuggestions?: string[]
}

/**
 * Charge la version PUBLIÉE du formulaire depuis le navigateur.
 *
 * Un seul appel, vers une fonction SECURITY DEFINER qui choisit colonne par
 * colonne ce qui sort de la base. Les tables restent fermées à la clé anon :
 * impossible de lister les référents ou les débriefings en tapant l'API à
 * la main, même en connaissant l'URL du projet.
 */
export async function loadPublishedForm(accessCode?: string): Promise<PublicFormResult> {
  const { data, error } = await getSupabase().rpc('get_public_form', {
    p_access_code: accessCode ?? null,
  })

  if (error) {
    return {
      state: 'error',
      message: "Le formulaire n'a pas pu être chargé. Vérifiez votre connexion puis rechargez.",
    }
  }

  const raw = (data ?? {}) as RawForm
  const settings = { ...SETTINGS_DEFAULTS, ...(raw.settings ?? {}) } as AppSettings

  if (raw.locked) {
    return { state: 'locked', invalidCode: Boolean(raw.invalidCode), settings }
  }
  if (raw.published === false || !raw.versionId) {
    return { state: 'unpublished', settings }
  }

  return {
    state: 'ready',
    definition: {
      versionId: raw.versionId,
      versionNumber: raw.versionNumber ?? 1,
      sections: raw.sections ?? [],
      modules: raw.modules ?? [],
      referents: raw.referents ?? [],
      commercials: raw.commercials ?? [],
      materialSuggestions: raw.materialSuggestions ?? [],
      settings,
    },
  }
}

/**
 * Applique l'identité visuelle administrable et la mémorise pour le
 * prochain chargement : le script d'amorçage de index.html la repose avant
 * le premier rendu, ce qui évite un clignotement de couleur.
 */
export function applyBranding(settings: Pick<AppSettings, 'primary_color' | 'secondary_color'>) {
  const root = document.documentElement
  root.style.setProperty('--brand', settings.primary_color)
  root.style.setProperty('--warm', settings.secondary_color)
  try {
    localStorage.setItem(
      'debrief:theme',
      JSON.stringify({ brand: settings.primary_color, warm: settings.secondary_color }),
    )
  } catch {
    // Navigation privée : on se contente de la couleur par défaut au prochain chargement.
  }
}
