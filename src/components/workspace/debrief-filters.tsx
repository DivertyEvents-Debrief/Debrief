import * as React from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import type { DebriefFilters } from '@/lib/types'
import type { FilterOptions } from '@/lib/workspace-api'
import { Button } from '@/components/ui/button'
import { inputClasses } from '@/components/ui/field'
import { cn } from '@/lib/utils'

/** Filtres §12. Les listes multiples se manipulent par pastilles cliquables. */
export function DebriefFilterBar({
  filters,
  options,
  onChange,
}: {
  filters: DebriefFilters
  options: FilterOptions | null
  onChange: (next: DebriefFilters) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState(filters.search ?? '')

  // La recherche part 350 ms après la dernière frappe : on ne déclenche pas
  // une requête par caractère.
  React.useEffect(() => {
    const timer = setTimeout(() => {
      if ((filters.search ?? '') !== search) onChange({ ...filters, search: search || undefined })
    }, 350)
    return () => clearTimeout(timer)
  }, [search, filters, onChange])

  type ListKey = 'commercial_ids' | 'referent_ids' | 'status_codes' | 'overall_ratings'

  const toggle = (key: ListKey, value: string) => {
    const current: string[] = filters[key] ?? []
    const next = current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value]
    onChange({ ...filters, [key]: next.length ? next : undefined })
  }

  const activeCount = countActive(filters)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" aria-hidden />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Référence, client, référent, texte des réponses…"
            aria-label="Rechercher un débriefing"
            className={cn(inputClasses, 'pl-9')}
          />
        </div>

        <Button
          variant="secondary"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-controls="panneau-filtres"
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          Filtres
          {activeCount > 0 && (
            <span className="ml-1 rounded-full bg-brand px-1.5 text-xs text-white">{activeCount}</span>
          )}
        </Button>

        {activeCount > 0 && (
          <Button variant="ghost" onClick={() => onChange({})}>
            <X className="size-4" aria-hidden />
            Tout effacer
          </Button>
        )}
      </div>

      {open && (
        <div id="panneau-filtres" className="card space-y-5 p-5">
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Période portant sur</span>
              <select
                value={filters.date_field ?? 'event_date'}
                onChange={(event) =>
                  onChange({ ...filters, date_field: event.target.value as DebriefFilters['date_field'] })
                }
                className={inputClasses}
              >
                <option value="event_date">la date de l'événement</option>
                <option value="submitted_at">la date de réception</option>
              </select>
            </label>

            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Du</span>
              <input
                type="date"
                value={filters.date_from ?? ''}
                onChange={(event) => onChange({ ...filters, date_from: event.target.value || undefined })}
                className={inputClasses}
              />
            </label>

            <label className="space-y-1.5 text-sm">
              <span className="font-medium">Au</span>
              <input
                type="date"
                value={filters.date_to ?? ''}
                onChange={(event) => onChange({ ...filters, date_to: event.target.value || undefined })}
                className={inputClasses}
              />
            </label>
          </div>

          {options && (
            <>
              <ChipGroup
                legend="Statut"
                items={options.statuses.map((s) => ({ value: s.code, label: s.label }))}
                selected={filters.status_codes ?? []}
                onToggle={(value) => toggle('status_codes', value)}
              />
              <ChipGroup
                legend="Commercial"
                items={options.commercials.map((c) => ({ value: c.id, label: c.display_name }))}
                selected={filters.commercial_ids ?? []}
                onToggle={(value) => toggle('commercial_ids', value)}
              />
              <ChipGroup
                legend="Référent"
                items={options.referents.map((r) => ({ value: r.id, label: r.display_name }))}
                selected={filters.referent_ids ?? []}
                onToggle={(value) => toggle('referent_ids', value)}
              />
            </>
          )}

          <ChipGroup
            legend="Note globale"
            items={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} sur 5` }))}
            selected={filters.overall_ratings ?? []}
            onToggle={(value) => toggle('overall_ratings', value)}
          />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Choice
              label="Demande de rappel"
              value={filters.callback ?? ''}
              onChange={(value) => onChange({ ...filters, callback: (value || undefined) as DebriefFilters['callback'] })}
              options={[
                ['', 'Peu importe'],
                ['pending', 'À traiter'],
                ['yes', 'Demandé'],
                ['no', 'Non demandé'],
              ]}
            />
            <Choice
              label="Lecture"
              value={filters.read_state ?? ''}
              onChange={(value) => onChange({ ...filters, read_state: (value || undefined) as DebriefFilters['read_state'] })}
              options={[
                ['', 'Peu importe'],
                ['unread', 'Non lus'],
                ['read', 'Lus'],
              ]}
            />
            <Choice
              label="Images"
              value={filters.has_images ?? ''}
              onChange={(value) => onChange({ ...filters, has_images: (value || undefined) as DebriefFilters['has_images'] })}
              options={[
                ['', 'Peu importe'],
                ['yes', 'Avec images'],
                ['no', 'Sans image'],
              ]}
            />
            <Choice
              label="Retour matériel"
              value={filters.has_material ?? ''}
              onChange={(value) => onChange({ ...filters, has_material: (value || undefined) as DebriefFilters['has_material'] })}
              options={[
                ['', 'Peu importe'],
                ['yes', 'Avec retour'],
                ['no', 'Sans retour'],
              ]}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={filters.archived === 'include'}
              onChange={(event) =>
                onChange({ ...filters, archived: event.target.checked ? 'include' : undefined })
              }
              className="size-4 rounded border-line-strong accent-[var(--brand)]"
            />
            Inclure les débriefings archivés
          </label>
        </div>
      )}
    </div>
  )
}

function ChipGroup({
  legend,
  items,
  selected,
  onToggle,
}: {
  legend: string
  items: { value: string; label: string }[]
  selected: string[]
  onToggle: (value: string) => void
}) {
  if (items.length === 0) return null

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => {
          const active = selected.includes(item.value)
          return (
            <button
              key={item.value}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(item.value)}
              className={cn(
                'touch-target rounded-full border px-3 py-1 text-sm transition-colors',
                active
                  ? 'border-brand bg-brand-soft text-brand-strong'
                  : 'border-line-strong text-ink-muted hover:border-brand-line',
              )}
            >
              {item.label}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

function Choice({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: [string, string][]
}) {
  return (
    <label className="space-y-1.5 text-sm">
      <span className="font-medium">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className={inputClasses}>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>
            {optionLabel}
          </option>
        ))}
      </select>
    </label>
  )
}

export function countActive(filters: DebriefFilters): number {
  return Object.entries(filters).filter(([key, value]) => {
    if (key === 'date_field') return false
    if (Array.isArray(value)) return value.length > 0
    return value !== undefined && value !== ''
  }).length
}
