import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, CalendarClock, Save, Search, Clock } from 'lucide-react';
import { getDepartmentLogo } from '@/lib/departments';

const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const;
const JOUR_LABELS: Record<string, string> = {
  lundi: 'Lundi',
  mardi: 'Mardi',
  mercredi: 'Mercredi',
  jeudi: 'Jeudi',
  vendredi: 'Vendredi',
  samedi: 'Samedi',
  dimanche: 'Dimanche',
};

interface DaySchedule {
  start: string;
  end: string;
}

type WeekSchedule = Record<string, DaySchedule | null>;

interface EmployeeOption {
  user_id: string;
  full_name: string;
  department: string | null;
}

const DEFAULT_SCHEDULE: WeekSchedule = {
  lundi: { start: '08:00', end: '17:00' },
  mardi: { start: '08:00', end: '17:00' },
  mercredi: { start: '08:00', end: '17:00' },
  jeudi: { start: '08:00', end: '17:00' },
  vendredi: { start: '08:00', end: '17:00' },
  samedi: null,
  dimanche: null,
};

export default function Schedules() {
  const { user, role } = useAuth();
  const { can, loading: permLoading } = usePermissions();
  const { toast } = useToast();

  const isAdmin = role === 'admin' || role === 'manager';

  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [schedule, setSchedule] = useState<WeekSchedule>({ ...DEFAULT_SCHEDULE });
  const [hasExisting, setHasExisting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');

  // All schedules for admin overview
  const [allSchedules, setAllSchedules] = useState<
    { user_id: string; full_name: string; department: string | null; schedule: WeekSchedule }[]
  >([]);

  const fetchEmployees = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('user_id, full_name, department')
      .eq('is_approved', true)
      .eq('archived', false)
      .order('full_name');
    if (data) setEmployees(data);
  }, []);

  const fetchAllSchedules = useCallback(async () => {
    const { data: schedules } = await supabase.from('employee_schedules').select('user_id, schedule');
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id, full_name, department')
      .eq('is_approved', true)
      .eq('archived', false)
      .order('full_name');

    if (schedules && profiles) {
      const scheduleMap: Record<string, WeekSchedule> = {};
      schedules.forEach((s) => {
        scheduleMap[s.user_id] = s.schedule as unknown as WeekSchedule;
      });
      setAllSchedules(
        profiles.map((p) => ({
          user_id: p.user_id,
          full_name: p.full_name,
          department: p.department,
          schedule: scheduleMap[p.user_id] || DEFAULT_SCHEDULE,
        }))
      );
    }
  }, []);

  const fetchSchedule = useCallback(
    async (userId: string) => {
      const { data } = await supabase
        .from('employee_schedules')
        .select('schedule')
        .eq('user_id', userId)
        .maybeSingle();
      if (data) {
        setSchedule(data.schedule as unknown as WeekSchedule);
        setHasExisting(true);
      } else {
        setSchedule({ ...DEFAULT_SCHEDULE });
        setHasExisting(false);
      }
    },
    []
  );

  useEffect(() => {
    const init = async () => {
      if (isAdmin) {
        await fetchEmployees();
        await fetchAllSchedules();
      } else if (user) {
        setSelectedUserId(user.id);
        await fetchSchedule(user.id);
      }
      setLoading(false);
    };
    init();
  }, [user, isAdmin, fetchEmployees, fetchAllSchedules, fetchSchedule]);

  useEffect(() => {
    if (selectedUserId && isAdmin) {
      fetchSchedule(selectedUserId);
    }
  }, [selectedUserId, isAdmin, fetchSchedule]);

  const handleDayToggle = (day: string, enabled: boolean) => {
    setSchedule((prev) => ({
      ...prev,
      [day]: enabled ? { start: '08:00', end: '17:00' } : null,
    }));
  };

  const handleTimeChange = (day: string, field: 'start' | 'end', value: string) => {
    setSchedule((prev) => {
      const current = prev[day];
      if (!current) return prev;
      const updated = { ...current, [field]: value };
      // Validate: end must be after start
      if (updated.end && updated.start && updated.end <= updated.start) {
        toast({ title: 'Horaire invalide', description: 'L\'heure de fin doit être après l\'heure de début.', variant: 'destructive' });
        return prev;
      }
      return { ...prev, [day]: updated };
    });
  };

  const handleSave = async () => {
    if (!selectedUserId) return;
    setSaving(true);

    if (hasExisting) {
      const { error } = await supabase
        .from('employee_schedules')
        .update({ schedule: schedule as any, updated_at: new Date().toISOString() })
        .eq('user_id', selectedUserId);
      if (error) {
        toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
      } else {
        toast({ title: '✅ Emploi du temps mis à jour' });
      }
    } else {
      const { error } = await supabase
        .from('employee_schedules')
        .insert({ user_id: selectedUserId, schedule: schedule as any });
      if (error) {
        toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
      } else {
        setHasExisting(true);
        toast({ title: '✅ Emploi du temps créé' });
      }
    }
    if (isAdmin) await fetchAllSchedules();
    setSaving(false);
  };

  const getDayHours = (day: DaySchedule | null): string => {
    if (!day) return 'Repos';
    return `${day.start} — ${day.end}`;
  };

  const getWeekTotal = (sched: WeekSchedule): number => {
    let total = 0;
    Object.values(sched).forEach((day) => {
      if (day) {
        const [sh, sm] = day.start.split(':').map(Number);
        const [eh, em] = day.end.split(':').map(Number);
        total += (eh + em / 60) - (sh + sm / 60);
      }
    });
    return Math.round(total * 10) / 10;
  };

  const filteredSchedules = allSchedules.filter(
    (s) =>
      s.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (s.department || '').toLowerCase().includes(search.toLowerCase())
  );

  // Current day name in French
  const getTodayName = (): string => {
    const days = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    return days[new Date().getDay()];
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

  return (
    <DashboardLayout>
      <div className="animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <h1 className="page-title">Emplois du temps</h1>
        </div>

        {/* Admin: employee selector + editor + overview */}
        {isAdmin ? (
          <div className="space-y-8">
            {/* Edit section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarClock className="h-5 w-5 text-primary" />
                  Modifier l'emploi du temps d'un employé
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="max-w-sm">
                  <Label>Sélectionner un employé</Label>
                  <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Choisir un employé..." />
                    </SelectTrigger>
                    <SelectContent>
                      {employees.map((emp) => (
                        <SelectItem key={emp.user_id} value={emp.user_id}>
                          <div className="flex items-center gap-2">
                            {emp.department && (
                              <img
                                src={getDepartmentLogo(emp.department)}
                                alt=""
                                className="h-4 w-4 rounded-full object-cover"
                              />
                            )}
                            {emp.full_name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {selectedUserId && (
                  <>
                    <div className="space-y-3">
                      {JOURS.map((jour) => {
                        const day = schedule[jour];
                        const isActive = day !== null;
                        const isToday = jour === getTodayName();
                        return (
                          <div
                            key={jour}
                            className={`flex items-center gap-4 p-3 rounded-lg border ${
                              isToday ? 'border-primary/50 bg-primary/5' : 'border-border'
                            }`}
                          >
                            <Switch checked={isActive} onCheckedChange={(v) => handleDayToggle(jour, v)} />
                            <span className={`w-24 font-medium text-sm ${isToday ? 'text-primary' : ''}`}>
                              {JOUR_LABELS[jour]}
                              {isToday && <Badge variant="outline" className="ml-2 text-[10px] py-0">Aujourd'hui</Badge>}
                            </span>
                            {isActive ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  type="time"
                                  value={day!.start}
                                  onChange={(e) => handleTimeChange(jour, 'start', e.target.value)}
                                  className="w-32"
                                />
                                <span className="text-muted-foreground">à</span>
                                <Input
                                  type="time"
                                  value={day!.end}
                                  onChange={(e) => handleTimeChange(jour, 'end', e.target.value)}
                                  className="w-32"
                                />
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground italic">Jour de repos</span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground">
                        Total semaine : <strong>{getWeekTotal(schedule)}h</strong>
                      </p>
                      <Button onClick={handleSave} disabled={saving}>
                        {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
                        Enregistrer
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Overview table */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display text-lg font-semibold">Vue d'ensemble</h2>
                <div className="relative max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Rechercher..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="table-header px-4 py-3 text-left">Employé</th>
                        {JOURS.map((j) => (
                          <th
                            key={j}
                            className={`table-header px-3 py-3 text-center text-xs ${
                              j === getTodayName() ? 'bg-primary/10 text-primary' : ''
                            }`}
                          >
                            {JOUR_LABELS[j].substring(0, 3)}
                          </th>
                        ))}
                        <th className="table-header px-3 py-3 text-center text-xs">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredSchedules.map((emp) => (
                        <tr
                          key={emp.user_id}
                          className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer"
                          onClick={() => setSelectedUserId(emp.user_id)}
                        >
                          <td className="px-4 py-3 text-sm">
                            <div className="flex items-center gap-2">
                              {emp.department && (
                                <img
                                  src={getDepartmentLogo(emp.department)}
                                  alt=""
                                  className="h-4 w-4 rounded-full object-cover"
                                />
                              )}
                              <span className="font-medium">{emp.full_name}</span>
                            </div>
                          </td>
                          {JOURS.map((j) => {
                            const day = emp.schedule[j];
                            const isToday = j === getTodayName();
                            return (
                              <td
                                key={j}
                                className={`px-3 py-3 text-center text-xs ${isToday ? 'bg-primary/5' : ''}`}
                              >
                                {day ? (
                                  <span className="whitespace-nowrap">
                                    {day.start}
                                    <br />
                                    {day.end}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">—</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="px-3 py-3 text-center text-xs font-medium">
                            {getWeekTotal(emp.schedule)}h
                          </td>
                        </tr>
                      ))}
                      {filteredSchedules.length === 0 && (
                        <tr>
                          <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                            Aucun employé trouvé
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          </div>
        ) : (
          /* Employee view: read-only schedule */
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="h-5 w-5 text-primary" />
                Mon emploi du temps
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {JOURS.map((jour) => {
                  const day = schedule[jour];
                  const isToday = jour === getTodayName();
                  return (
                    <div
                      key={jour}
                      className={`flex items-center justify-between p-3 rounded-lg border ${
                        isToday ? 'border-primary/50 bg-primary/5' : 'border-border'
                      }`}
                    >
                      <span className={`font-medium text-sm ${isToday ? 'text-primary' : ''}`}>
                        {JOUR_LABELS[jour]}
                        {isToday && (
                          <Badge variant="outline" className="ml-2 text-[10px] py-0">
                            Aujourd'hui
                          </Badge>
                        )}
                      </span>
                      <span className={`text-sm ${day ? 'font-medium' : 'text-muted-foreground italic'}`}>
                        {getDayHours(day)}
                      </span>
                    </div>
                  );
                })}
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                Total semaine : <strong>{getWeekTotal(schedule)}h</strong>
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
