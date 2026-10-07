import React, { useEffect, useRef, useState } from 'react';
import { X, Home, BarChart2, CreditCard, ArrowUpRight, ArrowDownLeft, Settings, Tags, HandCoins, PieChart, CalendarClock, UserRound, MoreHorizontal, ScanLine, ChevronDown, Sparkles } from 'lucide-react';
import { setPrefs, useDisplayPrefs } from '../lib/display';
import { haptic } from '../lib/haptics';
import { Page } from './BottomNav';
import { initialsOf, useProfile } from '../lib/profile';
import { useFeature } from '../lib/remoteConfig';

interface MenuItem {
  label: string;
  bigLabel?: string; // mots plus simples en mode simple
  Icon: typeof Home;
  color: string;
  simple: boolean;
  onClick: () => void;
}

// Ligne du menu normal : icône de couleur dans un rond, texte bien lisible
const SmallItem: React.FC<{ item: MenuItem }> = ({ item }) => (
  <button onClick={item.onClick} className="w-full flex items-center gap-3.5 px-2 py-2 rounded-2xl hover:bg-slate-50 active:scale-[0.98] transition cursor-pointer text-left group">
    <span className="w-10 h-10 rounded-[14px] flex items-center justify-center shrink-0 transition-transform group-hover:scale-105" style={{ background: `${item.color}1f`, color: item.color }}>
      <item.Icon className="w-[19px] h-[19px]" strokeWidth={2.2} />
    </span>
    <span className="flex-1 text-[16px] font-semibold text-slate-800">{item.label}</span>
  </button>
);

// Ligne du mode simple : grosse icône de couleur, texte plus grand
const BigItem: React.FC<{ item: MenuItem }> = ({ item }) => (
  <button onClick={item.onClick} className="w-full flex items-center gap-3 px-2 py-2 rounded-2xl hover:bg-slate-50 active:scale-[0.98] transition cursor-pointer text-left">
    <span className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: `${item.color}1f`, color: item.color }}>
      <item.Icon className="w-5 h-5" strokeWidth={2.3} />
    </span>
    <span className="text-[17px] font-semibold text-slate-900">{item.bigLabel ?? item.label}</span>
  </button>
);

interface NavigationDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (page: Page) => void;
  onOpenSend: () => void;
  onOpenHistory: () => void;
  onOpenScan: () => void;
}

