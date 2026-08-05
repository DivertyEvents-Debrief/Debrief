
import { Check, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Deux cartes explicites plutôt qu'une case à cocher ambiguë :
 * on ne devine jamais ce que « coché » voulait dire.
 */
export function YesNoChoice({
  name,
  value,
  onChange,
  yesLabel = 'Oui',
  noLabel = 'Non',
  labelledBy,
  describedBy,
}: {
  name: string
  value: boolean | null
  onChange: (value: boolean) => void
  yesLabel?: string
  noLabel?: string
  labelledBy?: string
  describedBy?: string
}) {
  const choices = [
    { key: true, label: yesLabel, Icon: Check },
    { key: false, label: noLabel, Icon: X },
  ] as const

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className="grid gap-2 sm:grid-cols-2"
    >
      {choices.map(({ key, label, Icon }) => {
        const selected = value === key
        return (
          <button
            key={String(key)}
            type="button"
            role="radio"
            name={name}
            aria-checked={selected}
            onClick={() => onChange(key)}
            className={cn(
              'touch-target flex items-center gap-3 rounded-[var(--radius-card)] border px-4 py-3 text-left transition-colors',
              selected
                ? 'border-brand bg-brand-soft shadow-[inset_0_0_0_1px_var(--color-brand)]'
                : 'border-line bg-surface hover:border-brand-line',
            )}
          >
            <span
              className={cn(
                'flex size-8 shrink-0 items-center justify-center rounded-full border',
                selected ? 'border-brand bg-brand text-white' : 'border-line-strong text-ink-faint',
              )}
              aria-hidden
            >
              <Icon className="size-4" />
            </span>
            <span className="font-medium">{label}</span>
          </button>
        )
      })}
    </div>
  )
}
