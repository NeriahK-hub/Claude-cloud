import React, { useState } from 'react';
import { X, Sparkles, Shield, Repeat, PieChart, Megaphone, Target, Receipt, ArrowRightLeft, HandCoins, Bell, Users } from 'lucide-react';
import { NotificationItem } from '../types';

interface NotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  notifications: NotificationItem[];
  onMarkAllRead: () => void;
  onOpen: (n: NotificationItem) => void; // touchée : lue, puis on va là où elle parle
}

// Icône et couleur d'une notification : d'après ce qui l'a créée (identifiant), sinon son type
function look(n: NotificationItem): { Icon: typeof Bell; color: string } {
  const id = n.id;
  if (id.startsWith('rec-')) return n.title.startsWith('Facture') ? { Icon: Receipt, color: '#F59E0B' } : { Icon: Repeat, color: '#0EA5E9' };
  if (id.startsWith('sub-')) return { Icon: Repeat, color: '#14B8A6' };
  if (id.startsWith('rate-')) return { Icon: ArrowRightLeft, color: '#6366F1' };
  if (id.startsWith('goal-')) return { Icon: Target, color: '#8B5CF6' };
  if (id.startsWith('budget-')) return { Icon: PieChart, color: '#F59E0B' };
  if (id.startsWith('debt-')) return { Icon: HandCoins, color: '#10B981' };
  switch (n.type) {
    case 'budget':
      return { Icon: PieChart, color: '#F59E0B' };
    case 'transaction':
      return { Icon: Users, color: '#10B981' };
    case 'announcement':
      return { Icon: Megaphone, color: '#6366F1' };
    case 'goal':
      return { Icon: Target, color: '#8B5CF6' };
    case 'promo':
      return { Icon: Sparkles, color: '#EC4899' };
    default:
      return { Icon: Shield, color: '#64748B' };
  }
}

// Texte propre : sans emoji (anciennes alertes, annonces) et sans montant ni « : » coupés en fin de ligne
const NB = '\u00a0';
function clean(text: string): string {
  return text
    .replace(/[\p{Extended_Pictographic}\u200d\ufe0f]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\.\.$/, '.') // « 8 oct.. » (anciennes alertes) -> « 8 oct. »
    .trim()
    .replace(/(\d)[ \u202f](?=\d{3}\b)/g, `$1${NB}`) // 1 200
    .replace(/(\d)[ \u202f](?=[$€%]|\$US|FC|CDF|USD|EUR)/g, `$1${NB}`) // 150 $US, 75 %
    .replace(/ ([:;!?])/g, `${NB}$1`)
    .replace(/-(ce|il|elle|tu|je|on|nous|vous|ils|elles)\b/g, '\u2011$1'); // « est-ce » ne se coupe pas
}

// Une ligne façon centre de notifications d'iOS : pastille ronde, titre, heure, message, point bleu si nouvelle
const Row: React.FC<{ n: NotificationItem; onOpen: (n: NotificationItem) => void }> = ({ n, onOpen }) => {
  const { Icon, color } = look(n);
  return (
    <li>
      <button
        onClick={() => onOpen(n)}
        className="w-full flex items-start gap-3 px-4 py-3.5 text-left cursor-pointer transition-colors duration-150 hover:bg-slate-100 active:bg-slate-200/70"
      >
      <span className="relative shrink-0">
        <span className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: `${color}1f`, color }}>
          <Icon className="w-[18px] h-[18px] stroke-[2.2]" />
        </span>
        {!n.read && <span className="absolute -top-0.5 -left-0.5 w-3 h-3 rounded-full bg-blue-500 ring-2 ring-slate-50" aria-label="Nouvelle" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className={`min-w-0 text-[14px] leading-snug ${n.read ? 'font-medium text-slate-700' : 'font-semibold text-slate-900'}`}>{clean(n.title)}</span>
          <span className="text-[12px] text-slate-400 shrink-0">{n.time}</span>
        </div>
        <p className="text-[13px] text-slate-500 leading-snug mt-0.5 [text-wrap:pretty]">{clean(n.message)}</p>
      </div>
      </button>
    </li>
  );
};

export const NotificationsModal: React.FC<NotificationsModalProps> = ({ isOpen, onClose, notifications, onMarkAllRead, onOpen }) => {
  const [leaving, setLeaving] = useState(false);
  if (!isOpen) return null;
  // Fermer en douceur (fenêtre qui glisse vers le bas), puis faire l'action
  const leave = (then: () => void) => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => {
      then();
      setLeaving(false); // prête pour la prochaine ouverture (sans clignoter)
    }, 260);
  };
  const open = (n: NotificationItem) => leave(() => onOpen(n));
  const fresh = notifications.filter((n) => !n.read);
  const old = notifications.filter((n) => n.read);
  const section = (title: string, list: NotificationItem[]) =>
    list.length > 0 && (
      <section className="mb-5">
        <h4 className="text-[13px] font-semibold text-slate-500 mb-2 px-1">{title}</h4>
        <ul className="rounded-2xl bg-slate-50 divide-y divide-slate-200/70 overflow-hidden">
          {list.map((n) => (
            <Row key={n.id} n={n} onOpen={open} />
          ))}
        </ul>
      </section>
    );

  return (
    <div
      data-own-leave
      className={`fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4 ${leaving ? 'animate-overlay-out' : 'animate-fade-in'}`}
      onClick={() => leave(onClose)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Notifications"
        onClick={(e) => e.stopPropagation()}
        className={`w-full sm:max-w-md bg-white rounded-t-[28px] sm:rounded-[28px] shadow-2xl relative max-h-[85dvh] flex flex-col overflow-hidden ${leaving ? 'animate-sheet-down' : 'animate-slide-up'}`}
      >
        {/* En-tête : grand titre, nombre de nouvelles, « Tout lire » */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div className="min-w-0">
            <h3 className="text-[26px] leading-tight font-bold tracking-tight text-slate-900">Notifications</h3>
            <p className="text-[13px] text-slate-500 mt-0.5">
              {fresh.length > 0 ? `${fresh.length} nouvelle${fresh.length > 1 ? 's' : ''}` : 'Tout est lu'}
            </p>
          </div>
          <div className="flex items-center gap-1 shrink-0 pt-1">
            {fresh.length > 0 && (
              <button onClick={onMarkAllRead} className="h-8 px-3 rounded-full text-[13px] font-semibold text-blue-600 hover:bg-blue-500/10 cursor-pointer whitespace-nowrap">
                Tout lire
              </button>
            )}
            <button onClick={() => leave(onClose)} aria-label="Fermer" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Liste : la barre de défilement passe dans la marge, fine, sans toucher les cartes */}
        <div className="flex-1 overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))] [scrollbar-width:thin] [scrollbar-color:var(--color-slate-300)_transparent] [scrollbar-gutter:stable]">
          {notifications.length === 0 ? (
            <div className="py-12 flex flex-col items-center text-center">
              <span className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                <Bell className="w-6 h-6 text-slate-400" />
              </span>
              <p className="text-[15px] font-semibold text-slate-700">Tout est calme</p>
              <p className="text-[13px] text-slate-400 mt-0.5">Les rappels et alertes apparaîtront ici.</p>
            </div>
          ) : (
            <>
              {section('Nouvelles', fresh)}
              {section('Plus tôt', old)}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
