import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Clock, LogIn, LogOut, Wifi, WifiOff, Loader2, ChevronLeft, ChevronRight, AlertTriangle, Radio, MapPin, Plus, Pencil, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const PAGE_SIZE = 15;

interface AttendanceRecord {
  id: string;
  clock_in: string;
  clock_out: string | null;
  status: string;
  ip_address: string | null;
  user_id: string;
  full_name?: string;
  added_by?: string | null;
  notes?: string | null;
}

interface EmployeeOption {
  user_id: string;
  full_name: string;
}

export default function Attendance() {
  const { user, role } = useAuth();
  const { can } = usePermissions();
  const { toast } = useToast();
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null);
  const [history, setHistory] = useState<AttendanceRecord[]>([]);
  const [currentIp, setCurrentIp] = useState<string>('');
  const [officeIps, setOfficeIps] = useState<string[]>(['0.0.0.0']);
  const [workStartTime, setWorkStartTime] = useState<string>('08:00');
  const [todaySchedule, setTodaySchedule] = useState<{ start: string; end: string } | null | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [ipAllowed, setIpAllowed] = useState<boolean | null>(null);
  const [gpsAllowed, setGpsAllowed] = useState<boolean | null>(null);
  const [gpsError, setGpsError] = useState<string>('');
  const [officeLat, setOfficeLat] = useState<number | null>(null);
  const [officeLng, setOfficeLng] = useState<number | null>(null);
  const [officeRadius, setOfficeRadius] = useState<number>(100);
  const [gpsDistance, setGpsDistance] = useState<number | null>(null);
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  // Fix dialog (clock-out correction)
  const [fixDialogOpen, setFixDialogOpen] = useState(false);
  const [fixRecord, setFixRecord] = useState<AttendanceRecord | null>(null);
  const [fixTime, setFixTime] = useState('');
  const [fixSubmitting, setFixSubmitting] = useState(false);
  // Admin: manual attendance dialog
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [manualForm, setManualForm] = useState({ userId: '', date: '', clockIn: '08:00', clockOut: '', status: 'present', notes: '' });
  const [manualSubmitting, setManualSubmitting] = useState(false);
  // Admin: edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<AttendanceRecord | null>(null);
  const [editForm, setEditForm] = useState({ clockIn: '', clockOut: '', status: 'present', notes: '' });
  const [editSubmitting, setEditSubmitting] = useState(false);
  // Admin: delete confirmation
  const [deleteRecord, setDeleteRecord] = useState<AttendanceRecord | null>(null);

  const isAdminOrManager = can('attendance.view_all');
  const canFix = can('attendance.fix');

  // Load employees for admin manual attendance
  useEffect(() => {
    if (!isAdminOrManager) return;
    supabase.from('profiles').select('user_id, full_name').eq('archived', false).eq('is_paused', false).order('full_name').then(({ data }) => {
      if (data) setEmployees(data);
    });
  }, [isAdminOrManager]);

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
        const latSetting = settings.find((s) => s.key === 'office_lat');
        const lngSetting = settings.find((s) => s.key === 'office_lng');
        const radiusSetting = settings.find((s) => s.key === 'office_radius');
        if (ipSetting) setOfficeIps(String(ipSetting.value ?? '0.0.0.0').replace(/"/g, '').split(',').map(s => s.trim()).filter(Boolean));
        if (startSetting) setWorkStartTime(String(startSetting.value ?? '').replace(/"/g, ''));
        const lat = parseFloat(String(latSetting?.value ?? '').replace(/"/g, ''));
        const lng = parseFloat(String(lngSetting?.value ?? '').replace(/"/g, ''));
        const rad = parseFloat(String(radiusSetting?.value ?? '100').replace(/"/g, ''));
        if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
          setOfficeLat(lat);
          setOfficeLng(lng);
          setOfficeRadius(isNaN(rad) ? 100 : rad);
        }
      }

      // Fetch today's record (or an open overnight shift from yesterday)
      if (user) {
        const today = new Date().toISOString().split('T')[0];
        const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

        // First check for an open overnight record from yesterday (no clock_out)
        const { data: overnightData } = await supabase
          .from('attendance')
          .select('*')
          .eq('user_id', user.id)
          .gte('clock_in', yesterday)
          .lt('clock_in', today)
          .is('clock_out', null)
          .limit(1);

        if (overnightData && overnightData.length > 0) {
          setTodayRecord(overnightData[0]);
        } else {
          const { data } = await supabase
            .from('attendance')
            .select('*')
            .eq('user_id', user.id)
            .gte('clock_in', today)
            .order('clock_in', { ascending: false })
            .limit(1);
          if (data && data.length > 0) setTodayRecord(data[0]);
        }

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
  const refreshHistory = useCallback(async () => {
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
  }, [user, page, isAdminOrManager]);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  // Haversine formula to calculate distance between two GPS points in meters
  const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000; // Earth radius in meters
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // GPS geolocation check (primary method)
  useEffect(() => {
    if (!officeLat || !officeLng) {
      // GPS not configured
      if (role !== 'bureau') setGpsAllowed(true);
      return;
    }

    if (!('geolocation' in navigator)) {
      setGpsError('Géolocalisation non supportée par ce navigateur');
      setGpsAllowed(false);
      return;
    }

    const checkGps = () => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const dist = haversineDistance(
            position.coords.latitude,
            position.coords.longitude,
            officeLat,
            officeLng,
          );
          setGpsDistance(Math.round(dist));
          setGpsAllowed(dist <= officeRadius);
          setGpsError('');
        },
        (err) => {
          if (err.code === 1) {
            setGpsError('Accès GPS refusé. Autorisez la géolocalisation dans votre navigateur.');
          } else if (err.code === 2) {
            setGpsError('Position GPS indisponible.');
          } else {
            setGpsError('Délai de géolocalisation dépassé.');
          }
          setGpsAllowed(false);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
      );
    };

    checkGps();
    const interval = setInterval(checkGps, 60000); // Recheck every 60s
    return () => clearInterval(interval);
  }, [role, officeLat, officeLng, officeRadius]);

  // IP check (fallback when GPS is not configured)
  useEffect(() => {
    if (currentIp && officeIps.length) {
      if (officeIps.length === 1 && officeIps[0] === '0.0.0.0') {
        setIpAllowed(true);
      } else {
        const match = officeIps.some(ip => {
          if (!ip || ip === '0.0.0.0') return false;
          // Compare only the first 3 octets (X.X.X.*) — the 4th changes frequently on WiFi
          const ipParts = ip.split('.');
          const currentParts = currentIp.split('.');
          if (ipParts.length === 4 && currentParts.length === 4) {
            return ipParts.slice(0, 3).every((seg, i) => seg === '*' || seg === currentParts[i]);
          }
          return currentIp === ip;
        });
        setIpAllowed(match);
        // Admin/manager always allowed to clock in regardless
        if (role !== 'bureau') setIpAllowed(true);
      }
    }
  }, [currentIp, officeIps, role]);

  // Combined permission: GPS (primary) OR IP (fallback)
  const locationAllowed = (() => {
    if (role !== 'bureau') return true;
    // If GPS is configured, use GPS result
    if (officeLat && officeLng) return gpsAllowed === true;
    // Otherwise fall back to IP
    return ipAllowed === true;
  })();

  const handleClockIn = async () => {
    if (!user || !locationAllowed) return;
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

    const now = new Date();
    const { error } = await supabase
      .from('attendance')
      .update({ clock_out: now.toISOString() })
      .eq('id', todayRecord.id);

    if (error) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } else {
      setTodayRecord({ ...todayRecord, clock_out: now.toISOString() });
      // Warn if early departure
      if (todaySchedule) {
        const [endH, endM] = todaySchedule.end.split(':').map(Number);
        const scheduledEnd = new Date(now);
        scheduledEnd.setHours(endH, endM, 0, 0);
        // Overnight shift: if end < start, the end is the next day
        const isOvernight = todaySchedule.end < todaySchedule.start;
        if (isOvernight) {
          // If we're still on the same calendar day as clock_in, end is tomorrow
          const clockInDate = new Date(todayRecord.clock_in).toISOString().split('T')[0];
          const todayDate = now.toISOString().split('T')[0];
          if (todayDate === clockInDate) {
            scheduledEnd.setDate(scheduledEnd.getDate() + 1);
          }
        }
        if (now < new Date(scheduledEnd.getTime() - 30 * 60000)) {
          toast({ title: '⚠️ Départ anticipé', description: `Vous partez avant ${todaySchedule.end} (fin prévue)`, variant: 'destructive' });
        } else {
          toast({ title: '👋 Départ enregistré', description: `À ${format(now, 'HH:mm')}` });
        }
      } else {
        toast({ title: '👋 Départ enregistré', description: `À ${format(now, 'HH:mm')}` });
      }
    }
    setSubmitting(false);
  };

  const handleFixClockOut = async () => {
    if (!fixRecord || !fixTime) return;

    // Build full ISO from the record's clock_in date + entered time
    const clockInDate = new Date(fixRecord.clock_in);
    const dateStr = fixRecord.clock_in.split('T')[0];
    let clockOutISO = new Date(`${dateStr}T${fixTime}:00`).toISOString();

    // If the entered time is before clock_in time, assume next day (overnight shift)
    if (new Date(clockOutISO) <= clockInDate) {
      const nextDay = new Date(clockInDate);
      nextDay.setDate(nextDay.getDate() + 1);
      const nextDateStr = nextDay.toISOString().split('T')[0];
      clockOutISO = new Date(`${nextDateStr}T${fixTime}:00`).toISOString();
    }

    setFixSubmitting(true);

    const { error } = await supabase
      .from('attendance')
      .update({ clock_out: clockOutISO })
      .eq('id', fixRecord.id);

    if (error) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } else {
      await refreshHistory();
      toast({ title: '✅ Départ corrigé', description: `Heure de départ mise à ${fixTime}` });
      setFixDialogOpen(false);
    }
    setFixSubmitting(false);
  };

  // ─── Admin: Manual attendance entry ───
  const handleManualAttendance = async () => {
    if (!manualForm.userId || !manualForm.date || !manualForm.clockIn) return;
    setManualSubmitting(true);

    const clockInISO = new Date(`${manualForm.date}T${manualForm.clockIn}:00`).toISOString();
    let clockOutISO: string | null = null;
    if (manualForm.clockOut) {
      clockOutISO = new Date(`${manualForm.date}T${manualForm.clockOut}:00`).toISOString();
      // Overnight: if clock_out time < clock_in time, it's the next day
      if (new Date(clockOutISO) <= new Date(clockInISO)) {
        const nextDay = new Date(manualForm.date);
        nextDay.setDate(nextDay.getDate() + 1);
        clockOutISO = new Date(`${nextDay.toISOString().split('T')[0]}T${manualForm.clockOut}:00`).toISOString();
      }
    }

    const { error } = await supabase.from('attendance').insert({
      user_id: manualForm.userId,
      clock_in: clockInISO,
      clock_out: clockOutISO,
      status: manualForm.status,
      added_by: user!.id,
      notes: manualForm.notes || null,
    });

    if (error) {
      const msg = error.message.includes('existe déjà')
        ? 'Un pointage existe déjà pour cet employé à cette date.'
        : error.message;
      toast({ title: 'Erreur', description: msg, variant: 'destructive' });
    } else {
      toast({ title: '✅ Pointage ajouté manuellement' });
      setManualDialogOpen(false);
      setManualForm({ userId: '', date: '', clockIn: '08:00', clockOut: '', status: 'present', notes: '' });
      await refreshHistory();
    }
    setManualSubmitting(false);
  };

  // ─── Admin: Edit attendance record ───
  const openEditDialog = (record: AttendanceRecord) => {
    setEditRecord(record);
    setEditForm({
      clockIn: format(new Date(record.clock_in), 'HH:mm'),
      clockOut: record.clock_out ? format(new Date(record.clock_out), 'HH:mm') : '',
      status: record.status,
      notes: record.notes || '',
    });
    setEditDialogOpen(true);
  };

  const handleEditAttendance = async () => {
    if (!editRecord) return;
    setEditSubmitting(true);

    const dateStr = editRecord.clock_in.split('T')[0];
    const clockInISO = new Date(`${dateStr}T${editForm.clockIn}:00`).toISOString();
    let clockOutISO: string | null = null;
    if (editForm.clockOut) {
      clockOutISO = new Date(`${dateStr}T${editForm.clockOut}:00`).toISOString();
      if (new Date(clockOutISO) <= new Date(clockInISO)) {
        const nextDay = new Date(dateStr);
        nextDay.setDate(nextDay.getDate() + 1);
        clockOutISO = new Date(`${nextDay.toISOString().split('T')[0]}T${editForm.clockOut}:00`).toISOString();
      }
    }

    const { error } = await supabase
      .from('attendance')
      .update({
        clock_in: clockInISO,
        clock_out: clockOutISO,
        status: editForm.status,
        notes: editForm.notes || null,
      })
      .eq('id', editRecord.id);

    if (error) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: '✅ Pointage modifié' });
      setEditDialogOpen(false);
      await refreshHistory();
    }
    setEditSubmitting(false);
  };

  // ─── Admin: Delete attendance record ───
  const handleDeleteAttendance = async () => {
    if (!deleteRecord) return;
    const { error } = await supabase.from('attendance').delete().eq('id', deleteRecord.id);
    if (error) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: '✅ Pointage supprimé' });
      await refreshHistory();
    }
    setDeleteRecord(null);
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

        {/* Location Status */}
        {(role === 'bureau' || role === 'admin' || role === 'manager') && (
          <Card className={`stat-card mb-6 max-w-lg ${role !== 'bureau' ? 'border-blue-200 bg-blue-50/30 dark:border-blue-900 dark:bg-blue-950/20' : ''}`}>
            <CardContent className="pt-5 space-y-3">
              {role !== 'bureau' && (
                <p className="text-xs font-medium text-blue-600 dark:text-blue-400 mb-2">📊 Statut de localisation (informatif)</p>
              )}
              {/* GPS status (primary) */}
              {officeLat && officeLng && (
                <div className="flex items-center gap-3">
                  {gpsAllowed ? (
                    <>
                      <MapPin className="h-5 w-5 text-success" />
                      <div>
                        <p className="text-sm font-medium text-success">Position GPS confirmée — vous êtes au bureau</p>
                        {gpsDistance !== null && (
                          <p className="text-xs text-muted-foreground">Distance: {gpsDistance}m (rayon autorisé: {officeRadius}m)</p>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <MapPin className="h-5 w-5 text-destructive" />
                      <div>
                        <p className="text-sm font-medium text-destructive">
                          {gpsError || 'Vous n\'êtes pas dans le périmètre du bureau'}
                        </p>
                        {gpsDistance !== null && (
                          <p className="text-xs text-muted-foreground">Distance: {gpsDistance}m (rayon autorisé: {officeRadius}m)</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
              {/* IP status (fallback or additional info for admin) */}
              {((!officeLat || !officeLng) || role !== 'bureau') && currentIp && (
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
              )}
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
                    {todaySchedule.end < todaySchedule.start && ' (lendemain 🌙)'}
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
                  disabled={submitting || !locationAllowed}
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg font-semibold">
            {isAdminOrManager ? 'Historique de tous les employés' : 'Historique récent'}
          </h2>
          {isAdminOrManager && canFix && (
            <Button size="sm" onClick={() => { setManualForm({ userId: '', date: new Date().toISOString().split('T')[0], clockIn: '08:00', clockOut: '', status: 'present', notes: '' }); setManualDialogOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" /> Ajouter un pointage
            </Button>
          )}
        </div>
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
                  {isAdminOrManager && canFix && <th className="table-header px-4 py-3 text-left">Actions</th>}
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
                        <>
                          {format(new Date(record.clock_out), 'HH:mm')}
                          {format(new Date(record.clock_out), 'dd/MM') !== format(new Date(record.clock_in), 'dd/MM') && (
                            <span className="text-[10px] text-muted-foreground ml-1">
                              ({format(new Date(record.clock_out), 'dd/MM')})
                            </span>
                          )}
                        </>
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
                    {isAdminOrManager && canFix && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            className="p-1 rounded hover:bg-muted transition-colors"
                            title="Modifier"
                            onClick={() => openEditDialog(record)}
                          >
                            <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-primary" />
                          </button>
                          <button
                            className="p-1 rounded hover:bg-destructive/10 transition-colors"
                            title="Supprimer"
                            onClick={() => setDeleteRecord(record)}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {history.length === 0 && (
                  <tr>
                    <td colSpan={isAdminOrManager ? (canFix ? 7 : 6) : 5} className="px-4 py-8 text-center text-muted-foreground">
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
                <p className="text-xs text-muted-foreground">
                  Si l'heure saisie est avant l'arrivée, le départ sera placé au lendemain (horaire de nuit).
                </p>
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

      {/* Dialog: Admin manual attendance entry */}
      <Dialog open={manualDialogOpen} onOpenChange={setManualDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ajouter un pointage manuellement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Employé</Label>
              <Select value={manualForm.userId} onValueChange={(v) => setManualForm({ ...manualForm, userId: v })}>
                <SelectTrigger><SelectValue placeholder="Sélectionner un employé" /></SelectTrigger>
                <SelectContent>
                  {employees.map((e) => (
                    <SelectItem key={e.user_id} value={e.user_id}>{e.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={manualForm.date} onChange={(e) => setManualForm({ ...manualForm, date: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Heure d'arrivée</Label>
                <Input type="time" value={manualForm.clockIn} onChange={(e) => setManualForm({ ...manualForm, clockIn: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Heure de départ (optionnel)</Label>
                <Input type="time" value={manualForm.clockOut} onChange={(e) => setManualForm({ ...manualForm, clockOut: e.target.value })} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Statut</Label>
              <Select value={manualForm.status} onValueChange={(v) => setManualForm({ ...manualForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="present">Présent</SelectItem>
                  <SelectItem value="late">En retard</SelectItem>
                  <SelectItem value="absent">Absent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Remarque (optionnel)</Label>
              <Textarea
                value={manualForm.notes}
                onChange={(e) => setManualForm({ ...manualForm, notes: e.target.value })}
                placeholder="Raison du pointage manuel..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleManualAttendance} disabled={!manualForm.userId || !manualForm.date || manualSubmitting}>
              {manualSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Plus className="h-4 w-4 mr-2" />}
              Ajouter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Admin edit attendance */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Modifier le pointage</DialogTitle>
          </DialogHeader>
          {editRecord && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Employé : <strong>{editRecord.full_name || '—'}</strong><br />
                Date : <strong>{format(new Date(editRecord.clock_in), 'dd/MM/yyyy')}</strong>
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Heure d'arrivée</Label>
                  <Input type="time" value={editForm.clockIn} onChange={(e) => setEditForm({ ...editForm, clockIn: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Heure de départ</Label>
                  <Input type="time" value={editForm.clockOut} onChange={(e) => setEditForm({ ...editForm, clockOut: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Statut</Label>
                <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="present">Présent</SelectItem>
                    <SelectItem value="late">En retard</SelectItem>
                    <SelectItem value="absent">Absent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Remarque</Label>
                <Textarea
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  placeholder="Raison de la modification..."
                  rows={2}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Annuler</Button>
            <Button onClick={handleEditAttendance} disabled={editSubmitting}>
              {editSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Pencil className="h-4 w-4 mr-2" />}
              Enregistrer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteRecord} onOpenChange={(open) => { if (!open) setDeleteRecord(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce pointage ?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteRecord && (
                <>Pointage de <strong>{deleteRecord.full_name || '—'}</strong> du <strong>{format(new Date(deleteRecord.clock_in), 'dd/MM/yyyy')}</strong>. Cette action est irréversible.</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteAttendance} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
