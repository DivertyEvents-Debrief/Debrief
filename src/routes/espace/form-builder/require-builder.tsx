import { useSession } from '@/lib/session'
import { EmptyState } from '@/components/ui/card'
import { PageLoader } from '@/components/ui/page-loader'

/**
 * Le constructeur est ouvert aux administrateurs et aux comptes ayant reçu
 * la permission « Constructeur de formulaire ». Comme ailleurs, ce filtre
 * n'est qu'un confort : les fonctions SQL refont le contrôle.
 */
export function RequireBuilder({ children }: { children: React.ReactNode }) {
  const { loading, profile } = useSession()

  if (loading) return <PageLoader />

  const allowed =
    profile?.role === 'admin' || (profile?.permissions ?? []).includes('form_builder')

  if (!allowed) {
    return (
      <EmptyState
        title="Section réservée"
        description="Demandez la permission « Constructeur de formulaire » à un administrateur."
      />
    )
  }

  return <>{children}</>
}
