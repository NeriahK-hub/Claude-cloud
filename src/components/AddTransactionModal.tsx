import React, { useState, useEffect } from 'react';
import { Delete, Settings2, ChevronDown, ChevronLeft, ArrowUpRight, ArrowDownLeft, X } from 'lucide-react';
import { Category, categoriesFor } from '../data/categories';
import { isShared, MemberChips, ME_ID } from './Members';
import { IconBadge } from './AppIcon';
import { Settings, Wallet } from '../types';
import { CURRENCIES } from '../data/currencies';
import { convertBetween, formatMoney } from '../lib/money';

export type AddMode = 'expense' | 'income' | 'debt';

interface AddTransactionModalProps {
  mode: AddMode | null; // null = fermé
  categories: Category[];
  settings: Settings;
  wallets: Wallet[]; // portefeuilles actifs
  defaultWalletId: string;
  onClose: () => void;
  onChangeMode: (m: AddMode) => void;
  onSave: (amount: number, category: Category, note: string, walletId: string, currency: string, memberId?: string) => void;
  onManageCategories: () => void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'del'];

// Explication en langage simple des catégories Dette / Prêt par défaut
const DEBT_HINTS: Record<string, string> = {
  'loan-given': "J'ai prêté de l'argent",
  'debt-repay': 'Je rembourse ma dette',
  'debt-taken': "On m'a prêté de l'argent",
  'loan-back': "On me rend mon argent",
};

// Tout tient sur un écran : les choix (catégorie, portefeuille, devise) s'ouvrent
// dans un panneau qui prend la place du clavier, au lieu de listes qui défilent.
type Panel = null | 'category' | 'wallet' | 'currency';