export const NavigationDrawer: React.FC<NavigationDrawerProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onOpenSend,
  onOpenHistory,
  onOpenScan,
}) => {
  const debtsOn = useFeature('debts');
  const budgetsOn = useFeature('budgets');
  const { name } = useProfile();
  const { simpleMode } = useDisplayPrefs();
  const [more, setMore] = useState(false);
  const startX = useRef<number | null>(null);

  const go = (fn: () => void) => () => {
    fn();
    onClose();
  };
  // simple : affiché en gros en mode simple ; les autres vont sous « Plus d'options »
  const items: MenuItem[] = [
    { label: 'Accueil', Icon: Home, color: '#3B82F6', simple: true, onClick: go(() => onNavigate('home')) },
    { label: 'Nouvelle dépense', bigLabel: 'J\u2019ai dépensé', Icon: ArrowUpRight, color: '#EF4444', simple: true, onClick: go(onOpenSend) },
    { label: 'Historique', bigLabel: 'Mes opérations', Icon: ArrowDownLeft, color: '#10B981', simple: true, onClick: go(onOpenHistory) },
    { label: 'Statistiques', Icon: BarChart2, color: '#8B5CF6', simple: false, onClick: go(() => onNavigate('statistic')) },
    ...(debtsOn ? [{ label: 'Dettes et prêts', Icon: HandCoins, color: '#F59E0B', simple: true, onClick: go(() => onNavigate('debts')) }] : []),
    { label: 'À venir', bigLabel: 'Factures à payer', Icon: CalendarClock, color: '#0EA5E9', simple: true, onClick: go(() => onNavigate('upcoming')) },
    ...(budgetsOn ? [{ label: 'Budgets', Icon: PieChart, color: '#22C55E', simple: false, onClick: go(() => onNavigate('budgets')) }] : []),
    { label: 'Catégories', Icon: Tags, color: '#EC4899', simple: false, onClick: go(() => onNavigate('categories')) },
    { label: 'Portefeuilles', Icon: CreditCard, color: '#14B8A6', simple: false, onClick: go(() => onNavigate('wallets')) },
    { label: 'Scanner un code', Icon: ScanLine, color: '#D946EF', simple: true, onClick: go(onOpenScan) },
    { label: 'Paramètres', Icon: Settings, color: '#64748B', simple: true, onClick: go(() => onNavigate('settings')) },
    { label: 'Profil', Icon: UserRound, color: '#6366F1', simple: true, onClick: go(() => onNavigate('profile')) },
  ];

  // Échap (ordinateur) ferme le menu
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    // Toucher la partie sombre à côté du menu le ferme
    <div className="fixed inset-0 z-50 flex bg-black/50 animate-fade-in" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        onClick={(e) => e.stopPropagation()}
        // Glisser le menu vers la gauche le ferme aussi
        onTouchStart={(e) => (startX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (startX.current !== null && startX.current - e.changedTouches[0].clientX > 60) onClose();
          startX.current = null;
        }}
        className="w-[80%] max-w-xs bg-white h-full shadow-2xl p-6 flex flex-col justify-between overflow-y-auto animate-slide-right"
      >
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

          {/* Liens du menu. Mode simple : l'essentiel en gros, le reste sous « Plus d'options » */}
          {simpleMode ? (
            <div className="space-y-1.5">
              {items.filter((i) => i.simple).map((i) => (
                <BigItem key={i.label} item={i} />
              ))}
              <button
                onClick={() => setMore((m) => !m)}
                aria-expanded={more}
                className="w-full flex items-center gap-3 px-2 py-2.5 rounded-2xl text-slate-500 cursor-pointer text-left"
              >
                <span className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                  <MoreHorizontal className="w-5 h-5" />
                </span>
                <span className="flex-1 text-[16px] font-semibold">Plus d&rsquo;options</span>
                <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${more ? 'rotate-180' : ''}`} />
              </button>
              {more && (
                <div className="space-y-1 pl-2 animate-fade-in">
                  {items.filter((i) => !i.simple).map((i) => (
                    <SmallItem key={i.label} item={i} />
                  ))}
                </div>
              )}
            </div>
          ) : (
            // Rangé en trois groupes, avec un petit titre chacun
            <div>
              {(
                [
                  ['Mon argent', ['Accueil', 'Nouvelle dépense', 'Historique', 'Statistiques']],
                  ['Gérer', ['Dettes et prêts', 'À venir', 'Budgets', 'Catégories', 'Portefeuilles']],
                  ['Plus', ['Scanner un code', 'Paramètres', 'Profil']],
                ] as const
              ).map(([title, labels]) => {
                const group = items.filter((i) => (labels as readonly string[]).includes(i.label));
                if (!group.length) return null;
                return (
                  <div key={title} className="mb-4 last:mb-0">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-2 mb-1">{title}</div>
                    <div className="space-y-0.5">
                      {group.map((i) => (
                        <SmallItem key={i.label} item={i} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-4 mt-4 border-t border-slate-100">
          <label className="flex items-center gap-3 px-2 py-2 rounded-2xl cursor-pointer">
            <span className="w-9 h-9 rounded-full bg-violet-500/12 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-violet-500" />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[14px] font-semibold text-slate-900">Mode simple</span>
              <span className="block text-[12px] text-slate-400 leading-tight">L&rsquo;essentiel, en gros</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={simpleMode}
              onChange={(e) => {
                haptic('success');
                setPrefs({ simpleMode: e.target.checked });
              }}
              className="toggle shrink-0"
            />
          </label>
        </div>
      </div>
    </div>
  );
};
