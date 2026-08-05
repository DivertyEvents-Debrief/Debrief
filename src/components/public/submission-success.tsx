
import { CheckCircle2, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ReferenceStamp } from '@/components/ui/stamp'
import { formatDateTime } from '@/lib/utils'

export function SubmissionSuccess({
  reference,
  submittedAt,
  message,
  onRestart,
}: {
  reference: string
  submittedAt: string
  message: string
  onRestart: () => void
}) {
  return (
    <div className="animate-rise space-y-6 text-center" role="status" aria-live="polite">
      <CheckCircle2 className="mx-auto size-12 text-brand" aria-hidden />

      <div className="space-y-2">
        <h2 className="font-display text-2xl font-semibold">Débriefing envoyé</h2>
        <p className="mx-auto max-w-md text-ink-muted">{message}</p>
      </div>

      <div className="flex justify-center py-2">
        <ReferenceStamp reference={reference} />
      </div>

      <p className="text-sm text-ink-muted">Envoyé le {formatDateTime(submittedAt)}</p>

      <Button type="button" variant="secondary" size="lg" onClick={onRestart}>
        <RotateCcw className="size-4" aria-hidden />
        Remplir un nouveau débriefing
      </Button>
    </div>
  )
}
