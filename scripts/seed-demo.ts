/**
 * Jeu de données de démonstration.
 *
 *   npx tsx scripts/seed-demo.ts
 *
 * Crée les comptes permanents et génère des débriefings répartis sur six
 * mois, avec des notes variées, des demandes de rappel traitées et non
 * traitées, des retours matériels et des statuts différents.
 *
 * Les mots de passe sont générés aléatoirement et affichés une seule fois
 * dans la console : rien n'est écrit en clair dans le dépôt.
 */
import { randomBytes, randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !serviceKey) {
  console.error('SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont requis.')
  process.exit(1)
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

type Role = 'admin' | 'commercial_plus' | 'commercial'

const TEAM: { email: string; first_name: string; last_name: string; role: Role }[] = [
  { email: 'admin@demo.local', first_name: 'Alix', last_name: 'Moreau', role: 'admin' },
  { email: 'commercial-plus@demo.local', first_name: 'Bastien', last_name: 'Rey', role: 'commercial_plus' },
  { email: 'claire@demo.local', first_name: 'Claire', last_name: 'Nguyen', role: 'commercial' },
  { email: 'dorian@demo.local', first_name: 'Dorian', last_name: 'Perrin', role: 'commercial' },
  { email: 'eva@demo.local', first_name: 'Eva', last_name: 'Sanchez', role: 'commercial' },
]

const CLIENTS = [
  'Séminaire Volvo',
  'Escape game Groupama',
  'Team building Schneider',
  'Soirée Photoweb',
  'Atelier CARE Air Liquide',
  'Serious game Samse',
  'Séminaire Paraboot',
  'Olympiades Teledyne',
]

const MATERIALS = [
  ['Enceinte portable', 'Batterie à plat en fin de journée, prévoir une seconde enceinte.'],
  ['Vidéoprojecteur', 'Câble HDMI trop court pour la configuration de la salle.'],
  ['Malle escape game', 'Un cadenas bloqué, remplacé sur place.'],
  ['Talkies-walkies', 'Deux appareils sans oreillette.'],
  ['Buzzers', 'Un buzzer ne répondait plus après la deuxième manche.'],
  ['Mange-debout', 'Livrés en nombre insuffisant par rapport au brief.'],
]

const VENUE_NOTES = [
  "Salle claire et bien dimensionnée, mais le stationnement sur place est limité à une dizaine de places.",
  "Accueil parfait de l'équipe du site. Circulation compliquée entre les deux bâtiments pour les transferts.",
  "Accessibilité PMR à revoir : l'accès à la mezzanine se fait uniquement par escalier.",
  "Espace extérieur très agréable, prévoir un repli en cas de pluie.",
]

const STAFF_NOTES = [
  "Équipe soudée, les rôles étaient clairs dès le brief du matin.",
  "Bonne énergie mais un animateur est arrivé sans avoir lu le déroulé.",
  "Beaucoup d'entraide sur le démontage, on a fini avec vingt minutes d'avance.",
]

function randomItem<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!
}

function randomPassword() {
  return `Demo-${randomBytes(9).toString('base64url')}`
}

