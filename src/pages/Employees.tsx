import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Search, Loader2, Plus, Pencil, Trash2, Shield, ShieldCheck, Archive, ArchiveRestore, Eye, PauseCircle, PlayCircle, X } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { DEPARTMENTS, getPositionsForDepartment, getDepartmentLogo } from '@/lib/departments';

type AppRole = 'admin' | 'manager' | 'bureau' | 'terrain';

interface Employee {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  position: string | null;
  department: string | null;
  base_salary: number | null;
  is_approved: boolean;
  rules_accepted: boolean;
  archived: boolean;
  archived_at: string | null;
  archive_reason: string | null;
  hire_date: string | null;
  matricule: string | null;
  is_paused: boolean;
  paused_at: string | null;
  role?: string;
}

interface EmployeeForm {
  full_name: string;
  email: string;
  phone: string;
  position: string;
  department: string;
  base_salary: string;
  hire_date: string;
  role: AppRole;
  is_approved: boolean;
}

const emptyForm: EmployeeForm = {
  full_name: '',
  email: '',
  phone: '',
  position: '',
  department: '',
  base_salary: '',
  hire_date: '',
  role: 'bureau',
  is_approved: false,
};

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrateur',
  manager: 'Manager/RH',
  bureau: 'Bureau',
  terrain: 'Terrain',
};

