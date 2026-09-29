import React from 'react';
import { X, Smartphone, Zap, Receipt, Users, Lock, FileSpreadsheet, Gift } from 'lucide-react';

interface MoreServicesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectService: (serviceName: string) => void;
}

export const MoreServicesModal: React.FC<MoreServicesModalProps> = ({
  isOpen,
  onClose,
  onSelectService,
}) => {
  if (!isOpen) return null;

  const services = [
    { id: 'bills', name: 'Utility Bills', desc: 'Electricity & Water', icon: Zap, color: 'text-amber-500 bg-amber-50' },
    { id: 'mobile', name: 'Mobile Top-up', desc: 'Prepaid airtime & eSIM', icon: Smartphone, color: 'text-blue-500 bg-blue-50' },
    { id: 'split', name: 'Split Bill', desc: 'Share group costs', icon: Users, color: 'text-purple-500 bg-purple-50' },
    { id: 'statements', name: 'Statements', desc: 'Monthly PDF & CSV', icon: FileSpreadsheet, color: 'text-emerald-500 bg-emerald-50' },
    { id: 'vault', name: 'Locked Vault', desc: '4.8% APY High-Yield', icon: Lock, color: 'text-rose-500 bg-rose-50' },
    { id: 'gift', name: 'Gift Cards', desc: 'Apple, Steam, Uber', icon: Gift, color: 'text-indigo-500 bg-indigo-50' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 animate-fade-in">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl relative animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between pb-3 mb-2">
          <div>
            <h3 className="text-lg font-bold text-slate-900 tracking-tight">More Financial Services</h3>
            <p className="text-xs text-slate-400">Everything you need in one tap</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Grid */}
        <div className="grid grid-cols-2 gap-3 py-2">
          {services.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                onClick={() => {
                  onSelectService(s.name);
                  onClose();
                }}
                className="p-3.5 rounded-2xl border border-slate-100 hover:border-slate-300 bg-slate-50/50 hover:bg-slate-50 transition text-left cursor-pointer group"
              >
                <div className={`w-9 h-9 rounded-xl ${s.color} flex items-center justify-center mb-2 group-hover:scale-105 transition`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold text-slate-800 block">{s.name}</span>
                <span className="text-[11px] text-slate-400 block mt-0.5">{s.desc}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
