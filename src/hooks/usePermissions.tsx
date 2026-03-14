import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

export type Permission =
  | 'employees.view'
  | 'employees.edit'
  | 'employees.delete'
  | 'salaries.view'
  | 'salaries.edit'
  | 'roles.manage'
  | 'reports.view'
  | 'reports.export'
  | 'attendance.view_all'
  | 'attendance.fix'
  | 'settings.view'
  | 'settings.edit'
  | 'approvals.manage'
  | 'permissions.manage';

export const ALL_PERMISSIONS: { key: Permission; label: string; group: string }[] = [
  { key: 'employees.view',      label: 'Voir la liste des employés',      group: 'Employés' },
  { key: 'employees.edit',      label: 'Modifier les fiches employés',    group: 'Employés' },
  { key: 'employees.delete',    label: 'Supprimer des employés',          group: 'Employés' },
  { key: 'salaries.view',       label: 'Voir les salaires',               group: 'Salaires' },
  { key: 'salaries.edit',       label: 'Modifier les salaires',           group: 'Salaires' },
  { key: 'roles.manage',        label: 'Gérer les rôles',                 group: 'Rôles' },
  { key: 'reports.view',        label: 'Voir les rapports',               group: 'Rapports' },
  { key: 'reports.export',      label: 'Exporter les rapports (CSV)',     group: 'Rapports' },
  { key: 'attendance.view_all', label: 'Voir le pointage de tous',        group: 'Pointage' },
  { key: 'attendance.fix',      label: 'Corriger les pointages',          group: 'Pointage' },
  { key: 'settings.view',       label: 'Voir les paramètres',             group: 'Paramètres' },
  { key: 'settings.edit',       label: 'Modifier les paramètres',         group: 'Paramètres' },
  { key: 'approvals.manage',    label: 'Approuver/rejeter les comptes',   group: 'Approbations' },
  { key: 'permissions.manage',  label: 'Gérer les permissions',           group: 'Permissions' },
];

interface PermissionsContextType {
  permissions: Set<Permission>;
  loading: boolean;
  can: (perm: Permission) => boolean;
  reload: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextType>({
  permissions: new Set(),
  loading: true,
  can: () => false,
  reload: async () => {},
});

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { role } = useAuth();
  const [permissions, setPermissions] = useState<Set<Permission>>(new Set());
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!role) {
      setPermissions(new Set());
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from('role_permissions')
      .select('permission, granted')
      .eq('role', role);

    const perms = new Set<Permission>();
    data?.forEach((row) => {
      if (row.granted) perms.add(row.permission as Permission);
    });
    setPermissions(perms);
    setLoading(false);
  }, [role]);

  useEffect(() => { load(); }, [load]);

  const can = useCallback((perm: Permission) => permissions.has(perm), [permissions]);

  return (
    <PermissionsContext.Provider value={{ permissions, loading, can, reload: load }}>
      {children}
    </PermissionsContext.Provider>
  );
}

export function usePermissions() {
  return useContext(PermissionsContext);
}
