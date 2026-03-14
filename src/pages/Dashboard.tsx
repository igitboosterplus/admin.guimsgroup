import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, Clock, AlertTriangle, CheckCircle, LogIn, CalendarDays, ClipboardList } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { getDepartmentLogo } from '@/lib/departments';

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
  const [stats, setStats] = useState({ totalEmployees: 0, presentToday: 0, lateToday: 0, absentToday: 0 });
  const [weeklyData, setWeeklyData] = useState<WeeklyData[]>([]);
  const [deptData, setDeptData] = useState<DeptData[]>([]);
  const [myStats, setMyStats] = useState({ todayStatus: '' as string, monthPresents: 0, monthLates: 0, monthAbsents: 0 });
  const [taskStats, setTaskStats] = useState({ total: 0, completed: 0, inProgress: 0, overdue: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      const today = new Date().toISOString().split('T')[0];

      if (role === 'admin' || role === 'manager') {
        const [employeesRes, attendanceRes, profilesRes] = await Promise.all([
          supabase.from('profiles').select('id', { count: 'exact' }).eq('is_approved', true),
          supabase.from('attendance').select('*').gte('clock_in', today),
          supabase.from('profiles').select('department').eq('is_approved', true),
        ]);

        const attendance = attendanceRes.data || [];
        const totalEmployees = employeesRes.count || 0;
        setStats({
          totalEmployees,
          presentToday: attendance.length,
          lateToday: attendance.filter((a) => a.status === 'late').length,
          absentToday: Math.max(0, totalEmployees - attendance.length),
        });

        // Department breakdown
        const deptMap: Record<string, number> = {};
        (profilesRes.data || []).forEach((p) => {
          const dept = p.department || 'Non assigné';
          deptMap[dept] = (deptMap[dept] || 0) + 1;
        });
        setDeptData(Object.entries(deptMap).map(([name, value]) => ({ name, value })));

        // Weekly attendance (last 7 working days)
        const days: WeeklyData[] = [];
        const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dateStr = d.toISOString().split('T')[0];
          const nextDay = new Date(d);
          nextDay.setDate(nextDay.getDate() + 1);

          const { data: dayAtt } = await supabase
            .from('attendance')
            .select('status')
            .gte('clock_in', dateStr)
            .lt('clock_in', nextDay.toISOString().split('T')[0]);

          const records = dayAtt || [];
          days.push({
            day: `${dayNames[d.getDay()]} ${d.getDate()}`,
            presents: records.filter((a) => a.status === 'present').length,
            retards: records.filter((a) => a.status === 'late').length,
            absents: Math.max(0, totalEmployees - records.length),
          });
        }
        setWeeklyData(days);
      }
    };

    // Personal stats for all users
    const fetchMyStats = async () => {
      if (!user) return;
      const today = new Date().toISOString().split('T')[0];
      const monthStart = today.substring(0, 7) + '-01';

      const [todayRes, monthRes] = await Promise.all([
        supabase.from('attendance').select('status').eq('user_id', user.id).gte('clock_in', today).limit(1),
        supabase.from('attendance').select('status').eq('user_id', user.id).gte('clock_in', monthStart),
      ]);

      const todayRecord = todayRes.data?.[0];
      const monthRecords = monthRes.data || [];

      setMyStats({
        todayStatus: todayRecord?.status || 'absent',
        monthPresents: monthRecords.filter((r) => r.status === 'present').length,
        monthLates: monthRecords.filter((r) => r.status === 'late').length,
        monthAbsents: 0, // calculated server-side in Reports
      });
    };

    fetchStats();
    fetchMyStats();

    // Task stats
    const fetchTaskStats = async () => {
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
    };
    fetchTaskStats();
  }, [role, user]);

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
              {statCards.map((stat) => (
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
                  {weeklyData.length > 0 ? (
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
                      Chargement...
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
                      Chargement...
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
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
