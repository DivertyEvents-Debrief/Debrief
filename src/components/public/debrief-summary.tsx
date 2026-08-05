
import { Pencil } from 'lucide-react'
import type { PublicFormDefinition } from '@/lib/types'
import type { AnswerMap } from '@/lib/form-validation'
import type { MaterialRow } from '@/components/form/material-feedback'
import type { UploadedImage } from '@/components/form/image-uploader'
import { RatingBadge } from '@/components/form/rating-scale'
import { isModuleVisible } from '@/lib/form-validation'
import { formatDate } from '@/lib/utils'

/** Récapitulatif avant envoi : chaque section reste modifiable en un clic. */
export function DebriefSummary({
  definition,
  answers,
  materialRows,
  images,
  onEditSection,
}: {
  definition: PublicFormDefinition
  answers: AnswerMap
  materialRows: MaterialRow[]
  images: UploadedImage[]
  onEditSection: (sectionKey: string) => void
}) {
  const filledMaterial = materialRows.filter(
    (row) => row.material_name.trim() !== '' || row.feedback.trim() !== '',
  )

  return (
    <div className="space-y-4">
      {definition.sections.map((section) => {
        const modules = definition.modules
          .filter((module) => module.section_key === section.section_key)
          .filter((module) => isModuleVisible(module, answers))
          .sort((a, b) => a.sort_order - b.sort_order)

        if (modules.length === 0) return null

        return (
          <section key={section.section_key} className="card p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="font-display text-base font-semibold">{section.title}</h3>
              <button
                type="button"
                onClick={() => onEditSection(section.section_key)}
                className="inline-flex items-center gap-1.5 rounded-[9px] px-2 py-1 text-sm text-brand-strong hover:bg-brand-softer"
              >
                <Pencil className="size-3.5" aria-hidden />
                Modifier
                <span className="sr-only">la section {section.title}</span>
              </button>
            </div>

            <dl className="space-y-3">
              {modules.map((module) => {
                if (module.functional_role === 'material_feedback') {
                  return (
                    <div key={module.id}>
                      <dt className="text-sm text-ink-muted">{module.title}</dt>
                      <dd className="mt-1">
                        {filledMaterial.length === 0 ? (
                          <span className="text-ink-faint">Aucun retour matériel</span>
                        ) : (
                          <ul className="space-y-1.5">
                            {filledMaterial.map((row, index) => (
                              <li key={row.id} className="text-[0.95rem]">
                                <span className="font-medium">
                                  {row.material_name.trim() || `Retour ${index + 1}`}
                                </span>
                                {row.feedback.trim() && (
                                  <span className="text-ink-muted"> — {row.feedback}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        )}
                      </dd>
                    </div>
                  )
                }

                if (module.functional_role === 'attachments') {
                  return (
                    <div key={module.id}>
                      <dt className="text-sm text-ink-muted">{module.title}</dt>
                      <dd className="mt-1">
                        {images.length === 0 ? (
                          <span className="text-ink-faint">Aucune image</span>
                        ) : (
                          <ul className="flex flex-wrap gap-2">
                            {images.map((image) => (
                              <li key={image.id}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={image.previewUrl}
                                  alt={image.original_name}
                                  className="size-16 rounded-lg border border-line object-cover"
                                />
                              </li>
                            ))}
                          </ul>
                        )}
                      </dd>
                    </div>
                  )
                }

                return (
                  <div key={module.id}>
                    <dt className="text-sm text-ink-muted">{module.title}</dt>
                    <dd className="mt-0.5 whitespace-pre-wrap text-[0.95rem]">
                      {renderValue(module.module_type, module.configuration?.source, answers[module.technical_key], definition)}
                    </dd>
                  </div>
                )
              })}
            </dl>
          </section>
        )
      })}
    </div>
  )
}

function renderValue(
  type: string,
  source: string | undefined,
  value: unknown,
  definition: PublicFormDefinition,
) {
  if (value === undefined || value === null || value === '') {
    return <span className="text-ink-faint">Non renseigné</span>
  }
  if (type === 'rating_5' || type === 'custom_rating') {
    return <RatingBadge value={Number(value)} size="sm" />
  }
  if (type === 'yes_no') {
    return value === true ? 'Oui' : 'Non'
  }
  if (type === 'date') {
    return formatDate(String(value))
  }
  if (source === 'referents') {
    return definition.referents.find((r) => r.id === value)?.display_name ?? String(value)
  }
  if (source === 'commercials') {
    return definition.commercials.find((c) => c.id === value)?.display_name ?? String(value)
  }
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}
