import * as React from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ImageIcon, PhoneCall, Wrench } from 'lucide-react'
import type { DebriefFilters } from '@/lib/types'
import {
  fetchDebriefs,
  fetchFilterOptions,
  SORT_LABELS,
  type DebriefPage,
  type DebriefRow,
  type FilterOptions,
  type SortKey,
} from '@/lib/workspace-api'
import { DebriefFilterBar } from '@/components/workspace/debrief-filters'
import { StatusPill } from '@/components/workspace/status-pill'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/card'
import { inputClasses } from '@/components/ui/field'
import { PageLoader } from '@/components/ui/page-loader'
import { formatDate, formatDateTime } from '@/lib/utils'
import { ratingText } from '@/lib/ratings'

const PAGE_SIZE = 25

/**
 * Les filtres vivent dans l'URL, pas dans un état local.
 *
 * C'est ce qui fait qu'un retour depuis une fiche retrouve exactement la
 * liste qu'on avait quittée — exigence du §12 — et qu'une sélection peut
 * se transmettre par simple copie du lien.
 */
function readFilters(params: URLSearchParams): DebriefFilters {
  const list = (key: string) => {
    const raw = params.get(key)
    return raw ? raw.split(',').filter(Boolean) : undefined
  }
  const text = (key: string) => params.get(key) || undefined

  return {
    date_field: (text('champ') as DebriefFilters['date_field']) ?? undefined,
    date_from: text('du'),
    date_to: text('au'),
    commercial_ids: list('commerciaux'),
    referent_ids: list('referents'),
    status_codes: list('statuts'),
    overall_ratings: list('notes'),
    callback: text('rappel') as DebriefFilters['callback'],
    has_images: text('images') as DebriefFilters['has_images'],
    has_material: text('materiel') as DebriefFilters['has_material'],
    read_state: text('lecture') as DebriefFilters['read_state'],
    archived: text('archives') as DebriefFilters['archived'],
    search: text('q'),
  }
}

function writeFilters(filters: DebriefFilters, sort: SortKey, page: number): URLSearchParams {
  const params = new URLSearchParams()
  const set = (key: string, value: string | string[] | undefined) => {
    if (!value || (Array.isArray(value) && value.length === 0)) return
    params.set(key, Array.isArray(value) ? value.join(',') : value)
  }

  set('champ', filters.date_field)
  set('du', filters.date_from)
  set('au', filters.date_to)
  set('commerciaux', filters.commercial_ids)
  set('referents', filters.referent_ids)
  set('statuts', filters.status_codes)
  set('notes', filters.overall_ratings)
  set('rappel', filters.callback)
  set('images', filters.has_images)
  set('materiel', filters.has_material)
  set('lecture', filters.read_state)
  set('archives', filters.archived)
  set('q', filters.search)
  if (sort !== 'submitted_desc') params.set('tri', sort)
  if (page > 1) params.set('page', String(page))

  return params
}

