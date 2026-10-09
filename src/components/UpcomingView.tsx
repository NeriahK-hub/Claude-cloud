import React, { useMemo, useState } from 'react';
import { ChevronLeft, List, CalendarDays, Plus, X, Repeat, Receipt, ArrowDownLeft, ArrowUpRight, Check, Trash2, ChevronRight, Pause, Play, Pencil, ChevronDown } from 'lucide-react';
import { Recurring, Settings, Transaction, Wallet } from '../types';
import { Category } from '../data/categories';
import { convertBetween, formatMoney } from '../lib/money';
import { getPrefs } from '../lib/display';
import { BILL_PRESETS, countUntil, daysBetween, dueLevel, frequencyText, nthDate, occurrencesBetween, parseDay, ymd } from '../lib/recurring';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { DateField } from './DatePicker';
import { Group, NavRow, PickRow, SwitchRow } from './FormRows';
import { AppIcon, IconBadge } from './AppIcon';
import { askConfirm } from '../lib/confirm';
import { SubsTool } from './MoneyReviews';
import { UpcomingCalendar } from './UpcomingCalendar';
import { findSubscriptions, type Subscription } from '../lib/review';
// Petites aides communes avec la carte de l'accueil (DueCard.tsx, chargée au démarrage)
import { dayText, money, pendingRecurrings, whenText } from './DueCard';

// « À venir » : opérations qui reviennent (salaire, loyer…) et factures (SNEL, REGIDESO…).
// En haut ce qui attend une réponse, puis ce qui est prévu ce mois-ci, puis la liste complète.

// « Pas ce mois-ci », « Pas cette semaine »… selon la fréquence
const skipText = (r: Recurring) =>
  r.frequency === 'month' ? 'Pas ce mois-ci' : r.frequency === 'week' ? 'Pas cette semaine' : r.frequency === 'year' ? 'Pas cette année' : 'Pas cette fois';

// ---------- Une chose à faire (accueil et page À venir) : une question, deux réponses ----------
const DueRow: React.FC<{
  r: Recurring;
  category?: Category;
  onConfirm: (r: Recurring, amount?: number) => void;
  onSkip: (r: Recurring) => void;
  onEdit?: (r: Recurring) => void; // changer le nom, le montant, la date, ou supprimer
}> = ({ r, category, onConfirm, onSkip, onEdit }) => {
  const [other, setOther] = useState(!r.amount); // montant à taper (facture qui change, ou montant différent)
  const [amount, setAmount] = useState('');
  const today = ymd(new Date());
  const late = r.nextDate < today;
  const value = parseFloat(amount.replace(/\s/g, '').replace(',', '.'));
  const isIn = r.direction === 'in';
  const howMuch = r.amount ? ` de ${money(r.amount, r.currency)}` : '';
  // La question, en clair
  const question = r.bill
    ? r.nextDate > today
      ? `Facture ${r.title} à payer avant ${dayText(r.nextDate)}`
      : late
        ? `Facture ${r.title} en retard (depuis ${dayText(r.nextDate)})`
        : `Facture ${r.title} à payer aujourd'hui`
    : isIn
      ? `${r.title}${howMuch} : l'as-tu reçu ?`
      : `${r.title}${howMuch} : c'est payé ?`;
  const yes = isIn ? 'Oui, reçu' : "Oui, c'est payé";
  return (
    <div className="py-3.5">
      <div className="flex items-start gap-3">
        <IconBadge icon={category?.icon ?? (r.bill ? 'Receipt' : 'Repeat')} image={category?.image} color={category?.color ?? '#64748B'} size="sm" />
        <div className="flex-1 min-w-0">
          <p className={`text-[14px] font-semibold leading-snug ${late ? 'text-red-600' : 'text-slate-900'}`}>{question}</p>
          {r.bill && r.amount && <p className="text-[12px] text-slate-500 mt-0.5">Montant habituel : {money(r.amount, r.currency)}</p>}
        </div>
        {onEdit && (
          <button
            onClick={() => onEdit(r)}
            aria-label={`Modifier ${r.title}`}
            className="shrink-0 -mt-1 -mr-1 w-9 h-9 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 flex items-center justify-center cursor-pointer"
          >
            <Pencil className="w-4 h-4" />
          </button>
        )}
      </div>
      {other && (
        <input
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={isIn ? `Combien as-tu reçu ? (${r.currency})` : `Combien as-tu payé ? (${r.currency})`}
          className="mt-3 w-full h-11 px-4 rounded-xl bg-slate-100 text-sm font-semibold tabular-nums outline-none focus:ring-2 focus:ring-accent animate-fade-in"
        />
      )}
      <div className="mt-3 flex gap-2">
        <button
          disabled={other && !(value > 0)}
          onClick={() => onConfirm(r, other ? value : undefined)}
          className="flex-1 h-10 rounded-xl bg-accent hover:bg-accent-hover disabled:opacity-40 text-[13px] font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98] transition"
        >
          <Check className="w-4 h-4 stroke-[2.6]" /> {yes}
        </button>
        <button onClick={() => onSkip(r)} className="flex-1 h-10 rounded-xl bg-slate-100 text-[13px] font-semibold text-slate-700 cursor-pointer">
          {skipText(r)}
        </button>
      </div>
      {r.amount && !other && (
        <button onClick={() => setOther(true)} className="mt-2 text-[12px] font-semibold text-slate-500 underline underline-offset-2 cursor-pointer">
          Le montant était différent ?
        </button>
      )}
    </div>
  );
};

