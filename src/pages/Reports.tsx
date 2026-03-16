import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Download, FileDown, RotateCcw, Brain, TrendingUp, AlertTriangle, CheckCircle, Lightbulb, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
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
import { getDepartmentLogo } from '@/lib/departments';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { analyzeReports, type AIAnalysisResult, type EmployeeReportData } from '@/lib/ai-analysis';

interface EmployeeReport {
  user_id: string;
  full_name: string;
  department: string | null;
  position: string | null;
  base_salary: number;
  presents: number;
  lates: number;
  absents: number;
  absence_hours: number;
  overtime_days: number;
  overtime_bonus: number;
  overtime_approved_hours: number;
  deduction: number;
  net_salary: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  tasks_assigned: number;
  tasks_completed: number;
  tasks_overdue: number;
  tasks_completion_rate: number;
  tasks_on_time_rate: number;
  tasks_avg_days: number;
  task_score: number;
}

export default function Reports() {
  const { can, loading: permLoading } = usePermissions();
  const { role } = useAuth();
  const { toast } = useToast();
  const [month, setMonth] = useState(() => format(new Date(), 'yyyy-MM'));
  const [reports, setReports] = useState<EmployeeReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<Record<string, any>>({});
  const [resetTarget, setResetTarget] = useState<EmployeeReport | null>(null);
  const [resetting, setResetting] = useState(false);
  const [fetchTrigger, setFetchTrigger] = useState(0);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const isAdmin = role === 'admin';

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase.from('app_settings').select('*');
      const map: Record<string, any> = {};
      data?.forEach((s) => { map[s.key] = s.value; });
      setSettings(map);
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    const fetchReport = async () => {
      setLoading(true);
      const [year, mon] = month.split('-').map(Number);
      const startDate = new Date(year, mon - 1, 1).toISOString();
      const endDate = new Date(year, mon, 0, 23, 59, 59).toISOString();

      const [profilesRes, attendanceRes, leavesRes, tasksRes] = await Promise.all([
        supabase.from('profiles').select('*'),
        supabase.from('attendance').select('*').gte('clock_in', startDate).lte('clock_in', endDate),
        supabase.from('leave_requests').select('*').eq('status', 'approved')
          .lte('start_date', new Date(year, mon, 0).toISOString().split('T')[0])
          .gte('end_date', new Date(year, mon - 1, 1).toISOString().split('T')[0]),
        supabase.from('tasks').select('*')
          .gte('created_at', startDate).lte('created_at', endDate),
      ]);

      const profiles = (profilesRes.data || []).filter(
        (p) => p.is_approved && !p.archived && !(p as any).is_paused
      );
      const attendance = attendanceRes.data || [];
      const approvedLeaves = leavesRes.data || [];
      const monthTasks = tasksRes.data || [];

      // Helper: count working days of a leave that fall within this month
      const countLeaveDaysInMonth = (startStr: string, endStr: string) => {
        const mStart = new Date(year, mon - 1, 1);
        const mEnd = new Date(year, mon, 0);
        const s = new Date(startStr) < mStart ? mStart : new Date(startStr);
        const e = new Date(endStr) > mEnd ? mEnd : new Date(endStr);
        let count = 0;
        const cur = new Date(s);
        while (cur <= e) {
          if (cur.getDay() !== 0) count++;
          cur.setDate(cur.getDate() + 1);
        }
        return count;
      };

      // Horaires de travail depuis les paramètres
      const workStart = String(settings.work_start_time || '08:00').replace(/"/g, '');
      const workEnd = String(settings.work_end_time || '17:00').replace(/"/g, '');
      const [startH, startM] = workStart.split(':').map(Number);
      const [endH, endM] = workEnd.split(':').map(Number);
      const GRACE_MINUTES = 30; // Tolérance avant constat d'absence

      const reportData: EmployeeReport[] = profiles.map((p) => {
        // Determine the earliest date this employee should be counted from:
        // max(1st of month, profile created_at, hire_date, counters_reset_at)
        const monthStart = new Date(year, mon - 1, 1);
        const profileCreated = new Date(p.created_at);
        const hireDate = p.hire_date ? new Date(p.hire_date) : null;
        const resetAt = (p as any).counters_reset_at ? new Date((p as any).counters_reset_at) : null;

        // Pick the latest date as the starting point
        let countFrom = monthStart;
        if (profileCreated > countFrom) countFrom = profileCreated;
        if (hireDate && hireDate > countFrom) countFrom = hireDate;
        if (resetAt && resetAt > countFrom) countFrom = resetAt;

        // Filter attendance: only records AFTER the effective start date
        const userAtt = attendance.filter((a) => {
          if (a.user_id !== p.user_id) return false;
          if (new Date(a.clock_in) < countFrom) return false;
          return true;
        });

        // Working days from countFrom to today
        const employeeWorkingDays = getWorkingDaysSince(countFrom, year, mon - 1);

        const uniqueDays = new Set(userAtt.map((a) => a.clock_in.split('T')[0]));
        const presents = userAtt.filter((a) => a.status === 'present').length;
        const lates = userAtt.filter((a) => a.status === 'late').length;
        const absents = Math.max(0, employeeWorkingDays - uniqueDays.size);

        // Approved leave days for this employee in this month
        const userLeaves = approvedLeaves.filter((l) => l.user_id === p.user_id);
        let paidLeaveDays = 0;
        let unpaidLeaveDays = 0;
        userLeaves.forEach((l) => {
          const days = countLeaveDaysInMonth(l.start_date, l.end_date);
          if (l.leave_type === 'paid') paidLeaveDays += days;
          else unpaidLeaveDays += days;
        });

        // Absences after subtracting approved leave days (leave days are not unexcused absences)
        const netAbsents = Math.max(0, absents - paidLeaveDays - unpaidLeaveDays);

        // Calcul des heures de retard par jour (pour appliquer le plafond de 4% par jour)
        // Pénalité : 1% du salaire par heure de retard, max 4% par jour
        let totalLatePercent = 0;
        const dailyLateHours: Record<string, number> = {};

        userAtt.forEach((a) => {
          const clockIn = new Date(a.clock_in);
          const recordDay = a.clock_in.split('T')[0];
          const scheduledStart = new Date(clockIn);
          scheduledStart.setHours(startH, startM, 0, 0);
          const graceStart = new Date(scheduledStart.getTime() + GRACE_MINUTES * 60000);

          let dayLateHours = dailyLateHours[recordDay] || 0;

          // Si arrivée après grâce → heures de retard
          if (clockIn > graceStart) {
            const lateMinutes = (clockIn.getTime() - scheduledStart.getTime()) / 60000;
            dayLateHours += Math.ceil(lateMinutes / 60);
          }

          // Départ anticipé / oubli de pointage de départ
          const today = new Date().toISOString().split('T')[0];

          if (a.clock_out) {
            const clockOut = new Date(a.clock_out);
            const scheduledEnd = new Date(clockOut);
            scheduledEnd.setHours(endH, endM, 0, 0);
            const graceEnd = new Date(scheduledEnd.getTime() - GRACE_MINUTES * 60000);

            if (clockOut < graceEnd) {
              const earlyMinutes = (scheduledEnd.getTime() - clockOut.getTime()) / 60000;
              dayLateHours += Math.ceil(earlyMinutes / 60);
            }
          } else if (recordDay !== today) {
            const scheduledEnd = new Date(clockIn);
            scheduledEnd.setHours(endH, endM, 0, 0);
            if (scheduledEnd > clockIn) {
              const missingMinutes = (scheduledEnd.getTime() - clockIn.getTime()) / 60000;
              dayLateHours += Math.ceil(missingMinutes / 60);
            }
          }

          dailyLateHours[recordDay] = dayLateHours;
        });

        // Apply 1% per hour, capped at 4% per day
        let totalAbsenceHours = 0;
        Object.values(dailyLateHours).forEach((hours) => {
          totalAbsenceHours += hours;
          const dayPercent = Math.min(hours * 1, 4); // 1% per hour, max 4%
          totalLatePercent += dayPercent;
        });

        // Jours supplémentaires (dimanche travaillé)
        let overtimeDays = 0;
        uniqueDays.forEach((dateStr) => {
          const dayOfWeek = new Date(dateStr).getDay();
          if (dayOfWeek === 0) overtimeDays++;
        });

        // Heures supplémentaires approuvées par l'admin (en dehors des dimanches)
        let approvedOvertimeMinutes = 0;
        userAtt.forEach((a: any) => {
          if (a.overtime_approved === true && (a.overtime_minutes || 0) > 0) {
            approvedOvertimeMinutes += a.overtime_minutes;
          }
        });
        const approvedOvertimeHours = approvedOvertimeMinutes / 60;

        // Bonus heures sup: 5% du salaire par dimanche travaillé + heures sup approuvées
        const salary = p.base_salary || 0;
        const sundayBonus = Math.round(overtimeDays * salary * 0.05);
        // Heures sup weekdays: hourly rate * 1.5 for approved overtime
        const hourlyRate = salary / (26 * ((endH + endM / 60) - (startH + startM / 60)));
        const weekdayOvertimeBonus = Math.round(approvedOvertimeHours * hourlyRate * 1.5);
        const overtimeBonus = sundayBonus + weekdayOvertimeBonus;

        // Déductions : 1% par heure de retard (plafond 4% par jour) + 4% par jour d'absence
        const lateDeduction = Math.round(totalLatePercent * salary / 100);
        const absenceDeduction = Math.round(netAbsents * salary * 0.04); // 4% par jour d'absence
        const unpaidLeaveDeduction = Math.round(unpaidLeaveDays * salary / 26);
        const deduction = Math.round(lateDeduction + absenceDeduction + unpaidLeaveDeduction);

        // Task stats for this employee in this month
        const empTasks = monthTasks.filter((t) => t.assigned_to === p.user_id);
        const tasksAssigned = empTasks.length;
        const tasksCompleted = empTasks.filter((t) => t.status === 'completed').length;
        const today = new Date().toISOString().split('T')[0];
        const tasksOverdue = empTasks.filter((t) => t.due_date && t.due_date < today && t.status !== 'completed').length;

        // Enhanced task metrics
        const completionRate = tasksAssigned > 0 ? Math.round((tasksCompleted / tasksAssigned) * 100) : 0;
        const completedWithDue = empTasks.filter((t) => t.status === 'completed' && t.due_date && t.completed_at);
        const onTimeCount = completedWithDue.filter((t) => t.completed_at!.split('T')[0] <= t.due_date!).length;
        const onTimeRate = completedWithDue.length > 0 ? Math.round((onTimeCount / completedWithDue.length) * 100) : (tasksCompleted > 0 ? 100 : 0);

        // Avg days to complete (from created_at to completed_at)
        let totalDays = 0;
        let countWithDays = 0;
        empTasks.filter((t) => t.status === 'completed' && t.completed_at).forEach((t) => {
          const created = new Date(t.created_at);
          const completed = new Date(t.completed_at!);
          const days = Math.max(0, Math.round((completed.getTime() - created.getTime()) / 86400000));
          totalDays += days;
          countWithDays++;
        });
        const avgDays = countWithDays > 0 ? Math.round((totalDays / countWithDays) * 10) / 10 : 0;

        // Task performance score: weighted combination
        // 40% completion rate + 30% on-time rate + 30% (100 - overdue penalty)
        const overduePenalty = tasksAssigned > 0 ? Math.min(100, (tasksOverdue / tasksAssigned) * 100) : 0;
        const taskScore = tasksAssigned > 0
          ? Math.round(completionRate * 0.4 + onTimeRate * 0.3 + (100 - overduePenalty) * 0.3)
          : 0;

        return {
          user_id: p.user_id,
          full_name: p.full_name,
          department: p.department,
          position: p.position,
          base_salary: salary,
          presents,
          lates,
          absents: netAbsents,
          absence_hours: totalAbsenceHours,
          overtime_days: overtimeDays,
          overtime_bonus: overtimeBonus,
          overtime_approved_hours: Math.round(approvedOvertimeHours * 10) / 10,
          deduction,
          net_salary: Math.max(0, salary - deduction + overtimeBonus),
          paid_leave_days: paidLeaveDays,
          unpaid_leave_days: unpaidLeaveDays,
          tasks_assigned: tasksAssigned,
          tasks_completed: tasksCompleted,
          tasks_overdue: tasksOverdue,
          tasks_completion_rate: completionRate,
          tasks_on_time_rate: onTimeRate,
          tasks_avg_days: avgDays,
          task_score: taskScore,
        };
      });

      setReports(reportData);
      setLoading(false);
    };

    if (Object.keys(settings).length > 0) fetchReport();
  }, [month, settings, fetchTrigger]);

  const handleAIAnalysis = async () => {
    if (reports.length === 0) return;
    setAiLoading(true);
    setAiAnalysis(null);
    try {
      const monthLabel = months.find((m) => m.value === month)?.label || month;
      const reportData: EmployeeReportData[] = reports.map((r) => ({
        full_name: r.full_name,
        department: r.department,
        position: r.position,
        base_salary: r.base_salary,
        presents: r.presents,
        lates: r.lates,
        absents: r.absents,
        absence_hours: r.absence_hours,
        overtime_days: r.overtime_days,
        tasks_assigned: r.tasks_assigned,
        tasks_completed: r.tasks_completed,
        tasks_overdue: r.tasks_overdue,
        tasks_completion_rate: r.tasks_completion_rate,
        tasks_on_time_rate: r.tasks_on_time_rate,
        task_score: r.task_score,
        paid_leave_days: r.paid_leave_days,
        unpaid_leave_days: r.unpaid_leave_days,
        net_salary: r.net_salary,
        deduction: r.deduction,
      }));
      const result = await analyzeReports(reportData, monthLabel);
      setAiAnalysis(result);
      toast({ title: '✅ Analyse IA terminée' });
    } catch (err: any) {
      toast({ title: 'Erreur IA', description: err.message, variant: 'destructive' });
    } finally {
      setAiLoading(false);
    }
  };

  // Reset AI analysis when month changes
  useEffect(() => {
    setAiAnalysis(null);
  }, [month]);

  const handleResetCounters = async () => {
    if (!resetTarget) return;
    setResetting(true);
    const [year, mon] = month.split('-').map(Number);
    const startDate = new Date(year, mon - 1, 1).toISOString();
    const endDate = new Date(year, mon, 0, 23, 59, 59).toISOString();
    const now = new Date().toISOString();

    // 1. Set counters_reset_at on the profile — this is what the report reads
    const { data: profileData } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', resetTarget.user_id)
      .single();

    if (profileData) {
      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ counters_reset_at: now } as any)
        .eq('id', profileData.id);

      if (updateErr) {
        toast({ title: 'Erreur', description: updateErr.message, variant: 'destructive' });
        setResetting(false);
        setResetTarget(null);
        return;
      }
    }

    // 2. Delete old attendance records for this employee this month
    await supabase
      .from('attendance')
      .delete()
      .eq('user_id', resetTarget.user_id)
      .gte('clock_in', startDate)
      .lte('clock_in', endDate);

    toast({ title: '✅ Compteurs réinitialisés', description: `Les compteurs de ${resetTarget.full_name} ont été remis à zéro.` });
    setFetchTrigger((t) => t + 1);
    setResetting(false);
    setResetTarget(null);
  };

  // Count working days from a specific date to today (within the given month)
  // Starts from the day AFTER 'since' (employee shouldn't be absent the day they were created/reset)
  const getWorkingDaysSince = (since: Date, year: number, monthIdx: number) => {
    let count = 0;
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    const d = new Date(since);
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    // Ensure we stay within the target month
    const monthStart = new Date(year, monthIdx, 1);
    if (d < monthStart) { d.setTime(monthStart.getTime()); }
    while (d.getMonth() === monthIdx && d <= today) {
      if (d.getDay() !== 0) count++;
      d.setDate(d.getDate() + 1);
    }
    return count;
  };

  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear];
  const months = years.flatMap((year) =>
    Array.from({ length: 12 }, (_, i) => {
      const d = new Date(year, i, 1);
      return { value: format(d, 'yyyy-MM'), label: format(d, 'MMMM yyyy', { locale: fr }) };
    })
  );

  const exportCSV = () => {
    const separator = ';';
    const headers = [`Nom${separator}Département${separator}Poste${separator}Salaire Base${separator}Présences${separator}Retards${separator}Heures Abs.${separator}Absences (j)${separator}C. Payé${separator}C. Non Payé${separator}Jours Sup.${separator}Bonus Sup.${separator}Déductions${separator}Salaire Net${separator}Tâches Assignées${separator}Tâches Terminées${separator}Tâches En Retard${separator}Taux Complétion${separator}Ponctualité${separator}Score Tâches`];
    const rows = reports.map((r) =>
      [r.full_name, r.department || '', r.position || '', r.base_salary, r.presents, r.lates, r.absence_hours, r.absents, r.paid_leave_days, r.unpaid_leave_days, r.overtime_days, r.overtime_bonus, r.deduction, r.net_salary, r.tasks_assigned, r.tasks_completed, r.tasks_overdue, `${r.tasks_completion_rate}%`, `${r.tasks_on_time_rate}%`, `${r.task_score}%`].join(separator)
    );
    const csv = [...headers, ...rows].join('\n');
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rapport-salaires-${month}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fmtNum = (n: number): string =>
    n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const monthLabel = months.find((m) => m.value === month)?.label || month;

    // Header
    doc.setFontSize(18);
    doc.text('GUIMS GROUP', 14, 18);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Rapport de salaires — ${monthLabel}`, 14, 26);
    doc.setTextColor(0);

    // Summary line
    const totalDeductions = reports.reduce((s, r) => s + r.deduction, 0);
    const totalBonus = reports.reduce((s, r) => s + r.overtime_bonus, 0);
    const totalNet = reports.reduce((s, r) => s + r.net_salary, 0);
    const totalAbsJours = reports.reduce((s, r) => s + r.absents, 0);
    const totalAbsHeures = reports.reduce((s, r) => s + r.absence_hours, 0);
    const totalTasksAssigned = reports.reduce((s, r) => s + r.tasks_assigned, 0);
    const totalTasksDone = reports.reduce((s, r) => s + r.tasks_completed, 0);

    doc.setFontSize(9);
    doc.text(
      `Masse salariale nette: ${fmtNum(totalNet)} FCFA  |  Deductions: ${fmtNum(totalDeductions)} FCFA  |  Bonus sup.: +${fmtNum(totalBonus)} FCFA  |  Absences: ${totalAbsJours}j / ${totalAbsHeures}h  |  Tâches: ${totalTasksDone}/${totalTasksAssigned}  |  Score moyen: ${reports.filter(r => r.tasks_assigned > 0).length > 0 ? Math.round(reports.filter(r => r.tasks_assigned > 0).reduce((s, r) => s + r.task_score, 0) / reports.filter(r => r.tasks_assigned > 0).length) : 0}%`,
      14, 33
    );

    // Table
    autoTable(doc, {
      startY: 38,
      head: [['Employé', 'Département', 'Prés.', 'Ret.', 'H.Abs.', 'Abs.(j)', 'C.Payé', 'C.N.Payé', 'J.Sup.', 'Sal. Base', 'Bonus', 'Déduc.', 'Sal. Net', 'Tâches', 'Score']],
      body: reports.map((r) => [
        r.full_name,
        r.department || '—',
        r.presents,
        r.lates,
        r.absence_hours > 0 ? `${r.absence_hours}h` : '—',
        r.absents,
        r.paid_leave_days > 0 ? r.paid_leave_days : '—',
        r.unpaid_leave_days > 0 ? r.unpaid_leave_days : '—',
        r.overtime_days > 0 ? r.overtime_days : '—',
        fmtNum(r.base_salary),
        r.overtime_bonus > 0 ? `+${fmtNum(r.overtime_bonus)}` : '—',
        `-${fmtNum(r.deduction)}`,
        fmtNum(r.net_salary),
        `${r.tasks_completed}/${r.tasks_assigned}${r.tasks_overdue > 0 ? ` (${r.tasks_overdue}!)` : ''}`,
        r.tasks_assigned > 0 ? `${r.task_score}%` : '—',
      ]),
      styles: { fontSize: 7, cellPadding: 2 },
      headStyles: { fillColor: [30, 58, 138], textColor: 255, fontStyle: 'bold', fontSize: 7 },
      alternateRowStyles: { fillColor: [245, 247, 250] },
      columnStyles: {
        0: { cellWidth: 35 },
        9: { halign: 'right' },
        10: { halign: 'right' },
        11: { halign: 'right' },
        12: { halign: 'right', fontStyle: 'bold' },
        13: { halign: 'center' },
        14: { halign: 'center' },
      },
      didDrawPage: (data) => {
        const pageCount = doc.getNumberOfPages();
        doc.setFontSize(7);
        doc.setTextColor(150);
        doc.text(
          `GUIMS GROUP — Rapport ${monthLabel} — Page ${data.pageNumber}/${pageCount}`,
          data.settings.margin.left,
          doc.internal.pageSize.height - 8
        );
        doc.text(
          `Généré le ${format(new Date(), 'dd/MM/yyyy à HH:mm', { locale: fr })}`,
          doc.internal.pageSize.width - data.settings.margin.right - 60,
          doc.internal.pageSize.height - 8
        );
      },
    });

    doc.save(`rapport-salaires-${month}.pdf`);
  };

  if (permLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!can('reports.view')) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <DashboardLayout>
      <div className="animate-fade-in">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <h1 className="page-title">Rapports Mensuels</h1>
          <div className="flex items-center gap-3">
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {can('reports.export') && (
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={exportCSV} disabled={reports.length === 0}>
                <Download className="h-4 w-4 mr-2" />
                CSV
              </Button>
              <Button variant="outline" onClick={exportPDF} disabled={reports.length === 0}>
                <FileDown className="h-4 w-4 mr-2" />
                PDF
              </Button>
              <Button
                onClick={handleAIAnalysis}
                disabled={reports.length === 0 || aiLoading}
                className="bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700"
              >
                {aiLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Brain className="h-4 w-4 mr-2" />}
                Analyse IA
              </Button>
            </div>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
              <Card className="stat-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Total Déductions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-display text-destructive">
                    {reports.reduce((s, r) => s + r.deduction, 0).toLocaleString()} FCFA
                  </div>
                </CardContent>
              </Card>
              <Card className="stat-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Bonus Jours Sup.</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-display text-primary">
                    +{reports.reduce((s, r) => s + r.overtime_bonus, 0).toLocaleString()} FCFA
                  </div>
                </CardContent>
              </Card>
              <Card className="stat-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Masse Salariale Nette</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-display text-success">
                    {reports.reduce((s, r) => s + r.net_salary, 0).toLocaleString()} FCFA
                  </div>
                </CardContent>
              </Card>
              <Card className="stat-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Absences</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-display">
                    {reports.reduce((s, r) => s + r.absents, 0)}j · {reports.reduce((s, r) => s + r.absence_hours, 0)}h
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    1% du salaire/heure de retard (max 4%/jour) · 4%/jour d'absence
                  </p>
                </CardContent>
              </Card>
              <Card className="stat-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-muted-foreground">Tâches du mois</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold font-display">
                    {reports.reduce((s, r) => s + r.tasks_completed, 0)}/{reports.reduce((s, r) => s + r.tasks_assigned, 0)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    terminées · {reports.reduce((s, r) => s + r.tasks_overdue, 0)} en retard
                  </p>
                  {reports.length > 0 && (
                    <p className="text-xs mt-1">
                      <span className="text-green-600 font-medium">
                        Score moyen : {Math.round(reports.filter(r => r.tasks_assigned > 0).reduce((s, r) => s + r.task_score, 0) / Math.max(1, reports.filter(r => r.tasks_assigned > 0).length))}%
                      </span>
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Table */}
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="table-header px-4 py-3 text-left">Employé</th>
                      <th className="table-header px-4 py-3 text-left">Département</th>
                      <th className="table-header px-4 py-3 text-center">Présences</th>
                      <th className="table-header px-4 py-3 text-center">Retards</th>
                      <th className="table-header px-4 py-3 text-center">H. Abs.</th>
                      <th className="table-header px-4 py-3 text-center">Absences (j)</th>
                      <th className="table-header px-4 py-3 text-center">C. Payé</th>
                      <th className="table-header px-4 py-3 text-center">C. Non Payé</th>
                      <th className="table-header px-4 py-3 text-center">Jours Sup.</th>
                      <th className="table-header px-4 py-3 text-right">Salaire Base</th>
                      <th className="table-header px-4 py-3 text-right">Bonus Sup.</th>
                      <th className="table-header px-4 py-3 text-right">Déductions</th>
                      <th className="table-header px-4 py-3 text-right">Salaire Net</th>
                      <th className="table-header px-4 py-3 text-center">Tâches</th>
                      {isAdmin && <th className="table-header px-4 py-3 text-center">Actions</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((r) => (
                      <tr key={r.user_id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-4 py-3 text-sm font-medium">{r.full_name}</td>
                        <td className="px-4 py-3 text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            {r.department && <img src={getDepartmentLogo(r.department)} alt="" className="h-5 w-5 rounded-full object-cover" />}
                            {r.department || '—'}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-center">
                          <span className="badge-status bg-success/10 text-success">{r.presents}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-center">
                          <span className="badge-status bg-warning/10 text-warning">{r.lates}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-center">
                          {r.absence_hours > 0 ? (
                            <span className="badge-status bg-orange-500/10 text-orange-600">{r.absence_hours}h</span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-center">
                          <span className="badge-status bg-destructive/10 text-destructive">{r.absents}</span>
                        </td>
                        <td className="px-4 py-3 text-sm text-center">
                          {r.paid_leave_days > 0 ? (
                            <span className="badge-status bg-blue-500/10 text-blue-600">{r.paid_leave_days}j</span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-center">
                          {r.unpaid_leave_days > 0 ? (
                            <span className="badge-status bg-purple-500/10 text-purple-600">{r.unpaid_leave_days}j</span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-center">
                          {r.overtime_days > 0 ? (
                            <span className="badge-status bg-primary/10 text-primary">{r.overtime_days}</span>
                          ) : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right">{r.base_salary.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-right text-primary font-medium">
                          {r.overtime_bonus > 0 ? `+${r.overtime_bonus.toLocaleString()}` : '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right text-destructive font-medium">
                          -{r.deduction.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-bold">{r.net_salary.toLocaleString()}</td>
                        <td className="px-4 py-3 text-sm text-center">
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="badge-status bg-indigo-500/10 text-indigo-600">{r.tasks_completed}/{r.tasks_assigned}</span>
                            {r.tasks_overdue > 0 && (
                              <span className="badge-status bg-destructive/10 text-destructive text-[10px]">{r.tasks_overdue} en retard</span>
                            )}
                            {r.tasks_assigned > 0 && (
                              <span className={`text-[10px] font-semibold ${r.task_score >= 75 ? 'text-green-600' : r.task_score >= 50 ? 'text-orange-600' : 'text-red-600'}`}>
                                Score: {r.task_score}%
                              </span>
                            )}
                          </div>
                        </td>
                        {isAdmin && (
                          <td className="px-4 py-3 text-center">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-orange-500 hover:text-orange-600"
                              onClick={() => setResetTarget(r)}
                              title="Remettre les compteurs à zéro"
                            >
                              <RotateCcw className="h-4 w-4" />
                            </Button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* AI Analysis Results */}
            {aiAnalysis && (
              <Card className="overflow-hidden border-purple-200 dark:border-purple-800">
                <CardHeader className="bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Brain className="h-5 w-5 text-purple-600" />
                    Analyse IA — Rapport Stratégique
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6 pt-6">
                  {/* Summary + Score */}
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1 p-4 bg-muted/50 rounded-lg">
                      <p className="text-sm leading-relaxed">{aiAnalysis.summary}</p>
                    </div>
                    <div className="sm:w-48 p-4 bg-muted/50 rounded-lg text-center">
                      <p className="text-xs text-muted-foreground mb-2">Score de Productivité</p>
                      <div className={`text-4xl font-bold font-display ${aiAnalysis.profitability_score >= 70 ? 'text-green-600' : aiAnalysis.profitability_score >= 40 ? 'text-orange-600' : 'text-red-600'}`}>
                        {aiAnalysis.profitability_score}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">/100</p>
                      <Progress value={aiAnalysis.profitability_score} className="mt-2 h-2" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Strengths */}
                    {aiAnalysis.strengths.length > 0 && (
                      <div className="p-4 border rounded-lg border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20">
                        <h4 className="font-semibold text-sm flex items-center gap-2 text-green-700 dark:text-green-400 mb-3">
                          <CheckCircle className="h-4 w-4" />
                          Points Forts
                        </h4>
                        <ul className="space-y-1.5">
                          {aiAnalysis.strengths.map((s, i) => (
                            <li key={i} className="text-sm flex items-start gap-2">
                              <span className="text-green-500 mt-0.5">✓</span>
                              {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Weaknesses */}
                    {aiAnalysis.weaknesses.length > 0 && (
                      <div className="p-4 border rounded-lg border-orange-200 dark:border-orange-800 bg-orange-50/50 dark:bg-orange-950/20">
                        <h4 className="font-semibold text-sm flex items-center gap-2 text-orange-700 dark:text-orange-400 mb-3">
                          <AlertTriangle className="h-4 w-4" />
                          Points Faibles
                        </h4>
                        <ul className="space-y-1.5">
                          {aiAnalysis.weaknesses.map((w, i) => (
                            <li key={i} className="text-sm flex items-start gap-2">
                              <span className="text-orange-500 mt-0.5">⚠</span>
                              {w}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Recommendations */}
                  {aiAnalysis.recommendations.length > 0 && (
                    <div className="p-4 border rounded-lg border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20">
                      <h4 className="font-semibold text-sm flex items-center gap-2 text-blue-700 dark:text-blue-400 mb-3">
                        <Lightbulb className="h-4 w-4" />
                        Recommandations pour l'Évolution de l'Entreprise
                      </h4>
                      <div className="space-y-2">
                        {aiAnalysis.recommendations.map((r, i) => (
                          <div key={i} className="flex items-start gap-3 p-2 bg-white/50 dark:bg-white/5 rounded">
                            <span className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0">
                              {i + 1}
                            </span>
                            <p className="text-sm">{r}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Department Insights */}
                  {aiAnalysis.department_insights.length > 0 && (
                    <div className="p-4 border rounded-lg">
                      <h4 className="font-semibold text-sm flex items-center gap-2 mb-3">
                        <TrendingUp className="h-4 w-4 text-primary" />
                        Analyse par Département
                      </h4>
                      <div className="space-y-2">
                        {aiAnalysis.department_insights.map((d, i) => (
                          <div key={i} className="flex items-start gap-3 p-2 bg-muted/50 rounded">
                            <span className="font-semibold text-xs text-primary shrink-0 min-w-[100px]">
                              {d.department}
                            </span>
                            <p className="text-sm text-muted-foreground">{d.insight}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Risk Areas */}
                  {aiAnalysis.risk_areas.length > 0 && (
                    <div className="p-4 border rounded-lg border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20">
                      <h4 className="font-semibold text-sm flex items-center gap-2 text-red-700 dark:text-red-400 mb-3">
                        <Shield className="h-4 w-4" />
                        Zones de Risque
                      </h4>
                      <ul className="space-y-1.5">
                        {aiAnalysis.risk_areas.map((r, i) => (
                          <li key={i} className="text-sm flex items-start gap-2">
                            <span className="text-red-500 mt-0.5">●</span>
                            {r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* AI Loading */}
            {aiLoading && (
              <Card className="p-8 text-center border-purple-200 dark:border-purple-800">
                <Brain className="h-10 w-10 text-purple-500 mx-auto mb-3 animate-pulse" />
                <p className="font-medium text-sm">Analyse en cours…</p>
                <p className="text-xs text-muted-foreground mt-1">L'IA analyse les performances des employés et prépare des recommandations</p>
              </Card>
            )}
          </>
        )}
      </div>
      {/* Reset confirmation dialog */}
      <AlertDialog open={!!resetTarget} onOpenChange={(open) => !open && setResetTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remettre les compteurs à zéro ?</AlertDialogTitle>
            <AlertDialogDescription>
              Tous les enregistrements de présence, retards et absences de{' '}
              <strong>{resetTarget?.full_name}</strong> pour le mois sélectionné seront supprimés.
              Cette action est irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetting}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleResetCounters}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={resetting}
            >
              {resetting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Confirmer la remise à zéro
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
