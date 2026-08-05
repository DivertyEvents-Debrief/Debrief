import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Formate une note : « 4,2 sur 5 ». Jamais de note nue sans échelle. */
export function formatRating(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${value.toFixed(value % 1 === 0 ? 0 : 1).replace('.', ',')} sur 5`
}

export function formatNumber(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)
}

export function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—'
  return `${formatNumber(value, digits)} %`
}

/** Délais exprimés en heures depuis la base, rendus lisibles. */
export function formatDelay(hours: number | null | undefined): string {
  if (hours === null || hours === undefined || Number.isNaN(hours)) return '—'
  if (hours < 1) return `${Math.round(hours * 60)} min`
  if (hours < 48) return `${formatNumber(hours, 1)} h`
  return `${formatNumber(hours / 24, 1)} j`
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(value))
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short' }).format(
    new Date(value),
  )
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`
  if (bytes < 1024 * 1024) return `${formatNumber(bytes / 1024)} Ko`
  return `${formatNumber(bytes / (1024 * 1024), 1)} Mo`
}

/** Évolution entre deux périodes, avec le texte explicatif attendu au §13.1. */
export function describeTrend(
  current: number | null | undefined,
  previous: number | null | undefined,
  options: { unit?: string; label: string; periodLabel: string; digits?: number },
): { direction: 'up' | 'down' | 'flat' | 'unknown'; delta: number | null; text: string } {
  const { unit = '', label, periodLabel, digits = 1 } = options
  if (current === null || current === undefined || previous === null || previous === undefined) {
    return {
      direction: 'unknown',
      delta: null,
      text: `Comparaison impossible : aucune donnée sur ${periodLabel}.`,
    }
  }
  const delta = current - previous
  const direction = Math.abs(delta) < 0.005 ? 'flat' : delta > 0 ? 'up' : 'down'
  const word = direction === 'flat' ? 'stable' : direction === 'up' ? 'hausse' : 'baisse'
  if (direction === 'flat') {
    return { direction, delta, text: `${label} : ${formatNumber(current, digits)}${unit} — stable par rapport à ${periodLabel}.` }
  }
  return {
    direction,
    delta,
    text: `${label} : ${formatNumber(current, digits)}${unit} — ${word} de ${formatNumber(Math.abs(delta), digits)}${unit} par rapport à ${periodLabel}.`,
  }
}
