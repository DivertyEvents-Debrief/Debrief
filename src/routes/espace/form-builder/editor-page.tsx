import * as React from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronDown, ChevronUp, Eye, Plus, Rocket, Trash2 } from 'lucide-react'
import {
  checkVersion,
  fetchVersion,
  FUNCTIONAL_ROLES,
  MODULE_TYPES,
  publishVersion,
  removeModule,
  reorderModules,
  saveModule,
  suggestKey,
  type FunctionalRole,
  type ModuleType,
  type VersionDetail,
} from '@/lib/form-builder-api'
import type { FormModule } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, EmptyState } from '@/components/ui/card'
import { Field, TextArea, TextInput, inputClasses } from '@/components/ui/field'
import { PageLoader } from '@/components/ui/page-loader'
import { cn } from '@/lib/utils'

export default function FormEditorPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()

  const [detail, setDetail] = React.useState<VersionDetail | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [notice, setNotice] = React.useState<string | null>(null)
  const [editing, setEditing] = React.useState<string | null>(null)
  const [check, setCheck] = React.useState<{ ready: boolean; problems: string[] } | null>(null)
  const [busy, setBusy] = React.useState(false)

  const reload = React.useCallback(async () => {
    try {
      const next = await fetchVersion(id)
      setDetail(next)
      setCheck(await checkVersion(id))
      setError(null)
    } catch (caught) {
      setError((caught as Error).message)
    }
  }, [id])

  React.useEffect(() => {
    void reload()
  }, [reload])

  if (error && !detail) return <EmptyState title="Version indisponible" description={error} />
  if (!detail) return <PageLoader label="Ouverture du formulaire…" />

  const isDraft = detail.version.status === 'draft'
  const used = new Set(detail.used_module_ids)
  const keys = detail.modules.map((m) => m.technical_key)

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    try {
      await action()
      await reload()
      setError(null)
    } catch (caught) {
      setError((caught as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** Déplacement par boutons : fiable au doigt et accessible au clavier. */
  const move = (index: number, direction: -1 | 1) => {
    const ordered = [...detail.modules]
    const target = index + direction
    if (target < 0 || target >= ordered.length) return

    const [moved] = ordered.splice(index, 1)
    ordered.splice(target, 0, moved!)

    // Affichage optimiste : l'ordre bouge tout de suite, l'enregistrement suit.
    setDetail({ ...detail, modules: ordered })
    void run(() => reorderModules(id, ordered.map((m) => m.id)))
  }

  return (
    <div className="space-y-6">
      <Link
        to="/espace/formulaire"
        className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-brand-strong"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Toutes les versions
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            Version {detail.version.version_number}
            {detail.version.label && (
              <span className="font-normal text-ink-muted"> — {detail.version.label}</span>
            )}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {detail.modules.length} module{detail.modules.length > 1 ? 's' : ''} ·{' '}
            {detail.version.debrief_count} débriefing{detail.version.debrief_count > 1 ? 's' : ''} reçu
            {detail.version.debrief_count > 1 ? 's' : ''}
          </p>
        </div>

        {isDraft && check && (
          <Button
            disabled={!check.ready || busy}
            onClick={() =>
              run(async () => {
                await publishVersion(id)
                navigate('/espace/formulaire')
              })
            }
          >
            <Rocket className="size-4" aria-hidden />
            Publier cette version
          </Button>
        )}
      </header>

      {!isDraft && (
        <p className="rounded-[var(--radius-control)] border border-brand-line bg-brand-softer px-3 py-2.5 text-sm text-brand-strong">
          Cette version est en lecture seule. Pour la modifier, créez un brouillon depuis la liste
          des versions — ainsi les débriefings déjà reçus gardent leur sens.
        </p>
      )}

      {error && (
        <p role="alert" className="rounded-[9px] bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-[9px] bg-brand-soft px-3 py-2 text-sm text-brand-strong">{notice}</p>
      )}

      {isDraft && check && !check.ready && (
        <Card className="border-warm-line bg-attention-soft">
          <CardHeader
            title="À corriger avant publication"
            description="Ces éléments alimentent des colonnes dédiées : sans eux, les envois échoueraient."
          />
          <ul className="list-inside list-disc space-y-1 text-sm">
            {check.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </Card>
      )}

      <div className="space-y-3">
        {detail.modules.map((module, index) => (
          <ModuleRow
            key={module.id}
            module={module}
            index={index}
            total={detail.modules.length}
            sections={detail.sections}
            editable={isDraft}
            alreadyUsed={used.has(module.id)}
            expanded={editing === module.id}
            existingKeys={keys.filter((k) => k !== module.technical_key)}
            onToggle={() => setEditing(editing === module.id ? null : module.id)}
            onMove={(direction) => move(index, direction)}
            onSave={(patch) =>
              run(async () => {
                await saveModule(id, { ...module, ...patch, id: module.id })
                setEditing(null)
              })
            }
            onRemove={() =>
              run(async () => {
                const outcome = await removeModule(module.id)
                setNotice(
                  outcome === 'archived'
                    ? 'Ce module a déjà servi : il a été archivé plutôt que supprimé, pour que les anciens débriefings restent lisibles.'
                    : 'Module supprimé.',
                )
              })
            }
          />
        ))}
      </div>

      {isDraft && (
        <Card>
          <CardHeader title="Ajouter un module" />
          <NewModuleForm
            sections={detail.sections}
            existingKeys={keys}
            onCreate={(module) =>
              run(() =>
                saveModule(id, {
                  ...module,
                  sort_order: (detail.modules.length + 1) * 10,
                }).then(() => undefined),
              )
            }
          />
        </Card>
      )}

      <Card>
        <CardHeader
          title="Aperçu"
          description="Le formulaire tel que le verra un référent, avec cette version."
        />
        <div className="flex items-center gap-2">
          <Eye className="size-4 text-ink-faint" aria-hidden />
          <p className="text-sm text-ink-muted">
            {isDraft
              ? "L'aperçu fidèle sera disponible une fois la version publiée. En attendant, la liste ci-dessus reflète l'ordre et les libellés exacts."
              : 'Cette version est celle actuellement servie aux référents.'}
          </p>
        </div>
      </Card>
    </div>
  )
}

function ModuleRow({
  module,
  index,
  total,
  sections,
  editable,
  alreadyUsed,
  expanded,
  existingKeys,
  onToggle,
  onMove,
  onSave,
  onRemove,
}: {
  module: FormModule
  index: number
  total: number
  sections: VersionDetail['sections']
  editable: boolean
  alreadyUsed: boolean
  expanded: boolean
  existingKeys: string[]
  onToggle: () => void
  onMove: (direction: -1 | 1) => void
  onSave: (patch: Record<string, unknown>) => void
  onRemove: () => void
}) {
  const [draft, setDraft] = React.useState({
    title: module.title,
    help_text: module.help_text ?? '',
    placeholder: module.placeholder ?? '',
    required: module.required,
    active: module.active,
    section_key: module.section_key,
    module_type: module.module_type as ModuleType,
    functional_role: (module.functional_role ?? 'none') as FunctionalRole,
    include_in_statistics: module.include_in_statistics,
    technical_key: module.technical_key,
  })

  const typeLabel = MODULE_TYPES.find((t) => t.value === module.module_type)?.label ?? module.module_type
  const roleLabel = FUNCTIONAL_ROLES.find((r) => r.value === module.functional_role)?.label

  return (
    <Card className={cn(!module.active && 'opacity-60', module.archived_at && 'border-dashed')}>
      <div className="flex items-start gap-3">
        {editable && (
          <div className="flex shrink-0 flex-col gap-0.5">
            <button
              type="button"
              aria-label={`Monter ${module.title || module.technical_key}`}
              disabled={index === 0}
              onClick={() => onMove(-1)}
              className="touch-target rounded-[6px] border border-line-strong p-1 text-ink-muted disabled:opacity-30"
            >
              <ChevronUp className="size-3.5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label={`Descendre ${module.title || module.technical_key}`}
              disabled={index === total - 1}
              onClick={() => onMove(1)}
              className="touch-target rounded-[6px] border border-line-strong p-1 text-ink-muted disabled:opacity-30"
            >
              <ChevronDown className="size-3.5" aria-hidden />
            </button>
          </div>
        )}

        <div className="min-w-0 flex-1">
          <p className="font-medium">{module.title || <em className="text-ink-faint">sans titre</em>}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-faint">
            <span className="font-mono">{module.technical_key}</span>
            <span>· {typeLabel}</span>
            {module.required && <span>· obligatoire</span>}
            {roleLabel && module.functional_role !== 'none' && <span>· {roleLabel}</span>}
            {module.archived_at && <span>· archivé</span>}
            {alreadyUsed && <span>· déjà utilisé</span>}
          </p>
        </div>

        {editable && (
          <div className="flex shrink-0 gap-1">
            <Button variant="secondary" size="sm" onClick={onToggle}>
              {expanded ? 'Fermer' : 'Modifier'}
            </Button>
            <button
              type="button"
              aria-label={`Retirer ${module.title || module.technical_key}`}
              onClick={onRemove}
              className="touch-target text-ink-faint hover:text-danger"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </div>
        )}
      </div>

      {expanded && editable && (
        <div className="mt-4 grid gap-3 border-t border-line pt-4 sm:grid-cols-2">
          <Field label="Question posée" id={`t-${module.id}`}>
            <TextInput
              id={`t-${module.id}`}
              value={draft.title}
              onChange={(event) => setDraft({ ...draft, title: event.target.value })}
            />
          </Field>

          <Field label="Type de réponse" id={`ty-${module.id}`}>
            <select
              id={`ty-${module.id}`}
              value={draft.module_type}
              onChange={(event) => setDraft({ ...draft, module_type: event.target.value as ModuleType })}
              className={inputClasses}
            >
              {MODULE_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.group} — {type.label}
                </option>
              ))}
            </select>
          </Field>

          <div className="sm:col-span-2">
            <Field label="Texte d'aide" id={`h-${module.id}`} help="affiché sous la question">
              <TextArea
                id={`h-${module.id}`}
                rows={2}
                value={draft.help_text}
                onChange={(event) => setDraft({ ...draft, help_text: event.target.value })}
              />
            </Field>
          </div>

          <Field label="Section" id={`s-${module.id}`}>
            <select
              id={`s-${module.id}`}
              value={draft.section_key}
              onChange={(event) => setDraft({ ...draft, section_key: event.target.value })}
              className={inputClasses}
            >
              {sections.map((section) => (
                <option key={section.id} value={section.section_key}>
                  {section.title}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Rôle fonctionnel"
            id={`r-${module.id}`}
            help="alimente une colonne dédiée"
          >
            <select
              id={`r-${module.id}`}
              value={draft.functional_role}
              onChange={(event) =>
                setDraft({ ...draft, functional_role: event.target.value as FunctionalRole })
              }
              className={inputClasses}
            >
              {FUNCTIONAL_ROLES.map((role) => (
                <option key={role.value} value={role.value}>
                  {role.label}
                </option>
              ))}
            </select>
          </Field>

          <Field
            label="Clé technique"
            id={`k-${module.id}`}
            help={alreadyUsed ? 'déjà utilisée : ne la changez pas' : 'identifie la réponse dans les exports'}
          >
            <TextInput
              id={`k-${module.id}`}
              value={draft.technical_key}
              disabled={alreadyUsed}
              onChange={(event) =>
                setDraft({ ...draft, technical_key: event.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase() })
              }
            />
          </Field>

          <div className="flex flex-wrap items-center gap-4 text-sm sm:col-span-2">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.required}
                onChange={(event) => setDraft({ ...draft, required: event.target.checked })}
                className="size-4 rounded border-line-strong accent-[var(--brand)]"
              />
              Réponse obligatoire
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.active}
                onChange={(event) => setDraft({ ...draft, active: event.target.checked })}
                className="size-4 rounded border-line-strong accent-[var(--brand)]"
              />
              Affiché dans le formulaire
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.include_in_statistics}
                onChange={(event) =>
                  setDraft({ ...draft, include_in_statistics: event.target.checked })
                }
                className="size-4 rounded border-line-strong accent-[var(--brand)]"
              />
              Suivi dans les statistiques
            </label>
          </div>

          <div className="sm:col-span-2">
            <Button
              size="sm"
              disabled={
                draft.technical_key !== module.technical_key &&
                existingKeys.includes(draft.technical_key)
              }
              onClick={() => onSave(draft)}
            >
              Enregistrer ce module
            </Button>
            {draft.technical_key !== module.technical_key &&
              existingKeys.includes(draft.technical_key) && (
                <p className="mt-2 text-sm text-danger">Cette clé technique est déjà prise.</p>
              )}
          </div>
        </div>
      )}
    </Card>
  )
}

