// Assistant « sur mon ordinateur » : l'app envoie un résumé de tes finances et ta question au petit
// serveur lancé sur ton ordinateur (npm run assistant, scripts/assistant-bridge.mjs), qui demande à Claude Code.
import { Budget, Recurring, Settings, Transaction, Wallet } from '../types';
import { Category } from '../data/categories';
import { countsInStats, formatMoney, toMain, walletBalance } from './money';
import { budgetStatus } from './budgets';
import { occurrencesBetween, ymd } from './recurring';

export interface AssistantConfig {
  url: string; // adresse du serveur local
  code: string; // code affiché par npm run assistant
}
export interface ChatMessage {
  role: 'user' | 'assistant';
  text: string;
  error?: boolean;
}

const CONFIG_KEY = 'ap.assistant';
export const DEFAULT_URL = 'http://127.0.0.1:8787';

export function readConfig(): AssistantConfig | null {
  try {
    const c = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? 'null');
    return c?.code ? { url: c.url || DEFAULT_URL, code: String(c.code) } : null;
  } catch {
    return null;
  }
}
export function saveConfig(c: AssistantConfig | null) {
  try {
    if (c) localStorage.setItem(CONFIG_KEY, JSON.stringify(c));
    else localStorage.removeItem(CONFIG_KEY);
  } catch {
    /* stockage indisponible */
  }
}

const headers = (c: AssistantConfig) => ({ 'content-type': 'application/json', 'x-wallo-code': c.code.trim().toUpperCase() });

// L'ordinateur répond-il ? 'ok' | 'bad-code' | 'off'
export async function ping(c: AssistantConfig): Promise<'ok' | 'bad-code' | 'off'> {
  try {
    const r = await fetch(`${c.url}/ping`, { headers: headers(c), signal: AbortSignal.timeout(4000) });
    return r.ok ? 'ok' : r.status === 401 ? 'bad-code' : 'off';
  } catch {
    return 'off';
  }
}

export async function askAssistant(c: AssistantConfig, question: string, context: string, history: ChatMessage[]): Promise<string> {
  let r: Response;
  try {
    r = await fetch(`${c.url}/ask`, {
      method: 'POST',
      headers: headers(c),
      body: JSON.stringify({ question, context, history: history.filter((m) => !m.error).map(({ role, text }) => ({ role, text })) }),
      signal: AbortSignal.timeout(200_000),
    });
  } catch {
    throw new Error("Ton ordinateur ne répond pas. Vérifie que « npm run assistant » tourne et que l'ordinateur est allumé.");
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 401 ? 'Le code ne correspond plus : recolle celui affiché sur ton ordinateur.' : j.error || 'Une erreur est survenue.');
  return String(j.answer ?? '').trim() || "Je n'ai pas su répondre. Reformule ta question ?";
}

// ---------- Résumé envoyé avec chaque question (lu dans les données de l'app) ----------
const read = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
};