export default function Employees() {
  const { role: currentUserRole } = useAuth();
  const { can } = usePermissions();
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Dialog state
  const [editOpen, setEditOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [form, setForm] = useState<EmployeeForm>(emptyForm);

  // Role dialog
  const [roleOpen, setRoleOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<Employee | null>(null);
  const [selectedRole, setSelectedRole] = useState<AppRole>('bureau');

  // Delete dialog
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);

  // Archive dialog
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<Employee | null>(null);
  const [archiveReason, setArchiveReason] = useState('Démission');
  const [archiveNote, setArchiveNote] = useState('');
  const [showArchived, setShowArchived] = useState(false);

  // Custom positions from settings
  const [customPositions, setCustomPositions] = useState<Record<string, string[]>>({});
  const [customPosMode, setCustomPosMode] = useState(false);

  const fetchEmployees = useCallback(async () => {
    const [profilesRes, rolesRes, settingsRes] = await Promise.all([
      supabase.from('profiles').select('*').order('full_name'),
      supabase.from('user_roles').select('*'),
      supabase.from('app_settings').select('key, value').eq('key', 'custom_positions').maybeSingle(),
    ]);

    const profiles = profilesRes.data || [];
    const roles = rolesRes.data || [];

    if (settingsRes.data?.value && typeof settingsRes.data.value === 'object') {
      setCustomPositions(settingsRes.data.value as Record<string, string[]>);
    }

    const merged = profiles.map((p) => ({
      ...p,
      role: roles.find((r) => r.user_id === p.user_id)?.role || 'bureau',
    }));

    setEmployees(merged);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const filtered = employees.filter(
    (e) =>
      (showArchived ? e.archived : !e.archived) &&
      (deptFilter === 'all' || e.department === deptFilter) &&
      (e.full_name.toLowerCase().includes(search.toLowerCase()) ||
      e.email.toLowerCase().includes(search.toLowerCase()) ||
      (e.department || '').toLowerCase().includes(search.toLowerCase()))
  );

  const roleBadgeVariant = (role: string) => {
    const map: Record<string, string> = {
      admin: 'bg-primary/10 text-primary',
      manager: 'bg-secondary/10 text-secondary',
      bureau: 'bg-muted text-muted-foreground',
      terrain: 'bg-warning/10 text-warning',
    };
    return map[role] || '';
  };

  const canManageApprovals = can('approvals.manage');

  const openEdit = (emp?: Employee) => {
    if (emp) {
      setEditingEmployee(emp);
      setForm({
        full_name: emp.full_name,
        email: emp.email,
        phone: emp.phone || '',
        position: emp.position || '',
        department: emp.department || '',
        base_salary: emp.base_salary?.toString() || '',
        hire_date: emp.hire_date || '',
        role: (emp.role as AppRole) || 'bureau',
        is_approved: emp.is_approved,
      });
    } else {
      setEditingEmployee(null);
      setForm(emptyForm);
    }
    setCustomPosMode(false);
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!form.full_name.trim() || !form.email.trim()) {
      toast({ title: 'Erreur', description: 'Le nom et l\'email sont obligatoires.', variant: 'destructive' });
      return;
    }
    setSaving(true);

    const payload = {
      full_name: form.full_name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim() || null,
      position: form.position.trim() || null,
      department: form.department.trim() || null,
      base_salary: form.base_salary ? Number(form.base_salary) : null,
      hire_date: form.hire_date || null,
    };

    if (editingEmployee) {
      // Update profile
      const { error } = await supabase
        .from('profiles')
        .update({ ...payload, is_approved: form.is_approved })
        .eq('id', editingEmployee.id);

      if (error) {
        toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
        setSaving(false);
        return;
      }

      // Update role if changed and user has permission
      if (canManageRoles && form.role !== editingEmployee.role) {
        const { error: roleError } = await supabase
          .from('user_roles')
          .update({ role: form.role })
          .eq('user_id', editingEmployee.user_id);

        if (roleError) {
          toast({ title: 'Erreur rôle', description: roleError.message, variant: 'destructive' });
          setSaving(false);
          return;
        }
      }

      toast({ title: '✅ Employé modifié', description: `${payload.full_name} a été mis à jour.` });

      // If using a custom position not yet in the list, save it
      if (customPosMode && payload.position && payload.department) {
        const existing = getPositionsForDepartment(payload.department, customPositions);
        if (!existing.includes(payload.position)) {
          const updated = { ...customPositions };
          if (!updated[payload.department]) updated[payload.department] = [];
          updated[payload.department] = [...updated[payload.department], payload.position];
          await supabase
            .from('app_settings')
            .upsert({ key: 'custom_positions', value: updated as any }, { onConflict: 'key' });
          setCustomPositions(updated);
        }
      }
      setCustomPosMode(false);
      setEditOpen(false);
      fetchEmployees();
    } else {
      toast({ title: 'Info', description: 'Pour créer un employé, celui-ci doit s\'inscrire via la page de connexion. Vous pouvez ensuite modifier ses informations ici.' });
      setCustomPosMode(false);
      setEditOpen(false);
    }
    setSaving(false);
  };

  const openRole = (emp: Employee) => {
    setRoleTarget(emp);
    setSelectedRole((emp.role as AppRole) || 'bureau');
    setRoleOpen(true);
  };

  const handleRoleChange = async () => {
    if (!roleTarget) return;
    setSaving(true);

    const { error } = await supabase
      .from('user_roles')
      .update({ role: selectedRole })
      .eq('user_id', roleTarget.user_id);

    if (error) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: '✅ Rôle modifié', description: `${roleTarget.full_name} est maintenant ${ROLE_LABELS[selectedRole]}.` });
      setRoleOpen(false);
      fetchEmployees();
    }
    setSaving(false);
  };

  const openDelete = (emp: Employee) => {
    setDeleteTarget(emp);
    setDeleteOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);

    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', deleteTarget.id);

    if (error) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: '🗑️ Employé supprimé', description: `${deleteTarget.full_name} a été retiré.` });
      setDeleteOpen(false);
      fetchEmployees();
    }
    setSaving(false);
  };

  const openArchive = (emp: Employee) => {
    setArchiveTarget(emp);
    setArchiveReason('Démission');
    setArchiveNote('');
    setArchiveOpen(true);
  };

  const handleArchive = async () => {
    if (!archiveTarget) return;
    setSaving(true);

    const reason = archiveNote.trim()
      ? `${archiveReason} — ${archiveNote.trim()}`
      : archiveReason;

    const { error } = await supabase
      .from('profiles')
      .update({ archived: true, archived_at: new Date().toISOString(), archive_reason: reason })
      .eq('id', archiveTarget.id);

    if (error) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: '📦 Compte archivé', description: `${archiveTarget.full_name} a été archivé (${archiveReason}).` });
      setArchiveOpen(false);
      fetchEmployees();
    }
    setSaving(false);
  };

  const handleRestore = async (emp: Employee) => {
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ archived: false, archived_at: null, archive_reason: null })
      .eq('id', emp.id);

    if (error) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: '✅ Compte restauré', description: `${emp.full_name} a été réactivé.` });
      fetchEmployees();
    }
    setSaving(false);
  };

  const handleTogglePause = async (emp: Employee) => {
    setSaving(true);
    const newPaused = !emp.is_paused;
    const { error } = await supabase
      .from('profiles')
      .update({
        is_paused: newPaused,
        paused_at: newPaused ? new Date().toISOString() : null,
      } as any)
      .eq('id', emp.id);

    if (error) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } else {
      toast({
        title: newPaused ? '⏸️ Compte en pause' : '▶️ Compte réactivé',
        description: newPaused
          ? `${emp.full_name} est maintenant en pause. Les absences ne seront plus comptées.`
          : `${emp.full_name} est de retour. Les compteurs reprennent.`,
      });
      fetchEmployees();
    }
    setSaving(false);
  };

  const isAdmin = currentUserRole === 'admin';
  const canEdit = can('employees.edit');
  const canDelete = can('employees.delete');
  const canManageRoles = can('roles.manage');
  const canViewSalary = can('salaries.view');
  const canEditSalary = can('salaries.edit');
  const showActions = canEdit || canDelete || canManageRoles;

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="animate-fade-in">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <h1 className="page-title">Employés</h1>
          <div className="flex items-center gap-3">
            {canDelete && (
              <Button
                variant={showArchived ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowArchived(!showArchived)}
              >
                <Archive className="h-4 w-4 mr-2" />
                {showArchived ? 'Archivés' : 'Voir archivés'}
                {showArchived && (
                  <span className="ml-1 text-xs">({filtered.length})</span>
                )}
              </Button>
            )}
            <span className="text-sm text-muted-foreground">{filtered.length}/{employees.filter(e => showArchived ? e.archived : !e.archived).length} employé(s)</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 mb-6">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un employé..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={deptFilter} onValueChange={setDeptFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Département" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les départements</SelectItem>
              {DEPARTMENTS.map((d) => (
                <SelectItem key={d.key} value={d.key}>
                  <div className="flex items-center gap-2">
                    <img src={d.logo} alt="" className="h-4 w-4 rounded object-contain" />
                    {d.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="table-header px-4 py-3 text-left">Matricule</th>
                  <th className="table-header px-4 py-3 text-left">Nom</th>
                  <th className="table-header px-4 py-3 text-left">Email</th>
                  <th className="table-header px-4 py-3 text-left">Département</th>
                  <th className="table-header px-4 py-3 text-left">Poste</th>
                  <th className="table-header px-4 py-3 text-left">Rôle</th>
                  {!showArchived && <th className="table-header px-4 py-3 text-left">Prise de fonction</th>}
                  {showArchived && <th className="table-header px-4 py-3 text-left">Motif</th>}
                  {canViewSalary && !showArchived && <th className="table-header px-4 py-3 text-right">Salaire</th>}
                  {showActions && <th className="table-header px-4 py-3 text-center">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp) => (
                  <tr key={emp.id} className={`border-b last:border-0 hover:bg-muted/30 transition-colors ${emp.archived ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 text-sm font-mono text-muted-foreground">{emp.matricule || '—'}</td>
                    <td className="px-4 py-3 text-sm font-medium">
                      <div className="flex items-center gap-2">
                        {emp.full_name}
                        {emp.archived && <Badge variant="outline" className="text-[10px] px-1.5 py-0">Archivé</Badge>}
                        {emp.is_paused && !emp.archived && <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-yellow-500 text-yellow-600">En pause</Badge>}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">{emp.email}</td>
                    <td className="px-4 py-3 text-sm">
                      {emp.department ? (
                        <div className="flex items-center gap-2">
                          <img src={getDepartmentLogo(emp.department)} alt="" className="h-5 w-5 rounded object-contain" />
                          <span>{emp.department}</span>
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-sm">{emp.position || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`badge-status ${roleBadgeVariant(emp.role || '')}`}>
                        {ROLE_LABELS[emp.role || ''] || emp.role}
                      </span>
                    </td>
                    {!showArchived && (
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {emp.hire_date ? new Date(emp.hire_date).toLocaleDateString('fr-FR') : '—'}
                      </td>
                    )}
                    {canViewSalary && !showArchived && (
                    <td className="px-4 py-3 text-sm text-right font-medium">
                      {emp.base_salary ? `${emp.base_salary.toLocaleString()} FCFA` : '—'}
                    </td>
                    )}
                    {showArchived && (
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {emp.archive_reason || '—'}
                      </td>
                    )}
                    {showActions && (
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1">
                          {emp.archived ? (
                            canDelete && (
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:text-primary" onClick={() => handleRestore(emp)} title="Restaurer le compte">
                                <ArchiveRestore className="h-4 w-4" />
                              </Button>
                            )
                          ) : (
                            <>
                              {canEdit && (
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(emp)} title="Modifier">
                                <Pencil className="h-4 w-4" />
                              </Button>
                              )}
                              {canManageRoles && (
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openRole(emp)} title="Changer le rôle">
                                <Shield className="h-4 w-4" />
                              </Button>
                              )}
                              {isAdmin && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className={`h-8 w-8 ${emp.is_paused ? 'text-green-500 hover:text-green-600' : 'text-yellow-500 hover:text-yellow-600'}`}
                                onClick={() => handleTogglePause(emp)}
                                title={emp.is_paused ? 'Réactiver le compte' : 'Mettre en pause'}
                              >
                                {emp.is_paused ? <PlayCircle className="h-4 w-4" /> : <PauseCircle className="h-4 w-4" />}
                              </Button>
                              )}
                              {canDelete && (
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-orange-500 hover:text-orange-600" onClick={() => openArchive(emp)} title="Archiver (démission/licenciement)">
                                <Archive className="h-4 w-4" />
                              </Button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9 + (showActions ? 1 : 0)} className="px-4 py-8 text-center text-muted-foreground">
                      {showArchived ? 'Aucun employé archivé' : 'Aucun employé trouvé'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Edit Employee Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingEmployee ? 'Modifier l\'employé' : 'Nouvel employé'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto pr-2">
            {/* Identity */}
            <div className="grid gap-2">
              <Label htmlFor="full_name">Nom complet *</Label>
              <Input id="full_name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email *</Label>
                <Input id="email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Téléphone</Label>
                <Input id="phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>

            <Separator />

            {/* Department & Position */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="department">Département</Label>
                <Select value={form.department} onValueChange={(val) => { setForm({ ...form, department: val, position: '' }); setCustomPosMode(false); }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choisir..." />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPARTMENTS.map((d) => (
                      <SelectItem key={d.key} value={d.key}>
                        <div className="flex items-center gap-2">
                          <img src={d.logo} alt="" className="h-4 w-4 rounded object-contain" />
                          {d.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="position">Poste</Label>
                {customPosMode ? (
                  <div className="flex gap-2">
                    <Input
                      placeholder="Saisir le nouveau poste…"
                      value={form.position}
                      onChange={(e) => setForm({ ...form, position: e.target.value })}
                      autoFocus
                    />
                    <Button type="button" variant="ghost" size="icon" onClick={() => { setCustomPosMode(false); setForm({ ...form, position: '' }); }} title="Annuler">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <Select
                    value={form.position}
                    onValueChange={(val) => {
                      if (val === '__other__') {
                        setCustomPosMode(true);
                        setForm({ ...form, position: '' });
                      } else {
                        setForm({ ...form, position: val });
                      }
                    }}
                    disabled={!form.department}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={form.department ? 'Choisir...' : 'Département requis'} />
                    </SelectTrigger>
                    <SelectContent>
                      {getPositionsForDepartment(form.department, customPositions).map((pos) => (
                        <SelectItem key={pos} value={pos}>{pos}</SelectItem>
                      ))}
                      <SelectItem value="__other__" className="text-primary font-medium border-t mt-1 pt-1">
                        + Autre…
                      </SelectItem>
                    </SelectContent>
                  </Select>
                )}
              </div>
            </div>

            {/* Salary */}
            <div className="grid gap-2">
              <Label htmlFor="base_salary">Salaire de base (FCFA)</Label>
              <Input id="base_salary" type="number" min="0" value={form.base_salary} onChange={(e) => setForm({ ...form, base_salary: e.target.value })} disabled={!canEditSalary} />
            </div>

            {/* Hire date */}
            <div className="grid gap-2">
              <Label htmlFor="hire_date">Date de prise de fonction</Label>
              <Input id="hire_date" type="date" value={form.hire_date} onChange={(e) => setForm({ ...form, hire_date: e.target.value })} />
            </div>

            {/* Admin-only: Role & Approval */}
            {(canManageRoles || canManageApprovals) && editingEmployee && (
              <>
                <Separator />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Administration</p>

                {canManageRoles && (
                  <div className="grid gap-2">
                    <Label>Rôle</Label>
                    <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v as AppRole })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">
                          <div className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-primary" /> Administrateur</div>
                        </SelectItem>
                        <SelectItem value="manager">
                          <div className="flex items-center gap-2"><Shield className="h-4 w-4 text-secondary" /> Manager/RH</div>
                        </SelectItem>
                        <SelectItem value="bureau">Bureau</SelectItem>
                        <SelectItem value="terrain">Terrain</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {canManageApprovals && (
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <Label>Compte approuvé</Label>
                      <p className="text-xs text-muted-foreground">
                        {form.is_approved ? 'L\'employé peut accéder à l\'application' : 'L\'employé est en attente d\'approbation'}
                      </p>
                    </div>
                    <Switch checked={form.is_approved} onCheckedChange={(checked) => setForm({ ...form, is_approved: checked })} />
                  </div>
                )}

                {editingEmployee.rules_accepted && (
                  <p className="text-xs text-muted-foreground">✅ Règlement intérieur accepté</p>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Role Dialog */}
      <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Changer le rôle</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              Modifier le rôle de <strong>{roleTarget?.full_name}</strong>
            </p>
            <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as AppRole)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="admin">Administrateur</SelectItem>
                <SelectItem value="manager">Manager/RH</SelectItem>
                <SelectItem value="bureau">Bureau</SelectItem>
                <SelectItem value="terrain">Terrain</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleOpen(false)}>Annuler</Button>
            <Button onClick={handleRoleChange} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation (kept for extreme cases) */}
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cet employé ?</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir supprimer <strong>{deleteTarget?.full_name}</strong> ?
              Cette action est irréversible. Préférez l'archivage pour conserver les données.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Supprimer définitivement
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Archive Dialog */}
      <Dialog open={archiveOpen} onOpenChange={setArchiveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Archiver le compte</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <p className="text-sm text-muted-foreground">
              Archiver le compte de <strong>{archiveTarget?.full_name}</strong>. Toutes ses données seront conservées mais le compte sera désactivé.
            </p>
            <div className="grid gap-2">
              <Label>Motif *</Label>
              <Select value={archiveReason} onValueChange={setArchiveReason}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Démission">Démission</SelectItem>
                  <SelectItem value="Licenciement">Licenciement</SelectItem>
                  <SelectItem value="Fin de contrat">Fin de contrat</SelectItem>
                  <SelectItem value="Retraite">Retraite</SelectItem>
                  <SelectItem value="Autre">Autre</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Note (facultatif)</Label>
              <Textarea
                value={archiveNote}
                onChange={(e) => setArchiveNote(e.target.value)}
                placeholder="Détails supplémentaires..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveOpen(false)}>Annuler</Button>
            <Button onClick={handleArchive} disabled={saving} className="bg-orange-500 hover:bg-orange-600 text-white">
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              <Archive className="h-4 w-4 mr-2" />
              Archiver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