function NewModuleForm({
  sections,
  existingKeys,
  onCreate,
}: {
  sections: VersionDetail['sections']
  existingKeys: string[]
  onCreate: (module: Record<string, unknown>) => void
}) {
  const [title, setTitle] = React.useState('')
  const [type, setType] = React.useState<ModuleType>('short_text')
  const [sectionKey, setSectionKey] = React.useState(sections[0]?.section_key ?? 'general')
  const [required, setRequired] = React.useState(false)

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end">
      <div className="lg:col-span-2">
        <Field label="Question posée" id="new-title" required>
          <TextInput
            id="new-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Ex. Comment s'est passé l'accueil ?"
          />
        </Field>
      </div>

      <Field label="Type de réponse" id="new-type">
        <select
          id="new-type"
          value={type}
          onChange={(event) => setType(event.target.value as ModuleType)}
          className={inputClasses}
        >
          {MODULE_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.group} — {option.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Section" id="new-section">
        <select
          id="new-section"
          value={sectionKey}
          onChange={(event) => setSectionKey(event.target.value)}
          className={inputClasses}
        >
          {sections.map((section) => (
            <option key={section.id} value={section.section_key}>
              {section.title}
            </option>
          ))}
        </select>
      </Field>

      <label className="inline-flex items-center gap-2 text-sm lg:col-span-2">
        <input
          type="checkbox"
          checked={required}
          onChange={(event) => setRequired(event.target.checked)}
          className="size-4 rounded border-line-strong accent-[var(--brand)]"
        />
        Réponse obligatoire
      </label>

      <div className="lg:col-span-2">
        <Button
          disabled={!title.trim()}
          onClick={() => {
            onCreate({
              title: title.trim(),
              module_type: type,
              section_key: sectionKey,
              required,
              active: true,
              functional_role: 'none',
              technical_key: suggestKey(title, existingKeys),
              configuration: {},
            })
            setTitle('')
            setRequired(false)
          }}
        >
          <Plus className="size-4" aria-hidden />
          Ajouter
        </Button>
      </div>
    </div>
  )
}
