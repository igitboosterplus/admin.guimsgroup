import { useState, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { LogIn, UserPlus, Loader2, FileText, ArrowLeft, ChevronDown, Eye, EyeOff, Upload, X, Camera, FileCheck } from 'lucide-react';
import guimsLogo from '@/assets/guims-logo.png';

const DOC_TYPES = [
  { key: 'photo', label: 'Photo d\'identité', accept: 'image/*', icon: Camera },
  { key: 'cni', label: 'Copie CNI / Passeport', accept: 'image/*,application/pdf', icon: FileCheck },
  { key: 'cv', label: 'CV (Curriculum Vitae)', accept: 'application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document', icon: FileText },
  { key: 'diplome', label: 'Diplôme(s)', accept: 'image/*,application/pdf', icon: FileText },
] as const;

const REGLEMENT_INTERIEUR = `
RÈGLEMENT INTÉRIEUR — GUIMS GROUP

CHAPITRE I : DISPOSITIONS GÉNÉRALES

Article 1 – Objet et champ d'application
Le présent règlement intérieur a pour objet de définir les règles générales et permanentes relatives à la discipline au sein de GUIMS GROUP. Il s'applique à l'ensemble des salariés de l'entreprise, quels que soient leur statut, leur ancienneté ou leur lieu de travail.

Article 2 – Entrée en vigueur
Le présent règlement entre en vigueur à compter de la date de son adoption par la direction. Tout nouvel employé doit en prendre connaissance et l'accepter avant de commencer à travailler.

CHAPITRE II : HORAIRES DE TRAVAIL ET POINTAGE

Article 3 – Horaires de travail
Les horaires de travail sont définis individuellement selon les clauses du contrat de chaque employé et communiqués par la direction. À titre indicatif, les plages horaires courantes sont :
- Plage A : 08h00 à 17h30
- Plage B : 10h30 à 19h30
D'autres plages horaires peuvent être définies en fonction des besoins du service.

Le service fonctionne du lundi au samedi inclus. Le dimanche et les jours fériés sont des jours de repos. Tout travail effectué au-delà des jours ouvrables (dimanche ou jour férié) est considéré comme jour supplémentaire et sera rémunéré à hauteur de 5 % du salaire de base par jour travaillé.

Article 4 – Pointage obligatoire
Chaque employé est tenu de pointer son arrivée et son départ via le système de pointage mis à disposition. Tout oubli de pointage doit être signalé dans les 24 heures au responsable hiérarchique.

Article 5 – Retards et heures d'absence
Une heure d'absence est constatée lorsqu'un employé arrive plus de 30 minutes après son heure de prise de service, ou lorsqu'il quitte son poste plus de 30 minutes avant son heure de fin de service. Chaque heure d'absence entraîne une retenue de 1 % du salaire de base.

Exemple : si l'heure de prise de service est 08h00 et que l'employé arrive à 09h15, il cumule 1 heure d'absence (comptée à partir de 08h30, seuil de tolérance). Le nombre d'heures d'absence est arrondi à l'heure supérieure.

Article 6 – Absences journalières
Toute absence non justifiée sur une journée complète (aucun pointage enregistré un jour ouvrable) entraîne une retenue de 4 % du salaire de base par jour d'absence. Toute absence doit être signalée et justifiée dans les 48 heures. Les absences répétées et non justifiées pourront donner lieu à des sanctions disciplinaires.

Article 6 bis – Oubli de pointage de départ
Chaque employé est tenu de pointer son départ en fin de journée. En cas d'oubli de pointage de départ sur un jour passé, le système considère que l'employé est parti à l'heure de son arrivée et les heures d'absence correspondantes (de l'arrivée jusqu'à l'heure de fin prévue) sont déduites conformément à l'Article 5 (1 % par heure). L'employé peut demander à un administrateur de corriger l'heure de départ dans un délai de 48 heures.

CHAPITRE III : DISCIPLINE ET COMPORTEMENT

Article 7 – Tenue et comportement
Les employés sont tenus d'adopter une tenue vestimentaire correcte et un comportement professionnel en toute circonstance. Le respect mutuel entre collègues est une exigence fondamentale.

Article 8 – Utilisation des équipements
Les équipements, outils et matériels mis à disposition par l'entreprise sont destinés à un usage exclusivement professionnel. Toute utilisation abusive ou négligente pourra engager la responsabilité de l'employé.

Article 9 – Confidentialité
Les employés sont tenus au secret professionnel concernant toutes les informations relatives à l'entreprise, ses clients, ses partenaires et ses stratégies. Cette obligation perdure après la fin du contrat de travail.

Article 10 – Interdictions
Sont strictement interdits dans l'enceinte de l'entreprise :
- La consommation d'alcool et de substances illicites
- Le harcèlement moral ou sexuel sous toute forme
- Les actes de violence verbale ou physique
- L'introduction de personnes étrangères sans autorisation
- L'utilisation des ressources de l'entreprise à des fins personnelles

CHAPITRE IV : SANCTIONS DISCIPLINAIRES

Article 11 – Échelle des sanctions
En cas de manquement au présent règlement, les sanctions suivantes pourront être appliquées :
1. Avertissement verbal
2. Avertissement écrit
3. Mise à pied disciplinaire (1 à 5 jours)
4. Licenciement pour faute simple
5. Licenciement pour faute grave

Article 12 – Procédure disciplinaire
Aucune sanction ne peut être prononcée sans que l'employé ait été préalablement informé des griefs retenus contre lui et entendu dans ses explications.

CHAPITRE V : HYGIÈNE ET SÉCURITÉ

Article 13 – Sécurité
Chaque employé doit respecter les consignes de sécurité affichées et communiquées. Tout accident ou incident doit être immédiatement signalé à la direction.

Article 14 – Hygiène
Les locaux doivent être maintenus propres et rangés. Chaque employé est responsable de la propreté de son espace de travail.

CHAPITRE VI : DISPOSITIONS FINALES

Article 15 – Modification du règlement
La direction se réserve le droit de modifier le présent règlement. Toute modification sera portée à la connaissance des employés.

Article 16 – Acceptation
En acceptant le présent règlement, l'employé reconnaît en avoir pris connaissance dans son intégralité et s'engage à le respecter.

Fait à Douala, le 1er janvier 2026
La Direction Générale — GUIMS GROUP
`.trim();

export default function Login() {
  const { user, loading, isApproved, rulesAccepted, signIn, signUp } = useAuth();
  const { toast } = useToast();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [address, setAddress] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Signup flow: step 1 = info, step 2 = règlement, step 3 = documents
  const [signUpStep, setSignUpStep] = useState<1 | 2 | 3>(1);
  const [rulesRead, setRulesRead] = useState(false);
  const [rulesAcceptedLocal, setRulesAcceptedLocal] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
  const [resetEmail, setResetEmail] = useState('');

  // Document uploads
  const [docFiles, setDocFiles] = useState<Record<string, File | null>>({ photo: null, cni: null, cv: null, diplome: null });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Redirect to dashboard if user is logged in and approved
  if (user && isApproved && rulesAccepted) return <Navigate to="/dashboard" replace />;

  // User is logged in but pending approval
  if (user && rulesAccepted && !isApproved) {
    return <PendingApprovalScreen />;
  }

  const handleScrollEnd = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const atBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 30;
    if (atBottom) setRulesRead(true);
  };

  const handleSignUpStep1 = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim() || password.length < 6 || !phone.trim() || !dateOfBirth) {
      toast({ title: 'Erreur', description: 'Veuillez remplir tous les champs obligatoires (*).', variant: 'destructive' });
      return;
    }
    setSignUpStep(2);
    setRulesRead(false);
    setRulesAcceptedLocal(false);
  };

  const handleRulesAccepted = () => {
    setSignUpStep(3);
  };

  const handleDocFile = (key: string, file: File | null) => {
    setDocFiles((prev) => ({ ...prev, [key]: file }));
  };

  const handleSignUpConfirm = async () => {
    setSubmitting(true);

    const { error } = await signUp(email, password, fullName);
    if (error) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
      setSubmitting(false);
      return;
    }

    // Wait for the trigger to create the profile
    await new Promise((r) => setTimeout(r, 1500));
    const { data: { user: newUser } } = await supabase.auth.getUser();
    if (newUser) {
      // Update profile with extra info + rules accepted
      await supabase
        .from('profiles')
        .update({
          rules_accepted: true,
          phone: phone.trim() || null,
          date_of_birth: dateOfBirth || null,
          address: address.trim() || null,
          national_id: nationalId.trim() || null,
          emergency_contact_name: emergencyName.trim() || null,
          emergency_contact_phone: emergencyPhone.trim() || null,
        })
        .eq('user_id', newUser.id);

      // Upload documents
      for (const [docType, file] of Object.entries(docFiles)) {
        if (!file) continue;
        const ext = file.name.split('.').pop() || 'bin';
        const filePath = `${newUser.id}/${docType}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('employee-documents')
          .upload(filePath, file, { upsert: true });

        if (!uploadErr) {
          await supabase.from('employee_documents').insert({
            user_id: newUser.id,
            document_type: docType,
            file_name: file.name,
            file_path: filePath,
            file_size: file.size,
          });
        }
      }
    }

    toast({
      title: '✅ Compte créé',
      description: 'Votre compte est en attente d\'approbation par un administrateur.',
    });
    setSubmitting(false);
    setSignUpStep(1);
    setIsSignUp(false);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    const { error } = await signIn(email, password);
    if (error) {
      const msg = error.message.includes('schema')
        ? 'Erreur temporaire du serveur. Veuillez réessayer dans quelques secondes.'
        : error.message;
      toast({ title: 'Erreur de connexion', description: msg, variant: 'destructive' });
    }
    setSubmitting(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetEmail.trim()) {
      toast({ title: 'Erreur', description: 'Veuillez entrer votre adresse email.', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      redirectTo: window.location.origin + '/login',
    });
    if (error) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Email envoyé', description: 'Si un compte existe avec cet email, vous recevrez un lien de réinitialisation.' });
      setForgotMode(false);
      setResetEmail('');
    }
    setSubmitting(false);
  };

  return (
    <div className="flex min-h-screen bg-gradient-hero">
      {/* Left branding */}
      <div className="hidden lg:flex lg:w-1/2 flex-col items-center justify-center p-12 text-primary-foreground">
        <img src={guimsLogo} alt="Guims Group" className="w-32 h-32 mb-8" />
        <h1 className="font-display text-4xl font-bold mb-4">GUIMS GROUP</h1>
        <p className="text-lg opacity-80 text-center max-w-md">
          Système de Gestion du Personnel — Suivi des présences, rapports et gestion des salaires
        </p>
      </div>

      {/* Login form */}
      <div className="flex w-full lg:w-1/2 items-center justify-center p-6">
        <Card className={`w-full animate-fade-in border-0 shadow-xl ${isSignUp ? 'max-w-lg' : 'max-w-md'}`}>
          <CardHeader className="text-center pb-2">
            <div className="lg:hidden flex flex-col items-center mb-4">
              <img src={guimsLogo} alt="Guims Group" className="w-16 h-16 mb-2" />
              <span className="font-display text-xl font-bold text-primary">GUIMS GROUP</span>
            </div>

            {isSignUp && signUpStep === 2 ? (
              <>
                <div className="flex items-center gap-2 justify-center mb-1">
                  <FileText className="h-5 w-5 text-primary" />
                  <h2 className="font-display text-xl font-bold">Règlement Intérieur</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  Veuillez lire l'intégralité du règlement et l'accepter
                </p>
              </>
            ) : isSignUp && signUpStep === 3 ? (
              <>
                <div className="flex items-center gap-2 justify-center mb-1">
                  <Upload className="h-5 w-5 text-primary" />
                  <h2 className="font-display text-xl font-bold">Documents</h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  Téléchargez vos documents (facultatif, modifiable plus tard)
                </p>
              </>
            ) : (
              <>
                <h2 className="font-display text-2xl font-bold">
                  {isSignUp ? 'Créer un compte' : 'Connexion'}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {isSignUp ? 'Remplissez les informations ci-dessous' : 'Entrez vos identifiants'}
                </p>
              </>
            )}
            {isSignUp && (
              <div className="flex items-center justify-center gap-2 mt-3">
                {[1, 2, 3].map((s) => (
                  <div key={s} className={`flex items-center gap-1 ${s <= signUpStep ? 'text-primary' : 'text-muted-foreground/40'}`}>
                    <div className={`h-2 w-2 rounded-full ${s <= signUpStep ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
                    <span className="text-[10px] font-medium">{s === 1 ? 'Infos' : s === 2 ? 'Règlement' : 'Documents'}</span>
                  </div>
                ))}
              </div>
            )}
          </CardHeader>
          <CardContent className={isSignUp ? 'max-h-[70vh] overflow-y-auto' : ''}>
            {/* STEP 2: Règlement intérieur */}
            {isSignUp && signUpStep === 2 ? (
              <div className="space-y-4">
                <div className="relative">
                  <ScrollArea
                    className="h-[320px] rounded-md border p-4 text-sm leading-relaxed"
                    onScrollCapture={handleScrollEnd}
                    ref={scrollRef}
                  >
                    <div className="whitespace-pre-wrap text-muted-foreground">
                      {REGLEMENT_INTERIEUR}
                    </div>
                  </ScrollArea>
                  {!rulesRead && (
                    <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center pb-2 pointer-events-none">
                      <span className="flex items-center gap-1 text-xs text-primary bg-background/90 rounded-full px-3 py-1 shadow">
                        <ChevronDown className="h-3 w-3 animate-bounce" />
                        Faites défiler pour lire la suite
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-start space-x-3 pt-2">
                  <Checkbox
                    id="accept-rules"
                    checked={rulesAcceptedLocal}
                    onCheckedChange={(v) => setRulesAcceptedLocal(v === true)}
                    disabled={!rulesRead}
                  />
                  <Label htmlFor="accept-rules" className="text-sm leading-tight cursor-pointer">
                    J'ai lu et j'accepte le règlement intérieur de GUIMS GROUP dans son intégralité.
                  </Label>
                </div>

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setSignUpStep(1)} className="flex-1">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Retour
                  </Button>
                  <Button
                    onClick={handleRulesAccepted}
                    disabled={!rulesAcceptedLocal}
                    className="flex-1"
                  >
                    Continuer
                  </Button>
                </div>
              </div>
            ) : isSignUp && signUpStep === 3 ? (
              /* STEP 3: Document upload */
              <div className="space-y-4">
                {DOC_TYPES.map(({ key, label, accept, icon: Icon }) => {
                  const file = docFiles[key];
                  return (
                    <div key={key} className="rounded-lg border p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Icon className="h-4 w-4 text-muted-foreground" />
                          {label}
                        </div>
                        {file ? (
                          <button type="button" onClick={() => handleDocFile(key, null)} className="text-muted-foreground hover:text-destructive" title="Supprimer le fichier">
                            <X className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                      {file ? (
                        <p className="text-xs text-muted-foreground mt-1 truncate">{file.name} ({(file.size / 1024).toFixed(0)} Ko)</p>
                      ) : (
                        <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed border-muted-foreground/20 p-3 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors">
                          <Upload className="h-4 w-4" />
                          Choisir un fichier
                          <input
                            type="file"
                            accept={accept}
                            className="hidden"
                            onChange={(e) => handleDocFile(key, e.target.files?.[0] || null)}
                          />
                        </label>
                      )}
                    </div>
                  );
                })}

                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setSignUpStep(2)} className="flex-1">
                    <ArrowLeft className="h-4 w-4 mr-2" />
                    Retour
                  </Button>
                  <Button
                    onClick={handleSignUpConfirm}
                    disabled={submitting}
                    className="flex-1"
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <UserPlus className="h-4 w-4 mr-2" />
                    )}
                    Créer le compte
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* STEP 1: Login or Signup form fields */}
                {forgotMode ? (
                  <form onSubmit={handleForgotPassword} className="space-y-4">
                    <p className="text-sm text-muted-foreground">Entrez votre adresse email pour recevoir un lien de réinitialisation.</p>
                    <div className="space-y-2">
                      <Label htmlFor="resetEmail">Email</Label>
                      <Input
                        id="resetEmail"
                        type="email"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        placeholder="nom@guimsgroup.com"
                        required
                      />
                    </div>
                    <Button type="submit" className="w-full" disabled={submitting}>
                      {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                      Envoyer le lien
                    </Button>
                    <div className="text-center">
                      <button
                        type="button"
                        onClick={() => setForgotMode(false)}
                        className="text-sm text-muted-foreground hover:text-primary transition-colors"
                      >
                        <ArrowLeft className="inline h-3 w-3 mr-1" />
                        Retour à la connexion
                      </button>
                    </div>
                  </form>
                ) : (
                <form onSubmit={isSignUp ? handleSignUpStep1 : handleLogin} className="space-y-4">
                  {isSignUp && (
                    <>
                      <div className="space-y-2">
                        <Label htmlFor="fullName">Nom complet *</Label>
                        <Input
                          id="fullName"
                          value={fullName}
                          onChange={(e) => setFullName(e.target.value)}
                          placeholder="Jean Dupont"
                          required
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="phone">Téléphone *</Label>
                          <Input
                            id="phone"
                            type="tel"
                            value={phone}
                            onChange={(e) => setPhone(e.target.value)}
                            placeholder="+237 6XX XXX XXX"
                            required
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="dob">Date de naissance *</Label>
                          <Input
                            id="dob"
                            type="date"
                            value={dateOfBirth}
                            onChange={(e) => setDateOfBirth(e.target.value)}
                            required
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="nationalId">N° CNI / Passeport</Label>
                        <Input
                          id="nationalId"
                          value={nationalId}
                          onChange={(e) => setNationalId(e.target.value)}
                          placeholder="Numéro d'identité"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="address">Adresse</Label>
                        <Input
                          id="address"
                          value={address}
                          onChange={(e) => setAddress(e.target.value)}
                          placeholder="Quartier, Ville"
                        />
                      </div>
                      <Separator />
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Contact d'urgence</p>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                          <Label htmlFor="emergName">Nom</Label>
                          <Input
                            id="emergName"
                            value={emergencyName}
                            onChange={(e) => setEmergencyName(e.target.value)}
                            placeholder="Nom du contact"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="emergPhone">Téléphone</Label>
                          <Input
                            id="emergPhone"
                            type="tel"
                            value={emergencyPhone}
                            onChange={(e) => setEmergencyPhone(e.target.value)}
                            placeholder="+237 6XX XXX XXX"
                          />
                        </div>
                      </div>
                      <Separator />
                    </>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nom@guimsgroup.com"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Mot de passe</Label>
                    <div className="relative">
                      <Input
                        id="password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        required
                        minLength={6}
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                    {!isSignUp && (
                      <div className="text-right">
                        <button
                          type="button"
                          onClick={() => { setForgotMode(true); setResetEmail(email); }}
                          className="text-xs text-muted-foreground hover:text-primary transition-colors"
                        >
                          Mot de passe oublié ?
                        </button>
                      </div>
                    )}
                  </div>
                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : isSignUp ? (
                      <FileText className="h-4 w-4 mr-2" />
                    ) : (
                      <LogIn className="h-4 w-4 mr-2" />
                    )}
                    {isSignUp ? 'Lire le règlement & continuer' : 'Se connecter'}
                  </Button>
                </form>
                )}
                <div className="mt-4 text-center">
                  <button
                    type="button"
                    onClick={() => { setIsSignUp(!isSignUp); setSignUpStep(1); setForgotMode(false); }}
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    {isSignUp ? 'Déjà un compte ? Se connecter' : "Pas de compte ? Créer un compte"}
                  </button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function PendingApprovalScreen() {
  const { signOut, profile } = useAuth();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-warning/10">
            <Loader2 className="h-8 w-8 text-warning animate-spin" />
          </div>
          <h2 className="font-display text-2xl font-bold">Compte en attente</h2>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-muted-foreground">
            Bonjour <strong>{profile?.full_name}</strong>, votre compte a été créé avec succès et le règlement intérieur a été accepté.
          </p>
          <p className="text-muted-foreground">
            Un administrateur doit maintenant <strong>approuver votre compte</strong> avant que vous ne puissiez accéder à l'application.
          </p>
          <div className="rounded-lg bg-muted p-3">
            <p className="text-sm text-muted-foreground">
              Veuillez contacter votre responsable ou l'administrateur pour accélérer l'approbation.
            </p>
          </div>
          <Button variant="outline" onClick={signOut} className="w-full mt-4">
            Se déconnecter
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
