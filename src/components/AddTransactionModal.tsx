import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Delete, Settings2, ChevronDown, ChevronLeft, ArrowUpRight, ArrowDownLeft, X, EyeOff, CalendarDays, Users, HandCoins, History, ListPlus } from 'lucide-react';
import { SplitPanel, SplitResult } from './SplitPanel';
import { BatchAddSheet, BatchItem } from './BatchAddSheet';
import { Category, categoriesFor } from '../data/categories';
import { isShared, MemberChips, ME_ID } from './Members';
import { useDisplayPrefs } from '../lib/display';
import { IconBadge } from './AppIcon';
import { Settings, Wallet } from '../types';
import { CURRENCIES } from '../data/currencies';
import { convertBetween, formatMoney } from '../lib/money';
import { haptic } from '../lib/haptics';
import { SelCheck } from './SelCheck';
import { DateField, DatePicker, localDay } from './DatePicker';
import { NoteHistoryItem, suggestNotes, UsualAmount } from '../lib/noteSuggestions';
import { useFeature } from '../lib/remoteConfig';
import { interestAmount } from '../lib/debtShares';

export type AddMode = 'expense' | 'income' | 'debt';

// Partage d'addition, prêt à être enregistré par App
export interface SplitBill extends SplitResult {
  category: Category;
  note: string;
  walletId: string;
  currency: string;
  memberId?: string;
  createdAt: string;
}

interface AddTransactionModalProps {
  mode: AddMode | null; // null = fermé
  categories: Category[];
  settings: Settings;
  wallets: Wallet[]; // portefeuilles actifs
  defaultWalletId: string;
  onClose: () => void;
  onChangeMode: (m: AddMode) => void;
  onSave: (amount: number, category: Category, note: string, walletId: string, currency: string, memberId?: string, withPerson?: string, excludeFromReport?: boolean, createdAt?: string, interest?: number, dueDate?: string) => void;
  onManageCategories: () => void;
  onSplit?: (bill: SplitBill) => void; // « Partager l'addition »
  onSaveMany?: (items: BatchItem[], walletId: string, day: string) => void; // « Plusieurs dépenses »
  // Ouverture pré-remplie (ex. « Il me rembourse » depuis Dettes et prêts)
  preset?: { categoryId?: string; withPerson?: string; amount?: number; currency?: string } | null;
  people?: string[]; // noms déjà utilisés (suggestions pour « Avec qui ? »)
  noteHistory?: NoteHistoryItem[]; // notes déjà écrites (suggestions pendant la saisie)
  usualAmounts?: Record<string, UsualAmount[]>; // montants déjà utilisés par catégorie (proposés d'un toucher)
}

// Brouillon : si on ferme sans enregistrer, on retrouve ce qu'on avait tapé (24 h)
const DRAFT_KEY = 'ap.draft';
interface Draft {
  mode: AddMode;
  amount: string;
  note: string;
  selectedId: string;
  walletId: string;
  currency: string;
  day: string;
  person: string;
  at: number;
}
const readDraft = (): Draft | null => {
  try {
    const d = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null') as Draft | null;
    return d && Date.now() - d.at < 86400000 ? d : null;
  } catch {
    return null;
  }
};
const writeDraft = (d: Draft | null) => {
  try {
    if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    // pas grave : le brouillon est un confort
  }
};

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];
// Clavier avec calculatrice : une 4e colonne d'opérations (÷ × − +), comme une vraie calculatrice
const CALC_KEYS = ['1', '2', '3', '/', '4', '5', '6', '*', '7', '8', '9', '-', '.', '0', 'del', '+'];
const OPS = ['+', '-', '*', '/'];
const OP_LABEL: Record<string, string> = { '+': '+', '-': '−', '*': '×', '/': '÷' };

// « 5000+2500×2 » -> 10 000 (× et ÷ d'abord, puis + et −) ; une opération qui traîne à la fin est ignorée
export function evalAmount(expr: string): number {
  const text = OPS.includes(expr.slice(-1)) ? expr.slice(0, -1) : expr;
  const nums = text.split(/[+\-*/]/).map((n) => parseFloat(n) || 0);
  const ops = text.replace(/[^+\-*/]/g, '').split('');
  // × et ÷
  const n2: number[] = [nums[0] ?? 0];
  const o2: string[] = [];
  ops.forEach((op, i) => {
    const x = nums[i + 1];
    if (op === '*') n2[n2.length - 1] *= x;
    else if (op === '/') n2[n2.length - 1] = x === 0 ? 0 : n2[n2.length - 1] / x;
    else {
      o2.push(op);
      n2.push(x);
    }
  });
  // + et −
  const r = n2.reduce((acc, x, i) => (i === 0 ? x : o2[i - 1] === '+' ? acc + x : acc - x), 0);
  return Math.round(r * 100) / 100;
}

