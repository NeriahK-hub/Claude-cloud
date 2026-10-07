import React, { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { api, errorText, MarketRate } from '../api';
import { Button, Card, ErrorLine, inputCls, Loading, nf } from '../ui';

// Taux du marché (cambistes) USD -> CDF : un par jour. L'app le montre à tout le monde sur l'accueil
// (chacun peut ensuite noter le sien), avec une alerte si le dollar bouge de plus de 2 % d'un jour à l'autre.
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dayFr = (day: string) => new Date(`${day}T12:00`).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });

export const RatesPage: React.FC = () => {
  const [list, setList] = useState<MarketRate[] | null>(null);
  const [day, setDay] = useState(today());
  const [rate, setRate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () => api.marketRates().then(setList).catch((e) => { setError(errorText(e)); setList([]); });
  useEffect(() => {
    load();
  }, []);

  const value = parseFloat(rate.replace(/\s/g, '').replace(',', '.'));
  const prev = list?.find((r) => r.day < day);
  const change = prev && value > 0 ? (value - prev.usd_cdf) / prev.usd_cdf : null;

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await api.setMarketRate(day, value);
      setRate('');
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async (d: string) => {
    setError('');
    try {
      await api.deleteMarketRate(d);
      await load();
    } catch (e) {
      setError(errorText(e));
    }
  };

  return (
    <div className="space-y-4">
      <Card title="Publier le taux du marché" hint="Combien de francs congolais pour 1 dollar chez les cambistes. Arrive dans l'app à sa prochaine ouverture (ou au plus tard 30 minutes après).">
        <div className="flex flex-col sm:flex-row gap-2">
          <input type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value)} className={`${inputCls} sm:w-44`} />
          <input inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="ex. 2850" className={`${inputCls} flex-1 tabular-nums`} />
          <Button kind="primary" busy={busy} disabled={!(value > 0) || !day} onClick={save}>
            Publier
          </Button>
        </div>
        {change !== null && (
          <p className={`text-[13px] mt-2 ${Math.abs(change) >= 0.02 ? 'text-amber-600 font-semibold' : 'text-slate-500'}`}>
            {change >= 0 ? '+' : ''}
            {(change * 100).toFixed(1).replace('.', ',')} % par rapport au {dayFr(prev!.day)} ({nf(prev!.usd_cdf)} FC)
            {Math.abs(change) >= 0.02 && ' : les utilisateurs recevront une alerte.'}
          </p>
        )}
        <ErrorLine text={error} />
      </Card>

      <Card title="60 derniers jours">
        {!list ? (
          <Loading />
        ) : list.length === 0 ? (
          <p className="text-[14px] text-slate-500">Aucun taux publié pour l'instant.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {list.map((r, i) => {
              const before = list[i + 1];
              const c = before ? (r.usd_cdf - before.usd_cdf) / before.usd_cdf : null;
              return (
                <li key={r.day} className="py-2.5 flex items-center gap-4">
                  <span className="w-32 text-[14px] text-slate-500">{dayFr(r.day)}</span>
                  <span className="flex-1 text-[15px] font-semibold tabular-nums">1 $ = {nf(r.usd_cdf)} FC</span>
                  {c !== null && (
                    <span className={`text-[13px] font-semibold tabular-nums ${c > 0 ? 'text-amber-600' : c < 0 ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {c > 0 ? '+' : ''}
                      {(c * 100).toFixed(1).replace('.', ',')} %
                    </span>
                  )}
                  <button onClick={() => remove(r.day)} aria-label={`Supprimer le taux du ${dayFr(r.day)}`} className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 cursor-pointer">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
};
