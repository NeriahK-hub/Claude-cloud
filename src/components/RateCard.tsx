import React, { useMemo, useState } from 'react';
import { ArrowRightLeft, ChevronRight, TrendingDown, TrendingUp, X, Check, RotateCcw } from 'lucide-react';
import { Settings, Wallet } from '../types';
import { formatMoney } from '../lib/money';
import { getPrefs } from '../lib/display';
import { currentMarket, currentOfficial, DayRate, setMyMarketRate, useMarketRates } from '../lib/marketRate';
import { haptic } from '../lib/haptics';

// Taux du jour USD -> CDF sur l'accueil : une ligne, et le détail en la touchant.
// Affiché seulement si on se sert des deux devises.

const fc = (v: number) => formatMoney(Math.round(v), 'CDF', { ...getPrefs(), decimals: 'never' });
const pct = (c: number) => `${c > 0 ? '+' : ''}${(c * 100).toFixed(1).replace('.', ',')} %`;
const dayText = (day: string) => new Date(`${day}T12:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });

export const usesUsdAndCdf = (settings: Settings, wallets: Wallet[]) => {
  const set = new Set([settings.mainCurrency, settings.secondCurrency, ...wallets.filter((w) => !w.archived).map((w) => w.currency)]);
  return set.has('USD') && set.has('CDF');
};

// Taux USD -> CDF que l'app utilise pour convertir (Paramètres › Taux de change)
const settingsRate = (s: Settings): number | null =>
  s.mainCurrency === 'CDF' ? s.rates.USD ?? null : s.mainCurrency === 'USD' && s.rates.CDF ? 1 / s.rates.CDF : null;

const Change: React.FC<{ c: number | null }> = ({ c }) => {
  if (c === null || Math.abs(c) < 0.0005) return null;
  const Icon = c > 0 ? TrendingUp : TrendingDown;
  // Le dollar monte = le franc perd de la valeur : en orange
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-bold ${c > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
      <Icon className="w-3 h-3 stroke-[2.6]" /> {pct(c)}
    </span>
  );
};

export const RateCard: React.FC<{ settings: Settings; wallets: Wallet[]; onChangeSettings: (s: Settings) => void }> = ({ settings, wallets, onChangeSettings }) => {
  const rates = useMarketRates();
  const [open, setOpen] = useState(false);
  const market = currentMarket(rates);
  const official = currentOfficial(rates);
  if (!usesUsdAndCdf(settings, wallets) || (!market && !official)) return null;
  const main = market ?? official!;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full bg-white rounded-2xl border border-slate-100 px-4 py-2.5 flex items-center gap-2.5 text-left cursor-pointer hover:bg-slate-50 transition"
      >
        <ArrowRightLeft className="w-4 h-4 text-slate-400 shrink-0" />
        <span className="flex-1 min-w-0 text-[14px] text-slate-600">
          Aujourd'hui, <b className="tabular-nums text-slate-900">1 $ = {fc(main.rate)}</b>
        </span>
        {!(market?.mine) && <Change c={main.change} />}
        <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
      </button>
      {open && <RateSheet settings={settings} onChangeSettings={onChangeSettings} onClose={() => setOpen(false)} />}
    </>
  );
};

// Petite courbe des 30 derniers jours (marché en trait plein, officiel en tirets)
const Spark: React.FC<{ market: DayRate[]; official: DayRate[] }> = ({ market, official }) => {
  const W = 300;
  const H = 70;
  const days = useMemo(() => {
    const all = [...market, ...official].map((r) => r.day);
    return [...new Set(all)].sort().slice(-30);
  }, [market, official]);
  if (days.length < 2) return <p className="text-xs text-slate-400 py-3">La courbe apparaîtra après quelques jours.</p>;
  const vals = [...market, ...official].filter((r) => days.includes(r.day)).map((r) => r.rate);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const x = (d: string) => (days.indexOf(d) / (days.length - 1)) * W;
  const y = (v: number) => H - 6 - ((v - lo) / (hi - lo || 1)) * (H - 12);
  const path = (list: DayRate[]) =>
    list
      .filter((r) => days.includes(r.day))
      .sort((a, b) => a.day.localeCompare(b.day))
      .map((r, i) => `${i ? 'L' : 'M'}${x(r.day).toFixed(1)},${y(r.rate).toFixed(1)}`)
      .join('');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-[70px]" role="img" aria-label="Évolution du taux sur 30 jours">
      <path d={path(official)} fill="none" strokeWidth={1.5} strokeDasharray="4 3" className="stroke-slate-400" />
      <path d={path(market)} fill="none" strokeWidth={2.5} strokeLinejoin="round" style={{ stroke: 'var(--accent-deep)' }} />
    </svg>
  );
};

// Groupe façon Réglages d'iOS : petit titre, cartes arrondies, aide en dessous
const Group: React.FC<{ title?: string; hint?: React.ReactNode; children: React.ReactNode }> = ({ title, hint, children }) => (
  <section className="mb-5">
    {title && <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 px-4">{title}</h3>}
    <div className="rounded-2xl bg-slate-100 divide-y divide-slate-200/70 overflow-hidden">{children}</div>
    {hint && <p className="text-[12px] text-slate-400 mt-1.5 px-4 leading-snug">{hint}</p>}
  </section>
);

const RateSheet: React.FC<{ settings: Settings; onChangeSettings: (s: Settings) => void; onClose: () => void }> = ({ settings, onChangeSettings, onClose }) => {
  const rates = useMarketRates();
  const market = currentMarket(rates);
  const official = currentOfficial(rates);
  const [mine, setMine] = useState(rates.mine ? String(rates.mine.rate) : '');
  const [saved, setSaved] = useState(false);
  const value = parseFloat(mine.replace(/\s/g, '').replace(',', '.'));
  const used = settingsRate(settings);
  const best = market ?? official;
  const hasCurve = new Set([...rates.market, ...rates.official].map((r) => r.day)).size >= 2;

  // « Utiliser ce taux » : met à jour les conversions de l'app (Paramètres › Taux de change)
  const useRate = (rate: number) => {
    const next: Settings = { ...settings, rates: { ...settings.rates } };
    if (settings.mainCurrency === 'CDF') next.rates.USD = rate;
    else if (settings.mainCurrency === 'USD') next.rates.CDF = Number((1 / rate).toPrecision(8));
    else return;
    haptic('success');
    onChangeSettings(next);
  };
  const canUse = settings.mainCurrency === 'CDF' || settings.mainCurrency === 'USD';
  const sameAsUsed = !!best && !!used && Math.abs(used - best.rate) / best.rate <= 0.001;
  const changed = value > 0 && value !== rates.mine?.rate;
  const save = () => {
    if (!changed) return;
    setMyMarketRate(value);
    setSaved(true);
    haptic('success');
  };

  const source = (r: { mine?: boolean; day: string }, isMarket: boolean) =>
    isMarket ? (r.mine ? `Ton taux, noté le ${dayText(r.day)}` : `Marché (cambistes) · ${dayText(r.day)}`) : `Taux officiel (banques) · ${dayText(r.day)}`;

  const row = (label: string, sub: string, rate: number, change: number | null) => (
    <div className="flex items-center gap-3 px-4 min-h-[56px] py-2.5">
      <div className="flex-1 min-w-0">
        <div className="text-[15px] text-slate-900">{label}</div>
        <div className="text-[12px] text-slate-500">{sub}</div>
      </div>
      <div className="text-right">
        <div className="text-[15px] font-semibold tabular-nums text-slate-900">{fc(rate)}</div>
        <Change c={change} />
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
      <div
        className="w-full sm:max-w-[420px] max-h-[90dvh] overflow-y-auto bg-white rounded-t-[32px] sm:rounded-[32px] px-5 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head flex items-center justify-between mb-1">
          <h2 className="text-[22px] font-bold tracking-tight text-slate-900">Taux du jour</h2>
          <button onClick={onClose} aria-label="Fermer" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Le chiffre du jour, en grand */}
        {best && (
          <div className="text-center pt-4 pb-6">
            <div className="text-[13px] font-medium text-slate-500">1 dollar vaut</div>
            <div className="text-[40px] leading-tight font-bold tracking-tight tabular-nums text-slate-900 mt-1">{fc(best.rate)}</div>
            <div className="mt-1.5 flex items-center justify-center gap-2 text-[12px] text-slate-500">
              <span>{source(best, !!market)}</span>
              {!(market?.mine) && <Change c={best.change} />}
            </div>
          </div>
        )}

        {/* Les deux taux, seulement s'il y a bien les deux */}
        {market && official && (
          <Group>
            {row(market.mine ? 'Ton taux' : 'Marché', market.mine ? `Noté le ${dayText(market.day)}` : `Cambistes · ${dayText(market.day)}`, market.rate, market.mine ? null : market.change)}
            {row('Officiel', `Banques · ${dayText(official.day)}`, official.rate, official.change)}
          </Group>
        )}

        {/* Courbe : seulement quand il y a de quoi la tracer */}
        {hasCurve && (
          <Group title="30 derniers jours">
            <div className="px-4 pt-3 pb-2">
              <Spark market={rates.market} official={rates.official} />
              <div className="flex items-center gap-4 text-[11px] font-medium text-slate-500 mt-1">
                <span className="flex items-center gap-1.5"><span className="w-3 h-[2.5px] rounded-full" style={{ background: 'var(--accent-deep)' }} />Marché</span>
                <span className="flex items-center gap-1.5"><span className="w-3 border-t-[1.5px] border-dashed border-slate-400" />Officiel</span>
              </div>
            </div>
          </Group>
        )}

        {/* Mon propre taux du marché */}
        <Group
          title="Ton cambiste"
          hint={rates.mine ? (
            <button
              onClick={() => {
                setMyMarketRate(null);
                setMine('');
              }}
              className="inline-flex items-center gap-1 font-semibold text-blue-600 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Revenir au taux publié par Wallo
            </button>
          ) : (
            "Si on t'a donné un autre taux, note-le ici. Il reste sur ton téléphone."
          )}
        >
          <label className="flex items-center gap-3 px-4 min-h-[52px] focus-within:bg-slate-200/50 transition-colors">
            <span className="text-[15px] text-slate-900 shrink-0">1 $ =</span>
            <input
              inputMode="decimal"
              value={mine}
              onChange={(e) => {
                setMine(e.target.value);
                setSaved(false);
              }}
              onKeyDown={(e) => e.key === 'Enter' && save()}
              placeholder={best ? String(Math.round(best.rate)) : '2850'}
              className="field-plain flex-1 min-w-0 bg-transparent text-right text-[15px] font-semibold tabular-nums text-slate-900 outline-none placeholder:text-slate-400 placeholder:font-normal"
            />
            <span className="text-[15px] text-slate-500 shrink-0">CDF</span>
          </label>
        </Group>
        <button
          type="button"
          onClick={save}
          disabled={!changed && !saved}
          className="-mt-2 mb-5 w-full h-12 rounded-2xl bg-accent hover:bg-accent-hover disabled:opacity-40 text-[15px] font-bold flex items-center justify-center gap-1.5 cursor-pointer transition active:scale-[0.98]"
        >
          {saved ? <><Check className="w-4 h-4 stroke-[3]" /> Taux enregistré</> : 'Enregistrer mon taux'}
        </button>

        {/* Conversions de l'app */}
        {best && canUse && (
          <Group title="Tes conversions" hint="Sert à additionner tes portefeuilles en dollars et en francs.">
            <div className="flex items-center gap-3 px-4 min-h-[52px]">
              <span className="flex-1 text-[15px] text-slate-900">Taux utilisé</span>
              <span className="text-[15px] tabular-nums text-slate-500">{used ? `1 $ = ${fc(used)}` : 'Aucun'}</span>
              {sameAsUsed && <Check className="w-4 h-4 text-emerald-500 stroke-[2.6] shrink-0" />}
            </div>
            {!sameAsUsed && (
              <button onClick={() => useRate(best.rate)} className="w-full flex items-center gap-3 px-4 min-h-[52px] text-left cursor-pointer active:bg-slate-200/60 transition-colors">
                <span className="flex-1 text-[15px] font-semibold text-blue-600">Utiliser 1 $ = {fc(best.rate)}</span>
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
              </button>
            )}
          </Group>
        )}
      </div>
    </div>
  );
};
