import * as React from 'react'
import Papa from 'papaparse'
import { Plus, Trash2, Upload } from 'lucide-react'
import {
  deleteReferent,
  fetchReferents,
  importReferents,
  saveReferent,
  type Referent,
} from '@/lib/admin-api'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, EmptyState } from '@/components/ui/card'
import { Field, TextInput } from '@/components/ui/field'
import { PageLoader } from '@/components/ui/page-loader'

export default function ReferentsPage() {
  const [referents, setReferents] = React.useState<Referent[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [draft, setDraft] = React.useState({ display_name: '', internal_identifier: '' })
  const fileInput = React.useRef<HTMLInputElement>(null)

  const reload = React.useCallback(async () => {
    try {
      setReferents(await fetchReferents())
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

  /**
   * Import CSV. On accepte une simple colonne de noms comme un fichier
   * avec en-têtes : les référents arrivent souvent d'un export tableur
   * bricolé, pas d'un format normalisé.
   */
  const handleFile = (file: File) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (parsed) => {
        const rows = parsed.data
          .map((row) => {
            const keys = Object.keys(row)
            const nameKey =
              keys.find((k) => /nom|name|prénom|prenom|référent|referent/i.test(k)) ?? keys[0]
            const idKey = keys.find((k) => /identifiant|matricule|id|code/i.test(k))
            return {
              display_name: (nameKey ? row[nameKey] : '')?.trim() ?? '',
              internal_identifier: idKey ? row[idKey]?.trim() : undefined,
            }
          })
          .filter((row) => row.display_name)

        if (rows.length === 0) {
          setError('Aucun nom trouvé dans ce fichier.')
          return
        }

        await run(async () => {
          const result = await importReferents(rows, referents ?? [])
          setNotice(
            `${result.created} référent${result.created > 1 ? 's' : ''} ajouté${result.created > 1 ? 's' : ''}` +
              (result.skipped > 0 ? `, ${result.skipped} déjà présent${result.skipped > 1 ? 's' : ''}.` : '.'),
          )
        })
      },
      error: () => setError('Ce fichier CSV est illisible.'),
    })
  }

  if (error && !referents) return <EmptyState title="Référents indisponibles" description={error} />
  if (!referents) return <PageLoader label="Chargement des référents…" />

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="rounded-[9px] bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-[9px] bg-brand-soft px-3 py-2 text-sm text-brand-strong">{notice}</p>
      )}

      <Card>
        <CardHeader
          title="Ajouter un référent"
          description="Ils apparaissent aussitôt dans le formulaire public. Aucun compte n'est créé."
        />

        <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
          <Field label="Nom affiché" id="ref-name" required>
            <TextInput
              id="ref-name"
              value={draft.display_name}
              onChange={(event) => setDraft({ ...draft, display_name: event.target.value })}
              placeholder="Ex. Camille"
            />
          </Field>
          <Field label="Identifiant interne" id="ref-id" help="facultatif">
            <TextInput
              id="ref-id"
              value={draft.internal_identifier}
              onChange={(event) => setDraft({ ...draft, internal_identifier: event.target.value })}
            />
          </Field>
          <Button
            disabled={!draft.display_name.trim()}
            onClick={() =>
              run(async () => {
                await saveReferent({
                  display_name: draft.display_name.trim(),
                  internal_identifier: draft.internal_identifier.trim() || null,
                })
                setDraft({ display_name: '', internal_identifier: '' })
              })
            }
          >
            <Plus className="size-4" aria-hidden />
            Ajouter
          </Button>
        </div>

        <div className="mt-4 border-t border-line pt-4">
          <input
            ref={fileInput}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) handleFile(file)
              event.target.value = ''
            }}
          />
          <Button variant="secondary" size="sm" onClick={() => fileInput.current?.click()}>
            <Upload className="size-4" aria-hidden />
            Importer un CSV
          </Button>
          <p className="mt-2 text-xs text-ink-faint">
            Une colonne de noms suffit. Les référents déjà présents sont ignorés, accents et
            majuscules compris — pas de doublon invisible dans les statistiques.
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader title={`${referents.length} référents`} />
        <ul className="divide-y divide-line">
          {referents.map((referent) => (
            <li key={referent.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div>
                <p className={referent.active ? 'font-medium' : 'font-medium text-ink-faint'}>
                  {referent.display_name}
                  {!referent.active && <span className="ml-2 text-xs">(inactif)</span>}
                </p>
                {referent.internal_identifier && (
                  <p className="font-mono text-xs text-ink-faint">{referent.internal_identifier}</p>
                )}
              </div>

              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={referent.active}
                    onChange={(event) =>
                      run(() => saveReferent({ id: referent.id, active: event.target.checked }))
                    }
                    className="size-4 rounded border-line-strong accent-[var(--brand)]"
                  />
                  Actif
                </label>

                <button
                  type="button"
                  aria-label={`Supprimer ${referent.display_name}`}
                  className="touch-target text-ink-faint hover:text-danger"
                  onClick={() => run(() => deleteReferent(referent.id))}
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-ink-faint">
          Un référent ayant déjà envoyé des débriefings ne peut pas être supprimé — décochez
          « Actif » à la place, l'historique reste lisible.
        </p>
      </Card>
    </div>
  )
}
