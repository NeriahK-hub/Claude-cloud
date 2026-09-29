import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Transaction, NotificationItem, Wallet, Settings, Budget } from './types';
import { usePersistentState } from './hooks/usePersistentState';
import { convertBetween, formatMoney, makeBalance, toMain, totalInMain, walletBalance } from './lib/money';
import { HomeAction } from './components/BalanceSection';
import { SharedProps } from './components/appProps';
import { Page } from './components/BottomNav';
import { useIsDesktop } from './hooks/useIsDesktop';
import { Category, DEFAULT_CATEGORIES } from './data/categories';
import { Backup, ImportPlan } from './lib/importExport';
import { getAllCustomIcons, replaceCustomIcons, useCustomIcons } from './lib/customIcons';
import { setProfileName, useProfile } from './lib/profile';
import { useCloud } from './lib/sync/useCloud';
import { applyList } from './lib/sync/engine';
import type { SyncData } from './lib/sync/mapping';
import { MergeDialog } from './components/Account';
import type { DebtPreset } from './components/DebtsView';
import { budgetStatus } from './lib/budgets';
import { uuid } from './lib/ids';

// Les deux interfaces
import { MobileApp } from './components/MobileApp';
import { DesktopApp } from './components/DesktopApp';

// Fenêtres partagées par les deux interfaces
import { AddTransactionModal, AddMode } from './components/AddTransactionModal';
import { TransactionDetailModal } from './components/TransactionDetailModal';
import { AccountSwitcherSheet } from './components/AccountSwitcherSheet';
import { NotificationsModal } from './components/NotificationsModal';
import { NavigationDrawer } from './components/NavigationDrawer';
import { CheckCircle } from 'lucide-react';
import { haptic } from './lib/haptics';

