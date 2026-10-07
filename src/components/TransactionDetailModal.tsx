import React, { useState } from 'react';
import { X, Share2, Copy, Check, Pencil, Trash2, CopyPlus, ChevronLeft } from 'lucide-react';
import { Settings, Transaction, Wallet } from '../types';
import { Category, categoriesFor } from '../data/categories';
import { IconBadge } from './AppIcon';
import { convertBetween, formatMoney } from '../lib/money';
import { DateField, localDay } from './DatePicker';
import { isShared, memberOf, MemberAvatar, MemberChips, ME_ID } from './Members';
import { useDisplayPrefs } from '../lib/display';

interface TransactionDetailModalProps {
  transaction: Transaction | null;
  wallets: Wallet[];
  categories: Category[];
  settings: Settings; // taux de change, pour déplacer une opération vers un portefeuille d'une autre devise
  onClose: () => void;
  onUpdate: (id: string, changes: Partial<Transaction>) => void;
  onDelete: (tx: Transaction) => void;
  onDuplicate: (tx: Transaction) => void;
}

const typeLabel = (t: Transaction) =>
  t.type === 'transfer' ? 'Transfert' : t.type === 'adjustment' ? 'Ajustement' : t.amount > 0 ? 'Revenu' : 'Dépense';

// Nouveau jour choisi -> ISO, en gardant l'heure d'origine de l'opération (l'heure n'est plus modifiable)
const withDay = (iso: string, day: string) => {
  const d = new Date(iso);
  const [y, m, dd] = day.split('-').map(Number);
  return new Date(y, m - 1, dd, d.getHours(), d.getMinutes(), d.getSeconds()).toISOString();
};

