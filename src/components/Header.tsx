import React from 'react';
import { SlidersHorizontal, Bell } from 'lucide-react';

interface HeaderProps {
  title?: string;
  status?: React.ReactNode; // ex. indicateur de synchro
  unreadCount?: number;
  onOpenMenu?: () => void;
  onOpenNotifications?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title = 'Mon compte',
  status,
  unreadCount = 0,
  onOpenMenu,
  onOpenNotifications,
}) => {
  return (
    <header className="px-5 pt-3 pb-2 flex items-center justify-between">
      {/* Left button */}
      <button
        onClick={onOpenMenu}
        aria-label="Ouvrir le menu"
        className="w-11 h-11 rounded-full bg-white shadow-xs border border-slate-100 flex items-center justify-center text-slate-800 hover:bg-slate-50 active:scale-95 transition cursor-pointer"
      >
        <SlidersHorizontal className="w-4 h-4 text-slate-800" />
      </button>

      {/* Center Title */}
      <h1 className="text-lg font-bold text-slate-900 tracking-tight text-center flex items-center gap-1.5">
        {title}
        {status}
      </h1>

      {/* Right Notification button */}
      <button
        onClick={onOpenNotifications}
        aria-label="Notifications"
        className="relative w-11 h-11 rounded-full bg-white shadow-xs border border-slate-100 flex items-center justify-center text-slate-800 hover:bg-slate-50 active:scale-95 transition cursor-pointer"
      >
        <Bell className="w-4 h-4 text-slate-800" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-[#D8FB52] text-slate-950 text-[10px] font-extrabold flex items-center justify-center border-2 border-white shadow-xs">
            {unreadCount}
          </span>
        )}
      </button>
    </header>
  );
};
