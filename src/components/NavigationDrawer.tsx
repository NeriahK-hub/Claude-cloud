import React from 'react';
import { X, Home, BarChart2, CreditCard, ArrowUpRight, ArrowDownLeft, ArrowLeftRight, Settings, HelpCircle, Shield, LogOut, Tags, HandCoins, PieChart } from 'lucide-react';
import { Page } from './BottomNav';
import { initialsOf, useProfile } from '../lib/profile';

interface NavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (page: Page) => void;
  onOpenSend: () => void;
  onOpenHistory: () => void;
}

export const NavigationDrawer: React.FC<NavigationDrawerProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onOpenSend,
  onOpenHistory,
}) => {
  const { name } = useProfile();
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex bg-black/50 animate-fade-in">
      <div className="w-[80%] max-w-xs bg-white h-full shadow-2xl p-6 flex flex-col justify-between overflow-y-auto animate-slide-right">
        {/* Top user profile header */}
        <div>
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#16382F] text-white flex items-center justify-center font-bold text-base shadow-xs">
                {initialsOf(name) || <img src="/icons/wallo.svg" alt="" className="w-12 h-12" />}
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">{name || 'Wallo'}</h3>
                <span className="text-xs text-slate-400">Mon argent, en clair</span>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation Links */}
          <div className="space-y-1 text-sm font-semibold">
            <button
              onClick={() => {
                onNavigate('home');
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-slate-700 transition cursor-pointer text-left"
            >
              <Home className="w-4 h-4 text-slate-500" />
              <span>Accueil</span>
            </button>

            <button
              onClick={() => {
                onOpenSend();
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-slate-700 transition cursor-pointer text-left"
            >
              <ArrowUpRight className="w-4 h-4 text-slate-500" />
              <span>Nouvelle dépense</span>
            </button>

            <button
              onClick={() => {
                onOpenHistory();
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-slate-700 transition cursor-pointer text-left"
            >
              <ArrowDownLeft className="w-4 h-4 text-slate-500" />
              <span>Historique</span>
            </button>

            <button
              onClick={() => {
                onNavigate('statistic');
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-slate-700 transition cursor-pointer text-left"
            >
              <BarChart2 className="w-4 h-4 text-slate-500" />
              <span>Statistiques</span>
            </button>

            <button
              onClick={() => {
                onNavigate('debts');
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-slate-700 transition cursor-pointer text-left"
            >
              <HandCoins className="w-4 h-4 text-slate-500" />
              <span>Dettes et prêts</span>
            </button>
            <button
              onClick={() => {
                onNavigate('budgets');
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-slate-700 transition cursor-pointer text-left"
            >
              <PieChart className="w-4 h-4 text-slate-500" />
              <span>Budgets</span>
            </button>
            <button
              onClick={() => {
                onNavigate('categories');
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-slate-700 transition cursor-pointer text-left"
            >
              <Tags className="w-4 h-4 text-slate-500" />
              <span>Catégories</span>
            </button>

            <button
              onClick={() => {
                onNavigate('wallets');
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-slate-700 transition cursor-pointer text-left"
            >
              <CreditCard className="w-4 h-4 text-slate-500" />
              <span>Portefeuilles</span>
            </button>

            <button
              onClick={() => {
                onNavigate('settings');
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-slate-700 transition cursor-pointer text-left"
            >
              <Settings className="w-4 h-4 text-slate-500" />
              <span>Paramètres</span>
            </button>

            <button
              onClick={() => {
                onNavigate('profile');
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-slate-700 transition cursor-pointer text-left"
            >
              <Settings className="w-4 h-4 text-slate-500" />
              <span>Profil</span>
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-6 border-t border-slate-100">
          <div className="text-xs text-slate-400">Wallo</div>
        </div>
      </div>
    </div>
  );
};
