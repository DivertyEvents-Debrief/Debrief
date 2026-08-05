import * as React from 'react'
import { Link } from 'react-router-dom'
import { KeyRound, LockKeyhole } from 'lucide-react'
import { applyBranding, loadPublishedForm, type PublicFormResult } from '@/lib/public-form'
import { DebriefForm } from '@/components/public/debrief-form'
import { EmptyState } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Field, TextInput } from '@/components/ui/field'
import { PageLoader } from '@/components/ui/page-loader'

const ACCESS_CODE_KEY = 'debrief:access-code'

export function PublicDebriefPage() {
  const [result, setResult] = React.useState<PublicFormResult | null>(null)
  const [code, setCode] = React.useState('')
  const [checking, setChecking] = React.useState(false)

  const load = React.useCallback(async (accessCode?: string) => {
    const next = await loadPublishedForm(accessCode)
    setResult(next)

    if (next.state !== 'error') applyBranding(next.state === 'ready' ? next.definition.settings : next.settings)

    // Le code n'est retenu que s'il fonctionne : un référent qui revient
    // depuis le même téléphone ne le retape pas à chaque prestation.
    if (accessCode && next.state === 'ready') {
      try {
        localStorage.setItem(ACCESS_CODE_KEY, accessCode)
      } catch {
        /* navigation privée */
      }
    }
    return next
  }, [])

  React.useEffect(() => {
    let stored: string | null = null
    try {
      stored = localStorage.getItem(ACCESS_CODE_KEY)
    } catch {
      /* navigation privée */
    }
    void load(stored ?? undefined)
  }, [load])

  const submitCode = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!code.trim()) return
    setChecking(true)
    await load(code.trim())
    setChecking(false)
  }

  if (!result) return <PageLoader label="Ouverture du formulaire…" />

  const platformName =
    result.state === 'ready' ? result.definition.settings.platform_name
    : result.state === 'error' ? 'Débriefs'
    : result.settings.platform_name

  return (
    <main id="contenu" className="mx-auto w-full max-w-2xl px-4 pb-24 pt-6 sm:px-6 sm:pt-10">
      <header className="mb-8 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <p className="font-display text-lg font-semibold tracking-tight">{platformName}</p>
          <Link
            to="/connexion"
            className="inline-flex items-center gap-1.5 rounded-[9px] px-2 py-1 text-sm text-ink-faint hover:text-brand-strong"
          >
            <LockKeyhole className="size-3.5" aria-hidden />
            Espace équipe
          </Link>
        </div>

        <h1 className="text-3xl font-semibold sm:text-[2.1rem]">Débriefing après événement</h1>

        {result.state === 'ready' && (
          <p className="text-ink-muted">{result.definition.settings.welcome_message}</p>
        )}
      </header>

      {result.state === 'error' && (
        <EmptyState
          title="Formulaire indisponible"
          description={result.message}
          action={<Button onClick={() => void load()}>Réessayer</Button>}
        />
      )}

      {result.state === 'unpublished' && (
        <EmptyState
          title="Le formulaire n'est pas encore publié"
          description="L'administrateur doit publier une version du formulaire avant que les référents puissent envoyer un débriefing."
        />
      )}

      {result.state === 'locked' && (
        <form onSubmit={submitCode} className="card space-y-4 p-6">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-full bg-brand-soft p-2 text-brand-strong">
              <KeyRound className="size-4" aria-hidden />
            </span>
            <div>
              <h2 className="font-display text-lg font-semibold">Formulaire protégé</h2>
              <p className="text-sm text-ink-muted">
                Saisissez le code transmis avec votre convocation.
              </p>
            </div>
          </div>

          <Field
            label="Code d'accès"
            id="access-code"
            error={result.invalidCode ? "Ce code n'est pas valide ou a expiré." : undefined}
          >
            <TextInput
              id="access-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="Ex. AGENCE-2026"
            />
          </Field>

          <Button type="submit" loading={checking} disabled={!code.trim()}>
            Accéder au formulaire
          </Button>
        </form>
      )}

      {result.state === 'ready' && (
        <>
          <DebriefForm definition={result.definition} />

          <footer className="mt-12 space-y-2 border-t border-line pt-5 text-xs text-ink-faint">
            <p>{result.definition.settings.privacy_notice}</p>
            {result.definition.settings.privacy_policy_url && (
              <p>
                <a
                  href={result.definition.settings.privacy_policy_url}
                  className="underline underline-offset-2 hover:text-brand-strong"
                  target="_blank"
                  rel="noreferrer"
                >
                  Politique de confidentialité
                </a>
              </p>
            )}
            <p>Formulaire version {result.definition.versionNumber}</p>
          </footer>
        </>
      )}
    </main>
  )
}
