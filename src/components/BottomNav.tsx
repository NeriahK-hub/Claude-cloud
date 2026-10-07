import React from 'react';
import { Home, ReceiptText, Wallet, User, Plus } from 'lucide-react';
import { haptic } from '../lib/haptics';
import { useDisplayPrefs } from '../lib/display';

export type TabType = 'home' | 'transactions' | 'wallets' | 'profile';

// Toutes les pages de l'app (les onglets + les écrans sans onglet)
// 'statistic' : le Rapport (ouvert depuis Transactions ; plus un onglet sur téléphone)
export type Page = TabType | 'statistic' | 'history' | 'ristourne' | 'categories' | 'settings' | 'budgets' | 'goals' | 'upcoming' | 'debts' | 'places';

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
  // Icônes seules (Paramètres › Apparence) : pas de mots, icônes plus grandes
  const { iconsOnly } = useDisplayPrefs();
  const ico = iconsOnly ? 'w-7 h-7' : 'w-5 h-5';
  return (
    <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto z-40 bg-white border-t border-slate-100 px-6 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-lg">
      <div className="flex items-center justify-between">
        {/* Home */}
        <button
          onClick={() => { haptic(); onChangeTab('home'); }}
          className={`flex flex-col items-center justify-center min-w-[50px] ${iconsOnly ? 'py-2.5' : 'py-1'} cursor-pointer transition ${
            activeTab === 'home' ? 'text-slate-900 font-bold' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Home className={`${ico} ${activeTab === 'home' ? 'stroke-[2.5]' : 'stroke-2'}`} />
          {iconsOnly ? <span className="sr-only">Accueil</span> : <span className="text-[12px] font-medium tracking-tight mt-1">Accueil</span>}
        </button>

        {/* Transactions (le Rapport s'ouvre depuis cet onglet) */}
        <button
          onClick={() => { haptic(); onChangeTab('transactions'); }}
          data-coach="tab-transactions"
          className={`flex flex-col items-center justify-center min-w-[50px] ${iconsOnly ? 'py-2.5' : 'py-1'} cursor-pointer transition ${
            activeTab === 'transactions' ? 'text-slate-900 font-bold' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <ReceiptText className={`${ico} ${activeTab === 'transactions' ? 'stroke-[2.5]' : 'stroke-2'}`} />
          {iconsOnly ? <span className="sr-only">Transactions</span> : <span className="text-[12px] font-medium tracking-tight mt-1">Transactions</span>}
        </button>

        {/* Bouton central « + » : rond, avec un léger reflet et une ombre de sa couleur */}
        <div className="flex flex-col items-center -mt-6">
          <button
            onClick={() => { haptic(); onOpenScanPay(); }}
            aria-label="Ajouter une transaction"
            data-coach="add"
            className="fab-add relative w-14 h-14 rounded-full bg-accent text-on-accent flex items-center justify-center cursor-pointer group transition duration-200 ease-out hover:-translate-y-0.5 active:scale-90"
          >
            <Plus className="w-7 h-7 stroke-[2.6] transition-transform duration-300 ease-out group-hover:rotate-90 group-active:rotate-90" />
          </button>
        </div>

        {/* Card */}
        <button
          onClick={() => { haptic(); onChangeTab('wallets'); }}
          className={`flex flex-col items-center justify-center min-w-[50px] ${iconsOnly ? 'py-2.5' : 'py-1'} cursor-pointer transition ${
            activeTab === 'wallets' ? 'text-slate-900 font-bold' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <Wallet className={`${ico} ${activeTab === 'wallets' ? 'stroke-[2.5]' : 'stroke-2'}`} />
          {iconsOnly ? <span className="sr-only">Portefeuilles</span> : <span className="text-[12px] font-medium tracking-tight mt-1">Portefeuilles</span>}
        </button>

        {/* Profile */}
        <button
          onClick={() => { haptic(); onChangeTab('profile'); }}
          className={`flex flex-col items-center justify-center min-w-[50px] ${iconsOnly ? 'py-2.5' : 'py-1'} cursor-pointer transition ${
            activeTab === 'profile' ? 'text-slate-900 font-bold' : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          <User className={`${ico} ${activeTab === 'profile' ? 'stroke-[2.5]' : 'stroke-2'}`} />
          {iconsOnly ? <span className="sr-only">Profil</span> : <span className="text-[12px] font-medium tracking-tight mt-1">Profil</span>}
        </button>
      </div>
    </nav>
  );
};
