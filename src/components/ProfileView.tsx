import React from 'react';
import { Settings as SettingsIcon, User, Shield, Bell, HelpCircle, LogOut, ChevronRight, Smartphone, KeyRound, CreditCard } from 'lucide-react';

interface ProfileViewProps {
  onOpenSettings?: () => void;
  onLogout?: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ onOpenSettings }) => {
  return (
    <div className="w-full min-h-screen bg-slate-50 px-5 pt-3 pb-28">
      {/* Header */}
      <h1 className="text-xl font-bold text-slate-900 tracking-tight mb-5">
        My Profile
      </h1>

      {/* User Card */}
      <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-2xs flex items-center gap-4 mb-5">
        <div className="w-16 h-16 rounded-full bg-[#16382F] text-white flex items-center justify-center font-extrabold text-xl shadow-xs ring-4 ring-slate-100">
          MB
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-slate-900 tracking-tight truncate">
              Mikel Borle
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-[#D8FB52] text-slate-950 text-[10px] font-extrabold tracking-tight">
              PRO
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-0.5 truncate">
            mikel.borle@aetherpay.me
          </p>
          <p className="text-xs font-mono text-slate-500 mt-0.5">
            +1 (555) 349-2810
          </p>
        </div>
      </div>

      {/* Settings Sections */}
      <div className="space-y-4">
        <div className="bg-white rounded-2xl p-2 border border-slate-100 shadow-2xs">
          <button
            onClick={onOpenSettings}
            className="w-full flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl transition cursor-pointer text-xs"
          >
            <div className="flex items-center gap-3">
              <SettingsIcon className="w-4 h-4 text-slate-700" />
              <span className="font-bold text-slate-800">Paramètres (apparence, devises, taux)</span>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {/* Security & Access */}
        <div className="bg-white rounded-2xl p-2 border border-slate-100 shadow-2xs">
          <div className="px-3 pt-2 pb-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Security & Preferences
          </div>
          <div className="divide-y divide-slate-100 text-xs">
            <button className="w-full flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl transition cursor-pointer">
              <div className="flex items-center gap-3">
                <KeyRound className="w-4 h-4 text-slate-700" />
                <span className="font-bold text-slate-800">Face ID & Biometrics</span>
              </div>
              <span className="text-xs font-semibold text-emerald-600">Enabled</span>
            </button>

            <button className="w-full flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl transition cursor-pointer">
              <div className="flex items-center gap-3">
                <Shield className="w-4 h-4 text-slate-700" />
                <span className="font-bold text-slate-800">Two-Factor Authentication</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>

            <button className="w-full flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl transition cursor-pointer">
              <div className="flex items-center gap-3">
                <Bell className="w-4 h-4 text-slate-700" />
                <span className="font-bold text-slate-800">Push Notifications</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Banking Limits */}
        <div className="bg-white rounded-2xl p-2 border border-slate-100 shadow-2xs">
          <div className="px-3 pt-2 pb-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Limits & Accounts
          </div>
          <div className="divide-y divide-slate-100 text-xs">
            <button className="w-full flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl transition cursor-pointer">
              <div className="flex items-center gap-3">
                <CreditCard className="w-4 h-4 text-slate-700" />
                <span className="font-bold text-slate-800">Daily Transfer Limit</span>
              </div>
              <span className="font-mono font-bold text-slate-900">—</span>
            </button>

            <button className="w-full flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl transition cursor-pointer">
              <div className="flex items-center gap-3">
                <Smartphone className="w-4 h-4 text-slate-700" />
                <span className="font-bold text-slate-800">Connected Devices</span>
              </div>
              <span className="text-slate-500 font-medium">2 Active</span>
            </button>
          </div>
        </div>

        {/* Help & Support */}
        <div className="bg-white rounded-2xl p-2 border border-slate-100 shadow-2xs">
          <div className="divide-y divide-slate-100 text-xs">
            <button className="w-full flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl transition cursor-pointer">
              <div className="flex items-center gap-3">
                <HelpCircle className="w-4 h-4 text-slate-700" />
                <span className="font-bold text-slate-800">24/7 Concierge Support</span>
              </div>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </button>

            <button className="w-full flex items-center justify-between p-3 hover:bg-rose-50 text-rose-600 rounded-xl transition cursor-pointer">
              <div className="flex items-center gap-3">
                <LogOut className="w-4 h-4 text-rose-600" />
                <span className="font-bold">Log Out</span>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
