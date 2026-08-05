import { useSession } from '@/lib/session'
import { EmptyState } from '@/components/ui/card'
import { PageLoader } from '@/components/ui/page-loader'

/**
 * Masque l'administration aux non-admins. Comme partout ailleurs, ce n'est
 * qu'un confort d'affichage : les fonctions `admin_*` et les politiques RLS
 * refusent de leur côté, quoi que fasse le navigateur.
 */
export function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { loading, profile } = useSession()

  if (loading) return <PageLoader />

  if (profile?.role !== 'admin') {
    return (
      <EmptyState
        title="Section réservée"
        description="Seuls les administrateurs accèdent à cette partie de l'application."
      />
    )
  }

  return <>{children}</>
}
