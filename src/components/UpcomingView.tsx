import React, { useMemo, useState } from 'react';
import { ChevronLeft, Plus, X, Repeat, Receipt, ArrowDownLeft, ArrowUpRight, Check, Trash2, ChevronRight, Pause, Play, Pencil } from 'lucide-react';
import { Recurring, Settings, Wallet } from '../types';
import { Category } from '../data/categories';
import { convertBetween, formatMoney } from '../lib/money';
import { getPrefs } from '../lib/display';
import { BILL_PRESETS, daysBetween, dueLevel, frequencyText, occurrencesBetween, parseDay, ymd } from '../lib/recurring';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { DateField } from './DatePicker';
import { Group, NavRow, PickRow, SwitchRow } from './FormRows';
import { AppIcon, IconBadge } from './AppIcon';
import { askConfirm } from '../lib/confirm';
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
  wallets: Wallet[];
  categories: Category[];
  settings: Settings;
  onAdd: (r: Omit<Recurring, 'id' | 'createdAt' | 'active'>) => void;
  onUpdate: (id: string, changes: Partial<Recurring>) => void;
  onDelete: (id: string) => void;
  onConfirm: (r: Recurring, amount?: number) => void;
  onSkip: (r: Recurring) => void;
  onBack: () => void;
}> = ({ recurrings, wallets, categories, settings, onAdd, onUpdate, onDelete, onConfirm, onSkip, onBack }) => {
  const desktop = useIsDesktop();
  const [editing, setEditing] = useState<Recurring | 'new' | 'bill' | null>(null);
  const today = ymd(new Date());
  const pending = pendingRecurrings(recurrings, today);
  const catOf = (id?: string) => categories.find((c) => c.id === id);

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
  const next = recurrings.filter((r) => r.active && !pendingIds.has(r.id)).sort((a, b) => a.nextDate.localeCompare(b.nextDate));
  const paused = recurrings.filter((r) => !r.active);
  const how = (r: Recurring) =>
    r.bill ? 'Facture' : r.mode === 'auto' ? 'Noté tout seul' : 'On te demandera';
  const section = 'text-[12px] font-bold text-slate-400 tracking-wider uppercase mb-2 px-1';

  const row = (r: Recurring) => {
    const cat = catOf(r.categoryId);
    const d = parseDay(r.nextDate);
    return (
      <button key={r.id} onClick={() => setEditing(r)} className="w-full py-3 flex items-center gap-3 text-left cursor-pointer">
        <span className="w-11 shrink-0 text-center">
          <span className="block text-[18px] font-bold leading-none text-slate-900">{d.getDate()}</span>
          <span className="block text-[10px] font-semibold uppercase text-slate-400 mt-0.5">{d.toLocaleDateString('fr-FR', { month: 'short' })}</span>
        </span>
        <IconBadge icon={cat?.icon ?? (r.bill ? 'Receipt' : 'Repeat')} image={cat?.image} color={cat?.color ?? '#64748B'} size="sm" />
        <span className="flex-1 min-w-0">
          <span className="block text-[14px] font-semibold text-slate-900 truncate">{r.title}</span>
          <span className="block text-[12px] text-slate-500 truncate">{how(r)}</span>
        </span>
        <span className={`text-[14px] font-bold tabular-nums shrink-0 ${r.direction === 'in' ? 'text-emerald-600' : 'text-slate-900'}`}>
          {r.amount ? `${r.direction === 'in' ? '+' : '−'}${money(r.amount, r.currency)}` : <span className="text-[12px] font-semibold text-slate-400">à saisir</span>}
        </span>
      </button>
    );
  };

  return (
    <div className={desktop ? 'max-w-3xl animate-screen' : 'px-5 pt-4 pb-8 animate-screen'}>
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

      {recurrings.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-100 px-6 py-8 text-center">
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
      ) : (
        <>
          {/* Résumé en une phrase */}
          <p className="text-[14px] text-slate-600 mb-5 px-1">
            {month.out === 0 && month.in === 0 ? (
              month.unknown ? (
                "D'ici la fin du mois : seulement des factures dont tu tapes le montant au moment de payer."
              ) : (
                "Plus rien de prévu d'ici la fin du mois."
              )
            ) : (
              <>
                D'ici la fin du mois, il reste <b className="text-slate-900 tabular-nums">{money(month.out, settings.mainCurrency)}</b> à payer
                {month.in > 0 && (
                  <>
                    {' '}et <b className="text-emerald-600 tabular-nums">{money(month.in, settings.mainCurrency)}</b> à recevoir
                  </>
                )}
                {month.unknown && ', sans compter les factures au montant qui change'}.
              </>
            )}
          </p>

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

          {next.length > 0 && (
            <div className="mb-5">
              <div className={section}>Prochainement</div>
              <div className="bg-white rounded-3xl border border-slate-100 px-4 divide-y divide-slate-100">{next.map(row)}</div>
              <p className="text-[12px] text-slate-400 mt-2 px-1">Touche une ligne pour la modifier, la mettre en pause ou la supprimer.</p>
            </div>
          )}

          {paused.length > 0 && (
            <div className="mb-5 opacity-60">
              <div className={section}>En pause</div>
              <div className="bg-white rounded-3xl border border-slate-100 px-4 divide-y divide-slate-100">{paused.map(row)}</div>
            </div>
          )}
        </>
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
  bill: boolean;
  wallets: Wallet[];
  categories: Category[];
  defaultCurrency: string;
  onClose: () => void;
  onSave: (r: Omit<Recurring, 'id' | 'createdAt' | 'active'>) => void;
  onToggle?: () => void;
  onDelete?: () => void;
}> = ({ initial, bill, wallets, categories, defaultCurrency, onClose, onSave, onToggle, onDelete }) => {
  const [kind, setKind] = useState<Kind>(initial ? (initial.bill ? 'bill' : initial.direction) : bill ? 'bill' : 'out');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [variable, setVariable] = useState(initial ? initial.amount === undefined : false);
  const [amount, setAmount] = useState(initial?.amount ? String(initial.amount) : '');
  const [walletId, setWalletId] = useState(initial?.walletId ?? wallets[0]?.id ?? '');
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? '');
  const [frequency, setFrequency] = useState<Recurring['frequency']>(initial?.frequency ?? 'month');
  const [everyDays, setEveryDays] = useState(String(initial?.everyDays ?? 14));
  const [nextDate, setNextDate] = useState(initial?.nextDate ?? ymd(new Date()));
  const [mode, setMode] = useState<Recurring['mode']>(initial?.mode ?? 'ask');
  const [remindDays, setRemindDays] = useState(initial?.remindDays ?? 3);
  const [picking, setPicking] = useState<'wallet' | 'category' | 'frequency' | null>(null); // liste ouverte dans la fenêtre

  const wallet = wallets.find((w) => w.id === walletId);
  const currency = wallet?.currency ?? defaultCurrency;
  const direction: 'in' | 'out' = kind === 'in' ? 'in' : 'out';
  const cats = categories.filter((c) => c.type === (direction === 'in' ? 'income' : 'expense'));
  const cat = categories.find((c) => c.id === categoryId);
  const parentOf = (c?: Category) => (c?.parentId ? categories.find((x) => x.id === c.parentId) : undefined);
  const catName = (c?: Category) => (c ? (parentOf(c) ? `${parentOf(c)!.name} › ${c.name}` : c.name) : 'Aucune');
  const value = parseFloat(amount.replace(/\s/g, '').replace(',', '.'));
  const askAmount = kind === 'bill' && variable;
  const valid = title.trim() !== '' && !!wallet && nextDate !== '' && (askAmount || value > 0) && (frequency !== 'days' || Number(everyDays) >= 1);
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
              <Group>
                {([
                  ['week', 'Chaque semaine', 'Ex. la cotisation du dimanche'],
                  ['month', 'Chaque mois', 'Ex. le loyer, le salaire, la SNEL'],
                  ['year', 'Chaque année', 'Ex. le minerval, une assurance'],
                  ['days', 'Tous les X jours', 'Tu choisis le nombre de jours'],
                ] as const).map(([f, t, h]) => (
                  <PickRow
                    key={f}
                    selected={frequency === f}
                    onClick={() => {
                      setFrequency(f);
                      setPicking(null);
                    }}
                    title={t}
                    sub={h}
                  />
                ))}
              </Group>
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

          <Group title="Quand">
            <NavRow
              label="Revient"
              display={frequency === 'days' ? `Tous les ${everyDays || '?'} jours` : frequency === 'week' ? 'Chaque semaine' : frequency === 'month' ? 'Chaque mois' : 'Chaque année'}
              onClick={() => setPicking('frequency')}
            />
            {frequency === 'days' && (
              <label className="flex items-center gap-3 px-4 min-h-[48px] cursor-text transition-colors focus-within:bg-slate-200/50">
                <span className="flex-1 text-[15px] text-slate-900">Tous les</span>
                <input
                  inputMode="numeric"
                  value={everyDays}
                  onChange={(e) => setEveryDays(e.target.value.replace(/\D/g, ''))}
                  className="w-14 bg-transparent text-right text-[15px] font-semibold text-slate-900 outline-none field-plain"
                />
                <span className="text-[15px] text-slate-500">jours</span>
              </label>
            )}
            <div className="px-3 py-2">
              <div className="text-[13px] text-slate-500 px-1 mb-1">{kind === 'bill' ? 'À payer avant le' : 'Prochaine fois'}</div>
              <DateField value={nextDate} onChange={setNextDate} shortcuts="future" label="Prochaine date" />
            </div>
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
                everyDays: frequency === 'days' ? Math.max(1, Number(everyDays)) : undefined,
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
