import * as React from 'react'
import { Link } from 'react-router-dom'
import { Search, Wrench } from 'lucide-react'
import { getSupabase } from '@/lib/supabase/client'
import { signAttachment } from '@/lib/workspace-api'
import { Button } from '@/components/ui/button'
import { Card, EmptyState } from '@/components/ui/card'
import { TextArea, inputClasses } from '@/components/ui/field'
import { PageLoader } from '@/components/ui/page-loader'
import { cn, formatDate, formatDateTime } from '@/lib/utils'

type MaterialStatus = 'non_traite' | 'en_cours' | 'traite'

const STATUS_LABELS: Record<MaterialStatus, string> = {
  non_traite: 'Non traité',
  en_cours: 'En cours',
  traite: 'Traité',
}

const STATUS_STYLES: Record<MaterialStatus, string> = {
  non_traite: 'border-warm-line bg-attention-soft text-attention',
  en_cours: 'border-line-strong bg-canvas text-ink',
  traite: 'border-brand-line bg-brand-soft text-brand-strong',
}

interface MaterialRow {
  id: string
  material_name: string
  feedback: string
  status: MaterialStatus
  status_note: string | null
  status_changed_at: string | null
  status_changed_by: string | null
  category: string | null
  debrief: {
    id: string
    reference: string
    client: string
    event_date: string
    referent: string | null
    commercial: string | null
  }
  photos: { id: string; storage_path: string; original_name: string }[]
}

interface Page {
  total: number
  rows: MaterialRow[]
  counts: Partial<Record<MaterialStatus, number>>
}

const PAGE_SIZE = 25

export default function MaterialPage() {
  const [filter, setFilter] = React.useState<MaterialStatus[]>(['non_traite', 'en_cours'])
  const [search, setSearch] = React.useState('')
  const [debounced, setDebounced] = React.useState('')
  const [page, setPage] = React.useState(0)
  const [data, setData] = React.useState<Page | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(search), 350)
    return () => clearTimeout(timer)
  }, [search])

  const load = React.useCallback(async () => {
    const { data: result, error: rpcError } = await getSupabase().rpc('list_material_feedback', {
      p_status: filter.length > 0 ? filter : null,
      p_search: debounced || null,
      p_limit: PAGE_SIZE,
      p_offset: page * PAGE_SIZE,
    })

    if (rpcError) {
      setError("Les retours matériel n'ont pas pu être chargés.")
      return
    }
    setData(result as Page)
    setError(null)
  }, [filter, debounced, page])

  React.useEffect(() => {
    void load()
  }, [load])

  const setStatus = async (id: string, status: MaterialStatus, note?: string) => {
    const { error: rpcError } = await getSupabase().rpc('set_material_status', {
      p_item_id: id,
      p_status: status,
      p_note: note ?? null,
    })
    if (rpcError) setError("L'état n'a pas pu être enregistré.")
    else await load()
  }

  if (error && !data) return <EmptyState title="Atelier indisponible" description={error} />
  if (!data) return <PageLoader label="Chargement des retours matériel…" />

  const totalPages = Math.max(Math.ceil(data.total / PAGE_SIZE), 1)

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Retours matériel</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Tous les signalements des référents, les non traités en premier.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint"
            aria-hidden
          />
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(0)
            }}
            placeholder="Matériel, description, référence, client…"
            aria-label="Rechercher un retour matériel"
            className={cn(inputClasses, 'pl-9')}
          />
        </div>

        <fieldset className="flex flex-wrap gap-1.5">
          <legend className="sr-only">Filtrer par état</legend>
          {(Object.keys(STATUS_LABELS) as MaterialStatus[]).map((status) => {
            const active = filter.includes(status)
            const count = data.counts[status] ?? 0
            return (
              <button
                key={status}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setFilter((current) =>
                    current.includes(status)
                      ? current.filter((s) => s !== status)
                      : [...current, status],
                  )
                  setPage(0)
                }}
                className={cn(
                  'touch-target rounded-full border px-3 py-1 text-sm',
                  active ? STATUS_STYLES[status] : 'border-line-strong text-ink-muted',
                )}
              >
                {STATUS_LABELS[status]}
                <span className="ml-1.5 font-mono text-xs tabular-nums">{count}</span>
              </button>
            )
          })}
        </fieldset>
      </div>

      {error && (
        <p role="alert" className="rounded-[9px] bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {data.rows.length === 0 ? (
        <EmptyState
          title="Rien à traiter ici"
          description="Aucun retour matériel ne correspond à ces filtres."
          action={
            <Button variant="secondary" onClick={() => setFilter(['non_traite', 'en_cours', 'traite'])}>
              Tout afficher
            </Button>
          }
        />
      ) : (
        <ul className="space-y-4">
          {data.rows.map((row) => (
            <MaterialCard key={row.id} row={row} onStatus={setStatus} />
          ))}
        </ul>
      )}

      <nav aria-label="Pagination" className="flex items-center justify-between gap-3 text-sm">
        <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
          Précédent
        </Button>
        <span className="text-ink-muted" aria-live="polite">
          Page {page + 1} sur {totalPages}
        </span>
        <Button
          variant="secondary"
          size="sm"
          disabled={page + 1 >= totalPages}
          onClick={() => setPage(page + 1)}
        >
          Suivant
        </Button>
      </nav>
    </div>
  )
}

