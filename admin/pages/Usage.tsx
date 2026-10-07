import React, { useEffect, useState } from 'react';
import { RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { api, errorText, UsageRow } from '../api';
import { Button, Card, ErrorLine, Loading, nf } from '../ui';

// Ce qui sert vraiment dans l'app (compteur anonyme, src/lib/usage.ts).
// Chaque chiffre = nombre d'appareils qui ont ouvert l'outil (1 fois par jour au plus).
// Le pourcentage compare aux appareils qui ont ouvert l'app sur les 7 derniers jours.

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: 'Accueil',
    items: [
      ['home.health', 'Santé financière (ouverte)'],
      ['home.badges', 'Série et badges (ouverts)'],
      ['home.calendar', 'Calendrier des séries'],
      ['home.month', 'Rapport du mois › Voir les rapports'],
      ['home.week', 'Carte « Bilan de la semaine »'],
      ['home.wrapped', 'Wrapped de l’année'],
      ['home.festive', 'Carte des fêtes (bouton)'],
    ],
  },
  {
    title: 'Rapport',
    items: [
      ['tool.week', 'Bilan de la semaine'],
      ['tool.year', 'Bilan de l’année'],
      ['tool.habits', 'Mes habitudes'],
      ['tool.habits.when', 'Mes habitudes › Quand'],
      ['tool.habits.small', 'Mes habitudes › Petites'],
      ['tool.subs', 'Abonnements repérés'],
      ['tool.calendar', 'Calendrier des dépenses'],
      ['tool.compare', 'Comparer deux mois'],
      ['tool.pdf', 'Rapport PDF'],
    ],
  },
  {
    title: 'Partages et QR',
    items: [
      ['share.report', 'Rapport en image'],
      ['share.badge', 'Badge partagé'],
      ['share.week', 'Bilan de la semaine partagé'],
      ['share.year', 'Bilan de l’année partagé'],
      ['qr.show', 'QR d’invitation montré'],
      ['qr.scan', 'Scanner un code'],
    ],
  },
  {
    title: 'Réglages et aide',
    items: [
      ['mode.simple', 'Mode simple allumé'],
      ['mode.icons', 'Icônes seules allumées'],
      ['mode.festiveOff', 'Décorations des fêtes coupées'],
      ['coach.done', 'Bulles d’aide lues jusqu’au bout'],
      ['coach.skip', 'Bulles d’aide passées'],
    ],
  },
];

export const UsagePage: React.FC = () => {
  const [rows, setRows] = useState<UsageRow[] | null>(null);
  const [days, setDays] = useState(30);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async (d = days) => {
    setBusy(true);
    setError('');
    try {
      setRows(await api.usage(d));
    } catch (e) {
      setError(errorText(e));
      setRows([]);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    load(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  if (!rows) return error ? <ErrorLine text={error} /> : <Loading />;
  const by = new Map(rows.map((r) => [r.feature, r]));
  const open = by.get('open');
  const base = Math.max(1, open?.last7 ?? 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-white/10">
          {[30, 90, 365].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-[13px] font-semibold cursor-pointer ${days === d ? 'bg-white dark:bg-[#151a21] shadow-sm' : 'text-slate-500'}`}
            >
              {d === 365 ? '1 an' : `${d} jours`}
            </button>
          ))}
        </div>
        <Button onClick={() => load()} busy={busy}>
          {!busy && <RefreshCw className="w-4 h-4" />} Actualiser
        </Button>
      </div>
      <ErrorLine text={error} />

      <div className="grid grid-cols-2 gap-3">
        <Tile label="Appareils actifs (7 jours)" value={open?.last7 ?? 0} sub={`${nf(open?.prev7 ?? 0)} la semaine d’avant`} />
        <Tile label={`Ouvertures (${days === 365 ? '1 an' : `${days} jours`})`} value={open?.total ?? 0} sub="1 par appareil et par jour" />
      </div>

      {!open && (
        <Card>
          <p className="text-[14px] text-slate-500">
            Pas encore de chiffres. Vérifie que la migration <code>20261017000000_usage.sql</code> a été exécutée, puis attends que des personnes ouvrent l’app (mise à jour déployée).
          </p>
        </Card>
      )}

      {GROUPS.map((g) => (
        <Card key={g.title} title={g.title} hint="Appareils sur 7 jours · part des appareils actifs · évolution">
          <div className="divide-y divide-slate-100 dark:divide-white/5">
            {g.items.map(([key, label]) => {
              const r = by.get(key);
              const n = r?.last7 ?? 0;
              const pct = Math.round((n / base) * 100);
              const diff = n - (r?.prev7 ?? 0);
              return (
                <div key={key} className="py-2.5 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium truncate">{label}</div>
                    <div className="mt-1.5 h-1.5 rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                  </div>
                  <div className="w-24 text-right shrink-0">
                    <div className="text-[15px] font-bold tabular-nums">
                      {nf(n)} <span className="text-[12px] font-medium text-slate-500">· {pct}%</span>
                    </div>
                    <div className="text-[11px] text-slate-500 tabular-nums flex items-center justify-end gap-0.5">
                      {diff > 0 ? <TrendingUp className="w-3 h-3 text-emerald-500" /> : diff < 0 ? <TrendingDown className="w-3 h-3 text-amber-500" /> : null}
                      {r ? `${nf(r.total)} en tout` : 'jamais'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
};

const Tile: React.FC<{ label: string; value: number; sub: string }> = ({ label, value, sub }) => (
  <div className="bg-white dark:bg-[#151a21] rounded-2xl border border-slate-200/70 dark:border-white/5 p-4">
    <div className="text-[13px] text-slate-500">{label}</div>
    <div className="text-[28px] font-bold tabular-nums tracking-tight leading-tight mt-0.5">{nf(value)}</div>
    <div className="text-[12px] text-slate-500 mt-0.5">{sub}</div>
  </div>
);
