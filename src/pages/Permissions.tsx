import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { usePermissions, ALL_PERMISSIONS, Permission } from '@/hooks/usePermissions';
import { Loader2, Shield, Save } from 'lucide-react';
import { Navigate } from 'react-router-dom';

type AppRole = 'admin' | 'manager' | 'bureau' | 'terrain';

const ROLES: { key: AppRole; label: string }[] = [
  { key: 'admin', label: 'Administrateur' },
  { key: 'manager', label: 'Manager / RH' },
  { key: 'bureau', label: 'Bureau' },
  { key: 'terrain', label: 'Terrain' },
];

interface PermRow {
  role: AppRole;
  permission: string;
  granted: boolean;
}

export default function Permissions() {
  const { can, loading: permLoading } = usePermissions();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [matrix, setMatrix] = useState<Record<string, Record<string, boolean>>>({});

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from('role_permissions').select('role, permission, granted');
      const m: Record<string, Record<string, boolean>> = {};
      ROLES.forEach((r) => {
        m[r.key] = {};
        ALL_PERMISSIONS.forEach((p) => { m[r.key][p.key] = false; });
      });
      (data as PermRow[] | null)?.forEach((row) => {
        if (m[row.role]) m[row.role][row.permission] = row.granted;
      });
      setMatrix(m);
      setLoading(false);
    };
    fetch();
  }, []);

  const toggle = (role: AppRole, perm: Permission) => {
    setMatrix((prev) => ({
      ...prev,
      [role]: { ...prev[role], [perm]: !prev[role][perm] },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    const upserts: { role: AppRole; permission: string; granted: boolean }[] = [];
    ROLES.forEach((r) => {
      ALL_PERMISSIONS.forEach((p) => {
        upserts.push({ role: r.key, permission: p.key, granted: matrix[r.key]?.[p.key] ?? false });
      });
    });

    const { error } = await supabase
      .from('role_permissions')
      .upsert(upserts, { onConflict: 'role,permission' });

    if (error) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: '✅ Permissions sauvegardées', description: 'Les changements sont effectifs immédiatement.' });
    }
    setSaving(false);
  };

  if (permLoading || loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!can('permissions.manage')) {
    return <Navigate to="/dashboard" replace />;
  }

  // Group permissions by group name
  const groups: Record<string, typeof ALL_PERMISSIONS> = {};
  ALL_PERMISSIONS.forEach((p) => {
    if (!groups[p.group]) groups[p.group] = [];
    groups[p.group].push(p);
  });

  return (
    <DashboardLayout>
      <div className="animate-fade-in">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <Shield className="h-6 w-6 text-primary" />
            <h1 className="page-title">Permissions par rôle</h1>
          </div>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Enregistrer
          </Button>
        </div>

        <div className="space-y-6">
          {Object.entries(groups).map(([groupName, perms]) => (
            <Card key={groupName}>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{groupName}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="table-header px-4 py-2 text-left min-w-[220px]">Permission</th>
                        {ROLES.map((r) => (
                          <th key={r.key} className="table-header px-4 py-2 text-center min-w-[120px]">
                            {r.label}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {perms.map((perm) => (
                        <tr key={perm.key} className="border-b last:border-0">
                          <td className="px-4 py-3 text-sm">{perm.label}</td>
                          {ROLES.map((r) => (
                            <td key={r.key} className="px-4 py-3 text-center">
                              <Switch
                                checked={matrix[r.key]?.[perm.key] ?? false}
                                onCheckedChange={() => toggle(r.key, perm.key)}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}