// ---------- Page « À venir » ----------
export const UpcomingView: React.FC<{
  recurrings: Recurring[];
  transactions: Transaction[]; // pour repérer les abonnements pas encore notés
  wallets: Wallet[];
  categories: Category[];
  settings: Settings;
  onAdd: (r: Omit<Recurring, 'id' | 'createdAt' | 'active'>) => void;
  onUpdate: (id: string, changes: Partial<Recurring>) => void;
  onDelete: (id: string) => void;
  onConfirm: (r: Recurring, amount?: number) => void;
  onSkip: (r: Recurring) => void;
  onBack: () => void;
}> = ({ recurrings, transactions, wallets, categories, settings, onAdd, onUpdate, onDelete, onConfirm, onSkip, onBack }) => {
  // Le même montant dans l'autre devise (« ≈ 17,40 $US ») : devise principale -> 2e devise des Paramètres,
  // autre devise -> devise principale. null si pas d'autre devise ou pas de taux.
  const other = (v: number, from: string): string | null => {
    const to = from === settings.mainCurrency ? settings.secondCurrency : settings.mainCurrency;
    if (!to || to === from) return null;
    const x = convertBetween(v, from, to, settings);
    return x === null ? null : `≈\u00a0${money(x, to)}`;
  };
  const desktop = useIsDesktop();
  const [editing, setEditing] = useState<Recurring | 'new' | 'bill' | null>(null);
  const [showSubs, setShowSubs] = useState(false);
  const [openMonths, setOpenMonths] = useState<string[]>([]); // mois lointains dépliés (les 2 premiers le sont toujours)
  const [view, setView] = useState<'list' | 'calendar'>('list'); // liste ou calendrier
  const [fromSub, setFromSub] = useState<Subscription | null>(null); // abonnement repéré à ajouter (formulaire pré-rempli)
  const today = ymd(new Date());
  const pending = pendingRecurrings(recurrings, today);
  const catOf = (id?: string) => categories.find((c) => c.id === id);
  // Dépenses qui reviennent chaque mois sans être notées ici : on te les montre pour que tu décides
  const subs = useMemo(() => findSubscriptions(transactions, settings, categories, recurrings), [transactions, settings, categories, recurrings]);
  const newSubs = subs.filter((x) => !x.known).length;
  // Prochaine date : jamais dans le passé (on avance de mois en mois)
  const nextOf = (x: Subscription) => {
    const d = new Date(x.next);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    while (d < now) d.setMonth(d.getMonth() + 1);
    return ymd(d);
  };
  const draftOf = (x: Subscription): Omit<Recurring, 'id' | 'createdAt' | 'active'> => ({
    title: x.name,
    amount: Math.round(x.lastAmount * 100) / 100,
    currency: x.currency,
    walletId: x.walletId,
    direction: 'out',
    categoryId: x.categoryId,
    frequency: 'month',
    nextDate: nextOf(x),
    anchorDay: Number(nextOf(x).slice(8, 10)),
    mode: 'ask',
  });

  // D'ici la fin du mois : ce qu'il reste à payer et à recevoir (dans la devise principale)
  const month = useMemo(() => {
    const now = new Date();
    const end = ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    // (les échéances en retard comptent aussi : elles restent à payer)
    const items = recurrings.filter((r) => r.active).flatMap((r) => occurrencesBetween(r, r.nextDate < today ? r.nextDate : today, end).map((day) => ({ r, day })));
    const sum = (dir: 'in' | 'out') =>
      items.filter((x) => x.r.direction === dir && x.r.amount).reduce((s, x) => s + (convertBetween(x.r.amount!, x.r.currency, settings.mainCurrency, settings) ?? 0), 0);
    return { out: sum('out'), in: sum('in'), unknown: items.some((x) => !x.r.amount) };
  }, [recurrings, today, settings]);

  // Prochainement : une ligne par élément (sa prochaine date), sans ceux déjà « à faire »
  const pendingIds = new Set(pending.map((r) => r.id));
  // Séparé par mois : le reste de ce mois, puis chacun des 3 mois suivants (chaque échéance à sa date), avec le total à payer
  const months = useMemo(() => {
    const now = new Date();
    const end = ymd(new Date(now.getFullYear(), now.getMonth() + 4, 0));
    const groups = new Map<string, { r: Recurring; day: string }[]>();
    for (const r of recurrings) {
      if (!r.active) continue;
      for (const day of occurrencesBetween(r, today, end)) {
        if (pendingIds.has(r.id) && day <= today) continue; // déjà dans « À faire maintenant »
        const key = day.slice(0, 7);
        groups.set(key, [...(groups.get(key) ?? []), { r, day }]);
      }
    }
    return [...groups.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, items]) => {
        const sorted = items.sort((a, b) => a.day.localeCompare(b.day));
        const out = sorted.filter((x) => x.r.direction === 'out' && x.r.amount).reduce((t, x) => t + (convertBetween(x.r.amount!, x.r.currency, settings.mainCurrency, settings) ?? 0), 0);
        const inc = sorted.filter((x) => x.r.direction === 'in' && x.r.amount).reduce((t, x) => t + (convertBetween(x.r.amount!, x.r.currency, settings.mainCurrency, settings) ?? 0), 0);
        const d = new Date(`${key}-01T00:00`);
        const label = key === today.slice(0, 7) ? 'Ce mois-ci' : d.toLocaleDateString('fr-FR', { month: 'long', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
        return { key, label, items: sorted, out, inc };
      });
  }, [recurrings, today, settings, pending]); // eslint-disable-line react-hooks/exhaustive-deps
  const paused = recurrings.filter((r) => !r.active);
  const how = (r: Recurring) =>
    r.bill ? 'Facture' : r.mode === 'auto' ? 'Noté tout seul' : 'On te demandera';
  const section = 'text-[12px] font-bold text-slate-400 tracking-wider uppercase mb-2 px-1';

  // Quand : « Aujourd'hui », « Demain », « Dans 3 jours » pour ce qui est proche
  const soon = (day: string) => {
    const n = daysBetween(today, day);
    if (n < 0) return null;
    return n === 0 ? "Aujourd'hui" : n === 1 ? 'Demain' : n <= 7 ? `Dans ${n} jours` : null;
  };
  const row = (r: Recurring, day?: string) => {
    const cat = catOf(r.categoryId);
    const date = day ?? r.nextDate;
    const d = parseDay(date);
    const tone = cat?.color ?? '#64748B';
    const near = soon(date);
    const ended = !r.active && !!r.until && r.nextDate > r.until; // tous les paiements prévus ont été faits
    const lastOne = !!r.until && date === r.until && !ended;
    return (
      <button key={`${r.id}-${day ?? ''}`} onClick={() => setEditing(r)} className="w-full px-3.5 py-3 flex items-center gap-3 text-left cursor-pointer hover:bg-slate-50 active:bg-slate-100 transition-colors">
        {/* La date, dans une pastille à la couleur de la catégorie */}
        <span className="w-[52px] h-[56px] shrink-0 rounded-2xl flex flex-col items-center justify-center tint" style={{ backgroundColor: `${tone}1F`, '--tint': tone } as React.CSSProperties}>
          <span className="text-[20px] font-extrabold leading-none tabular-nums">{d.getDate()}</span>
          <span className="text-[10px] font-bold uppercase tracking-wide mt-1 opacity-80">{d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}</span>
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-semibold text-slate-900 truncate">{r.title}</span>
          <span className="flex items-center gap-1.5 text-[12px] text-slate-500 mt-0.5 min-w-0">
            {near && !ended && <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-600 font-bold">{near}</span>}
            {lastOne && <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-slate-500/15 text-slate-500 font-bold">Dernier</span>}
            <span className="truncate">
              {ended ? <span className="text-emerald-600 font-semibold">Terminé</span> : r.cancelBy ? <span className="text-amber-600 font-semibold">À résilier</span> : how(r)}
              {r.note && <span> · {r.note}</span>}
            </span>
          </span>
        </span>
        <span className={`text-right text-[15px] font-bold tabular-nums shrink-0 ${r.direction === 'in' ? 'text-emerald-600' : 'text-slate-900'}`}>
          {r.amount ? `${r.direction === 'in' ? '+' : '−'}${money(r.amount, r.currency)}` : <span className="text-[12px] font-semibold text-slate-400">à saisir</span>}
          {r.amount && other(r.amount, r.currency) && <span className="block text-right text-[11px] font-medium text-slate-400">{other(r.amount, r.currency)}</span>}
        </span>
      </button>
    );
  };

  const summaryP = (
  <p className="text-[14px] text-slate-600 mb-5 px-1">
    {month.out === 0 && month.in === 0 ? (
      month.unknown ? (
        "D'ici la fin du mois : seulement des factures dont tu tapes le montant au moment de payer."
      ) : (
        "Plus rien de prévu d'ici la fin du mois."
      )
    ) : (
      <>
        D'ici la fin du mois, il reste <b className="text-slate-900 tabular-nums whitespace-nowrap">{money(month.out, settings.mainCurrency)}</b>
        {other(month.out, settings.mainCurrency) && <span className="tabular-nums whitespace-nowrap"> ({other(month.out, settings.mainCurrency)})</span>} à payer
        {month.in > 0 && (
          <>
            {' '}et <b className="text-emerald-600 tabular-nums whitespace-nowrap">{money(month.in, settings.mainCurrency)}</b>
            {other(month.in, settings.mainCurrency) && <span className="tabular-nums whitespace-nowrap"> ({other(month.in, settings.mainCurrency)})</span>} à recevoir
          </>
        )}
        {month.unknown && ', sans compter les factures au montant qui change'}.
      </>
    )}
  </p>
  );
  const tabsEl = (
  <div role="tablist" className="flex gap-1 p-1 rounded-full bg-slate-200/60 mb-5">
    {([
      ['list', 'Liste', List],
      ['calendar', 'Calendrier', CalendarDays],
    ] as const).map(([id, label, Icon]) => (
      <button
        key={id}
        role="tab"
        aria-selected={view === id}
        onClick={() => setView(id)}
        className={`flex-1 h-9 rounded-full flex items-center justify-center gap-1.5 text-[13px] font-semibold cursor-pointer transition ${view === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
      >
        <Icon className="w-3.5 h-3.5" /> {label}
      </button>
    ))}
  </div>
  );
  const contentEl = (
    <>
    {view === 'calendar' && <UpcomingCalendar recurrings={recurrings} categories={categories} settings={settings} onEdit={setEditing} />}
    {view === 'list' && (
      <>
    {pending.length > 0 && (
      <div className="mb-5">
        <div className={section}>À faire maintenant</div>
        <div className="bg-white rounded-3xl border border-slate-100 px-4 divide-y divide-slate-100">
          {pending.map((r) => (
            <DueRow key={r.id} r={r} category={catOf(r.categoryId)} onConfirm={onConfirm} onSkip={onSkip} onEdit={setEditing} />
          ))}
        </div>
      </div>
    )}

    {months.map((m, i) => {
      const folded = i >= 2 && !openMonths.includes(m.key); // à partir du 3e mois : replié, on touche pour déplier
      return (
        <div key={m.key} className="mb-5">
          <button
            onClick={() => i >= 2 && setOpenMonths((o) => (o.includes(m.key) ? o.filter((k) => k !== m.key) : [...o, m.key]))}
            aria-expanded={i >= 2 ? !folded : undefined}
            className={`w-full flex items-end justify-between gap-3 mb-2.5 px-1 text-left ${i >= 2 ? 'cursor-pointer' : 'cursor-default'}`}
          >
            <span className="flex items-center gap-1.5 min-w-0">
              <h2 className="text-[19px] font-extrabold tracking-tight text-slate-900 first-letter:uppercase">{m.label}</h2>
              {i >= 2 && <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${folded ? '' : 'rotate-180'}`} />}
            </span>
            <span className="flex items-center gap-1.5 text-[12px] font-bold tabular-nums">
              {folded && <span className="font-semibold text-slate-400">{m.items.length} prévue{m.items.length > 1 ? 's' : ''}</span>}
              {m.out > 0 && <span className="px-2 py-1 rounded-full bg-red-500/10 text-red-500">−{money(m.out, settings.mainCurrency)}</span>}
              {m.inc > 0 && <span className="px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-600">+{money(m.inc, settings.mainCurrency)}</span>}
            </span>
          </button>
          {!folded && <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden divide-y divide-slate-100">{m.items.map((x) => row(x.r, x.day))}</div>}
        </div>
      );
    })}
    {months.length > 0 && <p className="text-[12px] text-slate-400 -mt-2 mb-5 px-1">Touche une ligne pour la modifier, la mettre en pause ou la supprimer.</p>}

    {paused.length > 0 && (
      <div className="mb-5 opacity-60">
        <div className={section}>En pause ou terminées</div>
        <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden divide-y divide-slate-100">{paused.map((r) => row(r))}</div>
      </div>
    )}
      </>
    )}
    </>
  );
  const subsEl = transactions.length > 0 && (
    <button onClick={() => setShowSubs(true)} className={`w-full flex items-center gap-3 px-4 py-3.5 ${desktop && recurrings.length > 0 ? '' : 'mb-5'} bg-white rounded-3xl border border-slate-100 text-left cursor-pointer hover:bg-slate-50 active:bg-slate-100 transition-colors`}>
      <span className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 bg-teal-500/10 text-teal-600">
        <Repeat className="w-5 h-5" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] font-semibold text-slate-900">Abonnements repérés</span>
        <span className="block text-[12px] text-slate-500 truncate">
          {subs.length === 0
            ? 'Aucun pour l’instant'
            : newSubs > 0
              ? `${newSubs} à ajouter dans À venir`
              : 'Tous sont déjà dans À venir'}
        </span>
      </span>
      <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
    </button>
  );
  // Ordinateur : le contenu à gauche, et à droite (qui reste visible en défilant) le bouton, le résumé du mois et les abonnements repérés
  const wide = desktop && recurrings.length > 0;
  const summaryCard = (
    <div className="bg-white rounded-3xl border border-slate-100 p-5">
      <div className="text-[12px] font-bold text-slate-400 tracking-wider uppercase mb-3">D'ici la fin du mois</div>
      {month.out === 0 && month.in === 0 ? (
        <p className="text-[14px] text-slate-500">{month.unknown ? 'Seulement des factures dont tu tapes le montant au moment de payer.' : 'Plus rien de prévu.'}</p>
      ) : (
        <div className="space-y-3">
          <div>
            <div className="text-[13px] text-slate-500">À payer</div>
            <div className="text-[24px] font-extrabold tabular-nums tracking-tight text-slate-900 leading-tight">{money(month.out, settings.mainCurrency)}</div>
            {other(month.out, settings.mainCurrency) && <div className="text-[12px] text-slate-400 tabular-nums">{other(month.out, settings.mainCurrency)}</div>}
          </div>
          {month.in > 0 && (
            <div className="pt-3 border-t border-slate-100">
              <div className="text-[13px] text-slate-500">À recevoir</div>
              <div className="text-[20px] font-extrabold tabular-nums tracking-tight text-emerald-600 leading-tight">{money(month.in, settings.mainCurrency)}</div>
              {other(month.in, settings.mainCurrency) && <div className="text-[12px] text-slate-400 tabular-nums">{other(month.in, settings.mainCurrency)}</div>}
            </div>
          )}
          {month.unknown && <p className="text-[12px] text-slate-400">Sans les factures au montant qui change.</p>}
        </div>
      )}
    </div>
  );

  return (
    <div className={desktop ? (wide ? 'max-w-5xl animate-screen' : 'max-w-3xl animate-screen') : 'px-5 pt-4 pb-8 animate-screen'}>
      {!wide && (
      <div className={`${desktop ? 'desk-head' : 'page-head'} flex items-center gap-3 mb-4`}>
        <button onClick={onBack} aria-label="Retour" className="w-11 h-11 shrink-0 rounded-full bg-white border border-slate-100 flex items-center justify-center cursor-pointer">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="flex-1 text-xl font-bold text-slate-900">À venir</h1>
        {recurrings.length > 0 && (
          <button onClick={() => setEditing('new')} className="flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-accent text-xs font-bold cursor-pointer">
            <Plus className="w-3.5 h-3.5" /> Ajouter
          </button>
        )}
      </div>
      )}

      {recurrings.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-100 px-6 py-8 text-center mb-4">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
            <Repeat className="w-7 h-7 text-slate-700" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-1">Ce qui revient chaque mois</h2>
          <p className="text-sm text-slate-500 mb-6 max-w-sm mx-auto">
            Salaire, loyer, abonnements, factures SNEL ou REGIDESO, minerval : note-les une fois, Wallo te les rappelle le bon jour.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <button onClick={() => setEditing('bill')} className="h-12 px-5 rounded-full bg-accent hover:bg-accent-hover text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer">
              <Receipt className="w-4 h-4" /> Ajouter une facture
            </button>
            <button onClick={() => setEditing('new')} className="h-12 px-5 rounded-full bg-slate-100 text-sm font-bold flex items-center justify-center gap-1.5 cursor-pointer">
              <Repeat className="w-4 h-4" /> Opération qui revient
            </button>
          </div>
        </div>
      ) : wide ? (
        <div className="grid grid-cols-[minmax(0,1fr)_320px] gap-8 items-start">
          <div>
            {tabsEl}
            {contentEl}
          </div>
          <aside className="sticky top-6 space-y-4">
            <button onClick={() => setEditing('new')} className="w-full h-12 rounded-2xl bg-accent hover:bg-accent-hover text-[15px] font-bold flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition">
              <Plus className="w-4 h-4" /> Ajouter
            </button>
            {summaryCard}
            {subsEl}
          </aside>
        </div>
      ) : (
        <>
          {summaryP}
          {tabsEl}
          {contentEl}
        </>
      )}

      {!wide && subsEl}

      {showSubs && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={() => setShowSubs(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Abonnements repérés"
            className="w-full sm:max-w-[460px] max-h-[92dvh] overflow-y-auto bg-white rounded-t-[32px] sm:rounded-[32px] px-5 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-slide-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sheet-head flex items-center justify-between mb-3">
              <h2 className="text-[20px] font-bold tracking-tight text-slate-900">Abonnements repérés</h2>
              <button onClick={() => setShowSubs(false)} aria-label="Fermer" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <SubsTool txs={transactions} settings={settings} categories={categories} recurrings={recurrings} onAdd={(x) => { setShowSubs(false); setFromSub(x); }} />
            {newSubs > 1 && (
              <button
                onClick={() => {
                  subs.filter((x) => !x.known).forEach((x) => onAdd(draftOf(x)));
                  setShowSubs(false);
                }}
                className="mt-4 w-full h-12 rounded-2xl bg-slate-100 text-[15px] font-bold flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition"
              >
                <Plus className="w-4 h-4" /> Tout ajouter ({newSubs})
              </button>
            )}
          </div>
        </div>
      )}

      {fromSub && (
        <RecurringSheet
          initial={null}
          prefill={draftOf(fromSub)}
          bill={false}
          wallets={wallets.filter((w) => !w.archived && (w.kind ?? 'basic') !== 'goal')}
          categories={categories}
          defaultCurrency={settings.mainCurrency}
          onClose={() => setFromSub(null)}
          onSave={(data) => {
            onAdd(data);
            setFromSub(null);
          }}
        />
      )}

      {editing && (
        <RecurringSheet
          initial={typeof editing === 'object' ? editing : null}
          bill={editing === 'bill'}
          wallets={wallets.filter((w) => !w.archived && (w.kind ?? 'basic') !== 'goal')}
          categories={categories}
          defaultCurrency={settings.mainCurrency}
          onClose={() => setEditing(null)}
          onSave={(data) => {
            if (typeof editing === 'object') onUpdate(editing.id, data);
            else onAdd(data);
            setEditing(null);
          }}
          onToggle={typeof editing === 'object' ? () => { onUpdate(editing.id, { active: !editing.active }); setEditing(null); } : undefined}
          onDelete={
            typeof editing === 'object'
              ? async () => {
                  const ok = await askConfirm({ title: `Supprimer « ${editing.title} » ?`, message: 'Les opérations déjà enregistrées restent.', confirmLabel: 'Supprimer', danger: true });
                  if (!ok) return;
                  onDelete(editing.id);
                  setEditing(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
};

// ---------- Formulaire : opération qui revient ou facture ----------
type Kind = 'out' | 'in' | 'bill';

// ---------- Formulaire : opération qui revient ou facture ----------
const RecurringSheet: React.FC<{
  initial: Recurring | null;
  prefill?: Omit<Recurring, 'id' | 'createdAt' | 'active'>; // nouvelle opération déjà remplie (abonnement repéré)
  bill: boolean;
  wallets: Wallet[];
  categories: Category[];
  defaultCurrency: string;
  onClose: () => void;
  onSave: (r: Omit<Recurring, 'id' | 'createdAt' | 'active'>) => void;
  onToggle?: () => void;
  onDelete?: () => void;
}> = ({ initial, prefill, bill, wallets, categories, defaultCurrency, onClose, onSave, onToggle, onDelete }) => {
  const seed = initial ?? prefill;
  const [kind, setKind] = useState<Kind>(initial ? (initial.bill ? 'bill' : initial.direction) : bill ? 'bill' : 'out');
  const [title, setTitle] = useState(seed?.title ?? '');
  const [variable, setVariable] = useState(initial ? initial.amount === undefined : false);
  const [amount, setAmount] = useState(seed?.amount ? String(seed.amount) : '');
  const [walletId, setWalletId] = useState(seed?.walletId ?? wallets[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState(seed?.categoryId ?? '');
  const [frequency, setFrequency] = useState<Recurring['frequency']>(seed?.frequency ?? 'month');
  // « Tous les N » + unité : jours, semaines, mois ou années
  const [count, setCount] = useState(String((seed?.frequency === 'days' ? seed.everyDays : seed?.every) ?? (seed?.frequency === 'days' ? 14 : 1)));
  const [nextDate, setNextDate] = useState(seed?.nextDate ?? ymd(new Date()));
  const [mode, setMode] = useState<Recurring['mode']>(seed?.mode ?? 'ask');
  const [remindDays, setRemindDays] = useState(initial?.remindDays ?? 3);
  // « À résilier » : un rappel pour annuler un abonnement avant la prochaine échéance
  const [cancel, setCancel] = useState(!!seed?.cancelBy);
  const [cancelBy, setCancelBy] = useState(seed?.cancelBy || '');
  const [note, setNote] = useState(seed?.note ?? '');
  // Fin (facultatif) : jamais, après N fois, ou à une date
  const [endMode, setEndMode] = useState<'never' | 'times' | 'date'>(seed?.until ? 'date' : 'never');
  const [endTimes, setEndTimes] = useState('6');
  const [endDate, setEndDate] = useState(seed?.until ?? '');
  const [picking, setPicking] = useState<'wallet' | 'category' | 'frequency' | null>(null); // liste ouverte dans la fenêtre

  const wallet = wallets.find((w) => w.id === walletId);
  const currency = wallet?.currency ?? defaultCurrency;
  // Dernier paiement choisi (null = sans fin)
  const stepOf = { frequency, everyDays: frequency === 'days' ? Math.max(1, Number(count)) : undefined, every: frequency !== 'days' && Number(count) > 1 ? Number(count) : undefined, anchorDay: frequency === 'month' || frequency === 'year' ? Number(nextDate.slice(8, 10)) : undefined };
  const untilValue = endMode === 'never' ? null : endMode === 'times' ? nthDate(nextDate, Math.max(1, Number(endTimes) || 1), stepOf) : endDate || null;
  const untilBad = !!untilValue && untilValue < nextDate; // fin avant le premier paiement
  const direction: 'in' | 'out' = kind === 'in' ? 'in' : 'out';
  const cats = categories.filter((c) => c.type === (direction === 'in' ? 'income' : 'expense'));
  const cat = categories.find((c) => c.id === categoryId);
  const parentOf = (c?: Category) => (c?.parentId ? categories.find((x) => x.id === c.parentId) : undefined);
  const catName = (c?: Category) => (c ? (parentOf(c) ? `${parentOf(c)!.name} › ${c.name}` : c.name) : 'Aucune');
  const value = parseFloat(amount.replace(/\s/g, '').replace(',', '.'));
  const askAmount = kind === 'bill' && variable;
  const valid = !untilBad && title.trim() !== '' && !!wallet && nextDate !== '' && (askAmount || value > 0) && Number(count) >= 1;
  const symbol = currency === 'USD' ? '$' : currency === 'CDF' ? 'FC' : currency === 'EUR' ? '€' : currency;

  const chip = (on: boolean) => `h-9 px-3.5 rounded-full text-[13px] font-semibold cursor-pointer transition ${on ? 'bg-accent' : 'bg-white text-slate-600 border border-slate-200'}`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
      <div className="w-full sm:max-w-[440px] max-h-[92dvh] flex flex-col bg-white rounded-t-[32px] sm:rounded-[32px] animate-slide-up" onClick={(e) => e.stopPropagation()}>
        {picking ? (
          <div key={picking} className="flex-1 min-h-0 overflow-y-auto px-5 pt-5 pb-6 animate-pick-in">
            <div className="sheet-head flex items-center gap-2 mb-4">
              <button onClick={() => setPicking(null)} aria-label="Retour" className="w-9 h-9 shrink-0 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h2 className="text-[20px] font-bold tracking-tight">
                {picking === 'wallet' ? 'Portefeuille' : picking === 'category' ? 'Catégorie' : 'Revient'}
              </h2>
            </div>

            {picking === 'wallet' && (
              <Group hint="L'argent sortira (ou arrivera) dans ce portefeuille.">
                {wallets.map((w) => (
                  <PickRow
                    key={w.id}
                    selected={w.id === walletId}
                    onClick={() => {
                      setWalletId(w.id);
                      setPicking(null);
                    }}
                    icon={<IconBadge icon={w.icon} image={w.image} color={w.color} size="sm" />}
                    title={w.name}
                    sub={w.currency}
                  />
                ))}
              </Group>
            )}

            {picking === 'category' && (
              <>
                <Group>
                  <PickRow
                    selected={!categoryId}
                    onClick={() => {
                      setCategoryId('');
                      setPicking(null);
                    }}
                    icon={<span className="w-8 h-8 rounded-full bg-slate-200 shrink-0" />}
                    title="Aucune"
                  />
                </Group>
                {/* Chaque catégorie avec ses sous-catégories juste en dessous, en retrait */}
                {cats
                  .filter((c) => !c.parentId)
                  .map((p) => {
                    const kids = cats.filter((c) => c.parentId === p.id);
                    const pick = (id: string) => {
                      setCategoryId(id);
                      setPicking(null);
                    };
                    return (
                      <Group key={p.id}>
                        <PickRow selected={categoryId === p.id} onClick={() => pick(p.id)} icon={<IconBadge icon={p.icon} image={p.image} color={p.color} size="sm" />} title={p.name} />
                        {kids.map((k) => (
                          <PickRow
                            key={k.id}
                            indent
                            selected={categoryId === k.id}
                            onClick={() => pick(k.id)}
                            icon={<IconBadge icon={k.icon} image={k.image} color={k.color} size="xs" />}
                            title={k.name}
                          />
                        ))}
                      </Group>
                    );
                  })}
              </>
            )}

            {picking === 'frequency' && (
              <>
                <Group>
                  {([
                    ['week', 1, 'Chaque semaine'],
                    ['week', 2, 'Toutes les 2 semaines'],
                    ['month', 1, 'Chaque mois'],
                    ['month', 3, 'Tous les 3 mois'],
                    ['year', 1, 'Chaque année'],
                  ] as const).map(([f, n, t]) => (
                    <PickRow
                      key={t}
                      selected={frequency === f && Number(count) === n}
                      onClick={() => {
                        setFrequency(f);
                        setCount(String(n));
                        setPicking(null);
                      }}
                      title={t}
                    />
                  ))}
                </Group>

                <Group title="Personnalisé" hint={frequencyText({ frequency, everyDays: Number(count) || 1, every: Number(count) || 1 })}>
                  <div className="flex items-center gap-3 px-4 py-3">
                    <span className="flex-1 text-[15px] text-slate-900">Tous les</span>
                    <button type="button" aria-label="Moins" onClick={() => setCount(String(Math.max(1, (Number(count) || 1) - 1)))} className="w-10 h-10 rounded-full bg-white shadow-sm text-[22px] leading-none text-slate-700 cursor-pointer active:scale-90 transition">
                      −
                    </button>
                    <input
                      inputMode="numeric"
                      aria-label="Nombre"
                      value={count}
                      onChange={(e) => setCount(e.target.value.replace(/\D/g, '').slice(0, 3))}
                      className="w-14 bg-transparent text-center text-[24px] font-bold tabular-nums text-slate-900 outline-none field-plain"
                    />
                    <button type="button" aria-label="Plus" onClick={() => setCount(String(Math.min(365, (Number(count) || 0) + 1)))} className="w-10 h-10 rounded-full bg-white shadow-sm text-[22px] leading-none text-slate-700 cursor-pointer active:scale-90 transition">
                      +
                    </button>
                  </div>
                  <div className="px-3 pb-3">
                    <div role="tablist" className="flex gap-1 p-1 rounded-full bg-slate-100">
                      {([
                        ['days', 'Jours'],
                        ['week', 'Semaines'],
                        ['month', 'Mois'],
                        ['year', 'Ans'],
                      ] as const).map(([f, label]) => (
                        <button
                          key={f}
                          type="button"
                          role="tab"
                          aria-selected={frequency === f}
                          onClick={() => setFrequency(f)}
                          className={`flex-1 min-w-0 h-9 rounded-full text-[13px] font-semibold cursor-pointer transition ${frequency === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </Group>
              </>
            )}
          </div>
        ) : (
        <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-5 pb-3 animate-pick-back">
          <div className="sheet-head flex items-center justify-between mb-4">
            <h2 className="text-[22px] font-bold tracking-tight">{initial ? 'Modifier' : kind === 'bill' ? 'Nouvelle facture' : 'Qui revient'}</h2>
            <button onClick={onClose} aria-label="Fermer" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Type : contrôle segmenté */}
          <div className="grid grid-cols-3 p-1 rounded-[14px] bg-slate-100 mb-5">
            {([
              ['out', 'Dépense', ArrowUpRight],
              ['in', 'Revenu', ArrowDownLeft],
              ['bill', 'Facture', Receipt],
            ] as const).map(([k, l, Icon]) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                aria-pressed={kind === k}
                className={`h-9 rounded-[10px] text-[13px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition-all duration-200 ${kind === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              >
                <Icon className="w-4 h-4" /> {l}
              </button>
            ))}
          </div>

          {/* Montant en grand */}
          <div className="text-center mb-5">
            {askAmount ? (
              <div className="py-3">
                <div className="text-[28px] font-bold tracking-tight text-slate-300">Montant variable</div>
                <div className="text-[13px] text-slate-400 mt-1">Tu le tapes au moment de payer</div>
              </div>
            ) : (
              <label className="inline-flex items-baseline justify-center gap-1.5 cursor-text">
                <input
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0"
                  aria-label={`Montant (${currency})`}
                  style={{ width: `${Math.max(1, amount.length || 1) + 0.6}ch` }}
                  className="bg-transparent text-[44px] leading-none font-bold tracking-tight tabular-nums text-slate-900 text-right outline-none field-plain placeholder:text-slate-300 caret-[var(--accent-deep)]"
                />
                <span className="text-[24px] font-bold text-slate-400">{symbol}</span>
              </label>
            )}
          </div>

          {kind === 'bill' && !initial && (
            <div className="flex flex-wrap justify-center gap-1.5 mb-5">
              {BILL_PRESETS.map((p) => (
                <button
                  key={p.title}
                  type="button"
                  onClick={() => {
                    setTitle(p.title);
                    setCategoryId(p.categoryId);
                  }}
                  className={chip(title === p.title)}
                >
                  {p.title}
                </button>
              ))}
            </div>
          )}

          <Group hint={kind === 'bill' ? undefined : undefined}>
            <label className="flex items-center gap-3 px-4 min-h-[48px] cursor-text transition-colors focus-within:bg-slate-200/50">
              <span className="text-[15px] text-slate-900 shrink-0">Nom</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={kind === 'bill' ? 'SNEL' : kind === 'in' ? 'Salaire' : 'Loyer'}
                className="flex-1 min-w-0 bg-transparent text-right text-[15px] text-slate-900 outline-none field-plain placeholder:text-slate-400"
              />
            </label>
            {kind === 'bill' && <SwitchRow label="Le montant change" checked={variable} onChange={setVariable} />}
            <NavRow
              label="Portefeuille"
              display={wallet ? wallet.name : 'Choisir'}
              icon={wallet && <IconBadge icon={wallet.icon} image={wallet.image} color={wallet.color} size="xs" />}
              onClick={() => setPicking('wallet')}
            />
            <NavRow
              label="Catégorie"
              display={cat ? cat.name : 'Aucune'}
              icon={cat && <IconBadge icon={cat.icon} image={cat.image} color={cat.color} size="xs" />}
              onClick={() => setPicking('category')}
            />
          </Group>

          <Group title="Note">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={200}
              rows={2}
              placeholder="Facultatif : code client, compte à utiliser, rappel…"
              aria-label="Note"
              className="w-full px-4 py-3 bg-transparent text-[15px] text-slate-900 placeholder:text-slate-400 outline-none field-plain resize-none"
            />
          </Group>

          <Group title="Quand">
            <NavRow
              label="Revient"
              display={frequencyText({ frequency, everyDays: Number(count) || 1, every: Number(count) || 1 })}
              onClick={() => setPicking('frequency')}
            />
            <div className="px-3 py-2">
              <div className="text-[13px] text-slate-500 px-1 mb-1">{kind === 'bill' ? 'À payer avant le' : 'Prochaine fois'}</div>
              <DateField value={nextDate} onChange={setNextDate} shortcuts="future" label="Prochaine date" />
            </div>
          </Group>

          <Group title="Fin" hint={endMode === 'never' ? 'Facultatif : ça revient tant que tu ne l\'arrêtes pas.' : untilBad ? 'La fin est avant la première date.' : untilValue ? `Dernier paiement le ${parseDay(untilValue).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}${endMode === 'times' ? '' : ` (${countUntil(nextDate, untilValue, stepOf)} fois)`}.` : undefined}>
            <div className="p-1.5">
              <div className="flex gap-1 p-1 rounded-full bg-slate-200/60">
                {([['never', 'Sans fin'], ['times', 'Après N fois'], ['date', 'À une date']] as const).map(([id, label]) => (
                  <button key={id} type="button" onClick={() => setEndMode(id)} className={`flex-1 h-9 rounded-full text-[13px] font-semibold cursor-pointer transition ${endMode === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {endMode === 'times' && (
              <label className="flex items-center gap-3 px-4 min-h-[50px] cursor-text">
                <span className="text-[15px] text-slate-900 shrink-0">Nombre de paiements</span>
                <input inputMode="numeric" value={endTimes} onChange={(e) => setEndTimes(e.target.value.replace(/\D/g, '').slice(0, 3))} aria-label="Nombre de paiements" className="flex-1 min-w-0 bg-transparent text-right text-[15px] font-semibold tabular-nums text-slate-900 outline-none field-plain" />
              </label>
            )}
            {endMode === 'date' && (
              <div className="px-3 py-2">
                <div className="text-[13px] text-slate-500 px-1 mb-1">Dernier paiement le</div>
                <DateField value={endDate} onChange={setEndDate} shortcuts="future" min={nextDate} label="Dernière date" />
              </div>
            )}
          </Group>

          {kind === 'bill' ? (
            <Group title="Rappel">
              <div className="flex flex-wrap gap-1.5 px-4 py-3">
                {[1, 3, 7].map((d) => (
                  <button key={d} type="button" onClick={() => setRemindDays(d)} className={chip(remindDays === d)}>
                    {d} jour{d > 1 ? 's' : ''} avant
                  </button>
                ))}
              </div>
            </Group>
          ) : (
            <Group title="Le jour venu" hint={mode === 'auto' ? "L'opération est notée toute seule, même si l'app n'est pas ouverte ce jour-là." : 'Une alerte te demande si c\'est fait.'}>
              {([
                ['ask', 'Me demander'],
                ['auto', 'Noter toute seule'],
              ] as const).map(([m, t]) => (
                <button key={m} type="button" onClick={() => setMode(m)} className="w-full flex items-center gap-3 px-4 min-h-[48px] text-left cursor-pointer active:bg-slate-200/60">
                  <span className="flex-1 text-[15px] text-slate-900">{t}</span>
                  {mode === m && <Check className="w-5 h-5 text-blue-600 stroke-[2.6]" />}
                </button>
              ))}
            </Group>
          )}

          {/* Résiliation : seulement pour une dépense qui revient (abonnement) */}
          {kind === 'out' && (
            <Group title="Résiliation" hint={cancel ? 'Une alerte te le rappelle ce jour-là, pour annuler avant la prochaine échéance.' : undefined}>
              <SwitchRow
                label="À résilier"
                checked={cancel}
                onChange={(v) => {
                  setCancel(v);
                  // rappel proposé : 3 jours avant la prochaine fois (au plus tôt aujourd'hui)
                  if (v && !cancelBy) {
                    const d = parseDay(nextDate);
                    d.setDate(d.getDate() - 3);
                    const t = ymd(new Date());
                    setCancelBy(ymd(d) < t ? t : ymd(d));
                  }
                }}
              />
              {cancel && (
                <div className="px-3 py-2">
                  <div className="text-[13px] text-slate-500 px-1 mb-1">Me le rappeler le</div>
                  <DateField value={cancelBy} onChange={setCancelBy} shortcuts="future" min={ymd(new Date())} label="Date du rappel" />
                </div>
              )}
            </Group>
          )}

          {initial && (
            <Group>
              {onToggle && (
                <button onClick={onToggle} className="w-full flex items-center gap-3 px-4 min-h-[48px] text-left text-[15px] text-blue-600 cursor-pointer active:bg-slate-200/60">
                  {initial.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />} {initial.active ? 'Mettre en pause' : 'Reprendre'}
                </button>
              )}
              {onDelete && (
                <button onClick={onDelete} className="w-full flex items-center gap-3 px-4 min-h-[48px] text-left text-[15px] text-red-600 cursor-pointer active:bg-slate-200/60">
                  <Trash2 className="w-4 h-4" /> Supprimer
                </button>
              )}
            </Group>
          )}
        </div>
        )}

        {!picking && (
        <div className="px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] border-t border-slate-100">
          <button
            disabled={!valid}
            onClick={() =>
              wallet &&
              onSave({
                title: title.trim(),
                amount: askAmount ? undefined : value,
                currency: wallet.currency,
                walletId: wallet.id,
                direction,
                categoryId: categoryId || undefined,
                frequency,
                everyDays: frequency === 'days' ? Math.max(1, Number(count)) : undefined,
                // (1 est gardé si la fréquence avait été réglée avant : le compte doit recevoir le retour à « chaque mois »)
                every: frequency !== 'days' ? (Number(count) > 1 ? Math.min(60, Math.round(Number(count))) : initial?.every ? 1 : undefined) : undefined,
                cancelBy: kind !== 'bill' && direction === 'out' && cancel && cancelBy ? cancelBy : initial?.cancelBy ? '' : undefined,
                note: note.trim() ? note.trim() : initial?.note ? '' : undefined,
                until: untilValue ?? (initial?.until ? '' : undefined),
                nextDate,
                // Chaque mois / année : on retient le jour choisi (un 31 reste un 31 après février)
                anchorDay: frequency === 'month' || frequency === 'year' ? Number(nextDate.slice(8, 10)) : undefined,
                mode: kind === 'bill' ? 'ask' : mode,
                bill: kind === 'bill' ? true : undefined,
                remindDays: kind === 'bill' ? remindDays : undefined,
              })
            }
            className="w-full h-[52px] rounded-2xl bg-accent hover:bg-accent-hover disabled:opacity-40 font-bold text-[16px] cursor-pointer active:scale-[0.98] transition"
          >
            {initial ? 'Enregistrer' : kind === 'bill' ? 'Ajouter la facture' : 'Ajouter'}
          </button>
        </div>
        )}
      </div>
    </div>
  );
};