export const AddTransactionModal: React.FC<AddTransactionModalProps> = ({
  mode,
  categories,
  settings,
  wallets,
  defaultWalletId,
  onClose,
  onChangeMode,
  onSave,
  onManageCategories,
}) => {
  const [amount, setAmount] = useState('');
  const [parentId, setParentId] = useState(''); // catégorie principale choisie
  const [selectedId, setSelectedId] = useState(''); // catégorie finale (principale ou sous-catégorie)
  const [note, setNote] = useState('');
  const [walletId, setWalletId] = useState('');
  const [currency, setCurrency] = useState('');
  const [memberId, setMemberId] = useState(ME_ID); // portefeuille partagé : qui fait l'opération
  const [panel, setPanel] = useState<Panel>(null);
  const [subOf, setSubOf] = useState<string | null>(null); // panneau catégorie : sous-catégories de…

  const available = mode ? categoriesFor(mode, categories) : [];
  const parents = available.filter((c) => !c.parentId);
  const childrenOf = (id: string) => available.filter((c) => c.parentId === id);
  const selected = available.find((c) => c.id === selectedId);
  const selectedParent = available.find((c) => c.id === parentId);

  const isOpen = mode !== null;

  // À l'ouverture : tout remettre à zéro
  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setNote('');
      setMemberId(ME_ID);
      setWalletId(defaultWalletId);
      setCurrency(wallets.find((w) => w.id === defaultWalletId)?.currency ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Changement d'onglet : on garde le montant, on change les catégories.
  // En Dette / Prêt, rien n'est présélectionné : on ouvre directement le choix.
  useEffect(() => {
    if (mode) {
      const first = mode === 'debt' ? undefined : categoriesFor(mode, categories).find((c) => !c.parentId);
      setParentId(first?.id ?? '');
      setSelectedId(first?.id ?? '');
      setSubOf(null);
      setPanel(mode === 'debt' ? 'category' : null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const pressKey = (k: string) =>
    setAmount((a) => {
      if (k === 'del') return a.slice(0, -1);
      if (k === '.' && a.includes('.')) return a;
      if (a.includes('.') && a.split('.')[1].length >= 2) return a;
      if (k === '.' && a === '') return '0.';
      return a === '0' && k !== '.' ? k : a + k;
    });

  const value = parseFloat(amount) || 0;
  const wallet = wallets.find((w) => w.id === walletId) ?? wallets[0];
  const cur = currency || wallet?.currency || '';
  const converted = wallet ? convertBetween(value, cur, wallet.currency, settings) : null;
  const rateMissing = !!wallet && converted === null;
  const canSave = value > 0 && !!selected && !!wallet && !rateMissing;

  const save = () => {
    if (!canSave || !selected || !wallet) return;
    onSave(value, selected, note, wallet.id, cur, isShared(wallet) && memberId !== ME_ID ? memberId : undefined);
    onClose();
  };

  // Clavier physique (ordinateur) : chiffres, virgule, Retour arrière, Entrée, Échap
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return panel ? setPanel(null) : onClose();
      if ((e.target as HTMLElement).tagName === 'INPUT' || panel) return;
      if (/^[0-9]$/.test(e.key)) pressKey(e.key);
      else if (e.key === '.' || e.key === ',') pressKey('.');
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
      className={`min-w-0 flex flex-col items-center justify-center gap-0.5 px-1 py-1.5 rounded-2xl text-center border-2 transition cursor-pointer ${
        active ? 'border-slate-900 bg-[#D8FB52]/40' : 'border-transparent bg-slate-100 hover:bg-slate-200/70'
      }`}
    >
      {badge}
      <span className="w-full text-[11px] font-bold text-slate-900 leading-tight line-clamp-2 [overflow-wrap:anywhere]">{title}</span>
      {sub}
    </button>
  );

  const renderPanel = () => {
    if (panel === 'category') {
      const list = subOf ? [available.find((c) => c.id === subOf)!, ...childrenOf(subOf)] : parents;
      const title = subOf ? available.find((c) => c.id === subOf)?.name : mode === 'debt' ? 'Que se passe-t-il ?' : 'Choisis une catégorie';
      return (
        <>
          <PanelHeader
            title={title ?? ''}
            onBack={subOf ? () => setSubOf(null) : undefined}
            onClose={() => setPanel(null)}
            extra={
              <button onClick={onManageCategories} className="text-xs font-semibold text-slate-500 hover:text-slate-900 flex items-center gap-1 cursor-pointer">
                <Settings2 className="w-3.5 h-3.5" /> Gérer
              </button>
            }
          />
          <div className={`grid gap-1.5 ${mode === 'debt' ? 'grid-cols-2' : 'grid-cols-4'}`}>
            {list.map((c, i) =>
              tile(
                c.id,
                selectedId === c.id,
                () => (subOf && i === 0 ? pickCategory({ ...c, parentId: undefined }) : pickCategory(c)),
                <IconBadge icon={c.icon} image={c.image} color={c.color} size="sm" />,
                subOf && i === 0 ? 'Général' : c.name,
                mode === 'debt' ? (
                  <>
                    {DEBT_HINTS[c.id] && <span className="text-[10px] text-slate-500 leading-tight">{DEBT_HINTS[c.id]}</span>}
                    {c.direction && (
                      <span className={`flex items-center gap-0.5 text-[10px] font-bold ${c.direction === 'out' ? 'text-slate-600' : 'text-emerald-600'}`}>
                        {c.direction === 'out' ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownLeft className="w-3 h-3" />}
                        {c.direction === 'out' ? "L'argent sort" : "L'argent entre"}
                      </span>
                    )}
                  </>
                ) : !subOf && childrenOf(c.id).length > 0 ? (
                  <span className="text-[10px] leading-none text-slate-400">{childrenOf(c.id).length + 1} choix ›</span>
                ) : undefined
              )
            )}
          </div>
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
                <span className="text-[10px] text-slate-400">{w.currency}</span>
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
                code === cur ? 'bg-[#D8FB52] text-slate-900' : 'bg-slate-100 text-slate-700 hover:bg-slate-200/70'
              }`}
            >
              {code}
            </button>
          ))}
        </div>
        {wallet && <p className="text-[11px] text-slate-400 mt-2">Converti automatiquement en {wallet.currency} pour {wallet.name}.</p>}
      </>
    );
  };

  const selectorCls = (active: boolean) =>
    `min-w-0 flex-1 flex items-center gap-2 pl-1.5 pr-2.5 py-1.5 rounded-2xl text-left cursor-pointer transition border-2 ${
      active ? 'border-slate-900 bg-white' : 'border-transparent bg-slate-100 hover:bg-slate-200/70'
    }`;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
      <div
        className="w-full sm:max-w-[420px] max-h-[100dvh] overflow-y-auto bg-white rounded-t-[28px] sm:rounded-[32px] px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fermer + type */}
        <div className="flex items-center gap-2">
          <button onClick={onClose} aria-label="Annuler" className="w-10 h-10 shrink-0 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
            <X className="w-4 h-4" />
          </button>
          <div className="flex-1 grid grid-cols-3 gap-1 p-1 rounded-2xl bg-slate-200/60">
            {(['expense', 'income', 'debt'] as const).map((m) => (
              <button
                key={m}
                onClick={() => onChangeMode(m)}
                className={`py-1.5 rounded-xl text-[13px] font-semibold transition cursor-pointer ${mode === m ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'}`}
              >
                {m === 'expense' ? 'Dépense' : m === 'income' ? 'Revenu' : 'Dette / Prêt'}
              </button>
            ))}
          </div>
        </div>

        {/* Montant */}
        <div className="flex flex-col items-center pt-3 pb-2">
          <div className="flex items-baseline gap-2">
            <span
              className={`text-[38px] leading-none font-extrabold tracking-tight tabular-nums ${
                !amount ? 'text-slate-300' : direction === 'in' ? 'text-emerald-600' : 'text-slate-900'
              }`}
            >
              {amount && direction ? (direction === 'out' ? '−' : '+') : ''}
              {amount ? amount.replace('.', ',') : '0'}
            </span>
            <button
              onClick={() => setPanel(panel === 'currency' ? null : 'currency')}
              aria-expanded={panel === 'currency'}
              className="flex items-center gap-0.5 px-2.5 py-1 rounded-full bg-slate-100 hover:bg-slate-200 text-sm font-bold text-slate-700 cursor-pointer"
            >
              {cur} <ChevronDown className="w-4 h-4" />
            </button>
          </div>
          <p className={`mt-1.5 text-xs ${rateMissing ? 'text-amber-600' : 'text-slate-500'}`}>
            {rateMissing
              ? 'Taux de change manquant : ajoute-le dans Paramètres.'
              : wallet && direction
                ? `${direction === 'out' ? 'Sort de' : 'Entre sur'} ${wallet.name}${
                    cur !== wallet.currency && value > 0 ? ` · ≈ ${formatMoney(converted ?? 0, wallet.currency)}` : ''
                  }`
                : 'Choisis ce qui se passe'}
          </p>
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
              <span className="block text-[10px] font-semibold text-slate-500">{mode === 'debt' ? 'Type' : 'Catégorie'}</span>
              <span className={`block text-xs font-bold truncate ${selected ? 'text-slate-900' : 'text-slate-400'}`}>{selected ? categoryLabel : 'À choisir'}</span>
            </span>
            <ChevronDown className="w-4 h-4 shrink-0 text-slate-400" />
          </button>
          <button onClick={() => setPanel(panel === 'wallet' ? null : 'wallet')} className={selectorCls(panel === 'wallet')}>
            {wallet && <IconBadge icon={wallet.icon} image={wallet.image} color={wallet.color} size="sm" />}
            <span className="min-w-0 flex-1">
              <span className="block text-[10px] font-semibold text-slate-500">{walletLabel}</span>
              <span className="block text-xs font-bold text-slate-900 truncate">{wallet?.name}</span>
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
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && save()}
                placeholder="Note (facultatif) : ex. marché de Gambela"
                className="w-full mb-2 px-4 py-2 rounded-2xl bg-slate-100 text-sm outline-none focus:ring-2 focus:ring-[#D8FB52]"
              />
              <div className="grid grid-cols-3 gap-1.5">
                {KEYS.map((k) => (
                  <button
                    key={k}
                    onClick={() => pressKey(k)}
                    aria-label={k === 'del' ? 'Effacer' : k}
                    className="h-11 rounded-2xl bg-slate-100 active:bg-slate-200 font-bold text-lg text-slate-800 flex items-center justify-center cursor-pointer"
                  >
                    {k === 'del' ? <Delete className="w-5 h-5" /> : k === '.' ? ',' : k}
                  </button>
                ))}
              </div>
              <button
                disabled={!canSave}
                onClick={save}
                className="w-full mt-2 py-3.5 rounded-2xl bg-[#D8FB52] disabled:bg-slate-100 disabled:text-slate-400 text-slate-900 font-bold text-sm cursor-pointer disabled:cursor-default"
              >
                {saveLabel}
              </button>
            </>
          )}
        </div>
      </div>
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
