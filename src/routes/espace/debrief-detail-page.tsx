import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, PhoneCall, Trash2, User } from 'lucide-react'
import {
  addInternalNote,
  changeStatus,
  deleteDebrief,
  deleteInternalNote,
  deleteNoteAllowed,
  fetchDebriefDetail,
  fetchFilterOptions,
  markRead,
  setCallbackHandled,
  type DebriefDetail,
  type FilterOptions,
} from '@/lib/workspace-api'
import { useSession } from '@/lib/session'
import { AttachmentGallery } from '@/components/workspace/attachment-gallery'
import { ResponseList } from '@/components/workspace/response-list'
import { StatusPill } from '@/components/workspace/status-pill'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, EmptyState } from '@/components/ui/card'
import { TextArea, TextInput, inputClasses } from '@/components/ui/field'
import { ReferenceStamp } from '@/components/ui/stamp'
import { PageLoader } from '@/components/ui/page-loader'
import { formatDate, formatDateTime } from '@/lib/utils'
import { ratingText } from '@/lib/ratings'

export default function DebriefDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const { profile } = useSession()

  const [detail, setDetail] = React.useState<DebriefDetail | null>(null)
  const [options, setOptions] = React.useState<FilterOptions | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [busy, setBusy] = React.useState(false)

  const reload = React.useCallback(async () => {
    try {
      setDetail(await fetchDebriefDetail(id))
      setError(null)
    } catch (caught) {
      setError((caught as Error).message)
    }
  }, [id])

  React.useEffect(() => {
    void reload()
    fetchFilterOptions().then(setOptions).catch(() => setOptions(null))
  }, [reload])

  // Marquer comme lu à l'ouverture, une seule fois. Le journal enregistre
  // qui a ouvert le débriefing et quand.
  React.useEffect(() => {
    if (detail && detail.debrief.read_at === null) {
      void markRead(id).then(reload)
    }
  }, [detail, id, reload])

  if (error) {
    return (
      <EmptyState
        title="Débriefing inaccessible"
        description={error}
        action={
          <Button variant="secondary" onClick={() => navigate('/espace/debriefings')}>
            Retour à la liste
          </Button>
        }
      />
    )
  }

  if (!detail) return <PageLoader label="Ouverture du débriefing…" />

  const d = detail.debrief
  const callbackOpen = d.callback_requested && !d.callback_handled_at

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    try {
      await action()
      await reload()
    } catch (caught) {
      setError((caught as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <Link
        to={`/espace/debriefings${window.location.search}`}
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-brand-strong"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Retour à la liste
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">{d.client_or_service_name}</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-muted">
            <span className="inline-flex items-center gap-1.5">
              <User className="size-3.5" aria-hidden />
              {d.referent.display_name}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-3.5" aria-hidden />
              {formatDate(d.event_date)}
            </span>
            <span>Commercial : {d.commercial.display_name}</span>
          </div>
          <p className="text-xs text-ink-faint">
            Reçu le {formatDateTime(d.submitted_at)} · formulaire version {d.form_version_number}
          </p>
        </div>

        <ReferenceStamp reference={d.public_reference} />
      </header>

      {callbackOpen && (
        <Card className="border-warm-line bg-attention-soft">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex gap-3">
              <PhoneCall className="mt-0.5 size-5 text-attention" aria-hidden />
              <div>
                <p className="font-medium">Le référent souhaite être rappelé</p>
                {d.callback_details && (
                  <p className="mt-1 text-sm text-ink-muted">À quel sujet : {d.callback_details}</p>
                )}
              </div>
            </div>
            <Button disabled={busy} onClick={() => run(() => setCallbackHandled(d.id, true))}>
              <CheckCircle2 className="size-4" aria-hidden />
              Marquer le rappel comme fait
            </Button>
          </div>
        </Card>
      )}

      {d.callback_requested && d.callback_handled_at && (
        <p className="rounded-[9px] bg-brand-soft px-3 py-2 text-sm text-brand-strong">
          Rappel traité le {formatDateTime(d.callback_handled_at)}
          {d.callback_handled_by ? ` par ${d.callback_handled_by}` : ''}.{' '}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => run(() => setCallbackHandled(d.id, false))}
          >
            Rouvrir
          </button>
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6 lg:order-1">
          <Card>
            <CardHeader title="Les réponses" description={`Version ${d.form_version_number} du formulaire, telle qu'elle était au moment de l'envoi.`} />
            <ResponseList responses={detail.responses} />
          </Card>

          {detail.materials.length > 0 && (
            <Card>
              <CardHeader
                title="Retours matériel"
                description={`${detail.materials.length} élément${detail.materials.length > 1 ? 's' : ''} signalé${detail.materials.length > 1 ? 's' : ''}.`}
              />
              <ul className="divide-y divide-line">
                {detail.materials.map((item) => (
                  <li key={item.id} className="py-3 first:pt-0 last:pb-0">
                    <p className="font-medium">{item.material_name}</p>
                    {item.category && <p className="text-xs text-ink-faint">{item.category}</p>}
                    {item.feedback && <p className="mt-1 text-sm text-ink-muted">{item.feedback}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {detail.attachments.length > 0 && (
            <Card>
              <CardHeader
                title="Photos"
                description="Liens temporaires : le stockage est privé, aucune image n'a d'adresse permanente."
              />
              <AttachmentGallery attachments={detail.attachments} />
            </Card>
          )}
        </div>

        <aside className="space-y-6 lg:order-2">
          <Card>
            <CardHeader title="Suivi" />
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-sm text-ink-muted">Statut actuel</p>
                <StatusPill status={d.status} />
              </div>

              {options && (
                <label className="block space-y-1.5 text-sm">
                  <span className="font-medium">Changer le statut</span>
                  <select
                    value={d.status.code}
                    disabled={busy}
                    onChange={(event) => run(() => changeStatus(d.id, event.target.value))}
                    className={inputClasses}
                  >
                    {options.statuses.map((status) => (
                      <option key={status.code} value={status.code}>
                        {status.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <dl className="space-y-2 border-t border-line pt-4 text-sm">
                <Row label="Note globale" value={ratingLine(d.overall_rating)} />
                <Row label="Satisfaction interne" value={ratingLine(d.internal_satisfaction_rating)} />
                <Row label="Première lecture" value={d.read_at ? formatDateTime(d.read_at) : 'jamais ouvert'} />
              </dl>
            </div>
          </Card>

          <NotesPanel
            detail={detail}
            authorId={profile?.id ?? ''}
            canDeleteAny={profile?.role === 'admin'}
            onChanged={reload}
          />

          {profile?.role === 'admin' && (
            <DeletePanel
              reference={d.public_reference}
              onDelete={async () => {
                await deleteDebrief(d.id)
                navigate('/espace/debriefings', { replace: true })
              }}
            />
          )}

          <Card>
            <CardHeader title="Journal" description="Qui a fait quoi, et quand." />
            {detail.activity.length === 0 ? (
              <p className="text-sm text-ink-faint">Aucune action enregistrée.</p>
            ) : (
              <ol className="space-y-3 text-sm">
                {detail.activity.map((entry) => (
                  <li key={entry.id} className="border-l-2 border-line pl-3">
                    <p>{describeAction(entry.action, entry.new_value)}</p>
                    <p className="text-xs text-ink-faint">
                      {entry.user} · {formatDateTime(entry.created_at)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </aside>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right">{value}</dd>
    </div>
  )
}

function ratingLine(value: number | null): string {
  if (value === null) return 'non renseignée'
  return `${value} sur 5 · ${ratingText(value)}`
}

/** Le journal parle français, pas en codes techniques. */
function describeAction(action: string, newValue: unknown): string {
  const status = (newValue as { status?: string } | null)?.status
  switch (action) {
    case 'submitted':
      return 'Débriefing envoyé par le référent'
    case 'read':
      return 'Débriefing ouvert pour la première fois'
    case 'status_changed':
      return status ? `Statut passé à « ${status} »` : 'Statut modifié'
    case 'debrief_deleted':
      return 'Débriefing supprimé définitivement'
    case 'callback_updated':
      return (newValue as { handled?: boolean } | null)?.handled
        ? 'Rappel marqué comme traité'
        : 'Rappel rouvert'
    default:
      return action
  }
}

function NotesPanel({
  detail,
  authorId,
  canDeleteAny,
  onChanged,
}: {
  detail: DebriefDetail
  authorId: string
  canDeleteAny: boolean
  onChanged: () => Promise<void>
}) {
  const [content, setContent] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!content.trim()) return

    setPending(true)
    setError(null)
    try {
      await addInternalNote(detail.debrief.id, content.trim(), authorId)
      setContent('')
      await onChanged()
    } catch (caught) {
      setError((caught as Error).message)
    } finally {
      setPending(false)
    }
  }

  return (
    <Card>
      <CardHeader
        title="Notes internes"
        description="Visibles par l'équipe uniquement. Le référent n'y a jamais accès."
      />

      <form onSubmit={submit} className="space-y-2">
        <label htmlFor="nouvelle-note" className="sr-only">
          Nouvelle note interne
        </label>
        <TextArea
          id="nouvelle-note"
          rows={3}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder="Contexte, suite donnée, point à surveiller…"
        />
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" size="sm" loading={pending} disabled={!content.trim()}>
          Ajouter la note
        </Button>
      </form>

      {detail.notes.length > 0 && (
        <ul className="mt-4 space-y-3 border-t border-line pt-4">
          {detail.notes.map((note) => (
            <li key={note.id} className="text-sm">
              <div className="flex items-start justify-between gap-2">
                <p className="whitespace-pre-wrap">{note.content}</p>
                {deleteNoteAllowed(note.author_id, authorId, canDeleteAny) && (
                  <button
                    type="button"
                    aria-label="Supprimer cette note"
                    className="touch-target shrink-0 text-ink-faint hover:text-danger"
                    onClick={async () => {
                      await deleteInternalNote(note.id)
                      await onChanged()
                    }}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                )}
              </div>
              <p className="mt-1 text-xs text-ink-faint">
                {note.author} · {formatDateTime(note.created_at)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/**
 * Suppression définitive.
 *
 * La confirmation demande de retaper la référence plutôt qu'un simple
 * « êtes-vous sûr ? ». L'opération efface les réponses, les photos et les
 * notes sans retour possible : elle mérite un geste délibéré, pas un clic
 * réflexe sur une boîte de dialogue.
 */
function DeletePanel({
  reference,
  onDelete,
}: {
  reference: string
  onDelete: () => Promise<void>
}) {
  const [open, setOpen] = React.useState(false)
  const [typed, setTyped] = React.useState('')
  const [pending, setPending] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const matches = typed.trim().toUpperCase() === reference.toUpperCase()

  return (
    <Card className="border-danger/30">
      <CardHeader
        title="Supprimer ce débriefing"
        description="Réponses, photos, notes internes et retours matériel sont effacés définitivement."
      />

      {!open ? (
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <Trash2 className="size-4" aria-hidden />
          Supprimer…
        </Button>
      ) : (
        <div className="space-y-3">
          <p className="flex items-start gap-2 text-sm text-ink-muted">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
            Cette action est irréversible. Seule une trace au journal conservera la référence et
            votre nom.
          </p>

          <label className="block space-y-1.5 text-sm">
            <span className="font-medium">
              Retapez <span className="font-mono">{reference}</span> pour confirmer
            </span>
            <TextInput
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </label>

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setOpen(false)
                setTyped('')
                setError(null)
              }}
            >
              Annuler
            </Button>
            <Button
              size="sm"
              disabled={!matches}
              loading={pending}
              onClick={async () => {
                setPending(true)
                try {
                  await onDelete()
                } catch (caught) {
                  setError((caught as Error).message)
                  setPending(false)
                }
              }}
            >
              <Trash2 className="size-4" aria-hidden />
              Supprimer définitivement
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
