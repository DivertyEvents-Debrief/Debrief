/**
 * Le tampon : élément signature de la plateforme. Il affiche la référence
 * unique d'un débriefing comme un cachet apposé sur un dossier.
 */
export function ReferenceStamp({ reference, label = 'Référence' }: { reference: string; label?: string }) {
  return (
    <div className="stamp" role="img" aria-label={`${label} ${reference}`}>
      <span className="stamp__label" aria-hidden>
        {label}
      </span>
      <span className="stamp__value" aria-hidden>
        {reference}
      </span>
    </div>
  )
}
