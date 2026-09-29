import React from 'react';
import { SharedProps } from './appProps';
import { Header } from './Header';
import { BalanceSection, HomeAction } from './BalanceSection';
import { TransactionList } from './TransactionList';
import { BottomNav, Page, TabType } from './BottomNav';
import { TransactionHistoryView } from './TransactionHistoryView';
import { StatisticView } from './StatisticView';
import { WalletsView, HomeWalletCard } from './WalletsView';
import { isShared } from './Members';
import { SettingsView } from './SettingsView';
import { ProfileView } from './ProfileView';
import { RistourneView, RistourneSummaryCard } from './RistourneView';
import { CategoriesView } from './CategoriesView';

// Interface TÉLÉPHONE : plein écran, barre d'onglets en bas
interface MobileAppProps extends SharedProps {
  onOpenDrawer: () => void;
}

const TABS: TabType[] = ['home', 'statistic', 'wallets', 'profile'];

export const MobileApp: React.FC<MobileAppProps> = (p) => {
  const {
    page, onNavigate, settings, wallets, balance, activeWalletLabel, transactions, allTransactions,
    unreadCount, onQuickAction, onAddExpense, onOpenAccountPicker, onOpenDrawer, onOpenNotifications,
    onSelectTransaction, categories, onAddCategory, onDeleteCategory,
  } = p;
  const isTab = TABS.includes(page as TabType);

  return (
    // pt : laisse la place à l'encoche et à l'heure du vrai téléphone
    <div className="min-h-dvh w-full max-w-md mx-auto bg-slate-50 pt-[env(safe-area-inset-top)]">
      <div className={isTab ? 'pb-28' : 'pb-6'}>
        {page === 'ristourne' && <RistourneView onBack={() => onNavigate('home')} currency={settings.mainCurrency} />}

        {page === 'categories' && (
          <CategoriesView
            categories={categories}
            onBack={() => onNavigate('home')}
            onAdd={onAddCategory}
            onDelete={onDeleteCategory}
            onUpdate={p.onUpdateCategory}
          />
        )}

        {page === 'history' && (
          <TransactionHistoryView
            transactions={transactions}
            settings={settings}
            onBack={() => onNavigate('home')}
            onSelectTransaction={onSelectTransaction}
          />
        )}

        {page === 'home' && (
          <>
            <Header
              title="Mon compte"
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
            />
            {p.activeWallet && (p.activeWallet.kind === 'goal' || p.activeWallet.kind === 'credit' || isShared(p.activeWallet)) && (
              <div className="px-5 mb-3">
                <HomeWalletCard wallet={p.activeWallet} transactions={allTransactions} />
              </div>
            )}
            <div className="px-5 mb-2">
              <RistourneSummaryCard onOpen={() => onNavigate('ristourne')} />
            </div>
            <TransactionList
              transactions={transactions}
              onSelectTransaction={onSelectTransaction}
              onViewAll={() => onNavigate('history')}
            />
          </>
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
          />
        )}
        {page === 'settings' && (
          <SettingsView settings={settings} wallets={wallets} transactions={p.allTransactions} categories={p.categories} onImport={p.onImport} onRestore={p.onRestore} onChange={p.onChangeSettings} onBack={() => onNavigate('profile')} />
        )}
        {page === 'profile' && <ProfileView onOpenSettings={() => onNavigate('settings')} />}
      </div>

      {isTab && (
        <BottomNav activeTab={page as TabType} onChangeTab={onNavigate} onOpenScanPay={onAddExpense} />
      )}
    </div>
  );
};
