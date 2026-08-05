import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { PublicDebriefPage } from '@/routes/public/debrief-page'
import { SessionProvider } from '@/lib/session'
import { RequireAuth } from '@/routes/espace/require-auth'
import { PageLoader } from '@/components/ui/page-loader'

// L'espace permanent est chargé à la demande : un référent qui ouvre le
// formulaire depuis son téléphone ne télécharge pas les graphiques ni les
// écrans d'administration.
const LoginPage = lazy(() => import('@/routes/espace/login-page'))
const EspaceLayout = lazy(() => import('@/routes/espace/layout'))
const DashboardPage = lazy(() => import('@/routes/espace/dashboard-page'))
const DebriefListPage = lazy(() => import('@/routes/espace/debrief-list-page'))
const DebriefDetailPage = lazy(() => import('@/routes/espace/debrief-detail-page'))

// GitHub Pages sert le site sous /<nom-du-depot>/ : le routeur doit
// connaître ce préfixe, sinon toutes les routes tombent à côté.
const basename = import.meta.env.BASE_URL.replace(/\/$/, '')

export function App() {
  return (
    <SessionProvider>
      <BrowserRouter basename={basename || '/'}>
        <a href="#contenu" className="sr-only-focusable absolute left-3 top-3 z-50 rounded-md bg-brand px-3 py-2 text-white">
          Aller au contenu
        </a>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<Navigate to="/debrief" replace />} />
            <Route path="/debrief" element={<PublicDebriefPage />} />
            <Route path="/connexion" element={<LoginPage />} />
            <Route
              path="/espace"
              element={
                <RequireAuth>
                  <EspaceLayout />
                </RequireAuth>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="debriefings" element={<DebriefListPage />} />
              <Route path="debriefings/:id" element={<DebriefDetailPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/debrief" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </SessionProvider>
  )
}
