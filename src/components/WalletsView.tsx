import React, { useState } from 'react';
import { Plus, Pencil, Trash2, X, ArchiveRestore, Archive, ChevronLeft, CircleHelp, ArrowLeftRight, SlidersHorizontal, ArrowDown, ArrowUpDown, GripVertical, ChevronUp, ChevronDown } from 'lucide-react';
import { SortableList } from './SortableList';
import { Settings, Transaction, Wallet, WalletKind } from '../types';
import { TransactionItem } from './TransactionItem';
import { AppIcon, IconBadge, WALLET_ICON_CHOICES } from './AppIcon';
import { IconPicker, COLOR_CHOICES } from './IconPicker';
import { CurrencyPicker } from './CurrencyPicker';
import { currencyInfo } from '../data/currencies';
import { convertBetween, countsInStats, formatMoney, walletBalance } from '../lib/money';
import { isShared, MembersSheet, MemberStack, SharingBlock, activeMembers, memberOf, MemberAvatar, ME_ID } from './Members';

interface WalletsViewProps {
  wallets: Wallet[];
  transactions: Transaction[];
  defaultCurrency: string;
  onAdd: (w: Omit<Wallet, 'id' | 'archived'>) => void;
  onUpdate: (id: string, changes: Partial<Wallet>) => void;
  onDelete: (id: string) => void;
  onSelectTransaction: (tx: Transaction) => void;
  onTransfer: (fromId: string, toId: string, fromAmount: number, toAmount: number, note: string, fee: number) => void;
  onAdjustBalance: (walletId: string, newBalance: number) => void;
  onReorder: (ids: string[]) => void;
  settings: Settings;
}

