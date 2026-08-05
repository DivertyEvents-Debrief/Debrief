import * as React from 'react'
import { fetchSettings, saveSetting, type Setting } from '@/lib/admin-api'
import { applyBranding } from '@/lib/public-form'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, EmptyState } from '@/components/ui/card'
import { Field, TextArea, TextInput, inputClasses } from '@/components/ui/field'
import { ReferenceStamp } from '@/components/ui/stamp'
import { PageLoader } from '@/components/ui/page-loader'

/**
 * Réglages présentés par groupe, avec le libellé français qui va bien.
 * Ce qui n'est pas listé ici reste modifiable en base mais n'a pas sa
 * place dans un écran quotidien.
 */
const GROUPS: { title: string; description: string; keys: [string, string, string?][] }[] = [
  {
    title: 'Identité',
    description: "Ce que voient les référents en ouvrant le formulaire.",
    keys: [
      ['platform_name', 'Nom de la plateforme'],
      ['logo_url', 'Adresse du logo', 'laissez vide pour afficher le nom seul'],
      ['primary_color', 'Couleur principale'],
      ['secondary_color', 'Couleur secondaire'],
    ],
  },
  {
    title: 'Textes du formulaire',
    description: 'Le ton de ces messages compte plus que leur longueur.',
    keys: [
      ['welcome_message', "Message d'accueil"],
      ['confirmation_message', "Message après l'envoi"],
      ['privacy_notice', 'Mention de confidentialité'],
      ['privacy_policy_url', 'Lien vers la politique de confidentialité'],
    ],
  },
  {
    title: 'Images',
    description: 'Limites appliquées aussi bien côté navigateur que côté serveur.',
    keys: [
      ['max_files', "Nombre maximal d'images"],
      ['max_file_size_mb', 'Taille maximale par image (Mo)'],
      ['max_total_size_mb', 'Taille totale maximale (Mo)'],
    ],
  },
  {
    title: 'Accès et conservation',
    description: 'À manier avec précaution : ces réglages touchent tous les envois.',
    keys: [
      ['public_access_mode', "Mode d'accès public", "« open » ou « code »"],
      ['rate_limit_per_hour', 'Envois maximum par appareil et par heure'],
      ['retention_months', 'Conservation des débriefings (mois)'],
    ],
  },
]

export default function BrandingPage() {
  const [settings, setSettings] = React.useState<Record<string, unknown> | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [saved, setSaved] = React.useState<string | null>(null)
  const [pending, setPending] = React.useState(false)

  const reload = React.useCallback(async () => {
    try {
      const rows: Setting[] = await fetchSettings()
      setSettings(Object.fromEntries(rows.map((row) => [row.key, row.value])))
      setError(null)
    } catch (caught) {
      setError((caught as Error).message)
    }
  }, [])

  React.useEffect(() => {
    void reload()
  }, [reload])

  if (error && !settings) return <EmptyState title="Réglages indisponibles" description={error} />
  if (!settings) return <PageLoader label="Chargement des réglages…" />

  const value = (key: string) => {
    const raw = settings[key]
    return raw === null || raw === undefined ? '' : String(raw)
  }

  const setLocal = (key: string, raw: string) => {
    setSettings((current) => ({ ...(current ?? {}), [key]: raw }))
    if (key === 'primary_color' || key === 'secondary_color') {
      // Aperçu immédiat : l'admin voit la couleur avant d'enregistrer.
      applyBranding({
        primary_color: key === 'primary_color' ? raw : String(settings.primary_color ?? '#1F8A4C'),
        secondary_color: key === 'secondary_color' ? raw : String(settings.secondary_color ?? '#E8892B'),
      })
    }
  }

  const persist = async (key: string) => {
    setPending(true)
    try {
      const raw = settings[key]
      // Les réglages sont stockés en JSON : les nombres doivent rester des
      // nombres, sinon les comparaisons côté SQL cassent silencieusement.
      const numeric = /^(max_files|max_file_size_mb|max_total_size_mb|rate_limit_per_hour|retention_months)$/
      const parsed = numeric.test(key)
        ? Number(raw) || 0
        : raw === ''
          ? null
          : String(raw)

      await saveSetting(key, parsed)
      setSaved(key)
      setError(null)
      setTimeout(() => setSaved(null), 2000)
    } catch (caught) {
      setError((caught as Error).message)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="rounded-[9px] bg-danger-soft px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <Card>
        <CardHeader title="Aperçu" description="Les couleurs s'appliquent en direct, avant même d'enregistrer." />
        <div className="flex flex-wrap items-center gap-6">
          <ReferenceStamp reference="DBF-2026-000042" />
          <div className="space-y-2">
            <Button size="sm">Bouton principal</Button>
            <p className="text-sm text-ink-muted">{value('platform_name') || 'Débriefs'}</p>
          </div>
        </div>
      </Card>

      {GROUPS.map((group) => (
        <Card key={group.title}>
          <CardHeader title={group.title} description={group.description} />
          <div className="grid gap-4 sm:grid-cols-2">
            {group.keys.map(([key, label, hint]) => {
              const isColor = key.endsWith('_color')
              const isLong = /message|notice/.test(key)

              return (
                <div key={key} className={isLong ? 'sm:col-span-2' : undefined}>
                <Field
                  label={label}
                  id={`set-${key}`}
                  help={saved === key ? 'enregistré' : hint}
                >
                  {isLong ? (
                    <TextArea
                      id={`set-${key}`}
                      rows={2}
                      value={value(key)}
                      onChange={(event) => setLocal(key, event.target.value)}
                      onBlur={() => persist(key)}
                    />
                  ) : isColor ? (
                    <div className="flex gap-2">
                      <input
                        type="color"
                        aria-label={`${label} — sélecteur`}
                        value={value(key) || '#1F8A4C'}
                        onChange={(event) => setLocal(key, event.target.value)}
                        onBlur={() => persist(key)}
                        className="h-10 w-14 cursor-pointer rounded-[9px] border border-line-strong"
                      />
                      <TextInput
                        id={`set-${key}`}
                        value={value(key)}
                        onChange={(event) => setLocal(key, event.target.value)}
                        onBlur={() => persist(key)}
                      />
                    </div>
                  ) : (
                    <TextInput
                      id={`set-${key}`}
                      value={value(key)}
                      onChange={(event) => setLocal(key, event.target.value)}
                      onBlur={() => persist(key)}
                      disabled={pending}
                    />
                  )}
                </Field>
                </div>
              )
            })}
          </div>
        </Card>
      ))}

      <Card>
        <CardHeader
          title="Mode d'accès public"
          description="En mode « code », le formulaire demande un code avant de s'afficher. Créez-le dans la table public_access_codes."
        />
        <label className="block max-w-xs text-sm">
          <span className="sr-only">Mode d'accès</span>
          <select
            value={value('public_access_mode') || 'open'}
            onChange={async (event) => {
              setSettings((current) => ({ ...(current ?? {}), public_access_mode: event.target.value }))
              await saveSetting('public_access_mode', event.target.value)
            }}
            className={inputClasses}
          >
            <option value="open">Ouvert — le lien suffit</option>
            <option value="code">Protégé par un code d'accès</option>
          </select>
        </label>
      </Card>
    </div>
  )
}
