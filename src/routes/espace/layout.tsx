import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { BarChart3, Inbox, LayoutDashboard, LogOut, Settings2, Wrench } from 'lucide-react'
import { useSession } from '@/lib/session'
import { BrandLogo } from '@/components/ui/brand-logo'
import { cn } from '@/lib/utils'

type Link = {
  to: string
  label: string
  icon: typeof LayoutDashboard
  end: boolean
  roles?: string[]
}

const LINKS: Link[] = [
  { to: '/espace', label: 'Tableau de bord', icon: LayoutDashboard, end: true },
  { to: '/espace/debriefings', label: 'Débriefings', icon: Inbox, end: false },
  {
    to: '/espace/materiel',
    label: 'Retours matériel',
    icon: Wrench,
    end: false,
    roles: ['admin', 'logistique'],
  },
  {
    to: '/espace/statistiques',
    label: 'Statistiques',
    icon: BarChart3,
    end: false,
    roles: ['admin', 'commercial_plus'],
  },
  {
    to: '/espace/administration',
    label: 'Administration',
    icon: Settings2,
    end: false,
    roles: ['admin'],
  },
]

export default function EspaceLayout() {
  const { profile, signOut } = useSession()
  const navigate = useNavigate()

  // Les entrées réservées sont masquées par confort. Si quelqu'un force
  // l'URL, la page s'ouvre mais les RPC refusent : le contrôle est en base.
  const links = LINKS.filter(
    (link) => !link.roles || (profile?.role ? link.roles.includes(profile.role) : false),
  )

  return (
    <div className="min-h-dvh bg-canvas">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-4 px-4 sm:px-6">
          <span className="flex shrink-0 items-center gap-2">
            <BrandLogo className="h-8" />
            <span className="sr-only font-display text-base font-semibold tracking-tight sm:not-sr-only">
              Débriefs
            </span>
          </span>

          <nav aria-label="Navigation principale" className="hidden flex-1 items-center gap-1 sm:flex">
            {links.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'inline-flex items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-sm',
                    isActive ? 'bg-brand-soft text-brand-strong' : 'text-ink-muted hover:bg-canvas',
                  )
                }
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {profile && (
              <span className="hidden text-sm text-ink-muted sm:inline">
                {profile.first_name} {profile.last_name ?? ''}
              </span>
            )}
            <button
              type="button"
              onClick={async () => {
                await signOut()
                navigate('/connexion', { replace: true })
              }}
              className="touch-target inline-flex items-center gap-1.5 rounded-[9px] px-2 py-1 text-sm text-ink-faint hover:text-brand-strong"
            >
              <LogOut className="size-4" aria-hidden />
              <span className="sr-only sm:not-sr-only">Déconnexion</span>
            </button>
          </div>
        </div>

        <nav aria-label="Navigation principale" className="flex gap-1 overflow-x-auto px-4 pb-2 sm:hidden">
          {links.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-[9px] px-3 py-1.5 text-sm',
                  isActive ? 'bg-brand-soft text-brand-strong' : 'text-ink-muted',
                )
              }
            >
              <Icon className="size-4" aria-hidden />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main id="contenu" className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  )
}