export const WalletsView: React.FC<WalletsViewProps> = ({ wallets, transactions, defaultCurrency, onAdd, onUpdate, onDelete, onSelectTransaction, onTransfer, onAdjustBalance, onReorder, settings }) => {
  const [editing, setEditing] = useState<Wallet | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Wallet | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [transferFrom, setTransferFrom] = useState<string | null>(null); // id, ou '' = à choisir
  const [adjusting, setAdjusting] = useState<Wallet | null>(null);
  const [sharing, setSharing] = useState<Wallet | null>(null);
  const [reordering, setReordering] = useState(false);
  const viewing = wallets.find((w) => w.id === viewingId) ?? null;

  const active = wallets.filter((w) => !w.archived);
  const archived = wallets.filter((w) => w.archived);

  const card = (w: Wallet) => (
    <div
      key={w.id}
      role="button"
      tabIndex={0}
      onClick={() => setViewingId(w.id)}
      onKeyDown={(e) => e.key === 'Enter' && setViewingId(w.id)}
      className={`bg-white rounded-3xl border border-slate-100 p-4 flex items-center gap-3 cursor-pointer hover:bg-slate-50 active:scale-[0.99] transition ${w.archived ? 'opacity-70' : ''}`}
    >
      <IconBadge icon={w.icon} image={w.image} color={w.color} />
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-semibold text-slate-900 truncate">{w.name}</div>
        <div className="text-sm font-bold tabular-nums text-slate-700">
          {formatMoney(walletBalance(w, transactions), w.currency)}
        </div>
        <WalletProgress wallet={w} balance={walletBalance(w, transactions)} />
        {isShared(w) && (
          <span className="flex items-center gap-1.5 mt-1.5 text-[11px] font-semibold text-slate-500">
            <MemberStack wallet={w} /> Partagé à {activeMembers(w).length + 1}
          </span>
        )}
        {!w.includeInTotal && (
          <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[11px] font-semibold">
            Exclu du total
          </span>
        )}
      </div>
      {w.archived && (
        <button
          onClick={(e) => { e.stopPropagation(); onUpdate(w.id, { archived: false }); }}
          aria-label={`Restaurer ${w.name}`}
          className="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer"
        >
          <ArchiveRestore className="w-4 h-4" />
        </button>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); setEditing(w); }}
        aria-label={`Modifier ${w.name}`}
        className="w-9 h-9 rounded-full hover:bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer"
      >
        <Pencil className="w-4 h-4" />
      </button>
      <button
        onClick={(e) => { e.stopPropagation(); setDeleting(w); }}
        aria-label={`Supprimer ${w.name}`}
        className="w-9 h-9 rounded-full hover:bg-red-50 text-slate-400 hover:text-red-500 flex items-center justify-center cursor-pointer"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );

  const sheets = (
    <>
      {transferFrom !== null && (
        <TransferSheet
          wallets={active}
          initialFromId={transferFrom || active[0]?.id}
          transactions={transactions}
          settings={settings}
          onClose={() => setTransferFrom(null)}
          onConfirm={(...args) => {
            onTransfer(...args);
            setTransferFrom(null);
          }}
        />
      )}

      {adjusting && (
        <AdjustSheet
          wallet={adjusting}
          current={walletBalance(adjusting, transactions)}
          onClose={() => setAdjusting(null)}
          onConfirm={(v) => {
            onAdjustBalance(adjusting.id, v);
            setAdjusting(null);
          }}
        />
      )}
      {sharing && (
        <MembersSheet
          wallet={sharing}
          onClose={() => setSharing(null)}
          onSave={(members) => {
            onUpdate(sharing.id, { members });
            setSharing(null);
          }}
        />
      )}
      {editing && (
        <WalletSheet
          wallet={editing === 'new' ? null : editing}
          hasTransactions={editing !== 'new' && transactions.some((t) => t.walletId === editing.id)}
          defaultCurrency={defaultCurrency}
          onClose={() => setEditing(null)}
          onSave={(data) => {
            if (editing === 'new') onAdd(data);
            else onUpdate(editing.id, data);
            setEditing(null);
          }}
        />
      )}

      {deleting && (
        <DeleteDialog
          wallet={deleting}
          txCount={transactions.filter((t) => t.walletId === deleting.id).length}
          onClose={() => setDeleting(null)}
          onArchive={() => {
            onUpdate(deleting.id, { archived: true });
            setDeleting(null);
          }}
          onDelete={() => {
            onDelete(deleting.id);
            setDeleting(null);
            setViewingId(null);
          }}
        />
      )}
    </>
  );

  if (viewing) {
    return (
      <>
        <WalletDetail
          wallet={viewing}
          transactions={transactions.filter((t) => t.walletId === viewing.id)}
          onBack={() => setViewingId(null)}
          onEdit={() => setEditing(viewing)}
          onDelete={() => setDeleting(viewing)}
          onRestore={() => onUpdate(viewing.id, { archived: false })}
          onTransfer={active.length > 1 && !viewing.archived ? () => setTransferFrom(viewing.id) : undefined}
          onAdjust={() => setAdjusting(viewing)}
          onShare={() => setSharing(viewing)}
          onSelectTransaction={onSelectTransaction}
        />
        {sheets}
      </>
    );
  }

  return (
    <div className="px-5 pt-4 pb-8 animate-screen">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-xl font-bold text-slate-900">Portefeuilles</h1>
        {active.length > 1 && (
          <button
            onClick={() => setReordering((r) => !r)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-full text-xs font-bold cursor-pointer transition ${
              reordering ? 'bg-[#D8FB52] text-slate-900' : 'bg-white border border-slate-100 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {reordering ? 'Terminé' : <><ArrowUpDown className="w-3.5 h-3.5" /> Réorganiser</>}
          </button>
        )}
      </div>

      {reordering ? (
        <>
          <p className="text-xs text-slate-500 mb-3">
            Maintiens un portefeuille et fais-le glisser, ou utilise les flèches. Cet ordre est repris partout dans l'app.
          </p>
          <SortableList
            items={active}
            getId={(w) => w.id}
            onChange={onReorder}
            renderItem={(w, { index, dragging, move }) => (
              <div
                className={`bg-white rounded-2xl border p-2.5 pl-2 flex items-center gap-2.5 transition-shadow ${
                  dragging ? 'shadow-xl border-slate-300 scale-[1.02]' : 'border-slate-100'
                }`}
              >
                <GripVertical className="w-5 h-5 text-slate-400 shrink-0" aria-hidden />
                <IconBadge icon={w.icon} image={w.image} color={w.color} size="sm" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-900 truncate">{w.name}</div>
                  <div className="text-xs font-semibold tabular-nums text-slate-500">{formatMoney(walletBalance(w, transactions), w.currency)}</div>
                </div>
                <button
                  onClick={() => move(-1)}
                  disabled={index === 0}
                  aria-label={`Monter ${w.name}`}
                  className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:cursor-default"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => move(1)}
                  disabled={index === active.length - 1}
                  aria-label={`Descendre ${w.name}`}
                  className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer disabled:opacity-30 disabled:cursor-default"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>
            )}
          />
        </>
      ) : (
        <>
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setEditing('new')}
              className="flex-1 py-3.5 rounded-3xl bg-white border border-slate-100 text-emerald-700 font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer hover:bg-slate-50"
            >
              <span className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center">
                <Plus className="w-4 h-4" />
              </span>
              Ajouter
            </button>
            {active.length > 1 && (
              <button
                onClick={() => setTransferFrom('')}
                className="flex-1 py-3.5 rounded-3xl bg-white border border-slate-100 text-slate-700 font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer hover:bg-slate-50"
              >
                <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center">
                  <ArrowLeftRight className="w-3.5 h-3.5" />
                </span>
                Transférer
              </button>
            )}
          </div>

          <div className="space-y-3">
            {active.map(card)}
            {active.length === 0 && <p className="text-center text-sm text-slate-400 py-6">Aucun portefeuille actif</p>}
          </div>

          {archived.length > 0 && (
            <>
              <h2 className="text-sm font-bold text-slate-500 mt-6 mb-3">Archivés</h2>
              <div className="space-y-3">{archived.map(card)}</div>
            </>
          )}
        </>
      )}

      {sheets}
    </div>
  );
};

// ---------- Barre de progression (crédit utilisé / objectif atteint) ----------
const WalletProgress: React.FC<{ wallet: Wallet; balance: number }> = ({ wallet: w, balance }) => {
  let ratio: number;
  let label: string;
  let bar: string;
  if (w.kind === 'credit' && w.creditLimit) {
    const used = Math.max(0, -balance);
    ratio = used / w.creditLimit;
    label = `Disponible ${formatMoney(Math.max(0, w.creditLimit - used), w.currency)} sur ${formatMoney(w.creditLimit, w.currency)}`;
    bar = ratio >= 0.9 ? 'bg-red-500' : ratio >= 0.7 ? 'bg-amber-500' : 'bg-pink-500';
  } else if (w.kind === 'goal' && w.goalAmount) {
    ratio = Math.max(0, balance) / w.goalAmount;
    const date = w.goalDate ? ` · d'ici le ${new Date(w.goalDate + 'T00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}` : '';
    label = ratio >= 1 ? `Objectif atteint 🎉${date}` : `${Math.round(ratio * 100)} % de ${formatMoney(w.goalAmount, w.currency)}${date}`;
    bar = ratio >= 1 ? 'bg-emerald-500' : 'bg-red-400';
  } else return null;
  return (
    <div className="mt-1.5">
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full animate-bar ${bar}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
      <div className="text-[11px] leading-snug text-slate-500 mt-1">{label}</div>
    </div>
  );
};

