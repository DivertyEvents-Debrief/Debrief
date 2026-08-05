import * as React from 'react'
import { Link } from 'react-router-dom'
import { fetchActivityLog, type LogEntry } from '@/lib/admin-api'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, EmptyState } from '@/components/ui/card'
import { PageLoader } from '@/components/ui/page-loader'
import { formatDateTime } from '@/lib/utils'

const PAGE = 50

/** Le journal parle français, pas en codes techniques. */
function describe(entry: LogEntry): string {
  const status = (entry.new_value as { status?: string } | null)?.status
  const handled = (entry.new_value as { handled?: boolean } | null)?.handled

  switch (entry.action) {
    case 'submitted': return 'Débriefing envoyé par le référent'
    case 'read': return 'Débriefing ouvert pour la première fois'
    case 'status_changed': return status ? `Statut passé à « ${status} »` : 'Statut modifié'
    case 'callback_updated': return handled ? 'Rappel marqué comme traité' : 'Rappel rouvert'
    case 'retention_purge': {
      const info = entry.new_value as { debriefs?: number; retention_months?: number } | null
      return `Purge de conservation : ${info?.debriefs ?? 0} débriefing(s) supprimé(s) après ${info?.retention_months ?? '?'} mois`
    }
    default: return entry.action
  }
}

export default function LogsPage() {
  const [page, setPage] = React.useState(0)
  const [data, setData] = React.useState<{ total: number; rows: LogEntry[] } | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true
    fetchActivityLog(PAGE, page * PAGE)
      .then((result) => active && setData(result))
      .catch((caught: Error) => active && setError(caught.message))
    return () => { active = false }
  }, [page])

  if (error) return <EmptyState title="Journal indisponible" description={error} />
  if (!data) return <PageLoader label="Chargement du journal…" />

  const totalPages = Math.max(Math.ceil(data.total / PAGE), 1)

  return (
    <Card>
      <CardHeader
        title="Journal des actions"
        description={`${data.total} entrée${data.total > 1 ? 's' : ''}. Conservé aussi longtemps que les débriefings associés.`}
      />

      {data.rows.length === 0 ? (
        <p className="text-sm text-ink-faint">Aucune action enregistrée pour l'instant.</p>
      ) : (
        <ol className="divide-y divide-line">
          {data.rows.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-baseline justify-between gap-2 py-2.5">
              <div>
                <p className="text-sm">{describe(entry)}</p>
                <p className="text-xs text-ink-faint">
                  {entry.author}
                  {entry.reference && entry.debrief_id && (
                    <>
                      {' · '}
                      <Link
                        to={`/espace/debriefings/${entry.debrief_id}`}
                        className="font-mono underline-offset-2 hover:underline"
                      >
                        {entry.reference}
                      </Link>
                    </>
                  )}
                </p>
              </div>
              <time className="font-mono text-xs text-ink-faint" dateTime={entry.created_at}>
                {formatDateTime(entry.created_at)}
              </time>
            </li>
          ))}
        </ol>
      )}

      <nav aria-label="Pagination du journal" className="mt-4 flex items-center justify-between gap-3 text-sm">
        <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
          Précédent
        </Button>
        <span className="text-ink-muted" aria-live="polite">Page {page + 1} sur {totalPages}</span>
        <Button
          variant="secondary"
          size="sm"
          disabled={page + 1 >= totalPages}
          onClick={() => setPage(page + 1)}
        >
          Suivant
        </Button>
      </nav>
    </Card>
  )
}
