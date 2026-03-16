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
  MessageSquare,
  Send,
  ListChecks,
  X,
  Square,
  CheckSquare,
  Timer,
  ArrowRight,
  Filter,
  Globe,
  Zap,
  Hash,
  Repeat,
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
  account_id: string | null;
  daily_target: number | null;
  daily_achieved: number;
  is_recurring: boolean;
  recurrence: string | null;
  created_at: string;
  updated_at: string;
  // joined
  assigned_to_name?: string;
  assigned_by_name?: string;
  department?: string | null;
  account_name?: string | null;
  account_platform?: string | null;
}

interface TaskForm {
  title: string;
  description: string;
  assigned_to: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date: string;
  category: string;
  account_id: string;
  daily_target: string;
  is_recurring: boolean;
  recurrence: string;
}

interface EmployeeOption {
  user_id: string;
  full_name: string;
  department: string | null;
  position: string | null;
}

interface TaskComment {
  id: string;
  task_id: string;
  user_id: string;
  content: string;
  created_at: string;
  user_name?: string;
}

interface ChecklistItem {
  id: string;
  task_id: string;
  label: string;
  is_done: boolean;
  sort_order: number;
}

interface ManagedAccount {
  id: string;
  name: string;
  platform: string;
  url: string | null;
  description: string | null;
  assigned_to: string;
  created_by: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  assigned_to_name?: string;
}

interface TaskTemplate {
  id: string;
  title: string;
  description: string | null;
  position: string;
  default_priority: string;
  default_category: string | null;
  daily_target: number | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
}

