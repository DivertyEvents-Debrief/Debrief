
import * as React from 'react'
import { cn } from '@/lib/utils'
import { DEFAULT_RATING_SCALE, type RatingOption } from '@/lib/ratings'

/**
 * Sélection d'une note de 1 à 5.
 *
 * Accessibilité : c'est un vrai groupe de boutons radio (radiogroup +
 * navigation par flèches). L'emoji est décoratif — le chiffre et le libellé
 * sont toujours affichés, jamais l'emoji seul.
 */
export function RatingScale({
  name,
  value,
  onChange,
  options = DEFAULT_RATING_SCALE,
  labelledBy,
  describedBy,
  invalid,
}: {
  name: string
  value: number | null
  onChange: (value: number) => void
  options?: RatingOption[]
  labelledBy?: string
  describedBy?: string
  invalid?: boolean
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([])

  function handleKeyDown(event: React.KeyboardEvent, index: number) {
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown'
    const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
    if (!forward && !backward) return

    event.preventDefault()
    const next = forward
      ? (index + 1) % options.length
      : (index - 1 + options.length) % options.length
    const option = options[next]
    if (!option) return
    onChange(option.value)
    refs.current[next]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      className="grid grid-cols-5 gap-1.5 sm:gap-2.5"
    >
      {options.map((option, index) => {
        const selected = value === option.value
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[index] = el
            }}
            type="button"
            role="radio"
            name={name}
            aria-checked={selected}
            tabIndex={selected || (value === null && index === 0) ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              'group flex min-h-[104px] flex-col items-center justify-center gap-1 rounded-[var(--radius-card)] border px-1 py-3',
              'transition-[border-color,background-color,transform] duration-150',
              selected
                ? 'border-brand bg-brand-soft shadow-[inset_0_0_0_1px_var(--color-brand)]'
                : 'border-line bg-surface hover:border-brand-line hover:bg-brand-softer',
            )}
          >
            <span
              aria-hidden
              className={cn(
                'text-3xl leading-none transition-transform duration-200 sm:text-4xl',
                selected ? 'scale-110' : 'group-hover:scale-105',
              )}
            >
              {option.emoji}
            </span>
            <span className="tabular text-sm font-semibold">{option.value}</span>
            <span
              className={cn(
                'text-center text-[0.7rem] leading-tight sm:text-xs',
                selected ? 'text-brand-strong' : 'text-ink-muted',
              )}
            >
              {option.label}
            </span>
            <span className="sr-only">
              Note {option.value} sur 5 — {option.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Affichage en lecture seule, utilisé dans les fiches et le récapitulatif. */
export function RatingBadge({
  value,
  options = DEFAULT_RATING_SCALE,
  size = 'md',
}: {
  value: number | null | undefined
  options?: RatingOption[]
  size?: 'sm' | 'md'
}) {
  const option = options.find((o) => o.value === value)
  if (!option) {
    return <span className="text-sm text-ink-faint">Non renseigné</span>
  }
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border border-line bg-surface font-medium',
        size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm',
      )}
    >
      <span aria-hidden>{option.emoji}</span>
      <span className="tabular">{option.value}/5</span>
      <span className="text-ink-muted">{option.label}</span>
    </span>
  )
}
