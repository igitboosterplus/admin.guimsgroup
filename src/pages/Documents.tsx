import { useEffect, useState, useCallback } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import {
  FileText,
  Upload,
  Download,
  Trash2,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Eye,
  Image,
  File,
  Plus,
  Search,
  Filter,
  User,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
interface EmployeeDocument {
  id: string;
  user_id: string;
  document_type: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  uploaded_at: string;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
}

interface EmployeeProfile {
  user_id: string;
  full_name: string;
  email: string;
  department: string | null;
  position: string | null;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */
const DOCUMENT_TYPES = [
  { value: 'photo', label: 'Photo d\'identité', icon: Image, multiple: false },
  { value: 'cv', label: 'CV', icon: FileText, multiple: false },
  { value: 'cni', label: 'Carte Nationale d\'Identité', icon: File, multiple: true },
  { value: 'diplome', label: 'Diplôme', icon: FileText, multiple: false },
  { value: 'autre', label: 'Autre', icon: File, multiple: true },
] as const;

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: typeof Clock }> = {
  pending: { label: 'En attente', variant: 'secondary', icon: Clock },
  approved: { label: 'Validé', variant: 'default', icon: CheckCircle },
  rejected: { label: 'Refusé', variant: 'destructive', icon: XCircle },
};

const fmtSize = (bytes: number | null) => {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / 1048576).toFixed(1)} Mo`;
};

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';

/* ================================================================== */
/*  PAGE                                                               */
/* ================================================================== */
export default function Documents() {
  const { user, role } = useAuth();
  const { toast } = useToast();
  const isAdmin = role === 'admin' || role === 'manager';

  /* ---- Shared state ---- */
  const [documents, setDocuments] = useState<EmployeeDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  /* ---- Employee state ---- */
  const [uploadType, setUploadType] = useState<string>('');
  const [uploadFiles, setUploadFiles] = useState<FileList | null>(null);

  /* ---- Admin state ---- */
  const [employees, setEmployees] = useState<EmployeeProfile[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [rejectTarget, setRejectTarget] = useState<EmployeeDocument | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  /* ================================================================ */
  /*  Data fetching                                                    */
  /* ================================================================ */
  const fetchDocuments = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      let query = supabase
        .from('employee_documents')
        .select('*')
        .order('uploaded_at', { ascending: false });

      if (!isAdmin) {
        query = query.eq('user_id', user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setDocuments((data as EmployeeDocument[]) || []);
    } catch (err: unknown) {
      toast({ title: 'Erreur', description: err instanceof Error ? err.message : 'Erreur inconnue', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin, toast]);

  const fetchEmployees = useCallback(async () => {
    if (!isAdmin) return;
    const { data } = await supabase
      .from('profiles')
      .select('user_id, full_name, email, department, position')
      .eq('archived', false)
      .order('full_name');
    if (data) setEmployees(data as EmployeeProfile[]);
  }, [isAdmin]);

  useEffect(() => {
    fetchDocuments();
    fetchEmployees();
  }, [fetchDocuments, fetchEmployees]);

  /* ================================================================ */
  /*  Upload                                                           */
  /* ================================================================ */
  const handleUpload = async () => {
    if (!user || !uploadType || !uploadFiles?.length) return;
    setUploading(true);
    try {
      const typeConf = DOCUMENT_TYPES.find(t => t.value === uploadType);
      if (!typeConf) throw new Error('Type invalide');

      // For non-multiple types, check if a document already exists
      if (!typeConf.multiple) {
        const existing = documents.find(d => d.document_type === uploadType && d.user_id === user.id);
        if (existing) {
          // Remove old file from storage and DB
          await supabase.storage.from('employee-documents').remove([existing.file_path]);
          await supabase.from('employee_documents').delete().eq('id', existing.id);
        }
      }

      const filesToUpload = Array.from(uploadFiles);
      if (!typeConf.multiple && filesToUpload.length > 1) {
        throw new Error('Un seul fichier autorisé pour ce type de document');
      }

      for (const file of filesToUpload) {
        const ext = file.name.split('.').pop()?.toLowerCase() || '';
        const safeName = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const filePath = `${user.id}/${uploadType}/${safeName}`;

        const { error: uploadError } = await supabase.storage
          .from('employee-documents')
          .upload(filePath, file);
        if (uploadError) throw uploadError;

        const { error: dbError } = await supabase.from('employee_documents').insert({
          user_id: user.id,
          document_type: uploadType,
          file_name: file.name,
          file_path: filePath,
          file_size: file.size,
        });
        if (dbError) throw dbError;
      }

      toast({ title: 'Succès', description: `${filesToUpload.length} fichier(s) envoyé(s)` });
      setUploadType('');
      setUploadFiles(null);
      // Reset file input
      const fileInput = document.getElementById('file-upload') as HTMLInputElement;
      if (fileInput) fileInput.value = '';
      await fetchDocuments();
    } catch (err: unknown) {
      toast({ title: 'Erreur', description: err instanceof Error ? err.message : 'Erreur inconnue', variant: 'destructive' });
    } finally {
      setUploading(false);
    }
  };

  /* ================================================================ */
  /*  Download / Preview                                               */
  /* ================================================================ */
  const handleDownload = async (doc: EmployeeDocument) => {
    try {
      const { data, error } = await supabase.storage
        .from('employee-documents')
        .createSignedUrl(doc.file_path, 300);
      if (error) throw error;
      window.open(data.signedUrl, '_blank');
    } catch (err: unknown) {
      toast({ title: 'Erreur', description: err instanceof Error ? err.message : 'Erreur inconnue', variant: 'destructive' });
    }
  };

  const handlePreview = async (doc: EmployeeDocument) => {
    try {
      const { data, error } = await supabase.storage
        .from('employee-documents')
        .createSignedUrl(doc.file_path, 300);
      if (error) throw error;
      setPreviewUrl(data.signedUrl);
    } catch (err: unknown) {
      toast({ title: 'Erreur', description: err instanceof Error ? err.message : 'Erreur inconnue', variant: 'destructive' });
    }
  };

  /* ================================================================ */
  /*  Delete (employee only deletes own)                               */
  /* ================================================================ */
  const handleDelete = async (doc: EmployeeDocument) => {
    try {
      await supabase.storage.from('employee-documents').remove([doc.file_path]);
      const { error } = await supabase.from('employee_documents').delete().eq('id', doc.id);
      if (error) throw error;
      toast({ title: 'Supprimé', description: 'Document supprimé' });
      await fetchDocuments();
    } catch (err: unknown) {
      toast({ title: 'Erreur', description: err instanceof Error ? err.message : 'Erreur inconnue', variant: 'destructive' });
    }
  };

  /* ================================================================ */
  /*  Admin: Approve / Reject                                          */
  /* ================================================================ */
  const handleApprove = async (doc: EmployeeDocument) => {
    if (!user) return;
    try {
      const { error } = await supabase
        .from('employee_documents')
        .update({
          status: 'approved',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: null,
        })
        .eq('id', doc.id);
      if (error) throw error;
      toast({ title: 'Validé', description: `${doc.file_name} a été validé` });
      await fetchDocuments();
    } catch (err: unknown) {
      toast({ title: 'Erreur', description: err instanceof Error ? err.message : 'Erreur inconnue', variant: 'destructive' });
    }
  };

  const handleReject = async () => {
    if (!user || !rejectTarget) return;
    try {
      const { error } = await supabase
        .from('employee_documents')
        .update({
          status: 'rejected',
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          rejection_reason: rejectReason || null,
        })
        .eq('id', rejectTarget.id);
      if (error) throw error;
      toast({ title: 'Refusé', description: `${rejectTarget.file_name} a été refusé` });
      setRejectTarget(null);
      setRejectReason('');
      await fetchDocuments();
    } catch (err: unknown) {
      toast({ title: 'Erreur', description: err instanceof Error ? err.message : 'Erreur inconnue', variant: 'destructive' });
    }
  };

  /* ================================================================ */
  /*  Computed data                                                    */
  /* ================================================================ */
  const myDocs = documents.filter(d => d.user_id === user?.id);

  const filteredDocs = documents.filter(d => {
    if (selectedEmployee !== 'all' && d.user_id !== selectedEmployee) return false;
    if (statusFilter !== 'all' && d.status !== statusFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      const emp = employees.find(e => e.user_id === d.user_id);
      const empName = emp?.full_name?.toLowerCase() || '';
      if (!d.file_name.toLowerCase().includes(q) && !empName.includes(q) && !d.document_type.includes(q)) return false;
    }
    return true;
  });

  const getEmployeeName = (userId: string) =>
    employees.find(e => e.user_id === userId)?.full_name || 'Inconnu';

  const getDocTypeLabel = (type: string) =>
    DOCUMENT_TYPES.find(t => t.value === type)?.label || type;

  const isImageFile = (fileName: string) =>
    /\.(jpg|jpeg|png|webp)$/i.test(fileName);

  /* ================================================================ */
  /*  Employee: progress per type                                      */
  /* ================================================================ */
  const requiredTypes = DOCUMENT_TYPES.filter(t => t.value !== 'autre');
  const completedTypes = requiredTypes.filter(t =>
    myDocs.some(d => d.document_type === t.value && d.status === 'approved')
  );
  const progressPercent = requiredTypes.length > 0
    ? Math.round(completedTypes.length / requiredTypes.length * 100)
    : 0;

  /* ================================================================ */
  /*  RENDER                                                           */
  /* ================================================================ */
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">
            {isAdmin ? 'Gestion des documents' : 'Mes documents'}
          </h1>
          <p className="text-muted-foreground">
            {isAdmin
              ? 'Consultez et validez les documents des employés'
              : 'Envoyez et suivez vos documents requis'}
          </p>
        </div>

        {/* ======================================================== */}
        {/*  EMPLOYEE VIEW                                            */}
        {/* ======================================================== */}
        {!isAdmin && (
          <>
            {/* Progress overview */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Progression du dossier</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3 mb-3">
                  <Progress value={progressPercent} className="flex-1 h-3" />
                  <span className="font-bold text-sm">{progressPercent}%</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {requiredTypes.map(type => {
                    const docs = myDocs.filter(d => d.document_type === type.value);
                    const approved = docs.some(d => d.status === 'approved');
                    const pending = docs.some(d => d.status === 'pending');
                    const rejected = docs.some(d => d.status === 'rejected');
                    const missing = docs.length === 0;

                    let statusBadge;
                    if (approved) statusBadge = <Badge variant="default"><CheckCircle className="h-3 w-3 mr-1" />Validé</Badge>;
                    else if (pending) statusBadge = <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />En attente</Badge>;
                    else if (rejected) statusBadge = <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Refusé</Badge>;
                    else statusBadge = <Badge variant="outline">Manquant</Badge>;

                    return (
                      <div key={type.value} className="p-3 rounded-lg border bg-card">
                        <div className="flex items-center gap-2 mb-2">
                          <type.icon className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm font-medium">{type.label}</span>
                        </div>
                        {statusBadge}
                        {missing && (
                          <p className="text-xs text-muted-foreground mt-1">Non fourni</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Upload form */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Envoyer un document
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row gap-3">
                  <Select value={uploadType} onValueChange={setUploadType}>
                    <SelectTrigger className="w-full sm:w-[240px]">
                      <SelectValue placeholder="Type de document" />
                    </SelectTrigger>
                    <SelectContent>
                      {DOCUMENT_TYPES.map(t => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    id="file-upload"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx"
                    multiple={DOCUMENT_TYPES.find(t => t.value === uploadType)?.multiple || false}
                    onChange={(e) => setUploadFiles(e.target.files)}
                    className="flex-1"
                  />
                  <Button onClick={handleUpload} disabled={uploading || !uploadType || !uploadFiles?.length}>
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Upload className="h-4 w-4 mr-1.5" />}
                    {uploading ? 'Envoi…' : 'Envoyer'}
                  </Button>
                </div>
                {uploadType && DOCUMENT_TYPES.find(t => t.value === uploadType)?.multiple && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Vous pouvez sélectionner plusieurs fichiers pour ce type de document.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* My documents list */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Mes documents envoyés</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : myDocs.length === 0 ? (
                  <p className="text-center text-muted-foreground py-6">Aucun document envoyé</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Type</TableHead>
                          <TableHead>Fichier</TableHead>
                          <TableHead>Taille</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Statut</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {myDocs.map(doc => {
                          const st = STATUS_CONFIG[doc.status] || STATUS_CONFIG.pending;
                          return (
                            <TableRow key={doc.id}>
                              <TableCell>
                                <span className="text-sm">{getDocTypeLabel(doc.document_type)}</span>
                              </TableCell>
                              <TableCell className="max-w-[200px] truncate text-sm">{doc.file_name}</TableCell>
                              <TableCell className="text-sm">{fmtSize(doc.file_size)}</TableCell>
                              <TableCell className="text-sm">{fmtDate(doc.uploaded_at)}</TableCell>
                              <TableCell>
                                <Badge variant={st.variant} className="gap-1">
                                  <st.icon className="h-3 w-3" />
                                  {st.label}
                                </Badge>
                                {doc.status === 'rejected' && doc.rejection_reason && (
                                  <p className="text-xs text-destructive mt-1">{doc.rejection_reason}</p>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {isImageFile(doc.file_name) && (
                                    <Button size="sm" variant="ghost" onClick={() => handlePreview(doc)} title="Aperçu">
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  )}
                                  <Button size="sm" variant="ghost" onClick={() => handleDownload(doc)} title="Télécharger">
                                    <Download className="h-4 w-4" />
                                  </Button>
                                  {doc.status !== 'approved' && (
                                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(doc)} title="Supprimer">
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* ======================================================== */}
        {/*  ADMIN VIEW                                               */}
        {/* ======================================================== */}
        {isAdmin && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4 pb-3 text-center">
                  <p className="text-2xl font-bold">{documents.length}</p>
                  <p className="text-xs text-muted-foreground">Total documents</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 text-center">
                  <p className="text-2xl font-bold text-yellow-600">{documents.filter(d => d.status === 'pending').length}</p>
                  <p className="text-xs text-muted-foreground">En attente</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 text-center">
                  <p className="text-2xl font-bold text-green-600">{documents.filter(d => d.status === 'approved').length}</p>
                  <p className="text-xs text-muted-foreground">Validés</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4 pb-3 text-center">
                  <p className="text-2xl font-bold text-red-600">{documents.filter(d => d.status === 'rejected').length}</p>
                  <p className="text-xs text-muted-foreground">Refusés</p>
                </CardContent>
              </Card>
            </div>

            {/* Filters */}
            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Rechercher par nom ou fichier…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                    <SelectTrigger className="w-full sm:w-[220px]">
                      <SelectValue placeholder="Tous les employés" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les employés</SelectItem>
                      {employees.map(emp => (
                        <SelectItem key={emp.user_id} value={emp.user_id}>{emp.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-full sm:w-[160px]">
                      <SelectValue placeholder="Tous les statuts" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous les statuts</SelectItem>
                      <SelectItem value="pending">En attente</SelectItem>
                      <SelectItem value="approved">Validé</SelectItem>
                      <SelectItem value="rejected">Refusé</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Documents table */}
            <Card>
              <CardContent className="pt-4">
                {loading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : filteredDocs.length === 0 ? (
                  <p className="text-center text-muted-foreground py-6">Aucun document trouvé</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Employé</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Fichier</TableHead>
                          <TableHead>Taille</TableHead>
                          <TableHead>Date d'envoi</TableHead>
                          <TableHead>Statut</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredDocs.map(doc => {
                          const st = STATUS_CONFIG[doc.status] || STATUS_CONFIG.pending;
                          return (
                            <TableRow key={doc.id}>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <User className="h-4 w-4 text-muted-foreground" />
                                  <span className="text-sm font-medium">{getEmployeeName(doc.user_id)}</span>
                                </div>
                              </TableCell>
                              <TableCell>
                                <span className="text-sm">{getDocTypeLabel(doc.document_type)}</span>
                              </TableCell>
                              <TableCell className="max-w-[180px] truncate text-sm">{doc.file_name}</TableCell>
                              <TableCell className="text-sm">{fmtSize(doc.file_size)}</TableCell>
                              <TableCell className="text-sm">{fmtDate(doc.uploaded_at)}</TableCell>
                              <TableCell>
                                <Badge variant={st.variant} className="gap-1">
                                  <st.icon className="h-3 w-3" />
                                  {st.label}
                                </Badge>
                                {doc.rejection_reason && (
                                  <p className="text-xs text-destructive mt-1 max-w-[150px] truncate" title={doc.rejection_reason}>
                                    {doc.rejection_reason}
                                  </p>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  {isImageFile(doc.file_name) && (
                                    <Button size="sm" variant="ghost" onClick={() => handlePreview(doc)} title="Aperçu">
                                      <Eye className="h-4 w-4" />
                                    </Button>
                                  )}
                                  <Button size="sm" variant="ghost" onClick={() => handleDownload(doc)} title="Télécharger">
                                    <Download className="h-4 w-4" />
                                  </Button>
                                  {doc.status !== 'approved' && (
                                    <Button size="sm" variant="ghost" className="text-green-600" onClick={() => handleApprove(doc)} title="Valider">
                                      <CheckCircle className="h-4 w-4" />
                                    </Button>
                                  )}
                                  {doc.status !== 'rejected' && (
                                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { setRejectTarget(doc); setRejectReason(''); }} title="Refuser">
                                      <XCircle className="h-4 w-4" />
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Employee dossier overview */}
            {selectedEmployee !== 'all' && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    Dossier de {getEmployeeName(selectedEmployee)}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {requiredTypes.map(type => {
                      const docs = filteredDocs.filter(d => d.document_type === type.value && d.user_id === selectedEmployee);
                      const approved = docs.some(d => d.status === 'approved');
                      const pending = docs.some(d => d.status === 'pending');
                      const rejected = docs.filter(d => d.status === 'rejected').length;

                      return (
                        <div key={type.value} className="p-3 rounded-lg border bg-card">
                          <div className="flex items-center gap-2 mb-2">
                            <type.icon className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm font-medium">{type.label}</span>
                          </div>
                          {approved ? (
                            <Badge variant="default"><CheckCircle className="h-3 w-3 mr-1" />Validé</Badge>
                          ) : pending ? (
                            <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />En attente</Badge>
                          ) : docs.length > 0 ? (
                            <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Refusé ({rejected})</Badge>
                          ) : (
                            <Badge variant="outline">Manquant</Badge>
                          )}
                          <p className="text-xs text-muted-foreground mt-1">{docs.length} fichier(s)</p>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {/* ======================================================== */}
        {/*  Reject Dialog                                            */}
        {/* ======================================================== */}
        <Dialog open={!!rejectTarget} onOpenChange={(open) => { if (!open) { setRejectTarget(null); setRejectReason(''); } }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Refuser le document</DialogTitle>
            </DialogHeader>
            {rejectTarget && (
              <div className="space-y-3">
                <p className="text-sm">
                  Vous êtes sur le point de refuser <strong>{rejectTarget.file_name}</strong> ({getDocTypeLabel(rejectTarget.document_type)}).
                </p>
                <Textarea
                  placeholder="Motif du refus (optionnel)…"
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  rows={3}
                />
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => { setRejectTarget(null); setRejectReason(''); }}>Annuler</Button>
              <Button variant="destructive" onClick={handleReject}>Refuser</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ======================================================== */}
        {/*  Preview Dialog                                           */}
        {/* ======================================================== */}
        <Dialog open={!!previewUrl} onOpenChange={(open) => { if (!open) setPreviewUrl(null); }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Aperçu du document</DialogTitle>
            </DialogHeader>
            {previewUrl && (
              <div className="flex justify-center">
                <img src={previewUrl} alt="Aperçu" className="max-h-[70vh] rounded object-contain" />
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setPreviewUrl(null)}>Fermer</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
