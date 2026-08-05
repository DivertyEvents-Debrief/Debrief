import { Navigate, useLocation } from 'react-router-dom'
import { useSession } from '@/lib/session'
import { PageLoader } from '@/components/ui/page-loader'

/**
 * Garde de navigation. Elle évite d'afficher un écran vide à un visiteur
 * non connecté ; l'autorisation réelle reste appliquée en base.
 */
export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { loading, session, profile } = useSession()
  const location = useLocation()

  if (loading) return <PageLoader label="Vérification de la session…" />

  if (!session) {
    return <Navigate to="/connexion" state={{ suite: location.pathname }} replace />
  }

  if (profile && !profile.active) {
    return (
      <main id="contenu" className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="text-2xl font-semibold">Compte désactivé</h1>
        <p className="mt-3 text-ink-muted">
          Votre accès a été suspendu. Contactez un administrateur pour le rétablir.
        </p>
      </main>
    )
  }

  return <>{children}</>
}
