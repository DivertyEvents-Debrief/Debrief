import * as React from 'react'
import { KeyRound, UserPlus } from 'lucide-react'
import {
  createAccount,
  fetchAccounts,
  resetPassword,
  setPermission,
  syncRole,
  updateAccount,
  type Account,
} from '@/lib/admin-api'
import { useSession } from '@/lib/session'
import type { GrantablePermission, UserRole } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, EmptyState } from '@/components/ui/card'
import { Field, TextInput, inputClasses } from '@/components/ui/field'
import { PageLoader } from '@/components/ui/page-loader'
import { formatDate } from '@/lib/utils'

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrateur',
  commercial_plus: 'Commercial +',
  commercial: 'Commercial',
  logistique: 'Logistique',
}

const ROLE_HINTS: Partial<Record<UserRole, string>> = {
  logistique:
    "Voit tous les débriefings et gère les retours matériel. N'apparaît jamais dans la liste des commerciaux du formulaire.",
  commercial_plus: 'Voit tous les débriefings et les statistiques.',
  commercial: 'Ne voit que les débriefings qui lui sont attribués.',
}

const PERMISSION_LABELS: Record<GrantablePermission, string> = {
  statistics_full: 'Statistiques complètes',
  form_builder: 'Constructeur de formulaire',
  export_global: 'Exports globaux',
}

