
import { cn } from '@/lib/utils'

/**
 * Barre de progression du parcours. Le pourcentage est annoncé aux lecteurs
 * d'écran ; les segments sont un repère visuel, pas la seule information.
 */
export function StepProgress({
  steps,
  currentIndex,
  onJump,
}: {
  steps: { key: string; title: string }[]
  currentIndex: number
  onJump?: (index: number) => void
}) {
  const percent = Math.round(((currentIndex + 1) / steps.length) * 100)

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <p className="font-medium">
          Étape {currentIndex + 1} sur {steps.length}
        </p>
        <p className="tabular text-ink-muted">{percent} %</p>
      </div>

      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progression du débriefing : étape ${currentIndex + 1} sur ${steps.length}`}
        className="flex gap-1"
      >
        {steps.map((step, index) => {
          const done = index <= currentIndex
          const reachable = onJump && index < currentIndex
          const Tag = reachable ? 'button' : 'div'
          return (
            <Tag
              key={step.key}
              {...(reachable
                ? { type: 'button' as const, onClick: () => onJump(index), title: `Revenir à : ${step.title}` }
                : {})}
              className={cn(
                'h-1.5 flex-1 rounded-full transition-colors duration-300',
                done ? 'bg-brand' : 'bg-line',
                reachable && 'cursor-pointer hover:bg-brand-strong',
              )}
            >
              <span className="sr-only">{step.title}</span>
            </Tag>
          )
        })}
      </div>
    </div>
  )
}
