import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { usePermissions } from '@/hooks/usePermissions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
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
import { CalendarDays, Plus, Check, X, Eye } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface LeaveRequest {
  id: string;
  user_id: string;
  leave_type: 'paid' | 'unpaid';
  start_date: string;
  end_date: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  // joined
  full_name?: string;
  department?: string | null;
}

interface LeaveForm {
  leave_type: 'paid' | 'unpaid';
  start_date: string;
  end_date: string;
  reason: string;
}

const emptyForm: LeaveForm = {
  leave_type: 'paid',
  start_date: '',
  end_date: '',
  reason: '',
};

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */
/** Count working days (Mon-Sat) between two dates inclusive */
function countWorkingDays(start: string, end: string): number {
  const s = new Date(start);
  const e = new Date(end);
  let count = 0;
  const cur = new Date(s);
  while (cur <= e) {
    if (cur.getDay() !== 0) count++; // skip Sunday
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending:  { label: 'En attente', variant: 'secondary' },
  approved: { label: 'Approuvée', variant: 'default' },
  rejected: { label: 'Rejetée', variant: 'destructive' },
};

const typeLabels: Record<string, string> = {
  paid: 'Payante',
  unpaid: 'Non payante',
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
export default function LeaveRequests() {
  const { user, role } = useAuth();
  const { can } = usePermissions();
  const { toast } = useToast();

  const isAdmin = role === 'admin' || role === 'manager';

  const [requests, setRequests] = useState<LeaveRequest[]>([]);
  const [loading, setLoading] = useState(true);

  // New request dialog
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<LeaveForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  // Review dialog (approve / reject)
  const [reviewTarget, setReviewTarget] = useState<LeaveRequest | null>(null);
  const [reviewAction, setReviewAction] = useState<'approved' | 'rejected'>('approved');
  const [reviewNote, setReviewNote] = useState('');
  const [reviewing, setReviewing] = useState(false);

  // Detail dialog
  const [detailTarget, setDetailTarget] = useState<LeaveRequest | null>(null);

  // Filter
  const [statusFilter, setStatusFilter] = useState<string>('all');

  /* ---------------------------------------------------------------- */
  /*  Fetch                                                            */
  /* ---------------------------------------------------------------- */
  const fetchRequests = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch leave requests
      let query = supabase
        .from('leave_requests')
        .select('*')
        .order('created_at', { ascending: false });

      if (!isAdmin) {
        query = query.eq('user_id', user?.id ?? '');
      }

      const { data: leaves, error } = await query;
      if (error) throw error;

      // Fetch profiles to join full_name / department
      const userIds = [...new Set((leaves || []).map((l) => l.user_id))];
      let profileMap: Record<string, { full_name: string; department: string | null }> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, full_name, department')
          .in('user_id', userIds);
        (profiles || []).forEach((p) => {
          profileMap[p.user_id] = { full_name: p.full_name, department: p.department };
        });
      }

      const enriched: LeaveRequest[] = (leaves || []).map((l) => ({
        ...l,
        leave_type: l.leave_type as 'paid' | 'unpaid',
        status: l.status as 'pending' | 'approved' | 'rejected',
        full_name: profileMap[l.user_id]?.full_name ?? 'Inconnu',
        department: profileMap[l.user_id]?.department ?? null,
      }));

      setRequests(enriched);
    } catch (err: any) {
      toast({ title: 'Erreur', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [isAdmin, user?.id, toast]);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  /* ---------------------------------------------------------------- */
  /*  Submit new request                                               */
  /* ---------------------------------------------------------------- */
  const handleSubmit = async () => {
    if (!form.start_date || !form.end_date || !form.reason.trim()) {
      toast({ title: 'Champs requis', description: 'Veuillez remplir tous les champs.' });
      return;
    }
    if (new Date(form.end_date) < new Date(form.start_date)) {
      toast({ title: 'Dates invalides', description: 'La date de fin doit être après la date de début.' });
      return;
    }

    // Vérifier le chevauchement avec des demandes existantes (non rejetées)
    const overlap = requests.find(
      (r) =>
        r.user_id === user!.id &&
        r.status !== 'rejected' &&
        r.start_date <= form.end_date &&
        r.end_date >= form.start_date,
    );
    if (overlap) {
      toast({
        title: 'Chevauchement détecté',
        description: `Cette période chevauche une demande existante (${fmtDate(overlap.start_date)} - ${fmtDate(overlap.end_date)}).`,
        variant: 'destructive',
      });
      return;
    }

    setSubmitting(true);
    try {
      const { error } = await supabase.from('leave_requests').insert({
        user_id: user!.id,
        leave_type: form.leave_type,
        start_date: form.start_date,
        end_date: form.end_date,
        reason: form.reason.trim(),
      });
      if (error) throw error;
      toast({ title: 'Demande envoyée', description: 'Votre demande de permission a été soumise.' });
      setShowNew(false);
      setForm(emptyForm);
      fetchRequests();
    } catch (err: any) {
      toast({ title: 'Erreur', description: err.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Review (approve / reject)                                        */
  /* ---------------------------------------------------------------- */
  const handleReview = async () => {
    if (!reviewTarget) return;
    setReviewing(true);
    try {
      const { error } = await supabase
        .from('leave_requests')
        .update({
          status: reviewAction,
          reviewed_by: user!.id,
          reviewed_at: new Date().toISOString(),
          review_note: reviewNote.trim() || null,
        })
        .eq('id', reviewTarget.id);
      if (error) throw error;
      toast({
        title: reviewAction === 'approved' ? 'Permission approuvée' : 'Permission rejetée',
        description: `La demande de ${reviewTarget.full_name} a été ${reviewAction === 'approved' ? 'approuvée' : 'rejetée'}.`,
      });
      setReviewTarget(null);
      setReviewNote('');
      fetchRequests();
    } catch (err: any) {
      toast({ title: 'Erreur', description: err.message, variant: 'destructive' });
    } finally {
      setReviewing(false);
    }
  };

  /* ---------------------------------------------------------------- */
  /*  Filtered list                                                    */
  /* ---------------------------------------------------------------- */
  const filtered = statusFilter === 'all'
    ? requests
    : requests.filter((r) => r.status === statusFilter);

  const pendingCount = requests.filter((r) => r.status === 'pending').length;

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
              <CalendarDays className="h-6 w-6" />
              Demandes de Permission
            </h1>
            <p className="text-muted-foreground mt-1">
              {isAdmin
                ? 'Gérer les demandes de permission des employés'
                : 'Soumettre et suivre vos demandes de permission'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {pendingCount > 0 && isAdmin && (
              <Badge variant="secondary" className="text-sm">
                {pendingCount} en attente
              </Badge>
            )}
            <Button onClick={() => { setForm(emptyForm); setShowNew(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              Nouvelle demande
            </Button>
          </div>
        </div>

        {/* Leave balance for non-admin */}
        {!isAdmin && (
          (() => {
            const year = new Date().getFullYear();
            const ANNUAL_PAID_DAYS = 30;
            const myRequests = requests.filter((r) => r.user_id === user?.id && r.status !== 'rejected');
            const usedPaid = myRequests
              .filter((r) => r.leave_type === 'paid' && r.start_date.startsWith(String(year)))
              .reduce((sum, r) => sum + countWorkingDays(r.start_date, r.end_date), 0);
            const usedUnpaid = myRequests
              .filter((r) => r.leave_type === 'unpaid' && r.start_date.startsWith(String(year)))
              .reduce((sum, r) => sum + countWorkingDays(r.start_date, r.end_date), 0);
            const pendingDays = myRequests
              .filter((r) => r.status === 'pending' && r.start_date.startsWith(String(year)))
              .reduce((sum, r) => sum + countWorkingDays(r.start_date, r.end_date), 0);
            return (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="stat-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground">Congés payés restants</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold font-display text-success">
                      {ANNUAL_PAID_DAYS - usedPaid}j
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{usedPaid}j utilisés sur {ANNUAL_PAID_DAYS}j</p>
                  </CardContent>
                </Card>
                <Card className="stat-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground">Congés non payés pris</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold font-display text-orange-600">{usedUnpaid}j</div>
                    <p className="text-xs text-muted-foreground mt-1">Cette année</p>
                  </CardContent>
                </Card>
                <Card className="stat-card">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm text-muted-foreground">En attente</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold font-display text-blue-600">{pendingDays}j</div>
                    <p className="text-xs text-muted-foreground mt-1">Demandes non traitées</p>
                  </CardContent>
                </Card>
              </div>
            );
          })()
        )}

        {/* Filter */}
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Label>Statut :</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous</SelectItem>
                <SelectItem value="pending">En attente</SelectItem>
                <SelectItem value="approved">Approuvées</SelectItem>
                <SelectItem value="rejected">Rejetées</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </Card>

        {/* Table */}
        <Card>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  {isAdmin && <TableHead>Employé</TableHead>}
                  {isAdmin && <TableHead>Département</TableHead>}
                  <TableHead>Type</TableHead>
                  <TableHead>Du</TableHead>
                  <TableHead>Au</TableHead>
                  <TableHead>Jours</TableHead>
                  <TableHead>Statut</TableHead>
                  <TableHead>Soumise le</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 9 : 7} className="text-center py-8 text-muted-foreground">
                      Chargement…
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 9 : 7} className="text-center py-12">
                      <CalendarDays className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
                      <p className="text-muted-foreground font-medium">Aucune demande de congé</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">Créez une demande pour commencer</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((req) => {
                    const days = countWorkingDays(req.start_date, req.end_date);
                    const sc = statusConfig[req.status];
                    return (
                      <TableRow key={req.id}>
                        {isAdmin && <TableCell className="font-medium">{req.full_name}</TableCell>}
                        {isAdmin && <TableCell>{req.department || '—'}</TableCell>}
                        <TableCell>
                          <Badge variant={req.leave_type === 'paid' ? 'default' : 'outline'}>
                            {typeLabels[req.leave_type]}
                          </Badge>
                        </TableCell>
                        <TableCell>{fmtDate(req.start_date)}</TableCell>
                        <TableCell>{fmtDate(req.end_date)}</TableCell>
                        <TableCell className="font-semibold">{days}</TableCell>
                        <TableCell>
                          <Badge variant={sc.variant}>{sc.label}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {fmtDate(req.created_at)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Détails"
                              onClick={() => setDetailTarget(req)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            {isAdmin && req.status === 'pending' && (
                              <>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-green-600 hover:text-green-700"
                                  title="Approuver"
                                  onClick={() => { setReviewTarget(req); setReviewAction('approved'); }}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-red-600 hover:text-red-700"
                                  title="Rejeter"
                                  onClick={() => { setReviewTarget(req); setReviewAction('rejected'); }}
                                >
                                  <X className="h-4 w-4" />
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
      </div>

      {/* ============================================================ */}
      {/*  NEW REQUEST DIALOG                                          */}
      {/* ============================================================ */}
      <Dialog open={showNew} onOpenChange={setShowNew}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nouvelle demande de permission</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Type de permission</Label>
              <Select
                value={form.leave_type}
                onValueChange={(v) => setForm({ ...form, leave_type: v as 'paid' | 'unpaid' })}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="paid">Payante (congé payé)</SelectItem>
                  <SelectItem value="unpaid">Non payante (congé non payé)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Date de début</Label>
                <Input
                  type="date"
                  className="mt-1"
                  value={form.start_date}
                  onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                />
              </div>
              <div>
                <Label>Date de fin</Label>
                <Input
                  type="date"
                  className="mt-1"
                  value={form.end_date}
                  onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                />
              </div>
            </div>
            {form.start_date && form.end_date && new Date(form.end_date) >= new Date(form.start_date) && (
              <p className="text-sm text-muted-foreground">
                Durée : <strong>{countWorkingDays(form.start_date, form.end_date)}</strong> jour(s) ouvrable(s)
              </p>
            )}
            <div>
              <Label>Motif</Label>
              <Textarea
                className="mt-1"
                rows={3}
                placeholder="Raison de la demande…"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNew(false)}>Annuler</Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Envoi…' : 'Soumettre'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============================================================ */}
      {/*  REVIEW DIALOG                                               */}
      {/* ============================================================ */}
      <AlertDialog open={!!reviewTarget} onOpenChange={(open) => { if (!open) setReviewTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {reviewAction === 'approved' ? 'Approuver' : 'Rejeter'} la demande
            </AlertDialogTitle>
            <AlertDialogDescription>
              {reviewTarget && (
                <>
                  <strong>{reviewTarget.full_name}</strong> demande une permission{' '}
                  <strong>{typeLabels[reviewTarget.leave_type]?.toLowerCase()}</strong> du{' '}
                  <strong>{fmtDate(reviewTarget.start_date)}</strong> au{' '}
                  <strong>{fmtDate(reviewTarget.end_date)}</strong>{' '}
                  ({countWorkingDays(reviewTarget.start_date, reviewTarget.end_date)} jours).
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2">
            <Label>Note (optionnelle)</Label>
            <Textarea
              className="mt-1"
              rows={2}
              placeholder="Ajouter une remarque…"
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setReviewTarget(null); setReviewNote(''); }}>
              Annuler
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReview}
              disabled={reviewing}
              className={reviewAction === 'rejected' ? 'bg-destructive hover:bg-destructive/90' : ''}
            >
              {reviewing
                ? 'Traitement…'
                : reviewAction === 'approved'
                  ? 'Approuver'
                  : 'Rejeter'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ============================================================ */}
      {/*  DETAIL DIALOG                                               */}
      {/* ============================================================ */}
      <Dialog open={!!detailTarget} onOpenChange={(open) => { if (!open) setDetailTarget(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Détails de la demande</DialogTitle>
          </DialogHeader>
          {detailTarget && (
            <div className="space-y-3 py-2 text-sm">
              {isAdmin && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Employé</span>
                  <span className="font-medium">{detailTarget.full_name}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type</span>
                <Badge variant={detailTarget.leave_type === 'paid' ? 'default' : 'outline'}>
                  {typeLabels[detailTarget.leave_type]}
                </Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Période</span>
                <span>{fmtDate(detailTarget.start_date)} → {fmtDate(detailTarget.end_date)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Jours ouvrables</span>
                <span className="font-semibold">
                  {countWorkingDays(detailTarget.start_date, detailTarget.end_date)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Statut</span>
                <Badge variant={statusConfig[detailTarget.status].variant}>
                  {statusConfig[detailTarget.status].label}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Motif</span>
                <p className="mt-1 p-2 bg-muted rounded text-sm">{detailTarget.reason}</p>
              </div>
              {detailTarget.review_note && (
                <div>
                  <span className="text-muted-foreground">Note de l'administrateur</span>
                  <p className="mt-1 p-2 bg-muted rounded text-sm">{detailTarget.review_note}</p>
                </div>
              )}
              <div className="flex justify-between text-xs text-muted-foreground pt-2 border-t">
                <span>Soumise le {fmtDate(detailTarget.created_at)}</span>
                {detailTarget.reviewed_at && (
                  <span>Traitée le {fmtDate(detailTarget.reviewed_at)}</span>
                )}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailTarget(null)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DashboardLayout>
  );
}
