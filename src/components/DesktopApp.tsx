import React from 'react';
import { Home, BarChart2, Users, Wallet, User, Bell, Plus, ChevronRight, History, Tags, Settings as SettingsIcon } from 'lucide-react';
import { SharedProps } from './appProps';
import { WalletsView, HomeWalletCard } from './WalletsView';
import { isShared } from './Members';
import { SettingsView } from './SettingsView';
import { countsInStats, formatMoney, toMain, walletBalance } from '../lib/money';
import { IconBadge, WalletChipIcon } from './AppIcon';
import { ACTIONS, HomeAction } from './BalanceSection';
import { Page } from './BottomNav';
import { TransactionItem } from './TransactionItem';
import { TransactionHistoryView } from './TransactionHistoryView';
import { StatisticView } from './StatisticView';
import { ProfileView } from './ProfileView';
import { RistourneView, RistourneSummaryCard } from './RistourneView';
import { CategoriesView } from './CategoriesView';

// Interface ORDINATEUR : menu à gauche, contenu en grille à droite
type DesktopAppProps = SharedProps;

const MENU: { id: Page; label: string; icon: React.ElementType }[] = [
  { id: 'home', label: 'Accueil', icon: Home },
  { id: 'history', label: 'Historique', icon: History },
  { id: 'statistic', label: 'Statistiques', icon: BarChart2 },
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
  const now = new Date();
  const thisMonth = transactions.filter((t) => {
    const d = new Date(t.createdAt);
    return countsInStats(t) && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const spent = thisMonth.filter((t) => t.amount < 0).reduce((s, t) => s - toMain(t.amount, t.currency, settings), 0);
  const earned = thisMonth.filter((t) => t.amount > 0).reduce((s, t) => s + toMain(t.amount, t.currency, settings), 0);
  const pageTitle = MENU.find((m) => m.id === page)?.label ?? '';

  return (
    <div className="min-h-dvh flex bg-slate-100">
      {/* Menu de gauche */}
      <aside className="w-64 shrink-0 bg-white border-r border-slate-200/70 p-5 flex flex-col sticky top-0 h-dvh">
        <div className="flex items-center gap-2.5 mb-8 px-2">
          <div className="w-9 h-9 rounded-xl bg-[#D8FB52] font-black flex items-center justify-center text-sm">AP</div>
          <span className="text-base font-extrabold tracking-tight">AetherPay</span>
        </div>

        <nav className="flex flex-col gap-1">
          {MENU.map(({ id, label, icon: Icon }) => {
            const active = page === id;
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
          className="mt-auto w-full py-3 rounded-2xl bg-[#D8FB52] hover:bg-[#cbed3b] font-bold text-sm flex items-center justify-center gap-2 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          Ajouter une transaction
        </button>
      </aside>

      {/* Contenu */}
      <main className="flex-1 min-w-0 px-8 py-6">
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
            <button
              onClick={onOpenNotifications}
              aria-label="Notifications"
              className="w-10 h-10 rounded-2xl bg-white border border-slate-200 flex items-center justify-center relative cursor-pointer hover:bg-slate-50"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#D8FB52] text-[10px] font-bold flex items-center justify-center border-2 border-white">
                  {unreadCount}
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
                <span className="text-xs font-semibold text-slate-400">Ton solde</span>
                <div className="text-5xl font-extrabold tracking-tight tabular-nums mt-1 mb-6">
                  {formatMoney(balance.main, balance.mainCurrency)}
                </div>
                {balance.second !== null && balance.secondCurrency && (
                  <div className="text-base font-semibold text-slate-400 tabular-nums -mt-4 mb-6">
                    {formatMoney(balance.second, balance.secondCurrency)}
                  </div>
                )}
                <div className="grid grid-cols-4 gap-3">
                  {ACTIONS.map(({ id, label, icon: Icon, highlight }) => (
                    <button
                      key={id}
                      onClick={() => onQuickAction(id)}
                      className={`py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 transition cursor-pointer ${
                        highlight
                          ? 'bg-[#D8FB52] hover:bg-[#cbed3b]'
                          : 'bg-slate-50 hover:bg-slate-100 border border-slate-200'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {p.activeWallet && (p.activeWallet.kind === 'goal' || p.activeWallet.kind === 'credit' || isShared(p.activeWallet)) && (
                <HomeWalletCard wallet={p.activeWallet} transactions={allTransactions} />
              )}

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
            </div>

            {/* Colonne droite (1/3) */}
            <div className="space-y-6">
              <RistourneSummaryCard onOpen={() => onNavigate('ristourne')} />

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

        {/* Les autres pages réutilisent les écrans mobiles, centrés */}
        {page !== 'home' && (
          <div className="max-w-2xl bg-slate-50 rounded-3xl border border-slate-100 overflow-hidden">
            {page === 'history' && (
              <TransactionHistoryView
                transactions={transactions}
                settings={settings}
                onBack={() => onNavigate('home')}
                onSelectTransaction={onSelectTransaction}
              />
            )}
            {page === 'ristourne' && <RistourneView onBack={() => onNavigate('home')} currency={main} />}
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
              />
            )}
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
              />
            )}
            {page === 'settings' && (
              <SettingsView settings={settings} wallets={wallets} transactions={p.allTransactions} categories={p.categories} onImport={p.onImport} onRestore={p.onRestore} onChange={p.onChangeSettings} onBack={() => onNavigate('home')} />
            )}
            {page === 'profile' && <ProfileView onOpenSettings={() => onNavigate('settings')} />}
          </div>
        )}
      </main>
    </div>
  );
};
