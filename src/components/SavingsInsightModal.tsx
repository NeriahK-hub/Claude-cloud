import React from 'react';
import { X, Sparkles, TrendingUp, Tag, ShieldCheck } from 'lucide-react';

interface SavingsInsightModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SavingsInsightModal: React.FC<SavingsInsightModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 animate-fade-in">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl relative animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between pb-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-[#6E56CF]">
            <Sparkles className="w-4 h-4" />
            <span>Monthly Smart Savings</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Hero Figure */}
        <div className="text-center py-4 border-b border-slate-100">
          <span className="text-4xl font-extrabold text-slate-900 font-mono tracking-tight">
            $290.00
          </span>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Total money kept in your pocket last month
          </p>
        </div>

        {/* Breakdown Items */}
        <div className="py-4 space-y-3">
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center">
                <Tag className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-800 block">Merchant Discounts</span>
                <span className="text-[10px] text-slate-400 block">Amazon & Uber partners</span>
              </div>
            </div>
            <span className="text-sm font-bold text-emerald-600 font-mono">+$140.00</span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <TrendingUp className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-800 block">Cashback Rewards</span>
                <span className="text-[10px] text-slate-400 block">3% on Dining & Groceries</span>
              </div>
            </div>
            <span className="text-sm font-bold text-emerald-600 font-mono">+$95.00</span>
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-800 block">Automatic Round-Ups</span>
                <span className="text-[10px] text-slate-400 block">Transferred to High-Yield Vault</span>
              </div>
            </div>
            <span className="text-sm font-bold text-emerald-600 font-mono">+$55.00</span>
          </div>
        </div>

        {/* Done Button */}
        <button
          onClick={onClose}
          className="w-full py-3.5 rounded-2xl bg-[#D8FB52] hover:bg-[#cbed3b] text-slate-900 font-bold text-xs shadow-xs transition cursor-pointer"
        >
          Keep Saving
        </button>
      </div>
    </div>
  );
};
