import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Transaction, NotificationItem, Wallet, Settings, Budget, DebtMove, DebtShare, Recurring, Ristourne, RistourneMember } from './types';
import { usePersistentState } from './hooks/usePersistentState';
import { convertBetween, currenciesNeedingRate, formatMoney, makeBalance, toMain, totalInMain, walletBalance } from './lib/money';
import { HomeAction } from './components/BalanceSection';
import { SharedProps } from './components/appProps';
import { Page } from './components/BottomNav';
import { useIsDesktop } from './hooks/useIsDesktop';
import { Category, DEFAULT_CATEGORIES } from './data/categories';
import { Backup, ImportPlan } from './lib/importExport';
import { getAllCustomIcons, replaceCustomIcons, useCustomIcons } from './lib/customIcons';
import { setProfileName, useProfile } from './lib/profile';
import { getPrefs, useDisplayPrefs } from './lib/display';
import { useCloud } from './lib/sync/useCloud';
import { applyList } from './lib/sync/engine';
import type { SyncData } from './lib/sync/mapping';
import { MergeDialog } from './components/Account';
import { JoinWalletSheet } from './components/JoinWallet';
import { JoinRistourneSheet } from './components/JoinRistourne';
import { clearPendingDebtInvite, clearPendingInvite, clearPendingRistourneInvite, takeDebtInviteFromUrl, takeInviteFromUrl, takeRistourneInviteFromUrl } from './lib/invite';
import { JoinDebtSheet } from './components/JoinDebt';
import { QrScanner, TypeCodeSheet } from './components/QrInvite';
import { debtKindOf, DebtEntry, debtsSummary, dueLevel, samePerson } from './lib/debts';
import { debtCategoryOf, debtMoneyOut, isLive, shareTotals } from './lib/debtShares';
import type { DebtPreset } from './components/DebtsView';
import { budgetPace, budgetStatus, periodOf } from './lib/budgets';
import { unusualExpenses } from './lib/unusual';
import { uuid } from './lib/ids';
import { getTrash, trashAdd, trashClear, trashRemove } from './lib/trash';
import type { DuplicatePlan } from './lib/dedupe';
import type { Period } from './lib/periods';

// Les deux interfaces
import { MobileApp } from './components/MobileApp';
import { DesktopApp } from './components/DesktopApp';

// Fenêtres partagées par les deux interfaces
import { AddTransactionModal, AddMode, SplitBill } from './components/AddTransactionModal';
import { buildAmountHistory, buildNoteHistory } from './lib/noteSuggestions';
import { localDay as localDayOf } from './components/DatePicker';
import { findSubscriptions } from './lib/review';
import { canConfirm as canConfirmRistourne } from './lib/ristourne';
import { shouldShowSplash, Splash } from './components/Splash';
import { shouldShowNews, shouldShowTutorial, Tutorial } from './components/Tutorial';
import { InstallGuide } from './components/InstallGuide';
import { shouldOfferInstall } from './lib/install';
import { ConfirmHost } from './components/ConfirmHost';
import { FeatureKey, featureOn, useRemoteConfig } from './lib/remoteConfig';
import { TransactionDetailModal } from './components/TransactionDetailModal';
import { AccountSwitcherSheet } from './components/AccountSwitcherSheet';
import { NotificationsModal } from './components/NotificationsModal';
import { NavigationDrawer } from './components/NavigationDrawer';
import { Check } from 'lucide-react';
import { haptic } from './lib/haptics';
import { showSystemNotification, subscribePush } from './lib/notify';
import { refreshRates, useAutoRates } from './lib/rates';
import { AppLock } from './components/AppLock';
import { GoalCelebration } from './components/pages';
import { RistourneGoalPrompt } from './components/WalletsView';
import { checkMilestones, Crossing, requestDeposit, requestNewGoal, requestViewGoal } from './lib/goalMilestones';
import { reminderDue } from './lib/goals';
import { dueDates, dueLevel as recurringDue, nextAfter, occurrenceId, ymd } from './lib/recurring';
import { currentMarket, useMarketRates } from './lib/marketRate';
import { usesUsdAndCdf } from './components/RateCard';

const DEFAULT_WALLETS: Wallet[] = [
  { id: 'wallet-cash', name: 'Cash', icon: 'Banknote', color: '#059669', currency: 'USD', initialBalance: 0, includeInTotal: true, archived: false },
  { id: 'wallet-momo', name: 'Mobile Money', icon: 'Smartphone', color: '#F97316', currency: 'USD', initialBalance: 0, includeInTotal: true, archived: false },
];

// Pages qui dépendent d'une fonctionnalité activable (espace admin)
const PAGE_FEATURE: Partial<Record<Page, FeatureKey>> = { debts: 'debts', budgets: 'budgets', ristourne: 'ristournes' };

const WELCOME: NotificationItem[] = [
  { id: 'welcome', title: 'Bienvenue sur Wallo', message: 'Ajoute ta première dépense avec le bouton +, ou importe ton historique dans Paramètres › Mes données.', time: '', read: false, type: 'transaction' },
];

const DEFAULT_SETTINGS: Settings = { mainCurrency: 'USD', secondCurrency: null, rates: {} };

