
import * as React from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { TextArea, TextInput, inputClasses } from '@/components/ui/field'
import { EmptyState } from '@/components/ui/card'

export interface MaterialRow {
  id: string
  material_name: string
  feedback: string
}

export function createMaterialRow(): MaterialRow {
  return { id: crypto.randomUUID(), material_name: '', feedback: '' }
}

/**
 * Section « Retour matériel ». Zéro, une ou plusieurs lignes.
 * Le réordonnancement se fait avec deux boutons plutôt qu'un glisser-déposer :
 * sur un téléphone, au milieu d'un événement, c'est plus fiable et
 * accessible au clavier sans effort.
 */
export function MaterialFeedbackList({
  rows,
  onChange,
  suggestions,
  addLabel = 'Ajouter un retour matériel',
  maxItems = 30,
  error,
}: {
  rows: MaterialRow[]
  onChange: (rows: MaterialRow[]) => void
  suggestions: string[]
  addLabel?: string
  maxItems?: number
  error?: string
}) {
  const listId = React.useId()
  const [announcement, setAnnouncement] = React.useState('')

  function update(id: string, patch: Partial<MaterialRow>) {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)))
  }

  function remove(id: string, index: number) {
    onChange(rows.filter((row) => row.id !== id))
    setAnnouncement(`Ligne ${index + 1} supprimée. ${rows.length - 1} ligne(s) restante(s).`)
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= rows.length) return
    const next = [...rows]
    const moved = next[index]
    const swapped = next[target]
    if (!moved || !swapped) return
    next[index] = swapped
    next[target] = moved
    onChange(next)
    setAnnouncement(`Ligne déplacée en position ${target + 1}.`)
  }

  return (
    <div className="space-y-3">
      <datalist id={`${listId}-materials`}>
        {suggestions.map((suggestion) => (
          <option key={suggestion} value={suggestion} />
        ))}
      </datalist>

      {rows.length === 0 && (
        <EmptyState
          title="Aucun retour matériel"
          description="Si tout le matériel a fonctionné, passez simplement à l'étape suivante."
        />
      )}

      {rows.map((row, index) => (
        <div key={row.id} className="card space-y-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-ink-muted">Retour {index + 1}</p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                className="touch-target rounded-[9px] p-2 text-ink-faint hover:bg-brand-softer hover:text-brand-strong disabled:opacity-30"
                aria-label={`Déplacer le retour ${index + 1} vers le haut`}
              >
                <ArrowUp className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === rows.length - 1}
                className="touch-target rounded-[9px] p-2 text-ink-faint hover:bg-brand-softer hover:text-brand-strong disabled:opacity-30"
                aria-label={`Déplacer le retour ${index + 1} vers le bas`}
              >
                <ArrowDown className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => remove(row.id, index)}
                className="touch-target rounded-[9px] p-2 text-ink-faint hover:bg-danger-soft hover:text-danger"
                aria-label={`Supprimer le retour ${index + 1}`}
              >
                <Trash2 className="size-4" aria-hidden />
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor={`${listId}-${row.id}-name`} className="block text-sm font-medium">
              Matériel concerné
            </label>
            <TextInput
              id={`${listId}-${row.id}-name`}
              list={`${listId}-materials`}
              value={row.material_name}
              onChange={(event) => update(row.id, { material_name: event.target.value })}
              placeholder="Enceinte, vidéoprojecteur, malle…"
              className={inputClasses}
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor={`${listId}-${row.id}-feedback`} className="block text-sm font-medium">
              Retour, problème ou précision
            </label>
            <TextArea
              id={`${listId}-${row.id}-feedback`}
              rows={3}
              value={row.feedback}
              onChange={(event) => update(row.id, { feedback: event.target.value })}
              placeholder="Ce qui s'est passé"
            />
          </div>
        </div>
      ))}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <Button
        type="button"
        variant="secondary"
        onClick={() => onChange([...rows, createMaterialRow()])}
        disabled={rows.length >= maxItems}
        className="w-full sm:w-auto"
      >
        <Plus className="size-4" aria-hidden />
        {addLabel}
      </Button>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  )
}
