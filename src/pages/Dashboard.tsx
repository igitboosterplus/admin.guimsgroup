import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Clock, AlertTriangle, CheckCircle, LogIn, CalendarDays, ClipboardList } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { getDepartmentLogo } from '@/lib/departments';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useClockInReminder } from '@/hooks/useClockInReminder';

const DEPT_COLORS: Record<string, string> = {
  'GABA': '#16a34a',
  'Guims Educ': '#2563eb',
  'Digitbooster+': '#9333ea',
  'Guims Compta': '#ea580c',
  'GuimSelect': '#0891b2',
  'Guims Academy': '#dc2626',
  'Guims Linguistic Center': '#ca8a04',
  'Direction Générale': '#4f46e5',
};
const FALLBACK_COLORS = ['#6366f1', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#ec4899'];
function getDeptColor(name: string, index: number) {
  return DEPT_COLORS[name] || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
}

interface WeeklyData {
  day: string;
  presents: number;
  retards: number;
  absents: number;
}

interface DeptData {
  name: string;
  value: number;
}

export default function Dashboard() {
  const { role, profile, user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  useClockInReminder();
  const [stats, setStats] = useState({ totalEmployees: 0, presentToday: 0, lateToday: 0, absentToday: 0 });
  const [weeklyData, setWeeklyData] = useState<WeeklyData[]>([]);
  const [deptData, setDeptData] = useState<DeptData[]>([]);
  const [myStats, setMyStats] = useState({ todayStatus: '' as string, monthPresents: 0, monthLates: 0, monthAbsents: 0 });
  const [taskStats, setTaskStats] = useState({ total: 0, completed: 0, inProgress: 0, overdue: 0 });
  const [loading, setLoading] = useState(true);

  // ── Fetch functions (extracted for reuse by realtime) ──

  const fetchStats = useCallback(async () => {
    try {
      const today = new Date().toISOString().split('T')[0];

      if (role === 'admin' || role === 'manager') {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];

        const [employeesRes, attendanceRes, profilesRes] = await Promise.all([
          supabase.from('profiles').select('id', { count: 'exact' }).eq('is_approved', true).eq('archived', false).eq('is_paused', false),
          supabase.from('attendance').select('*').gte('clock_in', today).lt('clock_in', tomorrowStr),
          supabase.from('profiles').select('department').eq('is_approved', true).eq('archived', false).eq('is_paused', false),
        ]);

        if (employeesRes.error) throw employeesRes.error;
        if (attendanceRes.error) throw attendanceRes.error;

        const attendance = attendanceRes.data || [];
        const totalEmployees = employeesRes.count || 0;
        setStats({
          totalEmployees,
          presentToday: attendance.length,
          lateToday: attendance.filter((a) => a.status === 'late').length,
          absentToday: Math.max(0, totalEmployees - attendance.length),
        });

        const deptMap: Record<string, number> = {};
        (profilesRes.data || []).forEach((p) => {
          const dept = p.department || 'Non assigné';
          deptMap[dept] = (deptMap[dept] || 0) + 1;
        });
        setDeptData(Object.entries(deptMap).map(([name, value]) => ({ name, value })));

        const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - 6);
        const weekStartStr = weekStart.toISOString().split('T')[0];

        const { data: weekAtt } = await supabase
          .from('attendance')
          .select('status, clock_in')
          .gte('clock_in', weekStartStr)
          .lt('clock_in', tomorrowStr);

        const weekRecords = weekAtt || [];
        const days: WeeklyData[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().split('T')[0];
          const dayRecords = weekRecords.filter((a) => a.clock_in.startsWith(dateStr));
          days.push({
            day: `${dayNames[d.getDay()]} ${d.getDate()}`,
            presents: dayRecords.filter((a) => a.status === 'present').length,
            retards: dayRecords.filter((a) => a.status === 'late').length,
            absents: Math.max(0, totalEmployees - dayRecords.length),
          });
        }
        setWeeklyData(days);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur inconnue';
      toast({ title: 'Erreur chargement', description: msg, variant: 'destructive' });
    }
  }, [role, toast]);

  const fetchMyStats = useCallback(async () => {
    if (!user) return;
    const today = new Date().toISOString().split('T')[0];
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];
    const monthStart = today.substring(0, 7) + '-01';

    const [todayRes, monthRes] = await Promise.all([
      supabase.from('attendance').select('status').eq('user_id', user.id).gte('clock_in', today).lt('clock_in', tomorrowStr).limit(1),
      supabase.from('attendance').select('status, clock_in').eq('user_id', user.id).gte('clock_in', monthStart),
    ]);

    const todayRecord = todayRes.data?.[0];
    const monthRecords = monthRes.data || [];

    const now = new Date();
    const monthStartDate = new Date(now.getFullYear(), now.getMonth(), 1);
    let workingDays = 0;
    const d = new Date(monthStartDate);
    while (d <= now && d.getMonth() === now.getMonth()) {
      if (d.getDay() !== 0) workingDays++;
      d.setDate(d.getDate() + 1);
    }
    const uniqueDays = new Set(monthRecords.map((r: any) => r.clock_in ? new Date(r.clock_in).toISOString().split('T')[0] : '').filter(Boolean));
    const absents = Math.max(0, workingDays - uniqueDays.size);

    setMyStats({
      todayStatus: todayRecord?.status || 'absent',
      monthPresents: monthRecords.filter((r) => r.status === 'present').length,
      monthLates: monthRecords.filter((r) => r.status === 'late').length,
      monthAbsents: absents,
    });
  }, [user]);

  const fetchTaskStats = useCallback(async () => {
    if (!user) return;
    const isAdminOrManager = role === 'admin' || role === 'manager';
    let query = supabase.from('tasks').select('status');
    if (!isAdminOrManager) query = query.eq('assigned_to', user.id);
    const { data } = await query;
    const tasks = data || [];
    setTaskStats({
      total: tasks.length,
      completed: tasks.filter((t) => t.status === 'completed').length,
      inProgress: tasks.filter((t) => t.status === 'in_progress').length,
      overdue: tasks.filter((t) => t.status === 'overdue').length,
    });
  }, [user, role]);

  // ── Initial fetch ──
  useEffect(() => {
    Promise.all([fetchStats(), fetchMyStats(), fetchTaskStats()]).finally(() => setLoading(false));
  }, [fetchStats, fetchMyStats, fetchTaskStats]);

  // ── Realtime subscriptions ──
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, () => {
        fetchStats();
        fetchMyStats();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, () => {
        fetchTaskStats();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
        fetchStats();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchStats, fetchMyStats, fetchTaskStats]);

  const statCards = [
    { label: 'Total Employés', value: stats.totalEmployees, icon: Users, color: 'text-primary' },
    { label: 'Présents Aujourd\'hui', value: stats.presentToday, icon: CheckCircle, color: 'text-success' },
    { label: 'En Retard', value: stats.lateToday, icon: Clock, color: 'text-warning' },
    { label: 'Absents', value: stats.absentToday, icon: AlertTriangle, color: 'text-destructive' },
  ];

  return (
    <DashboardLayout>
      <div className="animate-fade-in">
        <div className="mb-8">
          <h1 className="page-title">Bonjour, {profile?.full_name} 👋</h1>
          <p className="text-muted-foreground mt-1">Voici le résumé de la journée</p>
        </div>

        {(role === 'admin' || role === 'manager') && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <Card key={i} className="stat-card">
                    <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-5 w-5 rounded" />
                    </CardHeader>
                    <CardContent><Skeleton className="h-8 w-16" /></CardContent>
                  </Card>
                ))
              ) : statCards.map((stat) => (
                <Card key={stat.label} className="stat-card">
                  <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                    <CardTitle className="text-sm font-medium text-muted-foreground">{stat.label}</CardTitle>
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </CardHeader>
                  <CardContent>
                    <div className="text-3xl font-bold font-display">{stat.value}</div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Task overview */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-8">
              <Card className="stat-card">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Tâches totales</CardTitle>
                  <ClipboardList className="h-5 w-5 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-3xl font-bold font-display">{taskStats.total}</div>
                </CardContent>
              </Card>
              <Card className="stat-card">
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">En cours</CardTitle></CardHeader>
                <CardContent><div className="text-3xl font-bold font-display text-blue-600">{taskStats.inProgress}</div></CardContent>
              </Card>
              <Card className="stat-card">
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Terminées</CardTitle></CardHeader>
                <CardContent><div className="text-3xl font-bold font-display text-success">{taskStats.completed}</div></CardContent>
              </Card>
              <Card className="stat-card">
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">En retard</CardTitle></CardHeader>
                <CardContent><div className="text-3xl font-bold font-display text-destructive">{taskStats.overdue}</div></CardContent>
              </Card>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              {/* Weekly attendance chart */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle className="text-base">Présences des 7 derniers jours</CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="space-y-3 py-4">
                      <Skeleton className="h-6 w-full" />
                      <Skeleton className="h-40 w-full" />
                      <Skeleton className="h-6 w-3/4" />
                    </div>
                  ) : weeklyData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={weeklyData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                        <XAxis dataKey="day" tick={{ fontSize: 12 }} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                        <Tooltip />
                        <Bar dataKey="presents" name="Présents" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="retards" name="Retards" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="absents" name="Absents" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">
                      Aucune donnée de présence
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Department pie chart */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Répartition par département</CardTitle>
                </CardHeader>
                <CardContent>
                  {deptData.length > 0 ? (
                    <ResponsiveContainer width="100%" height={280}>
                      <PieChart>
                        <Pie
                          data={deptData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={90}
                          paddingAngle={4}
                          dataKey="value"
                          label={({ name, value }) => `${name} (${value})`}
                        >
                          {deptData.map((entry, i) => (
                            <Cell key={i} fill={getDeptColor(entry.name, i)} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend
                          content={() => (
                            <div className="flex flex-wrap gap-2 mt-2 justify-center">
                              {deptData.map((entry, i) => (
                                <div key={i} className="flex items-center gap-1 text-xs">
                                  <img src={getDepartmentLogo(entry.name)} alt="" className="h-4 w-4 rounded-full object-cover" />
                                  <span className={`font-medium`}>{entry.name}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-[280px] text-muted-foreground text-sm">
                      Aucun département
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Quick actions */}
            <Card className="stat-card">
              <CardContent className="pt-6">
                <p className="text-sm font-medium text-muted-foreground mb-3">Accès rapide</p>
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" onClick={() => navigate('/employees')}>
                    <Users className="h-4 w-4 mr-2" /> Employés
                  </Button>
                  <Button variant="outline" onClick={() => navigate('/attendance')}>
                    <Clock className="h-4 w-4 mr-2" /> Pointage
                  </Button>
                  <Button variant="outline" onClick={() => navigate('/reports')}>
                    <AlertTriangle className="h-4 w-4 mr-2" /> Rapports
                  </Button>
                  <Button variant="outline" onClick={() => navigate('/tasks')}>
                    <ClipboardList className="h-4 w-4 mr-2" /> Tâches
                  </Button>
                  <Button variant="outline" onClick={() => navigate('/leaves')}>
                    <CalendarDays className="h-4 w-4 mr-2" /> Congés
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        {(role === 'bureau' || role === 'terrain') && (
          <div className="space-y-6">
            {/* Today status + quick action */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card className="stat-card">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Statut aujourd'hui</CardTitle>
                  {myStats.todayStatus === 'present' ? (
                    <CheckCircle className="h-5 w-5 text-success" />
                  ) : myStats.todayStatus === 'late' ? (
                    <Clock className="h-5 w-5 text-warning" />
                  ) : (
                    <AlertTriangle className="h-5 w-5 text-destructive" />
                  )}
                </CardHeader>
                <CardContent>
                  <p className="text-2xl font-bold font-display">
                    {myStats.todayStatus === 'present' ? 'Présent' : myStats.todayStatus === 'late' ? 'En retard' : 'Non pointé'}
                  </p>
                  {myStats.todayStatus === 'absent' && (
                    <Button size="sm" className="mt-3" onClick={() => navigate('/attendance')}>
                      <LogIn className="h-4 w-4 mr-2" />
                      Pointer maintenant
                    </Button>
                  )}
                </CardContent>
              </Card>

              <Card className="stat-card">
                <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Ce mois-ci</CardTitle>
                  <CalendarDays className="h-5 w-5 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-success">{myStats.monthPresents}</p>
                      <p className="text-xs text-muted-foreground">Présences</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-warning">{myStats.monthLates}</p>
                      <p className="text-xs text-muted-foreground">Retards</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-destructive">{myStats.monthAbsents}</p>
                      <p className="text-xs text-muted-foreground">Absences</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-primary">{myStats.monthPresents + myStats.monthLates}</p>
                      <p className="text-xs text-muted-foreground">Total</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Quick links */}
            <Card className="stat-card">
              <CardContent className="pt-6">
                <div className="flex flex-wrap gap-3">
                  <Button variant="outline" onClick={() => navigate('/attendance')}>
                    <Clock className="h-4 w-4 mr-2" /> Pointage
                  </Button>
                  <Button variant="outline" onClick={() => navigate('/profile')}>
                    <Users className="h-4 w-4 mr-2" /> Mon profil
                  </Button>
                  <Button variant="outline" onClick={() => navigate('/tasks')}>
                    <ClipboardList className="h-4 w-4 mr-2" /> Mes tâches
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* My task stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Card className="stat-card">
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Mes tâches</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold font-display">{taskStats.total}</div></CardContent>
              </Card>
              <Card className="stat-card">
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">En cours</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold font-display text-blue-600">{taskStats.inProgress}</div></CardContent>
              </Card>
              <Card className="stat-card">
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Terminées</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold font-display text-success">{taskStats.completed}</div></CardContent>
              </Card>
              <Card className="stat-card">
                <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">En retard</CardTitle></CardHeader>
                <CardContent><div className="text-2xl font-bold font-display text-destructive">{taskStats.overdue}</div></CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