export default function App() {
  // PC ou téléphone ? (change tout seul si on redimensionne la fenêtre)
  const isDesktop = useIsDesktop();

  // Données (sauvegardées dans le navigateur)
  const [wallets, setWallets] = usePersistentState<Wallet[]>('ap.wallets', DEFAULT_WALLETS);
  const [transactions, setTransactions] = usePersistentState<Transaction[]>('ap.transactions', []);
  const [categories, setCategories] = usePersistentState<Category[]>('ap.categories', DEFAULT_CATEGORIES);
  const [storedSettings, setSettings] = usePersistentState<Settings>('ap.settings', DEFAULT_SETTINGS);
  const [activeWalletId, setActiveWalletId] = usePersistentState<string>('ap.activeWallet', 'all');
  const [budgets, setBudgets] = usePersistentState<Budget[]>('ap.budgets', []);
  const [recurrings, setRecurrings] = usePersistentState<Recurring[]>('ap.recurrings', []);
  const [ristournes, setRistournes] = usePersistentState<Ristourne[]>('ap.ristournes', []);
  const [debtShares, setDebtShares] = usePersistentState<DebtShare[]>('ap.debtShares', []);
  const [notifications, setNotifications] = usePersistentState<NotificationItem[]>('ap.notifications', WELCOME);
  const remote = useRemoteConfig(); // fonctionnalités, annonces, icônes (espace admin)
  const [showSplash, setShowSplash] = useState(shouldShowSplash); // écran d'accueil : 1re ouverture seulement
  const [showTutorial, setShowTutorial] = useState(shouldShowTutorial);
  // « Installe Wallo sur ton écran d'accueil » : après le tutoriel ; pour qui l'a déjà vu, une fois au lancement
  const [showInstall, setShowInstall] = useState(false);
  useEffect(() => {
    if (showTutorial || showNews) return; // sinon : proposé à la fin du tutoriel / des nouveautés
    const t = setTimeout(() => shouldOfferInstall() && setShowInstall(true), 2500);
    return () => clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps // prise en main : nouvelles personnes, ou Profil › Comment ça marche
  const [showNews, setShowNews] = useState(shouldShowNews); // « Quoi de neuf » : une fois, pour celles et ceux qui avaient déjà vu le tutoriel

  // Réglages : on complète avec les valeurs par défaut si la donnée sauvegardée est incomplète
  const settings: Settings = { ...DEFAULT_SETTINGS, ...storedSettings, rates: storedSettings.rates ?? {} };

  // Page affichée (la même pour mobile et PC)
  const [page, setPage] = useState<Page>('home');

  // Fenêtres
  const [addMode, setAddMode] = useState<AddMode | null>(null);
  const [addPreset, setAddPreset] = useState<DebtPreset | null>(null);
  const [isAccountPickerOpen, setIsAccountPickerOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const selectedTransaction = transactions.find((t) => t.id === selectedTxId) ?? null;
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastAction, setToastAction] = useState<{ label: string; run: () => void } | null>(null);
  const toastTimer = useRef(0);
  // Rejoindre un portefeuille partagé : code d'un lien /r/CODE ouvert, '' = code à taper, null = fermé
  const [joinCode, setJoinCode] = useState<string | null>(() => takeInviteFromUrl());
  const closeJoin = () => {
    clearPendingInvite();
    setJoinCode(null);
  };
  // Rejoindre une ristourne : code d'un lien /t/CODE ouvert (null = fermé)
  const [ristourneCode, setRistourneCode] = useState<string | null>(() => takeRistourneInviteFromUrl());
  const closeRistourneJoin = () => {
    clearPendingRistourneInvite();
    setRistourneCode(null);
  };
  // Suivre une dette partagée : code d'un lien /d/CODE ouvert, '' = code à taper, null = fermé
  const [debtCode, setDebtCode] = useState<string | null>(() => takeDebtInviteFromUrl());
  const closeDebtJoin = () => {
    clearPendingDebtInvite();
    setDebtCode(null);
  };
  // Scanner un code QR d'invitation dans l'app (pas de détour par le navigateur)
  const [scan, setScan] = useState<null | 'camera' | 'type'>(null);
  const openInvite = (kind: 'wallet' | 'ristourne' | 'debt', code: string) => {
    setScan(null);
    if (kind === 'wallet') setJoinCode(code);
    else if (kind === 'ristourne') setRistourneCode(code);
    else setDebtCode(code);
  };

  // Portefeuille choisi sur l'accueil ('all' si absent ou archivé)
  const activeWallet = wallets.find((w) => w.id === activeWalletId && !w.archived);
  const activeWallets = wallets.filter((w) => !w.archived);
  const visibleTransactions = activeWallet ? transactions.filter((t) => t.walletId === activeWallet.id) : transactions;
  const totalBalance = makeBalance(totalInMain(wallets, transactions, settings), settings);
  const balance = activeWallet
    ? makeBalance(toMain(walletBalance(activeWallet, transactions), activeWallet.currency, settings), settings)
    : totalBalance;

  // Message de confirmation (+ petit double « tic » : l'action a bien été faite)
  const showToast = (msg: string, action?: { label: string; run: () => void }) => {
    haptic('success');
    setToastMessage(msg);
    setToastAction(action ?? null);
    // Un message avec « Annuler » reste plus longtemps, le temps de le toucher
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => {
      setToastMessage(null);
      setToastAction(null);
    }, action ? 7000 : 3500);
  };

  // Page d'une fonctionnalité désactivée depuis l'espace admin : on n'y va pas
  const pageOff = (p: Page) => {
    const key = PAGE_FEATURE[p];
    return !!key && !featureOn(remote, key);
  };
  const navigate = (p: Page) => {
    if (pageOff(p)) {
      showToast('Cette fonctionnalité est indisponible pour le moment');
      return;
    }
    setPage(p);
    setReportPeriod(null);
    window.scrollTo(0, 0);
  };
  // « Afficher le rapport pour cette période » (onglet Transactions)
  const [reportPeriod, setReportPeriod] = useState<Period | null>(null);
  const openReport = (period: Period) => {
    navigate('statistic');
    setReportPeriod(period);
  };

  // Fonctionnalité coupée pendant qu'on est sur sa page : retour à l'accueil
  useEffect(() => {
    if (pageOff(page)) setPage('home');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remote.features, page]);

  // Ouvre l'écran d'ajout (il faut au moins un portefeuille actif)
  const openAdd = (mode: AddMode, preset: DebtPreset | null = null) => {
    if (mode === 'debt' && !featureOn(remote, 'debts')) mode = 'expense';
    setAddPreset(preset);
    if (activeWallets.length === 0) {
      showToast("Crée d'abord un portefeuille");
      navigate('wallets');
      return;
    }
    setAddMode(mode);
  };

  // Les boutons d'action de l'accueil
  const handleQuickAction = (action: HomeAction) => {
    switch (action) {
      case 'expense':
      case 'income':
        openAdd(action);
        break;
      case 'budget':
        navigate('budgets');
        break;
      case 'goals':
        navigate('goals');
        break;
      case 'ristourne':
        navigate('ristourne');
        break;
    }
  };

  // Enregistrer une dépense ou un revenu
  // Crée une opération (et, pour une dette partagée, son mouvement dans le carnet commun).
  // Renvoie 'pending' si l'autre personne doit confirmer, null si rien n'a été créé.
  const addOne = (
    amount: number,
    category: Category,
    note: string,
    walletId: string,
    currency: string,
    isExpense: boolean,
    o: { memberId?: string; withPerson?: string; excludeFromReport?: boolean; createdAt?: string; interest?: number; dueDate?: string; title?: string } = {}
  ): { tx: Transaction; pendingWith?: string } | null => {
    const wallet = wallets.find((w) => w.id === walletId);
    if (!wallet) return null;
    // Le montant est converti dans la devise du portefeuille si on en a choisi une autre
    const inWallet = convertBetween(amount, currency, wallet.currency, settings);
    if (inWallet === null) return null;
    const signed = isExpense ? -inWallet : inWallet;
    const differs = currency !== wallet.currency;
    const { withPerson, interest } = o;

    const newTx: Transaction = {
      id: uuid(),
      title: o.title ?? (note || (withPerson ? `${category.name} · ${withPerson}` : category.name)),
      createdAt: o.createdAt ?? new Date().toISOString(),
      amount: signed,
      currency: wallet.currency,
      walletId: wallet.id,
      originalAmount: differs ? (isExpense ? -amount : amount) : undefined,
      originalCurrency: differs ? currency : undefined,
      type: isExpense ? 'payment' : 'receive',
      category: category.name,
      categoryId: category.id,
      // L'avatar de la transaction = l'image ou l'icône de la catégorie
      avatarType: category.image ? 'image' : 'icon',
      avatarValue: category.image ?? category.icon,
      color: category.color,
      referenceNumber: `MN-${Math.floor(10000 + Math.random() * 90000)}`,
      status: 'completed',
      memberId: o.memberId,
      withPerson,
      excludeFromReport: o.excludeFromReport,
      // Intérêts prévus, dans la devise du portefeuille (comme le montant)
      interest: interest ? (convertBetween(interest, currency, wallet.currency, settings) ?? interest) : undefined,
      dueDate: o.dueDate || undefined,
    };

    setTransactions((prev) => [newTx, ...prev]);
    // Dette partagée avec cette personne : le mouvement va aussi dans le carnet commun, relié à l'opération
    const dk = debtKindOf(category.id);
    const sh = dk && withPerson ? debtShares.find((x) => x.side === dk.side && samePerson(x.person, withPerson)) : undefined;
    if (dk && sh && me) {
      addDebtMove(sh.id, { kind: dk.kind, amount, currency, note: note || undefined, txId: newTx.id, date: newTx.createdAt });
      if (interest) addDebtMove(sh.id, { kind: 'interest', amount: interest, currency, date: newTx.createdAt });
      if (isLive(sh)) return { tx: newTx, pendingWith: sh.person };
    }
    return { tx: newTx };
  };

  const handleAddTransaction = (amount: number, category: Category, note: string, walletId: string, currency: string, memberId?: string, withPerson?: string, excludeFromReport?: boolean, createdAt?: string, interest?: number, dueDate?: string) => {
    const isExpense = addMode === 'expense' || (addMode === 'debt' && category.direction === 'out');
    const res = addOne(amount, category, note, walletId, currency, isExpense, { memberId, withPerson, excludeFromReport, createdAt, interest, dueDate });
    if (!res) return;
    if (res.pendingWith) return showToast(`${category.name} noté : ${res.pendingWith} doit le confirmer`);
    showToast(
      addMode === 'debt'
        ? `${category.name} de ${formatMoney(amount, currency)} enregistré`
        : `${isExpense ? 'Dépense' : 'Revenu'} de ${formatMoney(amount, currency)} enregistré${isExpense ? 'e' : ''}`
    );
  };

  // « Plusieurs dépenses » : une opération par ligne, un seul message à la fin
  const handleAddMany = (items: { amount: number; category: Category; note: string }[], walletId: string, day: string) => {
    const wallet = wallets.find((w) => w.id === walletId);
    if (!wallet) return;
    const now = new Date();
    const [y, m, d] = day.split('-').map(Number);
    const createdAt = day && day !== localDayOf(now) ? new Date(y, m - 1, d, now.getHours(), now.getMinutes()).toISOString() : undefined;
    let n = 0;
    let total = 0;
    for (const it of [...items].reverse()) {
      // (on enregistre de la dernière ligne à la première : la liste montre ensuite les lignes dans l'ordre de saisie)
      if (addOne(it.amount, it.category, it.note, walletId, wallet.currency, true, { createdAt })) {
        n++;
        total += it.amount;
      }
    }
    if (n) showToast(`${n} dépense${n > 1 ? 's' : ''} enregistrée${n > 1 ? 's' : ''} · −${formatMoney(total, wallet.currency)}`);
  };

  // Partage d'addition : ma part en dépense, et les parts des autres en prêts (j'ai payé)
  // ou ma part en dette envers celui qui a payé.
  const handleSplitBill = (bill: SplitBill) => {
    const loanGiven = categories.find((c) => c.id === 'loan-given');
    const debtTaken = categories.find((c) => c.id === 'debt-taken');
    const label = bill.note || bill.category.name;
    const common = { memberId: bill.memberId, createdAt: bill.createdAt };
    if (bill.myShare > 0) addOne(bill.myShare, bill.category, bill.note, bill.walletId, bill.currency, true, { ...common, title: `${label} · ma part` });
    if (bill.payer === 'me') {
      for (const s of bill.shares) {
        if (s.amount > 0 && loanGiven)
          addOne(s.amount, loanGiven, `Part de l'addition : ${label}`, bill.walletId, bill.currency, true, { ...common, withPerson: s.person });
      }
      const n = bill.shares.filter((s) => s.amount > 0).length;
      showToast(`Addition partagée : ${n} personne${n > 1 ? 's te doivent' : ' te doit'} de l'argent`);
    } else if (debtTaken && bill.myShare > 0) {
      // Quelqu'un a payé pour moi : je lui dois ma part (l'argent « entre » pour payer ma part, puis je le rendrai)
      addOne(bill.myShare, debtTaken, `Ma part de l'addition : ${label}`, bill.walletId, bill.currency, false, { ...common, withPerson: bill.payerName });
      showToast(`Addition partagée : tu dois ${formatMoney(bill.myShare, bill.currency)} à ${bill.payerName}`);
    }
  };

  // Transfert entre deux portefeuilles : une sortie + une entrée, reliées par transferId
  const handleTransfer = (fromId: string, toId: string, fromAmount: number, toAmount: number, note: string, fee: number, createdAt?: string) => {
    const from = wallets.find((w) => w.id === fromId);
    const to = wallets.find((w) => w.id === toId);
    if (!from || !to || fromAmount <= 0 || toAmount <= 0) return;
    const base = {
      createdAt: createdAt ?? new Date().toISOString(), // date choisie dans la fenêtre (aujourd'hui par défaut)
      type: 'transfer' as const,
      category: 'Transfert',
      avatarType: 'icon' as const,
      avatarValue: 'ArrowLeftRight',
      color: '#64748B',
      transferId: uuid(),
      status: 'completed' as const,
    };
    const out: Transaction = {
      ...base,
      id: uuid(),
      title: note || `Vers ${to.name}`,
      amount: -fromAmount,
      currency: from.currency,
      walletId: from.id,
      counterpartWalletId: to.id,
    };
    const inn: Transaction = {
      ...base,
      id: uuid(),
      title: note || `Depuis ${from.name}`,
      amount: toAmount,
      currency: to.currency,
      walletId: to.id,
      counterpartWalletId: from.id,
    };
    // Les frais sont une vraie dépense (comptée dans les stats), retirée du portefeuille de départ
    const fees: Transaction[] =
      fee > 0
        ? [
            {
              id: uuid(),
              title: `Frais de transfert vers ${to.name}`,
              createdAt: base.createdAt,
              amount: -fee,
              currency: from.currency,
              walletId: from.id,
              type: 'payment',
              category: 'Frais de transfert',
              avatarType: 'icon',
              avatarValue: 'Receipt',
              color: '#64748B',
              transferId: base.transferId,
              status: 'completed',
            },
          ]
        : [];
    setTransactions((prev) => [out, ...fees, inn, ...prev]);
    showToast(
      `${formatMoney(fromAmount, from.currency)} transférés vers ${to.name}${fee > 0 ? ` (+${formatMoney(fee, from.currency)} de frais)` : ''}`
    );
  };

  // Ajuster le solde : une transaction de correction de la différence
  const handleAdjustBalance = (walletId: string, newBalance: number) => {
    const wallet = wallets.find((w) => w.id === walletId);
    if (!wallet) return;
    const diff = Math.round((newBalance - walletBalance(wallet, transactions)) * 100) / 100;
    if (diff === 0) return;
    const adj: Transaction = {
      id: uuid(),
      title: 'Ajustement du solde',
      createdAt: new Date().toISOString(),
      amount: diff,
      currency: wallet.currency,
      walletId: wallet.id,
      type: 'adjustment',
      category: 'Ajustement',
      avatarType: 'icon',
      avatarValue: 'SlidersHorizontal',
      color: '#64748B',
      status: 'completed',
    };
    setTransactions((prev) => [adj, ...prev]);
    showToast(`Solde de ${wallet.name} ajusté à ${formatMoney(newBalance, wallet.currency)}`);
  };

  // Portefeuilles : ajouter / modifier / supprimer
  const handleAddWallet = (w: Omit<Wallet, 'id' | 'archived'>) => {
    setWallets((prev) => [...prev, { ...w, id: uuid(), archived: false }]);
    showToast(`Portefeuille « ${w.name} » créé`);
  };
  const handleUpdateWallet = (id: string, changes: Partial<Wallet>) => {
    setWallets((prev) => prev.map((w) => (w.id === id ? { ...w, ...changes } : w)));
    if (changes.archived === true) showToast('Portefeuille archivé');
  };
  // Nouvel ordre choisi dans Portefeuilles > Réorganiser (les archivés restent à la fin)
  const handleReorderWallets = (ids: string[]) => {
    setWallets((prev) => {
      const moved = ids.map((id) => prev.find((w) => w.id === id)).filter((w): w is Wallet => !!w);
      return [...moved, ...prev.filter((w) => !ids.includes(w.id))];
    });
  };
  const handleDeleteWallet = (id: string) => {
    const shared = !!wallets.find((w) => w.id === id)?.ownerId; // portefeuille d'un autre : on le quitte
    setWallets((prev) => prev.filter((w) => w.id !== id));
    setTransactions((prev) => prev.filter((t) => t.walletId !== id));
    if (activeWalletId === id) setActiveWalletId('all');
    showToast(shared ? 'Tu as quitté ce portefeuille partagé' : 'Portefeuille supprimé');
  };

  // Copies exactes de portefeuilles (voir lib/dedupe) : on les supprime, les originaux restent
  const handleRemoveDuplicates = (plan: DuplicatePlan) => {
    const gone = new Set(plan.walletIds);
    const txs = new Set(plan.txIds);
    setWallets((prev) => prev.filter((w) => !gone.has(w.id)));
    setTransactions((prev) => prev.filter((t) => !txs.has(t.id)));
    if (gone.has(activeWalletId)) setActiveWalletId(plan.groups.find((g) => g.remove.some((w) => w.id === activeWalletId))?.keep.id ?? 'all');
    showToast(`${plan.walletIds.length} portefeuille${plan.walletIds.length > 1 ? 's' : ''} en double supprimé${plan.walletIds.length > 1 ? 's' : ''}`);
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  // Catégories : ajouter / supprimer
  const handleAddCategory = (cat: Omit<Category, 'id'>) => {
    setCategories((prev) => [...prev, { ...cat, id: `custom-${Date.now()}` }]);
    showToast(`Catégorie « ${cat.name} » créée`);
  };
  // Transactions : modifier / supprimer / dupliquer.
  // Un transfert (ses deux moitiés + les frais) est traité comme un seul bloc grâce à transferId.
  const groupOf = (tx: Transaction) => (tx.transferId ? transactions.filter((t) => t.transferId === tx.transferId) : [tx]);

  const handleUpdateTransaction = (id: string, changes: Partial<Transaction>) => {
    const tx = transactions.find((t) => t.id === id);
    if (!tx) return;
    // Pour un transfert, la date et la note s'appliquent à tout le bloc
    const shared: Partial<Transaction> = tx.transferId ? { createdAt: changes.createdAt } : {};
    setTransactions((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...changes } : tx.transferId && t.transferId === tx.transferId && shared.createdAt ? { ...t, ...shared } : t))
    );
    showToast('Transaction modifiée');
  };

  // Dettes et prêts : renommer / regrouper une personne, corriger des montants (plusieurs opérations d'un coup)
  const handleEditDebts = (updates: { id: string; changes: Partial<Transaction> }[], message: string) => {
    const byId = new Map(updates.map((u) => [u.id, u.changes]));
    setTransactions((prev) => prev.map((t) => (byId.has(t.id) ? { ...t, ...byId.get(t.id) } : t)));
    showToast(message);
  };

  // Dettes et prêts : supprimer toutes les opérations d'une dette / d'un prêt saisi par erreur
  const handleDeleteDebts = (ids: string[], message: string) => {
    const gone = new Set(ids);
    const removed = transactions.filter((t) => gone.has(t.id));
    const trashId = removed.length ? trashAdd({ kind: 'transactions', txs: removed, label: removed.length > 1 ? `${removed.length} opérations de dette` : removed[0].title }) : null;
    setTransactions((prev) => prev.filter((t) => !gone.has(t.id)));
    unlinkDebtTxs(gone);
    showToast(message, trashId ? { label: 'Annuler', run: () => restoreTrash(trashId) } : undefined);
  };

  // Opération supprimée alors qu'elle est reliée à une dette partagée : mon mouvement encore
  // en attente part avec elle ; un mouvement confirmé reste (on ne fait que le délier)
  const unlinkDebtTxs = (ids: Set<string>) => {
    if (!debtShares.some((sh) => sh.moves.some((m) => m.txId && ids.has(m.txId)))) return;
    setDebtShares((prev) =>
      prev.map((sh) => ({
        ...sh,
        moves: sh.moves
          .filter((m) => !(m.txId && ids.has(m.txId) && m.pending && m.recordedBy === me))
          .map((m) => (m.txId && ids.has(m.txId) ? { ...m, txId: undefined } : m)),
      }))
    );
  };

  // Rétablir ce qui est dans la corbeille (nouveaux identifiants : le compte en ligne a déjà reçu la suppression)
  const restoreTrash = (id: string) => {
    const item = getTrash().find((x) => x.id === id);
    if (!item) return;
    const walletOk = (wid: string) => wallets.some((w) => w.id === wid);
    if (item.kind === 'transactions') {
      if (!item.txs.every((t) => walletOk(t.walletId))) return showToast('Le portefeuille n\u2019existe plus : impossible de rétablir');
      setTransactions((prev) => [...item.txs.map((t) => ({ ...t, id: uuid() })), ...prev]);
    } else if (item.kind === 'budget') {
      setBudgets((prev) => [{ ...item.budget, id: uuid() }, ...prev]);
    } else {
      if (!walletOk(item.recurring.walletId)) return showToast('Le portefeuille n\u2019existe plus : impossible de rétablir');
      setRecurrings((prev) => [{ ...item.recurring, id: uuid() }, ...prev]);
    }
    trashRemove(id);
    showToast('Rétabli');
  };

  const handleDeleteTransaction = (tx: Transaction) => {
    const group = groupOf(tx);
    const ids = new Set(group.map((t) => t.id));
    const trashId = trashAdd({ kind: 'transactions', txs: group, label: group.length > 1 ? `Transfert · ${tx.title}` : tx.title });
    setTransactions((prev) => prev.filter((t) => !ids.has(t.id)));
    unlinkDebtTxs(ids);
    setSelectedTxId(null);
    showToast(ids.size > 1 ? 'Transfert supprimé' : 'Transaction supprimée', { label: 'Annuler', run: () => restoreTrash(trashId) });
  };

  const handleDuplicateTransaction = (tx: Transaction) => {
    const now = new Date().toISOString();
    const newTransferId = tx.transferId ? uuid() : undefined;
    const copies = groupOf(tx).map((t) => ({
      ...t,
      id: uuid(),
      createdAt: now,
      transferId: newTransferId,
      referenceNumber: t.referenceNumber ? `MN-${Math.floor(10000 + Math.random() * 90000)}` : undefined,
    }));
    setTransactions((prev) => [...copies, ...prev]);
    setSelectedTxId(copies.find((c) => c.walletId === tx.walletId && Math.sign(c.amount) === Math.sign(tx.amount))?.id ?? copies[0].id);
    showToast('Transaction dupliquée (datée de maintenant)');
  };

  // Modifier une catégorie : on met aussi à jour ses sous-catégories (couleur) et les transactions déjà faites
  const handleUpdateCategory = (id: string, changes: Omit<Category, 'id'>) => {
    const old = categories.find((c) => c.id === id);
    if (!old) return;
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...changes, id } : c.parentId === id ? { ...c, color: changes.color } : c))
    );
    setTransactions((prev) =>
      prev.map((t) =>
        t.categoryId !== id
          ? t
          : {
              ...t,
              title: t.title === old.name ? changes.name : t.title,
              category: changes.name,
              avatarType: changes.image ? 'image' : 'icon',
              avatarValue: changes.image ?? changes.icon,
              color: changes.color,
            }
      )
    );
    showToast(`Catégorie « ${changes.name} » modifiée`);
  };
  // Opération créée par une autre fonction (ristourne…) : sortie ou entrée, catégorie par défaut
  const recordTransaction = (o: { out: boolean; amount: number; currency: string; walletId: string; categoryId: string; title: string; withPerson?: string; date?: string; id?: string; fallbackCategory?: string }) => {
    const wallet = wallets.find((w) => w.id === o.walletId);
    const cat = categories.find((c) => c.id === o.categoryId);
    if (!wallet) return undefined;
    const id = o.id ?? uuid();
    const inWallet = convertBetween(o.amount, o.currency, wallet.currency, settings) ?? o.amount;
    const differs = o.currency !== wallet.currency;
    setTransactions((prev) => prev.some((t) => t.id === id) ? prev : [
      {
        id,
        title: o.title,
        createdAt: o.date ?? new Date().toISOString(),
        amount: o.out ? -inWallet : inWallet,
        currency: wallet.currency,
        walletId: wallet.id,
        originalAmount: differs ? (o.out ? -o.amount : o.amount) : undefined,
        originalCurrency: differs ? o.currency : undefined,
        type: o.out ? 'payment' : 'receive',
        category: cat?.name ?? o.fallbackCategory ?? (o.out ? 'Ristourne (cotisation)' : 'Ristourne (cagnotte reçue)'),
        categoryId: cat?.id,
        avatarType: cat?.image ? 'image' : 'icon',
        avatarValue: cat?.image ?? cat?.icon ?? (o.fallbackCategory ? 'Repeat' : 'Handshake'),
        color: cat?.color ?? '#65A30D',
        status: 'completed',
        withPerson: o.withPerson,
      },
      ...prev,
    ]);
    return id;
  };

  // ---------- Dettes partagées ----------
  const updateShare = (id: string, fn: (sh: DebtShare) => DebtShare) => setDebtShares((prev) => prev.map((sh) => (sh.id === id ? fn(sh) : sh)));
  const shareOf = (id: string) => debtShares.find((sh) => sh.id === id);
  // L'opération de portefeuille qui va avec un mouvement (facultative, choisie par chacun)
  const recordDebtTx = (sh: DebtShare, kind: DebtMove['kind'], amount: number, currency: string, walletId: string, date?: string) => {
    const categoryId = debtCategoryOf(sh.side, kind);
    const cat = categories.find((c) => c.id === categoryId);
    return recordTransaction({
      out: debtMoneyOut(sh.side, kind),
      amount,
      currency,
      walletId,
      categoryId,
      title: `${cat?.name ?? 'Dette'} · ${sh.person}`,
      withPerson: sh.person,
      date,
    });
  };

  // Dette acceptée avec « noter l'historique dans un portefeuille » : dès qu'elle arrive de la synchro,
  // chaque prêt / remboursement déjà noté y est ajouté à sa date (les intérêts, eux, ne bougent pas d'argent)
  const [historyTo, setHistoryTo] = useState<{ shareId: string; walletId: string } | null>(null);
  useEffect(() => {
    if (!historyTo) return;
    const sh = debtShares.find((x) => x.id === historyTo.shareId);
    if (!sh) return;
    setHistoryTo(null);
    const links = new Map<string, string>();
    // Seulement le tour en cours : les tours déjà réglés sont finis (et souvent déjà notés à l'époque)
    for (const m of shareTotals(sh, settings).current) {
      if (m.kind === 'interest' || m.txId) continue;
      const txId = recordDebtTx(sh, m.kind, m.amount, m.currency, historyTo.walletId, m.date);
      if (txId) links.set(m.id, txId);
    }
    if (links.size) updateShare(sh.id, (x) => ({ ...x, moves: x.moves.map((m) => (links.has(m.id) ? { ...m, txId: links.get(m.id) } : m)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyTo, debtShares]);
  // (functional : deux mouvements ajoutés d'un coup, ex. un prêt et ses intérêts, sont gardés tous les deux)
  const addDebtMove = (shareId: string, m: { kind: DebtMove['kind']; amount: number; currency: string; note?: string; txId?: string; date?: string }) =>
    setDebtShares((prev) =>
      prev.map((sh) =>
        sh.id !== shareId
          ? sh
          : {
              ...sh,
              moves: [
                ...sh.moves,
                { id: uuid(), kind: m.kind, amount: m.amount, currency: m.currency, date: m.date ?? new Date().toISOString(), note: m.note, pending: true, recordedBy: me, txId: m.txId },
              ],
            }
      )
    );
  const removeMoveAndTx = (shareId: string, moveId: string) => {
    const m = shareOf(shareId)?.moves.find((x) => x.id === moveId);
    updateShare(shareId, (sh) => ({ ...sh, moves: sh.moves.filter((x) => x.id !== moveId) }));
    if (m?.txId) setTransactions((prev) => prev.filter((t) => t.id !== m.txId));
  };
  // Partager la dette d'une personne : ses opérations deviennent le carnet commun (à confirmer par l'autre)
  const handleShareDebt = (e: DebtEntry) => {
    if (!me) return null;
    const existing = debtShares.find((sh) => sh.side === e.side && samePerson(sh.person, e.name));
    if (existing) return existing.id;
    const id = uuid();
    const moves: DebtMove[] = e.txs.flatMap((t): DebtMove[] => {
      const move: DebtMove = {
        id: uuid(),
        kind: debtKindOf(t.categoryId)?.kind ?? 'more',
        amount: Math.abs(t.originalAmount ?? t.amount),
        currency: t.originalCurrency ?? t.currency,
        date: t.createdAt,
        note: t.title,
        pending: true,
        recordedBy: me,
        txId: t.id,
      };
      // Intérêts prévus sur ce prêt : un mouvement à part (dans la devise du portefeuille, où ils sont gardés)
      const interest: DebtMove[] = t.interest
        ? [{ id: uuid(), kind: 'interest', amount: t.interest, currency: t.currency, date: t.createdAt, note: `Intérêts · ${t.title}`, pending: true, recordedBy: me }]
        : [];
      return [move, ...interest];
    });
    setDebtShares((prev) => [...prev, { id, side: e.side, person: e.name, status: 'open', moves }]);
    return id;
  };
  const sharedDebts = {
    shares: debtShares,
    wallets: wallets.filter((w) => !w.archived),
    onShare: handleShareDebt,
    onAddMove: (shareId: string, m: { kind: DebtMove['kind']; amount: number; currency: string; note?: string; walletId: string | null }) => {
      const sh = shareOf(shareId);
      if (!sh) return;
      const txId = m.walletId ? recordDebtTx(sh, m.kind, m.amount, m.currency, m.walletId) : undefined;
      addDebtMove(shareId, { ...m, txId });
      showToast(isLive(sh) ? `Noté : ${sh.person} doit le confirmer` : 'Mouvement noté');
    },
    onConfirm: (shareId: string, moveId: string, walletId: string | null) => {
      const sh = shareOf(shareId);
      const m = sh?.moves.find((x) => x.id === moveId);
      if (!sh || !m) return;
      const txId = walletId ? recordDebtTx(sh, m.kind, m.amount, m.currency, walletId) : m.txId;
      updateShare(shareId, (x) => ({ ...x, moves: x.moves.map((y) => (y.id === moveId ? { ...y, pending: false, txId } : y)) }));
      showToast(walletId ? 'Confirmé et noté dans ton portefeuille' : 'Confirmé');
    },
    // Annuler mon mouvement en attente, refuser celui de l'autre, ou corriger quand je suis seul à suivre
    onRemove: (shareId: string, moveId: string, message: string) => {
      removeMoveAndTx(shareId, moveId);
      showToast(message);
    },
    onRequestDelete: (shareId: string, moveId: string) => {
      updateShare(shareId, (x) => ({ ...x, moves: x.moves.map((y) => (y.id === moveId ? { ...y, deleteRequestedBy: me } : y)) }));
      showToast(`Demande envoyée à ${shareOf(shareId)?.person ?? "l'autre personne"}`);
    },
    onAnswerDelete: (shareId: string, moveId: string, accept: boolean) => {
      if (accept) removeMoveAndTx(shareId, moveId);
      else updateShare(shareId, (x) => ({ ...x, moves: x.moves.map((y) => (y.id === moveId ? { ...y, deleteRequestedBy: undefined } : y)) }));
      showToast(accept ? 'Mouvement supprimé pour vous deux' : 'La suppression est annulée');
    },
    onLinkWallet: (shareId: string, moveId: string, walletId: string) => {
      const sh = shareOf(shareId);
      const m = sh?.moves.find((x) => x.id === moveId);
      if (!sh || !m) return;
      const txId = recordDebtTx(sh, m.kind, m.amount, m.currency, walletId);
      updateShare(shareId, (x) => ({ ...x, moves: x.moves.map((y) => (y.id === moveId ? { ...y, txId } : y)) }));
      showToast('Noté dans ton portefeuille');
    },
    onLeave: (shareId: string) => {
      const sh = shareOf(shareId);
      setDebtShares((prev) => prev.filter((x) => x.id !== shareId));
      showToast(sh ? `Tu ne suis plus la dette avec ${sh.person}` : 'Dette retirée');
    },
    onRename: (shareId: string, name: string) => {
      const sh = shareOf(shareId);
      if (!sh || !name.trim() || name.trim() === sh.person) return;
      // Ses opérations dans mes portefeuilles suivent le nouveau nom (sinon elles formeraient une autre personne)
      setTransactions((prev) => prev.map((t) => (t.withPerson && samePerson(t.withPerson, sh.person) ? { ...t, withPerson: name.trim() } : t)));
      updateShare(shareId, (x) => ({ ...x, person: name.trim() }));
      showToast(`Renommé en ${name.trim()}`);
    },
    // Seulement un mouvement pas encore confirmé (ou quand je suis seul à suivre) : la base refuse le reste
    onEditMove: (shareId: string, moveId: string, changes: { amount: number; note?: string }) => {
      const m = shareOf(shareId)?.moves.find((x) => x.id === moveId);
      if (!m) return;
      updateShare(shareId, (x) => ({ ...x, moves: x.moves.map((y) => (y.id === moveId ? { ...y, amount: changes.amount, note: changes.note } : y)) }));
      // Son opération dans mon portefeuille prend le nouveau montant
      if (m.txId)
        setTransactions((prev) =>
          prev.map((t) => {
            if (t.id !== m.txId) return t;
            const v = convertBetween(changes.amount, m.currency, t.currency, settings) ?? changes.amount;
            return { ...t, amount: Math.sign(t.amount || 1) * v, originalAmount: undefined, originalCurrency: undefined };
          })
        );
      showToast('Mouvement modifié');
    },
    onJoin: () => setDebtCode(''),
  };
  // Dette normale : les intérêts ajoutés après coup vont sur le dernier prêt (ou emprunt) de la personne
  const handleRemoveDebtInterest = (txId: string) => {
    // 0 (et pas « undefined ») : la suppression part aussi dans la synchro
    setTransactions((prev) => prev.map((t) => (t.id === txId ? { ...t, interest: 0 } : t)));
    showToast('Intérêts retirés');
  };
  const handleAddDebtInterest = (e: DebtEntry, amount: number, currency: string) => {
    const last = [...e.txs].filter((t) => debtKindOf(t.categoryId)?.kind === 'more').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (!last || !(amount > 0)) return;
    // Gardés dans la devise du prêt (comme son montant)
    const add = convertBetween(amount, currency, last.currency, settings);
    if (add === null) return showToast(`Taux ${currency} → ${last.currency} manquant : ajoute-le dans Paramètres`);
    setTransactions((prev) => prev.map((t) => (t.id === last.id ? { ...t, interest: Math.round(((t.interest ?? 0) + add) * 100) / 100 } : t)));
    showToast(`Intérêts de ${formatMoney(amount, currency)} ajoutés`);
  };

  // Ristournes
  const handleCreateRistourne = (r: Omit<Ristourne, 'id' | 'payments'>) => {
    const id = uuid();
    setRistournes((prev) => [...prev, { ...r, id, payments: [] }]);
    showToast(`Ristourne « ${r.name} » créée`);
    return id;
  };
  const handleUpdateRistourne = (id: string, changes: Partial<Ristourne>) => {
    setRistournes((prev) => prev.map((r) => (r.id === id ? { ...r, ...changes } : r)));
    showToast('Ristourne modifiée');
  };
  const handleDeleteRistourne = (id: string) => {
    const r = ristournes.find((x) => x.id === id);
    setRistournes((prev) => prev.filter((x) => x.id !== id));
    showToast(r?.ownerId ? 'Tu as quitté la ristourne' : 'Ristourne supprimée');
  };
  const handlePayRistourne = (r: Ristourne, m: RistourneMember, turn: number, walletId: string | null) => {
    setRistournes((prev) =>
      prev.map((x) =>
        x.id === r.id
          ? {
              ...x,
              // Noté par un simple membre : à confirmer par l'organisateur / le gardien de l'argent
              payments: [...x.payments, { id: uuid(), memberId: m.id, turn, amount: r.contribution, paidAt: new Date().toISOString(), ...(canConfirmRistourne(r) ? {} : { pending: true }) }],
            }
          : x
      )
    );
    if (m.isMe && walletId) {
      recordTransaction({ out: true, amount: r.contribution, currency: r.currency, walletId, categoryId: 'ristourne-out', title: `${r.name} · tour ${turn}` });
    }
    showToast(canConfirmRistourne(r) ? (m.isMe ? 'Ta cotisation est notée' : `Paiement de ${m.name} noté`) : 'Paiement noté : en attente de confirmation');
  };
  // Organisateur / gardien : le paiement a bien été reçu
  const handleConfirmRistournePayment = (r: Ristourne, paymentId: string) => {
    setRistournes((prev) =>
      prev.map((x) => (x.id === r.id ? { ...x, payments: x.payments.map((p) => (p.id === paymentId ? { ...p, pending: false } : p)) } : x))
    );
    showToast('Paiement confirmé');
  };
  const handleUnpayRistourne = (r: Ristourne, paymentId: string) => {
    const payment = r.payments.find((p) => p.id === paymentId);
    const mine = payment && r.members.find((m) => m.id === payment.memberId)?.isMe;
    // Ma cotisation : on retire aussi la dépense notée au même moment dans mon portefeuille
    // (même tour, créée à la même minute que le paiement ; marche aussi si la ristourne a été renommée)
    const expense =
      mine && payment
        ? transactions.find(
            (t) =>
              t.type === 'payment' &&
              (t.categoryId === 'ristourne-out' || t.category === 'Ristourne (cotisation)') &&
              t.title.endsWith(` · tour ${payment.turn}`) &&
              Math.abs(new Date(t.createdAt).getTime() - new Date(payment.paidAt).getTime()) < 60_000
          )
        : undefined;
    setRistournes((prev) => prev.map((x) => (x.id === r.id ? { ...x, payments: x.payments.filter((p) => p.id !== paymentId) } : x)));
    if (expense) setTransactions((prev) => prev.filter((t) => t.id !== expense.id));
    showToast(expense ? 'Paiement annulé et dépense retirée' : 'Paiement annulé');
  };
  const handleReceiveRistourne = (r: Ristourne, turn: number, walletId: string) => {
    const pot = r.members.filter((m) => !m.removed).length * r.contribution;
    recordTransaction({ out: false, amount: pot, currency: r.currency, walletId, categoryId: 'ristourne-in', title: `${r.name} · cagnotte du tour ${turn}` });
    showToast(`Cagnotte de ${formatMoney(pot, r.currency)} enregistrée`);
    // Proposer d'en verser une partie dans un objectif (s'il y en a un pas encore atteint)
    setRistournePot({ amount: pot, currency: r.currency, walletId });
  };
  const [ristournePot, setRistournePot] = useState<{ amount: number; currency: string; walletId: string } | null>(null);

  // ---------- Opérations qui reviennent / factures ----------
  // Seulement celles dont le portefeuille est encore là (portefeuille partagé quitté : on ne les voit plus)
  const liveRecurrings = useMemo(() => recurrings.filter((r) => wallets.some((w) => w.id === r.walletId && !w.archived)), [recurrings, wallets]);
  const handleAddRecurring = (r: Omit<Recurring, 'id' | 'createdAt' | 'active'>) => {
    setRecurrings((prev) => [...prev, { ...r, id: uuid(), createdAt: new Date().toISOString(), active: true }]);
    showToast(r.bill ? 'Facture ajoutée' : 'Opération qui revient ajoutée');
  };
  const handleUpdateRecurring = (id: string, changes: Partial<Recurring>) => setRecurrings((prev) => prev.map((r) => (r.id === id ? { ...r, ...changes } : r)));
  const handleDeleteRecurring = (id: string) => {
    const r = recurrings.find((x) => x.id === id);
    const trashId = r ? trashAdd({ kind: 'recurring', recurring: r, label: r.title }) : null;
    setRecurrings((prev) => prev.filter((x) => x.id !== id));
    showToast('Supprimée', trashId ? { label: 'Annuler', run: () => restoreTrash(trashId) } : undefined);
  };
  // L'opération d'une échéance (identifiant fixe : jamais en double, même créée sur deux téléphones)
  const recordOccurrence = (r: Recurring, day: string, amount: number) => {
    const today = ymd(new Date());
    // Échéance passée : datée de ce jour-là ; aujourd'hui ou payée en avance : maintenant
    const date = day < today ? new Date(`${day}T12:00`).toISOString() : undefined;
    return recordTransaction({
      out: r.direction === 'out', amount, currency: r.currency, walletId: r.walletId, categoryId: r.categoryId ?? '',
      title: r.title, date, id: occurrenceId(r.id, day), fallbackCategory: r.bill ? 'Factures' : r.direction === 'out' ? 'Autres dépenses' : 'Autres revenus',
    });
  };
  // « Oui » / « Payé » : l'opération est créée, la prochaine date avance
  const handleConfirmRecurring = (r: Recurring, amount?: number) => {
    const value = amount ?? r.amount;
    if (!value || value <= 0) return;
    recordOccurrence(r, r.nextDate, value);
    handleUpdateRecurring(r.id, { nextDate: nextAfter(r.nextDate, r) });
    showToast(r.bill ? `${r.title} : payé` : `${r.title} : enregistré`);
  };
  // « Pas cette fois » : on passe à la date suivante sans rien créer
  const handleSkipRecurring = (r: Recurring) => {
    handleUpdateRecurring(r.id, { nextDate: nextAfter(r.nextDate, r) });
    showToast('Passé à la prochaine fois');
  };

  // Les « automatiques » arrivées à échéance sont créées toutes seules (rattrapage des jours sans ouvrir l'app)
  useEffect(() => {
    const today = ymd(new Date());
    const updates: { id: string; nextDate: string }[] = [];
    for (const r of liveRecurrings) {
      if (r.mode !== 'auto' || r.bill || !r.amount || !r.active || r.nextDate > today) continue;
      const days = dueDates(r, today);
      days.forEach((day) => recordOccurrence(r, day, r.amount!));
      if (days.length) updates.push({ id: r.id, nextDate: nextAfter(days[days.length - 1], r) });
    }
    if (updates.length) setRecurrings((prev) => prev.map((r) => ({ ...r, ...(updates.find((u) => u.id === r.id) ?? {}) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveRecurrings]);

  // Alertes : facture bientôt / aujourd'hui / en retard, opération « me demander » du jour.
  // Même étiquette que la notification du serveur (push_recurring_reminders) : jamais deux fois sur le téléphone.
  useEffect(() => {
    const today = ymd(new Date());
    const fresh: NotificationItem[] = [];
    for (const r of liveRecurrings) {
      const lvl = recurringDue(r, today);
      if (!lvl || (!r.bill && r.mode === 'auto')) continue;
      const id = `rec-${r.id}-${r.nextDate}-${lvl}`;
      if (notifications.some((n) => n.id === id)) continue;
      const how = r.amount ? ` ${formatMoney(r.amount, r.currency)}` : '';
      const date = new Date(`${r.nextDate}T12:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
      fresh.push({
        id,
        type: r.bill ? 'budget' : 'transaction',
        read: false,
        time: new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
        title: r.bill ? `Facture : ${r.title}` : r.title,
        message: r.bill
          ? lvl === 'soon' ? `À payer avant le ${date}${how}.` : lvl === 'today' ? `À payer aujourd'hui${how}.` : `En retard depuis le ${date}${how}.`
          : r.direction === 'in' ? `Prévu aujourd'hui${how} : l'as-tu reçu ?` : `Prévu aujourd'hui${how} : est-ce payé ?`,
      });
      // « 8 oct.. » -> « 8 oct. »
      fresh[fresh.length - 1].message = fresh[fresh.length - 1].message.replace(/\.\.$/, '.');
    }
    if (fresh.length) setNotifications((prev) => [...fresh, ...prev].slice(0, 50));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveRecurrings]);

  // Taux du marché publié par Wallo qui bouge de plus de 2 % : une alerte (une fois par jour publié)
  const marketRates = useMarketRates();
  useEffect(() => {
    const m = currentMarket(marketRates);
    if (!m || m.mine || m.change === null || Math.abs(m.change) < 0.02 || !usesUsdAndCdf(settings, wallets)) return;
    const id = `rate-${m.day}`;
    if (notifications.some((n) => n.id === id)) return;
    const change = m.change;
    const up = change > 0;
    setNotifications((prev): NotificationItem[] => [
      {
        id,
        type: 'announcement' as const,
        read: false,
        time: new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
        title: up ? 'Le dollar a monté' : 'Le dollar a baissé',
        message: `1 $ = ${formatMoney(m.rate, 'CDF')} au marché (${up ? '+' : ''}${(change * 100).toFixed(1).replace('.', ',')} % depuis la veille).`,
      },
      ...prev,
    ].slice(0, 50));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marketRates]);

  // Notification touchée : elle devient lue, et on va là où elle parle
  const handleOpenNotification = (n: NotificationItem) => {
    setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
    setIsNotificationsOpen(false);
    // Identifiants : « goal-<portefeuille>-… », « rec-<id>-… », « budget-… », « debt-… », « rate-… »
    const walletIn = (rest: string) => wallets.find((w) => rest.startsWith(`${w.id}-`));
    if (n.id.startsWith('goal-reminder-')) {
      const w = walletIn(n.id.slice('goal-reminder-'.length));
      // Montant proposé : ce qu'il reste à mettre aujourd'hui / cette semaine
      if (w) requestDeposit(w.id, reminderDue(w, transactions, getPrefs().weekStart) || undefined);
      navigate('goals');
    } else if (n.id.startsWith('goal-')) {
      const w = walletIn(n.id.slice('goal-'.length));
      if (w) requestViewGoal(w.id);
      navigate('goals');
    } else if (n.id.startsWith('rec-')) navigate('upcoming');
    else if (n.id.startsWith('budget-')) navigate('budgets');
    else if (n.id.startsWith('sub-')) navigate('upcoming');
    else if (n.id.startsWith('unusual-')) navigate('history');
    else if (n.id.startsWith('debt-')) navigate('debts');
    else if (n.id.startsWith('rate-')) navigate('home');
    else if (n.id === 'welcome') openAdd('expense');
  };

  // Budgets
  const handleAddBudget = (b: Omit<Budget, 'id' | 'createdAt'>) => {
    setBudgets((prev) => [...prev, { ...b, id: uuid(), createdAt: new Date().toISOString() }]);
    showToast('Budget créé');
  };
  const handleUpdateBudget = (id: string, changes: Partial<Budget>) => {
    setBudgets((prev) => prev.map((b) => (b.id === id ? { ...b, ...changes } : b)));
    showToast('Budget modifié');
  };
  const handleDeleteBudget = (id: string) => {
    const b = budgets.find((x) => x.id === id);
    const cat = b && categories.find((c) => c.id === b.categoryId);
    const trashId = b ? trashAdd({ kind: 'budget', budget: b, label: `Budget · ${cat?.name ?? 'Toutes les dépenses'}` }) : null;
    setBudgets((prev) => prev.filter((x) => x.id !== id));
    showToast('Budget supprimé', trashId ? { label: 'Annuler', run: () => restoreTrash(trashId) } : undefined);
  };

  // Annonces publiées depuis l'espace admin : ajoutées une fois aux notifications
  const [seenAnnouncements, setSeenAnnouncements] = usePersistentState<string[]>('ap.announcementsSeen', []);
  useEffect(() => {
    const fresh = remote.announcements.filter((a) => !seenAnnouncements.includes(a.id));
    if (fresh.length === 0) return;
    setNotifications((prev) =>
      [
        ...fresh.map((a): NotificationItem => ({
          id: `ann-${a.id}`,
          type: a.kind === 'warning' ? 'security' : 'announcement',
          read: false,
          time: new Date(a.createdAt || Date.now()).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
          title: a.title,
          message: a.message,
        })),
        ...prev,
      ].slice(0, 50)
    );
    setSeenAnnouncements((prev) => [...prev, ...fresh.map((a) => a.id)].slice(-200));
    showToast(fresh[0].title);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remote.announcements]);

  // Alerte quand un budget atteint 80 %, puis 100 % (une seule fois par budget, par période et par seuil)
  useEffect(() => {
    const now = new Date();
    const fresh: NotificationItem[] = [];
    for (const b of budgets) {
      const cat = categories.find((c) => c.id === b.categoryId);
      if (b.categoryId && !cat) continue;
      const st = budgetStatus(b, transactions, categories, settings);
      if (now < st.start || now >= st.end) continue; // budget personnalisé pas en cours
      const level = st.ratio >= 1 ? 100 : st.ratio >= 0.8 ? 80 : 0;
      const when = { week: 'cette semaine', month: 'ce mois-ci', quarter: 'ce trimestre', year: 'cette année', custom: 'sur la période' }[periodOf(b)];
      const id = `budget-${b.id}-${st.start.toISOString().slice(0, 10)}-${level}`;
      if (!level || notifications.some((n) => n.id === id)) continue;
      const name = cat?.name ?? 'Toutes les dépenses';
      fresh.push({
        id,
        type: 'budget',
        read: false,
        time: now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
        title: level === 100 ? `Budget dépassé : ${name}` : `Budget bientôt atteint : ${name}`,
        message:
          level === 100
            ? `Tu as dépensé ${formatMoney(st.spent, b.currency)} sur ${formatMoney(b.amount, b.currency)} ${when}.`
            : `${Math.round(st.ratio * 100)} % utilisé : il reste ${formatMoney(st.left, b.currency)} ${when}.`,
      });
    }
    if (fresh.length > 0) {
      setNotifications((prev) => [...fresh, ...prev].slice(0, 50));
      showToast(fresh[0].title);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgets, transactions, categories]);

  // « Tu dépenses plus vite que prévu » : à mi-parcours d'un budget, si le rythme dépasse la limite (une alerte par période)
  useEffect(() => {
    const now = new Date();
    const fresh: NotificationItem[] = [];
    for (const b of budgets) {
      const cat = categories.find((c) => c.id === b.categoryId);
      if (b.categoryId && !cat) continue;
      const st = budgetStatus(b, transactions, categories, settings);
      if (now < st.start || now >= st.end || st.ratio >= 1) continue; // en cours, pas déjà dépassé (l'autre alerte s'en charge)
      const part = (now.getTime() - st.start.getTime()) / (st.end.getTime() - st.start.getTime());
      const pace = budgetPace(st.spent, b.amount, st, now);
      if (part < 0.35 || st.ratio < 0.4 || pace.projected < b.amount * 1.1) continue;
      const id = `budget-pace-${b.id}-${st.start.toISOString().slice(0, 10)}`;
      if (notifications.some((n) => n.id === id)) continue;
      fresh.push({
        id,
        type: 'budget',
        read: false,
        time: now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
        title: `Tu dépenses plus vite que prévu : ${cat?.name ?? 'Toutes les dépenses'}`,
        message: `À ce rythme, tu atteindras ≈ ${formatMoney(Math.round(pace.projected), b.currency)} pour ${formatMoney(b.amount, b.currency)} prévus. Pour tenir : ${formatMoney(Math.round(pace.perDayAllowed), b.currency)} par jour.`,
      });
    }
    if (fresh.length) setNotifications((prev) => [...fresh, ...prev].slice(0, 50));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgets, transactions, categories]);

  // Dépense inhabituelle : bien plus chère que d'habitude dans sa catégorie (une alerte par opération)
  useEffect(() => {
    const now = new Date();
    const fresh: NotificationItem[] = [];
    for (const u of unusualExpenses(transactions, settings, now)) {
      const id = `unusual-${u.tx.id}`;
      if (notifications.some((n) => n.id === id)) continue;
      fresh.push({
        id,
        type: 'security',
        read: false,
        time: now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
        title: 'Dépense inhabituelle',
        message: `« ${u.tx.title} » : ${formatMoney(Math.abs(u.tx.amount), u.tx.currency)}, environ ${u.times} fois ta dépense habituelle en ${u.tx.category}. C'est normal ? Sinon, corrige-la.`,
      });
    }
    if (fresh.length) setNotifications((prev) => [...fresh, ...prev].slice(0, 50));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions]);

  // Abonnement dont le prix change : une alerte (une seule fois par paiement)
  useEffect(() => {
    const now = new Date();
    const fresh: NotificationItem[] = [];
    for (const sub of findSubscriptions(transactions, settings, categories, recurrings)) {
      if (!sub.change || sub.change.to <= sub.change.from) continue; // on n'alerte que pour une hausse
      const id = `sub-rise-${sub.key}-${sub.change.at.slice(0, 10)}`;
      if (notifications.some((n) => n.id === id)) continue;
      // seulement les paiements récents (pas un vieil historique importé)
      if (now.getTime() - new Date(sub.change.at).getTime() > 20 * 86400000) continue;
      fresh.push({
        id,
        type: 'budget',
        read: false,
        time: now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
        title: `${sub.name} coûte plus cher`,
        message: `Ton abonnement est passé de ${formatMoney(Math.round(sub.change.from), settings.mainCurrency)} à ${formatMoney(Math.round(sub.change.to), settings.mainCurrency)} par mois.`,
      });
    }
    if (fresh.length) setNotifications((prev) => [...fresh, ...prev].slice(0, 50));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, recurrings]);

  // Abonnement « à résilier » : le jour du rappel (et après, tant que ce n'est pas fait), une alerte
  useEffect(() => {
    const now = new Date();
    const today = ymd(now);
    const fresh: NotificationItem[] = [];
    for (const r of recurrings) {
      if (!r.active || !r.cancelBy || r.cancelBy > today) continue;
      const id = `sub-cancel-${r.id}-${r.cancelBy}`;
      if (notifications.some((n) => n.id === id)) continue;
      fresh.push({
        id,
        type: 'budget',
        read: false,
        time: now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
        title: `Pense à résilier ${r.title}`,
        message: `Prochaine échéance le ${new Date(r.nextDate + 'T00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}. Annule avant, ou retire le rappel dans « À venir ».`,
      });
    }
    if (fresh.length) setNotifications((prev) => [...fresh, ...prev].slice(0, 50));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recurrings]);

  // Objectifs : 25 / 50 / 75 / 100 % franchis -> alerte (et notification du téléphone) + célébration.
  // Chaque palier n'est fêté qu'une fois (src/lib/goalMilestones.ts).
  // Rappel de la semaine d'un objectif (« C'est vendredi : mets 10 $ dans Moto ») : une alerte par jour.
  // Même étiquette que la notification du serveur (push_goal_reminders) : jamais deux fois sur le téléphone.
  useEffect(() => {
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const weekdays = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
    const fresh: NotificationItem[] = [];
    for (const w of wallets) {
      const due = w.kind === 'goal' && w.goalReminder ? reminderDue(w, transactions, getPrefs().weekStart, now) : 0;
      if (!due || !w.goalReminder) continue;
      const id = `goal-reminder-${w.id}-${day}`;
      if (notifications.some((n) => n.id === id)) continue;
      fresh.push({
        id,
        type: 'goal',
        read: false,
        time: now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
        title: w.name,
        message: `C'est ${weekdays[now.getDay()]} : mets ${formatMoney(due, w.currency)} dans ${w.name}.${w.goalWhy?.trim() ? ` ${w.goalWhy.trim()}` : ''}`,
      });
    }
    if (fresh.length) setNotifications((prev) => [...fresh, ...prev].slice(0, 50));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallets, transactions]);

  // Notification touchée (« ?goal=…&deposit=10 ») : ouvrir l'ajout d'argent dans cet objectif
  useEffect(() => {
    const open = (href: string) => {
      const q = new URL(href, window.location.origin).searchParams;
      if (q.get('upcoming')) {
        navigate('upcoming');
        return;
      }
      // Raccourcis de l'icône (appui long sur Android) : « ?action=expense » ouvre l'ajout, « ?page=budgets » cet écran
      const action = q.get('action');
      if (action === 'expense' || action === 'income' || action === 'debt') {
        openAdd(action);
        return;
      }
      const page = q.get('page');
      if (page && ['home', 'transactions', 'wallets', 'profile', 'upcoming', 'budgets', 'history', 'debts', 'statistic', 'goals'].includes(page)) {
        navigate(page as Page);
        return;
      }
      const goal = q.get('goal');
      if (!goal) return;
      const amount = Number(q.get('deposit'));
      requestDeposit(goal, amount > 0 ? amount : undefined);
      navigate('goals');
    };
    if (/[?&](goal|upcoming|action|page)=/.test(window.location.search)) {
      open(window.location.href);
      window.history.replaceState(null, '', window.location.pathname);
    }
    // App déjà ouverte : le service worker transmet l'adresse de la notification
    const onMessage = (e: MessageEvent) => {
      if (e.data?.type === 'open-url' && typeof e.data.url === 'string') open(e.data.url);
    };
    navigator.serviceWorker?.addEventListener('message', onMessage);
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [celebration, setCelebration] = useState<Crossing | null>(null);
  useEffect(() => {
    const crossings = checkMilestones(wallets, transactions);
    if (crossings.length === 0) return;
    const time = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
    const fresh: NotificationItem[] = crossings.map(({ wallet: w, level, saved }) => ({
      id: `goal-${w.id}-${w.goalAmount}-${level}`,
      type: 'goal',
      read: false,
      time,
      title: level === 100 ? `${w.name} : objectif atteint !` : `${w.name} : ${level} % atteints`,
      message: `${formatMoney(saved, w.currency)} épargnés sur ${formatMoney(w.goalAmount ?? 0, w.currency)}. ${level === 100 ? "Bravo, tu l'as fait !" : 'Continue comme ça !'}`,
    }));
    setNotifications((prev) => [...fresh.filter((f) => !prev.some((n) => n.id === f.id)), ...prev].slice(0, 50));
    // Plusieurs objectifs d'un coup (synchro) : on fête le plus haut palier
    setCelebration(crossings.reduce((a, b) => (b.level > a.level ? b : a)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallets, transactions]);

  // Dettes et prêts : rappel la veille, le jour de l'échéance, puis en retard (une fois chacun)
  useEffect(() => {
    const now = new Date();
    const fresh: NotificationItem[] = [];
    for (const e of debtsSummary(transactions, settings)) {
      const level = dueLevel(e, now);
      if (!level) continue;
      // Même identifiant que le rappel push du serveur (push_debt_reminders) : jamais deux fois la même notification
      const id = `debt-due-${e.side}-${e.due}-${level}-${e.name.trim().toLowerCase()}`;
      if (notifications.some((n) => n.id === id)) continue;
      const r = e.side === 'receivable';
      const amount = formatMoney(e.left, e.currency ?? settings.mainCurrency);
      const when = level === 'soon' ? 'demain' : level === 'today' ? "aujourd'hui" : 'en retard';
      fresh.push({
        id,
        type: 'transaction',
        read: false,
        time: now.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }),
        title: level === 'late' ? `Remboursement en retard : ${e.name}` : `Remboursement ${when} : ${e.name}`,
        message: r
          ? `${e.name} doit te rendre ${amount}${level === 'late' ? ' (la date est passée)' : ` ${when}`}.`
          : `Tu dois rendre ${amount} à ${e.name}${level === 'late' ? ' (la date est passée)' : ` ${when}`}.`,
      });
    }
    if (fresh.length > 0) setNotifications((prev) => [...fresh, ...prev].slice(0, 50));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transactions, storedSettings]);

  // Taux de change automatiques : à l'ouverture, au retour sur l'app et quand le réseau revient
  const autoRates = useAutoRates();
  const rateCodes = currenciesNeedingRate(wallets, settings).join(',');
  useEffect(() => {
    if (!autoRates.on) return;
    const main = settings.mainCurrency;
    const run = () =>
      refreshRates(main, rateCodes ? rateCodes.split(',') : [])
        .then((fresh) => {
          if (fresh) setSettings((prev) => (prev.mainCurrency === main ? { ...prev, rates: { ...prev.rates, ...fresh } } : prev));
        })
        .catch(() => {}); // hors ligne ou service indisponible : on garde les derniers taux
    run();
    const onVisible = () => document.visibilityState === 'visible' && run();
    window.addEventListener('online', run);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', run);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRates.on, settings.mainCurrency, rateCodes]);

  const handleDeleteCategory = (id: string) => {
    // On supprime aussi ses sous-catégories
    setCategories((prev) => prev.filter((c) => c.id !== id && c.parentId !== id));
    showToast('Catégorie supprimée');
  };

  // Import d'un fichier (Money Lover, Excel, CSV) : déjà vérifié dans l'aperçu
  const handleImport = (plan: ImportPlan, replace: boolean) => {
    // Catégories déjà là que le fichier range sous un parent (elles prennent sa couleur)
    const moved = new Map(plan.categoryUpdates.map((u) => [u.id, u]));
    const recolor = (t: Transaction) => (t.categoryId && moved.has(t.categoryId) ? { ...t, color: moved.get(t.categoryId)!.color } : t);
    setWallets((prev) => [...prev, ...plan.newWallets]);
    setCategories((prev) => [
      ...prev.map((c) => (moved.has(c.id) ? { ...c, parentId: moved.get(c.id)!.parentId, color: moved.get(c.id)!.color } : c)),
      ...plan.newCategories,
    ]);
    setTransactions((prev) => (replace ? plan.transactions : [...plan.transactions, ...prev]).map(recolor));
    showToast(
      plan.transactions.length > 0
        ? `${plan.transactions.length} transactions importées`
        : `${plan.categoryUpdates.length} catégories rangées sous leur parent`
    );
  };

  // Restauration d'une sauvegarde complète
  const handleRestore = (b: Backup) => {
    setWallets(b.wallets);
    setTransactions(b.transactions);
    setCategories(b.categories);
    setSettings({ ...DEFAULT_SETTINGS, ...b.settings });
    replaceCustomIcons(b.customIcons);
    setBudgets(b.budgets ?? []);
    setRistournes(b.ristournes ?? []);
    setActiveWalletId('all');
    showToast('Sauvegarde restaurée');
  };

  // ---------- Compte en ligne et synchro ----------
  const profile = useProfile();
  useDisplayPrefs(); // un réglage d'affichage change : toute l'app se redessine
  const customIcons = useCustomIcons();
  const dataRef = useRef<SyncData>(null!);
  dataRef.current = { wallets, transactions, categories, budgets, settings, profileName: profile.name, customIcons, ristournes, debtShares, recurrings };
  const changeKey = useMemo(() => ({}), [wallets, transactions, categories, budgets, storedSettings, profile.name, customIcons, ristournes, debtShares, recurrings]);
  const cloud = useCloud({
    getLocal: () => dataRef.current,
    replaceLocal: (d, map) => {
      dataRef.current = d;
      setWallets(d.wallets);
      setTransactions(d.transactions);
      setBudgets(d.budgets);
      setRecurrings(d.recurrings);
      setActiveWalletId((prev) => map[prev] ?? prev);
    },
    applyPatch: (p) => {
      const all = !!p.replaceAll;
      const none = { upsert: [], remove: [] };
      setWallets((prev) => applyList(prev, p.wallets ?? (all ? none : undefined), all));
      setTransactions((prev) => applyList(prev, p.transactions ?? (all ? none : undefined), all));
      setBudgets((prev) => applyList(prev, p.budgets ?? (all ? none : undefined), all));
      setRecurrings((prev) => applyList(prev, p.recurrings ?? (all ? none : undefined), all));
      setRistournes((prev) => applyList(prev, p.ristournes ?? (all ? none : undefined), all));
      setDebtShares((prev) => applyList(prev, p.debtShares ?? (all ? none : undefined), all));
      if (p.categories) setCategories((prev) => applyList(prev, p.categories, all));
      if (p.customIcons || all) replaceCustomIcons(applyList(getAllCustomIcons(), p.customIcons ?? none, all));
      if (p.settings) setSettings(p.settings);
      if (p.profileName !== undefined) setProfileName(p.profileName);
      if (all) setActiveWalletId('all');
    },
    clearLocal: () => {
      setShowSplash(true); // déconnecté : on repart de l'écran d'accueil, puis de l'Accueil
      setPage('home');
      setWallets(DEFAULT_WALLETS);
      setTransactions([]);
      trashClear(); // la corbeille appartient à ce compte
      setCategories(DEFAULT_CATEGORIES);
      setBudgets([]);
      setRecurrings([]);
      setRistournes([]);
      setDebtShares([]);
      setSettings(DEFAULT_SETTINGS);
      setActiveWalletId('all');
      setNotifications(WELCOME);
      replaceCustomIcons([]);
      setProfileName('');
    },
    changeKey,
  });

  // Compte connecté (dettes partagées : qui a noté quoi)
  const me = cloud.user?.id ?? '';

  // Notifications du téléphone : chaque nouvelle alerte de l'app (budget, annonce…) devient aussi
  // une notification système ; celles déjà là à l'ouverture ne sont pas renvoyées
  const notified = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!notified.current) {
      notified.current = new Set(notifications.map((n) => n.id));
      return;
    }
    for (const n of notifications) {
      if (notified.current.has(n.id)) continue;
      notified.current.add(n.id);
      if (!n.read) void showSystemNotification(n.title, n.message, { tag: n.id });
    }
  }, [notifications]);

  // Connecté : cet appareil s'abonne aux notifications push (si elles sont activées)
  useEffect(() => {
    if (me) void subscribePush().catch(() => {});
  }, [me]);

  // Noms déjà utilisés dans les dettes et prêts (suggestions)
  const people = useMemo(
    () => [...new Set(transactions.map((t) => t.withPerson?.trim()).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'fr')),
    [transactions]
  );

  // Notes déjà écrites (suggestions dans la fenêtre d'ajout)
  const noteHistory = useMemo(() => buildNoteHistory(transactions), [transactions]);
  const usualAmounts = useMemo(() => buildAmountHistory(transactions), [transactions]);

  // Ce qui est commun aux deux interfaces
  const shared: SharedProps = {
    page,
    onNavigate: navigate,
    settings,
    onChangeSettings: setSettings,
    wallets,
    activeWalletLabel: activeWallet ? activeWallet.name : 'Tous les portefeuilles',
    activeWallet: activeWallet ?? null,
    balance,
    transactions: visibleTransactions,
    allTransactions: transactions,
    unreadCount,
    onQuickAction: handleQuickAction,
    onAddExpense: () => openAdd('expense'),
    onOpenAccountPicker: () => setIsAccountPickerOpen(true),
    onOpenNotifications: () => setIsNotificationsOpen(true),
    onSelectTransaction: (tx: Transaction) => setSelectedTxId(tx.id),
    categories,
    onAddCategory: handleAddCategory,
    onDeleteCategory: handleDeleteCategory,
    onUpdateCategory: handleUpdateCategory,
    onAddWallet: handleAddWallet,
    onUpdateWallet: handleUpdateWallet,
    onDeleteWallet: handleDeleteWallet,
    onTransfer: handleTransfer,
    onAdjustBalance: handleAdjustBalance,
    onReorderWallets: handleReorderWallets,
    onRemoveDuplicates: handleRemoveDuplicates,
    budgets,
    recurrings: liveRecurrings,
    onAddRecurring: handleAddRecurring,
    onUpdateRecurring: handleUpdateRecurring,
    onDeleteRecurring: handleDeleteRecurring,
    onConfirmRecurring: handleConfirmRecurring,
    onSkipRecurring: handleSkipRecurring,
    onAddBudget: handleAddBudget,
    onUpdateBudget: handleUpdateBudget,
    onDeleteBudget: handleDeleteBudget,
    onRestoreTrash: restoreTrash,
    cloud,
    onOpenJoin: () => setJoinCode(''),
    onOpenJoinRistourne: () => setRistourneCode(''),
    onOpenScan: () => setScan('camera'),
    reportPeriod,
    onOpenReport: openReport,
    onAddDebt: (preset?: DebtPreset) => openAdd('debt', preset ?? null),
    onEditDebts: handleEditDebts,
    onDeleteDebts: handleDeleteDebts,
    onAddDebtInterest: handleAddDebtInterest,
    onRemoveDebtInterest: handleRemoveDebtInterest,
    sharedDebts: { ...sharedDebts, me, cloud },
    ristournes,
    onCreateRistourne: handleCreateRistourne,
    onUpdateRistourne: handleUpdateRistourne,
    onDeleteRistourne: handleDeleteRistourne,
    onPayRistourne: handlePayRistourne,
    onUnpayRistourne: handleUnpayRistourne,
    onConfirmRistournePayment: handleConfirmRistournePayment,
    onReceiveRistourne: handleReceiveRistourne,
    onImport: handleImport,
    onRestore: handleRestore,
    onOpenTutorial: () => setShowTutorial(true),
  };

  return (
    <div className="min-h-dvh text-slate-900 font-sans antialiased">
      {showSplash && <Splash onDone={() => setShowSplash(false)} />}
      {isDesktop ? (
        <DesktopApp {...shared} />
      ) : (
        <MobileApp {...shared} onOpenDrawer={() => setIsDrawerOpen(true)} />
      )}
      {/* Sous l'écran d'accueil (z-100), qui s'efface dessus */}
      {showTutorial && (
        <Tutorial
          onDone={() => {
            setShowTutorial(false);
            // Juste après le tutoriel : comment installer Wallo (une seule fois, sur téléphone)
            if (shouldOfferInstall()) setTimeout(() => setShowInstall(true), 450);
          }}
        />
      )}
      {showInstall && <InstallGuide onClose={() => setShowInstall(false)} />}
      {!showTutorial && showNews && (
        <Tutorial
          news
          onDone={() => {
            setShowNews(false);
            if (shouldOfferInstall()) setTimeout(() => setShowInstall(true), 450);
          }}
        />
      )}
      {/* Code / Face ID : par-dessus tout, au démarrage et au retour dans l'app */}
      <AppLock cloud={cloud} />

      {/* Message de confirmation */}
      {/* Centré sur toute la largeur (pas left-1/2 : il n'avait que la moitié de l'écran et se tassait en ovale) */}
      {toastMessage && (
        <div className="fixed inset-x-4 top-[max(1rem,env(safe-area-inset-top))] z-[60] flex justify-center pointer-events-none" role="status">
          {/* Même style que les cartes de l'app (blanc en clair, gris foncé en sombre) */}
          <div className="max-w-[420px] bg-white text-slate-900 border border-slate-100 pl-2.5 pr-4 py-2.5 rounded-2xl text-sm font-semibold leading-snug shadow-[0_8px_30px_rgba(0,0,0,0.18)] flex items-center gap-2.5 animate-toast">
            <span className="w-7 h-7 rounded-full bg-accent flex items-center justify-center shrink-0">
              <Check className="w-[18px] h-[18px]" strokeWidth={3.5} />
            </span>
            <span>{toastMessage}</span>
            {toastAction && (
              <button
                onClick={() => {
                  toastAction.run();
                  setToastAction(null);
                }}
                className="pointer-events-auto ml-1 h-8 px-3 rounded-full bg-slate-100 text-[13px] font-bold text-slate-900 cursor-pointer active:scale-95 transition"
              >
                {toastAction.label}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Fenêtres */}
      <AddTransactionModal
        mode={addMode}
        categories={categories}
        settings={settings}
        wallets={activeWallets}
        defaultWalletId={activeWallet?.id ?? activeWallets[0]?.id ?? ''}
        onClose={() => setAddMode(null)}
        onChangeMode={setAddMode}
        onSave={handleAddTransaction}
        onSplit={handleSplitBill}
        preset={addPreset}
        people={people}
        noteHistory={noteHistory}
        usualAmounts={usualAmounts}
        onSaveMany={handleAddMany}
        onManageCategories={() => {
          setAddMode(null);
          navigate('categories');
        }}
      />

      <AccountSwitcherSheet
        isOpen={isAccountPickerOpen}
        onClose={() => setIsAccountPickerOpen(false)}
        wallets={activeWallets}
        transactions={transactions}
        activeWalletId={activeWallet ? activeWallet.id : 'all'}
        totalBalance={totalBalance}
        onSelect={(id) => {
          setActiveWalletId(id);
          showToast(id === 'all' ? 'Tous les portefeuilles' : `Portefeuille actif : ${wallets.find((w) => w.id === id)?.name}`);
        }}
        onAddWallet={() => {
          setIsAccountPickerOpen(false);
          navigate('wallets');
        }}
      />

      <TransactionDetailModal
        transaction={selectedTransaction}
        wallets={wallets}
        categories={categories}
        settings={settings}
        onClose={() => setSelectedTxId(null)}
        onUpdate={handleUpdateTransaction}
        onDelete={handleDeleteTransaction}
        onDuplicate={handleDuplicateTransaction}
      />

      {scan === 'camera' && <QrScanner onClose={() => setScan(null)} onFound={openInvite} onTypeCode={() => setScan('type')} />}
      {scan === 'type' && <TypeCodeSheet onClose={() => setScan(null)} onPick={(kind) => openInvite(kind, '')} />}

      {joinCode !== null && (
        <JoinWalletSheet
          cloud={cloud}
          initialCode={joinCode}
          profileName={profile.name}
          onClose={closeJoin}
          onScan={() => {
            closeJoin();
            setScan('camera');
          }}
          onJoined={(name) => {
            closeJoin();
            navigate('wallets');
            showToast(`Bienvenue dans « ${name} »`);
          }}
        />
      )}

      {ristourneCode !== null && (
        <JoinRistourneSheet
          cloud={cloud}
          initialCode={ristourneCode}
          profileName={profile.name}
          onClose={closeRistourneJoin}
          onScan={() => {
            closeRistourneJoin();
            setScan('camera');
          }}
          onJoined={(name) => {
            closeRistourneJoin();
            navigate('ristourne');
            showToast(`Bienvenue dans « ${name} »`);
          }}
        />
      )}

      {debtCode !== null && (
        <JoinDebtSheet
          cloud={cloud}
          initialCode={debtCode}
          profileName={profile.name}
          people={people}
          wallets={wallets.filter((w) => !w.archived)}
          onClose={closeDebtJoin}
          onScan={() => {
            closeDebtJoin();
            setScan('camera');
          }}
          onDone={(message, history) => {
            if (history) setHistoryTo(history);
            closeDebtJoin();
            navigate('debts');
            showToast(message);
          }}
        />
      )}

      {cloud.status === 'needs-decision' && <MergeDialog cloud={cloud} />}

      <NotificationsModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        notifications={notifications}
        onMarkAllRead={() => setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))}
        onOpen={handleOpenNotification}
      />

      {/* Menu latéral : seulement sur mobile */}
      {!isDesktop && (
        <NavigationDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          onNavigate={navigate}
          onOpenSend={() => openAdd('expense')}
          onOpenHistory={() => navigate('history')}
          onOpenScan={() => setScan('camera')}
        />
      )}
      {celebration && (
        <Suspense fallback={null}>
          <GoalCelebration
            crossing={celebration}
            transactions={transactions}
            onClose={() => setCelebration(null)}
            onOpenGoals={() => {
              setCelebration(null);
              navigate('goals');
            }}
            onNewGoal={() => {
              setCelebration(null);
              requestNewGoal();
              navigate('goals');
            }}
            onArchive={(id) => {
              setCelebration(null);
              handleUpdateWallet(id, { archived: true });
            }}
          />
        </Suspense>
      )}

      {ristournePot && (
        <RistourneGoalPrompt
          pot={ristournePot}
          wallets={wallets}
          transactions={transactions}
          settings={settings}
          onClose={() => setRistournePot(null)}
          onTransfer={handleTransfer}
        />
      )}

      {/* Confirmations (supprimer, retirer…) : au-dessus de tout */}
      <ConfirmHost />
    </div>
  );
}
