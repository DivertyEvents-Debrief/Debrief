import { NavLink, Outlet } from 'react-router-dom'
import { cn } from '@/lib/utils'

const TABS = [
  { to: '/espace/administration', label: 'Comptes', end: true },
  { to: '/espace/administration/referents', label: 'Référents', end: false },
  { to: '/espace/administration/statuts', label: 'Statuts', end: false },
  { to: '/espace/administration/identite', label: 'Identité visuelle', end: false },
  { to: '/espace/administration/journal', label: 'Journal', end: false },
]

export default function AdministrationLayout() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Administration</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Réservé aux administrateurs. Les modifications s'appliquent immédiatement.
        </p>
      </header>

      <nav aria-label="Sections d'administration" className="flex gap-1 overflow-x-auto border-b border-line pb-px">
        {TABS.map(({ to, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'shrink-0 border-b-2 px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'border-brand text-brand-strong'
                  : 'border-transparent text-ink-muted hover:text-ink',
              )
            }
          >
            {label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  )
}
