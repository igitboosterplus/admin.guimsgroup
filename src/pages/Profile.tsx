import { useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { User, Mail, Phone, Building2, Briefcase, Shield, Lock, Loader2, CheckCircle2, CalendarDays, Hash } from 'lucide-react';
import { getDepartmentLogo } from '@/lib/departments';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrateur',
  manager: 'Manager/RH',
  bureau: 'Bureau',
  terrain: 'Terrain',
};

export default function Profile() {
  const { profile, role, refreshProfile, user } = useAuth();
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = useState(profile?.profile_photo_url || '');
  const { toast } = useToast();

  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [phone, setPhone] = useState(profile?.phone || '');

  // Password change
  const [showPassword, setShowPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  const handleSavePhone = async () => {
    if (!profile) return;
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ phone: phone.trim() || null })
      .eq('id', profile.id);

    if (error) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: '✅ Profil mis à jour' });
      await refreshProfile();
      setEditMode(false);
    }
    setSaving(false);
  };

  const handleChangePassword = async () => {
    if (newPassword.length < 6) {
      toast({ title: 'Erreur', description: 'Le mot de passe doit contenir au moins 6 caractères.', variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'Erreur', description: 'Les mots de passe ne correspondent pas.', variant: 'destructive' });
      return;
    }
    setChangingPassword(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: '✅ Mot de passe modifié' });
      setNewPassword('');
      setConfirmPassword('');
      setShowPassword(false);
    }
    setChangingPassword(false);
  };

  if (!profile) return null;

  return (
    <DashboardLayout>
      <div className="animate-fade-in max-w-2xl mx-auto">
        <h1 className="page-title mb-6">Mon Profil</h1>

        {/* Identity card */}
        <Card className="mb-6">
          <CardHeader className="pb-4">
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary text-2xl font-bold overflow-hidden">
                {photoUrl ? (
                  <img src={photoUrl} alt="Photo de profil" className="h-16 w-16 object-cover rounded-full" />
                ) : (
                  profile.full_name.charAt(0).toUpperCase()
                )}
              </div>
              <div>
                <CardTitle className="text-xl">{profile.full_name}</CardTitle>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs">
                    <Shield className="h-3 w-3 mr-1" />
                    {ROLE_LABELS[role || ''] || role}
                  </Badge>
                  {profile.is_approved && (
                    <Badge variant="secondary" className="text-xs text-success border-success/30">
                      <CheckCircle2 className="h-3 w-3 mr-1" />
                      Approuvé
                    </Badge>
                  )}
                </div>
                {/* Upload photo button */}
                <div className="mt-2">
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    id="profile-photo-upload"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setPhotoFile(file);
                      setUploadingPhoto(true);
                      // Upload to Supabase storage
                      const filePath = `${user.id}/profile-photo-${Date.now()}`;
                      const { data, error } = await supabase.storage
                        .from('employee-documents')
                        .upload(filePath, file, { upsert: true });
                      if (error) {
                        toast({ title: 'Erreur upload', description: error.message, variant: 'destructive' });
                        setUploadingPhoto(false);
                        return;
                      }
                      // Get public URL
                      const { publicUrl } = supabase.storage
                        .from('employee-documents')
                        .getPublicUrl(filePath);
                      // Update profile
                      const { error: updateError } = await supabase
                        .from('profiles')
                        .update({ profile_photo_url: publicUrl })
                        .eq('id', profile.id);
                      if (updateError) {
                        toast({ title: 'Erreur profil', description: updateError.message, variant: 'destructive' });
                        setUploadingPhoto(false);
                        return;
                      }
                      setPhotoUrl(publicUrl);
                      await refreshProfile();
                      toast({ title: '✅ Photo de profil mise à jour' });
                      setUploadingPhoto(false);
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-1"
                    disabled={uploadingPhoto}
                    onClick={() => document.getElementById('profile-photo-upload')?.click()}
                  >
                    {uploadingPhoto ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : 'Changer la photo d\'identité'}
                  </Button>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex items-center gap-3 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="font-medium">{profile.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Téléphone</p>
                  {editMode ? (
                    <div className="flex gap-2 items-center">
                      <Input
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="h-7 text-sm w-40"
                        placeholder="Ex: +237 6XX..."
                      />
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleSavePhone} disabled={saving}>
                        {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : 'OK'}
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditMode(false); setPhone(profile.phone || ''); }}>
                        ✕
                      </Button>
                    </div>
                  ) : (
                    <p className="font-medium cursor-pointer hover:text-primary" onClick={() => setEditMode(true)}>
                      {profile.phone || <span className="text-muted-foreground italic">Ajouter un numéro</span>}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Département</p>
                  <div className="flex items-center gap-2">
                    {profile.department && (
                      <img src={getDepartmentLogo(profile.department)} alt="" className="h-4 w-4 rounded object-contain" />
                    )}
                    <p className="font-medium">{profile.department || '—'}</p>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <Briefcase className="h-4 w-4 text-muted-foreground" />
                <div>
                  <p className="text-xs text-muted-foreground">Poste</p>
                  <p className="font-medium">{profile.position || '—'}</p>
                </div>
              </div>
              {(profile as any).hire_date && (
                <div className="flex items-center gap-3 text-sm">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Date d'embauche</p>
                    <p className="font-medium">{format(new Date((profile as any).hire_date), 'd MMMM yyyy', { locale: fr })}</p>
                  </div>
                </div>
              )}
              {(profile as any).matricule && (
                <div className="flex items-center gap-3 text-sm">
                  <Hash className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-xs text-muted-foreground">Matricule</p>
                    <p className="font-medium">{(profile as any).matricule}</p>
                  </div>
                </div>
              )}
            </div>

            <Separator />

            <div className="text-xs text-muted-foreground">
              Membre depuis le {format(new Date(profile.created_at), 'd MMMM yyyy', { locale: fr })}
            </div>
          </CardContent>
        </Card>

        {/* Password change */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Changer le mot de passe
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!showPassword ? (
              <Button variant="outline" onClick={() => setShowPassword(true)}>
                Modifier mon mot de passe
              </Button>
            ) : (
              <div className="space-y-3 max-w-sm">
                <div className="space-y-1">
                  <Label htmlFor="new-pw">Nouveau mot de passe</Label>
                  <Input id="new-pw" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} minLength={6} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="confirm-pw">Confirmer</Label>
                  <Input id="confirm-pw" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                  {confirmPassword && newPassword !== confirmPassword && (
                    <p className="text-xs text-destructive">Les mots de passe ne correspondent pas</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleChangePassword} disabled={changingPassword || !newPassword || newPassword !== confirmPassword}>
                    {changingPassword && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                    Enregistrer
                  </Button>
                  <Button variant="ghost" onClick={() => { setShowPassword(false); setNewPassword(''); setConfirmPassword(''); }}>
                    Annuler
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
