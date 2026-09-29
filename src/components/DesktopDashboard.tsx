import React from 'react';
import { 
  ArrowUpRight, ArrowDownLeft, ArrowLeftRight, MoreHorizontal, Sparkles, 
  Search, SlidersHorizontal, ChevronRight, ShieldCheck, CreditCard, 
  Send, TrendingUp, BarChart2, Bell, QrCode, RefreshCw
} from 'lucide-react';
import { BankAccount, MerchantOffer, Transaction, QuickContact } from '../types';
import { QUICK_CONTACTS } from '../data/mockData';
import { TransactionItem } from './TransactionItem';

interface DesktopDashboardProps {
  currentAccount: BankAccount;
  accounts: BankAccount[];
  transactions: Transaction[];
  merchants: MerchantOffer[];
  onOpenAccountPicker: () => void;
  onOpenSend: () => void;
  onOpenRequest: () => void;
  onOpenExchange: () => void;
  onOpenMore: () => void;
  onOpenHistory: () => void;
  onSelectTransaction: (tx: Transaction) => void;
  onSelectMerchant: (merchant: MerchantOffer) => void;
  onOpenNotifications: () => void;
}

export const DesktopDashboard: React.FC<DesktopDashboardProps> = ({
  currentAccount,
  accounts,
  transactions,
  merchants,
  onOpenAccountPicker,
  onOpenSend,
  onOpenRequest,
  onOpenExchange,
  onOpenMore,
  onOpenHistory,
  onSelectTransaction,
  onSelectMerchant,
  onOpenNotifications,
}) => {
  const formattedBalance = currentAccount.balance.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return (
    <div className="w-full max-w-7xl mx-auto px-6 py-6 space-y-6">
      {/* Top Welcome Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-[#16382F] text-white flex items-center justify-center font-extrabold text-xl shadow-xs">
            MB
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">
                Good morning, Mikel!
              </h1>
              <span className="px-2.5 py-0.5 rounded-full bg-[#D8FB52] text-slate-950 text-xs font-bold">
                Tier 1 Verified
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Primary account: <strong className="font-mono text-slate-700">{currentAccount.name} ({currentAccount.cardNumber})</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onOpenAccountPicker}
            className="px-4 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-800 transition cursor-pointer flex items-center gap-2"
          >
            <div className="w-3.5 h-2.5 rounded-2xs bg-[#B8E94C]"></div>
            <span>Switch Account</span>
          </button>

          <button
            onClick={onOpenNotifications}
            className="w-10 h-10 rounded-2xl bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-700 transition cursor-pointer relative"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[#D8FB52] text-slate-950 text-[10px] font-bold flex items-center justify-center border-2 border-white">
              2
            </span>
          </button>
        </div>
      </div>

      {/* Main Grid: Left 2 Cols (Balance + Merchants + Transactions), Right 1 Col (Quick Transfer + Card Preview) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns */}
        <div className="lg:col-span-2 space-y-6">
          {/* Big Balance & Quick Actions Card */}
          <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xs relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <span className="text-xs font-semibold text-slate-400 block mb-1">
                  Total Available Balance
                </span>
                <div className="text-4xl sm:text-5xl font-extrabold text-slate-900 font-mono tracking-tight tabular-nums">
                  ${formattedBalance}
                </div>
              </div>

              {/* Savings Pill */}
              <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-violet-50 text-[#6E56CF] text-xs font-bold self-start sm:self-auto">
                <Sparkles className="w-4 h-4 text-[#6E56CF]" />
                <span>You saved $290 In last Month</span>
              </div>
            </div>

            {/* Quick Actions Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button
                onClick={onOpenSend}
                className="py-3.5 px-4 rounded-2xl bg-[#D8FB52] hover:bg-[#cbed3b] active:scale-95 text-slate-900 font-bold text-xs flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
              >
                <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />
                <span>Send Money</span>
              </button>

              <button
                onClick={onOpenRequest}
                className="py-3.5 px-4 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <ArrowDownLeft className="w-4 h-4 stroke-[2.5]" />
                <span>Request Money</span>
              </button>

              <button
                onClick={onOpenExchange}
                className="py-3.5 px-4 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <ArrowLeftRight className="w-4 h-4 stroke-[2.5]" />
                <span>Currency Exchange</span>
              </button>

              <button
                onClick={onOpenMore}
                className="py-3.5 px-4 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <MoreHorizontal className="w-4 h-4 stroke-[2.5]" />
                <span>More Services</span>
              </button>
            </div>
          </div>

          {/* Top Merchants Row */}
          <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 tracking-tight">Top Merchants Offers</h3>
                <p className="text-xs text-slate-400">Exclusive member cashbacks and discounts</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {merchants.map((merchant) => (
                <div
                  key={merchant.id}
                  onClick={() => onSelectMerchant(merchant)}
                  className={`p-4 rounded-2xl bg-gradient-to-br ${merchant.bannerGradient} border border-slate-200/50 hover:shadow-xs transition cursor-pointer flex flex-col justify-between`}
                >
                  <div>
                    <span className="text-xs font-bold text-indigo-700 bg-white/80 px-2 py-0.5 rounded-full inline-block mb-2">
                      {merchant.discount}
                    </span>
                    <h4 className="text-sm font-bold text-slate-900 leading-snug">{merchant.title}</h4>
                    <p className="text-xs text-slate-500 mt-1">{merchant.subtitle}</p>
                  </div>
                  <div className="mt-4 pt-2 border-t border-slate-200/40 flex items-center justify-between text-xs font-bold text-slate-800">
                    <span>Code: {merchant.code}</span>
                    <span className="text-indigo-600">Claim ›</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Transactions Section */}
          <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 tracking-tight">Recent Transactions</h3>
                <p className="text-xs text-slate-400">Real-time ledger updates</p>
              </div>
              <button
                onClick={onOpenHistory}
                className="text-xs font-bold text-slate-600 hover:text-slate-900 flex items-center gap-1 cursor-pointer"
              >
                <span>View Full History</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {transactions.slice(0, 5).map((tx) => (
                <TransactionItem
                  key={tx.id}
                  transaction={tx}
                  onClick={onSelectTransaction}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Right 1 Column: Virtual Card Preview & Quick Send Widget */}
        <div className="space-y-6">
          {/* Card Showcase */}
          <div className="bg-gradient-to-tr from-[#111827] via-[#1F2937] to-[#374151] rounded-3xl p-6 text-white shadow-lg relative overflow-hidden">
            <div className="flex items-center justify-between mb-6">
              <span className="text-xs font-bold tracking-widest text-[#D8FB52]">AETHER PLATINUM</span>
              <span className="text-xs font-mono font-bold text-slate-400">VISA</span>
            </div>

            <div className="w-10 h-7 rounded bg-gradient-to-r from-amber-200 to-amber-400 mb-6"></div>

            <div className="font-mono text-xl tracking-widest font-bold mb-4">
              •••• •••• •••• 3425
            </div>

            <div className="flex items-center justify-between text-xs text-slate-300">
              <div>
                <span className="text-[9px] uppercase text-slate-400 block">Cardholder</span>
                <span className="font-bold text-white">Mikel Borle</span>
              </div>
              <div>
                <span className="text-[9px] uppercase text-slate-400 block">Expires</span>
                <span className="font-mono font-bold text-white">09/29</span>
              </div>
              <div>
                <span className="text-[9px] uppercase text-slate-400 block">CVV</span>
                <span className="font-mono font-bold text-amber-300">842</span>
              </div>
            </div>
          </div>

          {/* Quick Pay / Keypad Shortcut Box */}
          <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xs">
            <h3 className="text-base font-bold text-slate-900 mb-1">Instant Money Transfer</h3>
            <p className="text-xs text-slate-400 mb-4">Fast keypad transfer to frequent contacts</p>

            {/* Quick Contacts */}
            <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-3 mb-4">
              {QUICK_CONTACTS.slice(0, 4).map((c) => (
                <div
                  key={c.id}
                  onClick={onOpenSend}
                  className="flex flex-col items-center gap-1 cursor-pointer group"
                >
                  <img
                    src={c.avatar}
                    alt={c.name}
                    className="w-11 h-11 rounded-full object-cover ring-2 ring-slate-100 group-hover:ring-[#D8FB52] transition"
                    referrerPolicy="no-referrer"
                  />
                  <span className="text-[11px] font-bold text-slate-700 truncate max-w-[60px]">
                    {c.name.split(' ')[0]}
                  </span>
                </div>
              ))}
            </div>

            <button
              onClick={onOpenSend}
              className="w-full py-3.5 rounded-2xl bg-[#D8FB52] hover:bg-[#cbed3b] text-slate-900 font-bold text-xs shadow-xs transition cursor-pointer flex items-center justify-center gap-2"
            >
              <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />
              <span>Open Send Keypad ($6,342.49)</span>
            </button>
          </div>

          {/* Monthly Budget Summary */}
          <div className="bg-white rounded-3xl p-6 border border-slate-100 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-slate-900">Monthly Safe Limit</h4>
              <span className="text-xs font-mono font-bold text-slate-600">$1,242.70 / $5,000</span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden mb-2">
              <div className="h-full bg-[#D8FB52] rounded-full" style={{ width: '25%' }}></div>
            </div>
            <span className="text-[11px] text-slate-400 font-medium">
              You are $3,757.30 within your personal budget.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