function MaterialCard({
  row,
  onStatus,
}: {
  row: MaterialRow
  onStatus: (id: string, status: MaterialStatus, note?: string) => Promise<void>
}) {
  const [note, setNote] = React.useState(row.status_note ?? '')
  const [noteOpen, setNoteOpen] = React.useState(false)

  return (
    <li>
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex gap-3">
            <Wrench className="mt-0.5 size-5 shrink-0 text-ink-faint" aria-hidden />
            <div>
              <p className="font-medium">{row.material_name}</p>
              {row.category && <p className="text-xs text-ink-faint">{row.category}</p>}
              {row.feedback && <p className="mt-1 text-sm text-ink-muted">{row.feedback}</p>}
            </div>
          </div>

          <span
            className={cn(
              'shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium',
              STATUS_STYLES[row.status],
            )}
          >
            {STATUS_LABELS[row.status]}
          </span>
        </div>

        <p className="mt-3 text-xs text-ink-faint">
          <Link
            to={`/espace/debriefings/${row.debrief.id}`}
            className="font-mono underline-offset-2 hover:underline"
          >
            {row.debrief.reference}
          </Link>
          {' · '}
          {row.debrief.client} · {formatDate(row.debrief.event_date)}
          {row.debrief.referent && ` · signalé par ${row.debrief.referent}`}
        </p>

        {row.photos.length > 0 && <PhotoStrip photos={row.photos} />}

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {(Object.keys(STATUS_LABELS) as MaterialStatus[]).map((status) => (
            <Button
              key={status}
              size="sm"
              variant={row.status === status ? 'primary' : 'secondary'}
              disabled={row.status === status}
              onClick={() => void onStatus(row.id, status, note)}
            >
              {STATUS_LABELS[status]}
            </Button>
          ))}

          <button
            type="button"
            onClick={() => setNoteOpen((open) => !open)}
            className="ml-auto text-sm text-ink-faint underline-offset-2 hover:text-brand-strong hover:underline"
          >
            {noteOpen ? 'Masquer la note' : row.status_note ? 'Voir la note' : 'Ajouter une note'}
          </button>
        </div>

        {noteOpen && (
          <div className="mt-3 space-y-2">
            <label htmlFor={`note-${row.id}`} className="text-sm font-medium">
              Note de suivi
            </label>
            <TextArea
              id={`note-${row.id}`}
              rows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Pièce commandée, renvoyé au fournisseur, remplacé…"
            />
            <Button size="sm" onClick={() => void onStatus(row.id, row.status, note)}>
              Enregistrer la note
            </Button>
          </div>
        )}

        {row.status_changed_at && (
          <p className="mt-2 text-xs text-ink-faint">
            {row.status_note && <span className="block text-ink-muted">{row.status_note}</span>}
            Dernière mise à jour le {formatDateTime(row.status_changed_at)}
            {row.status_changed_by ? ` par ${row.status_changed_by}` : ''}.
          </p>
        )}
      </Card>
    </li>
  )
}

/**
 * Les photos appartiennent au débriefing, pas à la ligne de matériel. On
 * les montre quand même ici : sans elles, la logistique devrait ouvrir la
 * fiche pour savoir de quel dégât on parle.
 */
function PhotoStrip({ photos }: { photos: { id: string; storage_path: string; original_name: string }[] }) {
  const [urls, setUrls] = React.useState<Record<string, string | null>>({})

  React.useEffect(() => {
    let active = true
    Promise.all(
      photos.map(async (photo) => [photo.id, await signAttachment(photo.storage_path)] as const),
    ).then((entries) => active && setUrls(Object.fromEntries(entries)))
    return () => {
      active = false
    }
  }, [photos])

  return (
    <ul className="mt-3 flex gap-2 overflow-x-auto">
      {photos.map((photo) => {
        const url = urls[photo.id]
        return (
          <li key={photo.id} className="shrink-0">
            {url ? (
              <a href={url} target="_blank" rel="noreferrer">
                <img
                  src={url}
                  alt={photo.original_name}
                  loading="lazy"
                  className="size-24 rounded-[var(--radius-control)] border border-line object-cover"
                />
              </a>
            ) : (
              <span className="flex size-24 items-center justify-center rounded-[var(--radius-control)] border border-line bg-canvas text-[0.65rem] text-ink-faint">
                {url === null ? 'indisponible' : '…'}
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}
