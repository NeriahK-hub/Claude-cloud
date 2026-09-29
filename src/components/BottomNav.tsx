import React from 'react';
import { Home, BarChart2, Wallet, User, Plus } from 'lucide-react';
import { haptic } from '../lib/haptics';

export type TabType = 'home' | 'statistic' | 'wallets' | 'profile';

// Toutes les pages de l'app (les onglets + les écrans sans onglet)
export type Page = TabType | 'history' | 'ristourne' | 'categories' | 'settings' | 'budgets';

interface BottomNavProps {
  activeTab: TabType;
  onChangeTab: (tab: TabType) => void;
  onOpenScanPay: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onChangeTab,
  onOpenScanPay,
}) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto z-40 bg-white border-t border-slate-100 px-6 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-lg">
      <div className="flex items-center justify-between">
        {/* Home */}
        <button
          onClick={() => { haptic(); onChangeTab('home'); }}
          className={`flex flex-col items-center justify-center min-w-[50px] py-1 cursor-pointer transition ${
            activeTab === 'home' ? 'text-slate-900 font-bold' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Home className={`w-5 h-5 ${activeTab === 'home' ? 'stroke-[2.5]' : 'stroke-2'}`} />
          <span className="text-[11px] font-medium tracking-tight mt-1">Accueil</span>
        </button>

        {/* Statistic */}
        <button
          onClick={() => { haptic(); onChangeTab('statistic'); }}
          className={`flex flex-col items-center justify-center min-w-[50px] py-1 cursor-pointer transition ${
            activeTab === 'statistic' ? 'text-slate-900 font-bold' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <BarChart2 className={`w-5 h-5 ${activeTab === 'statistic' ? 'stroke-[2.5]' : 'stroke-2'}`} />
          <span className="text-[11px] font-medium tracking-tight mt-1">Stats</span>
        </button>

        {/* Center Floating QR / Pay Button */}
        <div className="flex flex-col items-center -mt-5">
          <button
            onClick={() => { haptic(); onOpenScanPay(); }}
            aria-label="Ajouter une transaction"
            className="w-13 h-13 rounded-2xl bg-[#D8FB52] hover:bg-[#cbed3b] active:scale-95 flex items-center justify-center shadow-md shadow-lime-300/30 border-2 border-white transition duration-200 cursor-pointer group"
          >
            <Plus className="w-6 h-6 text-slate-900 stroke-[2.5] group-hover:scale-105 transition" />
          </button>
        </div>

        {/* Card */}
        <button
          onClick={() => { haptic(); onChangeTab('wallets'); }}
          className={`flex flex-col items-center justify-center min-w-[50px] py-1 cursor-pointer transition ${
            activeTab === 'wallets' ? 'text-slate-900 font-bold' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Wallet className={`w-5 h-5 ${activeTab === 'wallets' ? 'stroke-[2.5]' : 'stroke-2'}`} />
          <span className="text-[11px] font-medium tracking-tight mt-1">Portefeuilles</span>
        </button>

        {/* Profile */}
        <button
          onClick={() => { haptic(); onChangeTab('profile'); }}
          className={`flex flex-col items-center justify-center min-w-[50px] py-1 cursor-pointer transition ${
            activeTab === 'profile' ? 'text-slate-900 font-bold' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <User className={`w-5 h-5 ${activeTab === 'profile' ? 'stroke-[2.5]' : 'stroke-2'}`} />
          <span className="text-[11px] font-medium tracking-tight mt-1">Profil</span>
        </button>
      </div>
    </nav>
  );
};