// Montant tapé -> texte lisible : « 5 000 + 2 500,5 »
const fmtAmount = (a: string) =>
  a.replace(/\d+(\.\d*)?|[+\-*/]/g, (m) => {
    if (OPS.includes(m)) return ` ${OP_LABEL[m]} `;
    const [int, dec] = m.split('.');
    return `${Number(int || 0).toLocaleString('fr-FR')}${dec !== undefined ? `,${dec}` : ''}`;
  });

// Explication en langage simple des catégories Dette / Prêt par défaut
const DEBT_HINTS: Record<string, string> = {
  'loan-given': "J'ai prêté de l'argent",
  'debt-repay': 'Je rembourse ma dette',
  'debt-taken': "On m'a prêté de l'argent",
  'loan-back': "On me rend mon argent",
};

const dayLabel = (day: string) => {
  const now = new Date();
  if (!day || day === localDay(now)) return "Aujourd'hui";
  if (day === localDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))) return 'Hier';
  const d = new Date(`${day}T12:00`);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
};
// Jour choisi -> date ISO : aujourd'hui = maintenant ; un autre jour = ce jour-là, à l'heure qu'il est
const dayToIso = (day: string) => {
  const now = new Date();
  if (!day || day === localDay(now)) return now.toISOString();
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, now.getHours(), now.getMinutes()).toISOString();
};

