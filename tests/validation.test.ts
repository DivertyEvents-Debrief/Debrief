import { describe, expect, it } from 'vitest'
import { isModuleVisible, validateModules } from '@/lib/form-validation'
import { describeTrend, formatRating } from '@/lib/utils'
import { ratingText } from '@/lib/ratings'
import type { FormModule } from '@/lib/types'

function module(overrides: Partial<FormModule>): FormModule {
  return {
    id: overrides.technical_key ?? 'id',
    form_version_id: 'v1',
    section_key: 'general',
    technical_key: 'field',
    module_type: 'short_text',
    functional_role: 'none',
    title: 'Champ',
    help_text: null,
    placeholder: null,
    required: false,
    active: true,
    archived_at: null,
    include_in_statistics: false,
    sort_order: 10,
    configuration: {},
    ...overrides,
  }
}

describe('validation des champs obligatoires', () => {
  it('signale un champ obligatoire vide', () => {
    const errors = validateModules([module({ required: true })], {}, {
      materialRowCount: 0,
      imageCount: 0,
    })
    expect(errors.field).toBe('Ce champ est obligatoire.')
  })

  it('accepte un champ obligatoire renseigné', () => {
    const errors = validateModules([module({ required: true })], { field: 'Volvo' }, {
      materialRowCount: 0,
      imageCount: 0,
    })
    expect(errors).toEqual({})
  })

  it('respecte la longueur maximale configurée', () => {
    const errors = validateModules(
      [module({ configuration: { max_length: 5 } })],
      { field: 'beaucoup trop long' },
      { materialRowCount: 0, imageCount: 0 },
    )
    expect(errors.field).toContain('5 caractères maximum')
  })

  it("n'exige pas un champ masqué par une condition", () => {
    const conditional = module({
      technical_key: 'callback_details',
      required: true,
      configuration: { visible_when: { field: 'callback_request', equals: true } },
    })
    expect(isModuleVisible(conditional, { callback_request: false })).toBe(false)
    const errors = validateModules([conditional], { callback_request: false }, {
      materialRowCount: 0,
      imageCount: 0,
    })
    expect(errors).toEqual({})
  })

  it('accepte zéro, une ou plusieurs lignes de retour matériel', () => {
    const materialModule = module({ functional_role: 'material_feedback', required: false })
    for (const count of [0, 1, 5]) {
      const errors = validateModules([materialModule], {}, { materialRowCount: count, imageCount: 0 })
      expect(errors).toEqual({})
    }
  })
})

describe('présentation des notes', () => {
  it('affiche toujours le chiffre et le libellé, jamais l\'emoji seul', () => {
    expect(ratingText(4)).toBe('4 sur 5 — Très bien')
    expect(ratingText(null)).toBe('Non renseigné')
  })

  it('formate une moyenne à la française', () => {
    expect(formatRating(4.25)).toBe('4,3 sur 5')
  })
})

describe('comparaison avec la période précédente', () => {
  it('décrit une hausse avec un texte explicite', () => {
    const trend = describeTrend(4.2, 3.9, {
      label: 'Note moyenne',
      periodLabel: 'les 30 jours précédents',
    })
    expect(trend.direction).toBe('up')
    expect(trend.text).toContain('hausse de 0,3')
  })

  it('gère une comparaison impossible sans période précédente', () => {
    const trend = describeTrend(4.2, null, { label: 'Note moyenne', periodLabel: 'la période précédente' })
    expect(trend.direction).toBe('unknown')
    expect(trend.text).toContain('Comparaison impossible')
  })
})