export const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({
  transaction,
  wallets,
  categories,
  settings,
  onClose,
  onUpdate,
  onDelete,
  onDuplicate,
}) => {
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<'view' | 'edit' | 'confirmDelete'>('view');
  const [openedId, setOpenedId] = useState<string | null>(null);

  // Chaque nouvelle transaction ouverte repart en mode lecture
  if (transaction && transaction.id !== openedId) {
    setOpenedId(transaction.id);
    setMode('view');
  }
  if (!transaction) return null;

  const isPositive = transaction.amount > 0;
  const formattedAmount = `${isPositive ? '+' : '−'}${formatMoney(Math.abs(transaction.amount), transaction.currency)}`;
  const isTransfer = !!transaction.transferId;
  const wallet = wallets.find((w) => w.id === transaction.walletId);
  const counterpart = wallets.find((w) => w.id === transaction.counterpartWalletId);

  const handleCopyRef = () => {
    if (transaction.referenceNumber) {
      navigator.clipboard.writeText(transaction.referenceNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex items-center justify-between gap-3">
      <span className="text-slate-400 font-medium shrink-0">{label}</span>
      <span className="text-slate-900 font-bold text-right truncate">{value}</span>
    </div>
  );

  const actionBtn = (label: string, Icon: typeof Pencil, onClick: () => void, danger = false) => (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-1 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-[12px] font-bold cursor-pointer transition ${
        danger ? 'text-red-600' : 'text-slate-700'
      }`}
    >
      <Icon className="w-4 h-4" />
      {label}
    </button>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 animate-fade-in" onClick={onClose}>
      <div
        className="w-full sm:max-w-md max-h-[100dvh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl relative animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head flex items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            {mode === 'edit' && (
              <button onClick={() => setMode('view')} aria-label="Retour" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
              {mode === 'edit' ? 'Modifier la transaction' : 'Détail de la transaction'}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {mode === 'edit' ? (
          <EditForm
            tx={transaction}
            wallets={wallets}
            settings={settings}
            categories={categories}
            onCancel={() => setMode('view')}
            onSave={(changes) => {
              onUpdate(transaction.id, changes);
              setMode('view');
            }}
          />
        ) : (
          <>
            <div className="text-center py-3 border-b border-slate-100">
              <div className="flex justify-center mb-2">
                <IconBadge
                  icon={transaction.avatarType === 'icon' ? transaction.avatarValue : ''}
                  image={transaction.avatarType === 'image' ? transaction.avatarValue : undefined}
                  color={transaction.color}
                  size="lg"
                />
              </div>
              <div className={`text-3xl font-extrabold tabular-nums ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>{formattedAmount}</div>
              <p className="text-sm font-bold text-slate-800 mt-1">{transaction.title}</p>
            </div>

            <div className="py-3 space-y-2.5 text-xs border-b border-slate-100">
              {row('Type', typeLabel(transaction))}
              {transaction.originalAmount !== undefined &&
                transaction.originalCurrency &&
                row('Montant saisi', formatMoney(transaction.originalAmount, transaction.originalCurrency))}
              {row('Catégorie', transaction.category)}
              {row('Date', new Date(transaction.createdAt).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}
              {row('Portefeuille', wallet?.name ?? '—')}
              {(isShared(wallet) || transaction.memberId) &&
                row(
                  isPositive ? 'Versé par' : 'Fait par',
                  <span className="inline-flex items-center gap-1.5">
                    <MemberAvatar {...memberOf(wallet, transaction.memberId)} size="xs" />
                    {memberOf(wallet, transaction.memberId).name}
                  </span>
                )}
              {transaction.withPerson && row('Avec', transaction.withPerson)}
              {!!transaction.interest && row('Intérêts prévus', formatMoney(transaction.interest, transaction.currency))}
              {transaction.excludeFromReport && row('Rapport', 'Exclue des statistiques')}
              {counterpart && row(isPositive ? 'Venant de' : 'Envoyé vers', counterpart.name)}
              {transaction.referenceNumber && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-medium">Référence</span>
                  <div className="flex items-center gap-1">
                    <span className="text-slate-900 font-mono font-bold">{transaction.referenceNumber}</span>
                    <button onClick={handleCopyRef} className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer" title="Copier la référence">
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {mode === 'confirmDelete' ? (
              <div className="mt-3 p-3 rounded-2xl bg-red-50">
                <p className="text-sm text-slate-700 mb-2">
                  {isTransfer
                    ? 'Supprimer ce transfert ? Les deux côtés (et les frais) seront supprimés, les soldes reviennent comme avant.'
                    : 'Supprimer cette transaction ? Le solde du portefeuille sera recalculé.'}
                </p>
                <div className="flex gap-2">
                  <button onClick={() => setMode('view')} className="flex-1 py-2.5 rounded-xl bg-white text-sm font-semibold cursor-pointer">
                    Annuler
                  </button>
                  <button onClick={() => onDelete(transaction)} className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold cursor-pointer">
                    Supprimer
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="pt-3 flex gap-2">
                  {actionBtn('Modifier', Pencil, () => setMode('edit'))}
                  {actionBtn('Dupliquer', CopyPlus, () => onDuplicate(transaction))}
                  {actionBtn(
                    'Partager',
                    Share2,
                    () => {
                      if (navigator.share) {
                        navigator
                          .share({
                            title: `Reçu : ${transaction.title}`,
                            text: `Transaction ${formattedAmount} : ${transaction.title}${transaction.referenceNumber ? ` (${transaction.referenceNumber})` : ''}`,
                          })
                          .catch(() => {});
                      } else handleCopyRef();
                    }
                  )}
                  {actionBtn('Supprimer', Trash2, () => setMode('confirmDelete'), true)}
                </div>
                <button
                  onClick={onClose}
                  className="w-full mt-2 py-3 rounded-xl bg-accent hover:bg-accent-hover text-slate-900 text-sm font-bold cursor-pointer"
                >
                  Fermer
                </button>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ---------- Formulaire de modification (tient sur un écran) ----------
const EditForm: React.FC<{
  tx: Transaction;
  wallets: Wallet[];
  categories: Category[];
  onCancel: () => void;
  settings: Settings;
  onSave: (changes: Partial<Transaction>) => void;
}> = ({ tx, wallets, categories, settings, onCancel, onSave }) => {
  const isOut = tx.amount < 0;
  // Transferts et ajustements n'ont pas de catégorie ni de changement de portefeuille
  const simple = tx.type !== 'transfer' && tx.type !== 'adjustment';
  const choices = simple ? categoriesFor(isOut ? 'expense' : 'income', categories) : [];
  const nameOf = (c: Category) => {
    const parent = c.parentId ? categories.find((p) => p.id === c.parentId) : null;
    return parent ? `${parent.name} › ${c.name}` : c.name;
  };
  // Tous les portefeuilles (non archivés). Autre devise : le montant est converti avec le taux des Paramètres.
  const walletChoices = wallets.filter((w) => !w.archived || w.id === tx.walletId);

  const [amount, setAmount] = useState(String(Math.abs(tx.amount)));
  const [title, setTitle] = useState(tx.title);
  const [categoryId, setCategoryId] = useState(tx.categoryId ?? '');
  const [walletId, setWalletId] = useState(tx.walletId);
  const [day, setDay] = useState(localDay(new Date(tx.createdAt)));
  const [memberId, setMemberId] = useState(tx.memberId ?? ME_ID);
  const [person, setPerson] = useState(tx.withPerson ?? '');
  const [exclude, setExclude] = useState(!!tx.excludeFromReport);
  const { excludeOption } = useDisplayPrefs();
  const isDebt = categories.find((c) => c.id === (categoryId || tx.categoryId))?.type === 'debt';
  const editWallet = wallets.find((w) => w.id === walletId);

  const value = parseFloat(amount.replace(/\s/g, '').replace(',', '.'));
  // Portefeuille d'une autre devise : montant converti (null = taux manquant)
  const otherCurrency = !!editWallet && editWallet.currency !== tx.currency;
  const converted = otherCurrency && value > 0 ? convertBetween(value, tx.currency, editWallet!.currency, settings) : null;
  const rateMissing = otherCurrency && value > 0 && converted === null;
  const valid = value > 0 && title.trim() !== '' && !!day && !rateMissing;

  const save = () => {
    const changes: Partial<Transaction> = {
      amount: isOut ? -value : value,
      title: title.trim(),
      walletId,
      createdAt: withDay(tx.createdAt, day),
      memberId: isShared(editWallet) && memberId !== ME_ID ? memberId : undefined,
      withPerson: isDebt ? person.trim() || undefined : tx.withPerson,
      excludeFromReport: simple && exclude ? true : undefined,
    };
    if (otherCurrency && converted !== null) {
      // Déplacée vers un portefeuille d'une autre devise : montant converti, montant tapé gardé comme « d'origine »
      changes.amount = (isOut ? -1 : 1) * Math.round(converted * 100) / 100;
      changes.currency = editWallet!.currency;
      changes.originalAmount = value;
      changes.originalCurrency = tx.currency;
    } else if (value !== Math.abs(tx.amount)) {
      // Le montant d'origine (autre devise) ne correspond plus
      changes.originalAmount = undefined;
      changes.originalCurrency = undefined;
    }
    const cat = categories.find((c) => c.id === categoryId);
    if (simple && cat && cat.id !== tx.categoryId) {
      changes.categoryId = cat.id;
      changes.category = cat.name;
      changes.avatarType = cat.image ? 'image' : 'icon';
      changes.avatarValue = cat.image ?? cat.icon;
      changes.color = cat.color;
      if (tx.title === tx.category && title.trim() === tx.title) changes.title = cat.name;
    }
    onSave(changes);
  };

  const field = 'w-full mt-1 px-4 py-2.5 rounded-2xl bg-slate-100 text-sm outline-none focus:ring-2 focus:ring-accent';
  const label = 'block text-xs font-semibold text-slate-500 mt-3';

  return (
    <div>
      <label className={label}>
        Montant ({tx.currency}) · {isOut ? 'sortie' : 'entrée'}
      </label>
      <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${field} text-lg font-bold tabular-nums`} />

      <label className={label}>Titre</label>
      <input value={title} onChange={(e) => setTitle(e.target.value)} className={field} />

      {simple && (
        <>
          <label className={label}>Catégorie</label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className={field}>
            {!tx.categoryId && <option value="">{tx.category}</option>}
            {choices.map((c) => (
              <option key={c.id} value={c.id}>
                {nameOf(c)}
              </option>
            ))}
          </select>
        </>
      )}

      {simple && walletChoices.length > 1 && (
        <>
          <label className={label}>Portefeuille</label>
          <select value={walletId} onChange={(e) => setWalletId(e.target.value)} className={field}>
            {walletChoices.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.currency})
              </option>
            ))}
          </select>
          {converted !== null && (
            <p className="text-xs text-slate-500 mt-1">
              Converti : {formatMoney(Math.abs(converted), editWallet!.currency)} dans ce portefeuille (taux de tes Paramètres).
            </p>
          )}
          {rateMissing && (
            <p className="text-xs text-amber-600 mt-1">
              Taux {tx.currency} → {editWallet!.currency} manquant : ajoute-le dans Paramètres › Taux de change.
            </p>
          )}
        </>
      )}

      {isDebt && (
        <>
          <label className={label}>Avec qui ?</label>
          <input value={person} onChange={(e) => setPerson(e.target.value)} placeholder="ex. Kemy" className={field} />
        </>
      )}

      {isShared(editWallet) && (
        <div className="mt-3">
          <MemberChips wallet={editWallet} value={memberId} onChange={setMemberId} label={isOut ? 'Fait par' : 'Versé par'} />
        </div>
      )}

      {simple && (excludeOption || tx.excludeFromReport) && (
        <label className="flex items-center justify-between gap-3 mt-3 cursor-pointer">
          <span>
            <span className="block text-sm font-semibold text-slate-700">Exclure du rapport</span>
            <span className="block text-xs text-slate-400">Compte dans le solde, mais pas dans les statistiques ni les budgets.</span>
          </span>
          <input type="checkbox" role="switch" checked={exclude} onChange={(e) => setExclude(e.target.checked)} className="toggle shrink-0" />
        </label>
      )}

      <label className={label}>Date</label>
      <DateField value={day} onChange={setDay} shortcuts="past" label="Date" className="mb-1" />

      {tx.transferId && <p className="text-[12px] text-slate-400 mt-2">La date s'applique aux deux côtés du transfert.</p>}

      <div className="flex gap-2 mt-4">
        <button onClick={onCancel} className="flex-1 py-3 rounded-xl bg-slate-100 text-sm font-semibold cursor-pointer">
          Annuler
        </button>
        <button
          disabled={!valid}
          onClick={save}
          className="flex-[2] py-3 rounded-xl bg-accent disabled:opacity-40 text-slate-900 text-sm font-bold cursor-pointer"
        >
          Enregistrer
        </button>
      </div>
    </div>
  );
};
