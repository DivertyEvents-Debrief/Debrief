import type { ResponseEntry } from '@/lib/workspace-api'
import { RatingBadge } from '@/components/form/rating-scale'
import { formatDate } from '@/lib/utils'

/**
 * Affichage des réponses à partir de l'instantané du module.
 *
 * On n'interroge jamais la définition actuelle du formulaire : un
 * débriefing envoyé il y a six mois s'affiche avec les libellés qu'il avait
 * ce jour-là, même si le module a été renommé ou archivé depuis. C'est tout
 * l'intérêt d'avoir figé le module dans chaque réponse.
 */
export function ResponseList({ responses }: { responses: ResponseEntry[] }) {
  if (responses.length === 0) {
    return <p className="text-sm text-ink-faint">Aucune réponse enregistrée.</p>
  }

  // Regroupement par section, dans l'ordre d'apparition du formulaire.
  const sections = new Map<string, ResponseEntry[]>()
  for (const entry of responses) {
    const key = entry.module.section_key ?? 'Réponses'
    const bucket = sections.get(key)
    if (bucket) bucket.push(entry)
    else sections.set(key, [entry])
  }

  return (
    <div className="space-y-6">
      {[...sections.entries()].map(([section, entries]) => (
        <section key={section}>
          {sections.size > 1 && (
            <h3 className="mb-2 font-display text-sm font-semibold uppercase tracking-wide text-ink-faint">
              {section}
            </h3>
          )}
          <dl className="divide-y divide-line">
            {entries.map((entry) => (
              <div key={entry.id} className="py-3 first:pt-0 last:pb-0">
                <dt className="text-sm text-ink-muted">{entry.module.title}</dt>
                <dd className="mt-1">{renderValue(entry)}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}

function renderValue(entry: ResponseEntry) {
  const { value } = entry
  const type = entry.module.module_type

  if (value === null || value === undefined || value === '') {
    return <span className="text-ink-faint">non renseigné</span>
  }

  if (type === 'rating') {
    return <RatingBadge value={Number(value)} />
  }

  if (type === 'yes_no' || typeof value === 'boolean') {
    return <span className="font-medium">{value ? 'Oui' : 'Non'}</span>
  }

  if (type === 'date') {
    return <span>{formatDate(String(value))}</span>
  }

  if (Array.isArray(value)) {
    return (
      <ul className="flex flex-wrap gap-1.5">
        {value.map((item, index) => (
          <li
            key={index}
            className="rounded-full border border-line-strong px-2.5 py-0.5 text-sm"
          >
            {label(entry, String(item))}
          </li>
        ))}
      </ul>
    )
  }

  if (type === 'single_select' || type === 'multi_select') {
    return <span className="font-medium">{label(entry, String(value))}</span>
  }

  return <p className="whitespace-pre-wrap">{String(value)}</p>
}

/** Une option supprimée depuis reste lisible : on retombe sur sa valeur brute. */
function label(entry: ResponseEntry, raw: string): string {
  const option = entry.module.options?.find((item) => item.value === raw)
  return option?.label ?? raw
}
