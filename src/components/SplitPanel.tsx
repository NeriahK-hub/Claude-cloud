import React, { useMemo, useState } from 'react';
import { Plus, X, Minus, Equal, User, Users, Check } from 'lucide-react';
import { formatMoney } from '../lib/money';

// Partage d'addition (dans la fenêtre « Dépense ») :
// • j'ai payé : chaque autre personne me doit sa part (prêts créés tout seuls) ;
// • quelqu'un d'autre a payé : je lui dois ma part (dette créée toute seule).

export interface SplitResult {
  payer: 'me' | 'other';
  payerName: string;
  myShare: number;
  shares: { person: string; amount: number }[];
}

const round = (v: number) => Math.round(v * 100) / 100;
const parse = (s: string) => parseFloat(s.replace(/\s/g, '').replace(',', '.')) || 0;
// Une couleur par personne (initiale dans un rond)
const AVATAR = ['#0EA5E9', '#F59E0B', '#8B5CF6', '#EC4899', '#10B981', '#EF4444', '#6366F1', '#14B8A6'];

export const SplitPanel: React.FC<{
  total: number;
  onTotal: (v: number) => void; // le montant de l'addition, tapé ici
  currency: string;
  people: string[]; // noms déjà connus (suggestions)
  canSave: boolean; // catégorie, portefeuille… prêts
  onSave: (r: SplitResult) => void;
}> = ({ total, onTotal, currency, people, canSave, onSave }) => {
  const [payer, setPayer] = useState<'me' | 'other'>('me');
  const [payerName, setPayerName] = useState('');
  const [others, setOthers] = useState<{ name: string; amount: string }[]>([]);
  const [equal, setEqual] = useState(true);
  const [name, setName] = useState('');
  const [count, setCount] = useState(2); // quelqu'un d'autre a payé : nombre de personnes, toi compris
  const [totalText, setTotalText] = useState(total > 0 ? String(total).replace('.', ',') : '');
  const money = (v: number) => formatMoney(v, currency);

  // Parts : égales (la mienne prend les centimes qui restent) ou tapées à la main
  const shares = useMemo(() => {
    if (!equal) return others.map((o) => ({ person: o.name, amount: round(parse(o.amount)) }));
    const each = round(total / (others.length + 1));
    return others.map((o) => ({ person: o.name, amount: each }));
  }, [others, equal, total]);
  const othersTotal = shares.reduce((s, x) => s + x.amount, 0);
  const myShare = payer === 'me' ? round(total - othersTotal) : round(total / Math.max(1, count));
  const valid =
    canSave &&
    total > 0 &&
    (payer === 'me' ? others.length > 0 && myShare >= 0 && shares.every((s) => s.amount > 0) : payerName.trim() !== '' && myShare > 0);

  const add = (n: string) => {
    const v = n.trim();
    if (!v || others.some((o) => o.name.toLowerCase() === v.toLowerCase())) return;
    setOthers((l) => [...l, { name: v, amount: '' }]);
    setName('');
  };
  const suggestions = people.filter((p) => !others.some((o) => o.name.toLowerCase() === p.toLowerCase())).slice(0, 8);
  const seg = (on: boolean) =>
    `flex-1 h-9 rounded-[10px] text-[13px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all duration-200 ${on ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`;
  const label = 'text-[12px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 px-1';
  const myRatio = total > 0 ? Math.max(0, Math.min(1, myShare / total)) : 0;
  const reason = total <= 0 ? "Tape d'abord le montant" : payer === 'me' && !others.length ? 'Ajoute au moins une personne' : payer === 'other' && !payerName.trim() ? 'Dis qui a payé' : null;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Le montant de l'addition, modifiable ici */}
      <label className="flex items-center gap-3 px-4 min-h-[56px] rounded-2xl bg-slate-100 cursor-text focus-within:bg-slate-200/60 transition-colors">
        <span className="text-[15px] text-slate-700 shrink-0">Addition</span>
        <input
          inputMode="decimal"
          value={totalText}
          onChange={(e) => {
            const t = e.target.value.replace(/[^0-9.,\s]/g, '');
            setTotalText(t);
            onTotal(parse(t));
          }}
          placeholder="0"
          aria-label="Montant de l'addition"
          className="field-plain flex-1 min-w-0 bg-transparent text-right text-[22px] font-bold tabular-nums text-slate-900 outline-none placeholder:text-slate-300"
        />
        <span className="text-[15px] font-semibold text-slate-500 shrink-0">{currency}</span>
      </label>

      {/* Qui a payé ? */}
      <div>
        <div className={label}>Qui a payé ?</div>
        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-slate-200/60">
          <button type="button" onClick={() => setPayer('me')} className={seg(payer === 'me')}>
            <User className="w-4 h-4" /> Moi
          </button>
          <button type="button" onClick={() => setPayer('other')} className={seg(payer === 'other')}>
            <Users className="w-4 h-4" /> Quelqu'un d'autre
          </button>
        </div>
      </div>

      {payer === 'me' ? (
        <div>
          <div className="flex items-center justify-between">
            <div className={label}>Avec qui ?</div>
            {!equal && others.length > 0 && (
              <button type="button" onClick={() => setEqual(true)} className="mb-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-blue-600 cursor-pointer">
                <Equal className="w-3.5 h-3.5" /> Parts égales
              </button>
            )}
          </div>
          <div className="rounded-2xl bg-slate-100 divide-y divide-slate-200/70 overflow-hidden">
            {/* Toi, toujours en premier */}
            <div className="flex items-center gap-3 px-3 min-h-[50px]">
              <span className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-[12px] font-bold shrink-0">Toi</span>
              <span className="flex-1 text-[14px] font-semibold text-slate-900">Ta part</span>
              <span className={`text-[14px] font-bold tabular-nums ${myShare < 0 ? 'text-red-600' : 'text-slate-900'}`}>{money(Math.max(0, myShare))}</span>
            </div>
            {others.map((o, i) => (
              <div key={o.name} className="flex items-center gap-3 px-3 min-h-[50px] animate-fade-in">
                <span className="w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0" style={{ background: `${AVATAR[i % AVATAR.length]}26`, color: AVATAR[i % AVATAR.length] }}>
                  {o.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="flex-1 min-w-0 text-[14px] font-semibold text-slate-900 truncate">{o.name}</span>
                <input
                  inputMode="decimal"
                  value={equal ? (shares[i]?.amount ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) : o.amount}
                  onChange={(e) => {
                    setEqual(false);
                    const v = e.target.value;
                    setOthers((l) => l.map((x, j) => (j === i ? { ...x, amount: v } : equal ? { ...x, amount: (shares[j]?.amount ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 2 }) } : x)));
                  }}
                  aria-label={`Part de ${o.name}`}
                  className="field-plain w-20 bg-transparent text-right text-[14px] font-bold tabular-nums text-slate-900 outline-none"
                />
                <span className="text-[12px] text-slate-500 shrink-0 -ml-1.5">{currency}</span>
                <button type="button" onClick={() => setOthers((l) => l.filter((_, j) => j !== i))} aria-label={`Retirer ${o.name}`} className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-200 cursor-pointer shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            {/* Ajouter une personne : dans la liste, comme sur iPhone */}
            <label className="flex items-center gap-3 px-3 min-h-[50px] cursor-text focus-within:bg-slate-200/50 transition-colors">
              <button type="button" onClick={() => add(name)} aria-label="Ajouter" className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shrink-0 cursor-pointer">
                <Plus className="w-4 h-4 stroke-[2.6]" style={{ color: '#fff' }} />
              </button>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && add(name)}
                placeholder={others.length ? 'Ajouter une personne' : 'Ajoute une personne (ex. Grace)'}
                className="field-plain flex-1 min-w-0 bg-transparent text-[14px] text-slate-900 outline-none placeholder:text-slate-400"
              />
              {name.trim() && (
                <button type="button" onClick={() => add(name)} className="px-3 h-8 rounded-full bg-accent text-[12px] font-bold cursor-pointer shrink-0">
                  Ajouter
                </button>
              )}
            </label>
          </div>
          {suggestions.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto no-scrollbar mt-2">
              {suggestions.map((p) => (
                <button key={p} type="button" onClick={() => add(p)} className="shrink-0 inline-flex items-center gap-1 px-3 h-8 rounded-full bg-slate-100 text-[12px] font-semibold text-slate-700 cursor-pointer active:scale-95 transition">
                  <Plus className="w-3 h-3" /> {p}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl bg-slate-100 divide-y divide-slate-200/70 overflow-hidden">
          <label className="flex items-center gap-3 px-4 min-h-[50px] cursor-text focus-within:bg-slate-200/50 transition-colors">
            <span className="text-[14px] text-slate-700 shrink-0">A payé</span>
            <input
              value={payerName}
              onChange={(e) => setPayerName(e.target.value)}
              list="wallo-split-people"
              placeholder="Jo"
              className="field-plain flex-1 min-w-0 bg-transparent text-right text-[14px] font-semibold text-slate-900 outline-none placeholder:text-slate-400"
            />
          </label>
          <div className="flex items-center justify-between gap-3 px-4 min-h-[50px]">
            <span className="text-[14px] text-slate-700">Personnes (toi compris)</span>
            <div className="flex items-center gap-1 p-0.5 rounded-full bg-slate-200/70">
              <button type="button" onClick={() => setCount((c) => Math.max(2, c - 1))} aria-label="Moins" className="w-8 h-8 rounded-full bg-white flex items-center justify-center cursor-pointer active:scale-90 transition">
                <Minus className="w-3.5 h-3.5" />
              </button>
              <span className="w-7 text-center text-[15px] font-bold tabular-nums">{count}</span>
              <button type="button" onClick={() => setCount((c) => Math.min(30, c + 1))} aria-label="Plus" className="w-8 h-8 rounded-full bg-white flex items-center justify-center cursor-pointer active:scale-90 transition">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      <datalist id="wallo-split-people">
        {people.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>

      {/* Résumé : une barre « ta part / les autres » et ce que ça crée */}
      {total > 0 && (
        <div className="rounded-2xl bg-slate-100 p-4 animate-fade-in">
          <div className="flex h-2.5 rounded-full overflow-hidden gap-0.5 mb-3">
            <span className="rounded-full bg-accent transition-all duration-300" style={{ width: `${myRatio * 100}%` }} />
            <span className="flex-1 rounded-full transition-all duration-300" style={{ background: payer === 'me' ? '#10B981' : 'rgb(148 163 184 / 0.4)' }} />
          </div>
          <div className="space-y-1.5 text-[13px]">
            <div className="flex justify-between gap-3">
              <span className="flex items-center gap-1.5 text-slate-600">
                <span className="w-2.5 h-2.5 rounded-full bg-accent" /> Ta part, notée en dépense
              </span>
              <span className={`font-bold tabular-nums ${myShare < 0 ? 'text-red-600' : 'text-slate-900'}`}>{money(Math.max(0, myShare))}</span>
            </div>
            {payer === 'me' ? (
              others.length > 0 && (
                <div className="flex justify-between gap-3">
                  <span className="flex items-center gap-1.5 text-slate-600">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> On te doit
                  </span>
                  <span className="font-bold tabular-nums text-emerald-600">{money(othersTotal)}</span>
                </div>
              )
            ) : (
              payerName.trim() && (
                <div className="flex justify-between gap-3">
                  <span className="text-slate-600">Tu dois à {payerName.trim()}</span>
                  <span className="font-bold tabular-nums text-amber-600">{money(myShare)}</span>
                </div>
              )
            )}
          </div>
          {myShare < 0 && <p className="text-[12px] text-red-600 mt-2">Les parts des autres dépassent l'addition.</p>}
          {payer === 'me' && others.length > 0 && myShare >= 0 && (
            <p className="text-[12px] text-slate-500 mt-2.5 leading-snug">Les prêts sont ajoutés dans « Dettes et prêts », pour te rappeler qui doit te rembourser.</p>
          )}
        </div>
      )}

      <button
        type="button"
        disabled={!valid}
        onClick={() => onSave({ payer, payerName: payerName.trim(), myShare: Math.max(0, myShare), shares })}
        className="w-full h-12 rounded-2xl bg-accent hover:bg-accent-hover disabled:bg-slate-100 disabled:text-slate-400 font-bold text-[15px] flex items-center justify-center gap-2 cursor-pointer disabled:cursor-default transition active:scale-[0.98]"
      >
        {valid && <Check className="w-4 h-4" />}
        {reason ?? "Enregistrer l'addition"}
      </button>
    </div>
  );
};