const DEFAULT_WALLETS: Wallet[] = [
  { id: 'wallet-cash', name: 'Cash', icon: 'Banknote', color: '#059669', currency: 'USD', initialBalance: 0, includeInTotal: true, archived: false },
  { id: 'wallet-momo', name: 'Mobile Money', icon: 'Smartphone', color: '#F97316', currency: 'USD', initialBalance: 0, includeInTotal: true, archived: false },
];

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
  const [notifications, setNotifications] = usePersistentState<NotificationItem[]>('ap.notifications', WELCOME);

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

  // Portefeuille choisi sur l'accueil ('all' si absent ou archivé)
  const activeWallet = wallets.find((w) => w.id === activeWalletId && !w.archived);
  const activeWallets = wallets.filter((w) => !w.archived);
  const visibleTransactions = activeWallet ? transactions.filter((t) => t.walletId === activeWallet.id) : transactions;
  const totalBalance = makeBalance(totalInMain(wallets, transactions, settings), settings);
  const balance = activeWallet
    ? makeBalance(toMain(walletBalance(activeWallet, transactions), activeWallet.currency, settings), settings)
    : totalBalance;

  // Message de confirmation (+ petit double « tic » : l'action a bien été faite)
  const showToast = (msg: string) => {
    haptic('success');
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const navigate = (p: Page) => {
    setPage(p);
    window.scrollTo(0, 0);
  };

  // Ouvre l'écran d'ajout (il faut au moins un portefeuille actif)
  const openAdd = (mode: AddMode, preset: DebtPreset | null = null) => {
    setAddPreset(preset);
    if (activeWallets.length === 0) {
      showToast("Crée d'abord un portefeuille");
      navigate('wallets');
      return;
    }
    setAddMode(mode);
  };

  // Les 4 boutons d'action
  const handleQuickAction = (action: HomeAction) => {
    switch (action) {
      case 'expense':
      case 'income':
        openAdd(action);
        break;
      case 'budget':
        navigate('budgets');
        break;
      case 'ristourne':
        navigate('ristourne');
        break;
    }
  };

  // Enregistrer une dépense ou un revenu
  const handleAddTransaction = (amount: number, category: Category, note: string, walletId: string, currency: string, memberId?: string, withPerson?: string) => {
    const wallet = wallets.find((w) => w.id === walletId);
    if (!wallet) return;
    const isExpense = addMode === 'expense' || (addMode === 'debt' && category.direction === 'out');
    // Le montant est converti dans la devise du portefeuille si on en a choisi une autre
    const inWallet = convertBetween(amount, currency, wallet.currency, settings);
    if (inWallet === null) return;
    const signed = isExpense ? -inWallet : inWallet;
    const differs = currency !== wallet.currency;

    const newTx: Transaction = {
      id: uuid(),
      title: note || (withPerson ? `${category.name} · ${withPerson}` : category.name),
      createdAt: new Date().toISOString(),
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
      memberId,
      withPerson,
    };

    setTransactions((prev) => [newTx, ...prev]);
    showToast(
      addMode === 'debt'
        ? `${category.name} de ${formatMoney(amount, currency)} enregistré`
        : `${isExpense ? 'Dépense' : 'Revenu'} de ${formatMoney(amount, currency)} enregistré${isExpense ? 'e' : ''}`
    );
  };

  // Transfert entre deux portefeuilles : une sortie + une entrée, reliées par transferId
  const handleTransfer = (fromId: string, toId: string, fromAmount: number, toAmount: number, note: string, fee: number) => {
    const from = wallets.find((w) => w.id === fromId);
    const to = wallets.find((w) => w.id === toId);
    if (!from || !to || fromAmount <= 0 || toAmount <= 0) return;
    const base = {
      createdAt: new Date().toISOString(),
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

  const handleDeleteTransaction = (tx: Transaction) => {
    const ids = new Set(groupOf(tx).map((t) => t.id));
    setTransactions((prev) => prev.filter((t) => !ids.has(t.id)));
    setSelectedTxId(null);
    showToast(ids.size > 1 ? 'Transfert supprimé' : 'Transaction supprimée');
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
    setBudgets((prev) => prev.filter((b) => b.id !== id));
    showToast('Budget supprimé');
  };

  // Alerte quand un budget du mois atteint 80 %, puis 100 % (une seule fois par budget, par mois et par seuil)
  useEffect(() => {
    const now = new Date();
    const month = `${now.getFullYear()}-${now.getMonth() + 1}`;
    const fresh: NotificationItem[] = [];
    for (const b of budgets) {
      const cat = categories.find((c) => c.id === b.categoryId);
      if (b.categoryId && !cat) continue;
      const st = budgetStatus(b, transactions, categories, settings);
      const level = st.ratio >= 1 ? 100 : st.ratio >= 0.8 ? 80 : 0;
      const id = `budget-${b.id}-${month}-${level}`;
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
            ? `Tu as dépensé ${formatMoney(st.spent, b.currency)} sur ${formatMoney(b.amount, b.currency)} ce mois-ci.`
            : `${Math.round(st.ratio * 100)} % utilisé : il reste ${formatMoney(st.left, b.currency)} pour ce mois.`,
      });
    }
    if (fresh.length > 0) {
      setNotifications((prev) => [...fresh, ...prev].slice(0, 50));
      showToast(fresh[0].title);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [budgets, transactions, categories]);

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
    setActiveWalletId('all');
    showToast('Sauvegarde restaurée');
  };

  // ---------- Compte en ligne et synchro ----------
  const profile = useProfile();
  const customIcons = useCustomIcons();
  const dataRef = useRef<SyncData>(null!);
  dataRef.current = { wallets, transactions, categories, budgets, settings, profileName: profile.name, customIcons };
  const changeKey = useMemo(() => ({}), [wallets, transactions, categories, budgets, storedSettings, profile.name, customIcons]);
  const cloud = useCloud({
    getLocal: () => dataRef.current,
    replaceLocal: (d, map) => {
      dataRef.current = d;
      setWallets(d.wallets);
      setTransactions(d.transactions);
      setBudgets(d.budgets);
      setActiveWalletId((prev) => map[prev] ?? prev);
    },
    applyPatch: (p) => {
      const all = !!p.replaceAll;
      const none = { upsert: [], remove: [] };
      setWallets((prev) => applyList(prev, p.wallets ?? (all ? none : undefined), all));
      setTransactions((prev) => applyList(prev, p.transactions ?? (all ? none : undefined), all));
      setBudgets((prev) => applyList(prev, p.budgets ?? (all ? none : undefined), all));
      if (p.categories) setCategories((prev) => applyList(prev, p.categories, all));
      if (p.customIcons || all) replaceCustomIcons(applyList(getAllCustomIcons(), p.customIcons ?? none, all));
      if (p.settings) setSettings(p.settings);
      if (p.profileName !== undefined) setProfileName(p.profileName);
      if (all) setActiveWalletId('all');
    },
    clearLocal: () => {
      setWallets(DEFAULT_WALLETS);
      setTransactions([]);
      setCategories(DEFAULT_CATEGORIES);
      setBudgets([]);
      setSettings(DEFAULT_SETTINGS);
      setActiveWalletId('all');
      setNotifications(WELCOME);
      replaceCustomIcons([]);
      setProfileName('');
    },
    changeKey,
  });

  // Noms déjà utilisés dans les dettes et prêts (suggestions)
  const people = useMemo(
    () => [...new Set(transactions.map((t) => t.withPerson?.trim()).filter((x): x is string => !!x))].sort((a, b) => a.localeCompare(b, 'fr')),
    [transactions]
  );

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
    budgets,
    onAddBudget: handleAddBudget,
    onUpdateBudget: handleUpdateBudget,
    onDeleteBudget: handleDeleteBudget,
    cloud,
    onAddDebt: (preset?: DebtPreset) => openAdd('debt', preset ?? null),
    onImport: handleImport,
    onRestore: handleRestore,
  };

  return (
    <div className="min-h-dvh text-slate-900 font-sans antialiased">
      {isDesktop ? (
        <DesktopApp {...shared} />
      ) : (
        <MobileApp {...shared} onOpenDrawer={() => setIsDrawerOpen(true)} />
      )}

      {/* Message de confirmation */}
      {toastMessage && (
        <div className="fixed top-[max(1rem,env(safe-area-inset-top))] left-1/2 -translate-x-1/2 z-[60] bg-slate-900 text-white px-4 py-2.5 rounded-full text-xs font-bold shadow-lg flex items-center gap-2 animate-toast">
          <CheckCircle className="w-4 h-4 text-[#D8FB52]" />
          <span>{toastMessage}</span>
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
        preset={addPreset}
        people={people}
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
        onClose={() => setSelectedTxId(null)}
        onUpdate={handleUpdateTransaction}
        onDelete={handleDeleteTransaction}
        onDuplicate={handleDuplicateTransaction}
      />

      {cloud.status === 'needs-decision' && <MergeDialog cloud={cloud} />}

      <NotificationsModal
        isOpen={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        notifications={notifications}
        onMarkAllRead={() => setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))}
      />

      {/* Menu latéral : seulement sur mobile */}
      {!isDesktop && (
        <NavigationDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          onNavigate={navigate}
          onOpenSend={() => openAdd('expense')}
          onOpenHistory={() => navigate('history')}
        />
      )}
    </div>
  );
}
