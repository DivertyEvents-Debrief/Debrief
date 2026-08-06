import * as React from 'react'
import { Link } from 'react-router-dom'
import { Copy, FileText, Pencil } from 'lucide-react'
import {
  duplicateVersion,
  fetchVersions,
  type VersionSummary,
} from '@/lib/form-builder-api'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, EmptyState } from '@/components/ui/card'
import { PageLoader } from '@/components/ui/page-loader'
import { cn, formatDate } from '@/lib/utils'

const STATUS_LABELS = {
  draft: 'Brouillon',
  published: 'En service',
  archived: 'Archivée',
} as const

const STATUS_STYLES = {
  draft: 'border-line-strong bg-canvas text-ink',
  published: 'border-brand-line bg-brand-soft text-brand-strong',
  archived: 'border-line bg-canvas text-ink-faint',
} as const

export default function FormVersionsPage() {
  const [versions, setVersions] = React.useState<VersionSummary[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const reload = React.useCallback(async () => {
    try {
      setVersions(await fetchVersions())
      setError(null)
    } catch (caught) {
      setError((caught as Error).message)
    }
  }, [])

  React.useEffect(() => {
    void reload()
  }, [reload])

  if (error && !versions) return <EmptyState title="Formulaire indisponible" description={error} />
  if (!versions) return <PageLoader label="Chargement des versions…" />

  const published = versions.find((v) => v.status === 'published')
  const draft = versions.find((v) => v.status === 'draft')

  const startDraft = async () => {
    if (!published) return
    setBusy(true)
    try {
      await duplicateVersion(published.id, `Copie de la version ${published.version_number}`)
      await reload()
    } catch (caught) {
      setError((caught as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Formulaire</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Les questions posées aux référents, et l'historique de leurs versions.
        </p>
      </header>

      {error && (
        <p role="alert" className="rounded-[9px] bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <Card>
        <CardHeader
          title="Modifier le formulaire"
          description="On ne touche jamais à la version en service : on en fait une copie, on la retravaille, puis on la publie."
        />

        {draft ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-ink-muted">
              Un brouillon est déjà ouvert — version {draft.version_number}.
            </p>
            <Link
              to={`/espace/formulaire/${draft.id}`}
              className="inline-flex items-center gap-1.5 rounded-[var(--radius-control)] bg-brand px-4 py-2 text-sm text-white hover:bg-brand-strong"
            >
              <Pencil className="size-4" aria-hidden />
              Reprendre le brouillon
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <Button onClick={() => void startDraft()} loading={busy} disabled={!published}>
              <Copy className="size-4" aria-hidden />
              Créer un brouillon à partir de la version en service
            </Button>
            <p className="text-xs text-ink-faint">
              Les débriefings déjà reçus gardent leur mise en forme d'origine : chaque réponse
              conserve une copie de la question telle qu'elle était le jour de l'envoi.
            </p>
          </div>
        )}
      </Card>

      <div className="space-y-3">
        {versions.map((version) => (
          <Card key={version.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 font-medium">
                  <FileText className="size-4 text-ink-faint" aria-hidden />
                  Version {version.version_number}
                  {version.label && (
                    <span className="font-normal text-ink-muted">— {version.label}</span>
                  )}
                </p>
                <p className="mt-1 text-xs text-ink-faint">
                  {version.module_count} module{version.module_count > 1 ? 's' : ''} ·{' '}
                  {version.debrief_count} débriefing{version.debrief_count > 1 ? 's' : ''} reçu
                  {version.debrief_count > 1 ? 's' : ''}
                  {version.published_at && ` · publiée le ${formatDate(version.published_at)}`}
                  {version.author && ` · ${version.author}`}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'rounded-full border px-2.5 py-0.5 text-xs font-medium',
                    STATUS_STYLES[version.status],
                  )}
                >
                  {STATUS_LABELS[version.status]}
                </span>

                <Link
                  to={`/espace/formulaire/${version.id}`}
                  className="rounded-[var(--radius-control)] border border-line-strong px-3 py-1.5 text-sm hover:border-brand-line hover:text-brand-strong"
                >
                  {version.status === 'draft' ? 'Modifier' : 'Consulter'}
                </Link>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