// Tout tient sur un écran : les choix (catégorie, portefeuille, devise) s'ouvrent
// dans un panneau qui prend la place du clavier, au lieu de listes qui défilent.
type Panel = null | 'category' | 'wallet' | 'currency' | 'date' | 'split';

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  mode,
  categories,
  settings,
  wallets,
  defaultWalletId,
  onClose,
  onChangeMode,
  onSave,
  onSplit,
  onManageCategories,
  preset,
  people = [],
  noteHistory = [],
  usualAmounts = {},
  onSaveMany,
}) => {
  const [amount, setAmount] = useState('');
  const [parentId, setParentId] = useState(''); // catégorie principale choisie
  const [selectedId, setSelectedId] = useState(''); // catégorie finale (principale ou sous-catégorie)
  const [note, setNote] = useState('');
  const [walletId, setWalletId] = useState('');
  const [currency, setCurrency] = useState('');
  const [memberId, setMemberId] = useState(ME_ID); // portefeuille partagé : qui fait l'opération
  const [person, setPerson] = useState(''); // Dette / Prêt : avec qui
  const [interestText, setInterestText] = useState(''); // prêt / emprunt : intérêts prévus (facultatif)
  const [interestPct, setInterestPct] = useState(false); // … en % du montant
  const [dueDay, setDueDay] = useState(''); // prêt / emprunt : à rembourser le (facultatif, AAAA-MM-JJ)
  const [exclude, setExclude] = useState(false); // exclure du rapport (si l'option est activée)
  const [day, setDay] = useState(''); // '' = aujourd'hui
  const { excludeOption, simpleMode, iconsOnly } = useDisplayPrefs(); // mode simple : moins d'options, plus gros
  const debtsOn = useFeature('debts'); // onglet Dette / Prêt (désactivable depuis l'espace admin)
  // Mode simple : seulement « J'ai dépensé » / « J'ai reçu » (sauf si on arrive déjà sur Dette / Prêt)
  const tabs: AddMode[] = debtsOn && (!simpleMode || mode === 'debt') ? ['expense', 'income', 'debt'] : ['expense', 'income'];
  const [panel, setPanel] = useState<Panel>(null);
  const [batch, setBatch] = useState(false); // fenêtre « Plusieurs dépenses »
  const [draft, setDraft] = useState<Draft | null>(null); // brouillon proposé à l'ouverture
  const pendingDraft = useRef<Draft | null>(null);
  const [subOf, setSubOf] = useState<string | null>(null); // panneau catégorie : sous-catégories de…

  const available = mode ? categoriesFor(mode, categories) : [];
  const parents = available.filter((c) => !c.parentId);
  const childrenOf = (id: string) => available.filter((c) => c.parentId === id);
  const selected = available.find((c) => c.id === selectedId);
  const selectedParent = available.find((c) => c.id === parentId);

  const isOpen = mode !== null;

  // Notes déjà écrites : les habituelles de la catégorie, ou celles qui commencent comme ce qu'on tape
  const noteIdeas = useMemo(
    () => (mode ? suggestNotes(noteHistory, note, available.map((c) => c.id), selectedId) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [noteHistory, note, mode, selectedId, categories]
  );
  const pickNote = (x: NoteHistoryItem) => {
    setNote(x.text);
    // Catégorie choisie jamais utilisée avec cette note : on prend celle d'habitude
    if (!x.cats[selectedId]) {
      const usual = Object.entries(x.cats)
        .sort((a, b) => b[1] - a[1])
        .map(([id]) => available.find((c) => c.id === id))
        .find(Boolean);
      if (usual) {
        setSelectedId(usual.id);
        setParentId(usual.parentId ?? usual.id);
      }
    }
  };

  // À l'ouverture : tout remettre à zéro
  useEffect(() => {
    if (isOpen) {
      setAmount(preset?.amount ? String(Math.round(preset.amount * 100) / 100) : '');
      setNote('');
      setDay('');
      setPerson(preset?.withPerson ?? '');
      setInterestText('');
      setInterestPct(false);
      setDueDay('');
      setExclude(false);
      setMemberId(ME_ID);
      setWalletId(defaultWalletId);
      setCurrency(preset?.currency ?? wallets.find((w) => w.id === defaultWalletId)?.currency ?? '');
      setDraft(preset ? null : readDraft());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Changement d'onglet : on garde le montant, on change les catégories.
  // En Dette / Prêt, rien n'est présélectionné : on ouvre directement le choix.
  useEffect(() => {
    if (mode) {
      const pre = preset?.categoryId ? categoriesFor(mode, categories).find((c) => c.id === preset.categoryId) : undefined;
      const first = pre ?? (mode === 'debt' ? undefined : categoriesFor(mode, categories).find((c) => !c.parentId));
      setParentId(first?.parentId ?? first?.id ?? '');
      setSelectedId(first?.id ?? '');
      setSubOf(null);
      setPanel(mode === 'debt' && !first ? 'category' : null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // « Reprendre » le brouillon : on remet ce qui avait été tapé (après le changement d'onglet, si besoin)
  const applyDraft = (d: Draft) => {
    const c = categoriesFor(d.mode, categories).find((x) => x.id === d.selectedId);
    setAmount(d.amount);
    setNote(d.note);
    setPerson(d.person);
    setDay(d.day);
    if (wallets.some((w) => w.id === d.walletId)) setWalletId(d.walletId);
    if (d.currency) setCurrency(d.currency);
    if (c) {
      setSelectedId(c.id);
      setParentId(c.parentId ?? c.id);
      setPanel(null);
    }
  };
  useEffect(() => {
    const d = pendingDraft.current;
    if (!d || d.mode !== mode) return;
    pendingDraft.current = null;
    applyDraft(d);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  const resumeDraft = (d: Draft) => {
    haptic();
    setDraft(null);
    writeDraft(null);
    if (d.mode === mode) applyDraft(d);
    else {
      pendingDraft.current = d;
      onChangeMode(d.mode);
    }
  };

  const pressKey = (k: string) => {
    haptic();
    return pressAmount(k);
  };
  const pressAmount = (k: string) =>
    setAmount((a) => {
      if (k === 'del') return a.slice(0, -1);
      if (OPS.includes(k)) {
        if (!a) return a; // pas d'opération sans premier nombre
        return OPS.includes(a.slice(-1)) ? a.slice(0, -1) + k : a.length >= 24 ? a : a + k;
      }
      if (a.length >= 24) return a;
      const seg = a.split(/[+\-*/]/).pop() ?? '';
      if (k === '.') return seg.includes('.') ? a : seg === '' ? a + '0.' : a + '.';
      if (seg.includes('.') && seg.split('.')[1].length >= 2) return a;
      return seg === '0' ? a.slice(0, -1) + k : a + k;
    });

  const hasOp = /[+\-*/]/.test(amount);
  const usualList = mode !== 'debt' && selected ? usualAmounts[selected.id] ?? [] : [];
  const value = evalAmount(amount);
  const wallet = wallets.find((w) => w.id === walletId) ?? wallets[0];
  const cur = currency || wallet?.currency || '';
  const converted = wallet ? convertBetween(value, cur, wallet.currency, settings) : null;
  const rateMissing = !!wallet && converted === null;
  const canSave = value > 0 && !!selected && !!wallet && !rateMissing;
  // Intérêts : seulement quand on prête ou qu'on emprunte (pas pour un remboursement)
  const withInterest = mode === 'debt' && (selected?.id === 'loan-given' || selected?.id === 'debt-taken');
  const interest = withInterest ? interestAmount(interestText, interestPct, value) : 0;

  // Fermer sans enregistrer : on garde un brouillon si quelque chose était tapé
  const dismiss = () => {
    if (mode && (value > 0 || note.trim())) writeDraft({ mode, amount, note, selectedId, walletId, currency, day, person, at: Date.now() });
    onClose();
  };

  const save = () => {
    if (!canSave || !selected || !wallet) return;
    onSave(
      value,
      selected,
      note.trim(),
      wallet.id,
      cur,
      isShared(wallet) && memberId !== ME_ID ? memberId : undefined,
      mode === 'debt' ? person.trim() || undefined : undefined,
      excludeOption && exclude ? true : undefined,
      dayToIso(day),
      interest > 0 ? interest : undefined,
      withInterest && dueDay ? dueDay : undefined
    );
    writeDraft(null);
    onClose();
  };

  // Clavier physique (ordinateur) : chiffres, virgule, Retour arrière, Entrée, Échap
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return panel ? setPanel(null) : dismiss();
      if ((e.target as HTMLElement).tagName === 'INPUT' || panel) return;
      if (/^[0-9]$/.test(e.key)) pressKey(e.key);
      else if (e.key === '.' || e.key === ',') pressKey('.');
      else if (OPS.includes(e.key) && !simpleMode) pressKey(e.key);
      else if (e.key === 'Backspace') pressKey('del');
      else if (e.key === 'Enter') save();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!mode) return null;

  // Pour Dette / Prêt, c'est la catégorie qui dit si l'argent sort ou entre
  const direction: 'out' | 'in' | null =
    mode === 'expense' ? 'out' : mode === 'income' ? 'in' : selected?.direction ?? null;

  const walletLabel = direction === 'out' ? (mode === 'expense' ? 'Payé avec' : 'Depuis') : direction === 'in' ? (mode === 'income' ? 'Reçu sur' : 'Vers') : 'Portefeuille';

  const saveLabel = !selected
    ? mode === 'debt' ? 'Choisis ce qui se passe' : 'Choisis une catégorie'
    : value <= 0
      ? 'Saisis un montant'
      : rateMissing
        ? 'Taux de change manquant'
        : `Enregistrer ${direction === 'out' ? '−' : '+'}${formatMoney(value, cur)}`;

  const pickCategory = (c: Category) => {
    const kids = childrenOf(c.id);
    if (!c.parentId && kids.length > 0 && subOf !== c.id) {
      setSubOf(c.id); // montrer les sous-catégories
      return;
    }
    setParentId(c.parentId ?? c.id);
    setSelectedId(c.id);
    setSubOf(null);
    setPanel(null);
  };

  const categoryLabel = selected
    ? selected.parentId && selectedParent
      ? `${selectedParent.name} › ${selected.name}`
      : selected.name
    : mode === 'debt'
      ? 'Que se passe-t-il ?'
      : 'Catégorie';

  // Tuile d'un panneau de choix
  const tile = (key: string, active: boolean, onClick: () => void, badge: React.ReactNode, title: string, sub?: React.ReactNode) => (
    <button
      key={key}
      onClick={onClick}
      className={`relative min-w-0 min-h-[84px] flex flex-col items-center justify-center gap-0.5 px-0.5 py-2 rounded-2xl text-center transition duration-200 ease-out active:scale-[0.95] cursor-pointer ${
        active ? 'is-selected' : 'bg-slate-100 hover:bg-slate-200/70'
      }`}
    >
      {active && <SelCheck />}
      {badge}
      {/* Coupure à la française (« Rembour-sement »), jamais au milieu d'une syllabe */}
      <span className="w-full text-[12px] font-bold text-slate-900 leading-tight line-clamp-2 hyphens-auto break-words" lang="fr">{title}</span>
      {sub}
    </button>
  );

  const renderPanel = () => {
    if (panel === 'category') {
      // Dépense / Revenu : les catégories Dette / Prêt ont leur onglet (sauf celle déjà choisie)
      const list = subOf
        ? [available.find((c) => c.id === subOf)!, ...childrenOf(subOf)]
        : parents.filter((c) => mode === 'debt' || c.type !== 'debt' || c.id === selectedId);
      const title = subOf ? available.find((c) => c.id === subOf)?.name : mode === 'debt' ? 'Que se passe-t-il ?' : 'Choisis une catégorie';
      return (
        <>
          <PanelHeader
            title={title ?? ''}
            onBack={subOf ? () => setSubOf(null) : undefined}
            onClose={() => setPanel(null)}
            extra={
              // Dette / Prêt : les 4 choix sont fixes, rien à gérer
              mode === 'debt' ? undefined : (
                <button onClick={onManageCategories} className="text-xs font-semibold text-slate-500 hover:text-slate-900 flex items-center gap-1 cursor-pointer">
                  <Settings2 className="w-3.5 h-3.5" /> Gérer
                </button>
              )
            }
          />
          {mode === 'debt' && !subOf ? (
            // Dette / Prêt : deux groupes, « l'argent sort » puis « l'argent entre » (au lieu de le répéter sur chaque tuile)
            (['out', 'in'] as const).map((dir) => (
              <section key={dir} className="mb-3">
                <h4 className={`flex items-center gap-1 px-1 mb-1.5 text-[12px] font-bold uppercase tracking-wider ${dir === 'out' ? 'text-slate-500' : 'text-emerald-600'}`}>
                  {dir === 'out' ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownLeft className="w-3.5 h-3.5" />}
                  {dir === 'out' ? "L'argent sort" : "L'argent entre"}
                </h4>
                <div className="grid grid-cols-2 gap-1.5">
                  {list
                    .filter((c) => c.direction === dir)
                    .map((c) =>
                      tile(
                        c.id,
                        selectedId === c.id,
                        () => pickCategory(c),
                        <IconBadge icon={c.icon} image={c.image} color={c.color} size="sm" />,
                        c.name,
                        DEBT_HINTS[c.id] ? <span className="text-[11px] text-slate-500 leading-tight">{DEBT_HINTS[c.id]}</span> : undefined
                      )
                    )}
                </div>
              </section>
            ))
          ) : (
          <div className={`grid ${mode === 'debt' ? 'grid-cols-2 gap-1.5' : 'grid-cols-4 gap-1'}`}>
            {list.map((c, i) =>
              tile(
                c.id,
                selectedId === c.id,
                () => (subOf && i === 0 ? pickCategory({ ...c, parentId: undefined }) : pickCategory(c)),
                <IconBadge icon={c.icon} image={c.image} color={c.color} size="sm" />,
                subOf && i === 0 ? 'Général' : c.name,
                mode === 'debt' ? (
                  <>
                    {DEBT_HINTS[c.id] && <span className="text-[11px] text-slate-500 leading-tight">{DEBT_HINTS[c.id]}</span>}
                    {c.direction && (
                      <span className={`flex items-center gap-0.5 text-[11px] font-bold ${c.direction === 'out' ? 'text-slate-600' : 'text-emerald-600'}`}>
                        {c.direction === 'out' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
                        {c.direction === 'out' ? "L'argent sort" : "L'argent entre"}
                      </span>
                    )}
                  </>
                ) : !subOf && childrenOf(c.id).length > 0 ? (
                  // Des sous-catégories : une petite flèche suffit
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" aria-label={`${childrenOf(c.id).length + 1} choix`} />
                ) : undefined
              )
            )}
          </div>
          )}
        </>
      );
    }
    if (panel === 'split') {
      return (
        <>
          <PanelHeader title="Partager l'addition" onClose={() => setPanel(null)} />
          <p className="text-[12px] text-slate-500 -mt-1 mb-3">Chacun sa part : Wallo note la tienne et retient qui doit combien.</p>
          <SplitPanel
            total={value}
            onTotal={(v) => setAmount(v > 0 ? String(Math.round(v * 100) / 100) : '')}
            currency={cur}
            people={people}
            canSave={canSave}
            onSave={(r) => {
              if (!selected || !wallet || !onSplit) return;
              onSplit({
                ...r,
                category: selected,
                note: note.trim(),
                walletId: wallet.id,
                currency: cur,
                memberId: isShared(wallet) && memberId !== ME_ID ? memberId : undefined,
                createdAt: dayToIso(day),
              });
              onClose();
            }}
          />
        </>
      );
    }
    if (panel === 'date') {
      return (
        <>
          <PanelHeader title="Date de l'opération" onClose={() => setPanel(null)} />
          <DatePicker
            value={day}
            onChange={(d) => {
              setDay(d);
              setPanel(null);
            }}
          />
        </>
      );
    }
    if (panel === 'wallet') {
      return (
        <>
          <PanelHeader title={walletLabel} onClose={() => setPanel(null)} />
          <div className="grid grid-cols-3 gap-2">
            {wallets.map((w) =>
              tile(
                w.id,
                w.id === wallet?.id,
                () => {
                  setWalletId(w.id);
                  setCurrency(w.currency);
                  setMemberId(ME_ID);
                  setPanel(null);
                },
                <IconBadge icon={w.icon} image={w.image} color={w.color} size="sm" />,
                w.name,
                <span className="text-[11px] text-slate-400">{w.currency}</span>
              )
            )}
          </div>
        </>
      );
    }
    // devise
    const choices = [
      ...new Set([wallet?.currency, settings.mainCurrency, settings.secondCurrency, ...CURRENCIES.map((c) => c.code)].filter(Boolean) as string[]),
    ];
    return (
      <>
        <PanelHeader title="Devise du montant" onClose={() => setPanel(null)} />
        <div className="grid grid-cols-4 gap-2">
          {choices.map((code) => (
            <button
              key={code}
              onClick={() => {
                setCurrency(code);
                setPanel(null);
              }}
              className={`py-2.5 rounded-xl text-sm font-bold cursor-pointer transition ${
                code === cur ? 'bg-accent text-slate-900' : 'bg-slate-100 text-slate-700 hover:bg-slate-200/70'
              }`}
            >
              {code}
            </button>
          ))}
        </div>
        {wallet && <p className="text-[12px] text-slate-400 mt-2">Converti automatiquement en {wallet.currency} pour {wallet.name}.</p>}
      </>
    );
  };

  const selectorCls = (active: boolean) =>
    `min-w-0 flex-1 flex items-center gap-2 pl-1.5 pr-2.5 py-2 rounded-2xl text-left cursor-pointer transition ${
      active ? 'is-open' : 'bg-slate-100 hover:bg-slate-200/70'
    }`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={dismiss}>
      <div
        className="w-full sm:max-w-[420px] max-h-[calc(100dvh-env(safe-area-inset-top))] overflow-y-auto bg-white rounded-t-[28px] sm:rounded-[32px] px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fermer + type */}
        <div className="flex items-center gap-2">
          <button onClick={dismiss} aria-label="Annuler" className="w-10 h-10 shrink-0 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
            <X className="w-4 h-4" />
          </button>
          <div className={`flex-1 grid ${tabs.length === 3 ? 'grid-cols-3' : 'grid-cols-2'} gap-1 p-1 rounded-2xl bg-slate-200/60`}>
            {tabs.map((m) => (
              <button
                key={m}
                onClick={() => { haptic(); onChangeMode(m); }}
                className={`${simpleMode ? 'py-2 text-[15px]' : 'py-1.5 text-[13px]'} rounded-xl font-semibold transition cursor-pointer ${mode === m ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
              >
                {iconsOnly ? (
                  // Icônes seules : flèche rouge (sort), verte (entre), mains (dette)
                  <span className="flex justify-center" aria-label={m === 'expense' ? 'Dépense' : m === 'income' ? 'Revenu' : 'Dette / Prêt'}>
                    {m === 'expense' ? <ArrowUpRight className="w-6 h-6 text-red-500" strokeWidth={2.6} /> : m === 'income' ? <ArrowDownLeft className="w-6 h-6 text-emerald-500" strokeWidth={2.6} /> : <HandCoins className="w-6 h-6 text-amber-500" strokeWidth={2.4} />}
                  </span>
                ) : m === 'expense' ? (simpleMode ? 'J\u2019ai dépensé' : 'Dépense') : m === 'income' ? (simpleMode ? 'J\u2019ai reçu' : 'Revenu') : 'Dette / Prêt'}
              </button>
            ))}
          </div>
        </div>

        {/* Brouillon : ce qui avait été tapé avant de fermer */}
        {draft && !amount && !note && (
          <div className="mt-3 flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-2xl bg-slate-100 animate-fade-in">
            <History className="w-4 h-4 text-slate-500 shrink-0" />
            <span className="flex-1 min-w-0 text-[13px] text-slate-600 truncate">
              Brouillon : <b className="text-slate-900 tabular-nums">{fmtAmount(String(evalAmount(draft.amount)))} {draft.currency}</b>
              {draft.note ? ` · ${draft.note}` : ''}
            </span>
            <button onClick={() => resumeDraft(draft)} className="h-8 px-3 rounded-full bg-accent text-[13px] font-bold cursor-pointer active:scale-95 transition">
              Reprendre
            </button>
            <button
              onClick={() => {
                writeDraft(null);
                setDraft(null);
              }}
              aria-label="Oublier le brouillon"
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Montant */}
        <div className="flex flex-col items-center pt-4 pb-2">
          <div className="flex items-center gap-2 max-w-full">
            <span
              className={`${amount.length > 13 ? 'text-[28px]' : amount.length > 9 ? 'text-[36px]' : 'text-[46px]'} leading-none font-extrabold tracking-tight tabular-nums truncate ${
                !amount ? 'text-slate-300' : direction === 'in' ? 'text-emerald-600' : direction === 'out' ? 'text-red-500' : 'text-slate-900'
              }`}
            >
              {amount && direction ? (direction === 'out' ? '−' : '+') : ''}
              {/* « 25 000,5 » : séparateur de milliers pendant la saisie */}
              {amount ? fmtAmount(amount) : '0'}
            </span>
            <button
              onClick={() => setPanel(panel === 'currency' ? null : 'currency')}
              aria-expanded={panel === 'currency'}
              className="flex items-center gap-0.5 px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-sm font-bold text-slate-700 cursor-pointer"
            >
              {cur} <ChevronDown className="w-4 h-4" />
            </button>
          </div>
          {/* Calculatrice : le résultat de l'opération tapée */}
          {hasOp && value > 0 && <p className="mt-1.5 text-[15px] font-bold text-slate-500 tabular-nums animate-fade-in">= {fmtAmount(String(value))} {cur}</p>}
          {/* Seulement quand ça apporte quelque chose : le portefeuille est déjà dans « Payé avec » */}
          {(rateMissing || (wallet && cur !== wallet.currency && value > 0) || (!direction && !(mode === 'debt' && panel === 'category'))) && (
            <p className={`mt-1.5 text-xs ${rateMissing ? 'text-amber-600' : 'text-slate-500'}`}>
              {rateMissing
                ? 'Taux de change manquant : ajoute-le dans Paramètres.'
                : !direction
                  ? 'Choisis ce qui se passe'
                  : `≈ ${formatMoney(converted ?? 0, wallet!.currency)} sur ${wallet!.name}`}
            </p>
          )}
          {/* Montants déjà utilisés pour cette catégorie : un toucher (la place reste réservée une fois le montant tapé) */}
          {usualList.length > 0 && (
            <div className={`mt-2 flex flex-wrap justify-center gap-1.5 ${amount ? 'invisible' : ''}`} aria-hidden={!!amount}>
              {usualList.map((u) => (
                <button
                  key={`${u.amount}-${u.currency}`}
                  tabIndex={amount ? -1 : 0}
                  onClick={() => {
                    haptic();
                    setAmount(String(u.amount));
                    setCurrency(u.currency);
                  }}
                  className="h-7 px-3 rounded-full bg-white border border-slate-200 text-[12px] font-semibold text-slate-700 tabular-nums cursor-pointer active:scale-95 transition"
                >
                  {fmtAmount(String(u.amount))} {u.currency}
                </button>
              ))}
            </div>
          )}
          {/* Date : aujourd'hui par défaut, touche pour en choisir une autre */}
          <button
            onClick={() => setPanel(panel === 'date' ? null : 'date')}
            aria-expanded={panel === 'date'}
            aria-label={`Date : ${dayLabel(day)}`}
            className={`mt-2.5 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition ${
              day && day !== localDay(new Date()) ? 'bg-accent text-slate-900' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            {dayLabel(day)}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${panel === 'date' ? 'rotate-180' : ''}`} />
          </button>
        </div>

        {/* Catégorie + portefeuille : deux boutons, toujours visibles */}
        <div className="flex gap-2">
          <button onClick={() => { setSubOf(null); setPanel(panel === 'category' ? null : 'category'); }} className={selectorCls(panel === 'category')}>
            {selected ? (
              <IconBadge icon={selected.icon} image={selected.image} color={selected.color} size="sm" />
            ) : (
              <span className="w-9 h-9 rounded-full bg-slate-200 shrink-0" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold text-slate-500">{mode === 'debt' ? 'Type' : simpleMode ? 'Pour quoi\u00a0?' : 'Catégorie'}</span>
              <span className={`block text-[13px] font-bold leading-tight line-clamp-2 ${selected ? 'text-slate-900' : 'text-slate-400'}`}>{selected ? categoryLabel : 'À choisir'}</span>
            </span>
            <ChevronDown className="w-4 h-4 shrink-0 text-slate-400" />
          </button>
          <button onClick={() => setPanel(panel === 'wallet' ? null : 'wallet')} className={selectorCls(panel === 'wallet')}>
            {wallet && <IconBadge icon={wallet.icon} image={wallet.image} color={wallet.color} size="sm" />}
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold text-slate-500">{walletLabel}</span>
              <span className="block text-[13px] font-bold leading-tight text-slate-900 line-clamp-2">{wallet?.name}</span>
            </span>
            <ChevronDown className="w-4 h-4 shrink-0 text-slate-400" />
          </button>
        </div>

        {/* Bas : panneau de choix OU note + clavier + enregistrer (même hauteur) */}
        <div className="mt-2 min-h-[296px]">
          {panel ? (
            <div className="animate-fade-in">{renderPanel()}</div>
          ) : (
            <>
              {isShared(wallet) && (
                <div className="mb-2">
                  <MemberChips wallet={wallet} value={memberId} onChange={setMemberId} label={direction === 'in' ? 'Versé par' : 'Fait par'} />
                </div>
              )}
              <div className="flex gap-2 items-start">
              <div className="flex-1 min-w-0">
              {mode === 'debt' ? (
                <>
                  {/* Dette / Prêt : avec qui (suggestions = noms déjà utilisés) */}
                  <div className="flex gap-2 mb-2">
                    <input
                      value={person}
                      onChange={(e) => setPerson(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && save()}
                      list="wallo-people"
                      placeholder="Avec qui ? (ex. Kemy)"
                      className="min-w-0 flex-1 px-4 py-2 rounded-2xl bg-slate-100 text-sm outline-none focus:ring-2 focus:ring-accent"
                    />
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && save()}
                      placeholder="Note (facultatif)"
                      className="min-w-0 flex-1 px-4 py-2 rounded-2xl bg-slate-100 text-sm outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>
                  {withInterest && (
                    <div className="flex gap-2 mb-2 items-center">
                      <input
                        value={interestText}
                        onChange={(e) => setInterestText(e.target.value.replace(/[^0-9.,]/g, ''))}
                        onKeyDown={(e) => e.key === 'Enter' && save()}
                        inputMode="decimal"
                        placeholder="Intérêts (facultatif)"
                        aria-label="Intérêts prévus"
                        className="min-w-0 flex-1 px-4 py-2 rounded-2xl bg-slate-100 text-sm outline-none focus:ring-2 focus:ring-accent tabular-nums"
                      />
                      {/* En montant ou en % du prêt */}
                      <div className="flex shrink-0 p-0.5 rounded-xl bg-slate-100" role="group" aria-label="Intérêts en">
                        {[false, true].map((pct) => (
                          <button
                            key={String(pct)}
                            type="button"
                            onClick={() => setInterestPct(pct)}
                            aria-pressed={interestPct === pct}
                            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${interestPct === pct ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
                          >
                            {pct ? '%' : cur}
                          </button>
                        ))}
                      </div>
                      {interestPct && interest > 0 && <span className="shrink-0 text-xs font-semibold text-slate-500 tabular-nums">= {formatMoney(interest, cur)}</span>}
                    </div>
                  )}
                  {/* Échéance : un rappel la veille et le jour même */}
                  {withInterest && (
                    <DateField
                      value={dueDay}
                      onChange={setDueDay}
                      placeholder={selected?.id === 'loan-given' ? 'À me rembourser le… (facultatif)' : 'À rembourser le… (facultatif)'}
                      min={localDay(new Date())}
                      shortcuts="future"
                      label="Date de remboursement"
                      className="mb-2"
                    />
                  )}
                  <datalist id="wallo-people">
                    {people.map((n) => (
                      <option key={n} value={n} />
                    ))}
                  </datalist>
                </>
              ) : (
                <div className="flex gap-2 mb-2">
                  <input
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && save()}
                    placeholder="Ajouter une note"
                    className="min-w-0 flex-1 px-4 py-2 rounded-2xl bg-slate-100 text-sm outline-none focus:ring-2 focus:ring-accent"
                  />
                  {/* Partager l'addition (restaurant, voyage…) : seulement pour une dépense */}
                  {mode === 'expense' && debtsOn && onSplit && !simpleMode && (
                    <button
                      type="button"
                      onClick={() => setPanel('split')}
                      className="shrink-0 h-9 px-3 rounded-2xl bg-slate-100 hover:bg-slate-200/70 text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Users className="w-3.5 h-3.5" /> Partager
                    </button>
                  )}
                  {/* Plusieurs dépenses d'un coup (taxi, pain, crédit…) */}
                  {mode === 'expense' && onSaveMany && !simpleMode && (
                    <button
                      type="button"
                      onClick={() => setBatch(true)}
                      aria-label="Noter plusieurs dépenses"
                      title="Plusieurs dépenses"
                      className="shrink-0 h-9 px-3 rounded-2xl bg-slate-100 hover:bg-slate-200/70 text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer"
                    >
                      <ListPlus className="w-3.5 h-3.5" /> Plusieurs
                    </button>
                  )}
                </div>
              )}
              {noteIdeas.length > 0 && (
                <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mt-0.5 mb-2 animate-fade-in" aria-label="Notes déjà utilisées">
                  {noteIdeas.map((x) => (
                    <button
                      key={x.text}
                      type="button"
                      // garde le clavier ouvert pendant qu'on touche la suggestion
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => pickNote(x)}
                      className="shrink-0 max-w-[70%] px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-semibold text-slate-700 truncate cursor-pointer hover:bg-slate-50"
                    >
                      {x.text}
                    </button>
                  ))}
                </div>
              )}
              </div>
              {excludeOption && !simpleMode && (
                <button
                  type="button"
                  onClick={() => setExclude((x) => !x)}
                  aria-pressed={exclude}
                  title="Exclure du rapport"
                  className={`shrink-0 h-9 px-3 rounded-2xl text-xs font-bold flex items-center gap-1.5 cursor-pointer ${
                    exclude ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <EyeOff className="w-3.5 h-3.5" /> Hors rapport
                </button>
              )}
              </div>
              <div className={`grid ${simpleMode ? 'grid-cols-3' : 'grid-cols-4'} gap-1.5`}>
                {(simpleMode ? KEYS : CALC_KEYS).map((k) => (
                  <button
                    key={k}
                    onClick={() => pressKey(k)}
                    aria-label={k === 'del' ? 'Effacer' : OPS.includes(k) ? { '+': 'plus', '-': 'moins', '*': 'fois', '/': 'divisé par' }[k] : k}
                    className={`${simpleMode ? 'h-14 text-2xl' : 'h-12 text-xl'} rounded-2xl font-semibold flex items-center justify-center cursor-pointer select-none ${
                      OPS.includes(k) ? 'bg-slate-200/70 active:bg-slate-300/70 text-slate-600' : 'bg-slate-100 active:bg-slate-200 text-slate-800'
                    } ${OPS.includes(k) && amount.endsWith(k) ? 'is-selected' : ''}`}
                  >
                    {k === 'del' ? <Delete className="w-5 h-5" /> : k === '.' ? ',' : OPS.includes(k) ? OP_LABEL[k] : k}
                  </button>
                ))}
              </div>
              <button
                disabled={!canSave}
                onClick={save}
                className={`w-full mt-2 ${simpleMode ? 'py-4 text-base' : 'py-3.5 text-sm'} rounded-2xl bg-accent disabled:bg-slate-100 disabled:text-slate-400 text-slate-900 font-bold cursor-pointer disabled:cursor-default`}
              >
                {saveLabel}
              </button>
            </>
          )}
        </div>
      </div>
      {batch && onSaveMany && (
        <BatchAddSheet
          categories={categories}
          wallets={wallets}
          defaultWalletId={walletId || defaultWalletId}
          noteHistory={noteHistory}
          usualAmounts={usualAmounts}
          onClose={() => setBatch(false)}
          onSave={(items, wId, day) => {
            onSaveMany(items, wId, day);
            writeDraft(null);
            setBatch(false);
            onClose();
          }}
        />
      )}
    </div>
  );
};

const PanelHeader: React.FC<{ title: string; onBack?: () => void; onClose: () => void; extra?: React.ReactNode }> = ({ title, onBack, onClose, extra }) => (
  <div className="flex items-center gap-2 mb-2">
    {onBack && (
      <button onClick={onBack} aria-label="Retour" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
        <ChevronLeft className="w-4 h-4" />
      </button>
    )}
    <span className="flex-1 text-sm font-bold text-slate-900 truncate">{title}</span>
    {extra}
    <button onClick={onClose} className="px-3 py-1.5 rounded-full bg-slate-100 text-xs font-bold text-slate-700 cursor-pointer">
      OK
    </button>
  </div>
);
