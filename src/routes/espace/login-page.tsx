import * as React from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import { getSupabase } from '@/lib/supabase/client'
import { useSession } from '@/lib/session'
import { Button } from '@/components/ui/button'
import { Field, TextInput } from '@/components/ui/field'
import { PageLoader } from '@/components/ui/page-loader'

export default function LoginPage() {
  const { loading, session } = useSession()
  const location = useLocation()
  const navigate = useNavigate()

  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  if (loading) return <PageLoader label="Vérification de la session…" />

  if (session) {
    const suite = (location.state as { suite?: string } | null)?.suite
    return <Navigate to={suite ?? '/espace'} replace />
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setPending(true)
    setError(null)

    const { error: authError } = await getSupabase().auth.signInWithPassword({ email, password })

    if (authError) {
      // Message volontairement identique pour un email inconnu et un mot de
      // passe faux : on n'indique pas qui possède un compte (§20).
      setError('Identifiants incorrects. Vérifiez votre adresse et votre mot de passe.')
      setPending(false)
      return
    }

    const suite = (location.state as { suite?: string } | null)?.suite
    navigate(suite ?? '/espace', { replace: true })
  }

  return (
    <main id="contenu" className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-12">
      <div className="mb-8 text-center">
        <span className="inline-flex rounded-full bg-brand-soft p-3 text-brand-strong">
          <LogIn className="size-5" aria-hidden />
        </span>
        <h1 className="mt-4 text-2xl font-semibold">Espace équipe</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Réservé aux permanents de l'agence. Les référents n'ont pas de compte.
        </p>
      </div>

      <form onSubmit={submit} className="card space-y-4 p-6">
        <Field label="Adresse email" id="email" required>
          <TextInput
            id="email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </Field>

        <Field label="Mot de passe" id="password" required>
          <TextInput
            id="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>

        {error && (
          <p role="alert" className="rounded-[9px] bg-danger-soft px-3 py-2 text-sm text-danger">
            {error}
          </p>
        )}

        <Button type="submit" size="lg" loading={pending} className="w-full">
          Se connecter
        </Button>
      </form>

      <p className="mt-6 text-center text-xs text-ink-faint">
        Mot de passe oublié ? Contactez un administrateur : il peut réinitialiser votre accès.
      </p>
    </main>
  )
}
