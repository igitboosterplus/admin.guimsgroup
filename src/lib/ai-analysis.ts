import { supabase } from '@/integrations/supabase/client';

export interface EmployeeReportData {
  full_name: string;
  department: string | null;
  position: string | null;
  base_salary: number;
  presents: number;
  lates: number;
  absents: number;
  absence_hours: number;
  overtime_days: number;
  tasks_assigned: number;
  tasks_completed: number;
  tasks_overdue: number;
  tasks_completion_rate?: number;
  tasks_on_time_rate?: number;
  task_score?: number;
  paid_leave_days: number;
  unpaid_leave_days: number;
  net_salary: number;
  deduction: number;
}

export interface AIAnalysisResult {
  summary: string;
  profitability_score: number; // 0-100
  strengths: string[];
  weaknesses: string[];
  recommendations: string[];
  department_insights: { department: string; insight: string }[];
  risk_areas: string[];
}

/**
 * Fetch the OpenAI-compatible API key from app_settings
 */
async function getAIApiKey(): Promise<string | null> {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'ai_api_key')
    .maybeSingle();
  if (!data?.value) return null;
  return String(data.value).replace(/"/g, '');
}

/**
 * Fetch the AI provider (openai, deepseek, etc.) from app_settings
 */
async function getAIProvider(): Promise<{ provider: string; model: string; baseUrl: string }> {
  const { data } = await supabase
    .from('app_settings')
    .select('*')
    .in('key', ['ai_provider', 'ai_model', 'ai_base_url']);

  const map: Record<string, string> = {};
  data?.forEach((s) => {
    map[s.key] = String(s.value ?? '').replace(/"/g, '');
  });

  const provider = map.ai_provider || 'openai';
  const model = map.ai_model || 'gpt-4o-mini';
  const baseUrl = map.ai_base_url || 'https://api.openai.com/v1';

  return { provider, model, baseUrl };
}

/**
 * Build the analysis prompt in French
 */
function buildPrompt(reports: EmployeeReportData[], month: string): string {
  const totalEmployees = reports.length;
  const totalTasks = reports.reduce((s, r) => s + r.tasks_assigned, 0);
  const completedTasks = reports.reduce((s, r) => s + r.tasks_completed, 0);
  const overdueTasks = reports.reduce((s, r) => s + r.tasks_overdue, 0);
  const totalAbsences = reports.reduce((s, r) => s + r.absents, 0);
  const totalLates = reports.reduce((s, r) => s + r.lates, 0);
  const totalDeductions = reports.reduce((s, r) => s + r.deduction, 0);
  const totalSalaries = reports.reduce((s, r) => s + r.net_salary, 0);

  const deptStats: Record<string, { count: number; tasks: number; completed: number; overdue: number; absences: number; lates: number }> = {};
  reports.forEach((r) => {
    const dept = r.department || 'Non assigné';
    if (!deptStats[dept]) deptStats[dept] = { count: 0, tasks: 0, completed: 0, overdue: 0, absences: 0, lates: 0 };
    deptStats[dept].count++;
    deptStats[dept].tasks += r.tasks_assigned;
    deptStats[dept].completed += r.tasks_completed;
    deptStats[dept].overdue += r.tasks_overdue;
    deptStats[dept].absences += r.absents;
    deptStats[dept].lates += r.lates;
  });

  const deptSummary = Object.entries(deptStats).map(([dept, s]) =>
    `- ${dept}: ${s.count} employés, ${s.completed}/${s.tasks} tâches terminées, ${s.overdue} en retard, ${s.absences} absences, ${s.lates} retards`
  ).join('\n');

  const employeeDetails = reports.map((r) =>
    `- ${r.full_name} (${r.department || '?'}, ${r.position || '?'}): ${r.tasks_completed}/${r.tasks_assigned} tâches (score: ${r.task_score ?? '?'}%, ponctualité: ${r.tasks_on_time_rate ?? '?'}%), ${r.tasks_overdue} en retard, ${r.presents} présences, ${r.lates} retards, ${r.absents} absences, salaire net: ${r.net_salary} FCFA`
  ).join('\n');

  return `Tu es un consultant RH expert pour une entreprise africaine (GUIMS GROUP). Analyse ces données du mois ${month} et donne un rapport stratégique en français.

DONNÉES GLOBALES:
- ${totalEmployees} employés actifs
- Tâches: ${completedTasks}/${totalTasks} terminées (${overdueTasks} en retard)
- Taux de complétion: ${totalTasks > 0 ? Math.round(completedTasks / totalTasks * 100) : 0}%
- Absences totales: ${totalAbsences} jours
- Retards totaux: ${totalLates}
- Masse salariale nette: ${totalSalaries} FCFA
- Déductions totales: ${totalDeductions} FCFA

PAR DÉPARTEMENT:
${deptSummary}

DÉTAIL PAR EMPLOYÉ:
${employeeDetails}

Réponds UNIQUEMENT avec un JSON valide (sans markdown, sans \`\`\`json) avec cette structure exacte:
{
  "summary": "Résumé global de la situation en 2-3 phrases",
  "profitability_score": <nombre 0-100 représentant la productivité globale>,
  "strengths": ["point fort 1", "point fort 2", ...],
  "weaknesses": ["point faible 1", "point faible 2", ...],
  "recommendations": ["recommandation actionable 1", "recommandation 2", ...],
  "department_insights": [{"department": "nom", "insight": "analyse spécifique"}],
  "risk_areas": ["risque identifié 1", "risque 2", ...]
}

Sois concis, pragmatique et propose des actions concrètes pour améliorer la rentabilité et l'évolution de l'entreprise.`;
}

/**
 * Call the AI API to analyze employee reports
 */
export async function analyzeReports(
  reports: EmployeeReportData[],
  month: string
): Promise<AIAnalysisResult> {
  const apiKey = await getAIApiKey();
  if (!apiKey) {
    throw new Error('Clé API IA non configurée. Allez dans Paramètres pour ajouter votre clé API.');
  }

  const { model, baseUrl } = await getAIProvider();
  const prompt = buildPrompt(reports, month);

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'Tu es un analyste RH expert. Réponds uniquement en JSON valide, sans markdown.' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    }),
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({ error: { message: '' } }));
    throw new Error(
      `Erreur API IA (${response.status}): ${errData?.error?.message || response.statusText}`
    );
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('Réponse vide de l\'API IA');
  }

  // Parse JSON, handle potential markdown wrapping
  let cleaned = content.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  try {
    const result = JSON.parse(cleaned) as AIAnalysisResult;
    // Validate structure
    if (typeof result.profitability_score !== 'number') result.profitability_score = 50;
    if (!Array.isArray(result.strengths)) result.strengths = [];
    if (!Array.isArray(result.weaknesses)) result.weaknesses = [];
    if (!Array.isArray(result.recommendations)) result.recommendations = [];
    if (!Array.isArray(result.department_insights)) result.department_insights = [];
    if (!Array.isArray(result.risk_areas)) result.risk_areas = [];
    return result;
  } catch {
    throw new Error('L\'IA n\'a pas renvoyé un JSON valide. Réessayez.');
  }
}
