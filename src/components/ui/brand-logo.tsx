import { cn } from '@/lib/utils'

/**
 * Logo de l'agence.
 *
 * `logo_url` reste administrable : si l'agence change d'identité, elle
 * renseigne une adresse dans les réglages sans toucher au code. Le fichier
 * livré avec l'application sert de valeur par défaut.
 */
export function BrandLogo({
  src,
  alt = 'Diverty Events',
  className,
}: {
  src?: string | null
  alt?: string
  className?: string
}) {
  const source = src || `${import.meta.env.BASE_URL}logo-diverty.png`

  return (
    <img
      src={source}
      alt={alt}
      className={cn('h-auto w-auto object-contain', className)}
      // Le logo est décoratif au-dessus du titre : il ne doit pas retarder
      // l'affichage des questions.
      loading="lazy"
      decoding="async"
    />
  )
}
