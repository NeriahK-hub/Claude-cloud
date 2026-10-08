import React, { Suspense, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { takeJump } from '../lib/jumpTo';
import { DuplicatePlan, findDuplicateWallets } from '../lib/dedupe';
import { Plus, Target, Pencil, ChevronRight, CalendarPlus, Flag, Flame, Quote, BellRing, Coins, Sofa, Trophy, Lightbulb, PartyPopper, TrendingUp, CircleCheck, Clock, CalendarClock, CalendarX, Pause, Sprout, ArrowRight, Trash2, X, ArchiveRestore, Archive, ChevronLeft, CircleHelp, ArrowLeftRight, SlidersHorizontal, ArrowUpDown, GripVertical, ChevronUp, ChevronDown, History, Users, CopyX, Lock, Sparkles, Eye, EyeOff } from 'lucide-react';
import { SortableList } from './SortableList';
import { SecretMoney } from './MatrixSwap';
import { Settings, Transaction, Wallet, WalletKind } from '../types';
import { TransactionItem } from './TransactionItem';
import { AppIcon, IconBadge, WALLET_ICON_CHOICES } from './AppIcon';
import { IconPicker, ColorPicker, COLOR_CHOICES } from './IconPicker';
import { CurrencyPicker } from './CurrencyPicker';
import { currencyInfo } from '../data/currencies';
import { convertBetween, countsInStats, dayLabel, formatMoney, toMain, walletBalance } from '../lib/money';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { TransactionHistoryView } from './pages';
import { inThisMonth } from '../lib/periods';
import { challengeDay, challengeWeek, goalEquivalence, goalInsight, GoalInsight, goalSeries, goalStreak, niceAmount, reminderDue, timeLeftLabel, weekendSaving, weekKey, weekRoundUps } from '../lib/goals';
import { GoalDraft, consumeDepositRequest, consumeNewGoalRequest, consumeViewGoal, markRoundUpPaid, roundUpAlreadyPaid } from '../lib/goalMilestones';
import { getPrefs, setPrefs, useDisplayPrefs } from '../lib/display';
import { isShared, MembersSheet, MemberStack, SharingBlock, activeMembers, memberOf, MemberAvatar, ME_ID } from './Members';
import { useFeature } from '../lib/remoteConfig';
import { haptic } from '../lib/haptics';
import { DateField, localDay } from './DatePicker';
import { Group, InputRow, NavRow, SwitchRow } from './FormRows';
import type { Cloud } from '../lib/sync/useCloud';
import { ChallengeSheet } from './ChallengeSheet';

interface WalletsViewProps {
  wallets: Wallet[];
  transactions: Transaction[];
  defaultCurrency: string;
  onAdd: (w: Omit<Wallet, 'id' | 'archived'>) => void;
  onUpdate: (id: string, changes: Partial<Wallet>) => void;
  onDelete: (id: string) => void;
  onSelectTransaction: (tx: Transaction) => void;
  onTransfer: (fromId: string, toId: string, fromAmount: number, toAmount: number, note: string, fee: number, createdAt?: string) => void;
  onAdjustBalance: (walletId: string, newBalance: number) => void;
  onReorder: (ids: string[]) => void;
  settings: Settings;
  cloud?: Cloud;
  onJoin?: () => void; // « Rejoindre un portefeuille » avec un code reçu
  onRemoveDuplicates?: (plan: DuplicatePlan) => void;
  goalsOnly?: boolean; // page « Objectifs » (bouton de l'accueil) : seulement les portefeuilles objectifs
  onBack?: () => void;
}

export const WalletsView: React.FC<WalletsViewProps> = ({ wallets, transactions, defaultCurrency, onAdd, onUpdate, onDelete, onSelectTransaction, onTransfer, onAdjustBalance, onReorder, settings, cloud, onJoin, onRemoveDuplicates, goalsOnly, onBack }) => {
  const sharingOn = useFeature('sharedWallets'); // désactivable depuis l'espace admin
  const desktop = useIsDesktop(); // ordinateur : grille de cartes et détail en deux colonnes
  const { hideBalance } = useDisplayPrefs(); // œil : masque les soldes (le même réglage que sur l'accueil)
  const EyeIcon = hideBalance ? EyeOff : Eye;
  const [editing, setEditing] = useState<Wallet | 'new' | null>(null);
  const [goalDraft, setGoalDraft] = useState<GoalDraft | null>(null); // objectif proposé par Wallo, déjà rempli
  const [deleting, setDeleting] = useState<Wallet | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [transferFrom, setTransferFrom] = useState<string | null>(null); // id, ou '' = à choisir
  const [adjusting, setAdjusting] = useState<Wallet | null>(null);
// « Ajouter de l'argent » dans un objectif : montant proposé, et semaine d'arrondis s'il s'agit d'eux
  const [showChallenges, setShowChallenges] = useState(false); // « Commencer un défi »
  const [deposit, setDeposit] = useState<{ goal: Wallet; amount?: number; tag?: DepositTag } | null>(null);
  const openDeposit = (goal: Wallet, amount?: number, tag?: DepositTag) => setDeposit({ goal, amount, tag });
  const [sharing, setSharing] = useState<Wallet | null>(null);
  const [reordering, setReordering] = useState(false);
  const [showArchives, setShowArchives] = useState(false);
  const [showHistory, setShowHistory] = useState(false); // historique du portefeuille ouvert
  const [showDupes, setShowDupes] = useState(false);
  const dupes = useMemo(() => findDuplicateWallets(wallets, transactions), [wallets, transactions]);
  const viewing = wallets.find((w) => w.id === viewingId) ?? null;
  // Dépenses de référence pour les équivalences : hors portefeuilles objectifs
  const spending = useMemo(() => {
    const goalIds = new Set(wallets.filter((w) => w.kind === 'goal').map((w) => w.id));
    return transactions.filter((t) => !goalIds.has(t.walletId));
  }, [wallets, transactions]);
  // « Créer le prochain objectif » (écran Objectif atteint) : on ouvre le formulaire en arrivant
  useLayoutEffect(() => {
    const goalReq = goalsOnly ? consumeNewGoalRequest() : null;
    if (goalReq) {
      setViewingId(null);
      setGoalDraft(goalReq.draft);
      setEditing('new');
    }
    const req = goalsOnly ? consumeDepositRequest() : null;
    const target = req && wallets.find((w) => w.id === req.walletId && w.kind === 'goal' && !w.archived);
    if (target) openDeposit(target, req.amount);
    // Notification d'un palier touchée : on ouvre cet objectif
    const view = goalsOnly ? consumeViewGoal() : null;
    if (view && wallets.some((w) => w.id === view)) setViewingId(view);
    // Conseil de la Santé financière : ce portefeuille (et « Corriger le solde »), ou cet objectif
    const jump = goalsOnly ? takeJump('goal') : takeJump('wallet');
    const jw = jump && wallets.find((w) => w.id === jump.id && !w.archived);
    if (jump && jw) {
      setViewingId(jw.id);
      // La fenêtre arrive juste après le détail : on voit d'où elle vient
      if (jump.kind === 'wallet' && jump.adjust) setTimeout(() => setAdjusting(jw), 380);
      if (jump.kind === 'goal' && jump.deposit) setTimeout(() => openDeposit(jw, jump.deposit), 380);
    }
  });

  // En ouvrant un portefeuille, son historique ou les archives, on repart du haut de la page
  useLayoutEffect(() => {
    if (viewingId || showArchives) window.scrollTo(0, 0);
  }, [viewingId, showArchives, showHistory]);

  const active = wallets.filter((w) => !w.archived);
  const archived = wallets.filter((w) => w.archived);
  // Les portefeuilles exclus du total sont rangés à part, en bas de la liste
  const included = active.filter((w) => w.includeInTotal);
  const excluded = active.filter((w) => !w.includeInTotal);

  // Ordinateur : carte verticale, actions visibles au survol
  const deskCard = (w: Wallet) => {
    const bal = walletBalance(w, transactions);
    const kindInfo = KINDS.find((k) => k.id === (w.kind ?? 'basic'))!;
    return (
      <div
        key={w.id}
        role="button"
        tabIndex={0}
        onClick={() => setViewingId(w.id)}
        onKeyDown={(e) => e.key === 'Enter' && setViewingId(w.id)}
        className={`group bg-white rounded-3xl border border-slate-100 p-5 flex flex-col cursor-pointer hover:border-slate-200 hover:shadow-lg hover:-translate-y-0.5 transition ${w.archived ? 'opacity-70' : ''}`}
      >
        <div className="flex items-start gap-3">
          <IconBadge icon={w.icon} image={w.image} color={w.color} />
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-semibold text-slate-900 truncate">{w.name}</div>
            <div className="text-xs font-semibold text-slate-500 truncate">
              {kindInfo.title} · {w.currency}
            </div>
          </div>
          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition">
            {w.archived && (
              <button
                onClick={(e) => { e.stopPropagation(); onUpdate(w.id, { archived: false }); }}
                aria-label={`Restaurer ${w.name}`}
                title="Restaurer"
                className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer"
              >
                <ArchiveRestore className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); setEditing(w); }}
              aria-label={`Modifier ${w.name}`}
              title="Modifier"
              className="w-8 h-8 rounded-full hover:bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer"
            >
              <Pencil className="w-4 h-4" />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setDeleting(w); }}
              aria-label={`Supprimer ${w.name}`}
              title="Supprimer"
              className="w-8 h-8 rounded-full hover:bg-red-50 text-slate-400 hover:text-red-500 flex items-center justify-center cursor-pointer"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className={`mt-5 text-2xl font-extrabold tracking-tight tabular-nums truncate ${bal < 0 ? 'text-red-500' : 'text-slate-900'}`}>
          <SecretMoney text={formatMoney(bal, w.currency)} />
        </div>
        <WalletProgress wallet={w} balance={bal} />
        {isShared(w) && (
          <span className="flex items-center gap-1.5 mt-2 text-[12px] font-semibold text-slate-500">
            <MemberStack wallet={w} /> Partagé à {activeMembers(w).length + 1}
          </span>
        )}
      </div>
    );
  };

  const card = (w: Wallet) => desktop ? deskCard(w) : (
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
          <SecretMoney text={formatMoney(walletBalance(w, transactions), w.currency)} />
        </div>
        <WalletProgress wallet={w} balance={walletBalance(w, transactions)} />
        {isShared(w) && (
          <span className="flex items-center gap-1.5 mt-1.5 text-[12px] font-semibold text-slate-500">
            <MemberStack wallet={w} /> Partagé à {activeMembers(w).length + 1}
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

      {deposit && (
        <DepositSheet
          goal={deposit.goal}
          wallets={active.filter((w) => w.id !== deposit.goal.id)}
          transactions={transactions}
          settings={settings}
          initialAmount={deposit.amount}
          note={deposit.tag?.note}
          intro={deposit.tag?.intro}
          onClose={() => setDeposit(null)}
          onConfirm={(fromId, toId, fromAmount, toAmount, note, fee, createdAt) => {
            onTransfer(fromId, toId, fromAmount, toAmount, note, fee, createdAt);
            if (deposit.tag) markRoundUpPaid(deposit.tag.key, deposit.tag.week, toAmount);
            setDeposit(null);
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
      {showDupes && dupes.walletIds.length > 0 && onRemoveDuplicates && (
        <DuplicatesSheet
          plan={dupes}
          transactions={transactions}
          onClose={() => setShowDupes(false)}
          onConfirm={() => {
            onRemoveDuplicates(dupes);
            setShowDupes(false);
          }}
        />
      )}
      {sharing && (
        <MembersSheet
          wallet={wallets.find((w) => w.id === sharing.id) ?? sharing}
          cloud={cloud}
          onClose={() => setSharing(null)}
          onLeave={() => {
            setSharing(null);
            setDeleting(sharing);
          }}
          onSave={(members) => {
            onUpdate(sharing.id, { members });
            setSharing(null);
          }}
        />
      )}
      {editing && (
        <WalletSheet
          wallet={editing === 'new' ? null : editing}
          initialKind={goalsOnly ? 'goal' : undefined}
          draft={editing === 'new' ? goalDraft : null}
          hasTransactions={editing !== 'new' && transactions.some((t) => t.walletId === editing.id)}
          defaultCurrency={defaultCurrency}
          onClose={() => {
            setEditing(null);
            setGoalDraft(null);
          }}
          onSave={(data) => {
            if (editing === 'new') onAdd(data);
            else onUpdate(editing.id, data);
            // Les arrondis vont dans un seul objectif : on les retire des autres
            if (data.roundUp) {
              for (const o of wallets) if (o.roundUp && (editing === 'new' || o.id !== editing.id)) onUpdate(o.id, { roundUp: false });
            }
            setEditing(null);
            setGoalDraft(null);
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

  if (viewing && showHistory) {
    return (
      <Suspense fallback={null}>
        <TransactionHistoryView
          transactions={transactions}
          wallets={wallets}
          initialWalletId={viewing.id}
          settings={settings}
          onBack={() => setShowHistory(false)}
          onSelectTransaction={onSelectTransaction}
        />
      </Suspense>
    );
  }

  if (viewing) {
    return (
      <>
        <WalletDetail
          wallet={viewing}
          transactions={transactions.filter((t) => t.walletId === viewing.id)}
          onBack={() => setViewingId(null)}
          onOpenHistory={() => setShowHistory(true)}
          onEdit={() => setEditing(viewing)}
          onDelete={() => setDeleting(viewing)}
          onRestore={() => onUpdate(viewing.id, { archived: false })}
          onTransfer={active.length > 1 && !viewing.archived ? () => setTransferFrom(viewing.id) : undefined}
          onAdjust={() => setAdjusting(viewing)}
          spending={spending}
          onDeposit={viewing.kind === 'goal' && !viewing.archived && active.length > 1 ? (amount, tag) => openDeposit(viewing, amount, tag) : undefined}
          wallets={wallets}
          settings={settings}
          onShare={() => setSharing(viewing)}
          onSelectTransaction={onSelectTransaction}
          desktop={desktop}
        />
        {sheets}
      </>
    );
  }

  // Archives : un écran à part, ouvert par le bouton « Archives »
  if (showArchives && archived.length > 0) {
    return (
      <div className={desktop ? 'max-w-7xl animate-screen' : 'px-5 pt-4 pb-8 animate-screen'}>
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={() => setShowArchives(false)}
            aria-label="Retour"
            className="w-11 h-11 shrink-0 rounded-full bg-white border border-slate-100 flex items-center justify-center cursor-pointer"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="flex-1 text-xl font-bold text-slate-900">Archives</h1>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Hors du total et des listes, mais leur historique est gardé. {desktop ? 'Clique sur' : 'Touche'} <ArchiveRestore className="inline w-3.5 h-3.5 -mt-0.5" /> pour en restaurer un.
        </p>
        <div className={desktop ? 'grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4 stagger' : 'space-y-3 stagger'}>{archived.map(card)}</div>
        {sheets}
      </div>
    );
  }

  // ---------- Page « Objectifs » : chaque objectif avec sa progression et son rythme ----------
  if (goalsOnly) {
    const goals = active.filter((w) => w.kind === 'goal');
    const reached = goals.filter((w) => w.goalAmount && walletBalance(w, transactions) >= w.goalAmount).length;
    const summary =
      goals.length === 0
        ? 'Épargne pour ce qui compte.'
        : `${goals.length - reached} en cours${reached ? ` · ${reached} atteint${reached > 1 ? 's' : ''}` : ''}`;
    return (
      <div className={desktop ? 'max-w-7xl animate-screen' : 'px-5 pt-4 pb-8 animate-screen'}>
        <div className="flex items-center justify-between mb-3">
          {onBack && !desktop ? (
            <button
              onClick={onBack}
              aria-label="Retour"
              className="w-11 h-11 shrink-0 rounded-full bg-white border border-slate-100 flex items-center justify-center cursor-pointer"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
          ) : <span />}
          <button
            onClick={() => setEditing('new')}
            data-coach="new-goal"
            aria-label="Nouvel objectif"
            title="Nouvel objectif"
            className="w-11 h-11 shrink-0 rounded-full bg-accent hover:bg-accent-hover flex items-center justify-center cursor-pointer active:scale-95 transition"
          >
            <Plus className="w-5 h-5 stroke-[2.5]" />
          </button>
        </div>
        <h1 className="text-[32px] leading-tight font-bold tracking-tight text-slate-900">Objectifs</h1>
        <p className="text-sm text-slate-500 mb-5">{summary}</p>
        {/* Défis d'épargne prêts à l'emploi */}
        <button
          onClick={() => setShowChallenges(true)}
          className="w-full mb-4 flex items-center gap-3 p-3.5 rounded-2xl bg-violet-500/10 text-left cursor-pointer hover:bg-violet-500/15 transition"
        >
          <span className="w-10 h-10 rounded-xl bg-violet-500/15 flex items-center justify-center shrink-0">
            <Trophy className="w-5 h-5 text-violet-600" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[14px] font-bold text-slate-900">Commencer un défi</span>
            <span className="block text-[12px] text-slate-500">52 semaines, un peu chaque jour, week-end sans dépense…</span>
          </span>
          <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
        </button>
        {goals.length === 0 ? (
          <div className="bg-white rounded-[28px] border border-slate-100 px-6 py-8 flex flex-col items-center text-center">
            {/* Simple illustration : pas de faux pourcentage */}
            <div className="w-20 h-20 rounded-full bg-accent/20 flex items-center justify-center">
              <Target className="w-10 h-10 text-slate-700" />
            </div>
            <h2 className="text-lg font-bold tracking-tight text-slate-900 mt-4 mb-1">Ton premier objectif</h2>
            <p className="text-sm text-slate-500 mb-6 max-w-xs">
              Une moto, un loyer, un mariage… Fixe un montant et une date : Wallo te dit combien épargner chaque jour et si tu es dans les temps.
            </p>
            <button
              onClick={() => setEditing('new')}
              className="h-12 px-6 rounded-full bg-accent hover:bg-accent-hover text-sm font-bold flex items-center gap-1.5 cursor-pointer active:scale-95 transition"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" /> Créer un objectif
            </button>
          </div>
        ) : (
          <div className={desktop ? 'grid grid-cols-2 xl:grid-cols-3 gap-4 stagger' : 'space-y-4 stagger'}>
            {goals.map((w) => (
              <GoalCard key={w.id} wallet={w} transactions={transactions} spending={spending} onOpen={() => setViewingId(w.id)} onDeposit={(amount, tag) => openDeposit(w, amount, tag)} wallets={wallets} settings={settings} />
            ))}
          </div>
        )}
        {sheets}
        {showChallenges && (
          <ChallengeSheet
            settings={settings}
            wallets={wallets}
            transactions={transactions}
            onClose={() => setShowChallenges(false)}
            onCreate={(data) => {
              onAdd(data);
              // Défi petite monnaie : les arrondis vont dans ce seul objectif
              if (data.roundUp) for (const o of wallets) if (o.roundUp) onUpdate(o.id, { roundUp: false });
              setShowChallenges(false);
            }}
          />
        )}
      </div>
    );
  }

  // ---------- Ordinateur : bandeau des totaux + grille de cartes ----------
  if (desktop && !reordering) {
    const main = settings.mainCurrency;
    const total = included.reduce((s, w) => s + toMain(walletBalance(w, transactions), w.currency, settings), 0);
    const byCurrency = new Map<string, number>();
    for (const w of included) byCurrency.set(w.currency, (byCurrency.get(w.currency) ?? 0) + walletBalance(w, transactions));
    const toolBtn = 'h-11 px-4 rounded-2xl bg-white border border-slate-200 text-sm font-semibold text-slate-700 flex items-center gap-2 cursor-pointer hover:bg-slate-50';
    const grid = 'grid grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4';
    return (
      <div className="max-w-7xl animate-screen">
        {/* Bandeau : total + actions */}
        <div className="bg-white rounded-3xl border border-slate-100 p-6 mb-6 flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-slate-500">
              Total · {included.length} portefeuille{included.length > 1 ? 's' : ''}
            </div>
            <div className={`text-[34px] leading-tight font-extrabold tracking-tight tabular-nums ${total < 0 ? 'text-red-500' : 'text-slate-900'}`}>
              <SecretMoney text={formatMoney(total, main)} />
            </div>
            {byCurrency.size > 1 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {[...byCurrency].map(([cur, v]) => (
                  <span key={cur} className="px-3 py-1.5 rounded-full bg-slate-100 text-xs font-bold tabular-nums text-slate-700">
                    <SecretMoney text={formatMoney(v, cur)} />
                  </span>
                ))}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={() => setPrefs({ hideBalance: !hideBalance })} aria-pressed={hideBalance} className={toolBtn}>
              <EyeIcon className="w-4 h-4" />
              {hideBalance ? 'Afficher les soldes' : 'Masquer les soldes'}
            </button>
            {archived.length > 0 && (
              <button onClick={() => setShowArchives(true)} className={toolBtn}>
                <Archive className="w-4 h-4" />
                Archives
                <span className="min-w-5 h-5 px-1.5 rounded-full bg-accent text-slate-900 text-[11px] font-extrabold flex items-center justify-center tabular-nums">
                  {archived.length}
                </span>
              </button>
            )}
            {active.length > 1 && (
              <button onClick={() => setReordering(true)} className={toolBtn}>
                <ArrowUpDown className="w-4 h-4" />
                Réorganiser
              </button>
            )}
            {active.length > 1 && (
              <button onClick={() => setTransferFrom('')} className={toolBtn}>
                <ArrowLeftRight className="w-4 h-4" />
                Transférer
              </button>
            )}
            <button
              onClick={() => setEditing('new')}
              className="h-11 px-5 rounded-2xl bg-accent hover:bg-accent-hover text-sm font-bold flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Nouveau portefeuille
            </button>
          </div>
        </div>

        {dupes.walletIds.length > 0 && onRemoveDuplicates && (
          <button
            onClick={() => setShowDupes(true)}
            className="w-full mb-6 p-4 rounded-3xl bg-white border border-amber-400/60 flex items-center gap-3 text-left cursor-pointer hover:bg-slate-50"
          >
            <span className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
              <CopyX className="w-5 h-5 text-amber-600" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold text-slate-900">
                {dupes.walletIds.length} portefeuille{dupes.walletIds.length > 1 ? 's' : ''} en double
              </span>
              <span className="block text-xs text-slate-500">Des copies exactes, avec les mêmes opérations : elles doublent ton historique. Clique pour nettoyer.</span>
            </span>
          </button>
        )}

        {active.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-10">Aucun portefeuille actif</p>
        ) : (
          <div className={`${grid} stagger`}>{included.map(card)}</div>
        )}

        {excluded.length > 0 && (
          <>
            <h2 className="mt-8 mb-3 px-1 text-[12px] font-bold text-slate-400 tracking-wider uppercase">Exclus du total</h2>
            <div className={grid}>{excluded.map(card)}</div>
          </>
        )}

        {onJoin && cloud?.configured && sharingOn && (
          <button
            onClick={onJoin}
            className="mt-8 p-4 pr-6 rounded-3xl border border-dashed border-slate-300 inline-flex items-center gap-3 text-left cursor-pointer hover:bg-white"
          >
            <span className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-slate-700" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-bold text-slate-900">Rejoindre un portefeuille partagé</span>
              <span className="block text-xs text-slate-500">Tu as reçu un lien ou un code d'invitation&nbsp;?</span>
            </span>
          </button>
        )}

        {sheets}
      </div>
    );
  }

  return (
    <div className={desktop ? 'max-w-2xl animate-screen' : 'px-5 pt-4 pb-8 animate-screen'}>
      <div className={`${desktop ? '' : 'page-head '}flex items-center justify-between mb-5`}>
        <h1 className="text-xl font-bold text-slate-900">{desktop ? 'Réorganiser' : 'Portefeuilles'}</h1>
        <div className="flex items-center gap-2">
        {!reordering && (
          <button
            onClick={() => setPrefs({ hideBalance: !hideBalance })}
            aria-pressed={hideBalance}
            aria-label={hideBalance ? 'Afficher les soldes' : 'Masquer les soldes'}
            title={hideBalance ? 'Afficher les soldes' : 'Masquer les soldes'}
            className="w-10 h-10 rounded-full bg-white border border-slate-100 text-slate-700 flex items-center justify-center cursor-pointer hover:bg-slate-50 active:scale-95 transition"
          >
            <EyeIcon key={String(hideBalance)} className="w-4 h-4 animate-fade-in" />
          </button>
        )}
        {archived.length > 0 && !reordering && (
          <button
            onClick={() => setShowArchives(true)}
            aria-label={`Archives (${archived.length})`}
            title="Archives"
            className="relative w-10 h-10 rounded-full bg-white border border-slate-100 text-slate-700 flex items-center justify-center cursor-pointer hover:bg-slate-50"
          >
            <Archive className="w-4 h-4" />
            <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-accent text-slate-900 text-[11px] font-extrabold flex items-center justify-center tabular-nums">
              {archived.length}
            </span>
          </button>
        )}
        {active.length > 1 && (
          <button
            onClick={() => setReordering((r) => !r)}
            aria-label={reordering ? 'Terminé' : 'Réorganiser'}
            title={reordering ? undefined : 'Réorganiser'}
            className={`flex items-center justify-center cursor-pointer transition ${
              reordering
                ? 'px-4 h-10 rounded-full bg-accent text-slate-900 text-xs font-bold'
                : 'w-10 h-10 rounded-full bg-white border border-slate-100 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {reordering ? 'Terminé' : <ArrowUpDown className="w-4 h-4" />}
          </button>
        )}
        </div>
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
                  <div className="text-xs font-semibold tabular-nums text-slate-500"><SecretMoney text={formatMoney(walletBalance(w, transactions), w.currency)} /></div>
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
          {dupes.walletIds.length > 0 && onRemoveDuplicates && (
            <button
              onClick={() => setShowDupes(true)}
              className="w-full mb-4 p-4 rounded-3xl bg-white border border-amber-400/60 flex items-center gap-3 text-left cursor-pointer hover:bg-slate-50"
            >
              <span className="w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center shrink-0">
                <CopyX className="w-5 h-5 text-amber-600" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-slate-900">
                  {dupes.walletIds.length} portefeuille{dupes.walletIds.length > 1 ? 's' : ''} en double
                </span>
                <span className="block text-xs text-slate-500">Des copies exactes, avec les mêmes opérations : elles doublent ton historique. Touche pour nettoyer.</span>
              </span>
            </button>
          )}

          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setEditing('new')}
              data-coach="new-wallet"
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
            {included.map(card)}
            {active.length === 0 && <p className="text-center text-sm text-slate-400 py-6">Aucun portefeuille actif</p>}
          </div>

          {excluded.length > 0 && (
            <>
              <h2 className="mt-6 mb-2 px-1 text-[12px] font-bold text-slate-400 tracking-wider uppercase">Exclus du total</h2>
              <div className="space-y-3">{excluded.map(card)}</div>
            </>
          )}

          {onJoin && cloud?.configured && sharingOn && (
            <button
              onClick={onJoin}
              className="w-full mt-6 p-4 rounded-3xl border border-dashed border-slate-300 flex items-center gap-3 text-left cursor-pointer hover:bg-white"
            >
              <span className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5 text-slate-700" />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-bold text-slate-900">Rejoindre un portefeuille partagé</span>
                <span className="block text-xs text-slate-500">Tu as reçu un lien ou un code d'invitation&nbsp;?</span>
              </span>
            </button>
          )}

        </>
      )}

      {sheets}
    </div>
  );
};

// ---------- Barre de progression (crédit utilisé / objectif atteint) ----------
const WalletProgress: React.FC<{ wallet: Wallet; balance: number }> = ({ wallet: w, balance }) => {
  const { hideBalance } = useDisplayPrefs();
  let ratio: number;
  let label: string;
  let bar: string;
  if (w.kind === 'credit' && w.creditLimit) {
    const used = Math.max(0, -balance);
    ratio = used / w.creditLimit;
    label = hideBalance ? 'Disponible •••••• sur ••••••' : `Disponible ${formatMoney(Math.max(0, w.creditLimit - used), w.currency)} sur ${formatMoney(w.creditLimit, w.currency)}`;
    bar = ratio >= 0.9 ? 'bg-red-500' : ratio >= 0.7 ? 'bg-amber-500' : 'bg-pink-500';
  } else if (w.kind === 'goal' && w.goalAmount) {
    ratio = Math.max(0, balance) / w.goalAmount;
    const date = w.goalDate ? ` · d'ici le ${new Date(w.goalDate + 'T00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}` : '';
    label = ratio >= 1 ? `Objectif atteint${date}` : `${Math.round(ratio * 100)} % de ${formatMoney(w.goalAmount, w.currency)}${date}`;
    bar = ratio >= 1 ? 'bg-emerald-500' : 'bg-accent';
  } else return null;
  return (
    <div className="mt-1.5">
      <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full animate-bar ${bar}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </div>
      <div className="text-[12px] leading-snug text-slate-500 mt-1">{label}</div>
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
}> = ({ wallet, txCount, onClose, onArchive, onDelete }) => wallet.ownerId ? (
  // Portefeuille partagé par quelqu'un d'autre : on le quitte (il reste pour les autres membres)
  <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
    <div className="w-full sm:max-w-[400px] bg-white rounded-t-[32px] sm:rounded-[32px] p-6 pb-8 animate-slide-up" onClick={(e) => e.stopPropagation()}>
      <h2 className="text-base font-bold mb-2">Quitter « {wallet.name} » ?</h2>
      <p className="text-sm text-slate-600 mb-5">
        Il disparaîtra de ton téléphone. Les autres membres le gardent, avec toutes ses opérations. Le propriétaire pourra te réinviter.
      </p>
      <button onClick={onDelete} className="w-full mb-2 py-3.5 rounded-2xl bg-red-50 text-red-600 font-bold text-sm cursor-pointer">
        Quitter ce portefeuille
      </button>
      <button onClick={onClose} className="w-full py-3 rounded-2xl bg-slate-100 font-semibold text-sm cursor-pointer">
        Annuler
      </button>
    </div>
  </div>
) : (
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
        <button onClick={onArchive} className="w-full mb-2 py-3.5 rounded-2xl bg-accent font-bold text-sm flex items-center justify-center gap-2 cursor-pointer">
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
    hint: 'Épargner pour un projet',
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
      <div className="sheet-head flex items-center justify-between mb-4">
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
                <div className="text-[12px] font-medium text-white/85 mt-1 pr-2">{k.hint}</div>
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
  initialKind?: WalletKind; // nouveau portefeuille : type déjà choisi (page Objectifs)
  draft?: GoalDraft | null; // objectif proposé par Wallo : tout est déjà rempli
  onClose: () => void;
  onSave: (data: Omit<Wallet, 'id' | 'archived'>) => void;
}> = ({ wallet, hasTransactions, defaultCurrency, initialKind, draft, onClose, onSave }) => {
  const [kind, setKind] = useState<WalletKind | null>(wallet ? wallet.kind ?? 'basic' : initialKind ?? null);
  const preset = !wallet && initialKind ? KINDS.find((k) => k.id === initialKind) : undefined;
  const [name, setName] = useState(wallet?.name ?? draft?.name ?? '');
  const [icon, setIcon] = useState(wallet?.icon ?? draft?.icon ?? preset?.icon ?? WALLET_ICON_CHOICES[0]);
  const [image, setImage] = useState<string | undefined>(wallet?.image);
  const [color, setColor] = useState(wallet?.color ?? draft?.color ?? preset?.color ?? COLOR_CHOICES[8]);
  const [currency, setCurrency] = useState(wallet?.currency ?? defaultCurrency);
  // Crédit : on saisit le montant déjà utilisé (positif), stocké en solde négatif.
  // 0 = champ vide avec « 0 » en indication : sinon taper 1 donnait « 01 »
  const [balance, setBalance] = useState(() => {
    const v = wallet ? (wallet.kind === 'credit' ? -wallet.initialBalance : wallet.initialBalance) : 0;
    return v ? String(v) : '';
  });
  const [limit, setLimit] = useState(wallet?.creditLimit ? String(wallet.creditLimit) : '');
  const [goal, setGoal] = useState(wallet?.goalAmount ? String(wallet.goalAmount) : draft ? String(draft.goalAmount) : '');
  const [goalDate, setGoalDate] = useState(wallet?.goalDate ?? draft?.goalDate ?? '');
  const [why, setWhy] = useState(wallet?.goalWhy ?? draft?.goalWhy ?? '');
  // « Pourquoi cet objectif ? » : la zone grandit avec le texte (rien de caché à droite)
  const whyRef = useRef<HTMLTextAreaElement | null>(null);
  const growWhy = (el: HTMLTextAreaElement | null) => {
    whyRef.current = el;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  };
  useLayoutEffect(() => growWhy(whyRef.current), [why]);
  const [remindOn, setRemindOn] = useState(!!wallet?.goalReminder || !!draft);
  const [remindDay, setRemindDay] = useState(wallet?.goalReminder?.day ?? 5); // vendredi par défaut
  const [remindAmount, setRemindAmount] = useState(wallet?.goalReminder?.amount ? String(wallet.goalReminder.amount) : draft ? String(draft.weekly) : '');
  const [roundUp, setRoundUp] = useState(!!wallet?.roundUp);
  const [include, setInclude] = useState(wallet?.includeInTotal ?? true);
  const [showCurrencies, setShowCurrencies] = useState(false);
  const [showLook, setShowLook] = useState(false); // icône et couleur : repliées derrière la pastille

  const num = (s: string) => parseFloat(s.replace(',', '.'));
  const parsedBalance = balance.trim() ? num(balance) : 0; // vide = 0
  const parsedLimit = num(limit);
  const parsedGoal = num(goal);
  const valid =
    name.trim() !== '' &&
    Number.isFinite(parsedBalance) &&
    (kind !== 'credit' || parsedLimit > 0) &&
    (kind !== 'goal' || parsedGoal > 0) &&
    (kind !== 'goal' || !remindOn || num(remindAmount) > 0);

  const pickKind = (k: WalletKind) => {
    const def = KINDS.find((x) => x.id === k)!;
    setKind(k);
    setIcon(def.icon);
    setColor(def.color);
  };

  const kindInfo = KINDS.find((k) => k.id === kind);
  const inputCls =
    'w-full mt-1 mb-4 px-4 py-3 rounded-2xl bg-slate-100 text-sm outline-none focus:ring-2 focus:ring-accent tabular-nums';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
      <div className="w-full sm:max-w-[420px] max-h-[90dvh] flex flex-col bg-white rounded-t-[32px] sm:rounded-[32px] animate-slide-up" onClick={(e) => e.stopPropagation()}>
        {kind === null ? (
          <KindPicker onPick={pickKind} onClose={onClose} />
        ) : showCurrencies ? (
          /* Choix de la devise : la liste arrive de la droite, en haut de la fenêtre */
          <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-pick-in">
            <div className="sheet-head flex items-center gap-2 mb-4">
              <button onClick={() => setShowCurrencies(false)} aria-label="Retour" className="w-9 h-9 shrink-0 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h2 className="text-[20px] font-bold tracking-tight">Devise</h2>
            </div>
            <CurrencyPicker
              value={currency}
              onChange={(c) => {
                if (c) {
                  setCurrency(c);
                  setShowCurrencies(false);
                }
              }}
            />
          </div>
        ) : (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto px-5 pt-5 pb-3 animate-pick-back">
              <div className="sheet-head grid grid-cols-[2.25rem_1fr_2.25rem] items-center gap-2 mb-5">
                {!wallet ? (
                  <button onClick={() => setKind(null)} aria-label="Changer de type" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                ) : (
                  <span />
                )}
                <div className="min-w-0 text-center">
                  <h2 className="text-[17px] font-bold truncate">{wallet ? 'Modifier' : 'Nouveau portefeuille'}</h2>
                  <p className="text-[12px] text-slate-500 truncate">{kindInfo?.title}</p>
                </div>
                <button onClick={onClose} aria-label="Fermer" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Objectif proposé par Wallo : on dit d'où viennent les chiffres (tout reste modifiable) */}
              {draft && !wallet && (
                <div className="mb-5 flex items-start gap-3 rounded-2xl p-3.5 bg-emerald-500/10 animate-fade-in">
                  <span className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
                    <Sparkles className="w-4.5 h-4.5 text-emerald-600" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[14px] font-bold text-slate-900">Préparé pour toi</span>
                    <span className="block text-[12.5px] text-slate-600 leading-snug mt-0.5">{draft.note}</span>
                  </span>
                </div>
              )}
              {/* Pastille en grand (la toucher : icône et couleur), puis le nom */}
              <div className="flex flex-col items-center mb-5">
                <button
                  type="button"
                  onClick={() => setShowLook((v) => !v)}
                  aria-expanded={showLook}
                  aria-label="Changer l'icône et la couleur"
                  className="relative rounded-full cursor-pointer transition active:scale-95"
                >
                  <IconBadge icon={icon} image={image} color={color} size="lg" />
                  <span className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm">
                    <Pencil className="w-3 h-3 text-slate-600" />
                  </span>
                </button>
                {/* Pas de clavier ouvert d'office : il cachait le reste du formulaire (on touche le champ pour écrire) */}
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  aria-label="Nom"
                  placeholder={kind === 'goal' ? 'Nouvelle moto' : kind === 'credit' ? 'Carte Visa' : 'Airtel Money'}
                  className="field-plain mt-3 w-full bg-transparent text-center text-[22px] font-bold tracking-tight text-slate-900 outline-none placeholder:text-slate-300 placeholder:font-semibold"
                />
                <span className="text-[12px] text-slate-400">{name.trim() ? 'Nom du portefeuille' : 'Donne-lui un nom'}</span>
              </div>

              {showLook && (
                <div className="mb-5 p-3 rounded-2xl bg-slate-100 animate-fade-in">
                  <IconPicker choices={WALLET_ICON_CHOICES} icon={icon} image={image} color={color} onIcon={setIcon} onImage={setImage} />
                  <div className="text-xs font-semibold text-slate-500 mb-1">Couleur</div>
                  <ColorPicker value={color} onChange={setColor} />
                  <button type="button" onClick={() => setShowLook(false)} className="w-full py-2 rounded-xl text-[13px] font-bold text-blue-600 cursor-pointer">
                    OK
                  </button>
                </div>
              )}

              {/* Objectif : le montant à atteindre en grand */}
              {kind === 'goal' && (
                <div className="text-center mb-5">
                  <div className="text-[13px] font-medium text-slate-500 mb-1">Montant à atteindre</div>
                  <label className="inline-flex items-baseline justify-center gap-1.5 cursor-text">
                    <input
                      inputMode="decimal"
                      value={goal}
                      onChange={(e) => setGoal(e.target.value)}
                      placeholder="0"
                      aria-label={`Montant à atteindre (${currency})`}
                      style={{ width: `${Math.max(1, goal.length || 1) + 0.6}ch` }}
                      className="field-plain bg-transparent text-[44px] leading-none font-bold tracking-tight tabular-nums text-slate-900 text-right outline-none placeholder:text-slate-300 caret-[var(--accent-deep)]"
                    />
                    <span className="text-[22px] font-bold text-slate-400">{currency}</span>
                  </label>
                </div>
              )}

              <Group>
                {hasTransactions ? (
                  <div className="flex items-center gap-3 px-4 min-h-[48px]">
                    <span className="text-[15px] text-slate-900 shrink-0">Devise</span>
                    <span className="flex-1 min-w-0 text-right text-[15px] text-slate-500 truncate">{currency}</span>
                    <Lock className="w-4 h-4 text-slate-400 shrink-0" />
                  </div>
                ) : (
                  <NavRow label="Devise" display={`${currency} · ${currencyInfo(currency).country}`} onClick={() => setShowCurrencies(true)} />
                )}
                {kind === 'credit' && (
                  <>
                    <InputRow label="Limite de crédit" value={limit} onChange={setLimit} placeholder="500" suffix={currency} numeric />
                    <InputRow label="Déjà utilisé" value={balance} onChange={setBalance} placeholder="0" suffix={currency} numeric />
                  </>
                )}
                {kind === 'goal' && <InputRow label="Déjà épargné" value={balance} onChange={setBalance} placeholder="0" suffix={currency} numeric />}
                {kind === 'basic' && <InputRow label="Solde de départ" value={balance} onChange={setBalance} placeholder="0" suffix={currency} numeric />}
                {kind === 'goal' && (
                  <div className="px-3 py-2">
                    <div className="text-[13px] text-slate-500 px-1 mb-1">Date visée (facultatif)</div>
                    <DateField value={goalDate} onChange={setGoalDate} placeholder="Pas de date" shortcuts="future" min={localDay(new Date())} label="Date visée" />
                  </div>
                )}
              </Group>
              {kind === 'credit' && <p className="-mt-3.5 mb-5 px-4 text-[12px] text-slate-400">« Déjà utilisé » : ce que tu dois aujourd'hui.</p>}

              {kind === 'goal' && (
                <>
                  <Group title="Pourquoi cet objectif ?" hint="Facultatif. Il s'affiche sur ton objectif pour te motiver.">
                    <label className="flex items-center px-4 py-3 min-h-[48px] cursor-text transition-colors focus-within:bg-slate-200/50">
                      {/* Plusieurs lignes si besoin : la phrase reste lisible en entier */}
                      <textarea
                        ref={growWhy}
                        value={why}
                        onChange={(e) => setWhy(e.target.value.replace(/\n/g, ' '))}
                        maxLength={120}
                        rows={1}
                        placeholder="Pour aller au travail sans taxi-moto"
                        className="field-plain flex-1 min-w-0 resize-none overflow-hidden bg-transparent text-[15px] leading-snug text-slate-900 outline-none placeholder:text-slate-400"
                      />
                    </label>
                  </Group>

                  <Group
                    title="Pour t'aider"
                    hint={
                      remindOn
                        ? "Une notification ce jour-là, si tu n'as pas encore mis ce montant dans la semaine."
                        : 'Petite monnaie : chaque dépense est arrondie (4 300 FC → 5 000 FC) et Wallo te propose chaque semaine de verser la différence ici.'
                    }
                  >
                    <SwitchRow label="Rappel chaque semaine" checked={remindOn} onChange={setRemindOn} />
                    {remindOn && (
                      <>
                        <div className="grid grid-cols-7 gap-1 px-3 py-2.5 animate-fade-in">
                          {[1, 2, 3, 4, 5, 6, 0].map((d) => (
                            <button
                              key={d}
                              type="button"
                              onClick={() => setRemindDay(d)}
                              aria-label={WEEKDAYS[d]}
                              aria-pressed={remindDay === d}
                              className={`h-9 rounded-full text-[12px] font-bold cursor-pointer transition ${remindDay === d ? 'bg-accent' : 'bg-white text-slate-600'}`}
                            >
                              {WEEKDAYS[d].slice(0, 2)}
                            </button>
                          ))}
                        </div>
                        <InputRow label="Montant à mettre" value={remindAmount} onChange={setRemindAmount} placeholder="10" suffix={currency} numeric />
                      </>
                    )}
                    <SwitchRow label="Épargner la petite monnaie" checked={roundUp} onChange={setRoundUp} />
                  </Group>
                </>
              )}

              <Group hint={include ? 'Son argent compte dans « Ton solde » sur l\'accueil.' : 'Son argent ne compte pas dans « Ton solde » sur l\'accueil.'}>
                <SwitchRow label="Inclure dans le total" checked={include} onChange={setInclude} />
              </Group>
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
                    initialBalance: kind === 'credit' ? -parsedBalance || 0 : parsedBalance,
                    includeInTotal: include,
                    kind,
                    creditLimit: kind === 'credit' ? parsedLimit : undefined,
                    goalAmount: kind === 'goal' ? parsedGoal : undefined,
                    goalDate: kind === 'goal' && goalDate ? goalDate : undefined,
                    ...(kind === 'goal'
                      ? {
                          ...(why.trim() || wallet?.goalWhy ? { goalWhy: why.trim() } : {}),
                          ...(remindOn
                            ? { goalReminder: { day: remindDay, amount: num(remindAmount) } }
                            : wallet?.goalReminder
                              ? { goalReminder: null }
                              : {}),
                          ...(roundUp || wallet?.roundUp ? { roundUp } : {}),
                        }
                      : {}),
                  })
                }
                className="w-full py-3.5 rounded-2xl bg-accent hover:bg-accent-hover disabled:opacity-40 font-bold text-[15px] cursor-pointer transition active:scale-[0.98]"
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

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

// Versement proposé par l'app (arrondis, défi week-end) : on retient qu'il est fait pour ne pas le reproposer
export interface DepositTag {
  key: string; // ex. id de l'objectif (arrondis) ou id + ':we' (défi week-end)
  week: string;
  note: string; // libellé de l'opération
  intro: string;
}
type OnDeposit = (amount?: number, tag?: DepositTag) => void;

// ---------- Objectifs : anneau, statut, rythme (page Objectifs, accueil, détail) ----------
const roundMoney = (v: number, currency: string) => formatMoney(v, currency, { ...getPrefs(), decimals: 'auto' });

// Pastille courte : où on en est (avance / retard / estimation sans date)
const GoalStatusPill: React.FC<{ wallet: Wallet; insight: GoalInsight }> = ({ wallet: w, insight: { status: st, saved } }) => {
  if (!st) {
    if (saved > 0) return null;
    return (
      <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[12px] font-semibold whitespace-nowrap bg-slate-100 text-slate-600">
        <Sprout className="w-3.5 h-3.5 stroke-[2.4]" />
        Premier dépôt à faire
      </span>
    );
  }
  // Défi à rythme fixe : l'avance / le retard « en ligne droite » ne veut rien dire
  if (fixedPace(w) && (st.kind === 'ahead' || st.kind === 'behind' || st.kind === 'onTrack')) return null;
  const ok = 'bg-emerald-500/10 text-emerald-600';
  const warn = 'bg-amber-500/10 text-amber-600';
  const neutral = 'bg-slate-100 text-slate-600';
  const [Icon, text, tone] =
    st.kind === 'reached' ? [PartyPopper, 'Objectif atteint', ok]
    : st.kind === 'ahead' ? [TrendingUp, `${st.days} jours d'avance`, ok]
    : st.kind === 'onTrack' ? [CircleCheck, 'Dans les temps', ok]
    : st.kind === 'behind' ? [Clock, `${roundMoney(st.missing, w.currency)} de retard`, warn]
    : st.kind === 'passed' ? [CalendarX, 'Date visée passée', neutral]
    : st.kind === 'eta' ? [CalendarClock, `Vers ${st.date.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' })} à ce rythme`, neutral]
    : st.kind === 'etaTooFar' ? [CalendarClock, 'Plus de 10 ans à ce rythme', warn]
    : st.kind === 'stalled' ? [Pause, "L'épargne n'avance plus", warn]
    : [Sprout, 'Estimation bientôt', neutral];
  return (
    <span className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[12px] font-semibold whitespace-nowrap ${tone}`}>
      <Icon className="w-3.5 h-3.5 stroke-[2.4]" />
      {text}
    </span>
  );
};

// Pastille de série : semaines d'affilée avec un dépôt (à partir de 2)
const GoalStreakPill: React.FC<{ wallet: Wallet; transactions: Transaction[] }> = ({ wallet: w, transactions }) => {
  const { weekStart } = useDisplayPrefs();
  const st = useMemo(() => goalStreak(w, transactions, weekStart), [w, transactions, weekStart]);
  if (st.current < 2) return null;
  return (
    <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[12px] font-semibold whitespace-nowrap bg-orange-500/10 text-orange-600">
      <Flame className="w-3.5 h-3.5 stroke-[2.4]" />
      {st.current} semaines d'affilée
    </span>
  );
};

// Cas particuliers : solde négatif (plus retiré que mis) ou objectif dépassé
const GoalBalanceNote: React.FC<{ wallet: Wallet; transactions: Transaction[]; className?: string }> = ({ wallet: w, transactions, className = '' }) => {
  const balance = walletBalance(w, transactions);
  if (balance < 0) {
    return (
      <p className={`text-[12px] font-semibold text-red-600 ${className}`}>
        Solde négatif : {roundMoney(balance, w.currency)}. Tu as retiré plus que ce que tu avais mis.
      </p>
    );
  }
  if (w.goalAmount && balance > w.goalAmount) {
    return (
      <p className={`text-[12px] font-semibold text-emerald-600 ${className}`}>
        Tu as dépassé ton objectif de {roundMoney(balance - w.goalAmount, w.currency)}.
      </p>
    );
  }
  return null;
};

// Défis à rythme fixe (52 semaines, chaque jour) : le rythme « par jour / semaine / mois » ne s'applique pas
const fixedPace = (w: Wallet) => w.challenge?.type === '52w' || w.challenge?.type === 'daily';

// Défi en cours : où on en est
const ChallengeLine: React.FC<{ wallet: Wallet; className?: string }> = ({ wallet: w, className = '' }) => {
  const ch = w.challenge;
  if (!ch) return null;
  const text =
    ch.type === '52w'
      ? `Défi 52 semaines · semaine ${challengeWeek(ch)} sur 52`
      : ch.type === 'daily'
        ? `Défi chaque jour · jour ${Math.min(challengeDay(ch), ch.days ?? 30)} sur ${ch.days ?? 30}`
        : ch.type === 'weekend'
          ? 'Défi week-end sans dépense'
          : 'Défi petite monnaie';
  return (
    <p className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-violet-500/10 text-violet-600 text-[12px] font-semibold ${className}`}>
      <Trophy className="w-3.5 h-3.5 stroke-[2.4]" /> {text}
    </p>
  );
};

// « Pourquoi cet objectif ? » : rappelé en citation
const GoalWhy: React.FC<{ wallet: Wallet; className?: string }> = ({ wallet: w, className = '' }) =>
  w.goalWhy?.trim() ? (
    <p className={`flex items-start gap-2 text-[13px] italic text-slate-600 ${className}`}>
      <Quote className="w-3.5 h-3.5 shrink-0 mt-0.5 text-slate-400 not-italic" />
      <span className="min-w-0">{w.goalWhy.trim()}</span>
    </p>
  ) : null;

// Ce qu'il y a à faire maintenant : le rappel du jour, les arrondis de la semaine
const GoalActions: React.FC<{
  wallet: Wallet;
  wallets: Wallet[];
  transactions: Transaction[]; // au moins celles de l'objectif (rappel)
  spending: Transaction[]; // dépenses hors objectifs (arrondis)
  settings: Settings;
  onDeposit: OnDeposit;
}> = ({ wallet: w, wallets, transactions, spending, settings, onDeposit }) => {
  const { weekStart } = useDisplayPrefs();
  const due = reminderDue(w, transactions, weekStart);
  const week = weekKey(weekStart);
  const rounds = useMemo(
    () => (w.roundUp ? weekRoundUps(w, wallets, spending, weekStart, (v, from, to) => convertBetween(v, from, to, settings)) : null),
    [w, wallets, spending, weekStart, settings]
  );
  const roundLeft = rounds ? Math.round((rounds.total - roundUpAlreadyPaid(w.id, week)) * 100) / 100 : 0;
  // Défi week-end : ce que tu n'as pas dépensé le dernier week-end, par rapport à d'habitude
  const weekend = useMemo(
    () => (w.challenge?.type === 'weekend' ? weekendSaving(w, wallets, spending, (v, from, to) => convertBetween(v, from, to, settings)) : null),
    [w, wallets, spending, settings]
  );
  const weekendLeft = weekend ? Math.round((weekend.saved - roundUpAlreadyPaid(`${w.id}:we`, weekend.key)) * 100) / 100 : 0;
  if (due <= 0 && roundLeft <= 0 && weekendLeft <= 0) return null;
  const ch = w.challenge;
  const box = 'mt-4 flex items-center gap-3 rounded-2xl p-3.5';
  const btn = 'shrink-0 h-9 px-3.5 rounded-xl text-[13px] font-bold cursor-pointer active:scale-95 transition';
  return (
    <div onClick={(e) => e.stopPropagation()}>
      {due > 0 && (w.goalReminder || ch?.type === 'daily') && (
        <div className={`${box} bg-accent/15`}>
          <BellRing className="w-5 h-5 shrink-0 text-slate-700" />
          <p className="flex-1 min-w-0 text-[13px] text-slate-700 leading-snug">
            {ch?.type === 'daily'
              ? <>Défi du jour : mets <b className="tabular-nums">{roundMoney(due, w.currency)}</b>.</>
              : ch?.type === '52w'
                ? <>Semaine {challengeWeek(ch)} du défi : mets <b className="tabular-nums">{roundMoney(due, w.currency)}</b>.</>
                : <>C'est {WEEKDAYS[w.goalReminder!.day]} : le jour de mettre <b className="tabular-nums">{roundMoney(due, w.currency)}</b>.</>}
          </p>
          <button onClick={() => onDeposit(due)} className={`${btn} bg-accent hover:bg-accent-hover`}>
            Je le fais
          </button>
        </div>
      )}
      {roundLeft > 0 && rounds && (
        <div className={`${box} bg-emerald-500/10`}>
          <Coins className="w-5 h-5 shrink-0 text-emerald-600" />
          <p className="flex-1 min-w-0 text-[13px] text-slate-700 leading-snug">
            Petite monnaie de la semaine : <b className="tabular-nums">{roundMoney(roundLeft, w.currency)}</b> ({rounds.count} dépense{rounds.count > 1 ? 's' : ''}).
          </p>
          <button
            onClick={() => onDeposit(roundLeft, { key: w.id, week, note: 'Arrondis de la semaine', intro: 'La petite monnaie de tes dépenses de la semaine.' })}
            className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}
          >
            Verser
          </button>
        </div>
      )}
      {weekendLeft > 0 && weekend && (
        <div className={`${box} bg-emerald-500/10`}>
          <Sofa className="w-5 h-5 shrink-0 text-emerald-600" />
          <p className="flex-1 min-w-0 text-[13px] text-slate-700 leading-snug">
            Ce week-end : {roundMoney(weekend.last, w.currency)} dépensés au lieu de {roundMoney(weekend.usual, w.currency)} d'habitude. Verse les{' '}
            <b className="tabular-nums">{roundMoney(weekendLeft, w.currency)}</b> économisés.
          </p>
          <button
            onClick={() => onDeposit(weekendLeft, { key: `${w.id}:we`, week: weekend.key, note: 'Défi week-end', intro: "Ce que tu n'as pas dépensé ce week-end." })}
            className={`${btn} bg-emerald-600 text-white hover:bg-emerald-700`}
          >
            Verser
          </button>
        </div>
      )}
    </div>
  );
};

// Photo de l'objectif : en noir et blanc et floue au début, elle se révèle à mesure qu'on épargne
const GoalPhoto: React.FC<{ wallet: Wallet; ratio: number; className?: string }> = ({ wallet: w, ratio, className = '' }) => {
  if (!w.image) return null;
  const p = Math.min(1, Math.max(0, ratio));
  return (
    <div className={`relative h-40 rounded-[22px] overflow-hidden bg-slate-100 ${className}`}>
      <img
        src={w.image}
        alt=""
        className="absolute inset-0 w-full h-full object-cover scale-110 transition-[filter] duration-700"
        style={{ filter: `grayscale(${(1 - p).toFixed(2)}) blur(${((1 - p) * 6).toFixed(1)}px)` }}
      />
      {p < 1 && (
        <span className="absolute bottom-2.5 left-2.5 px-2.5 py-1 rounded-full bg-black/45 text-white text-[11px] font-semibold backdrop-blur-sm">
          Se dévoile à {Math.round(p * 100)} %
        </span>
      )}
    </div>
  );
};

// Largeur d'un élément (pour dessiner la courbe à la bonne taille)
function useBoxWidth<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(Math.round(el.getBoundingClientRect().width));
    const ro = new ResizeObserver(() => setW(Math.round(el.getBoundingClientRect().width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// Courbe d'évolution : l'épargne réelle (trait plein), la ligne « dans les temps » (tirets)
// et la suite au rythme actuel (pointillés)
const GoalChart: React.FC<{ wallet: Wallet; transactions: Transaction[] }> = ({ wallet: w, transactions }) => {
  const [ref, width] = useBoxWidth<HTMLDivElement>();
  const data = useMemo(() => goalSeries(w, transactions), [w, transactions]);
  if (!data || !w.goalAmount) return null;
  const goal = w.goalAmount;
  const DAY = 86400000;
  const today = data.points[data.points.length - 1].t;
  const saved = data.points[data.points.length - 1].v;
  const target = w.goalDate ? new Date(w.goalDate + 'T00:00').getTime() : null;
  // Rythme moyen depuis le début : sert à prolonger la courbe
  const elapsed = Math.max(1, (today - data.start.getTime()) / DAY);
  const pace = (saved - data.startAmount) / elapsed;
  const reach = saved < goal && pace > 0 ? today + ((goal - saved) / pace) * DAY : null;
  const end = Math.max(today + DAY, target ?? 0, !target && reach ? Math.min(reach, today + 730 * DAY) : 0);
  const t0 = data.start.getTime();

  const H = 150;
  const W = Math.max(0, width - 16); // largeur du dessin : la boîte moins ses marges (px-2)
  const pad = { l: 6, r: 8, t: 14, b: 22 };
  const top = Math.max(goal, saved) * 1.05;
  const x = (t: number) => pad.l + ((t - t0) / (end - t0 || 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - v / top) * (H - pad.t - pad.b);
  // Marches : le solde reste plat jusqu'au dépôt suivant
  const line = data.points.map((p, i) => (i === 0 ? `M${x(p.t)},${y(p.v)}` : `H${x(p.t)}V${y(p.v)}`)).join('');
  const area = `${line}V${y(0)}H${x(t0)}Z`;
  const fmt = (t: number) => new Date(t).toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
  const projEnd = reach ? Math.min(reach, end) : null;

  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between mb-1.5 px-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Évolution</span>
        <span className="text-[11px] font-medium text-slate-400">Objectif {roundMoney(goal, w.currency)}</span>
      </div>
      <div ref={ref} className="rounded-2xl bg-slate-50 px-2 pt-1">
        {width > 0 && (
          <svg width={W} height={H} role="img" aria-label="Évolution de l'épargne" className="block overflow-hidden">
            {/* Ligne de l'objectif */}
            <line x1={x(t0)} x2={x(end)} y1={y(goal)} y2={y(goal)} strokeWidth={1} strokeDasharray="2 4" className="stroke-slate-300" />
            {/* Dans les temps : du départ à l'objectif, le jour visé */}
            {target && target > t0 && (
              <line x1={x(t0)} y1={y(data.startAmount)} x2={x(target)} y2={y(goal)} strokeWidth={1.5} strokeDasharray="5 4" className="stroke-slate-400" />
            )}
            <path d={area} style={{ fill: 'rgb(var(--accent-rgb) / 0.16)' }} />
            <path d={line} fill="none" strokeWidth={2.5} strokeLinejoin="round" style={{ stroke: 'var(--accent)' }} />
            {/* À ce rythme */}
            {projEnd && (
              <line
                x1={x(today)}
                y1={y(saved)}
                x2={x(projEnd)}
                y2={y(saved + pace * ((projEnd - today) / DAY))}
                strokeWidth={2}
                strokeDasharray="1 5"
                strokeLinecap="round"
                style={{ stroke: 'var(--accent)' }}
              />
            )}
            <circle cx={x(today)} cy={y(saved)} r={4.5} strokeWidth={2.5} className="fill-white" style={{ stroke: 'var(--accent)' }} />
            <text x={pad.l} y={H - 6} className="fill-slate-400 text-[10px]">{fmt(t0)}</text>
            <text x={W - 2} y={H - 6} textAnchor="end" className="fill-slate-400 text-[10px]">{fmt(end)}</text>
          </svg>
        )}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 px-1 text-[11px] text-slate-500 [&>span]:whitespace-nowrap">
        <span className="flex items-center gap-1.5"><span className="w-3.5 h-[2.5px] rounded-full bg-accent" />Ton épargne</span>
        {target && <span className="flex items-center gap-1.5"><span className="w-3.5 border-t-[1.5px] border-dashed border-slate-400" />Dans les temps</span>}
        {projEnd && <span className="flex items-center gap-1.5"><span className="w-3.5 border-t-2 border-dotted" style={{ borderColor: 'var(--accent)' }} />À ce rythme</span>}
      </div>
    </div>
  );
};

// ---------- Objectif expliqué simplement (pour tout le monde) ----------
// Une phrase : où j'en suis
function goalSentence(w: Wallet, g: GoalInsight): { text: string; tone: string; Icon: typeof Plus } {
  const st = g.status;
  const ok = 'bg-emerald-500/10 text-emerald-700';
  const warn = 'bg-amber-500/10 text-amber-700';
  const neutral = 'bg-slate-100 text-slate-700';
  if (!st) return { text: 'Fais ton premier dépôt pour commencer !', tone: neutral, Icon: Sprout };
  switch (st.kind) {
    case 'reached':
      return { text: 'Objectif atteint, bravo !', tone: ok, Icon: PartyPopper };
    case 'ahead':
      return { text: `Bravo, tu as ${st.days} jours d'avance !`, tone: ok, Icon: TrendingUp };
    case 'onTrack':
      return { text: 'Tu es dans les temps, continue comme ça.', tone: ok, Icon: CircleCheck };
    case 'behind':
      return { text: `Tu es un peu en retard : il manque ${roundMoney(st.missing, w.currency)} pour rattraper.`, tone: warn, Icon: Clock };
    case 'passed':
      return { text: 'La date prévue est passée. Choisis une nouvelle date dans « Modifier ».', tone: warn, Icon: CalendarX };
    case 'eta':
      return { text: `À ce rythme, tu y arriveras vers ${st.date.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}.`, tone: neutral, Icon: CalendarClock };
    case 'etaTooFar':
      return { text: 'À ce rythme, ça prendra très longtemps. Essaie de mettre un peu plus souvent.', tone: warn, Icon: CalendarClock };
    case 'stalled':
      return { text: "Ton épargne ne bouge plus depuis quelques semaines. Un petit dépôt ?", tone: warn, Icon: Pause };
    case 'tooEarly':
      return { text: 'Continue tes dépôts : bientôt on te dira quand tu y arriveras.', tone: neutral, Icon: Sprout };
  }
}

// La phrase dans sa bulle de couleur, avec son icône
const GoalSentence: React.FC<{ wallet: Wallet; insight: GoalInsight; className?: string }> = ({ wallet: w, insight: g, className = '' }) => {
  const { text, tone, Icon } = goalSentence(w, g);
  return (
    <p className={`flex items-start gap-2 rounded-2xl px-3.5 py-2.5 text-[13px] font-semibold leading-snug ${tone} ${className}`}>
      <Icon className="w-4 h-4 shrink-0 mt-px stroke-[2.4]" />
      <span className="min-w-0">{text}</span>
    </p>
  );
};

// Le prochain pas : UN montant à retenir (par semaine, ou par jour si c'est bientôt)
const GoalNextStep: React.FC<{ wallet: Wallet; insight: GoalInsight; onEdit?: () => void; compact?: boolean }> = ({ wallet: w, insight: g, onEdit, compact }) => {
  if (g.left <= 0) return null;
  const date = w.goalDate ? new Date(w.goalDate + 'T00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : '';
  let big = '';
  let rest: React.ReactNode = null;
  if (g.pace && g.pace.daysLeft === 0) {
    big = roundMoney(g.left, w.currency);
    rest = "à mettre aujourd'hui : c'est le dernier jour !";
  } else if (g.pace) {
    const weekly = g.pace.daysLeft >= 14 && g.pace.perWeek;
    big = roundMoney(weekly ? g.pace.perWeek! : g.pace.perDay, w.currency);
    rest = <>{weekly ? 'par semaine' : 'par jour'} pour finir le {date}.</>;
  } else if (w.goalDate) {
    // Date dépassée sans avoir atteint l'objectif : proposer une nouvelle date
    return compact ? null : (
      <div className="rounded-2xl bg-amber-500/10 p-4 text-sm font-medium text-amber-600">
        La date visée est passée.{' '}
        {onEdit ? (
          <button onClick={onEdit} className="font-bold underline underline-offset-2 cursor-pointer">Choisis une nouvelle date</button>
        ) : (
          'Choisis une nouvelle date'
        )}{' '}
        pour savoir combien mettre chaque semaine.
      </div>
    );
  } else {
    // Sans date : impossible de dire combien mettre
    return compact ? null : (
      <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
        Pas de date prévue.{' '}
        {onEdit ? (
          <button onClick={onEdit} className="font-bold text-slate-900 underline underline-offset-2 cursor-pointer">Ajoute une date</button>
        ) : (
          'Ajoute une date'
        )}{' '}
        pour savoir combien mettre chaque semaine.
      </div>
    );
  }
  if (compact) {
    return (
      <p className="flex items-start gap-2 text-[13px] text-slate-600">
        <ArrowRight className="w-4 h-4 shrink-0 mt-px text-slate-400" />
        <span className="min-w-0">
          Mets <b className="text-slate-900 tabular-nums">{big}</b> {rest}
        </span>
      </p>
    );
  }
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="text-[12px] font-semibold text-slate-500 mb-1">Ton prochain pas</div>
      <div className="text-[15px] text-slate-700 leading-snug">
        Mets <span className="text-[22px] font-bold tracking-tight tabular-nums text-slate-900">{big}</span> {rest}
      </div>
    </div>
  );
};

// « Bon à savoir » : quelques lignes simples (série, équivalence, dates, membres)
const GoalFacts: React.FC<{ wallet: Wallet; insight: GoalInsight; transactions: Transaction[]; spending: Transaction[] }> = ({ wallet: w, insight: g, transactions, spending }) => {
  const { weekStart } = useDisplayPrefs();
  const streak = useMemo(() => goalStreak(w, transactions, weekStart), [w, transactions, weekStart]);
  const equivalence = useMemo(() => goalEquivalence(w, g.saved, spending), [w, g.saved, spending]);
  const fmt = (d: Date) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const rows: { Icon: typeof Plus; tone: string; text: React.ReactNode }[] = [];
  // La série est déjà dans la pastille : ici, seulement le rappel s'il manque le dépôt de la semaine
  if (streak.current >= 2 && !streak.thisWeekDone) {
    rows.push({
      Icon: Flame,
      tone: 'text-orange-500',
      text: `Fais un dépôt avant ${streak.lastDay.toLocaleDateString('fr-FR', { weekday: 'long' })} pour garder ta série de ${streak.current} semaines.`,
    });
  }
  if (equivalence) rows.push({ Icon: Lightbulb, tone: 'text-amber-500', text: `Tu as déjà épargné ${equivalence}.` });
  if (!rows.length) return null;
  return (
    <div className="bg-white rounded-3xl border border-slate-100 p-4 mb-3">
      <div className="text-[13px] font-bold text-slate-900 mb-2">Bon à savoir</div>
      <ul className="space-y-2.5">
        {rows.map((r, i) => (
          <li key={i} className="flex gap-2.5 text-[14px] leading-snug text-slate-700">
            <r.Icon aria-hidden className={`w-[18px] h-[18px] shrink-0 mt-px ${r.tone}`} />
            <span className="min-w-0">{r.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

// Page d'un objectif : en haut l'essentiel (anneau, montant, phrase, prochain pas, bouton),
// le reste (graphique, chiffres) derrière « Voir plus de détails »
const GoalDetailTop: React.FC<{
  wallet: Wallet;
  transactions: Transaction[];
  spending: Transaction[];
  wallets: Wallet[];
  settings: Settings;
  onDeposit?: OnDeposit;
  onEdit: () => void;
}> = ({ wallet: w, transactions, spending, wallets, settings, onDeposit, onEdit }) => {
  const [more, setMore] = useState(false);
  const g = useMemo(() => goalInsight(w, transactions), [w, transactions]);
  if (!g || !w.goalAmount) return null;
  const money = (v: number) => formatMoney(v, w.currency);
  return (
    <>
      <div className="bg-white rounded-3xl border border-slate-100 p-4 mb-3">
        <GoalPhoto wallet={w} ratio={g.ratio} className="mb-4" />
        <ChallengeLine wallet={w} className="mb-3" />
        <GoalWhy wallet={w} className="mb-3" />
        <div className="flex gap-3 mb-3">
          <Stat label="Épargné" value={money(g.saved)} tone="text-emerald-600" />
          <Stat label="Reste" value={money(g.left)} />
          <Stat label="Objectif" value={money(w.goalAmount)} />
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div className={`h-full rounded-full animate-bar ${g.ratio >= 1 ? 'bg-emerald-500' : 'bg-accent'}`} style={{ width: `${Math.min(100, g.ratio * 100)}%` }} />
        </div>
        {/* Le pourcentage puis les pastilles, alignés à gauche sur la même ligne (passent à la ligne si besoin) */}
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          <span className="h-7 inline-flex items-center pr-1 whitespace-nowrap text-[14px] font-bold text-slate-900 tabular-nums">{Math.round(g.ratio * 100)} %</span>
          <GoalStatusPill wallet={w} insight={g} />
          <GoalStreakPill wallet={w} transactions={transactions} />
        </div>
        <GoalBalanceNote wallet={w} transactions={transactions} className="mt-2" />
        <GoalDates wallet={w} insight={g} />
        {fixedPace(w) ? null : g.pace ? (
          <GoalPace wallet={w} insight={g} />
        ) : (
          <div className="mt-4 empty:hidden">
            <GoalNextStep wallet={w} insight={g} onEdit={onEdit} />
          </div>
        )}
        {onDeposit && <GoalActions wallet={w} wallets={wallets} transactions={transactions} spending={spending} settings={settings} onDeposit={onDeposit} />}
        {onDeposit && g.left > 0 && (
          <button
            onClick={() => onDeposit()}
            className="mt-4 w-full h-12 rounded-2xl bg-accent hover:bg-accent-hover text-[15px] font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98] transition"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" /> Ajouter de l'argent
          </button>
        )}
      </div>

      <GoalFacts wallet={w} insight={g} transactions={transactions} spending={spending} />

      {transactions.some((t) => t.walletId === w.id) && (
      <div className="bg-white rounded-3xl border border-slate-100 mb-3 overflow-hidden">
        <button
          onClick={() => setMore((v) => !v)}
          aria-expanded={more}
          className="w-full flex items-center justify-between px-4 py-3.5 text-[14px] font-semibold text-slate-700 cursor-pointer"
        >
          {more ? 'Masquer le graphique' : 'Voir le graphique'}
          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${more ? 'rotate-180' : ''}`} />
        </button>
        {more && (
          <div className="px-4 pb-4 -mt-2 animate-fade-in">
            <GoalChart wallet={w} transactions={transactions} />
          </div>
        )}
      </div>
      )}
    </>
  );
};

// Les deux dates de l'objectif, côte à côte : quand il a commencé (1re opération) et la date visée
const GoalDates: React.FC<{ wallet: Wallet; insight: GoalInsight }> = ({ wallet: w, insight: { start } }) => {
  const fmt = (d: Date) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  const cells = [
    { Icon: CalendarPlus, label: 'Commencé le', value: start ? fmt(start) : 'Pas encore' },
    { Icon: Flag, label: 'Date visée', value: w.goalDate ? fmt(new Date(w.goalDate + 'T00:00')) : 'Aucune' },
  ];
  return (
    <div className="mt-4 flex rounded-2xl bg-slate-50 divide-x divide-slate-200/70">
      {cells.map(({ Icon, label, value }) => (
        <div key={label} className="flex-1 min-w-0 py-2.5 px-3 flex items-center gap-2.5">
          <Icon className="w-4 h-4 text-slate-400 shrink-0" />
          <div className="min-w-0">
            <div className="text-[11px] font-medium text-slate-500">{label}</div>
            <div className="text-[13px] font-semibold text-slate-900 tabular-nums truncate">{value}</div>
          </div>
        </div>
      ))}
    </div>
  );
};

// À épargner : un bloc groupé (par jour | par semaine | par mois)
const GoalPace: React.FC<{ wallet: Wallet; insight: GoalInsight }> = ({ wallet: w, insight: { pace, left } }) => {
  if (!pace) return null;
  if (pace.daysLeft === 0) return <p className="text-xs text-slate-500 mt-3">C'est aujourd'hui ! Il reste {roundMoney(left, w.currency)} à épargner.</p>;
  const cells = [
    { value: pace.perDay, unit: 'par jour' },
    ...(pace.perWeek ? [{ value: pace.perWeek, unit: 'par semaine' }] : []),
    ...(pace.perMonth ? [{ value: pace.perMonth, unit: 'par mois' }] : []),
  ];
  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between mb-1.5 px-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">À épargner</span>
        <span className="text-[11px] font-medium text-slate-400 tabular-nums">Encore {timeLeftLabel(pace.daysLeft)}</span>
      </div>
      <div className="flex rounded-2xl bg-slate-50 divide-x divide-slate-200/70">
        {cells.map((c) => {
          const v = roundMoney(c.value, w.currency);
          return (
          <div key={c.unit} className="@container flex-1 min-w-0 py-2.5 px-1.5 text-center">
            {/* Rétrécit pour tenir dans la case (260 000 CDF sur un petit écran) */}
            <div
              className="font-bold tracking-tight tabular-nums text-slate-900 whitespace-nowrap"
              style={{ fontSize: `min(15px, ${(165 / Math.max(v.length, 1)).toFixed(2)}cqi)` }}
            >
              {v}
            </div>
            <div className="text-[11px] font-medium text-slate-500">{c.unit}</div>
          </div>
          );
        })}
      </div>
    </div>
  );
};

// Anneau de progression (façon Forme d'Apple), pourcentage au centre
export const GoalRing: React.FC<{ ratio: number; size?: number }> = ({ ratio, size = 68 }) => {
  const id = useId();
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, Math.max(0, ratio));
  const done = ratio >= 1;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* 100 % : dégradé vert ; sinon la couleur d'accent choisie (Paramètres › Apparence), pleine */}
        {done && (
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#34d399" />
              <stop offset="100%" stopColor="#059669" />
            </linearGradient>
          </defs>
        )}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} style={{ stroke: done ? 'rgb(16 185 129 / 0.15)' : 'rgb(var(--accent-rgb) / 0.22)' }} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          style={{ stroke: done ? `url(#${id})` : 'var(--accent)' }}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      {/* Le pourcentage grandit avec l'anneau */}
      <div
        className="absolute inset-0 flex items-center justify-center font-bold tracking-tight tabular-nums text-slate-900"
        style={{ fontSize: Math.max(15, Math.round(size * 0.22)) }}
      >
        {Math.round(ratio * 100)}<span className="font-semibold ml-px" style={{ fontSize: '0.6em' }}>%</span>
      </div>
    </div>
  );
};

// Carte d'un objectif sur la page Objectifs
const GoalCard: React.FC<{
  wallet: Wallet;
  wallets: Wallet[];
  transactions: Transaction[];
  spending: Transaction[];
  settings: Settings;
  onOpen: () => void;
  onDeposit: OnDeposit;
}> = ({ wallet: w, wallets, transactions, spending, settings, onOpen, onDeposit }) => {
  const g = goalInsight(w, transactions);
  const equivalence = useMemo(() => (g ? goalEquivalence(w, g.saved, spending) : null), [w, g?.saved, spending]);
  if (!g || !w.goalAmount) return null;
  const fmt = (d: Date) => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  const target = w.goalDate ? fmt(new Date(w.goalDate + 'T00:00')) : null;
  // Même année des deux côtés : on ne l'écrit qu'une fois (« Du 1 juil. au 31 déc. 2026 »)
  const sameYear = g.start && w.goalDate && g.start.getFullYear() === Number(w.goalDate.slice(0, 4));
  const startText = g.start ? (sameYear ? g.start.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : fmt(g.start)) : '';
  const when = g.start
    ? target ? `Du ${startText} au ${target}` : `Depuis le ${fmt(g.start)}`
    : target ? `D'ici le ${target}` : 'Sans date visée';
  const savedText = roundMoney(g.saved, w.currency);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => e.key === 'Enter' && onOpen()}
      className="bg-white rounded-[28px] border border-slate-100 p-5 shadow-[0_1px_2px_rgb(0_0_0/0.03),0_8px_24px_-12px_rgb(0_0_0/0.08)] cursor-pointer active:scale-[0.985] transition"
    >
      <GoalPhoto wallet={w} ratio={g.ratio} className="-mx-1 -mt-1 mb-4" />
      <div className="flex items-start gap-4">
        <div className="@container flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <IconBadge icon={w.icon} image={w.image} color={w.color} size="sm" />
            <div className="min-w-0">
              <div className="text-[15px] leading-snug font-semibold text-slate-900 line-clamp-2 break-words">{w.name}</div>
              <div className="text-[12px] leading-snug text-slate-500">{when}</div>
            </div>
          </div>
          <div
            className="mt-4 leading-none font-bold tracking-tight tabular-nums text-slate-900 whitespace-nowrap"
            style={{ fontSize: `min(28px, ${(175 / Math.max(savedText.length, 1)).toFixed(2)}cqi)` }}
          >
            {savedText}
          </div>
          <div className="mt-1.5 text-[13px] text-slate-500 tabular-nums">
            sur {roundMoney(w.goalAmount, w.currency)}
            {g.left > 0 && <> · <span className="whitespace-nowrap">reste {roundMoney(g.left, w.currency)}</span></>}
          </div>
          <GoalBalanceNote wallet={w} transactions={transactions} className="mt-1.5" />
        </div>
        <GoalRing ratio={g.ratio} />
      </div>
      <ChallengeLine wallet={w} className="mt-3" />
      <GoalWhy wallet={w} className="mt-3" />
      {equivalence && (
        <p className="mt-3 flex items-start gap-2 text-[13px] text-slate-600">
          <Lightbulb className="w-4 h-4 shrink-0 mt-px text-amber-500" />
          <span className="min-w-0">Tu as déjà épargné {equivalence}.</span>
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-1.5 empty:hidden">
        <GoalStatusPill wallet={w} insight={g} />
        <GoalStreakPill wallet={w} transactions={transactions} />
      </div>
      <GoalActions wallet={w} wallets={wallets} transactions={transactions} spending={spending} settings={settings} onDeposit={onDeposit} />
      {!fixedPace(w) && <GoalPace wallet={w} insight={g} />}
      {g.left > 0 && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDeposit();
          }}
          className="mt-4 w-full h-11 rounded-2xl bg-slate-100 hover:bg-slate-200/70 text-sm font-bold text-slate-900 flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98] transition"
        >
          <Plus className="w-4 h-4 stroke-[2.5]" /> Ajouter de l'argent
        </button>
      )}
    </div>
  );
};

// Résumé propre au type (crédit : utilisé / disponible ; objectif : progression, date, rythme).
// Utilisé dans le détail du portefeuille et sur l'accueil.
// detail : page du portefeuille (photo, équivalence, courbe, membres) ; allTransactions : toutes les opérations (équivalence)
export const WalletKindSummary: React.FC<{
  wallet: Wallet;
  balance: number;
  transactions: Transaction[];
  detail?: boolean;
  allTransactions?: Transaction[];
  onDeposit?: () => void;
}> = ({ wallet: w, balance, transactions, detail, allTransactions, onDeposit }) => {
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
    const g = goalInsight(w, transactions, now);
    if (!g) return null;
      return (
      <>
        <div className="flex items-baseline justify-between gap-2 mb-2">
          <span className="text-[15px] font-bold tabular-nums text-slate-900">
            {roundMoney(g.saved, w.currency)} <span className="text-[13px] font-medium text-slate-500">sur {roundMoney(w.goalAmount, w.currency)}</span>
          </span>
          <span className="shrink-0 text-xs font-semibold text-slate-500 tabular-nums">{Math.min(100, Math.round(g.ratio * 100))} %</span>
        </div>
        <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
          <div className={`h-full rounded-full animate-bar ${g.ratio >= 1 ? 'bg-emerald-500' : 'bg-accent'}`} style={{ width: `${Math.min(100, g.ratio * 100)}%` }} />
        </div>
        <GoalSentence wallet={w} insight={g} className="mt-3" />
        <div className="mt-2.5 empty:hidden">
          <GoalNextStep wallet={w} insight={g} compact />
        </div>
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
          <div className="text-[12px] font-semibold text-slate-500">{info.title}{shared && ` · partagé à ${activeMembers(wallet).length + 1}`}</div>
        </div>
        {shared && (
          <span className="ml-auto">
            <MemberStack wallet={wallet} size="sm" />
          </span>
        )}
      </div>
      <WalletKindSummary wallet={wallet} balance={walletBalance(wallet, transactions)} transactions={transactions} />
      {shared && <SharedMonthLine wallet={wallet} transactions={transactions} />}
    </div>
  );
};

// Accueil : ce que chacun a versé dans le portefeuille partagé ce mois-ci
const SharedMonthLine: React.FC<{ wallet: Wallet; transactions: Transaction[] }> = ({ wallet, transactions }) => {
  const now = new Date();
  const put = new Map<string, number>();
  for (const t of transactions) {
    if (t.walletId !== wallet.id || t.amount <= 0 || t.type === 'adjustment') continue;
    if (!inThisMonth(t.createdAt, now)) continue;
    const id = t.memberId || ME_ID;
    put.set(id, (put.get(id) ?? 0) + t.amount);
  }
  const people = [ME_ID, ...activeMembers(wallet).map((m) => m.id)];
  return (
    <div className={(wallet.kind ?? 'basic') === 'basic' ? '' : 'mt-3 pt-3 border-t border-slate-100'}>
      <div className="text-[12px] font-semibold text-slate-500 mb-1.5">Versé ce mois-ci</div>
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
// Le montant reste sur une ligne et rétrécit pour tenir dans sa colonne (jamais « CD / F » coupé)
const Stat: React.FC<{ label: string; value: string; tone?: string }> = ({ label, value, tone = 'text-slate-900' }) => (
  <div className="@container flex-1 min-w-0">
    <div className="text-[12px] font-semibold text-slate-500">{label}</div>
    <div
      className={`leading-tight font-bold tabular-nums whitespace-nowrap overflow-hidden text-ellipsis ${tone}`}
      style={{ fontSize: `min(15px, ${(158 / Math.max(value.length, 1)).toFixed(2)}cqi)` }}
    >
      {value}
    </div>
  </div>
);

const WalletDetail: React.FC<{
  wallet: Wallet;
  transactions: Transaction[];
  onBack: () => void;
  onOpenHistory: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onRestore: () => void;
  onTransfer?: () => void;
  onAdjust: () => void;
  onShare: () => void;
  onSelectTransaction: (tx: Transaction) => void;
  onDeposit?: OnDeposit; // objectif : « Ajouter de l'argent »
  spending?: Transaction[]; // dépenses hors objectifs (équivalence)
  wallets?: Wallet[]; // objectif : arrondis des autres portefeuilles
  settings?: Settings;
  desktop?: boolean;
}> = ({ wallet: w, transactions, onBack, onOpenHistory, onEdit, onDelete, onRestore, onTransfer, onAdjust, onShare, onSelectTransaction, onDeposit, spending, wallets, settings, desktop }) => {
  const sharingOn = useFeature('sharedWallets');
  const balance = walletBalance(w, transactions);
  const money = (v: number) => formatMoney(v, w.currency);
  const kind = w.kind ?? 'basic';
  const kindInfo = KINDS.find((k) => k.id === kind)!;

  const now = new Date();
  const month = transactions.filter((t) => countsInStats(t) && inThisMonth(t.createdAt, now));
  const monthIn = month.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const monthOut = month.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0);
  // Toutes les transactions, regroupées par jour (les plus récentes d'abord)
  const days = useMemo(() => {
    const groups = new Map<string, Transaction[]>();
    for (const t of [...transactions].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
      const key = dayLabel(t.createdAt);
      const list = groups.get(key);
      if (list) list.push(t);
      else groups.set(key, [t]);
    }
    return [...groups];
  }, [transactions]);

  const kindBlock = <WalletKindSummary wallet={w} balance={balance} transactions={transactions} />;

  const action = (label: string, Icon: typeof Pencil, onClick: () => void, danger = false) => (
    <button
      onClick={onClick}
      className={`flex-1 min-w-0 flex flex-col items-center gap-1.5 py-3 px-1 rounded-2xl bg-white border border-slate-100 text-[11px] min-[400px]:text-xs font-semibold cursor-pointer hover:bg-slate-50 active:scale-[0.97] transition ${
        danger ? 'text-red-600' : 'text-slate-700'
      }`}
    >
      <Icon className="w-5 h-5 shrink-0" />
      {/* Le mot reste dans son bouton, même avec une grande police */}
      <span className="max-w-full truncate">{label}</span>
    </button>
  );

  return (
    <div className={desktop ? 'max-w-6xl animate-screen' : 'px-5 pt-4 pb-8 animate-screen'}>
      <div className={`${desktop ? '' : 'page-head '}flex items-center gap-3 mb-5`}>
        <button onClick={onBack} aria-label="Retour" className="w-11 h-11 shrink-0 rounded-full bg-white border border-slate-100 flex items-center justify-center cursor-pointer">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-slate-900 truncate">{w.name}</h1>
      </div>

      {/* Ordinateur : résumé et actions à gauche, transactions à droite */}
      <div className={desktop ? 'grid grid-cols-[minmax(0,360px)_minmax(0,1fr)] gap-6 items-start' : ''}>
        <div className={desktop ? 'sticky top-6' : ''}>
          {/* Carte principale */}
          <div className="rounded-3xl p-5 mb-3 text-white relative overflow-hidden" style={{ backgroundColor: w.color }}>
            <AppIcon name={kindInfo.icon} className="absolute -right-4 -bottom-4 w-28 h-28 text-black/15" />
            <div className="flex items-center gap-2 text-xs font-semibold opacity-90">
              {kindInfo.title}
              {w.archived && <span className="px-2 py-0.5 rounded-full bg-black/20">Archivé</span>}
              {!w.includeInTotal && <span className="px-2 py-0.5 rounded-full bg-black/20">Exclu du total</span>}
            </div>
            <div className="text-[32px] font-extrabold tabular-nums tracking-tight mt-2"><SecretMoney text={money(balance)} /></div>
            <div className="text-xs opacity-90">{kind === 'credit' ? 'Solde (négatif = ce que tu dois)' : 'Solde actuel'}</div>
          </div>

          {/* Objectif : chiffres, pastilles, à épargner, bouton ; puis « Bon à savoir » et le graphique */}
          {kind === 'goal' && w.goalAmount ? (
            <GoalDetailTop wallet={w} transactions={transactions} spending={spending ?? []} wallets={wallets ?? []} settings={settings!} onDeposit={onDeposit} onEdit={onEdit} />
          ) : (
            kind === 'credit' && <div className="bg-white rounded-3xl border border-slate-100 p-4 mb-3">{kindBlock}</div>
          )}

          {/* Partage désactivé (espace admin) : on montre seulement les portefeuilles déjà partagés */}
          {!w.archived && (sharingOn || isShared(w)) && <SharingBlock wallet={w} transactions={transactions} onManage={onShare} />}

          <div className="bg-white rounded-3xl border border-slate-100 p-4 mb-3 flex gap-3">
            <Stat label="Entrées ce mois" value={`+${money(monthIn)}`} tone="text-emerald-600" />
            <Stat label="Sorties ce mois" value={`−${money(monthOut)}`} tone="text-red-500" />
          </div>

          <div className={`flex gap-2 ${desktop ? '' : 'mb-6'}`}>
            {onTransfer && action('Transférer', ArrowLeftRight, onTransfer)}
            {action('Ajuster', SlidersHorizontal, onAdjust)}
            {action('Modifier', Pencil, onEdit)}
            {w.archived ? action('Restaurer', ArchiveRestore, onRestore) : action(w.ownerId ? 'Quitter' : 'Supprimer', Trash2, onDelete, true)}
          </div>
        </div>
        <div className={desktop ? 'min-w-0' : ''}>
          <div className="flex items-center justify-between gap-2 mb-2">
            <h2 className="text-sm font-bold text-slate-900">
              Transactions{transactions.length > 0 && <span className="font-semibold text-slate-400"> · {transactions.length}</span>}
            </h2>
            {transactions.length > 0 && (
              <button
                onClick={() => { haptic(); onOpenHistory(); }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <History className="w-3.5 h-3.5" />
                Historique
              </button>
            )}
          </div>
          {days.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-6">Aucune transaction dans ce portefeuille.</p>
          ) : (
            <div className="space-y-4">
              {days.map(([day, items]) => (
                <div key={day} className="cv-auto">
                  <div className="text-[12px] font-bold text-slate-400 tracking-wider uppercase mb-2 px-1">{day}</div>
                  <div className="bg-white rounded-3xl border border-slate-100 px-3 py-1">
                    {items.map((t) => (
                      <TransactionItem key={t.id} transaction={t} onClick={onSelectTransaction} showDate={false} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------- Fenêtres Transférer / Ajuster ----------
// ---------- Portefeuilles en double ----------
const DuplicatesSheet: React.FC<{ plan: DuplicatePlan; transactions: Transaction[]; onClose: () => void; onConfirm: () => void }> = ({
  plan,
  transactions,
  onClose,
  onConfirm,
}) => {
  const count = (id: string) => transactions.filter((t) => t.walletId === id).length;
  const n = plan.walletIds.length;
  return (
    <Sheet title="Portefeuilles en double" onClose={onClose}>
      <p className="text-sm text-slate-500 mb-3">
        Ces portefeuilles existent deux fois, avec exactement les mêmes opérations. On garde l'original et on supprime la copie.
      </p>
      <div className="rounded-2xl border border-slate-100 divide-y divide-slate-100 mb-3">
        {plan.groups.map(({ keep, remove }) => (
          <div key={keep.id} className="flex items-center gap-2.5 px-3 py-2.5">
            <IconBadge icon={keep.icon} image={keep.image} color={keep.color} size="sm" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-900 truncate">{keep.name}</div>
              <div className="text-[12px] text-slate-500">
                {count(keep.id)} opération{count(keep.id) > 1 ? 's' : ''} · {remove.length > 1 ? `${remove.length} copies` : 'une copie'}
                {remove.some((w) => w.archived) && ' (archivée)'}
              </div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500 mb-4">
        Les copies et leurs {plan.txIds.length} opérations sont supprimées de ce téléphone et de ton compte en ligne. Les originaux ne changent pas.
      </p>
      <button onClick={onConfirm} className="w-full py-3.5 rounded-2xl bg-red-600 text-white text-sm font-bold cursor-pointer">
        Supprimer {n > 1 ? `les ${n} copies` : 'la copie'}
      </button>
      <button onClick={onClose} className="w-full mt-2 py-3 rounded-2xl bg-slate-100 text-sm font-bold cursor-pointer">
        Annuler
      </button>
    </Sheet>
  );
};

// ---------- « Ajouter de l'argent » : transfert rapide vers un objectif, montants proposés ----------
const LAST_SOURCE = 'ap.lastGoalSource'; // dernier portefeuille d'origine utilisé (cet appareil)
const readLastSource = () => {
  try {
    return localStorage.getItem(LAST_SOURCE);
  } catch {
    return null;
  }
};

const DepositSheet: React.FC<{
  goal: Wallet;
  wallets: Wallet[]; // portefeuilles d'où prendre l'argent (sans l'objectif)
  transactions: Transaction[];
  settings: Settings;
  initialFromId?: string; // ex. le portefeuille où la cagnotte de ristourne vient d'arriver
  initialAmount?: number;
  intro?: string;
  note?: string; // libellé de l'opération (sinon « Épargne · Moto »)
  onBack?: () => void; // retour au choix de l'objectif
  onClose: () => void;
  onConfirm: (fromId: string, toId: string, fromAmount: number, toAmount: number, note: string, fee: number, createdAt: string) => void;
}> = ({ goal, wallets, transactions, settings, initialFromId, initialAmount, intro, note, onBack, onClose, onConfirm }) => {
  const g = useMemo(() => goalInsight(goal, transactions), [goal, transactions]);
  const balanceOf = (w: Wallet) => walletBalance(w, transactions);
  const [fromId, setFromId] = useState(() => {
    if (initialFromId && wallets.some((w) => w.id === initialFromId)) return initialFromId;
    const last = readLastSource();
    return (wallets.find((w) => w.id === last) ?? wallets.find((w) => w.kind !== 'goal' && balanceOf(w) > 0) ?? wallets[0])?.id ?? '';
  });
  const [picking, setPicking] = useState(false);
  const [amount, setAmount] = useState(initialAmount ? String(Math.round(initialAmount * 100) / 100) : '');
  const from = wallets.find((w) => w.id === fromId);
  const left = g?.left ?? 0;

  // Montants proposés : le rythme conseillé (semaine, sinon jour), le double ; sans date : 5 % et 10 % de l'objectif
  const chips = useMemo(() => {
    const cap = (v: number) => Math.min(v, left);
    const pace = g?.pace;
    const list: { label: string; value: number }[] = [];
    if (pace?.perWeek) list.push({ label: 'Cette semaine', value: cap(pace.perWeek) }, { label: '× 2', value: cap(pace.perWeek * 2) });
    else if (pace) list.push({ label: "Aujourd'hui", value: cap(pace.perDay) }, { label: '× 2', value: cap(pace.perDay * 2) });
    else if (goal.goalAmount) list.push({ label: '5 %', value: cap(niceAmount(goal.goalAmount * 0.05)) }, { label: '10 %', value: cap(niceAmount(goal.goalAmount * 0.1)) });
    if (left > 0 && !list.some((c) => c.value === left)) list.push({ label: 'Tout le reste', value: left });
    return list.filter((c, i, arr) => c.value > 0 && arr.findIndex((x) => x.value === c.value) === i);
  }, [g, goal.goalAmount, left]);

  const value = parseAmount(amount);
  const fromAmount = from && value > 0 ? (from.currency === goal.currency ? value : convertBetween(value, goal.currency, from.currency, settings)) : null;
  const valid = !!from && value > 0 && fromAmount !== null && fromAmount > 0;
  const round = (v: number, c: string) => formatMoney(v, c, { ...getPrefs(), decimals: 'auto' });

  return (
    <Sheet title="Ajouter de l'argent" onClose={onClose}>
      {intro && <p className="text-sm text-slate-600 mb-3">{intro}</p>}
      <div className="flex items-center gap-3 mb-4">
        {onBack && (
          <button type="button" onClick={onBack} aria-label="Choisir un autre objectif" className="w-9 h-9 shrink-0 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        <IconBadge icon={goal.icon} image={goal.image} color={goal.color} size="md" />
        <div className="min-w-0">
          <div className="text-sm font-bold text-slate-900 truncate">{goal.name}</div>
          <div className="text-xs text-slate-500 tabular-nums">Il reste {round(left, goal.currency)}</div>
        </div>
      </div>

      {chips.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-3">
          {chips.slice(0, 3).map((c) => {
            const on = value === c.value;
            return (
              <button
                key={c.label}
                type="button"
                onClick={() => setAmount(String(Math.round(c.value * 100) / 100))}
                className={`min-w-0 py-2.5 px-1 rounded-2xl text-center cursor-pointer transition ${on ? 'bg-accent' : 'bg-slate-100 hover:bg-slate-200/70'}`}
              >
                <div className="text-[15px] font-bold tabular-nums truncate">{round(c.value, goal.currency)}</div>
                <div className={`text-[11px] font-medium ${on ? '' : 'text-slate-500'}`}>{c.label}</div>
              </button>
            );
          })}
        </div>
      )}

      <label className="text-xs font-semibold text-slate-500">Montant ({goal.currency})</label>
      <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Autre montant" className={`${amountCls} mb-4`} />

      {wallets.length > 0 ? (
        <WalletPicker
          label="L'argent vient de"
          wallets={wallets}
          value={fromId}
          open={picking}
          onToggle={() => setPicking((v) => !v)}
          onChange={(id) => {
            setFromId(id);
            setPicking(false);
          }}
          balanceOf={balanceOf}
        />
      ) : (
        <p className="text-sm text-slate-500">Crée d'abord un autre portefeuille d'où prendre l'argent.</p>
      )}
      {from && value > 0 && from.currency !== goal.currency && (
        <p className="text-xs text-slate-500 mt-2 px-1">
          {fromAmount === null
            ? `Ajoute le taux ${from.currency} / ${goal.currency} dans Paramètres pour convertir.`
            : `≈ ${formatMoney(fromAmount, from.currency)} seront pris dans ${from.name}.`}
        </p>
      )}

      <button
        disabled={!valid}
        onClick={() => {
          if (!valid || !from || fromAmount === null) return;
          try {
            localStorage.setItem(LAST_SOURCE, from.id);
          } catch {
            // pas grave : on reproposera le premier portefeuille
          }
          const fromRounded = Math.round(fromAmount * 100) / 100;
          onConfirm(from.id, goal.id, fromRounded, Math.round(value * 100) / 100, note ?? `Épargne · ${goal.name}`, 0, new Date().toISOString());
        }}
        className="w-full mt-4 py-3.5 rounded-2xl bg-accent disabled:bg-slate-100 disabled:text-slate-400 font-bold text-sm cursor-pointer disabled:cursor-default"
      >
        {valid ? `Ajouter ${round(value, goal.currency)} à ${goal.name}` : 'Choisis un montant'}
      </button>
    </Sheet>
  );
};

// ---------- Cagnotte de ristourne reçue : la verser (en partie) dans un objectif ----------
export const RistourneGoalPrompt: React.FC<{
  pot: { amount: number; currency: string; walletId: string };
  wallets: Wallet[];
  transactions: Transaction[];
  settings: Settings;
  onClose: () => void;
  onTransfer: (fromId: string, toId: string, fromAmount: number, toAmount: number, note: string, fee: number, createdAt: string) => void;
}> = ({ pot, wallets, transactions, settings, onClose, onTransfer }) => {
  const active = wallets.filter((w) => !w.archived);
  // Objectifs pas encore atteints, ceux qui ont le moins de reste d'abord
  const goals = active
    .filter((w) => w.kind === 'goal' && w.id !== pot.walletId && w.goalAmount)
    .map((w) => ({ w, left: Math.max(0, (w.goalAmount ?? 0) - Math.max(0, walletBalance(w, transactions))) }))
    .filter((x) => x.left > 0);
  const [goalId, setGoalId] = useState<string | null>(goals.length === 1 ? goals[0].w.id : null);
  const amountText = formatMoney(pot.amount, pot.currency, { ...getPrefs(), decimals: 'auto' });
  const intro = `Tu as reçu ${amountText}. Tu veux en mettre une partie dans un objectif ?`;
  if (goals.length === 0) return null;

  const chosen = goals.find((x) => x.w.id === goalId);
  if (chosen) {
    // Proposé : toute la cagnotte, sans dépasser ce qu'il reste (dans la devise de l'objectif)
    const potInGoal = pot.currency === chosen.w.currency ? pot.amount : convertBetween(pot.amount, pot.currency, chosen.w.currency, settings);
    return (
      <DepositSheet
        goal={chosen.w}
        wallets={active.filter((w) => w.id !== chosen.w.id)}
        transactions={transactions}
        settings={settings}
        initialFromId={pot.walletId}
        initialAmount={potInGoal !== null ? Math.min(potInGoal, chosen.left) : undefined}
        intro={intro}
        onBack={goals.length > 1 ? () => setGoalId(null) : undefined}
        onClose={onClose}
        onConfirm={(...args) => {
          onTransfer(...args);
          onClose();
        }}
      />
    );
  }
  return (
    <Sheet title="Et si tu épargnais ?" onClose={onClose}>
      <p className="text-sm text-slate-600 mb-4">{intro}</p>
      <div className="space-y-2">
        {goals.map(({ w, left }) => (
          <button
            key={w.id}
            onClick={() => setGoalId(w.id)}
            className="w-full flex items-center gap-3 p-3 rounded-2xl bg-slate-100 hover:bg-slate-200/70 text-left cursor-pointer"
          >
            <IconBadge icon={w.icon} image={w.image} color={w.color} size="md" />
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-bold text-slate-900 truncate">{w.name}</span>
              <span className="block text-xs text-slate-500 tabular-nums">Il reste {formatMoney(left, w.currency, { ...getPrefs(), decimals: 'auto' })}</span>
            </span>
            <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
          </button>
        ))}
      </div>
      <button onClick={onClose} className="w-full mt-4 py-3 rounded-2xl text-sm font-bold text-slate-600 cursor-pointer">
        Pas maintenant
      </button>
    </Sheet>
  );
};

const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
    <div
      className="w-full sm:max-w-[420px] max-h-[90dvh] overflow-y-auto bg-white rounded-t-[32px] sm:rounded-[32px] p-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-slide-up"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="sheet-head flex items-center justify-between mb-4">
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
  'w-full mt-1 px-4 py-3 rounded-2xl bg-slate-100 text-lg font-bold outline-none focus:ring-2 focus:ring-accent tabular-nums';

// Choix d'un portefeuille en une ligne : le choisi (icône, nom, solde) ; touché, la liste s'ouvre en dessous
const WalletPicker: React.FC<{
  label: string;
  wallets: Wallet[];
  value: string;
  open: boolean;
  onToggle: () => void;
  onChange: (id: string) => void;
  balanceOf: (w: Wallet) => number;
}> = ({ label, wallets, value, open, onToggle, onChange, balanceOf }) => {
  const w = wallets.find((x) => x.id === value);
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-left cursor-pointer transition ${open ? 'is-open' : 'bg-slate-100 hover:bg-slate-200/70'}`}
      >
        {w ? <IconBadge icon={w.icon} image={w.image} color={w.color} size="md" /> : <span className="w-10 h-10 rounded-full bg-slate-200 shrink-0" />}
        <span className="flex-1 min-w-0">
          <span className="block text-[12px] font-semibold text-slate-500">{label}</span>
          <span className="block text-sm font-bold text-slate-900 truncate">{w?.name ?? 'Choisir un portefeuille'}</span>
        </span>
        {w && <span className="shrink-0 text-xs font-semibold tabular-nums text-slate-500"><SecretMoney text={formatMoney(balanceOf(w), w.currency)} /></span>}
        <ChevronDown className={`w-4 h-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-1.5 max-h-64 overflow-y-auto rounded-2xl border border-slate-100 divide-y divide-slate-100 animate-fade-in">
          {wallets.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => {
                haptic();
                onChange(x.id);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 text-left cursor-pointer ${x.id === value ? 'is-selected' : 'hover:bg-slate-50'}`}
            >
              <IconBadge icon={x.icon} image={x.image} color={x.color} size="sm" />
              <span className="flex-1 min-w-0 text-sm font-semibold text-slate-900 truncate">{x.name}</span>
              <span className="shrink-0 text-xs tabular-nums text-slate-500"><SecretMoney text={formatMoney(balanceOf(x), x.currency)} /></span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// Jour choisi -> date ISO : aujourd'hui = maintenant ; un autre jour = ce jour-là, à l'heure qu'il est
const dayToIso = (day: string) => {
  const now = new Date();
  if (!day || day === localDay(now)) return now.toISOString();
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, now.getHours(), now.getMinutes()).toISOString();
};

const FINE_POINTER = typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches;

const TransferSheet: React.FC<{
  wallets: Wallet[];
  initialFromId: string;
  transactions: Transaction[];
  settings: Settings;
  onClose: () => void;
  onConfirm: (fromId: string, toId: string, fromAmount: number, toAmount: number, note: string, fee: number, createdAt: string) => void;
}> = ({ wallets, initialFromId, transactions, settings, onClose, onConfirm }) => {
  const [picking, setPicking] = useState<'from' | 'to' | null>(null);
  const [day, setDay] = useState(localDay(new Date())); // date du transfert (aujourd'hui par défaut)
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
      <WalletPicker
        label="Depuis"
        wallets={wallets}
        value={fromId}
        open={picking === 'from'}
        onToggle={() => setPicking((p) => (p === 'from' ? null : 'from'))}
        onChange={(id) => {
          pickFrom(id);
          setPicking(null);
        }}
        balanceOf={balanceOf}
      />
      {/* Inverser : « Depuis » devient « Vers » */}
      <div className="relative h-2 z-10">
        <button
          type="button"
          onClick={() => {
            if (!toId) return;
            setFromId(toId);
            setToId(fromId);
            setReceived('');
            setPicking(null);
          }}
          aria-label="Inverser les portefeuilles"
          className="absolute left-1/2 -translate-x-1/2 -top-2.5 w-7 h-7 rounded-full bg-white border border-slate-200 shadow-xs flex items-center justify-center text-slate-500 cursor-pointer hover:bg-slate-50"
        >
          <ArrowUpDown className="w-3.5 h-3.5" />
        </button>
      </div>
      <WalletPicker
        label="Vers"
        wallets={wallets.filter((w) => w.id !== fromId)}
        value={toId}
        open={picking === 'to'}
        onToggle={() => setPicking((p) => (p === 'to' ? null : 'to'))}
        onChange={(id) => {
          setToId(id);
          setReceived('');
          setPicking(null);
        }}
        balanceOf={balanceOf}
      />

      <label className="block mt-3 text-xs font-semibold text-slate-500">Montant envoyé {from && `(${from.currency})`}</label>
      {/* Curseur direct dans le montant seulement avec souris/clavier : sur téléphone, le clavier ferait
          défiler la fenêtre jusqu'ici et cacherait « Depuis » (on doit arriver en haut) */}
      <input autoFocus={FINE_POINTER} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className={amountCls} />

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
        className="w-full mt-1 px-4 py-2.5 rounded-2xl bg-slate-100 text-sm font-semibold outline-none focus:ring-2 focus:ring-accent tabular-nums"
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
        className="w-full mt-3 px-4 py-2.5 rounded-2xl bg-slate-100 text-sm outline-none focus:ring-2 focus:ring-accent"
      />

      <label className="block mt-3 text-xs font-semibold text-slate-500">Date du transfert</label>
      <DateField value={day} onChange={(d) => setDay(d || localDay(new Date()))} shortcuts="past" label="Date du transfert" className="mt-1" />

      {from && value + (feeOk ? fee : 0) > balanceOf(from) && from.kind !== 'credit' && (
        <p className="text-xs text-amber-600 mt-2">Attention : c'est plus que le solde de {from.name}.</p>
      )}

      <button
        disabled={!valid}
        onClick={() => onConfirm(fromId, toId, value, Math.round(toValue * 100) / 100, note.trim(), fee, dayToIso(day))}
        className="w-full mt-4 py-3.5 rounded-2xl bg-accent disabled:bg-slate-100 disabled:text-slate-400 text-slate-900 font-bold text-sm cursor-pointer disabled:cursor-default"
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
          <span className={`font-semibold ${diff > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
            {' '}· ajustement de {diff > 0 ? '+' : '−'}
            {formatMoney(Math.abs(diff), wallet.currency)}
          </span>
        )}
      </p>
      <button
        disabled={!Number.isFinite(value) || diff === 0}
        onClick={() => onConfirm(value)}
        className="w-full mt-4 py-3.5 rounded-2xl bg-accent disabled:bg-slate-100 disabled:text-slate-400 text-slate-900 font-bold text-sm cursor-pointer disabled:cursor-default"
      >
        {diff === 0 ? 'Saisis le nouveau solde' : 'Ajuster le solde'}
      </button>
    </Sheet>
  );
};