const emptyForm: TaskForm = {
  title: '',
  description: '',
  assigned_to: '',
  priority: 'medium',
  due_date: '',
  category: '',
  account_id: '',
  daily_target: '',
  is_recurring: false,
  recurrence: '',
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

const platformLabels: Record<string, { label: string; emoji: string }> = {
  facebook:  { label: 'Facebook',  emoji: '📘' },
  instagram: { label: 'Instagram', emoji: '📷' },
  tiktok:    { label: 'TikTok',    emoji: '🎵' },
  linkedin:  { label: 'LinkedIn',  emoji: '💼' },
  twitter:   { label: 'X/Twitter', emoji: '🐦' },
  youtube:   { label: 'YouTube',   emoji: '🎬' },
  website:   { label: 'Site web',  emoji: '🌐' },
  autre:     { label: 'Autre',     emoji: '📌' },
};

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

function deadlineLabel(dueDate: string | null, status: string): { text: string; className: string } | null {
  if (!dueDate || status === 'completed') return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((due.getTime() - now.getTime()) / (86400000));
  if (diffDays < 0) return { text: `${Math.abs(diffDays)}j de retard`, className: 'text-destructive font-semibold' };
  if (diffDays === 0) return { text: "Aujourd'hui", className: 'text-orange-600 font-semibold' };
  if (diffDays === 1) return { text: 'Demain', className: 'text-orange-500' };
  if (diffDays <= 3) return { text: `Dans ${diffDays}j`, className: 'text-yellow-600' };
  return { text: `Dans ${diffDays}j`, className: 'text-muted-foreground' };
}

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

  // Managed accounts
  const [accounts, setAccounts] = useState<ManagedAccount[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);

  // Main page tab (admin: missions | comptes | modèles)
  const [mainTab, setMainTab] = useState<string>('missions');

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

  // Comments
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [commentText, setCommentText] = useState('');
  const [loadingComments, setLoadingComments] = useState(false);
  const [sendingComment, setSendingComment] = useState(false);

  // Checklist
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [newCheckItem, setNewCheckItem] = useState('');
  const [loadingChecklist, setLoadingChecklist] = useState(false);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'board'>(isAdmin ? 'list' : 'board');

  // Account CRUD dialog
  const [accountFormOpen, setAccountFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<ManagedAccount | null>(null);
  const [accountForm, setAccountForm] = useState({ name: '', platform: 'facebook', url: '', description: '', assigned_to: '' });
  const [savingAccount, setSavingAccount] = useState(false);
  const [deleteAccountTarget, setDeleteAccountTarget] = useState<ManagedAccount | null>(null);

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
        .select('user_id, full_name, department, position')
        .eq('is_approved', true);

      const empList: EmployeeOption[] = (profiles || []).filter((p) => !(p as Record<string, unknown>).archived);
      setEmployees(empList);

      const nameMap: Record<string, string> = {};
      const deptMap: Record<string, string | null> = {};
      empList.forEach((p) => {
        nameMap[p.user_id] = p.full_name;
        deptMap[p.user_id] = p.department;
      });

      // Managed accounts
      const { data: acctData } = isAdmin
        ? await supabase.from('managed_accounts').select('*').order('created_at', { ascending: false })
        : await supabase.from('managed_accounts').select('*').eq('assigned_to', user?.id ?? '').order('created_at', { ascending: false });
      const accts: ManagedAccount[] = (acctData || []).map((a) => ({
        ...a,
        assigned_to_name: nameMap[a.assigned_to] ?? 'Inconnu',
      }));
      setAccounts(accts);

      const acctMap: Record<string, ManagedAccount> = {};
      accts.forEach((a) => { acctMap[a.id] = a; });

      // Task templates
      const { data: tmplData } = await supabase.from('task_templates').select('*').eq('is_active', true).order('position');
      setTemplates(tmplData || []);

      // Check overdue tasks
      const today = new Date().toISOString().split('T')[0];

      const enriched: Task[] = (taskData || []).map((t) => {
        let status = t.status as Task['status'];
        if (t.due_date && t.due_date < today && status !== 'completed') {
          status = 'overdue';
        }
        const acct = t.account_id ? acctMap[t.account_id] : null;
        return {
          ...t,
          status,
          priority: t.priority as Task['priority'],
          assigned_to_name: nameMap[t.assigned_to] ?? 'Inconnu',
          assigned_by_name: nameMap[t.assigned_by] ?? 'Inconnu',
          department: deptMap[t.assigned_to] ?? null,
          account_name: acct?.name ?? null,
          account_platform: acct?.platform ?? null,
        };
      });

      setTasks(enriched);
    } catch (err: unknown) {
      toast({ title: 'Erreur', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user?.id, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ---------------------------------------------------------------- */
  /*  Comments                                                         */
  /* ---------------------------------------------------------------- */
  const fetchComments = useCallback(async (taskId: string) => {
    setLoadingComments(true);
    const { data } = await supabase
      .from('task_comments')
      .select('*')
      .eq('task_id', taskId)
      .order('created_at', { ascending: true });
    if (data) {
      const userIds = [...new Set(data.map((c) => c.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name')
        .in('user_id', userIds);
      const nameMap: Record<string, string> = {};
      profiles?.forEach((p) => { nameMap[p.user_id] = p.full_name; });
      setComments(data.map((c) => ({ ...c, user_name: nameMap[c.user_id] || 'Inconnu' })));
    }
    setLoadingComments(false);
  }, []);

  const handleSendComment = async (taskId: string) => {
    if (!commentText.trim() || !user) return;
    setSendingComment(true);
    const { error } = await supabase.from('task_comments').insert({
      task_id: taskId,
      user_id: user.id,
      content: commentText.trim(),
    });
    if (error) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } else {
      setCommentText('');
      fetchComments(taskId);
    }
    setSendingComment(false);
  };

  /* ---------------------------------------------------------------- */
  /*  Checklist                                                        */
  /* ---------------------------------------------------------------- */
  const fetchChecklist = useCallback(async (taskId: string) => {
    setLoadingChecklist(true);
    const { data } = await supabase
      .from('task_checklist')
      .select('*')
      .eq('task_id', taskId)
      .order('sort_order', { ascending: true });
    if (data) setChecklist(data);
    setLoadingChecklist(false);
  }, []);

  const handleToggleCheckItem = async (item: ChecklistItem) => {
    const { error } = await supabase
      .from('task_checklist')
      .update({ is_done: !item.is_done })
      .eq('id', item.id);
    if (!error) {
      setChecklist((prev) => prev.map((c) => c.id === item.id ? { ...c, is_done: !c.is_done } : c));
    }
  };

  const handleAddCheckItem = async (taskId: string) => {
    if (!newCheckItem.trim()) return;
    const { error } = await supabase.from('task_checklist').insert({
      task_id: taskId,
      label: newCheckItem.trim(),
      sort_order: checklist.length,
    });
    if (error) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } else {
      setNewCheckItem('');
      fetchChecklist(taskId);
    }
  };

  const handleDeleteCheckItem = async (itemId: string, taskId: string) => {
    await supabase.from('task_checklist').delete().eq('id', itemId);
    fetchChecklist(taskId);
  };

  useEffect(() => {
    if (detailTarget) {
      fetchComments(detailTarget.id);
      fetchChecklist(detailTarget.id);
      setCommentText('');
      setNewCheckItem('');
    } else {
      setComments([]);
      setChecklist([]);
    }
  }, [detailTarget, fetchComments, fetchChecklist]);

  /* ---------------------------------------------------------------- */
  /*  Start mission (employee shortcut)                                */
  /* ---------------------------------------------------------------- */
  const handleStartMission = async (task: Task) => {
    if (task.status !== 'pending') return;
    const { error } = await supabase
      .from('tasks')
      .update({
        status: 'in_progress',
        started_at: new Date().toISOString(),
        progress: Math.max(task.progress, 5),
        updated_at: new Date().toISOString(),
      })
      .eq('id', task.id);
    if (error) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: '🚀 Mission démarrée', description: task.title });
      fetchData();
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Daily achieved increment (employee)                              */
  /* ---------------------------------------------------------------- */
  const handleIncrementDaily = async (task: Task) => {
    if (!task.daily_target) return;
    const newVal = Math.min(task.daily_achieved + 1, task.daily_target);
    const updates: Record<string, unknown> = {
      daily_achieved: newVal,
      updated_at: new Date().toISOString(),
    };
    // Auto-update progress based on daily achievement
    if (task.daily_target > 0) {
      updates.progress = Math.min(100, Math.round((newVal / task.daily_target) * 100));
      if (newVal >= task.daily_target) {
        updates.status = 'completed';
        updates.completed_at = new Date().toISOString();
      } else if (task.status === 'pending') {
        updates.status = 'in_progress';
        if (!task.started_at) updates.started_at = new Date().toISOString();
      }
    }
    const { error } = await supabase.from('tasks').update(updates).eq('id', task.id);
    if (error) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } else {
      toast({
        title: newVal >= task.daily_target ? '✅ Objectif atteint !' : `📈 ${newVal}/${task.daily_target}`,
        description: task.title,
      });
      fetchData();
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Create / Edit task                                               */
  /* ---------------------------------------------------------------- */
  const openNew = () => {
    setEditingTask(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openNewFromTemplate = (tmpl: TaskTemplate, employeeId?: string) => {
    setEditingTask(null);
    setForm({
      title: tmpl.title,
      description: tmpl.description || '',
      assigned_to: employeeId || '',
      priority: tmpl.default_priority as TaskForm['priority'],
      due_date: new Date().toISOString().split('T')[0],
      category: tmpl.default_category || '',
      account_id: '',
      daily_target: tmpl.daily_target?.toString() || '',
      is_recurring: false,
      recurrence: '',
    });
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
      account_id: task.account_id || '',
      daily_target: task.daily_target?.toString() || '',
      is_recurring: task.is_recurring,
      recurrence: task.recurrence || '',
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
      const base = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        assigned_to: form.assigned_to,
        priority: form.priority,
        due_date: form.due_date || null,
        category: form.category.trim() || null,
        account_id: form.account_id || null,
        daily_target: form.daily_target ? parseInt(form.daily_target) : null,
        is_recurring: form.is_recurring,
        recurrence: form.is_recurring && form.recurrence ? form.recurrence : null,
        updated_at: new Date().toISOString(),
      };
      if (editingTask) {
        const { error } = await supabase.from('tasks').update(base).eq('id', editingTask.id);
        if (error) throw error;
        toast({ title: '✅ Mission modifiée' });
      } else {
        const { error } = await supabase.from('tasks').insert({ ...base, assigned_by: user!.id });
        if (error) throw error;
        toast({ title: '✅ Mission créée', description: 'Mission attribuée avec succès.' });
      }
      setFormOpen(false);
      fetchData();
    } catch (err: unknown) {
      toast({ title: 'Erreur', description: (err as Error).message, variant: 'destructive' });
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
      const updates: Record<string, unknown> = {
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
    } catch (err: unknown) {
      toast({ title: 'Erreur', description: (err as Error).message, variant: 'destructive' });
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
  /*  Managed Account CRUD                                             */
  /* ---------------------------------------------------------------- */
  const openNewAccount = () => {
    setEditingAccount(null);
    setAccountForm({ name: '', platform: 'facebook', url: '', description: '', assigned_to: '' });
    setAccountFormOpen(true);
  };

  const openEditAccount = (acct: ManagedAccount) => {
    setEditingAccount(acct);
    setAccountForm({
      name: acct.name,
      platform: acct.platform,
      url: acct.url || '',
      description: acct.description || '',
      assigned_to: acct.assigned_to,
    });
    setAccountFormOpen(true);
  };

  const handleSaveAccount = async () => {
    if (!accountForm.name.trim() || !accountForm.assigned_to) {
      toast({ title: 'Nom et employé requis', variant: 'destructive' });
      return;
    }
    setSavingAccount(true);
    try {
      if (editingAccount) {
        const { error } = await supabase.from('managed_accounts').update({
          name: accountForm.name.trim(),
          platform: accountForm.platform,
          url: accountForm.url.trim() || null,
          description: accountForm.description.trim() || null,
          assigned_to: accountForm.assigned_to,
          updated_at: new Date().toISOString(),
        }).eq('id', editingAccount.id);
        if (error) throw error;
        toast({ title: '✅ Compte modifié' });
      } else {
        const { error } = await supabase.from('managed_accounts').insert({
          name: accountForm.name.trim(),
          platform: accountForm.platform,
          url: accountForm.url.trim() || null,
          description: accountForm.description.trim() || null,
          assigned_to: accountForm.assigned_to,
          created_by: user!.id,
        });
        if (error) throw error;
        toast({ title: '✅ Compte ajouté' });
      }
      setAccountFormOpen(false);
      fetchData();
    } catch (err: unknown) {
      toast({ title: 'Erreur', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setSavingAccount(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deleteAccountTarget) return;
    const { error } = await supabase.from('managed_accounts').delete().eq('id', deleteAccountTarget.id);
    if (error) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: '✅ Compte supprimé' });
      fetchData();
    }
    setDeleteAccountTarget(null);
  };

  /* ---------------------------------------------------------------- */
  /*  Filters                                                          */
  /* ---------------------------------------------------------------- */
  const filtered = tasks.filter((t) => {
    if (statusFilter !== 'all' && t.status !== statusFilter) return false;
    if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
    if (employeeFilter !== 'all' && t.assigned_to !== employeeFilter) return false;
    if (accountFilter !== 'all' && t.account_id !== accountFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      if (
        !t.title.toLowerCase().includes(s) &&
        !(t.assigned_to_name || '').toLowerCase().includes(s) &&
        !(t.category || '').toLowerCase().includes(s) &&
        !(t.description || '').toLowerCase().includes(s) &&
        !(t.account_name || '').toLowerCase().includes(s)
      ) return false;
    }
    return true;
  });

  const categories = [...new Set(tasks.map((t) => t.category).filter(Boolean))] as string[];

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

  // Accounts that belong to the selected employee (for task form)
  const accountsForEmployee = form.assigned_to
    ? accounts.filter((a) => a.assigned_to === form.assigned_to && a.is_active)
    : [];

  // Templates grouped by position
  const templatesByPosition = templates.reduce<Record<string, TaskTemplate[]>>((acc, t) => {
    if (!acc[t.position]) acc[t.position] = [];
    acc[t.position].push(t);
    return acc;
  }, {});

  /* ---------------------------------------------------------------- */
  /*  Render helper: daily target badge                                */
  /* ---------------------------------------------------------------- */
  const DailyTargetBadge = ({ task }: { task: Task }) => {
    if (!task.daily_target) return null;
    const pct = Math.round((task.daily_achieved / task.daily_target) * 100);
    const done = task.daily_achieved >= task.daily_target;
    return (
      <div className="flex items-center gap-1.5">
        <Badge variant={done ? 'outline' : 'secondary'} className={`text-[10px] gap-1 ${done ? 'text-green-600 border-green-300' : ''}`}>
          <Target className="h-3 w-3" />
          {task.daily_achieved}/{task.daily_target}
        </Badge>
      </div>
    );
  };

  const AccountBadge = ({ task }: { task: Task }) => {
    if (!task.account_name) return null;
    const pl = platformLabels[task.account_platform || 'autre'];
    return (
      <Badge variant="outline" className="text-[10px] gap-1">
        <span>{pl.emoji}</span>
        {task.account_name}
      </Badge>
    );
  };

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
            {mainTab === 'missions' && (
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
            )}
            {isAdmin && mainTab === 'missions' && (
              <Button onClick={openNew}>
                <Plus className="h-4 w-4 mr-2" />
                Nouvelle mission
              </Button>
            )}
            {isAdmin && mainTab === 'comptes' && (
              <Button onClick={openNewAccount}>
                <Plus className="h-4 w-4 mr-2" />
                Nouveau compte
              </Button>
            )}
          </div>
        </div>

        {/* Admin tabs: Missions | Comptes gérés | Modèles */}
        {isAdmin && (
          <Tabs value={mainTab} onValueChange={setMainTab}>
            <TabsList>
              <TabsTrigger value="missions" className="gap-1.5">
                <ClipboardList className="h-4 w-4" />
                Missions
              </TabsTrigger>
              <TabsTrigger value="comptes" className="gap-1.5">
                <Globe className="h-4 w-4" />
                Comptes gérés
                {accounts.length > 0 && <Badge variant="secondary" className="text-[10px] ml-1">{accounts.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="modeles" className="gap-1.5">
                <Zap className="h-4 w-4" />
                Modèles rapides
              </TabsTrigger>
            </TabsList>

            {/* ===== COMPTES GÉRÉS TAB ===== */}
            <TabsContent value="comptes" className="space-y-4 mt-4">
              {accounts.length === 0 ? (
                <Card className="py-12 text-center">
                  <Globe className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground font-medium">Aucun compte géré</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Ajoutez des pages et comptes sociaux à gérer par vos employés
                  </p>
                  <Button className="mt-4" onClick={openNewAccount}>
                    <Plus className="h-4 w-4 mr-2" />
                    Ajouter un compte
                  </Button>
                </Card>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {accounts.map((acct) => {
                    const pl = platformLabels[acct.platform] || platformLabels.autre;
                    const acctTasks = tasks.filter((t) => t.account_id === acct.id);
                    const acctCompleted = acctTasks.filter((t) => t.status === 'completed').length;
                    return (
                      <Card key={acct.id} className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">{pl.emoji}</span>
                            <div>
                              <p className="font-semibold text-sm">{acct.name}</p>
                              <p className="text-xs text-muted-foreground">{pl.label}</p>
                            </div>
                          </div>
                          <div className="flex gap-1">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEditAccount(acct)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeleteAccountTarget(acct)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        {acct.url && (
                          <p className="text-xs text-blue-600 mt-1 truncate">{acct.url}</p>
                        )}
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs">{acct.assigned_to_name}</span>
                        </div>
                        {acctTasks.length > 0 && (
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-xs text-muted-foreground">{acctCompleted}/{acctTasks.length} missions terminées</span>
                          </div>
                        )}
                        {!acct.is_active && (
                          <Badge variant="outline" className="mt-2 text-xs text-orange-600">Inactif</Badge>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            {/* ===== MODÈLES RAPIDES TAB ===== */}
            <TabsContent value="modeles" className="space-y-4 mt-4">
              {Object.keys(templatesByPosition).length === 0 ? (
                <Card className="py-12 text-center">
                  <Zap className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                  <p className="text-muted-foreground font-medium">Aucun modèle disponible</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Les modèles de tâches seront créés automatiquement par poste
                  </p>
                </Card>
              ) : (
                Object.entries(templatesByPosition).map(([position, tmpls]) => (
                  <Card key={position}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Hash className="h-4 w-4" />
                        {position}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {tmpls.map((tmpl) => (
                          <div key={tmpl.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium">{tmpl.title}</p>
                              {tmpl.description && (
                                <p className="text-xs text-muted-foreground line-clamp-1">{tmpl.description}</p>
                              )}
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-[10px]">
                                  {priorityConfig[tmpl.default_priority]?.label || tmpl.default_priority}
                                </Badge>
                                {tmpl.daily_target && (
                                  <Badge variant="secondary" className="text-[10px] gap-1">
                                    <Target className="h-3 w-3" />
                                    {tmpl.daily_target}/jour
                                  </Badge>
                                )}
                                {tmpl.default_category && (
                                  <Badge variant="outline" className="text-[10px]">{tmpl.default_category}</Badge>
                                )}
                              </div>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => openNewFromTemplate(tmpl)}>
                              <Zap className="h-3.5 w-3.5 mr-1" />
                              Créer
                            </Button>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            {/* Missions tab content is rendered below (shared with employee view) */}
            <TabsContent value="missions" className="space-y-6 mt-0">
              {/* Rendered below via common code */}
            </TabsContent>
          </Tabs>
        )}

        {/* ===== MISSIONS CONTENT (shared between admin missions tab and employee view) ===== */}
        {(mainTab === 'missions' || !isAdmin) && (
          <>
            {/* Employee personal stats */}
            {!isAdmin && (
              <div className="space-y-4">
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
                {/* Employee managed accounts summary */}
                {accounts.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {accounts.map((acct) => {
                      const pl = platformLabels[acct.platform] || platformLabels.autre;
                      const acctTasks = tasks.filter((t) => t.account_id === acct.id);
                      const todayTarget = acctTasks.reduce((s, t) => s + (t.daily_target || 0), 0);
                      const todayDone = acctTasks.reduce((s, t) => s + t.daily_achieved, 0);
                      return (
                        <Card key={acct.id} className="p-3">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{pl.emoji}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{acct.name}</p>
                              <p className="text-xs text-muted-foreground">{pl.label}</p>
                            </div>
                            {todayTarget > 0 && (
                              <Badge variant={todayDone >= todayTarget ? 'outline' : 'secondary'} className={`text-xs ${todayDone >= todayTarget ? 'text-green-600 border-green-300' : ''}`}>
                                {todayDone}/{todayTarget}
                              </Badge>
                            )}
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                )}
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
                {isAdmin && (
                  <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder="Employé" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les employés</SelectItem>
                      {employees.map((emp) => (
                        <SelectItem key={emp.user_id} value={emp.user_id}>{emp.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {accounts.length > 0 && (
                  <Select value={accountFilter} onValueChange={setAccountFilter}>
                    <SelectTrigger className="w-44">
                      <SelectValue placeholder="Compte" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les comptes</SelectItem>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {(platformLabels[a.platform] || platformLabels.autre).emoji} {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              {categories.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t">
                  <span className="text-xs text-muted-foreground mr-1 self-center">Catégories:</span>
                  {categories.map((cat) => (
                    <Badge
                      key={cat}
                      variant={search === cat ? 'default' : 'outline'}
                      className="cursor-pointer text-xs"
                      onClick={() => setSearch(search === cat ? '' : cat)}
                    >
                      {cat}
                    </Badge>
                  ))}
                </div>
              )}
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
                          const dl = deadlineLabel(task.due_date, task.status);
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
                              <div className="flex flex-wrap gap-1 mb-2">
                                {task.category && (
                                  <Badge variant="outline" className="text-[10px]">{task.category}</Badge>
                                )}
                                <AccountBadge task={task} />
                              </div>
                              {task.description && (
                                <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{task.description}</p>
                              )}
                              {/* Daily target */}
                              {task.daily_target && task.daily_target > 0 && (
                                <div className="flex items-center justify-between mb-2">
                                  <DailyTargetBadge task={task} />
                                  {task.status !== 'completed' && !isAdmin && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 px-2 text-xs text-primary"
                                      onClick={(e) => { e.stopPropagation(); handleIncrementDaily(task); }}
                                    >
                                      +1
                                    </Button>
                                  )}
                                </div>
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
                                  {dl && (
                                    <span className={`text-[10px] flex items-center gap-0.5 ${dl.className}`}>
                                      <Timer className="h-3 w-3" />
                                      {dl.text}
                                    </span>
                                  )}
                                  {!dl && task.due_date && (
                                    <span className="text-[10px] flex items-center gap-0.5 text-muted-foreground">
                                      <CalendarDays className="h-3 w-3" />
                                      {fmtDate(task.due_date)}
                                    </span>
                                  )}
                                  {task.is_recurring && (
                                    <Repeat className="h-3 w-3 text-muted-foreground" />
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  {task.status === 'pending' && !isAdmin && (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 w-6 p-0 text-green-600"
                                      title="Démarrer la mission"
                                      onClick={(e) => { e.stopPropagation(); handleStartMission(task); }}
                                    >
                                      <ArrowRight className="h-3 w-3" />
                                    </Button>
                                  )}
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
                      <TableHead>Objectif</TableHead>
                      <TableHead>Progression</TableHead>
                      <TableHead>Statut</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={isAdmin ? 8 : 7} className="text-center py-8 text-muted-foreground">
                          <Loader2 className="h-5 w-5 animate-spin inline mr-2" />
                          Chargement…
                        </TableCell>
                      </TableRow>
                    ) : filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={isAdmin ? 8 : 7} className="text-center py-12">
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
                        const dl = deadlineLabel(task.due_date, task.status);
                        return (
                          <TableRow key={task.id} className={task.status === 'overdue' ? 'bg-destructive/5' : ''}>
                            <TableCell>
                              <div>
                                <p className="font-medium text-sm">{task.title}</p>
                                <div className="flex flex-wrap gap-1 mt-0.5">
                                  {task.category && (
                                    <span className="text-xs text-muted-foreground">{task.category}</span>
                                  )}
                                  {task.account_name && (
                                    <Badge variant="outline" className="text-[10px] gap-0.5">
                                      {(platformLabels[task.account_platform || 'autre']).emoji} {task.account_name}
                                    </Badge>
                                  )}
                                  {task.is_recurring && (
                                    <Badge variant="outline" className="text-[10px] gap-0.5">
                                      <Repeat className="h-3 w-3" />
                                      {task.recurrence === 'daily' ? 'Quotidien' : task.recurrence === 'weekly' ? 'Hebdo' : 'Mensuel'}
                                    </Badge>
                                  )}
                                </div>
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
                              {dl ? (
                                <span className={dl.className}>{dl.text}</span>
                              ) : task.due_date ? (
                                <span>{fmtDate(task.due_date)}</span>
                              ) : '—'}
                            </TableCell>
                            <TableCell>
                              {task.daily_target ? (
                                <div className="flex items-center gap-1.5">
                                  <Badge variant={task.daily_achieved >= task.daily_target ? 'outline' : 'secondary'} className={`text-xs gap-1 ${task.daily_achieved >= task.daily_target ? 'text-green-600 border-green-300' : ''}`}>
                                    <Target className="h-3 w-3" />
                                    {task.daily_achieved}/{task.daily_target}
                                  </Badge>
                                  {task.status !== 'completed' && !isAdmin && (
                                    <Button size="sm" variant="ghost" className="h-6 px-1.5 text-xs" onClick={() => handleIncrementDaily(task)}>
                                      +1
                                    </Button>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-muted-foreground">—</span>
                              )}
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
                                {task.status === 'pending' && !isAdmin && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    title="Démarrer"
                                    className="text-green-600"
                                    onClick={() => handleStartMission(task)}
                                  >
                                    <ArrowRight className="h-4 w-4" />
                                  </Button>
                                )}
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
          </>
        )}
      </div>

      {/* ============================================================ */}
      {/*  NEW / EDIT TASK DIALOG                                      */}
      {/* ============================================================ */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
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
                <Select value={form.assigned_to} onValueChange={(v) => setForm({ ...form, assigned_to: v, account_id: '' })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Choisir un employé…" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((emp) => (
                      <SelectItem key={emp.user_id} value={emp.user_id}>
                        <span>{emp.full_name}</span>
                        {emp.position && (
                          <span className="text-muted-foreground text-xs ml-1">({emp.position})</span>
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
            {/* Account link (only if employee has managed accounts) */}
            {accountsForEmployee.length > 0 && (
              <div>
                <Label>Compte / Page liée</Label>
                <Select value={form.account_id} onValueChange={(v) => setForm({ ...form, account_id: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Aucun compte lié" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Aucun</SelectItem>
                    {accountsForEmployee.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {(platformLabels[a.platform] || platformLabels.autre).emoji} {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {/* Daily target */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Objectif quotidien</Label>
                <Input
                  type="number"
                  min="0"
                  className="mt-1"
                  placeholder="Ex: 4"
                  value={form.daily_target}
                  onChange={(e) => setForm({ ...form, daily_target: e.target.value })}
                />
                <p className="text-[10px] text-muted-foreground mt-1">Nombre d'actions à réaliser par jour</p>
              </div>
              <div>
                <Label>Récurrence</Label>
                <Select value={form.is_recurring ? (form.recurrence || 'daily') : ''} onValueChange={(v) => {
                  if (v) {
                    setForm({ ...form, is_recurring: true, recurrence: v });
                  } else {
                    setForm({ ...form, is_recurring: false, recurrence: '' });
                  }
                }}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Non récurrente" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Non récurrente</SelectItem>
                    <SelectItem value="daily">Quotidienne</SelectItem>
                    <SelectItem value="weekly">Hebdomadaire</SelectItem>
                    <SelectItem value="monthly">Mensuelle</SelectItem>
                  </SelectContent>
                </Select>
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
      {/*  DETAIL DIALOG (enhanced with comments + checklist)          */}
      {/* ============================================================ */}
      <Dialog open={!!detailTarget} onOpenChange={(open) => { if (!open) setDetailTarget(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Détails de la mission</DialogTitle>
          </DialogHeader>
          {detailTarget && (
            <Tabs defaultValue="details" className="mt-2">
              <TabsList className="w-full grid grid-cols-3">
                <TabsTrigger value="details">Détails</TabsTrigger>
                <TabsTrigger value="checklist" className="gap-1.5">
                  <ListChecks className="h-3.5 w-3.5" />
                  Checklist
                  {checklist.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] ml-1">{checklist.filter(c => c.is_done).length}/{checklist.length}</Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="comments" className="gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5" />
                  Discussion
                  {comments.length > 0 && (
                    <Badge variant="secondary" className="text-[10px] ml-1">{comments.length}</Badge>
                  )}
                </TabsTrigger>
              </TabsList>

              {/* === Details Tab === */}
              <TabsContent value="details" className="space-y-3 text-sm mt-4">
                <div>
                  <p className="font-semibold text-base">{detailTarget.title}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {detailTarget.category && (
                      <Badge variant="outline">{detailTarget.category}</Badge>
                    )}
                    <AccountBadge task={detailTarget} />
                    {detailTarget.is_recurring && (
                      <Badge variant="outline" className="gap-1">
                        <Repeat className="h-3 w-3" />
                        {detailTarget.recurrence === 'daily' ? 'Quotidien' : detailTarget.recurrence === 'weekly' ? 'Hebdo' : 'Mensuel'}
                      </Badge>
                    )}
                    {(() => {
                      const dl = deadlineLabel(detailTarget.due_date, detailTarget.status);
                      return dl ? (
                        <span className={`text-xs flex items-center gap-1 ${dl.className}`}>
                          <Timer className="h-3 w-3" />{dl.text}
                        </span>
                      ) : null;
                    })()}
                  </div>
                </div>
                {detailTarget.description && (
                  <div className="p-3 bg-muted rounded text-sm whitespace-pre-wrap">{detailTarget.description}</div>
                )}
                {/* Daily target detail */}
                {detailTarget.daily_target && detailTarget.daily_target > 0 && (
                  <div className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        <Target className="h-4 w-4" />
                        Objectif quotidien
                      </span>
                      <span className={`font-bold ${detailTarget.daily_achieved >= detailTarget.daily_target ? 'text-green-600' : 'text-primary'}`}>
                        {detailTarget.daily_achieved}/{detailTarget.daily_target}
                      </span>
                    </div>
                    <Progress value={(detailTarget.daily_achieved / detailTarget.daily_target) * 100} className="h-2.5" />
                    {detailTarget.status !== 'completed' && !isAdmin && (
                      <Button
                        size="sm"
                        className="mt-2 w-full"
                        variant="outline"
                        onClick={() => handleIncrementDaily(detailTarget)}
                      >
                        <Plus className="h-4 w-4 mr-1.5" />
                        Marquer +1 réalisé
                      </Button>
                    )}
                  </div>
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
                    <div className="mt-1 p-3 bg-muted rounded text-sm whitespace-pre-wrap">{detailTarget.completion_note}</div>
                  </div>
                )}
                <div className="flex justify-between text-xs text-muted-foreground pt-2 border-t">
                  <span>Créée le {fmtDate(detailTarget.created_at)}</span>
                  {detailTarget.started_at && <span>Démarrée le {fmtDate(detailTarget.started_at)}</span>}
                  {detailTarget.completed_at && <span>Terminée le {fmtDate(detailTarget.completed_at)}</span>}
                </div>
                {detailTarget.status !== 'completed' && (
                  <div className="flex gap-2 pt-2 border-t">
                    {detailTarget.status === 'pending' && !isAdmin && (
                      <Button size="sm" onClick={() => { handleStartMission(detailTarget); setDetailTarget(null); }}>
                        <ArrowRight className="h-4 w-4 mr-1.5" />
                        Démarrer la mission
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={() => { openProgress(detailTarget); }}>
                      <Play className="h-4 w-4 mr-1.5" />
                      Mettre à jour
                    </Button>
                  </div>
                )}
              </TabsContent>

              {/* === Checklist Tab === */}
              <TabsContent value="checklist" className="mt-4">
                {loadingChecklist ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="space-y-2">
                    {checklist.length > 0 && (
                      <div className="mb-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-muted-foreground">
                            {checklist.filter(c => c.is_done).length}/{checklist.length} complétées
                          </span>
                          <span className="text-xs font-medium">
                            {Math.round(checklist.filter(c => c.is_done).length / checklist.length * 100)}%
                          </span>
                        </div>
                        <Progress value={checklist.filter(c => c.is_done).length / checklist.length * 100} className="h-2" />
                      </div>
                    )}
                    {checklist.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 p-2 rounded hover:bg-muted/50 group">
                        <button
                          onClick={() => handleToggleCheckItem(item)}
                          className="shrink-0"
                        >
                          {item.is_done ? (
                            <CheckSquare className="h-5 w-5 text-green-600" />
                          ) : (
                            <Square className="h-5 w-5 text-muted-foreground" />
                          )}
                        </button>
                        <span className={`text-sm flex-1 ${item.is_done ? 'line-through text-muted-foreground' : ''}`}>
                          {item.label}
                        </span>
                        {isAdmin && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 text-destructive"
                            onClick={() => handleDeleteCheckItem(item.id, detailTarget.id)}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    ))}
                    {checklist.length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">Aucun élément dans la checklist</p>
                    )}
                    {isAdmin && (
                      <div className="flex gap-2 pt-3 border-t mt-3">
                        <Input
                          placeholder="Ajouter un élément…"
                          value={newCheckItem}
                          onChange={(e) => setNewCheckItem(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleAddCheckItem(detailTarget.id); }}
                          className="flex-1"
                        />
                        <Button size="sm" onClick={() => handleAddCheckItem(detailTarget.id)} disabled={!newCheckItem.trim()}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </TabsContent>

              {/* === Comments Tab === */}
              <TabsContent value="comments" className="mt-4">
                {loadingComments ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="space-y-3 max-h-[300px] overflow-y-auto">
                      {comments.length === 0 && (
                        <p className="text-sm text-muted-foreground text-center py-6">
                          Aucun commentaire. Commencez la discussion !
                        </p>
                      )}
                      {comments.map((c) => {
                        const isMe = c.user_id === user?.id;
                        return (
                          <div key={c.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] p-3 rounded-lg text-sm ${
                              isMe
                                ? 'bg-primary text-primary-foreground rounded-br-none'
                                : 'bg-muted rounded-bl-none'
                            }`}>
                              {!isMe && (
                                <p className="font-semibold text-xs mb-1">{c.user_name}</p>
                              )}
                              <p className="whitespace-pre-wrap">{c.content}</p>
                              <p className={`text-[10px] mt-1 ${isMe ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                                {new Date(c.created_at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex gap-2 pt-3 border-t">
                      <Input
                        placeholder="Écrire un commentaire…"
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendComment(detailTarget.id); } }}
                        className="flex-1"
                      />
                      <Button
                        size="sm"
                        onClick={() => handleSendComment(detailTarget.id)}
                        disabled={!commentText.trim() || sendingComment}
                      >
                        {sendingComment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailTarget(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/*  DELETE TASK DIALOG                                          */}
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

      {/* ============================================================ */}
      {/*  ACCOUNT FORM DIALOG                                         */}
      {/* ============================================================ */}
      <Dialog open={accountFormOpen} onOpenChange={setAccountFormOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingAccount ? 'Modifier le compte' : 'Nouveau compte géré'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Nom du compte / page</Label>
              <Input
                className="mt-1"
                placeholder="Ex: GUIMS Group - Facebook"
                value={accountForm.name}
                onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Plateforme</Label>
                <Select value={accountForm.platform} onValueChange={(v) => setAccountForm({ ...accountForm, platform: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(platformLabels).map(([key, val]) => (
                      <SelectItem key={key} value={key}>
                        {val.emoji} {val.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Responsable</Label>
                <Select value={accountForm.assigned_to} onValueChange={(v) => setAccountForm({ ...accountForm, assigned_to: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Employé…" />
                  </SelectTrigger>
                  <SelectContent>
                    {employees.map((emp) => (
                      <SelectItem key={emp.user_id} value={emp.user_id}>
                        {emp.full_name}
                        {emp.position && <span className="text-xs text-muted-foreground ml-1">({emp.position})</span>}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>URL du compte</Label>
              <Input
                className="mt-1"
                placeholder="https://facebook.com/..."
                value={accountForm.url}
                onChange={(e) => setAccountForm({ ...accountForm, url: e.target.value })}
              />
            </div>
            <div>
              <Label>Description / Notes</Label>
              <Textarea
                className="mt-1"
                rows={2}
                placeholder="Informations complémentaires…"
                value={accountForm.description}
                onChange={(e) => setAccountForm({ ...accountForm, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccountFormOpen(false)}>Annuler</Button>
            <Button onClick={handleSaveAccount} disabled={savingAccount}>
              {savingAccount ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              {editingAccount ? 'Modifier' : 'Ajouter'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/*  DELETE ACCOUNT DIALOG                                       */}
      {/* ============================================================ */}
      <AlertDialog open={!!deleteAccountTarget} onOpenChange={(open) => { if (!open) setDeleteAccountTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce compte ?</AlertDialogTitle>
            <AlertDialogDescription>
              Le compte <strong>"{deleteAccountTarget?.name}"</strong> sera définitivement supprimé. Les missions liées garderont leur référence.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAccount} className="bg-destructive hover:bg-destructive/90">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
