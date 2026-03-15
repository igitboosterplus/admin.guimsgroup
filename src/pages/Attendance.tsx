import { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Clock, LogIn, LogOut, Wifi, WifiOff, Loader2, ChevronLeft, ChevronRight, AlertTriangle, Radio } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const PAGE_SIZE = 15;

interface AttendanceRecord {
  id: string;
  clock_in: string;
  clock_out: string | null;
  status: string;
  ip_address: string | null;
  user_id: string;
  full_name?: string;
}

export default function Attendance() {
  const { user, role } = useAuth();
  const { can } = usePermissions();
  const { toast } = useToast();
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [currentIp, setCurrentIp] = useState<string>('');
  const [officeIp, setOfficeIp] = useState<string>('0.0.0.0');
  const [workStartTime, setWorkStartTime] = useState<string>('08:00');
  const [todaySchedule, setTodaySchedule] = useState<{ start: string; end: string } | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [ipAllowed, setIpAllowed] = useState<boolean | null>(null);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [fixDialogOpen, setFixDialogOpen] = useState(false);
  const [fixRecord, setFixRecord] = useState<AttendanceRecord | null>(null);
  const [fixTime, setFixTime] = useState('');
  const [fixSubmitting, setFixSubmitting] = useState(false);

  const isAdminOrManager = can('attendance.view_all');
  const canFix = can('attendance.fix');

  useEffect(() => {
    const init = async () => {
      // Fetch current IP
      try {
        const res = await fetch('https://api.ipify.org?format=json');
        const data = await res.json();
        setCurrentIp(data.ip);
      } catch {
        setCurrentIp('unknown');
      }

      // Fetch settings
      const { data: settings } = await supabase.from('app_settings').select('*');
      if (settings) {
        const ipSetting = settings.find((s) => s.key === 'office_ip');
        const startSetting = settings.find((s) => s.key === 'work_start_time');
        if (ipSetting) setOfficeIp(String(ipSetting.value ?? '').replace(/"/g, ''));
        if (startSetting) setWorkStartTime(String(startSetting.value ?? '').replace(/"/g, ''));
      }

      // Fetch today's record
      if (user) {
        const today = new Date().toISOString().split('T')[0];
        const { data } = await supabase
          .from('attendance')
          .select('*')
          .eq('user_id', user.id)
          .gte('clock_in', today)
          .order('clock_in', { ascending: false })
          .limit(1);
        if (data && data.length > 0) setTodayRecord(data[0]);

        // Fetch personal schedule
        const joursFr = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
        const todayName = joursFr[new Date().getDay()];
        const { data: schedData } = await supabase
          .from('employee_schedules')
          .select('schedule')
          .eq('user_id', user.id)
          .maybeSingle();
        if (schedData) {
          const sched = schedData.schedule as Record<string, { start: string; end: string } | null>;
          const daySchedule = sched[todayName];
          setTodaySchedule(daySchedule);
          if (daySchedule) setWorkStartTime(daySchedule.start);
        } else {
          setTodaySchedule(undefined);
        }
      }

      setLoading(false);
    };

    init();
  }, [user]);

  // Fetch history with pagination
  useEffect(() => {
    const fetchHistory = async () => {
      if (!user) return;

      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      if (isAdminOrManager) {
        // Admin/Manager sees all employees' attendance
        const { data, count } = await supabase
          .from('attendance')
          .select('*', { count: 'exact' })
          .order('clock_in', { ascending: false })
          .range(from, to);

        if (data) {
          // Enrich with employee names
          const userIds = [...new Set(data.map((d) => d.user_id))];
          const { data: profiles } = await supabase.from('profiles').select('user_id, full_name').in('user_id', userIds);
          const nameMap: Record<string, string> = {};
          profiles?.forEach((p) => { nameMap[p.user_id] = p.full_name; });

          setHistory(data.map((d) => ({ ...d, full_name: nameMap[d.user_id] || '—' })));
        }
        setTotalCount(count || 0);
      } else {
        const { data, count } = await supabase
          .from('attendance')
          .select('*', { count: 'exact' })
          .eq('user_id', user.id)
          .order('clock_in', { ascending: false })
          .range(from, to);

        if (data) setHistory(data);
        setTotalCount(count || 0);
      }
    };

    fetchHistory();
  }, [user, page, role, isAdminOrManager]);

  useEffect(() => {
    if (currentIp && officeIp) {
      // Bureau users must use office IP; terrain users can use any
      if (role === 'bureau') {
        setIpAllowed(officeIp === '0.0.0.0' || currentIp === officeIp);
      } else {
        setIpAllowed(true);
      }
    }
  }, [currentIp, officeIp, role]);

  const handleClockIn = async () => {
    if (!user || !ipAllowed) return;
    setSubmitting(true);

    const now = new Date();
    const [startH, startM] = workStartTime.split(':').map(Number);
    const startDate = new Date(now);
    startDate.setHours(startH, startM, 0, 0);
    const isLate = now > startDate;

    const { data, error } = await supabase
      .from('attendance')
      .insert({
        user_id: user.id,
        ip_address: currentIp,
        status: isLate ? 'late' : 'present',
      })
      .select()
      .single();

    if (error) {
      const msg = error.message.includes('existe déjà')
        ? 'Vous avez déjà pointé aujourd\'hui.'
        : error.message;
      toast({ title: 'Erreur', description: msg, variant: 'destructive' });
    } else {
      setTodayRecord(data);
      toast({
        title: isLate ? '⚠️ Arrivée en retard' : '✅ Arrivée enregistrée',
        description: `Pointage à ${format(now, 'HH:mm')}`,
      });
    }
    setSubmitting(false);
  };

  const handleClockOut = async () => {
    if (!todayRecord) return;
    setSubmitting(true);

    const { error } = await supabase
      .from('attendance')
      .update({ clock_out: new Date().toISOString() })
      .eq('id', todayRecord.id);

    if (error) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } else {
      setTodayRecord({ ...todayRecord, clock_out: new Date().toISOString() });
      toast({ title: '👋 Départ enregistré', description: `À ${format(new Date(), 'HH:mm')}` });
    }
    setSubmitting(false);
  };

  const handleFixClockOut = async () => {
    if (!fixRecord || !fixTime) return;
    setFixSubmitting(true);

    // Build full ISO from the record's clock_in date + entered time
    const dateStr = fixRecord.clock_in.split('T')[0];
    const clockOutISO = new Date(`${dateStr}T${fixTime}:00`).toISOString();

    const { error } = await supabase
      .from('attendance')
      .update({ clock_out: clockOutISO })
      .eq('id', fixRecord.id);

    if (error) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } else {
      setHistory((prev) =>
        prev.map((r) => (r.id === fixRecord.id ? { ...r, clock_out: clockOutISO } : r))
      );
      toast({ title: '✅ Départ corrigé', description: `Heure de départ mise à ${fixTime}` });
      setFixDialogOpen(false);
    }
    setFixSubmitting(false);
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      present: 'bg-success/10 text-success',
      late: 'bg-warning/10 text-warning',
      absent: 'bg-destructive/10 text-destructive',
    };
    const labels: Record<string, string> = { present: 'Présent', late: 'En retard', absent: 'Absent' };
    return <span className={`badge-status ${styles[status] || ''}`}>{labels[status] || status}</span>;
  };

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
        <h1 className="page-title mb-6">Pointage</h1>

        {/* IP Status for bureau */}
        {role === 'bureau' && (
          <Card className="stat-card mb-6 max-w-lg">
            <CardContent className="pt-5">
              <div className="flex items-center gap-3">
                {ipAllowed ? (
                  <>
                    <Wifi className="h-5 w-5 text-success" />
                    <div>
                      <p className="text-sm font-medium text-success">Connecté au WiFi du bureau</p>
                      <p className="text-xs text-muted-foreground">IP: {currentIp}</p>
                    </div>
                  </>
                ) : (
                  <>
                    <WifiOff className="h-5 w-5 text-destructive" />
                    <div>
                      <p className="text-sm font-medium text-destructive">WiFi du bureau non détecté</p>
                      <p className="text-xs text-muted-foreground">
                        Votre IP ({currentIp}) ne correspond pas à l'IP du bureau. Pointage impossible.
                      </p>
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Auto-detection info */}
        <Card className="stat-card mb-6 max-w-lg border-dashed">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Radio className="h-5 w-5 text-primary" />
                <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-primary animate-ping" />
              </div>
              <div>
                <p className="text-sm font-medium">Détection automatique active</p>
                <p className="text-xs text-muted-foreground">
                  Le système vérifie votre connexion WiFi toutes les 2 min.
                  {!todayRecord && ' Arrivée automatique dès détection sur le réseau du bureau.'}
                  {todayRecord && !todayRecord.clock_out && ' Départ automatique après 1h15 d\'absence du réseau.'}
                  {todayRecord?.clock_out && ' Journée complète — pointage terminé.'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Today's schedule */}
        <Card className="stat-card mb-6 max-w-lg">
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <Clock className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-medium">Horaire du jour</p>
                {todaySchedule === null ? (
                  <p className="text-xs text-muted-foreground">Jour de repos — pas de pointage requis</p>
                ) : todaySchedule ? (
                  <p className="text-xs text-muted-foreground">
                    {todaySchedule.start} — {todaySchedule.end}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Horaire par défaut : {workStartTime} (pas d'emploi du temps personnalisé)
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Clock In/Out Card */}
        <Card className="stat-card mb-8 max-w-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Aujourd'hui — {format(new Date(), 'EEEE d MMMM yyyy', { locale: fr })}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!todayRecord ? (
              <div>
                <p className="text-sm text-muted-foreground mb-4">Vous n'avez pas encore pointé aujourd'hui.</p>
                <Button
                  onClick={handleClockIn}
                  disabled={submitting || ipAllowed === false}
                  className="w-full"
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <LogIn className="h-4 w-4 mr-2" />}
                  Marquer mon arrivée
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Arrivée</span>
                  <span className="font-medium">{format(new Date(todayRecord.clock_in), 'HH:mm')}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-muted-foreground">Statut</span>
                  {getStatusBadge(todayRecord.status)}
                </div>
                {todayRecord.clock_out ? (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-muted-foreground">Départ</span>
                      <span className="font-medium">{format(new Date(todayRecord.clock_out), 'HH:mm')}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t">
                      <span className="text-sm text-muted-foreground">Durée</span>
                      <span className="font-medium text-primary">
                        {(() => {
                          const ms = new Date(todayRecord.clock_out).getTime() - new Date(todayRecord.clock_in).getTime();
                          const h = Math.floor(ms / 3600000);
                          const m = Math.floor((ms % 3600000) / 60000);
                          return `${h}h${m.toString().padStart(2, '0')}`;
                        })()}
                      </span>
                    </div>
                  </>
                ) : (
                  <Button onClick={handleClockOut} variant="outline" disabled={submitting} className="w-full mt-2">
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <LogOut className="h-4 w-4 mr-2" />}
                    Marquer mon départ
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* History */}
        <h2 className="font-display text-lg font-semibold mb-4">
          {isAdminOrManager ? 'Historique de tous les employés' : 'Historique récent'}
        </h2>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b bg-muted/50">
                  {isAdminOrManager && <th className="table-header px-4 py-3 text-left">Employé</th>}
                  <th className="table-header px-4 py-3 text-left">Date</th>
                  <th className="table-header px-4 py-3 text-left">Arrivée</th>
                  <th className="table-header px-4 py-3 text-left">Départ</th>
                  <th className="table-header px-4 py-3 text-left">Durée</th>
                  <th className="table-header px-4 py-3 text-left">Statut</th>
                </tr>
              </thead>
              <tbody>
                {history.map((record) => (
                  <tr key={record.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                    {isAdminOrManager && (
                      <td className="px-4 py-3 text-sm font-medium">{record.full_name || '—'}</td>
                    )}
                    <td className="px-4 py-3 text-sm">
                      {format(new Date(record.clock_in), 'dd/MM/yyyy')}
                    </td>
                    <td className="px-4 py-3 text-sm font-medium">
                      {format(new Date(record.clock_in), 'HH:mm')}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {record.clock_out ? (
                        format(new Date(record.clock_out), 'HH:mm')
                      ) : (
                        <div className="flex items-center gap-1">
                          <AlertTriangle className="h-4 w-4 text-warning" />
                          <span className="text-warning text-xs font-medium">Oubli</span>
                          {canFix && (
                            <button
                              className="ml-1 text-xs underline text-primary hover:text-primary/80"
                              onClick={() => {
                                setFixRecord(record);
                                setFixTime('');
                                setFixDialogOpen(true);
                              }}
                            >
                              Corriger
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-muted-foreground">
                      {record.clock_out ? (() => {
                        const ms = new Date(record.clock_out).getTime() - new Date(record.clock_in).getTime();
                        const h = Math.floor(ms / 3600000);
                        const m = Math.floor((ms % 3600000) / 60000);
                        return `${h}h${m.toString().padStart(2, '0')}`;
                      })() : '—'}
                    </td>
                    <td className="px-4 py-3">{getStatusBadge(record.status)}</td>
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr>
                    <td colSpan={isAdminOrManager ? 6 : 5} className="px-4 py-8 text-center text-muted-foreground">
                      Aucun historique de pointage
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalCount > PAGE_SIZE && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <p className="text-sm text-muted-foreground">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, totalCount)} sur {totalCount}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                  <ChevronLeft className="h-4 w-4 mr-1" /> Précédent
                </Button>
                <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= totalCount} onClick={() => setPage(page + 1)}>
                  Suivant <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Dialog correction départ manquant (admin/manager) */}
      <Dialog open={fixDialogOpen} onOpenChange={setFixDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Corriger l'heure de départ</DialogTitle>
          </DialogHeader>
          {fixRecord && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Employé : <strong>{fixRecord.full_name || '—'}</strong><br />
                Date : <strong>{format(new Date(fixRecord.clock_in), 'dd/MM/yyyy')}</strong><br />
                Arrivée : <strong>{format(new Date(fixRecord.clock_in), 'HH:mm')}</strong>
              </p>
              <div className="space-y-2">
                <Label htmlFor="fix-time">Heure de départ réelle</Label>
                <Input
                  id="fix-time"
                  type="time"
                  value={fixTime}
                  onChange={(e) => setFixTime(e.target.value)}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFixDialogOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleFixClockOut} disabled={!fixTime || fixSubmitting}>
              {fixSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
