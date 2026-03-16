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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FileText,
  Plus,
  Calendar,
  Smile,
  Meh,
  Frown,
  ThumbsUp,
  ThumbsDown,
  Clock,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  MessageSquare,
  User,
  Filter,
  Loader2,
  Send,
  Eye,
  Lightbulb,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { getDepartmentLogo } from '@/lib/departments';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface DailyReport {
  id: string;
  user_id: string;
  report_date: string;
  tasks_done: string;
  tasks_in_progress: string;
  blockers: string;
  plans_tomorrow: string;
  mood: 'great' | 'good' | 'neutral' | 'bad' | 'terrible';
  hours_worked: number | null;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  // joined
  user_name?: string;
  department?: string | null;
  position?: string | null;
}

interface TaskSuggestion {
  id: string;
  department: string;
  position: string | null;
  title: string;
  description: string | null;
  priority: string;
  category: string | null;
  is_recurring_suggestion: boolean;
  recurrence: string | null;
  is_active: boolean;
}

interface EmployeeOption {
  user_id: string;
  full_name: string;
  department: string | null;
  position: string | null;
}

const moodConfig: Record<string, { label: string; emoji: string; color: string }> = {
  great:   { label: 'Excellent',  emoji: '🤩', color: 'text-green-600' },
  good:    { label: 'Bien',       emoji: '😊', color: 'text-green-500' },
  neutral: { label: 'Normal',     emoji: '😐', color: 'text-yellow-600' },
  bad:     { label: 'Difficile',  emoji: '😟', color: 'text-orange-600' },
  terrible:{ label: 'Très dur',   emoji: '😩', color: 'text-red-600' },
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

function fmtShortDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function DailyReports() {
  const { user, role, profile } = useAuth();
  const { toast } = useToast();
  const isAdmin = role === 'admin' || role === 'manager';

  const [reports, setReports] = useState<DailyReport[]>([]);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [suggestions, setSuggestions] = useState<TaskSuggestion[]>([]);
  const [loading, setLoading] = useState(true);

  // Form
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingReport, setEditingReport] = useState<DailyReport | null>(null);
  const [form, setForm] = useState({
    tasks_done: '',
    tasks_in_progress: '',
    blockers: '',
    plans_tomorrow: '',
    mood: 'good' as string,
    hours_worked: '',
  });

  // Admin feedback dialog
  const [feedbackTarget, setFeedbackTarget] = useState<DailyReport | null>(null);
  const [feedbackNote, setFeedbackNote] = useState('');
  const [sendingFeedback, setSendingFeedback] = useState(false);

  // Detail dialog
  const [detailTarget, setDetailTarget] = useState<DailyReport | null>(null);

  // Filters
  const [dateFilter, setDateFilter] = useState<string>(new Date().toISOString().split('T')[0]);
  const [employeeFilter, setEmployeeFilter] = useState<string>('all');
  const [tab, setTab] = useState<string>(isAdmin ? 'overview' : 'my-reports');

  // Suggestions dialog
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  /* ---------------------------------------------------------------- */
  /*  Fetch                                                            */
  /* ---------------------------------------------------------------- */
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Reports
      let query = supabase.from('daily_reports').select('*').order('report_date', { ascending: false }).order('created_at', { ascending: false });
      if (!isAdmin) {
        query = query.eq('user_id', user?.id ?? '');
      }
      const { data: reportData, error } = await query;
      if (error) throw error;

      // Employees
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, full_name, department, position')
        .eq('is_approved', true);

      const empList: EmployeeOption[] = (profiles || []).filter((p) => !(p as Record<string, unknown>).archived);
      setEmployees(empList);

      const nameMap: Record<string, string> = {};
      const deptMap: Record<string, string | null> = {};
      const posMap: Record<string, string | null> = {};
      empList.forEach((p) => {
        nameMap[p.user_id] = p.full_name;
        deptMap[p.user_id] = p.department;
        posMap[p.user_id] = p.position;
      });

      const enriched: DailyReport[] = (reportData || []).map((r) => ({
        ...r,
        mood: r.mood || 'good',
        user_name: nameMap[r.user_id] || 'Inconnu',
        department: deptMap[r.user_id] || null,
        position: posMap[r.user_id] || null,
      }));

      setReports(enriched);

      // Task suggestions (for the employee's department/position)
      if (profile?.department) {
        const { data: sugData } = await supabase
          .from('task_suggestions')
          .select('*')
          .eq('department', profile.department)
          .eq('is_active', true)
          .order('priority');
        setSuggestions(
          (sugData || []).filter(
            (s) => !s.position || s.position === profile?.position
          )
        );
      }
    } catch (err: unknown) {
      toast({ title: 'Erreur', description: (err as Error).message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user?.id, profile?.department, profile?.position, toast]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ---------------------------------------------------------------- */
  /*  Today's report check                                             */
  /* ---------------------------------------------------------------- */
  const today = new Date().toISOString().split('T')[0];
  const todayReport = reports.find((r) => r.user_id === user?.id && r.report_date === today);

  /* ---------------------------------------------------------------- */
  /*  Form handlers                                                    */
  /* ---------------------------------------------------------------- */
  const openNewReport = () => {
    if (todayReport) {
      // Edit today's report
      setEditingReport(todayReport);
      setForm({
        tasks_done: todayReport.tasks_done,
        tasks_in_progress: todayReport.tasks_in_progress || '',
        blockers: todayReport.blockers || '',
        plans_tomorrow: todayReport.plans_tomorrow || '',
        mood: todayReport.mood,
        hours_worked: todayReport.hours_worked?.toString() || '',
      });
    } else {
      setEditingReport(null);
      setForm({
        tasks_done: '',
        tasks_in_progress: '',
        blockers: '',
        plans_tomorrow: '',
        mood: 'good',
        hours_worked: '',
      });
    }
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.tasks_done.trim()) {
      toast({ title: 'Requis', description: 'Décrivez ce que vous avez accompli aujourd\'hui.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const base = {
        tasks_done: form.tasks_done.trim(),
        tasks_in_progress: form.tasks_in_progress.trim() || null,
        blockers: form.blockers.trim() || null,
        plans_tomorrow: form.plans_tomorrow.trim() || null,
        mood: form.mood,
        hours_worked: form.hours_worked ? parseFloat(form.hours_worked) : null,
        updated_at: new Date().toISOString(),
      };

      if (editingReport) {
        const { error } = await supabase.from('daily_reports').update(base).eq('id', editingReport.id);
        if (error) throw error;
        toast({ title: '✅ Rapport mis à jour' });
      } else {
        const { error } = await supabase.from('daily_reports').insert({
          ...base,
          user_id: user!.id,
          report_date: today,
        });
        if (error) throw error;
        toast({ title: '✅ Rapport soumis', description: 'Votre rapport journalier a été envoyé.' });
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
  /*  Admin feedback                                                   */
  /* ---------------------------------------------------------------- */
  const handleSendFeedback = async () => {
    if (!feedbackTarget || !feedbackNote.trim()) return;
    setSendingFeedback(true);
    const { error } = await supabase.from('daily_reports').update({
      admin_note: feedbackNote.trim(),
      reviewed_by: user!.id,
      reviewed_at: new Date().toISOString(),
    }).eq('id', feedbackTarget.id);
    if (error) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: '✅ Feedback envoyé' });
      setFeedbackTarget(null);
      setFeedbackNote('');
      fetchData();
    }
    setSendingFeedback(false);
  };

  /* ---------------------------------------------------------------- */
  /*  Smart suggestion → convert to task                               */
  /* ---------------------------------------------------------------- */
  const handleCreateTaskFromSuggestion = async (s: TaskSuggestion) => {
    const { error } = await supabase.from('tasks').insert({
      title: s.title,
      description: s.description,
      assigned_to: user!.id,
      assigned_by: user!.id,
      priority: s.priority,
      category: s.category,
      due_date: today,
      is_recurring: s.is_recurring_suggestion,
      recurrence: s.recurrence,
      status: 'pending',
      progress: 0,
      daily_achieved: 0,
    });
    if (error) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: '✅ Tâche créée', description: s.title });
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Filters                                                          */
  /* ---------------------------------------------------------------- */
  const filteredReports = reports.filter((r) => {
    if (tab === 'my-reports' && r.user_id !== user?.id) return false;
    if (dateFilter && r.report_date !== dateFilter) return false;
    if (employeeFilter !== 'all' && r.user_id !== employeeFilter) return false;
    return true;
  });

  // Stats for admin
  const reportsToday = reports.filter((r) => r.report_date === today);
  const submittedToday = new Set(reportsToday.map((r) => r.user_id));
  const totalEmployees = employees.length;
  const submittedCount = submittedToday.size;
  const notSubmitted = employees.filter((e) => !submittedToday.has(e.user_id));
  const avgMood = reportsToday.length > 0
    ? (() => {
        const moodValues = { great: 5, good: 4, neutral: 3, bad: 2, terrible: 1 };
        const total = reportsToday.reduce((s, r) => s + (moodValues[r.mood] || 3), 0);
        return (total / reportsToday.length).toFixed(1);
      })()
    : '—';

  // My reports streaks
  const myReports = reports.filter((r) => r.user_id === user?.id);
  const reviewedCount = myReports.filter((r) => r.admin_note).length;

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
              <FileText className="h-6 w-6" />
              Rapports Journaliers
            </h1>
            <p className="text-muted-foreground mt-1">
              {isAdmin
                ? 'Suivez les rapports quotidiens de vos employés'
                : 'Soumettez votre rapport d\'activité quotidien'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {suggestions.length > 0 && !isAdmin && (
              <Button variant="outline" onClick={() => setSuggestionsOpen(true)}>
                <Lightbulb className="h-4 w-4 mr-2" />
                Suggestions ({suggestions.length})
              </Button>
            )}
            <Button onClick={openNewReport}>
              {todayReport ? (
                <>
                  <FileText className="h-4 w-4 mr-2" />
                  Modifier mon rapport
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Soumettre mon rapport
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Today's quick status */}
        {!isAdmin && (
          <Card className={`p-4 border-l-4 ${todayReport ? 'border-l-green-500 bg-green-50/50 dark:bg-green-950/20' : 'border-l-orange-500 bg-orange-50/50 dark:bg-orange-950/20'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {todayReport ? (
                  <CheckCircle className="h-5 w-5 text-green-600" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-orange-600" />
                )}
                <div>
                  <p className="font-medium text-sm">
                    {todayReport ? 'Rapport d\'aujourd\'hui soumis ✅' : 'Vous n\'avez pas encore soumis votre rapport d\'aujourd\'hui'}
                  </p>
                  {todayReport && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Humeur : {moodConfig[todayReport.mood].emoji} {moodConfig[todayReport.mood].label}
                      {todayReport.admin_note && ' · 💬 Feedback admin disponible'}
                    </p>
                  )}
                </div>
              </div>
              {!todayReport && (
                <Button size="sm" onClick={openNewReport}>
                  <Send className="h-4 w-4 mr-1" /> Soumettre
                </Button>
              )}
            </div>
          </Card>
        )}

        {/* Admin tabs */}
        {isAdmin ? (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
              <TabsTrigger value="my-reports">Mes rapports</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="space-y-4 mt-4">
              {/* Admin stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-500/10 rounded-lg">
                      <CheckCircle className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Soumis aujourd'hui</p>
                      <p className="text-xl font-bold">{submittedCount}/{totalEmployees}</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-orange-500/10 rounded-lg">
                      <AlertTriangle className="h-5 w-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Non soumis</p>
                      <p className="text-xl font-bold text-orange-600">{notSubmitted.length}</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/10 rounded-lg">
                      <Smile className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Humeur moyenne</p>
                      <p className="text-xl font-bold">{avgMood}/5</p>
                    </div>
                  </div>
                </Card>
                <Card className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-red-500/10 rounded-lg">
                      <Zap className="h-5 w-5 text-red-600" />
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Avec blocages</p>
                      <p className="text-xl font-bold text-red-600">
                        {reportsToday.filter((r) => r.blockers && r.blockers.trim()).length}
                      </p>
                    </div>
                  </div>
                </Card>
              </div>

              {/* Employees who haven't submitted */}
              {notSubmitted.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-orange-600 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Employés n'ayant pas soumis leur rapport ({notSubmitted.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {notSubmitted.map((emp) => (
                        <Badge key={emp.user_id} variant="outline" className="text-xs gap-1">
                          {emp.department && <img src={getDepartmentLogo(emp.department)} alt="" className="h-3 w-3 rounded-full" />}
                          {emp.full_name}
                          {emp.position && <span className="text-muted-foreground">({emp.position})</span>}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Filter bar */}
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  className="w-44"
                />
                <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                  <SelectTrigger className="w-52">
                    <SelectValue placeholder="Tous les employés" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Tous les employés</SelectItem>
                    {employees.map((emp) => (
                      <SelectItem key={emp.user_id} value={emp.user_id}>
                        {emp.full_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Reports list */}
              {loading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : filteredReports.length === 0 ? (
                <Card className="p-8 text-center">
                  <FileText className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                  <p className="text-muted-foreground">Aucun rapport pour cette date</p>
                </Card>
              ) : (
                <div className="space-y-3">
                  {filteredReports.map((report) => (
                    <ReportCard
                      key={report.id}
                      report={report}
                      isAdmin={isAdmin}
                      onView={() => setDetailTarget(report)}
                      onFeedback={() => { setFeedbackTarget(report); setFeedbackNote(report.admin_note || ''); }}
                    />
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="my-reports" className="space-y-4 mt-4">
              <MyReportsSection
                reports={myReports}
                loading={loading}
                onView={(r) => setDetailTarget(r)}
                todayReport={todayReport}
                onNewReport={openNewReport}
              />
            </TabsContent>
          </Tabs>
        ) : (
          <MyReportsSection
            reports={myReports}
            loading={loading}
            onView={(r) => setDetailTarget(r)}
            todayReport={todayReport}
            onNewReport={openNewReport}
          />
        )}
      </div>

      {/* ============================================================ */}
      {/*  NEW / EDIT REPORT DIALOG                                     */}
      {/* ============================================================ */}
      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingReport ? 'Modifier mon rapport' : 'Rapport journalier'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {/* Suggestions shortcut */}
            {suggestions.length > 0 && !form.tasks_done && (
              <Card className="p-3 bg-blue-50/50 dark:bg-blue-950/20 border-blue-200">
                <p className="text-xs text-blue-600 font-medium mb-2 flex items-center gap-1">
                  <Lightbulb className="h-3 w-3" /> Suggestions pour votre poste :
                </p>
                <div className="flex flex-wrap gap-1">
                  {suggestions.slice(0, 5).map((s) => (
                    <Badge
                      key={s.id}
                      variant="outline"
                      className="text-[10px] cursor-pointer hover:bg-blue-100 transition"
                      onClick={() => setForm({ ...form, tasks_done: form.tasks_done + (form.tasks_done ? '\n' : '') + '• ' + s.title })}
                    >
                      + {s.title}
                    </Badge>
                  ))}
                </div>
              </Card>
            )}

            <div>
              <Label className="flex items-center gap-1">
                <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                Ce que j'ai accompli aujourd'hui *
              </Label>
              <Textarea
                className="mt-1 min-h-[100px]"
                placeholder="• Tâche 1 terminée&#10;• Réunion avec l'équipe&#10;• Publication sur les réseaux…"
                value={form.tasks_done}
                onChange={(e) => setForm({ ...form, tasks_done: e.target.value })}
              />
            </div>

            <div>
              <Label className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5 text-blue-600" />
                En cours / non terminé
              </Label>
              <Textarea
                className="mt-1"
                placeholder="Ce qui est en cours mais pas encore terminé…"
                value={form.tasks_in_progress}
                onChange={(e) => setForm({ ...form, tasks_in_progress: e.target.value })}
              />
            </div>

            <div>
              <Label className="flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5 text-orange-600" />
                Blocages / Problèmes
              </Label>
              <Textarea
                className="mt-1"
                placeholder="Difficultés rencontrées, besoin d'aide…"
                value={form.blockers}
                onChange={(e) => setForm({ ...form, blockers: e.target.value })}
              />
            </div>

            <div>
              <Label className="flex items-center gap-1">
                <ArrowRight className="h-3.5 w-3.5 text-indigo-600" />
                Plans pour demain
              </Label>
              <Textarea
                className="mt-1"
                placeholder="Ce que je prévois de faire demain…"
                value={form.plans_tomorrow}
                onChange={(e) => setForm({ ...form, plans_tomorrow: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Comment s'est passée votre journée ?</Label>
                <div className="flex gap-2 mt-2">
                  {Object.entries(moodConfig).map(([key, cfg]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setForm({ ...form, mood: key })}
                      className={`flex flex-col items-center p-2 rounded-lg border transition text-center flex-1 ${
                        form.mood === key ? 'border-primary bg-primary/5 ring-2 ring-primary/20' : 'border-muted hover:bg-muted/50'
                      }`}
                    >
                      <span className="text-lg">{cfg.emoji}</span>
                      <span className="text-[10px] mt-0.5">{cfg.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label>Heures travaillées (estimation)</Label>
                <Input
                  type="number"
                  min="0"
                  max="24"
                  step="0.5"
                  className="mt-2"
                  placeholder="Ex: 8"
                  value={form.hours_worked}
                  onChange={(e) => setForm({ ...form, hours_worked: e.target.value })}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)}>Annuler</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              {editingReport ? 'Mettre à jour' : 'Soumettre'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/*  DETAIL DIALOG                                                */}
      {/* ============================================================ */}
      <Dialog open={!!detailTarget} onOpenChange={() => setDetailTarget(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {detailTarget && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Rapport du {fmtDate(detailTarget.report_date)}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                {isAdmin && (
                  <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                    <User className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">{detailTarget.user_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {detailTarget.department} — {detailTarget.position}
                      </p>
                    </div>
                    <span className="ml-auto text-lg">{moodConfig[detailTarget.mood]?.emoji}</span>
                  </div>
                )}

                <div>
                  <p className="text-xs font-medium text-green-600 flex items-center gap-1 mb-1">
                    <CheckCircle className="h-3 w-3" /> Accompli
                  </p>
                  <p className="text-sm whitespace-pre-wrap bg-green-50/50 dark:bg-green-950/20 p-3 rounded-lg">{detailTarget.tasks_done}</p>
                </div>

                {detailTarget.tasks_in_progress && (
                  <div>
                    <p className="text-xs font-medium text-blue-600 flex items-center gap-1 mb-1">
                      <Clock className="h-3 w-3" /> En cours
                    </p>
                    <p className="text-sm whitespace-pre-wrap bg-blue-50/50 dark:bg-blue-950/20 p-3 rounded-lg">{detailTarget.tasks_in_progress}</p>
                  </div>
                )}

                {detailTarget.blockers && (
                  <div>
                    <p className="text-xs font-medium text-orange-600 flex items-center gap-1 mb-1">
                      <AlertTriangle className="h-3 w-3" /> Blocages
                    </p>
                    <p className="text-sm whitespace-pre-wrap bg-orange-50/50 dark:bg-orange-950/20 p-3 rounded-lg">{detailTarget.blockers}</p>
                  </div>
                )}

                {detailTarget.plans_tomorrow && (
                  <div>
                    <p className="text-xs font-medium text-indigo-600 flex items-center gap-1 mb-1">
                      <ArrowRight className="h-3 w-3" /> Plans demain
                    </p>
                    <p className="text-sm whitespace-pre-wrap bg-indigo-50/50 dark:bg-indigo-950/20 p-3 rounded-lg">{detailTarget.plans_tomorrow}</p>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-3">
                  <span>Humeur : {moodConfig[detailTarget.mood]?.emoji} {moodConfig[detailTarget.mood]?.label}</span>
                  {detailTarget.hours_worked && <span>⏱ {detailTarget.hours_worked}h travaillées</span>}
                </div>

                {detailTarget.admin_note && (
                  <div className="border-t pt-3">
                    <p className="text-xs font-medium text-purple-600 flex items-center gap-1 mb-1">
                      <MessageSquare className="h-3 w-3" /> Feedback de l'admin
                    </p>
                    <p className="text-sm whitespace-pre-wrap bg-purple-50/50 dark:bg-purple-950/20 p-3 rounded-lg">{detailTarget.admin_note}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/*  ADMIN FEEDBACK DIALOG                                        */}
      {/* ============================================================ */}
      <Dialog open={!!feedbackTarget} onOpenChange={() => setFeedbackTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Feedback — {feedbackTarget?.user_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              Rapport du {feedbackTarget && fmtDate(feedbackTarget.report_date)}
            </p>
            <Textarea
              placeholder="Votre feedback pour cet employé…"
              value={feedbackNote}
              onChange={(e) => setFeedbackNote(e.target.value)}
              className="min-h-[80px]"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeedbackTarget(null)}>Annuler</Button>
            <Button onClick={handleSendFeedback} disabled={sendingFeedback || !feedbackNote.trim()}>
              {sendingFeedback ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Envoyer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/*  SUGGESTIONS DIALOG                                           */}
      {/* ============================================================ */}
      <Dialog open={suggestionsOpen} onOpenChange={setSuggestionsOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-yellow-500" />
              Suggestions de tâches pour votre poste
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Basées sur votre département ({profile?.department}) et votre poste ({profile?.position}).
            Cliquez pour créer une tâche automatiquement.
          </p>
          <div className="space-y-2 py-2">
            {suggestions.map((s) => (
              <Card key={s.id} className="p-3 hover:bg-muted/50 transition cursor-pointer" onClick={() => handleCreateTaskFromSuggestion(s)}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <p className="font-medium text-sm">{s.title}</p>
                    {s.description && <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>}
                    <div className="flex gap-1 mt-1.5">
                      {s.category && <Badge variant="outline" className="text-[10px]">{s.category}</Badge>}
                      {s.is_recurring_suggestion && (
                        <Badge variant="secondary" className="text-[10px]">
                          🔄 {s.recurrence === 'daily' ? 'Quotidien' : s.recurrence === 'weekly' ? 'Hebdo' : 'Mensuel'}
                        </Badge>
                      )}
                      <Badge
                        variant={s.priority === 'urgent' ? 'destructive' : s.priority === 'high' ? 'default' : 'secondary'}
                        className="text-[10px]"
                      >
                        {s.priority === 'urgent' ? 'Urgente' : s.priority === 'high' ? 'Haute' : s.priority === 'medium' ? 'Moyenne' : 'Basse'}
                      </Badge>
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="text-green-600 shrink-0">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function ReportCard({ report, isAdmin, onView, onFeedback }: {
  report: DailyReport;
  isAdmin: boolean;
  onView: () => void;
  onFeedback: () => void;
}) {
  const mood = moodConfig[report.mood] || moodConfig.good;
  return (
    <Card className="p-4 hover:shadow-md transition">
      <div className="flex items-start gap-3">
        <span className="text-2xl mt-0.5">{mood.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {isAdmin && (
              <div className="flex items-center gap-1.5">
                {report.department && (
                  <img src={getDepartmentLogo(report.department)} alt="" className="h-4 w-4 rounded-full" />
                )}
                <span className="font-medium text-sm">{report.user_name}</span>
              </div>
            )}
            <span className="text-xs text-muted-foreground">{fmtDate(report.report_date)}</span>
            {report.hours_worked && (
              <Badge variant="outline" className="text-[10px]">⏱ {report.hours_worked}h</Badge>
            )}
            {report.admin_note && (
              <Badge variant="secondary" className="text-[10px] text-purple-600">💬 Feedback</Badge>
            )}
          </div>

          <p className="text-sm mt-1 line-clamp-2">{report.tasks_done}</p>

          {report.blockers && (
            <p className="text-xs text-orange-600 mt-1 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              {report.blockers.substring(0, 80)}{report.blockers.length > 80 ? '…' : ''}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button size="sm" variant="ghost" title="Voir" onClick={onView}>
            <Eye className="h-4 w-4" />
          </Button>
          {isAdmin && (
            <Button size="sm" variant="ghost" title="Feedback" className="text-purple-600" onClick={onFeedback}>
              <MessageSquare className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

function MyReportsSection({ reports, loading, onView, todayReport, onNewReport }: {
  reports: DailyReport[];
  loading: boolean;
  onView: (r: DailyReport) => void;
  todayReport: DailyReport | undefined;
  onNewReport: () => void;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <Card className="p-8 text-center">
        <FileText className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-muted-foreground font-medium">Aucun rapport soumis</p>
        <p className="text-xs text-muted-foreground mt-1">Commencez par soumettre votre premier rapport journalier</p>
        <Button className="mt-4" onClick={onNewReport}>
          <Plus className="h-4 w-4 mr-2" /> Soumettre mon rapport
        </Button>
      </Card>
    );
  }

  // Group by month
  const grouped: Record<string, DailyReport[]> = {};
  reports.forEach((r) => {
    const key = r.report_date.substring(0, 7);
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  });

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold font-display text-primary">{reports.length}</p>
          <p className="text-xs text-muted-foreground">Rapports soumis</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold font-display text-purple-600">{reports.filter(r => r.admin_note).length}</p>
          <p className="text-xs text-muted-foreground">Avec feedback</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-2xl font-bold font-display">
            {reports.length > 0 ? (() => {
              const moodValues: Record<string, number> = { great: 5, good: 4, neutral: 3, bad: 2, terrible: 1 };
              const avg = reports.reduce((s, r) => s + (moodValues[r.mood] || 3), 0) / reports.length;
              return avg >= 4 ? '😊' : avg >= 3 ? '😐' : '😟';
            })() : '—'}
          </p>
          <p className="text-xs text-muted-foreground">Humeur moyenne</p>
        </Card>
      </div>

      {/* Reports by month */}
      {Object.entries(grouped).map(([monthKey, monthReports]) => {
        const [y, m] = monthKey.split('-').map(Number);
        const label = new Date(y, m - 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
        return (
          <div key={monthKey}>
            <h3 className="text-sm font-semibold text-muted-foreground mb-2 capitalize">{label} ({monthReports.length} rapports)</h3>
            <div className="space-y-2">
              {monthReports.map((r) => {
                const mood = moodConfig[r.mood] || moodConfig.good;
                return (
                  <Card
                    key={r.id}
                    className="p-3 cursor-pointer hover:shadow-sm transition"
                    onClick={() => onView(r)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-lg">{mood.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm line-clamp-1">{r.tasks_done}</p>
                        <p className="text-xs text-muted-foreground">{fmtDate(r.report_date)}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {r.hours_worked && <span className="text-xs text-muted-foreground">⏱{r.hours_worked}h</span>}
                        {r.admin_note && <Badge variant="secondary" className="text-[10px]">💬</Badge>}
                        {r.blockers && <Badge variant="outline" className="text-[10px] text-orange-600">⚠️</Badge>}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
