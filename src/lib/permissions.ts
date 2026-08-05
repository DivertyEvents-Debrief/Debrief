import type { AppPermission, UserRole } from '@/lib/types'

/**
 * Miroir CÔTÉ CLIENT des règles appliquées en base. Il sert uniquement à
 * masquer une entrée de menu ou désactiver un bouton : l'autorisation qui
 * fait foi est celle des politiques RLS et des fonctions SECURITY DEFINER.
 */
const ROLE_PERMISSIONS: Record<UserRole, AppPermission[]> = {
  admin: [
    'debriefs:read_all',
    'debriefs:update',
    'debriefs:reassign',
    'debriefs:delete',
    'notes:write',
    'statistics_full',
    'form_builder',
    'export_global',
    'users:manage',
    'referents:manage',
    'settings:manage',
    'logs:read',
  ],
  commercial_plus: ['debriefs:read_all', 'debriefs:update', 'notes:write'],
  commercial: ['debriefs:update', 'notes:write'],
}

export function permissionsFor(role: UserRole, granted: string[] = []): Set<AppPermission> {
  return new Set([...ROLE_PERMISSIONS[role], ...(granted as AppPermission[])])
}

export function can(
  permissions: Set<AppPermission> | AppPermission[],
  permission: AppPermission,
): boolean {
  return Array.isArray(permissions) ? permissions.includes(permission) : permissions.has(permission)
}

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrateur',
  commercial_plus: 'Commercial +',
  commercial: 'Commercial',
}
