import type { FormModule } from '@/lib/types'

export type AnswerMap = Record<string, unknown>

/**
 * Validation côté client, dérivée du paramétrage des modules.
 * Elle sert au confort de saisie ; la validation qui fait autorité est
 * exécutée en base par `submit_debrief`.
 */
export function isEmptyAnswer(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  return false
}

/** Un module masqué par une condition n'est jamais obligatoire. */
export function isModuleVisible(module: FormModule, answers: AnswerMap): boolean {
  const condition = module.configuration?.visible_when
  if (!condition) return true
  return answers[condition.field] === condition.equals
}

export function validateModule(
  module: FormModule,
  answers: AnswerMap,
  context: { materialRowCount: number; imageCount: number },
): string | null {
  if (!isModuleVisible(module, answers)) return null

  const value = answers[module.technical_key]
  const config = module.configuration ?? {}

  if (module.functional_role === 'material_feedback') {
    if (module.required && context.materialRowCount === 0) {
      return 'Ajoutez au moins un retour matériel.'
    }
    return null
  }

  if (module.functional_role === 'attachments') {
    if (module.required && context.imageCount === 0) return 'Ajoutez au moins une photo.'
    return null
  }

  if (module.required && isEmptyAnswer(value)) {
    switch (module.module_type) {
      case 'rating_5':
      case 'custom_rating':
        return 'Choisissez une note.'
      case 'yes_no':
        return 'Choisissez « Oui » ou « Non ».'
      case 'date':
        return 'Indiquez une date.'
      case 'select':
      case 'searchable_select':
      case 'single_choice':
        return 'Faites un choix dans la liste.'
      case 'multiple_choice':
        return 'Sélectionnez au moins une option.'
      default:
        return 'Ce champ est obligatoire.'
    }
  }

  if (typeof value === 'string' && value.trim() !== '') {
    if (config.min_length && value.trim().length < config.min_length) {
      return `Encore un peu : ${config.min_length} caractères minimum.`
    }
    if (config.max_length && value.length > config.max_length) {
      return `${config.max_length} caractères maximum (actuellement ${value.length}).`
    }
  }

  if (module.module_type === 'date' && typeof value === 'string' && value !== '') {
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return 'Date invalide.'
    const maxOffset = config.max_offset_days ?? 365
    const limit = new Date()
    limit.setDate(limit.getDate() + maxOffset)
    if (date > limit) return 'Cette date est trop éloignée dans le futur.'
  }

  return null
}

export function validateModules(
  modules: FormModule[],
  answers: AnswerMap,
  context: { materialRowCount: number; imageCount: number },
): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const module of modules) {
    const error = validateModule(module, answers, context)
    if (error) errors[module.technical_key] = error
  }
  return errors
}
