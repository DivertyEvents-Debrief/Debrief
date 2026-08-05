import { SUPABASE_ANON_KEY, SUPABASE_URL } from '@/lib/supabase/client'
import type { DebriefSubmissionPayload } from '@/lib/types'

/**
 * Pont vers la fonction Edge `public-submission`.
 *
 * Les signatures sont identiques à celles des Server Actions qu'elles
 * remplacent : les composants du formulaire n'ont pas eu à changer. La
 * différence tient à l'hébergement — un site statique ne peut pas exécuter
 * de code de confiance, donc la clé de service vit dans la fonction Edge.
 */

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string }

const ENDPOINT = `${SUPABASE_URL}/functions/v1/public-submission`

async function call<T>(payload: Record<string, unknown>): Promise<ActionResult<T>> {
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // La fonction est déployée sans vérification de JWT (le visiteur
        // n'a pas de compte) ; l'en-tête reste envoyé pour passer la
        // passerelle Supabase.
        authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        apikey: SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(payload),
    })

    const body = (await response.json().catch(() => null)) as ActionResult<T> | null

    if (!body) {
      return { ok: false, error: "Le serveur n'a pas répondu correctement. Réessayez." }
    }
    return body
  } catch {
    // Coupure réseau, mode avion, tunnel… Le brouillon local est conservé,
    // le visiteur peut réessayer sans ressaisir quoi que ce soit.
    return {
      ok: false,
      error: 'Connexion perdue. Vérifiez votre réseau puis réessayez : rien n\u2019est perdu.',
    }
  }
}

/**
 * Ouvre une session d'envoi. Elle sert de dossier de destination pour les
 * images et de jeton d'idempotence : rejouer le même brouillon ne crée
 * jamais un second débriefing.
 */
export function startSubmission(accessCode?: string) {
  return call<{ draftId: string }>({ action: 'start', accessCode })
}

/**
 * Demande une URL d'upload signée à usage unique. Le visiteur n'obtient
 * jamais de droit d'écriture général sur le bucket : seulement ce chemin
 * précis, dans le dossier de son propre brouillon.
 */
export function createUploadUrl(
  draftId: string,
  file: { name: string; type: string; size: number },
) {
  return call<{ path: string; token: string }>({ action: 'upload-url', draftId, file })
}

/** Retrait d'une image avant l'envoi définitif. */
export function discardUpload(draftId: string, path: string) {
  return call<{ removed: boolean }>({ action: 'discard', draftId, path })
}

/**
 * Envoi définitif. Toute la validation métier est faite par la fonction
 * `submit_debrief` en base, dans une transaction unique.
 */
export function submitDebriefAction(input: {
  draftId: string
  payload: DebriefSubmissionPayload
  honeypot?: string
  captchaToken?: string
}) {
  return call<{ reference: string; submittedAt: string; alreadySubmitted: boolean }>({
    action: 'submit',
    ...input,
  })
}
