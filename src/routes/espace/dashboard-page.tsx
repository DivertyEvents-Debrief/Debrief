import * as React from 'react'
import { AlertTriangle, Inbox, PhoneCall, Star } from 'lucide-react'
import { getSupabase } from '@/lib/supabase/client'
import { useSession } from '@/lib/session'
import { Card, EmptyState } from '@/components/ui/card'
import { PageLoader } from '@/components/ui/page-loader'
import { formatRating } from '@/lib/utils'

interface Summary {
  period_days: number
  debrief_count: number
  unread_count: number
  callback_pending: number
  overall_average: number | null
  needs_action: number
  distribution: { rating: number; count: number }[]
}

export default function DashboardPage() {
  const { profile } = useSession()
  const [summary, setSummary] = React.useState<Summary | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let active = true

    getSupabase()
      .rpc('dashboard_summary', { p_days: 30 })
      .then(({ data, error: rpcError }) => {
        if (!active) return
        if (rpcError) setError("Les indicateurs n'ont pas pu être chargés.")
        else setSummary(data as Summary)
      })

    return () => {
      active = false
    }
  }, [])

  if (error) return <EmptyState title="Indicateurs indisponibles" description={error} />
  if (!summary) return <PageLoader label="Calcul des indicateurs…" />

  const scope =
    profile?.role === 'commercial'
      ? 'Vos débriefings des 30 derniers jours'
      : 'Tous les débriefings des 30 derniers jours'

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">
          Bonjour {profile?.first_name}
        </h1>
        <p className="mt-1 text-ink-muted">{scope}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Kpi
          icon={<Inbox className="size-4" aria-hidden />}
          label="Débriefings reçus"
          value={String(summary.debrief_count)}
          hint={summary.unread_count > 0 ? `dont ${summary.unread_count} non lus` : 'tous consultés'}
        />
        <Kpi
          icon={<Star className="size-4" aria-hidden />}
          label="Note globale moyenne"
          value={summary.overall_average === null ? '—' : formatRating(summary.overall_average)}
          hint="sur 5"
        />
        <Kpi
          icon={<PhoneCall className="size-4" aria-hidden />}
          label="Rappels en attente"
          value={String(summary.callback_pending)}
          hint={summary.callback_pending > 0 ? 'à traiter' : 'rien en attente'}
          tone={summary.callback_pending > 0 ? 'attention' : 'neutral'}
        />
        <Kpi
          icon={<AlertTriangle className="size-4" aria-hidden />}
          label="À regarder"
          value={String(summary.needs_action)}
          hint="notes basses ou rappel demandé"
          tone={summary.needs_action > 0 ? 'attention' : 'neutral'}
        />
      </div>

      {summary.debrief_count === 0 && (
        <EmptyState
          title="Aucun débriefing sur la période"
          description="Dès qu'un référent envoie le formulaire, il apparaît ici et vous recevez une notification."
        />
      )}
    </div>
  )
}

function Kpi({
  icon,
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  icon: React.ReactNode
  label: string
  value: string
  hint: string
  tone?: 'neutral' | 'attention'
}) {
  return (
    <Card>
      <div className="flex items-center gap-2 text-sm text-ink-muted">
        <span className={tone === 'attention' ? 'text-warm' : 'text-brand'}>{icon}</span>
        {label}
      </div>
      <p className="mt-2 font-mono text-3xl font-semibold tabular-nums">{value}</p>
      <p className="mt-1 text-xs text-ink-faint">{hint}</p>
    </Card>
  )
}
