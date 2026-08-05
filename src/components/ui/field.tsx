
import * as React from 'react'
import { cn } from '@/lib/utils'

export function Field({
  id,
  label,
  help,
  error,
  required,
  children,
  counter,
}: {
  id: string
  label: React.ReactNode
  help?: React.ReactNode
  error?: string
  required?: boolean
  children: React.ReactNode
  counter?: { current: number; max?: number }
}) {
  const helpId = help ? `${id}-help` : undefined
  const errorId = error ? `${id}-error` : undefined

  return (
    <div className="space-y-2">
      <label htmlFor={id} className="block text-[0.95rem] font-medium leading-snug">
        {label}
        {required ? (
          <span className="ml-1 text-brand" aria-hidden>
            *
          </span>
        ) : (
          <span className="ml-2 text-xs font-normal text-ink-faint">facultatif</span>
        )}
      </label>

      {help && (
        <p id={helpId} className="text-sm text-ink-muted">
          {help}
        </p>
      )}

      {React.isValidElement(children)
        ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
            id,
            'aria-describedby': [helpId, errorId].filter(Boolean).join(' ') || undefined,
            'aria-invalid': error ? true : undefined,
            'aria-required': required || undefined,
          })
        : children}

      <div className="flex items-start justify-between gap-3">
        <p
          id={errorId}
          role={error ? 'alert' : undefined}
          className={cn('text-sm text-danger', !error && 'sr-only')}
        >
          {error}
        </p>
        {counter && (
          <p className="tabular shrink-0 text-xs text-ink-faint" aria-live="polite">
            {counter.current}
            {counter.max ? ` / ${counter.max}` : ''}
          </p>
        )}
      </div>
    </div>
  )
}

export const inputClasses =
  'touch-target w-full rounded-[var(--radius-control)] border border-line-strong bg-surface px-3.5 py-2.5 text-[16px] leading-normal ' +
  'placeholder:text-ink-faint focus:border-brand focus:outline-none focus-visible:outline-2 focus-visible:outline-brand-strong ' +
  'aria-[invalid=true]:border-danger transition-colors'

export const TextInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function TextInput({ className, ...props }, ref) {
    return <input ref={ref} className={cn(inputClasses, className)} {...props} />
  },
)

export const TextArea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function TextArea({ className, rows = 5, ...props }, ref) {
  return <textarea ref={ref} rows={rows} className={cn(inputClasses, 'resize-y', className)} {...props} />
})
