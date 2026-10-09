import React, { Suspense, useEffect } from 'react';
import { HealthCard } from './HealthCard';
import { BadgesCard } from './BadgesCard';
import { ReviewCards } from './ReviewCards';
import { FestiveCard, FestiveLayer } from './Festive';
import { useFestive } from '../lib/festive';
import { BudgetsHomeCard, GoalsHomeCard } from './HomeExtraCards';
import { CoachTour, GOAL_TIPS, HOME_TIPS, REPORT_TIPS, SIMPLE_TIPS, WALLET_TIPS } from './CoachTour';
import { NetworkCloud } from './NetworkCloud';
import { Home, BarChart2, Users, Wallet, User, Bell, Plus, ChevronRight, History, Tags, Settings as SettingsIcon, PieChart, HandCoins, Target, CalendarClock } from 'lucide-react';
import { SharedProps } from './appProps';
import { WalletsView, HomeWalletCard } from './WalletsView';
import { isShared } from './Members';
import { countsInStats, formatMoney, toMain, walletBalance } from '../lib/money';
import { IconBadge, WalletChipIcon } from './AppIcon';
import { BalanceLabel, HomeAction, useHomeActions } from './BalanceSection';
import { featureOn, useRemoteConfig } from '../lib/remoteConfig';
import { MatrixSwap } from './MatrixSwap';
import { useDisplayPrefs } from '../lib/display';
import { Page } from './BottomNav';
import { TransactionItem } from './TransactionItem';
import { MonthReportCard } from './MonthReportCard';
import { AdBanner } from './AdBanner';
import { inThisMonth } from '../lib/periods';
import { TransactionHistoryView, StatisticView, SettingsView, ProfileView, RistourneView, CategoriesView, BudgetsView, DebtsView, PlacesView, UpcomingView, HelpView } from './pages';
import { DueCard } from './DueCard';
import { RateCard } from './RateCard';
import { PageSkeleton } from './Skeleton';
import { SubsHomeCard } from './SubsHomeCard';
import { useHomeLayout } from '../lib/homeLayout';
import { SimpleMonth } from './SimpleHome';

// Interface ORDINATEUR : menu à gauche, contenu en grille à droite
type DesktopAppProps = SharedProps;

const MENU: { id: Page; label: string; icon: React.ElementType }[] = [
  { id: 'home', label: 'Accueil', icon: Home },
  { id: 'history', label: 'Historique', icon: History },
  { id: 'statistic', label: 'Statistiques', icon: BarChart2 },
  { id: 'budgets', label: 'Budgets', icon: PieChart },
  { id: 'goals', label: 'Objectifs', icon: Target },
  { id: 'upcoming', label: 'À venir', icon: CalendarClock },
  { id: 'debts', label: 'Dettes et prêts', icon: HandCoins },
  { id: 'ristourne', label: 'Ristourne', icon: Users },
  { id: 'categories', label: 'Catégories', icon: Tags },
  { id: 'wallets', label: 'Portefeuilles', icon: Wallet },
  { id: 'settings', label: 'Paramètres', icon: SettingsIcon },
  { id: 'profile', label: 'Profil', icon: User },
];

