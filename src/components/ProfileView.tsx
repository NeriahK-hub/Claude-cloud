import React, { useState } from 'react';
import { Settings as SettingsIcon, ChevronRight, Tags, Wallet, History, Pencil, Check, Smartphone, HandCoins, PieChart } from 'lucide-react';
import { Page } from './BottomNav';
import { initialsOf, setProfileName, useProfile } from '../lib/profile';
import type { Cloud } from '../lib/sync/useCloud';
import { AccountCard } from './Account';

interface ProfileViewProps {
  onNavigate: (page: Page) => void;
  cloud: Cloud;
}

// Profil : ton nom (utilisé dans l'app) et les raccourcis vers les réglages
export const ProfileView: React.FC<ProfileViewProps> = ({ onNavigate, cloud }) => {
  const { name } = useProfile();
  const [editing, setEditing] = useState(!name);
  const [draft, setDraft] = useState(name);

  const save = () => {
    setProfileName(draft.trim());
    setEditing(false);
  };

  const link = (label: string, hint: string, Icon: typeof Tags, page: Page) => (
    <button
      onClick={() => onNavigate(page)}
      className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 rounded-xl transition cursor-pointer text-left"
    >
      <span className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-slate-700" />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold text-slate-900">{label}</span>
        <span className="block text-xs text-slate-500 truncate">{hint}</span>
      </span>
      <ChevronRight className="w-4 h-4 text-slate-400" />
    </button>
  );

  return (
    <div className="w-full px-5 pt-3 pb-28 animate-screen">
      <h1 className="text-xl font-bold text-slate-900 tracking-tight mb-5">Profil</h1>

      <div className="bg-white rounded-3xl p-5 border border-slate-100 flex items-center gap-4 mb-4">
        <div className="w-16 h-16 rounded-full bg-[#16382F] text-white flex items-center justify-center font-extrabold text-xl shrink-0">
          {initialsOf(name) || '?'}
        </div>
        <div className="min-w-0 flex-1">
          {editing ? (
            <div className="flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && save()}
                placeholder="Ton prénom et nom"
                autoFocus
                className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-slate-100 text-sm outline-none focus:ring-2 focus:ring-[#D8FB52]"
              />
              <button onClick={save} aria-label="Enregistrer le nom" className="w-10 h-10 rounded-xl bg-[#D8FB52] text-slate-900 flex items-center justify-center cursor-pointer">
                <Check className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button onClick={() => { setDraft(name); setEditing(true); }} className="flex items-center gap-2 text-left cursor-pointer">
              <span className="text-base font-bold text-slate-900 truncate">{name}</span>
              <Pencil className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </button>
          )}
          {!cloud.user && (
            <p className="flex items-center gap-1.5 text-xs text-slate-500 mt-1.5">
              <Smartphone className="w-3.5 h-3.5 shrink-0" /> Données enregistrées sur cet appareil
            </p>
          )}
        </div>
      </div>

      <AccountCard cloud={cloud} />

      <div className="bg-white rounded-3xl p-2 border border-slate-100">
        {link('Paramètres', 'Apparence, devises, taux, import / export', SettingsIcon, 'settings')}
        {link('Catégories', 'Créer, modifier, ranger en sous-catégories', Tags, 'categories')}
        {link('Portefeuilles', 'Ajouter, réorganiser, partager', Wallet, 'wallets')}
        {link('Historique', 'Toutes les transactions, par période', History, 'history')}
        {link('Dettes et prêts', "Qui te doit, à qui tu dois, ce qu'il reste", HandCoins, 'debts')}
        {link('Budgets', 'Limites par mois et par catégorie', PieChart, 'budgets')}
      </div>

      <p className="text-center text-[11px] text-slate-400 mt-6">Wallo</p>
    </div>
  );
};
