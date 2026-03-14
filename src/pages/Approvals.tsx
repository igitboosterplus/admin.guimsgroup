import { useEffect, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { Loader2, UserCheck, UserX, Clock, CheckCircle2, XCircle } from 'lucide-react';
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
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface PendingAccount {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  rules_accepted: boolean;
  is_approved: boolean;
  created_at: string;
}

export default function Approvals() {
  const { toast } = useToast();
  const { can, loading: permLoading } = usePermissions();
  const [pending, setPending] = useState<PendingAccount[]>([]);
  const [approved, setApproved] = useState<PendingAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);

  // Reject dialog
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<PendingAccount | null>(null);

  const fetchAccounts = useCallback(async () => {
    const { data } = await supabase
      .from('profiles')
      .select('id, user_id, full_name, email, rules_accepted, is_approved, created_at')
      .order('created_at', { ascending: false });

    if (data) {
      setPending(data.filter((a) => !a.is_approved));
      setApproved(data.filter((a) => a.is_approved));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  const handleApprove = async (account: PendingAccount) => {
    setProcessing(account.id);
    const { error } = await supabase
      .from('profiles')
      .update({ is_approved: true })
      .eq('id', account.id);

    if (error) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } else {
      toast({
        title: '✅ Compte approuvé',
        description: `${account.full_name} peut désormais se connecter.`,
      });
      fetchAccounts();
    }
    setProcessing(null);
  };

  const openReject = (account: PendingAccount) => {
    setRejectTarget(account);
    setRejectOpen(true);
  };

  const handleReject = async () => {
    if (!rejectTarget) return;
    setProcessing(rejectTarget.id);

    // Delete the profile (cascade will clean up roles too)
    const { error } = await supabase
      .from('profiles')
      .delete()
      .eq('id', rejectTarget.id);

    if (error) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } else {
      toast({
        title: '🗑️ Compte rejeté',
        description: `Le compte de ${rejectTarget.full_name} a été supprimé.`,
      });
      setRejectOpen(false);
      fetchAccounts();
    }
    setProcessing(null);
  };

  if (loading || permLoading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  if (!can('approvals.manage')) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <DashboardLayout>
      <div className="animate-fade-in">
        <div className="mb-6">
          <h1 className="page-title">Approbation des comptes</h1>
          <p className="text-muted-foreground mt-1">
            Gérez les demandes d'inscription des nouveaux employés
          </p>
        </div>

        {/* Pending accounts */}
        <div className="mb-8">
          <h2 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-warning" />
            En attente d'approbation
            {pending.length > 0 && (
              <Badge variant="destructive" className="ml-2">{pending.length}</Badge>
            )}
          </h2>

          {pending.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-success" />
                Aucun compte en attente d'approbation
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {pending.map((account) => (
                <Card key={account.id} className="border-warning/30">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center justify-between">
                      {account.full_name}
                      <Badge variant="outline" className="text-warning border-warning/50">
                        En attente
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1 text-sm">
                      <p className="text-muted-foreground">{account.email}</p>
                      <p className="text-xs text-muted-foreground">
                        Inscrit le {format(new Date(account.created_at), 'd MMMM yyyy à HH:mm', { locale: fr })}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-xs">
                      {account.rules_accepted ? (
                        <>
                          <CheckCircle2 className="h-3 w-3 text-success" />
                          <span className="text-success">Règlement intérieur accepté</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3 w-3 text-destructive" />
                          <span className="text-destructive">Règlement non accepté</span>
                        </>
                      )}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => handleApprove(account)}
                        disabled={processing === account.id}
                      >
                        {processing === account.id ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        ) : (
                          <UserCheck className="h-4 w-4 mr-1" />
                        )}
                        Approuver
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="flex-1"
                        onClick={() => openReject(account)}
                        disabled={processing === account.id}
                      >
                        <UserX className="h-4 w-4 mr-1" />
                        Rejeter
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Recently approved */}
        <div>
          <h2 className="font-display text-lg font-semibold mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            Comptes approuvés récemment
          </h2>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="table-header px-4 py-3 text-left">Nom</th>
                    <th className="table-header px-4 py-3 text-left">Email</th>
                    <th className="table-header px-4 py-3 text-left">Date d'inscription</th>
                    <th className="table-header px-4 py-3 text-center">Statut</th>
                  </tr>
                </thead>
                <tbody>
                  {approved.slice(0, 20).map((account) => (
                    <tr key={account.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3 text-sm font-medium">{account.full_name}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">{account.email}</td>
                      <td className="px-4 py-3 text-sm text-muted-foreground">
                        {format(new Date(account.created_at), 'd MMM yyyy', { locale: fr })}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="badge-status bg-success/10 text-success">Approuvé</span>
                      </td>
                    </tr>
                  ))}
                  {approved.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                        Aucun compte approuvé
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>

      {/* Reject confirmation */}
      <AlertDialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Rejeter ce compte ?</AlertDialogTitle>
            <AlertDialogDescription>
              Êtes-vous sûr de vouloir rejeter le compte de <strong>{rejectTarget?.full_name}</strong> ({rejectTarget?.email}) ?
              Le profil sera supprimé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {processing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <XCircle className="h-4 w-4 mr-2" />}
              Rejeter
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </DashboardLayout>
  );
}