// ---------- Confirmation de suppression ----------
const DeleteDialog: React.FC<{
  wallet: Wallet;
  txCount: number;
  onClose: () => void;
  onArchive: () => void;
  onDelete: () => void;
}> = ({ wallet, txCount, onClose, onArchive, onDelete }) => (
  <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
    <div className="w-full sm:max-w-[400px] bg-white rounded-t-[32px] sm:rounded-[32px] p-6 pb-8 animate-slide-up" onClick={(e) => e.stopPropagation()}>
      <h2 className="text-base font-bold mb-2">Supprimer « {wallet.name} » ?</h2>
      {txCount > 0 ? (
        <p className="text-sm text-slate-600 mb-5">
          Ce portefeuille contient {txCount} transaction{txCount > 1 ? 's' : ''}. Tu peux l'archiver : il disparaît du total et de la liste, mais ton historique est gardé.
        </p>
      ) : (
        <p className="text-sm text-slate-600 mb-5">Cette action est définitive.</p>
      )}
      {txCount > 0 && (
        <button onClick={onArchive} className="w-full mb-2 py-3.5 rounded-2xl bg-[#D8FB52] font-bold text-sm flex items-center justify-center gap-2 cursor-pointer">
          <Archive className="w-4 h-4" /> Archiver
        </button>
      )}
      <button onClick={onDelete} className="w-full mb-2 py-3.5 rounded-2xl bg-red-50 text-red-600 font-bold text-sm cursor-pointer">
        {txCount > 0 ? `Supprimer avec ses ${txCount} transactions` : 'Supprimer'}
      </button>
      <button onClick={onClose} className="w-full py-3 rounded-2xl bg-slate-100 font-semibold text-sm cursor-pointer">
        Annuler
      </button>
    </div>
  </div>
);


// ---------- Types de portefeuille ----------
const KINDS: {
  id: WalletKind | 'linked';
  title: string;
  hint: string;
  help: string;
  icon: string;
  bg: string;
  color: string;
}[] = [
  {
    id: 'basic',
    title: 'Portefeuille de base',
    hint: 'Cash, Mobile Money…',
    help: "Pour l'argent que tu as : espèces, Mobile Money, compte bancaire. Tu notes toi-même tes dépenses et revenus.",
    icon: 'Wallet',
    bg: 'bg-emerald-500',
    color: '#059669',
  },
  {
    id: 'linked',
    title: 'Portefeuille lié',
    hint: 'Bientôt disponible',
    help: 'Relié directement à ta banque ou ton opérateur pour importer les transactions automatiquement. Pas encore disponible.',
    icon: 'Landmark',
    bg: 'bg-teal-400',
    color: '#14B8A6',
  },
  {
    id: 'credit',
    title: 'Portefeuille de crédit',
    hint: 'Carte ou ligne de crédit',
    help: "Pour une carte de crédit ou un crédit avec une limite. Tu vois combien tu as utilisé et combien il te reste.",
    icon: 'CreditCard',
    bg: 'bg-pink-500',
    color: '#EC4899',
  },
  {
    id: 'goal',
    title: "Objectif d'épargne",
    hint: 'Mettre de côté pour un projet',
    help: "Pour épargner vers un montant (une moto, un loyer, un mariage…). Tu suis ta progression jusqu'à l'objectif.",
    icon: 'Target',
    bg: 'bg-red-400',
    color: '#EF4444',
  },
];

