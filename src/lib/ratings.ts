/**
 * Échelle de notation partagée par le formulaire public, les fiches et les
 * statistiques. Règle non négociable : jamais l'emoji seul — toujours le
 * chiffre ET le libellé, pour les lecteurs d'écran comme pour l'impression.
 */
export type RatingOption = { value: number; emoji: string; label: string }

export const DEFAULT_RATING_SCALE: RatingOption[] = [
  { value: 1, emoji: '😫', label: 'Abominable' },
  { value: 2, emoji: '😕', label: 'Mauvais' },
  { value: 3, emoji: '😐', label: 'Moyen' },
  { value: 4, emoji: '🙂', label: 'Très bien' },
  { value: 5, emoji: '🤩', label: 'Formidable' },
]

export function ratingOption(value: number | null | undefined, scale = DEFAULT_RATING_SCALE) {
  if (value === null || value === undefined) return null
  return scale.find((o) => o.value === value) ?? null
}

/** Texte complet destiné aux lecteurs d'écran et aux exports. */
export function ratingText(value: number | null | undefined, scale = DEFAULT_RATING_SCALE): string {
  const option = ratingOption(value, scale)
  if (!option) return 'Non renseigné'
  return `${option.value} sur 5 — ${option.label}`
}

/** Couleur de fond des barres du graphique de répartition. */
export function ratingTone(value: number): string {
  return (
    {
      1: 'var(--color-danger)',
      2: 'var(--color-attention)',
      3: 'var(--color-ink-faint)',
      4: 'color-mix(in oklab, var(--brand) 60%, white)',
      5: 'var(--color-brand)',
    }[value] ?? 'var(--color-ink-faint)'
  )
}
