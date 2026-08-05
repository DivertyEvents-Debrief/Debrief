
import * as React from 'react'
import { ArrowLeft, ArrowRight, Send, TriangleAlert } from 'lucide-react'
import type { FormModule, PublicFormDefinition } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Field, TextArea, TextInput } from '@/components/ui/field'
import { RatingScale } from '@/components/form/rating-scale'
import { SearchableSelect } from '@/components/form/searchable-select'
import { YesNoChoice } from '@/components/form/yes-no'
import { StepProgress } from '@/components/form/step-progress'
import {
  MaterialFeedbackList,
  createMaterialRow,
  type MaterialRow,
} from '@/components/form/material-feedback'
import { ImageUploader, type UploadedImage } from '@/components/form/image-uploader'
import { DebriefSummary } from '@/components/public/debrief-summary'
import { SubmissionSuccess } from '@/components/public/submission-success'
import { startSubmission, submitDebriefAction } from '@/lib/public-api'
import {
  isModuleVisible,
  validateModules,
  type AnswerMap,
} from '@/lib/form-validation'
import { DEFAULT_RATING_SCALE, type RatingOption } from '@/lib/ratings'

const SUMMARY_STEP = '__summary__'

type LocalDraft = {
  versionId: string
  draftId: string | null
  answers: AnswerMap
  materialRows: MaterialRow[]
  stepIndex: number
}