const KindPicker: React.FC<{ onPick: (k: WalletKind) => void; onClose: () => void }> = ({ onPick, onClose }) => {
  const [help, setHelp] = useState<string | null>(null);
  const helpKind = KINDS.find((k) => k.id === help);
  return (
    <div className="p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold">Quel type de portefeuille ?</h2>
        <button onClick={onClose} aria-label="Fermer" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {KINDS.map((k) => {
          const disabled = k.id === 'linked';
          return (
            <div key={k.id} className="relative">
              <button
                disabled={disabled}
                onClick={() => onPick(k.id as WalletKind)}
                className={`relative w-full aspect-square overflow-hidden rounded-3xl p-4 text-left text-white ${k.bg} ${
                  disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-[0.97] transition-transform'
                }`}
              >
                <div className="text-[15px] font-bold leading-tight pr-7">{k.title}</div>
                <div className="text-[11px] font-medium text-white/85 mt-1 pr-2">{k.hint}</div>
                <AppIcon name={k.icon} className="absolute -right-3 -bottom-3 w-24 h-24 text-black/15" />
              </button>
              <button
                onClick={() => setHelp(help === k.id ? null : k.id)}
                aria-label={`C'est quoi : ${k.title} ?`}
                className="absolute top-3 right-3 w-6 h-6 rounded-full bg-black/15 text-white flex items-center justify-center cursor-pointer"
              >
                <CircleHelp className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
      {helpKind && (
        <p className="mt-4 p-4 rounded-2xl bg-slate-100 text-sm text-slate-700 animate-fade-in">
          <span className="font-bold">{helpKind.title} : </span>
          {helpKind.help}
        </p>
      )}
    </div>
  );
};

// ---------- Fenêtre "Ajouter / modifier un portefeuille" ----------
const WalletSheet: React.FC<{
  wallet: Wallet | null;
  hasTransactions: boolean;
  defaultCurrency: string;
  onClose: () => void;
  onSave: (data: Omit<Wallet, 'id' | 'archived'>) => void;
}> = ({ wallet, hasTransactions, defaultCurrency, onClose, onSave }) => {
  const [kind, setKind] = useState<WalletKind | null>(wallet ? wallet.kind ?? 'basic' : null);
  const [name, setName] = useState(wallet?.name ?? '');
  const [icon, setIcon] = useState(wallet?.icon ?? WALLET_ICON_CHOICES[0]);
  const [image, setImage] = useState<string | undefined>(wallet?.image);
  const [color, setColor] = useState(wallet?.color ?? COLOR_CHOICES[8]);
  const [currency, setCurrency] = useState(wallet?.currency ?? defaultCurrency);
  // Crédit : on saisit le montant déjà utilisé (positif), stocké en solde négatif
  const [balance, setBalance] = useState(
    String(wallet ? (wallet.kind === 'credit' ? -wallet.initialBalance : wallet.initialBalance) : 0)
  );
  const [limit, setLimit] = useState(wallet?.creditLimit ? String(wallet.creditLimit) : '');
  const [goal, setGoal] = useState(wallet?.goalAmount ? String(wallet.goalAmount) : '');
  const [goalDate, setGoalDate] = useState(wallet?.goalDate ?? '');
  const [include, setInclude] = useState(wallet?.includeInTotal ?? true);
  const [showCurrencies, setShowCurrencies] = useState(false);

  const num = (s: string) => parseFloat(s.replace(',', '.'));
  const parsedBalance = num(balance);
  const parsedLimit = num(limit);
  const parsedGoal = num(goal);
  const valid =
    name.trim() !== '' &&
    Number.isFinite(parsedBalance) &&
    (kind !== 'credit' || parsedLimit > 0) &&
    (kind !== 'goal' || parsedGoal > 0);

  const pickKind = (k: WalletKind) => {
    const def = KINDS.find((x) => x.id === k)!;
    setKind(k);
    setIcon(def.icon);
    setColor(def.color);
  };

  const kindInfo = KINDS.find((k) => k.id === kind);
  const inputCls =
    'w-full mt-1 mb-4 px-4 py-3 rounded-2xl bg-slate-100 text-sm outline-none focus:ring-2 focus:ring-[#D8FB52] tabular-nums';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
      <div className="w-full sm:max-w-[420px] max-h-[90dvh] flex flex-col bg-white rounded-t-[32px] sm:rounded-[32px] animate-slide-up" onClick={(e) => e.stopPropagation()}>
        {kind === null ? (
          <KindPicker onPick={pickKind} onClose={onClose} />
        ) : (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto p-5 pb-3">
              <div className="flex items-center justify-between mb-4 gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {!wallet && (
                    <button onClick={() => setKind(null)} aria-label="Changer de type" className="w-9 h-9 shrink-0 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  )}
                  <div className="min-w-0">
                    <h2 className="text-base font-bold truncate">{wallet ? 'Modifier le portefeuille' : 'Nouveau portefeuille'}</h2>
                    <p className="text-xs text-slate-500">{kindInfo?.title}</p>
                  </div>
                </div>
                <button onClick={onClose} aria-label="Fermer" className="w-9 h-9 shrink-0 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-3 mb-4">
                <IconBadge icon={icon} image={image} color={color} size="lg" />
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={kind === 'goal' ? 'Nom (ex. Nouvelle moto)' : kind === 'credit' ? 'Nom (ex. Carte Visa)' : 'Nom (ex. Airtel Money)'}
                  className="flex-1 px-4 py-3 rounded-2xl bg-slate-100 text-sm outline-none focus:ring-2 focus:ring-[#D8FB52]"
                />
              </div>

              <IconPicker choices={WALLET_ICON_CHOICES} icon={icon} image={image} color={color} onIcon={setIcon} onImage={setImage} />

              <label className="text-xs font-semibold text-slate-500">Couleur</label>
              <div className="flex gap-2 mt-1 mb-4">
                {COLOR_CHOICES.map((col) => (
                  <button
                    key={col}
                    onClick={() => setColor(col)}
                    aria-label={`Couleur ${col}`}
                    className={`w-7 h-7 rounded-full cursor-pointer ${color === col ? 'ring-2 ring-offset-2 ring-slate-900' : ''}`}
                    style={{ backgroundColor: col }}
                  />
                ))}
              </div>

              <label className="text-xs font-semibold text-slate-500">Devise</label>
              {hasTransactions ? (
                <p className="mt-1 mb-4 px-4 py-3 rounded-2xl bg-slate-100 text-sm text-slate-500">
                  {currencyInfo(currency).flag} {currency} · ne peut plus changer (il y a des transactions)
                </p>
              ) : (
                <div className="mt-1 mb-4">
                  <button
                    onClick={() => setShowCurrencies((s) => !s)}
                    className="w-full px-4 py-3 rounded-2xl bg-slate-100 text-sm font-semibold text-left cursor-pointer"
                  >
                    {currencyInfo(currency).flag} {currency} · {currencyInfo(currency).country}
                  </button>
                  {showCurrencies && (
                    <div className="mt-2">
                      <CurrencyPicker value={currency} onChange={(c) => { if (c) { setCurrency(c); setShowCurrencies(false); } }} />
                    </div>
                  )}
                </div>
              )}

              {kind === 'credit' && (
                <>
                  <label className="text-xs font-semibold text-slate-500">Limite de crédit</label>
                  <input inputMode="decimal" value={limit} onChange={(e) => setLimit(e.target.value)} placeholder="ex. 500" className={inputCls} />
                  <label className="text-xs font-semibold text-slate-500">Déjà utilisé (ce que tu dois aujourd'hui)</label>
                  <input inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} className={inputCls} />
                </>
              )}

              {kind === 'goal' && (
                <>
                  <label className="text-xs font-semibold text-slate-500">Montant à atteindre</label>
                  <input inputMode="decimal" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="ex. 1200" className={inputCls} />
                  <label className="text-xs font-semibold text-slate-500">Déjà épargné</label>
                  <input inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} className={inputCls} />
                  <label className="text-xs font-semibold text-slate-500">Date visée (facultatif)</label>
                  <input type="date" value={goalDate} onChange={(e) => setGoalDate(e.target.value)} className={inputCls} />
                </>
              )}

              {kind === 'basic' && (
                <>
                  <label className="text-xs font-semibold text-slate-500">Solde de départ</label>
                  <input inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} className={inputCls} />
                </>
              )}

              <div className="flex items-center justify-between mb-5">
                <span className="text-sm font-semibold text-slate-700">Inclure dans le total</span>
                <button
                  role="switch"
                  aria-checked={include}
                  onClick={() => setInclude((v) => !v)}
                  className={`w-12 h-7 rounded-full p-0.5 transition cursor-pointer ${include ? 'bg-emerald-500' : 'bg-slate-300'}`}
                >
                  <span className={`block w-6 h-6 rounded-full bg-white shadow transition-transform ${include ? 'translate-x-5' : ''}`} />
                </button>
              </div>
            </div>

            <div className="p-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] border-t border-slate-100">
              <button
                disabled={!valid}
                onClick={() =>
                  onSave({
                    name: name.trim(),
                    icon,
                    image,
                    color,
                    currency,
                    initialBalance: kind === 'credit' ? -parsedBalance : parsedBalance,
                    includeInTotal: include,
                    kind,
                    creditLimit: kind === 'credit' ? parsedLimit : undefined,
                    goalAmount: kind === 'goal' ? parsedGoal : undefined,
                    goalDate: kind === 'goal' && goalDate ? goalDate : undefined,
                  })
                }
                className="w-full py-3.5 rounded-2xl bg-[#D8FB52] disabled:opacity-40 font-bold text-sm cursor-pointer"
              >
                {wallet ? 'Enregistrer' : 'Créer le portefeuille'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// Résumé propre au type (crédit : utilisé / disponible ; objectif : progression, date, rythme).
// Utilisé dans le détail du portefeuille et sur l'accueil.
export const WalletKindSummary: React.FC<{ wallet: Wallet; balance: number }> = ({ wallet: w, balance }) => {
  const money = (v: number) => formatMoney(v, w.currency);
  const kind = w.kind ?? 'basic';
  const now = new Date();
  // Bloc propre au type de portefeuille
  if (kind === 'credit' && w.creditLimit) {
    const used = Math.max(0, -balance);
    const ratio = used / w.creditLimit;
    return (
      <>
        <div className="flex gap-3 mb-3">
          <Stat label="Utilisé" value={money(used)} />
          <Stat label="Disponible" value={money(Math.max(0, w.creditLimit - used))} tone="text-emerald-600" />
          <Stat label="Limite" value={money(w.creditLimit)} />
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className={`h-full rounded-full animate-bar ${ratio >= 0.9 ? 'bg-red-500' : ratio >= 0.7 ? 'bg-amber-500' : 'bg-pink-500'}`}
            style={{ width: `${Math.min(100, ratio * 100)}%` }}
          />
        </div>
        <p className="text-xs text-slate-500 mt-2">
          {ratio >= 1 ? 'Limite atteinte.' : `Tu as utilisé ${Math.round(ratio * 100)} % de ta limite.`}
        </p>
      </>
    );
  } else if (kind === 'goal' && w.goalAmount) {
    const saved = Math.max(0, balance);
    const left = Math.max(0, w.goalAmount - saved);
    const ratio = saved / w.goalAmount;
    let pace = '';
    if (w.goalDate && left > 0) {
      const end = new Date(w.goalDate + 'T00:00');
      const days = Math.ceil((end.getTime() - now.getTime()) / 86400000);
      const months = Math.max(1, (end.getFullYear() - now.getFullYear()) * 12 + end.getMonth() - now.getMonth());
      const when = end.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
      pace =
        days < 0
          ? `La date visée (${when}) est passée.`
          : `Date visée : ${when} (dans ${days} jour${days > 1 ? 's' : ''}). Mets de côté environ ${money(left / months)} par mois.`;
    }
    return (
      <>
        <div className="flex gap-3 mb-3">
          <Stat label="Épargné" value={money(saved)} tone="text-emerald-600" />
          <Stat label="Reste" value={money(left)} />
          <Stat label="Objectif" value={money(w.goalAmount)} />
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div className={`h-full rounded-full animate-bar ${ratio >= 1 ? 'bg-emerald-500' : 'bg-red-400'}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
        </div>
        <p className="text-xs text-slate-500 mt-2">
          {ratio >= 1 ? 'Objectif atteint 🎉' : `${Math.round(ratio * 100)} % de l'objectif.`} {pace}
        </p>
      </>
    );
  }

  return null;
};

// Carte de l'accueil quand un portefeuille crédit / objectif est sélectionné
export const HomeWalletCard: React.FC<{ wallet: Wallet; transactions: Transaction[] }> = ({ wallet, transactions }) => {
  const kind = wallet.kind ?? 'basic';
  const shared = isShared(wallet);
  if (kind === 'basic' && !shared) return null;
  const info = KINDS.find((k) => k.id === kind)!;
  return (
    <div className="bg-white rounded-3xl border border-slate-100 p-4">
      <div className="flex items-center gap-2.5 mb-3">
        <IconBadge icon={wallet.icon} image={wallet.image} color={wallet.color} size="sm" />
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-900 truncate">{wallet.name}</div>
          <div className="text-[11px] font-semibold text-slate-500">{info.title}{shared && ` · partagé à ${activeMembers(wallet).length + 1}`}</div>
        </div>
        {shared && (
          <span className="ml-auto">
            <MemberStack wallet={wallet} size="sm" />
          </span>
        )}
      </div>
      <WalletKindSummary wallet={wallet} balance={walletBalance(wallet, transactions)} />
      {shared && <SharedMonthLine wallet={wallet} transactions={transactions} />}
    </div>
  );
};

// Accueil : ce que chacun a versé dans le portefeuille partagé ce mois-ci
const SharedMonthLine: React.FC<{ wallet: Wallet; transactions: Transaction[] }> = ({ wallet, transactions }) => {
  const now = new Date();
  const put = new Map<string, number>();
  for (const t of transactions) {
    const d = new Date(t.createdAt);
    if (t.walletId !== wallet.id || t.amount <= 0 || t.type === 'adjustment') continue;
    if (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear()) continue;
    const id = t.memberId || ME_ID;
    put.set(id, (put.get(id) ?? 0) + t.amount);
  }
  const people = [ME_ID, ...activeMembers(wallet).map((m) => m.id)];
  return (
    <div className={(wallet.kind ?? 'basic') === 'basic' ? '' : 'mt-3 pt-3 border-t border-slate-100'}>
      <div className="text-[11px] font-semibold text-slate-500 mb-1.5">Versé ce mois-ci</div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {people.map((id) => {
          const m = memberOf(wallet, id);
          return (
            <span key={id} className="flex items-center gap-1.5 text-xs">
              <MemberAvatar name={m.name} color={m.color} size="xs" />
              <span className="font-semibold text-slate-700">{m.name}</span>
              <span className="font-bold tabular-nums text-emerald-600">+{formatMoney(put.get(id) ?? 0, wallet.currency)}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
};

// ---------- Détail d'un portefeuille ----------
const Stat: React.FC<{ label: string; value: string; tone?: string }> = ({ label, value, tone = 'text-slate-900' }) => (
  <div className="flex-1 min-w-0">
    <div className="text-[11px] font-semibold text-slate-500">{label}</div>
    <div className={`text-[13px] leading-tight font-bold tabular-nums break-words ${tone}`}>{value}</div>
  </div>
);

const WalletDetail: React.FC<{
  wallet: Wallet;
  transactions: Transaction[];
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onTransfer?: () => void;
  onAdjust: () => void;
  onShare: () => void;
  onSelectTransaction: (tx: Transaction) => void;
}> = ({ wallet: w, transactions, onBack, onEdit, onDelete, onRestore, onTransfer, onAdjust, onShare, onSelectTransaction }) => {
  const balance = walletBalance(w, transactions);
  const money = (v: number) => formatMoney(v, w.currency);
  const kind = w.kind ?? 'basic';
  const kindInfo = KINDS.find((k) => k.id === kind)!;

  const now = new Date();
  const month = transactions.filter((t) => {
    const d = new Date(t.createdAt);
    return countsInStats(t) && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const monthIn = month.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const monthOut = month.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0);
  const sorted = [...transactions].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  // Par paquets de 50 : un portefeuille importé peut avoir des milliers d'opérations
  const [limit, setLimit] = useState(50);

  const kindBlock = <WalletKindSummary wallet={w} balance={balance} />;

  const action = (label: string, Icon: typeof Pencil, onClick: () => void, danger = false) => (
    <button
      onClick={onClick}
      className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-2xl bg-white border border-slate-100 text-xs font-semibold cursor-pointer hover:bg-slate-50 ${
        danger ? 'text-red-600' : 'text-slate-700'
      }`}
    >
      <Icon className="w-5 h-5" />
      {label}
    </button>
  );

  return (
    <div className="px-5 pt-4 pb-8 animate-screen">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} aria-label="Retour" className="w-11 h-11 shrink-0 rounded-full bg-white border border-slate-100 flex items-center justify-center cursor-pointer">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-slate-900 truncate">{w.name}</h1>
      </div>

      {/* Carte principale */}
      <div className="rounded-3xl p-5 mb-3 text-white relative overflow-hidden" style={{ backgroundColor: w.color }}>
        <AppIcon name={kindInfo.icon} className="absolute -right-4 -bottom-4 w-28 h-28 text-black/15" />
        <div className="flex items-center gap-2 text-xs font-semibold opacity-90">
          {kindInfo.title}
          {w.archived && <span className="px-2 py-0.5 rounded-full bg-black/20">Archivé</span>}
          {!w.includeInTotal && <span className="px-2 py-0.5 rounded-full bg-black/20">Exclu du total</span>}
        </div>
        <div className="text-[32px] font-extrabold tabular-nums tracking-tight mt-2">{money(balance)}</div>
        <div className="text-xs opacity-90">{kind === 'credit' ? 'Solde (négatif = ce que tu dois)' : 'Solde actuel'}</div>
      </div>

      {(kind === 'credit' || kind === 'goal') && <div className="bg-white rounded-3xl border border-slate-100 p-4 mb-3">{kindBlock}</div>}

      {!w.archived && <SharingBlock wallet={w} transactions={transactions} onManage={onShare} />}

      <div className="bg-white rounded-3xl border border-slate-100 p-4 mb-3 flex gap-3">
        <Stat label="Entrées ce mois" value={`+${money(monthIn)}`} tone="text-emerald-600" />
        <Stat label="Sorties ce mois" value={`−${money(monthOut)}`} />
      </div>

      <div className="flex gap-2 mb-6">
        {onTransfer && action('Transférer', ArrowLeftRight, onTransfer)}
        {action('Ajuster', SlidersHorizontal, onAdjust)}
        {action('Modifier', Pencil, onEdit)}
        {w.archived ? action('Restaurer', ArchiveRestore, onRestore) : action('Supprimer', Trash2, onDelete, true)}
      </div>

      <h2 className="text-sm font-bold text-slate-900 mb-2">Transactions</h2>
      {sorted.length === 0 ? (
        <p className="text-center text-sm text-slate-400 py-6">Aucune transaction dans ce portefeuille.</p>
      ) : (
        <>
          <div className="bg-white rounded-3xl border border-slate-100 px-3 py-1">
            {sorted.slice(0, limit).map((t) => (
              <TransactionItem key={t.id} transaction={t} onClick={onSelectTransaction} />
            ))}
          </div>
          {sorted.length > limit && (
            <button
              onClick={() => setLimit((l) => l + 50)}
              className="w-full mt-3 py-3 rounded-2xl bg-white border border-slate-100 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Voir plus ({sorted.length - limit} restantes)
            </button>
          )}
        </>
      )}
    </div>
  );
};

// ---------- Fenêtres Transférer / Ajuster ----------
const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
    <div
      className="w-full sm:max-w-[420px] max-h-[90dvh] overflow-y-auto bg-white rounded-t-[32px] sm:rounded-[32px] p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-slide-up"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold">{title}</h2>
        <button onClick={onClose} aria-label="Fermer" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>
      {children}
    </div>
  </div>
);

const parseAmount = (s: string) => parseFloat(s.replace(/\s/g, '').replace(',', '.'));
const amountCls =
  'w-full mt-1 px-4 py-3 rounded-2xl bg-slate-100 text-lg font-bold outline-none focus:ring-2 focus:ring-[#D8FB52] tabular-nums';

const WalletSelect: React.FC<{ label: string; wallets: Wallet[]; value: string; onChange: (id: string) => void; balanceOf: (w: Wallet) => number }> = ({
  label,
  wallets,
  value,
  onChange,
  balanceOf,
}) => (
  <div>
    <span className="text-xs font-semibold text-slate-500">{label}</span>
    <div className="grid grid-cols-3 gap-1.5 mt-1">
      {wallets.map((w) => (
        <button
          key={w.id}
          onClick={() => onChange(w.id)}
          className={`min-w-0 flex flex-col items-center gap-0.5 px-1 py-1.5 rounded-2xl border-2 text-center cursor-pointer transition ${
            w.id === value ? 'border-slate-900 bg-[#D8FB52]/40' : 'border-transparent bg-slate-100 hover:bg-slate-200/70'
          }`}
        >
          <IconBadge icon={w.icon} image={w.image} color={w.color} size="sm" />
          <span className="w-full text-[11px] font-bold text-slate-900 leading-tight truncate">{w.name}</span>
          <span className="w-full text-[10px] text-slate-500 tabular-nums truncate">{formatMoney(balanceOf(w), w.currency)}</span>
        </button>
      ))}
    </div>
  </div>
);

const TransferSheet: React.FC<{
  wallets: Wallet[];
  initialFromId: string;
  transactions: Transaction[];
  settings: Settings;
  onClose: () => void;
  onConfirm: (fromId: string, toId: string, fromAmount: number, toAmount: number, note: string, fee: number) => void;
}> = ({ wallets, initialFromId, transactions, settings, onClose, onConfirm }) => {
  const [fromId, setFromId] = useState(initialFromId);
  const [toId, setToId] = useState(wallets.find((w) => w.id !== initialFromId)?.id ?? '');
  const [amount, setAmount] = useState('');
  const [received, setReceived] = useState(''); // vide = conversion automatique
  const [feeText, setFeeText] = useState('');
  const [note, setNote] = useState('');

  const from = wallets.find((w) => w.id === fromId);
  const to = wallets.find((w) => w.id === toId);
  const value = parseAmount(amount);
  const sameCurrency = from && to && from.currency === to.currency;
  const auto = from && to && value > 0 ? convertBetween(value, from.currency, to.currency, settings) : null;
  const toValue = sameCurrency ? value : received ? parseAmount(received) : auto ?? NaN;
  const balanceOf = (w: Wallet) => walletBalance(w, transactions);
  const fee = feeText.trim() ? parseAmount(feeText) : 0;
  const feeOk = Number.isFinite(fee) && fee >= 0;
  const valid = !!from && !!to && from.id !== to.id && value > 0 && toValue > 0 && feeOk;

  const pickFrom = (id: string) => {
    setFromId(id);
    if (id === toId) setToId(wallets.find((w) => w.id !== id)?.id ?? '');
    setReceived('');
  };

  return (
    <Sheet title="Transférer de l'argent" onClose={onClose}>
      <WalletSelect label="Depuis" wallets={wallets} value={fromId} onChange={pickFrom} balanceOf={balanceOf} />
      <div className="flex justify-center my-1 text-slate-400">
        <ArrowDown className="w-4 h-4" />
      </div>
      <WalletSelect
        label="Vers"
        wallets={wallets.filter((w) => w.id !== fromId)}
        value={toId}
        onChange={(id) => {
          setToId(id);
          setReceived('');
        }}
        balanceOf={balanceOf}
      />

      <label className="block mt-3 text-xs font-semibold text-slate-500">Montant envoyé {from && `(${from.currency})`}</label>
      <input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className={amountCls} />

      {from && to && !sameCurrency && (
        <>
          <label className="block mt-3 text-xs font-semibold text-slate-500">Montant reçu ({to.currency})</label>
          <input
            inputMode="decimal"
            value={received}
            onChange={(e) => setReceived(e.target.value)}
            placeholder={auto !== null ? String(Math.round(auto * 100) / 100) : 'Taux manquant : saisis le montant reçu'}
            className={amountCls}
          />
          <p className="text-xs text-slate-400 mt-1">Rempli automatiquement avec ton taux. Corrige-le si le taux réel est différent.</p>
        </>
      )}

      <label className="block mt-3 text-xs font-semibold text-slate-500">Frais de transaction {from && `(${from.currency})`} — facultatif</label>
      <input
        inputMode="decimal"
        value={feeText}
        onChange={(e) => setFeeText(e.target.value)}
        placeholder="0 (ex. frais Mobile Money)"
        className="w-full mt-1 px-4 py-2.5 rounded-2xl bg-slate-100 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#D8FB52] tabular-nums"
      />
      {from && value > 0 && fee > 0 && feeOk && (
        <p className="text-xs text-slate-500 mt-1">
          Total retiré de {from.name} : <b>{formatMoney(value + fee, from.currency)}</b> ({formatMoney(value, from.currency)} + {formatMoney(fee, from.currency)} de
          frais, comptés comme une dépense).
        </p>
      )}

      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Note (facultatif)"
        className="w-full mt-3 px-4 py-2.5 rounded-2xl bg-slate-100 text-sm outline-none focus:ring-2 focus:ring-[#D8FB52]"
      />

      {from && value + (feeOk ? fee : 0) > balanceOf(from) && from.kind !== 'credit' && (
        <p className="text-xs text-amber-600 mt-2">Attention : c'est plus que le solde de {from.name}.</p>
      )}

      <button
        disabled={!valid}
        onClick={() => onConfirm(fromId, toId, value, Math.round(toValue * 100) / 100, note.trim(), fee)}
        className="w-full mt-4 py-3.5 rounded-2xl bg-[#D8FB52] disabled:bg-slate-100 disabled:text-slate-400 text-slate-900 font-bold text-sm cursor-pointer disabled:cursor-default"
      >
        {valid && from && to ? `Transférer ${formatMoney(value, from.currency)} vers ${to.name}` : 'Choisis les portefeuilles et le montant'}
      </button>
    </Sheet>
  );
};

const AdjustSheet: React.FC<{ wallet: Wallet; current: number; onClose: () => void; onConfirm: (v: number) => void }> = ({
  wallet,
  current,
  onClose,
  onConfirm,
}) => {
  const [text, setText] = useState(String(Math.round(current * 100) / 100));
  const value = parseAmount(text);
  const diff = Number.isFinite(value) ? Math.round((value - current) * 100) / 100 : 0;
  return (
    <Sheet title="Ajuster le solde" onClose={onClose}>
      <p className="text-sm text-slate-600 mb-3">
        Ton solde réel ne correspond pas à l'app ? Saisis le vrai montant de <span className="font-semibold">{wallet.name}</span> : la différence est
        enregistrée comme un ajustement (pas compté comme dépense ni revenu).
      </p>
      <label className="text-xs font-semibold text-slate-500">Solde réel ({wallet.currency})</label>
      <input autoFocus inputMode="decimal" value={text} onChange={(e) => setText(e.target.value)} onFocus={(e) => e.target.select()} className={amountCls} />
      <p className="text-xs mt-2 text-slate-500">
        Actuellement : {formatMoney(current, wallet.currency)}
        {diff !== 0 && (
          <span className={`font-semibold ${diff > 0 ? 'text-emerald-600' : 'text-slate-900'}`}>
            {' '}· ajustement de {diff > 0 ? '+' : '−'}
            {formatMoney(Math.abs(diff), wallet.currency)}
          </span>
        )}
      </p>
      <button
        disabled={!Number.isFinite(value) || diff === 0}
        onClick={() => onConfirm(value)}
        className="w-full mt-4 py-3.5 rounded-2xl bg-[#D8FB52] disabled:bg-slate-100 disabled:text-slate-400 text-slate-900 font-bold text-sm cursor-pointer disabled:cursor-default"
      >
        {diff === 0 ? 'Saisis le nouveau solde' : 'Ajuster le solde'}
      </button>
    </Sheet>
  );
};