export default function AccountsPage() {
  const { profile } = useSession()
  const [accounts, setAccounts] = React.useState<Account[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [creating, setCreating] = React.useState(false)
  const [credentials, setCredentials] = React.useState<{ email: string; password: string } | null>(null)

  const reload = React.useCallback(async () => {
    try {
      setAccounts(await fetchAccounts())
      setError(null)
    } catch (caught) {
      setError((caught as Error).message)
    }
  }, [])

  React.useEffect(() => {
    void reload()
  }, [reload])

  const run = async (action: () => Promise<void>) => {
    try {
      await action()
      await reload()
      setError(null)
    } catch (caught) {
      setError((caught as Error).message)
    }
  }

  if (error && !accounts) return <EmptyState title="Comptes indisponibles" description={error} />
  if (!accounts) return <PageLoader label="Chargement des comptes…" />

  return (
    <div className="space-y-6">
      {credentials && (
        <Card className="border-brand-line bg-brand-soft">
          <CardHeader
            title="Mot de passe temporaire"
            description="Il n'est affiché qu'une fois et n'est stocké nulle part. Transmettez-le de vive voix."
          />
          <p className="font-mono text-lg">{credentials.password}</p>
          <p className="mt-1 text-sm text-ink-muted">pour {credentials.email}</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => setCredentials(null)}>
            J'ai noté
          </Button>
        </Card>
      )}

      {error && (
        <p role="alert" className="rounded-[9px] bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <Card>
        <CardHeader
          title="Ajouter un compte"
          description="Le compte est créé immédiatement avec un mot de passe temporaire."
        />
        <NewAccountForm
          pending={creating}
          onSubmit={async (input) => {
            setCreating(true)
            const result = await createAccount(input)
            setCreating(false)

            if (!result.ok) {
              setError(result.error)
              return false
            }
            setCredentials({ email: result.data.email, password: result.data.password })
            await reload()
            return true
          }}
        />
      </Card>

      <div className="space-y-3">
        {accounts.map((account) => (
          <Card key={account.id}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="font-medium">
                  {account.first_name} {account.last_name}
                  {account.id === profile?.id && (
                    <span className="ml-2 text-xs text-ink-faint">(vous)</span>
                  )}
                </p>
                <p className="text-sm text-ink-muted">{account.email}</p>
                <p className="mt-1 text-xs text-ink-faint">
                  {account.debrief_count} débriefing{account.debrief_count > 1 ? 's' : ''} rattaché
                  {account.debrief_count > 1 ? 's' : ''} · créé le {formatDate(account.created_at)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <label className="text-sm">
                  <span className="sr-only">Rôle de {account.first_name}</span>
                  <select
                    value={account.role}
                    disabled={account.id === profile?.id}
                    onChange={(event) =>
                      run(async () => {
                        const role = event.target.value as UserRole
                        await updateAccount(account.id, { role })
                        // `profiles.role` pilote les politiques RLS,
                        // `app_metadata.role` sert à la création : on garde
                        // les deux alignés.
                        await syncRole(account.id, role)
                      })
                    }
                    className={inputClasses}
                  >
                    {Object.entries(ROLE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <Button
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    const result = await resetPassword(account.id)
                    if (result.ok) setCredentials({ email: account.email, password: result.data.password })
                    else setError(result.error)
                  }}
                >
                  <KeyRound className="size-4" aria-hidden />
                  Réinitialiser
                </Button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-3 text-sm">
              <Toggle
                label="Compte actif"
                hint="peut se connecter"
                checked={account.active}
                disabled={account.id === profile?.id}
                onChange={(active) => run(() => updateAccount(account.id, { active }))}
              />
              <Toggle
                label="Dans le formulaire public"
                hint={
                  account.role === 'logistique'
                    ? 'jamais, pour ce rôle'
                    : 'proposé aux référents'
                }
                checked={account.selectable_as_commercial}
                disabled={account.role === 'logistique'}
                onChange={(value) =>
                  run(() => updateAccount(account.id, { selectable_as_commercial: value }))
                }
              />

              {(Object.keys(PERMISSION_LABELS) as GrantablePermission[]).map((permission) => (
                <Toggle
                  key={permission}
                  label={PERMISSION_LABELS[permission]}
                  checked={account.role === 'admin' || account.permissions.includes(permission)}
                  disabled={account.role === 'admin'}
                  hint={account.role === 'admin' ? 'inclus dans le rôle' : undefined}
                  onChange={(granted) => run(() => setPermission(account.id, permission, granted))}
                />
              ))}
            </div>

            {ROLE_HINTS[account.role] && (
              <p className="mt-3 text-xs text-ink-faint">{ROLE_HINTS[account.role]}</p>
            )}

            {account.debrief_count > 0 && !account.active && (
              <p className="mt-3 text-xs text-ink-faint">
                Ce compte reste rattaché à ses débriefings : c'est pourquoi on le désactive plutôt
                que de le supprimer.
              </p>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  disabled?: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <label className="inline-flex items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 rounded border-line-strong accent-[var(--brand)] disabled:opacity-50"
      />
      <span className={disabled ? 'text-ink-faint' : ''}>
        {label}
        {hint && <span className="ml-1 text-xs text-ink-faint">({hint})</span>}
      </span>
    </label>
  )
}

function NewAccountForm({
  pending,
  onSubmit,
}: {
  pending: boolean
  onSubmit: (input: {
    email: string
    first_name: string
    last_name: string
    role: UserRole
  }) => Promise<boolean>
}) {
  const [form, setForm] = React.useState({
    email: '',
    first_name: '',
    last_name: '',
    role: 'commercial' as UserRole,
  })

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
      <Field label="Prénom" id="new-first" required>
        <TextInput
          id="new-first"
          value={form.first_name}
          onChange={(event) => setForm({ ...form, first_name: event.target.value })}
        />
      </Field>
      <Field label="Nom" id="new-last">
        <TextInput
          id="new-last"
          value={form.last_name}
          onChange={(event) => setForm({ ...form, last_name: event.target.value })}
        />
      </Field>
      <Field label="Adresse email" id="new-email" required>
        <TextInput
          id="new-email"
          type="email"
          value={form.email}
          onChange={(event) => setForm({ ...form, email: event.target.value })}
        />
      </Field>
      <Field label="Rôle" id="new-role">
        <select
          id="new-role"
          value={form.role}
          onChange={(event) => setForm({ ...form, role: event.target.value as UserRole })}
          className={inputClasses}
        >
          {Object.entries(ROLE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>

      <Button
        loading={pending}
        disabled={!form.email.trim() || !form.first_name.trim()}
        onClick={async () => {
          const created = await onSubmit(form)
          if (created) setForm({ email: '', first_name: '', last_name: '', role: 'commercial' })
        }}
      >
        <UserPlus className="size-4" aria-hidden />
        Créer
      </Button>
    </div>
  )
}
