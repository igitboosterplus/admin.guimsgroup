import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ClipboardList,
  Plus,
  Eye,
  Pencil,
  Trash2,
  Play,
  CheckCircle,
  AlertTriangle,
  Clock,
  Loader2,
  Target,
  TrendingUp,
  CalendarDays,
  LayoutGrid,
  List,
  User,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface Task {
  id: string;
  title: string;
  description: string | null;
  assigned_to: string;
  assigned_by: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'pending' | 'in_progress' | 'completed' | 'overdue';
  due_date: string | null;
  started_at: string | null;
  completed_at: string | null;
  completion_note: string | null;
  progress: number;
  category: string | null;
  created_at: string;
  updated_at: string;
  // joined
  assigned_to_name?: string;
  assigned_by_name?: string;
  department?: string | null;
}

interface TaskForm {
  title: string;
  description: string;
  assigned_to: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date: string;
  category: string;
}

interface EmployeeOption {
  user_id: string;
  full_name: string;
  department: string | null;
}

const emptyForm: TaskForm = {
  title: '',
  description: '',
  assigned_to: '',
  priority: 'medium',
  due_date: '',
  category: '',
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

const priorityConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; color: string }> = {
  low:    { label: 'Basse',   variant: 'outline',     color: 'text-muted-foreground' },
  medium: { label: 'Moyenne', variant: 'secondary',   color: 'text-blue-600' },
  high:   { label: 'Haute',   variant: 'default',     color: 'text-orange-600' },
  urgent: { label: 'Urgente', variant: 'destructive',  color: 'text-red-600' },
};

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: React.ElementType }> = {
  pending:     { label: 'En attente',  variant: 'secondary',   icon: Clock },
  in_progress: { label: 'En cours',    variant: 'default',     icon: Play },
  completed:   { label: 'Terminée',    variant: 'outline',     icon: CheckCircle },
  overdue:     { label: 'En retard',   variant: 'destructive', icon: AlertTriangle },
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function Tasks() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const isAdmin = role === 'admin' || role === 'manager';

  const [tasks, setTasks] = useState<Task[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [loading, setLoading] = useState(true);

  // New/Edit task dialog
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [form, setForm] = useState<TaskForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  // Detail dialog
  const [detailTarget, setDetailTarget] = useState<Task | null>(null);

  // Progress update dialog (for employees)
  const [progressTarget, setProgressTarget] = useState<Task | null>(null);
  const [progressValue, setProgressValue] = useState(0);
  const [progressNote, setProgressNote] = useState('');
  const [updatingProgress, setUpdatingProgress] = useState(false);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'board'>(isAdmin ? 'list' : 'board');

  /* ---------------------------------------------------------------- */
  /*  Fetch                                                            */
  /* ---------------------------------------------------------------- */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Tasks
      let query = supabase.from('tasks').select('*').order('created_at', { ascending: false });
      if (!isAdmin) {
        query = query.eq('assigned_to', user?.id ?? '');
      }
      const { data: taskData, error } = await query;
      if (error) throw error;

      // Employees for name mapping and form
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, department')
        .eq('is_approved', true);

      const empList = (profiles || []).filter((p) => !(p as any).archived);
      setEmployees(empList);

      const nameMap: Record<string, string> = {};
      const deptMap: Record<string, string | null> = {};
      empList.forEach((p) => {
        nameMap[p.user_id] = p.full_name;
        deptMap[p.user_id] = p.department;
      });

      // Check overdue tasks
      const today = new Date().toISOString().split('T')[0];

      const enriched: Task[] = (taskData || []).map((t) => {
        let status = t.status as Task['status'];
        // Auto-mark overdue
        if (t.due_date && t.due_date < today && status !== 'completed') {
          status = 'overdue';
        }
        return {
          ...t,
          status,
          priority: t.priority as Task['priority'],
          assigned_to_name: nameMap[t.assigned_to] ?? 'Inconnu',
          assigned_by_name: nameMap[t.assigned_by] ?? 'Inconnu',
          department: deptMap[t.assigned_to] ?? null,
        };
      });

      setTasks(enriched);
    } catch (err: any) {
      toast({ title: 'Erreur', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user?.id, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ---------------------------------------------------------------- */
  /*  Create / Edit task                                               */
  /* ---------------------------------------------------------------- */
  const openNew = () => {
    setEditingTask(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (task: Task) => {
    setEditingTask(task);
    setForm({
      title: task.title,
      description: task.description || '',
      assigned_to: task.assigned_to,
      priority: task.priority,
      due_date: task.due_date || '',
      category: task.category || '',
    });
    setFormOpen(true);
  };

  const handleSaveTask = async () => {
    if (!form.title.trim()) {
      toast({ title: 'Titre requis', variant: 'destructive' });
      return;
    }
    if (!form.assigned_to) {
      toast({ title: 'Employé requis', description: 'Sélectionnez un employé.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (editingTask) {
        const { error } = await supabase
          .from('tasks')
          .update({
            title: form.title.trim(),
            description: form.description.trim() || null,
            assigned_to: form.assigned_to,
            priority: form.priority,
            due_date: form.due_date || null,
            category: form.category.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingTask.id);
        if (error) throw error;
        toast({ title: '✅ Mission modifiée' });
      } else {
        const { error } = await supabase.from('tasks').insert({
          title: form.title.trim(),
          description: form.description.trim() || null,
          assigned_to: form.assigned_to,
          assigned_by: user!.id,
          priority: form.priority,
          due_date: form.due_date || null,
          category: form.category.trim() || null,
        });
        if (error) throw error;
        toast({ title: '✅ Mission créée', description: `Mission attribuée avec succès.` });
      }
      setFormOpen(false);
      fetchData();
    } catch (err: any) {
      toast({ title: 'Erreur', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Update progress (employee)                                       */
  /* ---------------------------------------------------------------- */
  const openProgress = (task: Task) => {
    setProgressTarget(task);
    setProgressValue(task.progress);
    setProgressNote(task.completion_note || '');
  };

  const handleUpdateProgress = async () => {
    if (!progressTarget) return;
    setUpdatingProgress(true);
    try {
      const isComplete = progressValue === 100;
      const updates: any = {
        progress: progressValue,
        completion_note: progressNote.trim() || null,
        updated_at: new Date().toISOString(),
      };

      if (isComplete) {
        updates.status = 'completed';
        updates.completed_at = new Date().toISOString();
      } else if (progressValue > 0 && progressTarget.status === 'pending') {
        updates.status = 'in_progress';
        if (!progressTarget.started_at) {
          updates.started_at = new Date().toISOString();
        }
      }

      const { error } = await supabase
        .from('tasks')
        .update(updates)
        .eq('id', progressTarget.id);
      if (error) throw error;

      toast({
        title: isComplete ? '✅ Tâche terminée !' : '✅ Progression mise à jour',
        description: `${progressValue}% — ${progressTarget.title}`,
      });
      setProgressTarget(null);
      setProgressNote('');
      fetchData();
    } catch (err: any) {
      toast({ title: 'Erreur', description: err.message, variant: 'destructive' });
    } finally {
      setUpdatingProgress(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Delete task                                                      */
  /* ---------------------------------------------------------------- */
  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from('tasks').delete().eq('id', deleteTarget.id);
    if (error) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: '✅ Mission supprimée' });
      fetchData();
    }
    setDeleteTarget(null);
  };

  /* ---------------------------------------------------------------- */
  /*  Filters                                                          */
  /* ---------------------------------------------------------------- */
  const filtered = tasks.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (
        !t.title.toLowerCase().includes(s) &&
        !(t.assigned_to_name || '').toLowerCase().includes(s) &&
        !(t.category || '').toLowerCase().includes(s)
      ) return false;
    }
    return true;
  });

  // Stats
  const totalTasks = tasks.length;
  const pendingTasks = tasks.filter((t) => t.status === 'pending').length;
  const inProgressTasks = tasks.filter((t) => t.status === 'in_progress').length;
  const completedTasks = tasks.filter((t) => t.status === 'completed').length;
  const overdueTasks = tasks.filter((t) => t.status === 'overdue').length;
  const avgProgress = tasks.length > 0 ? Math.round(tasks.reduce((s, t) => s + t.progress, 0) / tasks.length) : 0;

  // Group tasks by status for board view
  const boardColumns: { key: Task['status']; label: string; color: string; tasks: Task[] }[] = [
    { key: 'pending', label: 'En attente', color: 'border-t-muted-foreground', tasks: filtered.filter((t) => t.status === 'pending') },
    { key: 'in_progress', label: 'En cours', color: 'border-t-blue-500', tasks: filtered.filter((t) => t.status === 'in_progress') },
    { key: 'overdue', label: 'En retard', color: 'border-t-destructive', tasks: filtered.filter((t) => t.status === 'overdue') },
    { key: 'completed', label: 'Terminées', color: 'border-t-green-500', tasks: filtered.filter((t) => t.status === 'completed') },
  ];

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display font-bold flex items-center gap-2">
              <ClipboardList className="h-6 w-6" />
              {isAdmin ? 'Gestion des Missions' : 'Mes Missions'}
            </h1>
            <p className="text-muted-foreground mt-1">
              {isAdmin
                ? 'Attribuer et suivre les missions des employés'
                : 'Consultez et suivez vos missions en entreprise'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex border rounded-lg overflow-hidden">
              <Button
                size="sm"
                variant={viewMode === 'board' ? 'default' : 'ghost'}
                onClick={() => setViewMode('board')}
                className="rounded-none"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                onClick={() => setViewMode('list')}
                className="rounded-none"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
            {isAdmin && (
              <Button onClick={openNew}>
                <Plus className="h-4 w-4 mr-2" />
                Nouvelle mission
              </Button>
            )}
          </div>
        </div>

        {/* Employee personal stats */}
        {!isAdmin && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Target className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Missions assignées</p>
                  <p className="text-xl font-bold font-display">{totalTasks}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/10 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Terminées</p>
                  <p className="text-xl font-bold font-display text-green-600">{completedTasks}</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-500/10 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Progression moy.</p>
                  <p className="text-xl font-bold font-display text-orange-600">{avgProgress}%</p>
                </div>
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-destructive/10 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">En retard</p>
                  <p className="text-xl font-bold font-display text-destructive">{overdueTasks}</p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* Admin stats cards */}
        {isAdmin && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { label: 'Total', value: totalTasks, color: 'text-foreground' },
              { label: 'En attente', value: pendingTasks, color: 'text-muted-foreground' },
              { label: 'En cours', value: inProgressTasks, color: 'text-blue-600' },
              { label: 'Terminées', value: completedTasks, color: 'text-green-600' },
              { label: 'En retard', value: overdueTasks, color: 'text-destructive' },
            ].map((s) => (
              <Card key={s.label} className="p-3 text-center">
                <p className="text-xs text-muted-foreground">{s.label}</p>
                <p className={`text-2xl font-bold font-display ${s.color}`}>{s.value}</p>
              </Card>
            ))}
          </div>
        )}

        {/* Global progress bar for employee */}
        {!isAdmin && totalTasks > 0 && (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Progression globale</span>
              <span className="text-sm font-bold text-primary">{avgProgress}%</span>
            </div>
            <Progress value={avgProgress} className="h-3" />
            <p className="text-xs text-muted-foreground mt-2">
              {completedTasks} sur {totalTasks} missions terminées
            </p>
          </Card>
        )}

        {/* Filters */}
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Rechercher…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Statut" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous statuts</SelectItem>
                <SelectItem value="pending">En attente</SelectItem>
                <SelectItem value="in_progress">En cours</SelectItem>
                <SelectItem value="completed">Terminées</SelectItem>
                <SelectItem value="overdue">En retard</SelectItem>
              </SelectContent>
            </Select>
            <Select value={priorityFilter} onValueChange={setPriorityFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Priorité" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes priorités</SelectItem>
                <SelectItem value="low">Basse</SelectItem>
                <SelectItem value="medium">Moyenne</SelectItem>
                <SelectItem value="high">Haute</SelectItem>
                <SelectItem value="urgent">Urgente</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>

        {/* ===== BOARD VIEW (Kanban) ===== */}
        {viewMode === 'board' && (
          loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : filtered.length === 0 ? (
            <Card className="py-12 text-center">
              <ClipboardList className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground font-medium">Aucune mission trouvée</p>
              <p className="text-xs text-muted-foreground/70 mt-1">
                {isAdmin ? 'Créez une mission pour commencer' : 'Aucune mission ne vous a été assignée pour le moment'}
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {boardColumns.map((col) => (
                <div key={col.key} className={`space-y-3 border-t-4 ${col.color} rounded-lg`}>
                  <div className="flex items-center justify-between px-2 pt-3">
                    <h3 className="text-sm font-semibold">{col.label}</h3>
                    <Badge variant="secondary" className="text-xs">{col.tasks.length}</Badge>
                  </div>
                  <div className="space-y-2 px-1 pb-2 min-h-[100px]">
                    {col.tasks.map((task) => {
                      const pc = priorityConfig[task.priority];
                      return (
                        <Card
                          key={task.id}
                          className="p-3 cursor-pointer hover:shadow-md transition-shadow"
                          onClick={() => setDetailTarget(task)}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <p className="font-medium text-sm leading-tight">{task.title}</p>
                            <Badge variant={pc.variant} className="text-[10px] shrink-0">{pc.label}</Badge>
                          </div>
                          {task.category && (
                            <Badge variant="outline" className="text-[10px] mb-2">{task.category}</Badge>
                          )}
                          {task.description && (
                            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{task.description}</p>
                          )}
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  task.progress === 100 ? 'bg-green-500' : task.progress > 50 ? 'bg-blue-500' : task.progress > 0 ? 'bg-orange-500' : 'bg-muted'
                                }`}
                                style={{ width: `${task.progress}%` }}
                              />
                            </div>
                            <span className="text-[10px] font-medium">{task.progress}%</span>
                          </div>
                          <div className="flex items-center justify-between mt-2">
                            <div className="flex items-center gap-1.5">
                              {task.due_date && (
                                <span className={`text-[10px] flex items-center gap-0.5 ${task.status === 'overdue' ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                                  <CalendarDays className="h-3 w-3" />
                                  {fmtDate(task.due_date)}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              {task.status !== 'completed' && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0 text-blue-600"
                                  title="Mettre à jour"
                                  onClick={(e) => { e.stopPropagation(); openProgress(task); }}
                                >
                                  <Play className="h-3 w-3" />
                                </Button>
                              )}
                              {isAdmin && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0"
                                  title="Modifier"
                                  onClick={(e) => { e.stopPropagation(); openEdit(task); }}
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
                              )}
                            </div>
                          </div>
                          {isAdmin && task.assigned_to_name && (
                            <div className="flex items-center gap-1 mt-1.5 text-[10px] text-muted-foreground">
                              <User className="h-3 w-3" />
                              {task.assigned_to_name}
                            </div>
                          )}
                        </Card>
                      );
                    })}
                    {col.tasks.length === 0 && (
                      <p className="text-xs text-muted-foreground/50 text-center py-4">Aucune mission</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        )}

        {/* ===== LIST VIEW (Table) ===== */}
        {viewMode === 'list' && (
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Mission</TableHead>
                  {isAdmin && <TableHead>Employé</TableHead>}
                  <TableHead>Priorité</TableHead>
                  <TableHead>Échéance</TableHead>
                  <TableHead>Progression</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 7 : 6} className="text-center py-8 text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
                      Chargement…
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 7 : 6} className="text-center py-12">
                      <ClipboardList className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                      <p className="text-muted-foreground font-medium">Aucune mission trouvée</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">
                        {search ? 'Essayez avec un autre terme de recherche' : isAdmin ? 'Créez une mission pour commencer' : 'Aucune mission assignée'}
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((task) => {
                    const sc = statusConfig[task.status];
                    const pc = priorityConfig[task.priority];
                    const StatusIcon = sc.icon;
                    return (
                      <TableRow key={task.id} className={task.status === 'overdue' ? 'bg-destructive/5' : ''}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{task.title}</p>
                            {task.category && (
                              <p className="text-xs text-muted-foreground">{task.category}</p>
                            )}
                          </div>
                        </TableCell>
                        {isAdmin && (
                          <TableCell>
                            <p className="text-sm">{task.assigned_to_name}</p>
                            {task.department && (
                              <p className="text-xs text-muted-foreground">{task.department}</p>
                            )}
                          </TableCell>
                        )}
                        <TableCell>
                          <Badge variant={pc.variant} className="text-xs">{pc.label}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {task.due_date ? (
                            <span className={task.status === 'overdue' ? 'text-destructive font-medium' : ''}>
                              {fmtDate(task.due_date)}
                            </span>
                          ) : '—'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 min-w-[120px]">
                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all ${
                                  task.progress === 100
                                    ? 'bg-green-500'
                                    : task.progress > 50
                                      ? 'bg-blue-500'
                                      : task.progress > 0
                                        ? 'bg-orange-500'
                                        : 'bg-muted'
                                }`}
                                style={{ width: `${task.progress}%` }}
                              />
                            </div>
                            <span className="text-xs font-medium w-8 text-right">{task.progress}%</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={sc.variant} className="gap-1">
                            <StatusIcon className="h-3 w-3" />
                            {sc.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="ghost" title="Détails" onClick={() => setDetailTarget(task)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                            {task.status !== 'completed' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Mettre à jour"
                                className="text-blue-600"
                                onClick={() => openProgress(task)}
                              >
                                <Play className="h-4 w-4" />
                              </Button>
                            )}
                            {isAdmin && (
                              <>
                                <Button size="sm" variant="ghost" title="Modifier" onClick={() => openEdit(task)}>
                                  <Pencil className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  title="Supprimer"
                                  className="text-destructive"
                                  onClick={() => setDeleteTarget(task)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
        )}
      </div>

      {/* ============================================================ */}
      {/*  NEW / EDIT TASK DIALOG                                      */}
      {/* ============================================================ */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingTask ? 'Modifier la mission' : 'Nouvelle mission'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Titre de la mission</Label>
              <Input
                className="mt-1"
                placeholder="Ex: Préparer le rapport mensuel"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                className="mt-1"
                rows={3}
                placeholder="Détails de la mission…"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Attribuer à</Label>
                <Select value={form.assigned_to} onValueChange={(v) => setForm({ ...form, assigned_to: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Choisir un employé…" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((emp) => (
                      <SelectItem key={emp.user_id} value={emp.user_id}>
                        <span>{emp.full_name}</span>
                        {emp.department && (
                          <span className="text-muted-foreground text-xs ml-1">({emp.department})</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priorité</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as TaskForm['priority'] })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Basse</SelectItem>
                    <SelectItem value="medium">Moyenne</SelectItem>
                    <SelectItem value="high">Haute</SelectItem>
                    <SelectItem value="urgent">Urgente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date d'échéance</Label>
                <Input
                  type="date"
                  className="mt-1"
                  value={form.due_date}
                  onChange={(e) => setForm({ ...form, due_date: e.target.value })}
                />
              </div>
              <div>
                <Label>Catégorie</Label>
                <Input
                  className="mt-1"
                  placeholder="Ex: Administration, Projet…"
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Annuler</Button>
            <Button onClick={handleSaveTask} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingTask ? 'Modifier' : 'Créer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/*  PROGRESS UPDATE DIALOG                                      */}
      {/* ============================================================ */}
      <Dialog open={!!progressTarget} onOpenChange={(open) => { if (!open) setProgressTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Mettre à jour la progression</DialogTitle>
          </DialogHeader>
          {progressTarget && (
            <div className="space-y-4 py-2">
              <div className="p-3 bg-muted rounded">
                <p className="font-medium text-sm">{progressTarget.title}</p>
                {progressTarget.description && (
                  <p className="text-xs text-muted-foreground mt-1">{progressTarget.description}</p>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Progression</Label>
                  <span className={`text-lg font-bold ${progressValue === 100 ? 'text-green-600' : 'text-primary'}`}>
                    {progressValue}%
                  </span>
                </div>
                <Slider
                  value={[progressValue]}
                  onValueChange={([v]) => setProgressValue(v)}
                  max={100}
                  step={5}
                  className="mt-2"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>0%</span>
                  <span>50%</span>
                  <span>100%</span>
                </div>
              </div>
              <div>
                <Label>Compte-rendu / Note</Label>
                <Textarea
                  className="mt-1"
                  rows={3}
                  placeholder="Décrivez l'avancement de votre travail…"
                  value={progressNote}
                  onChange={(e) => setProgressNote(e.target.value)}
                />
              </div>
              {progressValue === 100 && (
                <p className="text-sm text-green-600 font-medium">
                  ✅ La tâche sera marquée comme terminée
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setProgressTarget(null)}>Annuler</Button>
            <Button onClick={handleUpdateProgress} disabled={updatingProgress}>
              {updatingProgress ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/*  DETAIL DIALOG                                               */}
      {/* ============================================================ */}
      <Dialog open={!!detailTarget} onOpenChange={(open) => { if (!open) setDetailTarget(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Détails de la mission</DialogTitle>
          </DialogHeader>
          {detailTarget && (
            <div className="space-y-3 py-2 text-sm">
              <div>
                <p className="font-semibold text-base">{detailTarget.title}</p>
                {detailTarget.category && (
                  <Badge variant="outline" className="mt-1">{detailTarget.category}</Badge>
                )}
              </div>
              {detailTarget.description && (
                <div className="p-3 bg-muted rounded text-sm">{detailTarget.description}</div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-muted-foreground">Assignée à</span>
                  <p className="font-medium">{detailTarget.assigned_to_name}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Assignée par</span>
                  <p className="font-medium">{detailTarget.assigned_by_name}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-muted-foreground">Priorité</span>
                  <div className="mt-1">
                    <Badge variant={priorityConfig[detailTarget.priority].variant}>
                      {priorityConfig[detailTarget.priority].label}
                    </Badge>
                  </div>
                </div>
                <div>
                  <span className="text-muted-foreground">Statut</span>
                  <div className="mt-1">
                    <Badge variant={statusConfig[detailTarget.status].variant}>
                      {statusConfig[detailTarget.status].label}
                    </Badge>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-muted-foreground">Échéance</span>
                  <p className="font-medium">{fmtDate(detailTarget.due_date)}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Progression</span>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          detailTarget.progress === 100 ? 'bg-green-500' : 'bg-blue-500'
                        }`}
                        style={{ width: `${detailTarget.progress}%` }}
                      />
                    </div>
                    <span className="font-bold">{detailTarget.progress}%</span>
                  </div>
                </div>
              </div>
              {detailTarget.completion_note && (
                <div>
                  <span className="text-muted-foreground">Compte-rendu</span>
                  <div className="mt-1 p-3 bg-muted rounded text-sm">{detailTarget.completion_note}</div>
                </div>
              )}
              <div className="flex justify-between text-xs text-muted-foreground pt-2 border-t">
                <span>Créée le {fmtDate(detailTarget.created_at)}</span>
                {detailTarget.started_at && <span>Démarrée le {fmtDate(detailTarget.started_at)}</span>}
                {detailTarget.completed_at && <span>Terminée le {fmtDate(detailTarget.completed_at)}</span>}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailTarget(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/*  DELETE DIALOG                                               */}
      {/* ============================================================ */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette mission ?</AlertDialogTitle>
            <AlertDialogDescription>
              La mission <strong>"{deleteTarget?.title}"</strong> sera définitivement supprimée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