export default function DebriefListPage() {
  const [params, setParams] = useSearchParams()

  const filters = React.useMemo(() => readFilters(params), [params])
  const sort = (params.get('tri') as SortKey) || 'submitted_desc'
  const page = Math.max(Number(params.get('page') ?? 1), 1)

  const [result, setResult] = React.useState<DebriefPage | null>(null)
  const [options, setOptions] = React.useState<FilterOptions | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    fetchFilterOptions().then(setOptions).catch(() => setOptions(null))
  }, [])

  React.useEffect(() => {
    let active = true
    setLoading(true)

    fetchDebriefs(filters, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }, sort)
      .then((data) => {
        if (!active) return
        setResult(data)
        setError(null)
      })
      .catch((caught: Error) => active && setError(caught.message))
      .finally(() => active && setLoading(false))

    return () => {
      active = false
    }
  }, [filters, sort, page])

  const update = (next: DebriefFilters, nextSort = sort, nextPage = 1) => {
    setParams(writeFilters(next, nextSort, nextPage), { replace: false })
  }

  const totalPages = result ? Math.max(Math.ceil(result.total / PAGE_SIZE), 1) : 1

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Débriefings</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {result
              ? `${result.total} débriefing${result.total > 1 ? 's' : ''} correspondant${result.total > 1 ? 's' : ''} aux filtres`
              : 'Chargement…'}
          </p>
        </div>

        <label className="text-sm">
          <span className="sr-only">Trier par</span>
          <select
            value={sort}
            onChange={(event) => update(filters, event.target.value as SortKey, 1)}
            className={inputClasses}
          >
            {Object.entries(SORT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </header>

      <DebriefFilterBar filters={filters} options={options} onChange={(next) => update(next)} />

      {error && <EmptyState title="Liste indisponible" description={error} />}

      {!error && loading && !result && <PageLoader label="Chargement des débriefings…" />}

      {!error && result && result.rows.length === 0 && (
        <EmptyState
          title="Aucun débriefing ne correspond"
          description="Élargissez la période ou retirez un filtre. Les débriefings archivés sont masqués par défaut."
          action={<Button variant="secondary" onClick={() => update({})}>Effacer les filtres</Button>}
        />
      )}

      {!error && result && result.rows.length > 0 && (
        <>
          {/* Tableau sur grand écran */}
          <div className="hidden overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface lg:block">
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">
                Liste des débriefings, triée : {SORT_LABELS[sort]}
              </caption>
              <thead>
                <tr className="border-b border-line text-left text-ink-muted">
                  <th scope="col" className="px-4 py-3 font-medium">Référence</th>
                  <th scope="col" className="px-4 py-3 font-medium">Client / prestation</th>
                  <th scope="col" className="px-4 py-3 font-medium">Référent</th>
                  <th scope="col" className="px-4 py-3 font-medium">Commercial</th>
                  <th scope="col" className="px-4 py-3 font-medium">Événement</th>
                  <th scope="col" className="px-4 py-3 font-medium">Note</th>
                  <th scope="col" className="px-4 py-3 font-medium">Statut</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((row) => (
                  <tr key={row.id} className="border-b border-line last:border-0 hover:bg-canvas">
                    <td className="px-4 py-3">
                      <Link
                        to={`/espace/debriefings/${row.id}${window.location.search}`}
                        className="font-mono text-[0.8rem] underline-offset-2 hover:underline"
                      >
                        {row.public_reference}
                      </Link>
                      {row.read_at === null && (
                        <span className="ml-2 rounded-full bg-brand-soft px-1.5 py-0.5 text-[0.7rem] text-brand-strong">
                          nouveau
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium">{row.client_or_service_name}</span>
                      <Markers row={row} />
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{row.referent.display_name}</td>
                    <td className="px-4 py-3 text-ink-muted">{row.commercial.display_name}</td>
                    <td className="px-4 py-3 text-ink-muted">{formatDate(row.event_date)}</td>
                    <td className="px-4 py-3">
                      {row.overall_rating === null ? (
                        <span className="text-ink-faint">—</span>
                      ) : (
                        <span className="whitespace-nowrap">
                          <span className="font-mono tabular-nums">{row.overall_rating}</span>
                          <span className="text-ink-muted"> · {ratingText(row.overall_rating)}</span>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={row.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cartes sur mobile : un tableau à sept colonnes ne tient pas. */}
          <ul className="space-y-3 lg:hidden">
            {result.rows.map((row) => (
              <li key={row.id}>
                <Link
                  to={`/espace/debriefings/${row.id}${window.location.search}`}
                  className="card block space-y-2 p-4 transition-colors hover:border-brand-line"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{row.client_or_service_name}</p>
                      <p className="font-mono text-xs text-ink-faint">{row.public_reference}</p>
                    </div>
                    <StatusPill status={row.status} />
                  </div>

                  <p className="text-sm text-ink-muted">
                    {row.referent.display_name} · {formatDate(row.event_date)}
                  </p>

                  <div className="flex items-center gap-3 text-sm">
                    {row.overall_rating !== null && (
                      <span>
                        <span className="font-mono tabular-nums">{row.overall_rating}</span>
                        <span className="text-ink-muted">/5 · {ratingText(row.overall_rating)}</span>
                      </span>
                    )}
                    <Markers row={row} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          <nav
            aria-label="Pagination"
            className="flex items-center justify-between gap-3 pt-2 text-sm"
          >
            <Button
              variant="secondary"
              disabled={page <= 1}
              onClick={() => update(filters, sort, page - 1)}
            >
              Précédent
            </Button>
            <span className="text-ink-muted" aria-live="polite">
              Page {page} sur {totalPages}
            </span>
            <Button
              variant="secondary"
              disabled={page >= totalPages}
              onClick={() => update(filters, sort, page + 1)}
            >
              Suivant
            </Button>
          </nav>

          <p className="text-xs text-ink-faint">
            Dernier débriefing reçu le {formatDateTime(result.rows[0]?.submitted_at)}.
          </p>
        </>
      )}
    </div>
  )
}

/** Repères visuels : rappel en attente, images, retour matériel. */
function Markers({ row }: { row: DebriefRow }) {
  const markers: React.ReactNode[] = []

  if (row.callback_requested && !row.callback_handled_at) {
    markers.push(
      <span key="rappel" className="inline-flex items-center gap-1 text-warm">
        <PhoneCall className="size-3.5" aria-hidden />
        rappel à traiter
      </span>,
    )
  }
  if (row.attachment_count > 0) {
    markers.push(
      <span key="images" className="inline-flex items-center gap-1 text-ink-faint">
        <ImageIcon className="size-3.5" aria-hidden />
        {row.attachment_count}
      </span>,
    )
  }
  if (row.material_feedback_count > 0) {
    markers.push(
      <span key="materiel" className="inline-flex items-center gap-1 text-ink-faint">
        <Wrench className="size-3.5" aria-hidden />
        {row.material_feedback_count}
      </span>,
    )
  }

  if (markers.length === 0) return null
  return <span className="mt-1 flex flex-wrap items-center gap-3 text-xs">{markers}</span>
}
