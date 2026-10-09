import React, { Suspense, useEffect } from 'react';
import { HealthCard } from './HealthCard';
import { BadgesCard } from './BadgesCard';
import { ReviewCards } from './ReviewCards';
import { FestiveCard, FestiveLayer, FestiveMark } from './Festive';
import { useFestive } from '../lib/festive';
import { BudgetsHomeCard, GoalsHomeCard } from './HomeExtraCards';
import { CoachTour, GOAL_TIPS, HOME_TIPS, REPORT_TIPS, SIMPLE_TIPS, WALLET_TIPS } from './CoachTour';
import { SharedProps } from './appProps';
import { Header } from './Header';
import { BalanceSection, HomeAction } from './BalanceSection';
import { TransactionList } from './TransactionList';
import { BottomNav, Page, TabType } from './BottomNav';
import { WalletsView, HomeWalletCard } from './WalletsView';
import { isShared } from './Members';
import { useDisplayPrefs } from '../lib/display';
import { MonthReportCard } from './MonthReportCard';
import { PageSkeleton } from './Skeleton';
import { SubsHomeCard } from './SubsHomeCard';
import { HomeCardId, useHomeLayout } from '../lib/homeLayout';
import { AdBanner } from './AdBanner';
import { NetworkCloud } from './NetworkCloud';
import { TransactionHistoryView, StatisticView, SettingsView, ProfileView, RistourneView, CategoriesView, BudgetsView, DebtsView, PlacesView, UpcomingView, HelpView } from './pages';
import { DueCard } from './DueCard';
import { RateCard } from './RateCard';
import { SimpleActions, SimpleModeFooter, SimpleMonth } from './SimpleHome';

// Interface TÉLÉPHONE : plein écran, barre d'onglets en bas
interface MobileAppProps extends SharedProps {
  onOpenDrawer: () => void;
}

const TABS: TabType[] = ['home', 'transactions', 'wallets', 'profile'];

