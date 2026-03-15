import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import DashboardLayout from '@/components/DashboardLayout';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { usePermissions } from '@/hooks/usePermissions';
import { Settings as SettingsIcon, Save, Loader2, Plus, X, Briefcase, Brain } from 'lucide-react';
import { DEPARTMENTS, getPositionsForDepartment, GLOBAL_POSITIONS } from '@/lib/departments';

export default function Settings() {
  const { toast } = useToast();
  const { can, loading: permLoading } = usePermissions();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [customPositions, setCustomPositions] = useState<Record<string, string[]>>({});
  const [newPosDept, setNewPosDept] = useState('');
  const [newPosName, setNewPosName] = useState('');
  const [savingPositions, setSavingPositions] = useState(false);
  const [form, setForm] = useState({
    work_start_time: '08:00',
    work_end_time: '17:00',
    office_ip: '0.0.0.0',
    late_deduction_type: 'fixed',
    late_deduction_amount: 2000,
    absence_deduction_type: 'fixed',
    absence_deduction_amount: 5000,
    currency: 'FCFA',
  });
  const [aiForm, setAiForm] = useState({
    ai_api_key: '',
    ai_provider: 'openai',
    ai_model: 'gpt-4o-mini',
    ai_base_url: 'https://api.openai.com/v1',
  });
  const [savingAi, setSavingAi] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      const { data } = await supabase.from('app_settings').select('*');
      if (data) {
        const map: Record<string, any> = {};
        data.forEach((s) => { map[s.key] = s.value; });

        setForm({
          work_start_time: String(map.work_start_time || '08:00').replace(/"/g, ''),
          work_end_time: String(map.work_end_time || '17:00').replace(/"/g, ''),
          office_ip: String(map.office_ip || '0.0.0.0').replace(/"/g, ''),
          late_deduction_type: map.late_deduction?.type || 'fixed',
          late_deduction_amount: map.late_deduction?.amount || 2000,
          absence_deduction_type: map.absence_deduction?.type || 'fixed',
          absence_deduction_amount: map.absence_deduction?.amount || 5000,
          currency: String(map.currency || 'FCFA').replace(/"/g, ''),
        });
        if (map.custom_positions && typeof map.custom_positions === 'object') {
          setCustomPositions(map.custom_positions as Record<string, string[]>);
        }

        // AI settings
        setAiForm({
          ai_api_key: String(map.ai_api_key || '').replace(/"/g, ''),
          ai_provider: String(map.ai_provider || 'openai').replace(/"/g, ''),
          ai_model: String(map.ai_model || 'gpt-4o-mini').replace(/"/g, ''),
          ai_base_url: String(map.ai_base_url || 'https://api.openai.com/v1').replace(/"/g, ''),
        });
      }
      setLoading(false);
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    // Validation
    if (form.work_start_time >= form.work_end_time) {
      toast({ title: 'Erreur', description: 'L\'heure d\'arrivée doit être avant l\'heure de départ.', variant: 'destructive' });
      return;
    }
    if (form.office_ip !== '0.0.0.0' && !/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(form.office_ip)) {
      toast({ title: 'Erreur', description: 'L\'adresse IP n\'est pas valide (format: x.x.x.x ou 0.0.0.0 pour désactiver).', variant: 'destructive' });
      return;
    }
    if (form.late_deduction_amount < 0 || form.absence_deduction_amount < 0) {
      toast({ title: 'Erreur', description: 'Les montants de déduction doivent être positifs.', variant: 'destructive' });
      return;
    }

    setSaving(true);
    const updates = [
      { key: 'work_start_time', value: form.work_start_time },
      { key: 'work_end_time', value: form.work_end_time },
      { key: 'office_ip', value: form.office_ip },
      { key: 'late_deduction', value: { type: form.late_deduction_type, amount: form.late_deduction_amount } },
      { key: 'absence_deduction', value: { type: form.absence_deduction_type, amount: form.absence_deduction_amount } },
      { key: 'currency', value: form.currency },
    ];

    let hasError = false;
    for (const u of updates) {
      const { error } = await supabase
        .from('app_settings')
        .update({ value: u.value as any })
        .eq('key', u.key);
      if (error) hasError = true;
    }

    if (hasError) {
      toast({ title: 'Erreur', description: 'Impossible de sauvegarder les paramètres', variant: 'destructive' });
    } else {
      toast({ title: '✅ Paramètres sauvegardés' });
    }
    setSaving(false);
  };

  const handleSaveAi = async () => {
    setSavingAi(true);
    const aiUpdates = [
      { key: 'ai_api_key', value: aiForm.ai_api_key },
      { key: 'ai_provider', value: aiForm.ai_provider },
      { key: 'ai_model', value: aiForm.ai_model },
      { key: 'ai_base_url', value: aiForm.ai_base_url },
    ];
    let hasError = false;
    for (const u of aiUpdates) {
      const { error } = await supabase
        .from('app_settings')
        .upsert({ key: u.key, value: u.value as any }, { onConflict: 'key' });
      if (error) hasError = true;
    }
    if (hasError) {
      toast({ title: 'Erreur', description: 'Impossible de sauvegarder la configuration IA', variant: 'destructive' });
    } else {
      toast({ title: '✅ Configuration IA sauvegardée' });
    }
    setSavingAi(false);
  };

  const handleAddPosition = async () => {
    const name = newPosName.trim();
    if (!newPosDept || !name) return;
    // Check it doesn't already exist in defaults or custom
    const existing = getPositionsForDepartment(newPosDept, customPositions);
    if (existing.includes(name)) {
      toast({ title: 'Ce poste existe déjà', variant: 'destructive' });
      return;
    }
    const updated = { ...customPositions };
    if (!updated[newPosDept]) updated[newPosDept] = [];
    updated[newPosDept] = [...updated[newPosDept], name];

    setSavingPositions(true);
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: 'custom_positions', value: updated as any }, { onConflict: 'key' });
    if (error) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } else {
      setCustomPositions(updated);
      setNewPosName('');
      toast({ title: '✅ Poste ajouté' });
    }
    setSavingPositions(false);
  };

  const handleRemovePosition = async (dept: string, pos: string) => {
    const updated = { ...customPositions };
    updated[dept] = (updated[dept] || []).filter((p) => p !== pos);
    if (updated[dept].length === 0) delete updated[dept];

    setSavingPositions(true);
    const { error } = await supabase
      .from('app_settings')
      .upsert({ key: 'custom_positions', value: (Object.keys(updated).length > 0 ? updated : {}) as any }, { onConflict: 'key' });
    if (error) {
      toast({ title: 'Erreur', description: error.message, variant: 'destructive' });
    } else {
      setCustomPositions(updated);
      toast({ title: '✅ Poste supprimé' });
    }
    setSavingPositions(false);
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

  if (!can('settings.view')) {
    return <Navigate to="/dashboard" replace />;
  }

  const readOnly = !can('settings.edit');

  return (
    <DashboardLayout>
      <div className="animate-fade-in max-w-2xl">
        <h1 className="page-title mb-6 flex items-center gap-2">
          <SettingsIcon className="h-6 w-6" />
          Paramètres
        </h1>

        {/* Work Hours */}
        <Card className="stat-card mb-6">
          <CardHeader>
            <CardTitle className="text-base">Horaires de travail</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Heure d'arrivée</Label>
              <Input
                type="time"
                value={form.work_start_time}
                onChange={(e) => setForm({ ...form, work_start_time: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Heure de départ</Label>
              <Input
                type="time"
                value={form.work_end_time}
                onChange={(e) => setForm({ ...form, work_end_time: e.target.value })}
              />
            </div>
          </CardContent>
        </Card>

        {/* Office IP */}
        <Card className="stat-card mb-6">
          <CardHeader>
            <CardTitle className="text-base">Adresse IP du bureau</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Label>IP fixe du WiFi bureau</Label>
              <Input
                value={form.office_ip}
                onChange={(e) => setForm({ ...form, office_ip: e.target.value })}
                placeholder="Ex: 196.168.1.1"
              />
              <p className="text-xs text-muted-foreground">
                Mettre 0.0.0.0 pour désactiver la vérification IP
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Deduction Rules */}
        <Card className="stat-card mb-6">
          <CardHeader>
            <CardTitle className="text-base">Règles de déduction</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <Label className="text-sm font-medium mb-3 block">Retard</Label>
              <div className="grid grid-cols-2 gap-4">
                <Select
                  value={form.late_deduction_type}
                  onValueChange={(v) => setForm({ ...form, late_deduction_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Montant fixe</SelectItem>
                    <SelectItem value="percentage">Pourcentage</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  value={form.late_deduction_amount}
                  onChange={(e) => setForm({ ...form, late_deduction_amount: Number(e.target.value) })}
                  placeholder={form.late_deduction_type === 'fixed' ? 'FCFA' : '%'}
                />
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium mb-3 block">Absence</Label>
              <div className="grid grid-cols-2 gap-4">
                <Select
                  value={form.absence_deduction_type}
                  onValueChange={(v) => setForm({ ...form, absence_deduction_type: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Montant fixe</SelectItem>
                    <SelectItem value="percentage">Pourcentage</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  value={form.absence_deduction_amount}
                  onChange={(e) => setForm({ ...form, absence_deduction_amount: Number(e.target.value) })}
                  placeholder={form.absence_deduction_type === 'fixed' ? 'FCFA' : '%'}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Custom Positions */}
        <Card className="stat-card mb-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Briefcase className="h-4 w-4" />
              Gestion des postes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Add new position */}
            <div className="flex flex-col sm:flex-row gap-2">
              <Select value={newPosDept} onValueChange={setNewPosDept}>
                <SelectTrigger className="sm:w-48">
                  <SelectValue placeholder="Département..." />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map((d) => (
                    <SelectItem key={d.key} value={d.key}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Nom du nouveau poste"
                value={newPosName}
                onChange={(e) => setNewPosName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddPosition(); }}
                className="flex-1"
              />
              <Button onClick={handleAddPosition} disabled={savingPositions || !newPosDept || !newPosName.trim()}>
                {savingPositions ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              </Button>
            </div>

            {/* Global positions info */}
            <div className="text-xs text-muted-foreground">
              Postes disponibles dans tous les départements : {GLOBAL_POSITIONS.join(', ')}
            </div>

            {/* List custom positions by department */}
            {Object.keys(customPositions).length > 0 && (
              <div className="space-y-3 pt-2">
                <Label className="text-sm font-medium">Postes personnalisés</Label>
                {Object.entries(customPositions).map(([dept, positions]) => (
                  <div key={dept} className="space-y-1">
                    <p className="text-xs font-semibold text-muted-foreground uppercase">{dept}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {positions.map((pos) => (
                        <Badge key={pos} variant="secondary" className="gap-1 pr-1">
                          {pos}
                          {!readOnly && (
                            <button
                              onClick={() => handleRemovePosition(dept, pos)}
                              className="ml-1 hover:text-destructive"
                              title="Supprimer"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* AI Configuration */}
        <Card className="stat-card mb-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Brain className="h-4 w-4" />
              Configuration IA (Analyse des Rapports)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Fournisseur IA</Label>
              <Select
                value={aiForm.ai_provider}
                onValueChange={(v) => {
                  const defaults: Record<string, { model: string; url: string }> = {
                    openai: { model: 'gpt-4o-mini', url: 'https://api.openai.com/v1' },
                    deepseek: { model: 'deepseek-chat', url: 'https://api.deepseek.com/v1' },
                    mistral: { model: 'mistral-small-latest', url: 'https://api.mistral.ai/v1' },
                    custom: { model: '', url: '' },
                  };
                  const d = defaults[v] || defaults.custom;
                  setAiForm({ ...aiForm, ai_provider: v, ai_model: d.model, ai_base_url: d.url });
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="openai">OpenAI (GPT)</SelectItem>
                  <SelectItem value="deepseek">DeepSeek</SelectItem>
                  <SelectItem value="mistral">Mistral AI</SelectItem>
                  <SelectItem value="custom">Autre (personnalisé)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Clé API</Label>
              <Input
                type="password"
                value={aiForm.ai_api_key}
                onChange={(e) => setAiForm({ ...aiForm, ai_api_key: e.target.value })}
                placeholder="sk-..."
              />
              <p className="text-xs text-muted-foreground">
                Votre clé API ne sera jamais partagée. Elle est stockée de manière sécurisée.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Modèle</Label>
                <Input
                  value={aiForm.ai_model}
                  onChange={(e) => setAiForm({ ...aiForm, ai_model: e.target.value })}
                  placeholder="gpt-4o-mini"
                />
              </div>
              <div className="space-y-2">
                <Label>URL de base</Label>
                <Input
                  value={aiForm.ai_base_url}
                  onChange={(e) => setAiForm({ ...aiForm, ai_base_url: e.target.value })}
                  placeholder="https://api.openai.com/v1"
                />
              </div>
            </div>
            {!readOnly && (
              <Button onClick={handleSaveAi} disabled={savingAi} variant="outline" className="w-full">
                {savingAi ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Brain className="h-4 w-4 mr-2" />}
                Sauvegarder la configuration IA
              </Button>
            )}
          </CardContent>
        </Card>

        {!readOnly && (
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Save className="h-4 w-4 mr-2" />}
            Sauvegarder les paramètres
          </Button>
        )}
      </div>
    </DashboardLayout>
  );
}