async function main() {
  console.log('→ Création des comptes permanents')
  const credentials: { email: string; password: string; role: Role }[] = []
  const commercialIds: string[] = []

  for (const member of TEAM) {
    const password = randomPassword()
    const { data, error } = await supabase.auth.admin.createUser({
      email: member.email,
      password,
      email_confirm: true,
      user_metadata: { first_name: member.first_name, last_name: member.last_name },
      app_metadata: { role: member.role },
    })

    let userId = data?.user?.id
    if (error) {
      if (!error.message.includes('already been registered')) throw error
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', member.email)
        .single()
      userId = existing?.id
      console.log(`  · ${member.email} existait déjà`)
    } else {
      credentials.push({ email: member.email, password, role: member.role })
    }

    if (!userId) continue

    await supabase
      .from('profiles')
      .update({
        first_name: member.first_name,
        last_name: member.last_name,
        role: member.role,
        active: true,
        selectable_as_commercial: member.role !== 'admin',
      })
      .eq('id', userId)

    if (member.role !== 'admin') commercialIds.push(userId)
  }

  const { data: referents } = await supabase.from('referents').select('id').eq('active', true)
  const { data: statuses } = await supabase.from('statuses').select('id, code')
  const { data: version } = await supabase
    .from('form_versions')
    .select('id')
    .eq('status', 'published')
    .single()
  const { data: modules } = await supabase
    .from('form_modules')
    .select('*')
    .eq('form_version_id', version!.id)

  if (!referents?.length || !statuses?.length || !version || !modules?.length) {
    throw new Error('Exécutez d\'abord supabase/seed.sql.')
  }

  const statusByCode = Object.fromEntries(statuses.map((s) => [s.code, s.id])) as Record<string, string>

  console.log('→ Génération des débriefings')
  const total = 140

  for (let index = 0; index < total; index += 1) {
    const daysAgo = Math.floor(Math.random() * 185)
    const eventDate = new Date()
    eventDate.setDate(eventDate.getDate() - daysAgo)
    const submittedAt = new Date(eventDate)
    submittedAt.setHours(submittedAt.getHours() + 6 + Math.floor(Math.random() * 30))

    // Les notes basses restent minoritaires mais présentes, pour que les
    // graphiques et les alertes aient de quoi travailler.
    const overall = weightedRating(daysAgo)
    const internal = Math.max(1, Math.min(5, overall + (Math.random() < 0.3 ? -1 : 0)))
    const callback = Math.random() < 0.22
    const handled = callback && Math.random() < 0.55

    const statusCode = !handled && callback
      ? 'to_callback'
      : randomItem(['new', 'read', 'in_progress', 'processed', 'processed'])
    const read = statusCode !== 'new'

    const commercialId = randomItem(commercialIds)
    const referentId = randomItem(referents).id
    const client = randomItem(CLIENTS)

    const { data: debrief, error } = await supabase
      .from('debriefs')
      .insert({
        public_reference: `DBF-DEMO-${String(index + 1).padStart(4, '0')}`,
        referent_id: referentId,
        event_date: eventDate.toISOString().slice(0, 10),
        commercial_id: commercialId,
        client_or_service_name: client,
        overall_rating: overall,
        internal_satisfaction_rating: internal,
        callback_requested: callback,
        callback_details: callback ? 'Point à faire sur le déroulé et le matériel.' : null,
        callback_handled_at: handled ? new Date(submittedAt.getTime() + 36e5 * 20).toISOString() : null,
        status_id: statusByCode[statusCode],
        form_version_id: version.id,
        submitted_at: submittedAt.toISOString(),
        read_at: read ? new Date(submittedAt.getTime() + 36e5 * (2 + Math.random() * 40)).toISOString() : null,
        processed_at:
          statusCode === 'processed'
            ? new Date(submittedAt.getTime() + 36e5 * (20 + Math.random() * 90)).toISOString()
            : null,
      })
      .select('id')
      .single()

    if (error) throw error

    const answers: Record<string, unknown> = {
      referent: referentId,
      event_date: eventDate.toISOString().slice(0, 10),
      commercial: commercialId,
      client_name: client,
      overall_rating: overall,
      internal_rating: internal,
      callback_request: callback,
      venue: randomItem(VENUE_NOTES),
      staff: randomItem(STAFF_NOTES),
      timings: 'Installation en 45 minutes, un léger retard au démarrage lié à l\'accueil des participants.',
      brief_preparation: 'Brief clair. Il manquait le contact du référent site dans la fiche.',
    }

    await supabase.from('debrief_responses').insert(
      modules
        .filter((m) => !['section_title', 'explanation', 'divider', 'info_message'].includes(m.module_type))
        .map((m) => ({
          debrief_id: debrief.id,
          module_id: m.id,
          technical_key: m.technical_key,
          module_snapshot: {
            title: m.title,
            help_text: m.help_text,
            module_type: m.module_type,
            functional_role: m.functional_role,
            section_key: m.section_key,
            sort_order: m.sort_order,
            include_in_statistics: m.include_in_statistics,
            configuration: m.configuration,
          },
          response_value: answers[m.technical_key] ?? null,
        })),
    )

    if (Math.random() < 0.45) {
      const count = 1 + Math.floor(Math.random() * 2)
      await supabase.from('material_feedback_items').insert(
        Array.from({ length: count }, (_, position) => {
          const [name, feedback] = randomItem(MATERIALS)
          return {
            debrief_id: debrief.id,
            material_name: name!,
            feedback: feedback!,
            sort_order: position,
          }
        }),
      )
    }

    if (Math.random() < 0.3) {
      await supabase.from('internal_notes').insert({
        debrief_id: debrief.id,
        author_id: commercialId,
        content: 'Client recontacté, tout est clarifié pour la prochaine édition.',
      })
    }
  }

  console.log(`\n✓ ${total} débriefings générés.\n`)
  if (credentials.length) {
    console.log('Identifiants de démonstration (affichés une seule fois) :')
    for (const c of credentials) console.log(`  ${c.role.padEnd(15)} ${c.email}  ${c.password}`)
  }
}

/** Les événements récents sont légèrement mieux notés : la courbe a une pente lisible. */
function weightedRating(daysAgo: number): number {
  const base = Math.random() + (daysAgo > 120 ? -0.12 : 0.08)
  if (base < 0.06) return 1
  if (base < 0.18) return 2
  if (base < 0.4) return 3
  if (base < 0.75) return 4
  return 5
}

void main().catch((error) => {
  console.error(error)
  process.exit(1)
})

export { randomUUID }