export const DesktopApp: React.FC<DesktopAppProps> = (p) => {
  const {
    page, onNavigate, settings, wallets, balance, activeWalletLabel, transactions, allTransactions,
    unreadCount, onQuickAction, onAddExpense, onOpenAccountPicker, onOpenNotifications,
    onSelectTransaction, categories, onAddCategory, onDeleteCategory,
  } = p;
  const main = settings.mainCurrency;
  const { hideBalance, simpleMode } = useDisplayPrefs();
  const layout = useHomeLayout(); // accueil au choix (Paramètres › Accueil) : sur ordinateur, on cache ce qui est décoché
  const festive = useFestive(); // design des fêtes (espace admin)
  useEffect(() => {
    if (festive) document.documentElement.dataset.festive = festive;
    else delete document.documentElement.dataset.festive;
  }, [festive]); // carte du portefeuille : désactivée par défaut
  const now = new Date();
  const thisMonth = transactions.filter((t) => countsInStats(t) && inThisMonth(t.createdAt, now));
  const spent = thisMonth.filter((t) => t.amount < 0).reduce((s, t) => s - toMain(t.amount, t.currency, settings), 0);
  const earned = thisMonth.filter((t) => t.amount > 0).reduce((s, t) => s + toMain(t.amount, t.currency, settings), 0);
  const remote = useRemoteConfig();
  const actions = useHomeActions();
  // Menu sans les fonctionnalités désactivées (espace admin)
  const OFF: Partial<Record<Page, boolean>> = { debts: !featureOn(remote, 'debts'), budgets: !featureOn(remote, 'budgets'), ristourne: !featureOn(remote, 'ristournes') };
  const menu = MENU.filter((m) => !OFF[m.id]);
  const pageTitle = MENU.find((m) => m.id === page)?.label ?? '';

  return (
    <div className="min-h-dvh flex bg-slate-100">
      {/* Menu de gauche */}
      <aside className="w-64 shrink-0 bg-white border-r border-slate-200/70 p-5 flex flex-col sticky top-0 h-dvh">
        <div className="flex items-center gap-2.5 mb-8 px-2">
          <img src="/icons/wallo.svg" alt="" className="w-9 h-9" />
          <span className="text-base font-extrabold tracking-tight">Wallo</span>
        </div>

        <nav className="flex flex-col gap-1">
          {menu.map(({ id, label, icon: Icon }) => {
            const active = page === id || (id === 'history' && page === 'transactions');
            return (
              <button
                key={id}
                onClick={() => onNavigate(id)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition cursor-pointer text-left ${
                  active ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            );
          })}
        </nav>

        <button
          onClick={onAddExpense}
          className="mt-auto w-full py-3 rounded-2xl bg-accent hover:bg-accent-hover font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Ajouter une transaction
        </button>
      </aside>

      {/* Contenu */}
      <main className="flex-1 min-w-0 px-8 py-6">
        <Suspense fallback={page === 'home' ? null : <PageSkeleton />}>
        {page === 'home' && festive && <FestiveLayer kind={festive} />}
        {/* Bulles d'aide des premières fois (une seule fois chacune) */}
        {page === 'home' && <CoachTour key={simpleMode ? 'simple' : 'full'} steps={simpleMode ? SIMPLE_TIPS : HOME_TIPS} />}
        {page === 'statistic' && <CoachTour key="report" steps={REPORT_TIPS} />}
        {page === 'wallets' && <CoachTour key="wallets" steps={WALLET_TIPS} />}
        {page === 'goals' && <CoachTour key="goals" steps={GOAL_TIPS} />}

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight">{pageTitle}</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={onOpenAccountPicker}
              className="pl-2 pr-4 py-2 rounded-2xl bg-white border border-slate-200 text-xs font-bold flex items-center gap-2 cursor-pointer hover:bg-slate-50"
            >
              <WalletChipIcon wallet={p.activeWallet} />
              {activeWalletLabel}
            </button>
            <NetworkCloud cloud={p.cloud} onOpenAccount={() => onNavigate('profile')} />
            <button
              onClick={onOpenNotifications}
              aria-label="Notifications"
              className="w-10 h-10 rounded-2xl bg-white border border-slate-200 flex items-center justify-center relative cursor-pointer hover:bg-slate-50"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1.5 rounded-full bg-accent text-slate-950 text-[11px] leading-none font-extrabold tabular-nums flex items-center justify-center border-2 border-white">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {page === 'home' && (
          <div className="grid grid-cols-3 gap-6 max-w-6xl">
            {/* Colonne gauche (2/3) */}
            <div className="col-span-2 space-y-6">
              <div className="bg-white rounded-3xl p-6 border border-slate-100">
                <BalanceLabel className="text-slate-400 font-semibold" />
                <div className="text-5xl font-extrabold tracking-tight tabular-nums mt-1 mb-6">
                  <MatrixSwap hidden={hideBalance} text={formatMoney(balance.main, balance.mainCurrency)} />
                </div>
                {balance.second !== null && balance.secondCurrency && (
                  <div className="text-base font-semibold text-slate-400 tabular-nums -mt-4 mb-6">
                    <MatrixSwap hidden={hideBalance} text={formatMoney(balance.second, balance.secondCurrency)} />
                  </div>
                )}
                <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}>
                  {actions.map(({ id, label, icon: Icon, highlight }) => (
                    <button
                      key={id}
                      onClick={() => onQuickAction(id)}
                      className={`py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition cursor-pointer ${
                        highlight
                          ? 'bg-accent hover:bg-accent-hover'
                          : 'bg-slate-50 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {layout.show('wallet') && p.activeWallet && (p.activeWallet.kind === 'goal' || p.activeWallet.kind === 'credit' || isShared(p.activeWallet)) && (
                <HomeWalletCard wallet={p.activeWallet} transactions={allTransactions} />
              )}

              {festive && layout.show('festive') && <FestiveCard kind={festive} onNavigate={onNavigate} />}
              {layout.show('review') && (
                <div className="empty:hidden">
                  <ReviewCards transactions={p.transactions} settings={settings} categories={categories} />
                </div>
              )}
              {layout.show('rates') && (
                <div className="empty:hidden">
                  <RateCard settings={settings} wallets={wallets} onChangeSettings={p.onChangeSettings} />
                </div>
              )}
              {layout.show('due') && (
                <div className="empty:hidden">
                  <DueCard recurrings={p.recurrings} categories={categories} onConfirm={p.onConfirmRecurring} onSkip={p.onSkipRecurring} onOpen={() => onNavigate('upcoming')} />
                </div>
              )}
              {layout.show('subs') && (
                <div className="empty:hidden">
                  <SubsHomeCard transactions={allTransactions} settings={settings} categories={categories} recurrings={p.recurrings} onOpen={() => onNavigate('upcoming')} />
                </div>
              )}
              {layout.show('budgets') && (
                <div className="empty:hidden">
                  <BudgetsHomeCard budgets={p.budgets} transactions={allTransactions} categories={categories} settings={settings} onOpen={() => onNavigate('budgets')} />
                </div>
              )}
              {layout.show('goals') && (
                <div className="empty:hidden">
                  <GoalsHomeCard wallets={wallets} transactions={allTransactions} onOpen={() => onNavigate('goals')} />
                </div>
              )}
              <AdBanner />
              {/* Mode simple : un résumé du mois à la place des cartes santé, badges et rapport */}
              {simpleMode ? (
                layout.show('month') && <SimpleMonth transactions={p.transactions} settings={settings} hidden={hideBalance} />
              ) : (
                <>
                  {layout.show('health') && <HealthCard transactions={allTransactions} wallets={wallets} budgets={p.budgets} categories={categories} settings={settings} shared={p.sharedDebts} onNavigate={onNavigate} onSelectTransaction={onSelectTransaction} />}
                  {layout.show('badges') && <BadgesCard transactions={allTransactions} wallets={wallets} budgets={p.budgets} categories={categories} settings={settings} shared={p.sharedDebts} />}

                  {layout.show('month') && <MonthReportCard
                    allTransactions={allTransactions}
                    wallets={wallets}
                    activeWallet={p.activeWallet}
                    settings={settings}
                    onOpenReports={() => onNavigate('statistic')}
                    onOpenGoals={() => onNavigate('goals')}
                recurrings={p.recurrings}
                  />}
                </>
              )}

              {layout.show('list') && (
              <div className="bg-white rounded-3xl p-6 border border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-base font-bold">Dernières transactions</h2>
                  <button
                    onClick={() => onNavigate('history')}
                    className="text-xs font-bold text-slate-500 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
                  >
                    Tout voir <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="divide-y divide-slate-100">
                  {transactions.slice(0, 6).map((tx) => (
                    <TransactionItem key={tx.id} transaction={tx} onClick={onSelectTransaction} />
                  ))}
                </div>
              </div>
              )}
            </div>

            {/* Colonne droite (1/3) */}
            <div className="space-y-6">
              <div className="bg-white rounded-3xl p-6 border border-slate-100">
                <h2 className="text-base font-bold mb-4">Ce mois-ci</h2>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-slate-500">Revenus</span>
                  <span className="font-bold text-emerald-600 tabular-nums">+{formatMoney(earned, main)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-500">Dépenses</span>
                  <span className="font-bold tabular-nums">−{formatMoney(spent, main)}</span>
                </div>
              </div>

              <div className="bg-white rounded-3xl p-6 border border-slate-100">
                <h2 className="text-base font-bold mb-4">Mes portefeuilles</h2>
                <div className="space-y-3">
                  {wallets.filter((w) => !w.archived).map((w) => (
                    <div key={w.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2 text-slate-600 min-w-0">
                        <IconBadge icon={w.icon} image={w.image} color={w.color} size="sm" />
                        <span className="truncate">{w.name}</span>
                      </span>
                      <span className="font-bold tabular-nums">{formatMoney(walletBalance(w, allTransactions), w.currency)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Portefeuilles : vraie mise en page ordinateur (grille, détail en deux colonnes) */}
        {page === 'wallets' && (
          <WalletsView
            wallets={wallets}
            transactions={allTransactions}
            defaultCurrency={main}
            onAdd={p.onAddWallet}
            onUpdate={p.onUpdateWallet}
            onDelete={p.onDeleteWallet}
            onSelectTransaction={p.onSelectTransaction}
            onTransfer={p.onTransfer}
            settings={settings}
            onAdjustBalance={p.onAdjustBalance}
            onReorder={p.onReorderWallets}
            cloud={p.cloud}
            onJoin={p.onOpenJoin}
            onRemoveDuplicates={p.onRemoveDuplicates}
          />
        )}

        {page === 'goals' && (
          <WalletsView
            goalsOnly
            onBack={() => onNavigate('home')}
            wallets={wallets}
            transactions={allTransactions}
            defaultCurrency={main}
            onAdd={p.onAddWallet}
            onUpdate={p.onUpdateWallet}
            onDelete={p.onDeleteWallet}
            onSelectTransaction={p.onSelectTransaction}
            onTransfer={p.onTransfer}
            settings={settings}
            onAdjustBalance={p.onAdjustBalance}
            onReorder={p.onReorderWallets}
            cloud={p.cloud}
          />
        )}

        {/* Les autres pages : chaque écran a sa mise en page ordinateur (useIsDesktop) */}
        {page !== 'home' && page !== 'wallets' && page !== 'goals' && (
          <div className="desk-page">
            {(page === 'history' || page === 'transactions') && (
              <TransactionHistoryView
                transactions={allTransactions}
                wallets={wallets}
                initialWalletId={p.activeWallet?.id ?? 'all'}
                settings={settings}
                onSelectTransaction={onSelectTransaction}
              />
            )}
            {page === 'debts' && (
              <DebtsView
                transactions={allTransactions}
                settings={settings}
                onBack={() => onNavigate('home')}
                onAdd={p.onAddDebt}
                onEdit={p.onEditDebts}
                onDelete={p.onDeleteDebts}
                shared={p.sharedDebts}
                onAddInterest={p.onAddDebtInterest}
                onRemoveInterest={p.onRemoveDebtInterest}
                onSelectTransaction={onSelectTransaction}
              />
            )}
            {page === 'upcoming' && (
              <UpcomingView
                recurrings={p.recurrings}
                transactions={allTransactions}
                wallets={wallets}
                categories={categories}
                settings={settings}
                onAdd={p.onAddRecurring}
                onUpdate={p.onUpdateRecurring}
                onDelete={p.onDeleteRecurring}
                onConfirm={p.onConfirmRecurring}
                onSkip={p.onSkipRecurring}
                onBack={() => onNavigate('home')}
              />
            )}
            {page === 'budgets' && (
              <BudgetsView
                budgets={p.budgets}
                recurrings={p.recurrings}
                transactions={allTransactions}
                categories={categories}
                settings={settings}
                onAdd={p.onAddBudget}
                onUpdate={p.onUpdateBudget}
                onDelete={p.onDeleteBudget}
                onBack={() => onNavigate('home')}
                onSelectTransaction={onSelectTransaction}
              />
            )}
            {page === 'ristourne' && <RistourneView
                cloud={p.cloud}
                ristournes={p.ristournes}
                wallets={wallets.filter((w) => !w.archived)}
                defaultCurrency={settings.mainCurrency}
                onBack={() => onNavigate('home')}
                onCreate={p.onCreateRistourne}
                onUpdate={p.onUpdateRistourne}
                onDelete={p.onDeleteRistourne}
                onPay={p.onPayRistourne}
                onUnpay={p.onUnpayRistourne}
                onConfirm={p.onConfirmRistournePayment}
                onReceive={p.onReceiveRistourne}
                onJoin={p.onOpenJoinRistourne}
              />}
            {page === 'categories' && (
              <CategoriesView
                categories={categories}
                onBack={() => onNavigate('home')}
                onAdd={onAddCategory}
                onDelete={onDeleteCategory}
                onUpdate={p.onUpdateCategory}
              />
            )}
            {page === 'statistic' && (
              <StatisticView
                allTransactions={allTransactions}
                wallets={wallets}
                activeWallet={p.activeWallet}
                activeWalletLabel={activeWalletLabel}
                categories={categories}
                settings={settings}
                onSelectTransaction={onSelectTransaction}
                onOpenAccountPicker={onOpenAccountPicker}
                budgets={p.budgets}
                onNavigate={onNavigate}
              />
            )}
            {page === 'settings' && (
              <SettingsView settings={settings} wallets={wallets} transactions={p.allTransactions} categories={p.categories} budgets={p.budgets} ristournes={p.ristournes} onRestoreTrash={p.onRestoreTrash} onImport={p.onImport} onRestore={p.onRestore} onChange={p.onChangeSettings} onBack={() => onNavigate('home')} />
            )}
            {page === 'profile' && <ProfileView onNavigate={onNavigate} cloud={p.cloud} />}
        {page === 'places' && <PlacesView onBack={() => onNavigate('profile')} />}
        {page === 'help' && <HelpView onBack={() => onNavigate('profile')} onOpenTutorial={p.onOpenTutorial} />}
          </div>
        )}
        </Suspense>
      </main>
    </div>
  );
};
