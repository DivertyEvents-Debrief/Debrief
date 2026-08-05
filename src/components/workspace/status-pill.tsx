import { cn } from '@/lib/utils'

const TONES: Record<string, string> = {
  neutral: 'bg-canvas text-ink-muted border-line-strong',
  info: 'bg-brand-soft text-brand-strong border-brand-line',
  attention: 'bg-attention-soft text-attention border-warm-line',
  progress: 'bg-canvas text-ink border-line-strong',
  success: 'bg-brand-soft text-brand-strong border-brand-line',
  muted: 'bg-canvas text-ink-faint border-line',
}

/**
 * Le libellé est toujours écrit. La couleur seule ne porte jamais
 * l'information : c'est la règle d'accessibilité du §23, et elle vaut
 * aussi pour quelqu'un qui imprime en noir et blanc.
 */
export function StatusPill({
  status,
  className,
}: {
  status: { code: string; label: string; tone: string }
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium',
        TONES[status.tone] ?? TONES.neutral,
        className,
      )}
    >
      {status.label}
    </span>
  )
}
