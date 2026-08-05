import * as React from 'react'
import { Plus } from 'lucide-react'
import { fetchStatuses, saveStatus, type Status } from '@/lib/admin-api'
import { StatusPill } from '@/components/workspace/status-pill'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, EmptyState } from '@/components/ui/card'
import { Field, TextInput, inputClasses } from '@/components/ui/field'
import { PageLoader } from '@/components/ui/page-loader'

const TONES = [
  ['neutral', 'Neutre'],
  ['info', 'Information'],
  ['attention', 'Attention'],
  ['progress', 'En cours'],
  ['success', 'Terminé'],
  ['muted', 'Discret'],
] as const

export default function StatusesPage() {
  const [statuses, setStatuses] = React.useState<Status[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState({ code: '', label: '', tone: 'neutral' })

  const reload = React.useCallback(async () => {
    try {
      setStatuses(await fetchStatuses())
      setError(null)
    } catch (caught) {
      setError((caught as Error).message)
    }
  }, [])

  React.useEffect(() => { void reload() }, [reload])

  const run = async (action: () => Promise<void>) => {
    try {
      await action()
      await reload()
      setError(null)
    } catch (caught) {
      setError((caught as Error).message)
    }
  }

  if (error && !statuses) return <EmptyState title="Statuts indisponibles" description={error} />
  if (!statuses) return <PageLoader label="Chargement des statuts…" />

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="rounded-[9px] bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <Card>
        <CardHeader
          title="Statuts du suivi"
          description="Le libellé s'affiche partout ; la teinte n'est qu'un renfort visuel, jamais la seule information."
        />

        <ul className="divide-y divide-line">
          {statuses.map((status) => (
            <li key={status.id} className="grid gap-3 py-3 sm:grid-cols-[1fr_160px_auto] sm:items-center">
              <div className="flex items-center gap-3">
                <StatusPill status={status} />
                <input
                  aria-label={`Libellé du statut ${status.code}`}
                  value={status.label}
                  onChange={(event) =>
                    setStatuses((current) =>
                      (current ?? []).map((s) =>
                        s.id === status.id ? { ...s, label: event.target.value } : s,
                      ),
                    )
                  }
                  onBlur={(event) => run(() => saveStatus({ id: status.id, label: event.target.value }))}
                  className={inputClasses}
                />
              </div>

              <label className="text-sm">
                <span className="sr-only">Teinte de {status.label}</span>
                <select
                  value={status.tone}
                  onChange={(event) => run(() => saveStatus({ id: status.id, tone: event.target.value }))}
                  className={inputClasses}
                >
                  {TONES.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </label>

              <div className="flex flex-wrap items-center gap-4 text-sm">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="radio"
                    name="statut-defaut"
                    checked={status.is_default}
                    onChange={() =>
                      run(async () => {
                        // Un seul statut par défaut : on retire l'ancien
                        // avant de poser le nouveau.
                        const previous = (statuses ?? []).find((s) => s.is_default)
                        if (previous && previous.id !== status.id) {
                          await saveStatus({ id: previous.id, is_default: false })
                        }
                        await saveStatus({ id: status.id, is_default: true })
                      })
                    }
                    className="size-4 accent-[var(--brand)]"
                  />
                  Par défaut
                </label>

                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={status.active}
                    disabled={status.is_default}
                    onChange={(event) =>
                      run(() => saveStatus({ id: status.id, active: event.target.checked }))
                    }
                    className="size-4 rounded border-line-strong accent-[var(--brand)] disabled:opacity-50"
                  />
                  Actif
                </label>
              </div>
            </li>
          ))}
        </ul>

        <p className="mt-3 text-xs text-ink-faint">
          Le statut par défaut est celui attribué à chaque nouveau débriefing : il ne peut pas être
          désactivé, sinon les envois échoueraient.
        </p>
      </Card>

      <Card>
        <CardHeader title="Ajouter un statut" />
        <div className="grid gap-3 sm:grid-cols-4 sm:items-end">
          <Field label="Code technique" id="st-code" help="sans espace ni accent" required>
            <TextInput
              id="st-code"
              value={draft.code}
              onChange={(event) =>
                setDraft({ ...draft, code: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') })
              }
              placeholder="a_relancer"
            />
          </Field>
          <Field label="Libellé affiché" id="st-label" required>
            <TextInput
              id="st-label"
              value={draft.label}
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
              placeholder="À relancer"
            />
          </Field>
          <Field label="Teinte" id="st-tone">
            <select
              id="st-tone"
              value={draft.tone}
              onChange={(event) => setDraft({ ...draft, tone: event.target.value })}
              className={inputClasses}
            >
              {TONES.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </Field>
          <Button
            disabled={!draft.code.trim() || !draft.label.trim()}
            onClick={() =>
              run(async () => {
                await saveStatus({
                  code: draft.code.trim(),
                  label: draft.label.trim(),
                  tone: draft.tone,
                  sort_order: (statuses?.length ?? 0) * 10 + 100,
                })
                setDraft({ code: '', label: '', tone: 'neutral' })
              })
            }
          >
            <Plus className="size-4" aria-hidden />
            Ajouter
          </Button>
        </div>
      </Card>
    </div>
  )
}