export function DebriefForm({ definition }: { definition: PublicFormDefinition }) {
  const storageKey = `debrief-draft-v${definition.versionNumber}`

  const [answers, setAnswers] = React.useState<AnswerMap>(() => initialAnswers(definition.modules))
  const [materialRows, setMaterialRows] = React.useState<MaterialRow[]>([])
  const [images, setImages] = React.useState<UploadedImage[]>([])
  const [stepIndex, setStepIndex] = React.useState(0)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [draftId, setDraftId] = React.useState<string | null>(null)
  const [submitting, setSubmitting] = React.useState(false)
  const [submissionError, setSubmissionError] = React.useState<string | null>(null)
  const [result, setResult] = React.useState<{ reference: string; submittedAt: string } | null>(null)
  const [restored, setRestored] = React.useState(false)
  const headingRef = React.useRef<HTMLHeadingElement>(null)

  const steps = React.useMemo(() => {
    const withModules = definition.sections
      .map((section) => ({
        key: section.section_key,
        title: section.title,
        description: section.description,
        modules: definition.modules
          .filter((module) => module.section_key === section.section_key)
          .sort((a, b) => a.sort_order - b.sort_order),
      }))
      .filter((section) => section.modules.length > 0)

    return [
      ...withModules,
      {
        key: SUMMARY_STEP,
        title: 'Vérification',
        description: 'Relisez vos réponses. Vous pouvez encore tout modifier.',
        modules: [] as FormModule[],
      },
    ]
  }, [definition])

  const step = steps[stepIndex]
  const isSummary = step?.key === SUMMARY_STEP

  // --- Reprise après un rafraîchissement accidentel -------------------
  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey)
      if (stored) {
        const draft = JSON.parse(stored) as LocalDraft
        if (draft.versionId === definition.versionId) {
          setAnswers((current) => ({ ...current, ...draft.answers }))
          setMaterialRows(draft.materialRows ?? [])
          setDraftId(draft.draftId)
          setStepIndex(Math.min(draft.stepIndex ?? 0, steps.length - 1))
          setRestored(true)
        }
      }
    } catch {
      // Un brouillon illisible n'empêche pas de démarrer.
    }

    void ensureDraft()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  React.useEffect(() => {
    if (result) return
    const draft: LocalDraft = {
      versionId: definition.versionId,
      draftId,
      answers,
      materialRows,
      stepIndex,
    }
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(draft))
    } catch {
      // Stockage indisponible (navigation privée) : la saisie continue.
    }
  }, [answers, materialRows, stepIndex, draftId, definition.versionId, storageKey, result])

  React.useEffect(() => {
    headingRef.current?.focus()
  }, [stepIndex])

  async function ensureDraft() {
    if (draftId) return draftId
    const response = await startSubmission()
    if (!response.ok) {
      setSubmissionError(response.error)
      return null
    }
    setDraftId(response.data.draftId)
    return response.data.draftId
  }

  function setAnswer(key: string, value: unknown) {
    setAnswers((current) => ({ ...current, [key]: value }))
    setErrors((current) => {
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      return next
    })
  }

  function validateCurrentStep(): boolean {
    if (!step || isSummary) return true
    const stepErrors = validateModules(step.modules, answers, {
      materialRowCount: materialRows.filter((row) => row.material_name.trim() !== '').length,
      imageCount: images.length,
    })
    setErrors(stepErrors)
    if (Object.keys(stepErrors).length > 0) {
      const firstKey = Object.keys(stepErrors)[0]
      document.getElementById(firstKey ?? '')?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      return false
    }
    return true
  }

  function goNext() {
    if (!validateCurrentStep()) return
    setStepIndex((index) => Math.min(index + 1, steps.length - 1))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function goPrevious() {
    setStepIndex((index) => Math.max(index - 1, 0))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function submit() {
    if (submitting) return // protection contre le double clic
    setSubmissionError(null)

    const allErrors = validateModules(definition.modules, answers, {
      materialRowCount: materialRows.filter((row) => row.material_name.trim() !== '').length,
      imageCount: images.length,
    })
    if (Object.keys(allErrors).length > 0) {
      setErrors(allErrors)
      const firstKey = Object.keys(allErrors)[0]
      const stepWithError = steps.findIndex((candidate) =>
        candidate.modules.some((module) => module.technical_key === firstKey),
      )
      if (stepWithError >= 0) setStepIndex(stepWithError)
      return
    }

    setSubmitting(true)
    try {
      const id = await ensureDraft()
      if (!id) return

      const response = await submitDebriefAction({
        draftId: id,
        payload: {
          answers: cleanAnswers(definition.modules, answers),
          material_feedback: materialRows
            .filter((row) => row.material_name.trim() !== '' || row.feedback.trim() !== '')
            .map((row) => ({ material_name: row.material_name, feedback: row.feedback })),
          attachments: images.map((image) => ({
            storage_path: image.storage_path,
            original_name: image.original_name,
            mime_type: image.mime_type,
            file_size: image.file_size,
            width: image.width,
            height: image.height,
          })),
        },
      })

      if (!response.ok) {
        setSubmissionError(response.error)
        return
      }

      window.localStorage.removeItem(storageKey)
      setResult({ reference: response.data.reference, submittedAt: response.data.submittedAt })
    } catch {
      setSubmissionError(
        "L'envoi n'a pas abouti. Vérifiez votre connexion : vos réponses sont conservées sur cet appareil.",
      )
    } finally {
      setSubmitting(false)
    }
  }

  if (result) {
    return (
      <SubmissionSuccess
        reference={result.reference}
        submittedAt={result.submittedAt}
        message={definition.settings.confirmation_message}
        onRestart={() => window.location.reload()}
      />
    )
  }

  if (!step) return null

  return (
    <div className="space-y-6">
      <StepProgress
        steps={steps.map((s) => ({ key: s.key, title: s.title }))}
        currentIndex={stepIndex}
        onJump={setStepIndex}
      />

      {restored && stepIndex > 0 && (
        <p className="rounded-[var(--radius-control)] border border-brand-line bg-brand-softer px-3 py-2 text-sm text-brand-strong">
          Vos réponses précédentes ont été retrouvées sur cet appareil.
        </p>
      )}

      <div className="space-y-2">
        <h2 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold outline-none sm:text-[1.7rem]">
          {step.title}
        </h2>
        {step.description && <p className="text-ink-muted">{step.description}</p>}
      </div>

      {isSummary ? (
        <DebriefSummary
          definition={definition}
          answers={answers}
          materialRows={materialRows}
          images={images}
          onEditSection={(sectionKey) => {
            const index = steps.findIndex((candidate) => candidate.key === sectionKey)
            if (index >= 0) setStepIndex(index)
          }}
        />
      ) : (
        <div className="space-y-7">
          {step.modules
            .filter((module) => isModuleVisible(module, answers))
            .map((module) => (
              <ModuleField
                key={module.id}
                module={module}
                definition={definition}
                value={answers[module.technical_key]}
                error={errors[module.technical_key]}
                onChange={(value) => setAnswer(module.technical_key, value)}
                materialRows={materialRows}
                onMaterialChange={setMaterialRows}
                images={images}
                onImagesChange={setImages}
                draftId={draftId}
              />
            ))}
        </div>
      )}

      {submissionError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-[var(--radius-control)] border border-danger/30 bg-danger-soft px-3 py-2.5 text-sm text-danger"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {submissionError}
        </p>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-line pt-5 sm:flex-row sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          size="lg"
          onClick={goPrevious}
          disabled={stepIndex === 0}
          className="sm:w-auto"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Précédent
        </Button>

        {isSummary ? (
          <Button type="button" size="lg" onClick={() => void submit()} loading={submitting}>
            <Send className="size-4" aria-hidden />
            {submitting ? 'Envoi en cours…' : 'Envoyer le débriefing'}
          </Button>
        ) : (
          <Button type="button" size="lg" onClick={goNext}>
            Continuer
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        )}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------
   Rendu d'un module. Le type vient du paramétrage : ajouter un module
   dans l'administration suffit à le voir apparaître ici.
   --------------------------------------------------------------------- */
function ModuleField({
  module,
  definition,
  value,
  error,
  onChange,
  materialRows,
  onMaterialChange,
  images,
  onImagesChange,
  draftId,
}: {
  module: FormModule
  definition: PublicFormDefinition
  value: unknown
  error?: string
  onChange: (value: unknown) => void
  materialRows: MaterialRow[]
  onMaterialChange: (rows: MaterialRow[]) => void
  images: UploadedImage[]
  onImagesChange: (images: UploadedImage[]) => void
  draftId: string | null
}) {
  const id = module.technical_key
  const config = module.configuration ?? {}
  const labelId = `${id}-label`

  switch (module.module_type) {
    case 'section_title':
      return <h3 className="pt-2 text-lg font-semibold">{module.title}</h3>

    case 'explanation':
    case 'info_message':
      return (
        <p className="rounded-[var(--radius-control)] border border-brand-line bg-brand-softer px-3 py-2.5 text-sm text-brand-strong">
          {module.help_text ?? module.title}
        </p>
      )

    case 'divider':
      return <hr className="border-line" />

    case 'rating_5':
    case 'custom_rating': {
      const options = (config.options as RatingOption[] | undefined) ?? DEFAULT_RATING_SCALE
      return (
        <fieldset className="space-y-3">
          <legend id={labelId} className="text-[0.95rem] font-medium">
            {module.title}
            {module.required && (
              <span className="ml-1 text-brand" aria-hidden>
                *
              </span>
            )}
          </legend>
          {module.help_text && <p className="text-sm text-ink-muted">{module.help_text}</p>}
          <RatingScale
            name={id}
            value={typeof value === 'number' ? value : null}
            onChange={onChange}
            options={options}
            labelledBy={labelId}
            invalid={Boolean(error)}
          />
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </fieldset>
      )
    }

    case 'yes_no':
      return (
        <fieldset className="space-y-3">
          <legend id={labelId} className="text-[0.95rem] font-medium">
            {module.title}
            {module.required && (
              <span className="ml-1 text-brand" aria-hidden>
                *
              </span>
            )}
          </legend>
          {module.help_text && <p className="text-sm text-ink-muted">{module.help_text}</p>}
          <YesNoChoice
            name={id}
            value={typeof value === 'boolean' ? value : null}
            onChange={onChange}
            yesLabel={config.yes_label}
            noLabel={config.no_label}
            labelledBy={labelId}
          />
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </fieldset>
      )

    case 'select':
    case 'searchable_select':
    case 'single_choice': {
      const options =
        config.source === 'referents'
          ? definition.referents.map((r) => ({ value: r.id, label: r.display_name }))
          : config.source === 'commercials'
            ? definition.commercials.map((c) => ({ value: c.id, label: c.display_name }))
            : (config.options ?? []).map((o) => ({ value: String(o.value), label: o.label }))

      return (
        <Field id={id} label={module.title} help={module.help_text} error={error} required={module.required}>
          <SearchableSelect
            id={id}
            options={options}
            value={typeof value === 'string' ? value : null}
            onChange={onChange}
            placeholder={module.placeholder ?? 'Sélectionner'}
            emptyMessage={
              config.source === 'referents'
                ? 'Aucun référent actif. Contactez votre agence.'
                : config.source === 'commercials'
                  ? 'Aucun commercial actif. Contactez votre agence.'
                  : 'Aucun résultat.'
            }
          />
        </Field>
      )
    }

    case 'date':
      return (
        <Field id={id} label={module.title} help={module.help_text} error={error} required={module.required}>
          <TextInput
            type="date"
            value={typeof value === 'string' ? value : ''}
            onChange={(event) => onChange(event.target.value)}
          />
        </Field>
      )

    case 'long_text': {
      const text = typeof value === 'string' ? value : ''
      return (
        <Field
          id={id}
          label={module.title}
          help={module.help_text}
          error={error}
          required={module.required}
          counter={{ current: text.length, max: config.max_length }}
        >
          <TextArea
            rows={config.rows ?? 5}
            value={text}
            placeholder={module.placeholder ?? undefined}
            onChange={(event) => onChange(event.target.value)}
          />
        </Field>
      )
    }

    case 'material_feedback' as never:
    case 'repeatable_group':
      return (
        <fieldset className="space-y-3">
          <legend className="text-[0.95rem] font-medium">{module.title}</legend>
          {module.help_text && <p className="text-sm text-ink-muted">{module.help_text}</p>}
          <MaterialFeedbackList
            rows={materialRows}
            onChange={onMaterialChange}
            suggestions={definition.materialSuggestions}
            addLabel={config.add_label}
            maxItems={config.max_items ?? 30}
            error={error}
          />
        </fieldset>
      )

    case 'image_upload':
      return (
        <fieldset className="space-y-3">
          <legend className="text-[0.95rem] font-medium">{module.title}</legend>
          {module.help_text && <p className="text-sm text-ink-muted">{module.help_text}</p>}
          <ImageUploader
            draftId={draftId}
            images={images}
            onChange={onImagesChange}
            maxFiles={config.max_files ?? definition.settings.max_files}
            maxFileSizeMb={config.max_file_size_mb ?? definition.settings.max_file_size_mb}
            maxTotalSizeMb={definition.settings.max_total_size_mb}
            acceptedFormats={config.accepted_formats ?? definition.settings.accepted_formats}
          />
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </fieldset>
      )

    case 'multiple_choice': {
      const selected = Array.isArray(value) ? (value as string[]) : []
      return (
        <fieldset className="space-y-2">
          <legend className="text-[0.95rem] font-medium">{module.title}</legend>
          {module.help_text && <p className="text-sm text-ink-muted">{module.help_text}</p>}
          <div className="space-y-2">
            {(config.options ?? []).map((option) => {
              const optionValue = String(option.value)
              const checked = selected.includes(optionValue)
              return (
                <label
                  key={optionValue}
                  className="touch-target flex items-center gap-3 rounded-[var(--radius-control)] border border-line bg-surface px-3 has-[:checked]:border-brand has-[:checked]:bg-brand-soft"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) =>
                      onChange(
                        event.target.checked
                          ? [...selected, optionValue]
                          : selected.filter((v) => v !== optionValue),
                      )
                    }
                    className="size-4 accent-[var(--color-brand)]"
                  />
                  <span>{option.label}</span>
                </label>
              )
            })}
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
        </fieldset>
      )
    }

    case 'short_text':
    default: {
      const text = typeof value === 'string' ? value : ''
      return (
        <Field
          id={id}
          label={module.title}
          help={module.help_text}
          error={error}
          required={module.required}
          counter={config.max_length ? { current: text.length, max: config.max_length } : undefined}
        >
          <TextInput
            value={text}
            placeholder={module.placeholder ?? undefined}
            onChange={(event) => onChange(event.target.value)}
          />
        </Field>
      )
    }
  }
}

function initialAnswers(modules: FormModule[]): AnswerMap {
  const answers: AnswerMap = {}
  for (const module of modules) {
    if (module.module_type === 'date' && module.configuration?.default === 'today') {
      answers[module.technical_key] = new Date().toISOString().slice(0, 10)
    }
  }
  return answers
}

/** Retire les réponses des modules masqués par une condition. */
function cleanAnswers(modules: FormModule[], answers: AnswerMap): AnswerMap {
  const cleaned: AnswerMap = {}
  for (const module of modules) {
    if (!isModuleVisible(module, answers)) continue
    const value = answers[module.technical_key]
    if (value !== undefined) cleaned[module.technical_key] = value
  }
  return cleaned
}

export function newMaterialRow() {
  return createMaterialRow()
}
