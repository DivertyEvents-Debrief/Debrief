import { BarChart3 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardHeader } from '@/components/ui/card'

/**
 * L'écran de statistiques n'est pas encore construit. Sans cette page, le
 * lien du menu tombait sur la route par défaut et renvoyait le permanent
 * vers le formulaire public — un comportement déroutant qui donnait
 * l'impression d'une déconnexion.
 */
export default function StatisticsPlaceholder() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Statistiques</h1>
        <p className="mt-1 text-ink-muted">Bientôt disponible.</p>
      </header>

      <Card>
        <CardHeader
          title="Écran en cours de construction"
          description="Les calculs sont déjà en place côté base de données ; il manque la mise en forme."
        />
        <div className="flex items-start gap-3 text-sm text-ink-muted">
          <BarChart3 className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden />
          <div className="space-y-2">
            <p>
              Cet écran présentera les notes moyennes avec comparaison à la période précédente, la
              répartition par commercial, référent et client, le suivi des rappels et l'analyse des
              retours matériel.
            </p>
            <p>
              En attendant, la liste des débriefings offre déjà tous les filtres : période, note,
              statut, commercial, référent, présence de photos ou de retours matériel.
            </p>
          </div>
        </div>
        <Link
          to="/espace/debriefings"
          className="mt-4 inline-flex items-center rounded-[var(--radius-control)] border border-line-strong px-4 py-2 text-sm hover:border-brand-line hover:text-brand-strong"
        >
          Aller à la liste filtrable
        </Link>
      </Card>
    </div>
  )
}
