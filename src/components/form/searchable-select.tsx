
import * as React from 'react'
import * as Popover from '@radix-ui/react-popover'
import { Command } from 'cmdk'
import { Check, ChevronsUpDown, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { inputClasses } from '@/components/ui/field'

export interface SelectOption {
  value: string
  label: string
}

/**
 * Liste avec recherche. En dessous de 8 entrées la recherche est masquée :
 * inutile de faire chercher un référent parmi cinq prénoms.
 */
export function SearchableSelect({
  id,
  options,
  value,
  onChange,
  placeholder = 'Sélectionner',
  searchPlaceholder = 'Rechercher',
  emptyMessage = 'Aucun résultat.',
  disabled,
  'aria-describedby': describedBy,
  'aria-invalid': invalid,
}: {
  id?: string
  options: SelectOption[]
  value: string | null
  onChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyMessage?: string
  disabled?: boolean
  'aria-describedby'?: string
  'aria-invalid'?: boolean
}) {
  const [open, setOpen] = React.useState(false)
  const selected = options.find((option) => option.value === value)
  const showSearch = options.length >= 8

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          disabled={disabled || options.length === 0}
          className={cn(inputClasses, 'flex items-center justify-between text-left')}
        >
          <span className={cn(!selected && 'text-ink-faint')}>
            {options.length === 0 ? 'Aucune option disponible' : (selected?.label ?? placeholder)}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-ink-faint" aria-hidden />
        </button>
      </Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-[var(--shadow-lift)] animate-rise"
        >
          <Command loop>
            {showSearch && (
              <div className="flex items-center gap-2 border-b border-line px-3">
                <Search className="size-4 text-ink-faint" aria-hidden />
                <Command.Input
                  placeholder={searchPlaceholder}
                  className="h-11 w-full bg-transparent text-[16px] outline-none placeholder:text-ink-faint"
                />
              </div>
            )}
            <Command.List className="max-h-64 overflow-y-auto p-1.5">
              <Command.Empty className="px-3 py-6 text-center text-sm text-ink-muted">
                {emptyMessage}
              </Command.Empty>
              {options.map((option) => (
                <Command.Item
                  key={option.value}
                  value={option.label}
                  onSelect={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                  className="flex min-h-[44px] cursor-pointer items-center justify-between gap-2 rounded-[9px] px-3 text-[0.95rem] data-[selected=true]:bg-brand-soft"
                >
                  {option.label}
                  {option.value === value && <Check className="size-4 text-brand" aria-hidden />}
                </Command.Item>
              ))}
            </Command.List>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
