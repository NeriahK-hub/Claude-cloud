import React, { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { api, errorText, Stats } from '../api';
import { Button, Card, ErrorLine, Loading, nf } from '../ui';

// Chiffres globaux : aucun montant, aucune opération individuelle
export const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    setError('');
    try {
      setStats(await api.stats());
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  if (!stats) return error ? <ErrorLine text={error} /> : <Loading />;

  const tiles: [string, number, string?][] = [
    ['Comptes', stats.users, `+${nf(stats.users_new_7d)} cette semaine`],
    ['Actifs (7 jours)', stats.active_7d, `${nf(stats.active_30d)} sur 30 jours`],
    ['Nouveaux (30 jours)', stats.users_new_30d],
    ['Opérations', stats.transactions, `${nf(stats.transactions_30d)} sur 30 jours`],
    ['Portefeuilles', stats.wallets, `${nf(stats.shared_wallets)} partagés`],
    ['Ristournes', stats.ristournes],
    ['Comptes bloqués', stats.banned],
  ];
  const max = Math.max(1, ...stats.signups_by_day.map((d) => d.n));

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={load} busy={busy}>
          {!busy && <RefreshCw className="w-4 h-4" />} Actualiser
        </Button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {tiles.map(([label, value, sub]) => (
          <div key={label} className="bg-white dark:bg-[#151a21] rounded-2xl border border-slate-200/70 dark:border-white/5 p-4">
            <div className="text-[13px] text-slate-500">{label}</div>
            <div className="text-[28px] font-bold tabular-nums tracking-tight leading-tight mt-0.5">{nf(value)}</div>
            {sub && <div className="text-[12px] text-slate-500 mt-0.5">{sub}</div>}
          </div>
        ))}
      </div>

      <Card title="Inscriptions" hint="Nouveaux comptes par jour, sur les 30 derniers jours">
        <div className="flex items-end gap-[3px] h-36" role="img" aria-label="Inscriptions par jour">
          {stats.signups_by_day.map((d) => (
            <div key={d.day} className="flex-1 h-full flex flex-col justify-end group relative">
              <div
                className="rounded-t bg-emerald-500/80 group-hover:bg-emerald-500 min-h-[2px]"
                style={{ height: `${(d.n / max) * 100}%` }}
              />
              <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 rounded-lg bg-slate-900 text-white text-[12px] whitespace-nowrap opacity-0 group-hover:opacity-100 z-10">
                {new Date(d.day).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} : {d.n}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-between text-[12px] text-slate-500 mt-2">
          <span>il y a 30 jours</span>
          <span>aujourd'hui</span>
        </div>
      </Card>
      <p className="text-[12px] text-slate-500">
        « Actifs » = comptes qui ont ajouté ou modifié une opération synchronisée. Les personnes qui utilisent Wallo sans compte ne sont pas comptées.
      </p>
    </div>
  );
};