export const MobileApp: React.FC<MobileAppProps> = (p) => {
  const { simpleMode, hideBalance } = useDisplayPrefs(); // carte désactivée par défaut (Paramètres › Affichage)
  const layout = useHomeLayout(); // accueil au choix : cartes montrées et leur ordre (Paramètres › Accueil)
  const {
    page, onNavigate, settings, wallets, balance, activeWalletLabel, transactions, allTransactions,
    unreadCount, onQuickAction, onAddExpense, onOpenAccountPicker, onOpenDrawer, onOpenNotifications,
    onSelectTransaction, categories, onAddCategory, onDeleteCategory,
  } = p;
  // « Historique » (menu, « Tout voir »…) = l'onglet Transactions
  const tab: Page = page === 'history' ? 'transactions' : page;
  // Design des fêtes (allumé dans l'espace admin) : couleurs du bouton +, neige ou paillettes sur l'accueil
  const festive = useFestive();
  useEffect(() => {
    if (festive) document.documentElement.dataset.festive = festive;
    else delete document.documentElement.dataset.festive;
  }, [festive]);
  const isTab = TABS.includes(tab as TabType);

  // Carte par carte, dans l'ordre choisi. Santé et série côte à côte quand elles se suivent.
  const homeCards = () => {
    const out: React.ReactNode[] = [];
    const ids = layout.shown;
    const card = (id: HomeCardId): React.ReactNode => {
      switch (id) {
        case 'rates':
          return (
            <div key={id} className="px-5 mb-3 empty:hidden">
              <RateCard settings={settings} wallets={wallets} onChangeSettings={p.onChangeSettings} />
            </div>
          );
        case 'due':
          return (
            <div key={id} className="px-5 mb-3 empty:hidden">
              <DueCard recurrings={p.recurrings} categories={categories} onConfirm={p.onConfirmRecurring} onSkip={p.onSkipRecurring} onOpen={() => onNavigate('upcoming')} />
            </div>
          );
        case 'month':
          return (
            <div key={id} className="px-5 mb-3">
              <MonthReportCard
                allTransactions={allTransactions}
                wallets={wallets}
                activeWallet={p.activeWallet}
                settings={settings}
                onOpenReports={() => onNavigate('statistic')}
                onOpenGoals={() => onNavigate('goals')}
                recurrings={p.recurrings}
              />
            </div>
          );
        case 'subs':
          return (
            <div key={id} className="px-5 mb-3 empty:hidden">
              <SubsHomeCard transactions={allTransactions} settings={settings} categories={categories} recurrings={p.recurrings} onOpen={() => onNavigate('upcoming')} />
            </div>
          );
        case 'budgets':
          return (
            <div key={id} className="px-5 mb-3 empty:hidden">
              <BudgetsHomeCard budgets={p.budgets} transactions={allTransactions} categories={categories} settings={settings} onOpen={() => onNavigate('budgets')} />
            </div>
          );
        case 'goals':
          return (
            <div key={id} className="px-5 mb-3 empty:hidden">
              <GoalsHomeCard wallets={wallets} transactions={allTransactions} onOpen={() => onNavigate('goals')} />
            </div>
          );
        case 'list':
          return (
            <React.Fragment key={id}>
              <AdBanner className="px-5 mb-3" />
              <TransactionList transactions={transactions} onSelectTransaction={onSelectTransaction} onViewAll={() => onNavigate('history')} />
            </React.Fragment>
          );
        default:
          return null;
      }
    };
    const health = (compact: boolean) => (
      <HealthCard key="health" compact={compact} transactions={allTransactions} wallets={wallets} budgets={p.budgets} categories={categories} settings={settings} shared={p.sharedDebts} onNavigate={onNavigate} onSelectTransaction={onSelectTransaction} />
    );
    const badges = (compact: boolean) => (
      <BadgesCard key="badges" compact={compact} transactions={allTransactions} wallets={wallets} budgets={p.budgets} categories={categories} settings={settings} shared={p.sharedDebts} />
    );
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      const next = ids[i + 1];
      if ((id === 'health' && next === 'badges') || (id === 'badges' && next === 'health')) {
        // les deux se suivent : deux petites tuiles côte à côte
        out.push(
          <div key="tiles" className="px-5 mb-3 grid grid-cols-2 gap-3">
            {id === 'health' ? health(true) : badges(true)}
            {id === 'health' ? badges(true) : health(true)}
          </div>
        );
        i++;
      } else if (id === 'health' || id === 'badges') {
        // seule : une carte pleine largeur
        out.push(
          <div key={id} className="px-5 mb-3">
            {id === 'health' ? health(false) : badges(false)}
          </div>
        );
      } else out.push(card(id));
    }
    return out;
  };

  return (
    // pt : laisse la place à l'encoche et à l'heure du vrai téléphone
    <div className="min-h-dvh w-full max-w-md mx-auto bg-slate-50 pt-[env(safe-area-inset-top)]">
      <div className="status-bar" aria-hidden />
      <div className={isTab ? 'pb-28' : 'pb-6'}>
        <Suspense fallback={page === 'home' ? null : <PageSkeleton />}>
        {page === 'home' && festive && <FestiveLayer kind={festive} />}
        {/* Bulles d'aide des premières fois (une seule fois chacune) */}
        {page === 'home' && <CoachTour key={simpleMode ? 'simple' : 'full'} steps={simpleMode ? SIMPLE_TIPS : HOME_TIPS} />}
        {page === 'statistic' && <CoachTour key="report" steps={REPORT_TIPS} />}
        {page === 'wallets' && <CoachTour key="wallets" steps={WALLET_TIPS} />}
        {page === 'goals' && <CoachTour key="goals" steps={GOAL_TIPS} />}

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

        {tab === 'transactions' && (
          <TransactionHistoryView
            transactions={allTransactions}
            wallets={wallets}
            initialWalletId={p.activeWallet?.id ?? 'all'}
            settings={settings}
            onSelectTransaction={onSelectTransaction}
            activeWallet={p.activeWallet}
            activeWalletLabel={activeWalletLabel}
            onOpenAccountPicker={onOpenAccountPicker}
            onOpenReport={p.onOpenReport}
          />
        )}

        {page === 'home' && (
          <div className="stagger">
            <Header
              title="Mon compte"
              status={
                <>
                  {festive && <FestiveMark kind={festive} />}
                  <NetworkCloud cloud={p.cloud} onOpenAccount={() => onNavigate('profile')} />
                </>
              }
              unreadCount={unreadCount}
              onOpenMenu={onOpenDrawer}
              onOpenNotifications={onOpenNotifications}
            />
            <BalanceSection
              balance={balance}
              walletLabel={activeWalletLabel}
              wallet={p.activeWallet}
              onOpenAccountPicker={onOpenAccountPicker}
              onActionClick={onQuickAction}
              hideActions={simpleMode}
            />
            {simpleMode ? (
              // Mode simple : l'essentiel, en gros
              <>
                {festive && (
                  <div className="px-5 mb-3">
                    <FestiveCard kind={festive} onNavigate={onNavigate} />
                  </div>
                )}
                {(
                  <div className="px-5 mb-3 empty:hidden">
                    <ReviewCards transactions={transactions} settings={settings} categories={categories} />
                  </div>
                )}
                <div className="px-5 mb-3">
                  <SimpleActions onExpense={() => onQuickAction('expense')} onIncome={() => onQuickAction('income')} />
                </div>
                {layout.show('due') && (
                  <div className="px-5 mb-3 empty:hidden">
                    <DueCard recurrings={p.recurrings} categories={categories} onConfirm={p.onConfirmRecurring} onSkip={p.onSkipRecurring} onOpen={() => onNavigate('upcoming')} />
                  </div>
                )}
                {layout.show('month') && (
                  <div className="px-5 mb-3">
                    <SimpleMonth transactions={transactions} settings={settings} hidden={hideBalance} />
                  </div>
                )}
                {layout.show('subs') && (
                  <div className="px-5 mb-3 empty:hidden">
                    <SubsHomeCard transactions={allTransactions} settings={settings} categories={categories} recurrings={p.recurrings} onOpen={() => onNavigate('upcoming')} />
                  </div>
                )}
                <AdBanner className="px-5 mb-3" />
                {layout.show('list') && <TransactionList transactions={transactions} onSelectTransaction={onSelectTransaction} onViewAll={() => onNavigate('history')} />}
                <SimpleModeFooter />
              </>
            ) : (
            <>
            {layout.show('wallet') && p.activeWallet && (p.activeWallet.kind === 'goal' || p.activeWallet.kind === 'credit' || isShared(p.activeWallet)) && (
              <div className="px-5 mb-3">
                <HomeWalletCard wallet={p.activeWallet} transactions={allTransactions} />
              </div>
            )}
            {festive && (
              <div className="px-5 mb-3">
                <FestiveCard kind={festive} onNavigate={onNavigate} />
              </div>
            )}
            {/* Les cartes, dans l'ordre choisi (Paramètres › Accueil) */}
            {/* Bilans (semaine, Wrapped) : automatiques, ou quand l'admin les allume */}
            <div className="px-5 mb-3 empty:hidden">
              <ReviewCards transactions={transactions} settings={settings} categories={categories} />
            </div>
            {homeCards()}
            </>
            )}
          </div>
        )}

        {page === 'statistic' && (
          <StatisticView
            allTransactions={allTransactions}
            recurrings={p.recurrings}
            wallets={wallets}
            activeWallet={p.activeWallet}
            activeWalletLabel={activeWalletLabel}
            categories={categories}
            settings={settings}
            onSelectTransaction={onSelectTransaction}
            onOpenAccountPicker={onOpenAccountPicker}
            budgets={p.budgets}
            onNavigate={onNavigate}
            onBack={() => onNavigate('transactions')}
            initialPeriod={p.reportPeriod ?? undefined}
          />
        )}
        {page === 'wallets' && (
          <WalletsView
            wallets={wallets}
            transactions={allTransactions}
            defaultCurrency={settings.mainCurrency}
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
            defaultCurrency={settings.mainCurrency}
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
        {page === 'settings' && (
          <SettingsView settings={settings} wallets={wallets} transactions={p.allTransactions} categories={p.categories} budgets={p.budgets} ristournes={p.ristournes} onRestoreTrash={p.onRestoreTrash} onImport={p.onImport} onRestore={p.onRestore} onChange={p.onChangeSettings} onBack={() => onNavigate('profile')} />
        )}
        {page === 'profile' && <ProfileView onNavigate={onNavigate} cloud={p.cloud} />}
        {page === 'places' && <PlacesView onBack={() => onNavigate('profile')} />}
        {page === 'help' && <HelpView onBack={() => onNavigate('profile')} onOpenTutorial={p.onOpenTutorial} />}
        </Suspense>
      </div>

      {isTab && (
        <BottomNav activeTab={tab as TabType} onChangeTab={onNavigate} onOpenScanPay={onAddExpense} />
      )}
    </div>
  );
};