export function buildContext(): string {
  const wallets = read<Wallet[]>('ap.wallets', []).filter((w) => !w.archived);
  const transactions = read<Transaction[]>('ap.transactions', []);
  const categories = read<Category[]>('ap.categories', []);
  const settings = read<Settings>('ap.settings', { mainCurrency: 'USD', secondCurrency: null, rates: {} } as Settings);
  const budgets = read<Budget[]>('ap.budgets', []);
  const recurrings = read<Recurring[]>('ap.recurrings', []);
  const main = settings.mainCurrency;
  const m = (v: number, cur = main) => formatMoney(Math.round(v), cur);
  const now = new Date();
  const lines: string[] = [];

  lines.push(`Aujourd'hui : ${now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`);
  lines.push(`Devise principale : ${main}${Object.keys(settings.rates ?? {}).length ? ` (taux : ${Object.entries(settings.rates).map(([k, v]) => `1 ${k} = ${v} ${main}`).join(', ')})` : ''}`);

  // Portefeuilles
  let total = 0;
  lines.push('', 'PORTEFEUILLES');
  for (const w of wallets) {
    const b = walletBalance(w, transactions);
    if (w.includeInTotal) total += toMain(b, w.currency, settings);
    const kind = w.kind === 'goal' ? `objectif ${w.goalAmount ? `de ${m(w.goalAmount, w.currency)}` : ''}${w.goalDate ? ` pour le ${w.goalDate}` : ''}` : w.kind === 'credit' ? 'crédit' : '';
    lines.push(`- ${w.name}${kind ? ` (${kind})` : ''} : ${m(b, w.currency)}${w.includeInTotal ? '' : ' (hors total)'}`);
  }
  lines.push(`Solde total : ${m(total)}`);

  // Nom de la catégorie principale
  const top = (id?: string) => {
    const c = categories.find((x) => x.id === id);
    const p = c?.parentId ? categories.find((x) => x.id === c.parentId) : null;
    return (p ?? c)?.name ?? 'Sans catégorie';
  };
  const monthTotals = (offset: number) => {
    const start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
    let out = 0;
    let inc = 0;
    const byCat = new Map<string, number>();
    for (const t of transactions) {
      const d = new Date(t.createdAt);
      if (d < start || d >= end || !countsInStats(t)) continue;
      const v = toMain(t.amount, t.currency, settings);
      if (v < 0) {
        out -= v;
        byCat.set(top(t.categoryId), (byCat.get(top(t.categoryId)) ?? 0) - v);
      } else inc += v;
    }
    return { label: start.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }), out, inc, byCat };
  };

  const cur = monthTotals(0);
  lines.push('', `CE MOIS-CI (${cur.label}, jour ${now.getDate()})`, `Dépenses : ${m(cur.out)} · Revenus : ${m(cur.inc)}`);
  for (const [name, v] of [...cur.byCat].sort((a, b) => b[1] - a[1]).slice(0, 12)) lines.push(`- ${name} : ${m(v)}`);

  lines.push('', 'MOIS PRÉCÉDENTS');
  for (const o of [-1, -2, -3]) {
    const p = monthTotals(o);
    const tops = [...p.byCat].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([n, v]) => `${n} ${m(v)}`).join(', ');
    lines.push(`- ${p.label} : dépenses ${m(p.out)}, revenus ${m(p.inc)}${tops ? ` (surtout : ${tops})` : ''}`);
  }

  // Budgets
  if (budgets.length) {
    lines.push('', 'BUDGETS (période en cours)');
    for (const b of budgets) {
      const st = budgetStatus(b, transactions, categories, settings);
      lines.push(`- ${b.categoryId ? categories.find((c) => c.id === b.categoryId)?.name ?? '?' : 'Toutes les dépenses'} : ${m(st.spent, b.currency)} dépensés sur ${m(b.amount, b.currency)}`);
    }
  }

  // À venir (30 jours)
  const from = ymd(now);
  const to = ymd(new Date(now.getTime() + 30 * 86400000));
  const upcoming = recurrings
    .filter((r) => r.active)
    .flatMap((r) => occurrencesBetween(r, from, to).map((day) => ({ r, day })))
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(0, 20);
  if (upcoming.length) {
    lines.push('', 'À VENIR (30 prochains jours)');
    for (const { r, day } of upcoming) lines.push(`- ${day} : ${r.title} ${r.direction === 'out' ? '−' : '+'}${r.amount ? m(r.amount, r.currency) : 'montant à saisir'}`);
  }

  // Dernières opérations
  const recent = [...transactions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);
  if (recent.length) {
    lines.push('', 'DERNIÈRES OPÉRATIONS');
    for (const t of recent) {
      const w = wallets.find((x) => x.id === t.walletId);
      lines.push(`- ${t.createdAt.slice(0, 10)} · ${t.title} · ${t.category} · ${t.amount > 0 ? '+' : '−'}${m(Math.abs(t.amount), t.currency)}${w ? ` · ${w.name}` : ''}`);
    }
  }
  return lines.join('\n');
}
