import React, { useState } from 'react';
import { X, ArrowDownUp, Check, RefreshCw } from 'lucide-react';

interface ExchangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExchangeComplete: (fromCur: string, toCur: string, fromAmt: number, toAmt: number) => void;
}

export const ExchangeModal: React.FC<ExchangeModalProps> = ({
  isOpen,
  onClose,
  onExchangeComplete,
}) => {
  const [fromAmount, setFromAmount] = useState<string>('500');
  const [fromCurrency, setFromCurrency] = useState<'USD' | 'EUR' | 'GBP' | 'JPY'>('USD');
  const [toCurrency, setToCurrency] = useState<'USD' | 'EUR' | 'GBP' | 'JPY'>('EUR');
  const [isConverting, setIsConverting] = useState<boolean>(false);

  if (!isOpen) return null;

  // Realistic exchange rates relative to USD
  const rates = {
    USD: 1,
    EUR: 0.92,
    GBP: 0.78,
    JPY: 154.2,
  };

  const calculateTarget = () => {
    const num = parseFloat(fromAmount) || 0;
    const inUSD = num / rates[fromCurrency];
    return (inUSD * rates[toCurrency]).toFixed(2);
  };

  const handleSwap = () => {
    const temp = fromCurrency;
    setFromCurrency(toCurrency);
    setToCurrency(temp);
  };

  const handleExecute = () => {
    const fromNum = parseFloat(fromAmount);
    const toNum = parseFloat(calculateTarget());
    if (isNaN(fromNum) || fromNum <= 0) return;

    setIsConverting(true);
    setTimeout(() => {
      setIsConverting(false);
      onExchangeComplete(fromCurrency, toCurrency, fromNum, toNum);
      onClose();
    }, 700);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-xs p-0 sm:p-4">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl relative animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between pb-3">
          <h3 className="text-lg font-bold text-slate-900 tracking-tight">Currency Exchange</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* From Box */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            You Convert
          </span>
          <div className="flex items-center justify-between">
            <input
              type="number"
              value={fromAmount}
              onChange={(e) => setFromAmount(e.target.value)}
              className="text-2xl font-extrabold font-mono text-slate-900 bg-transparent focus:outline-none w-1/2"
            />
            <select
              value={fromCurrency}
              onChange={(e) => setFromCurrency(e.target.value as any)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
              <option value="GBP">GBP (£)</option>
              <option value="JPY">JPY (¥)</option>
            </select>
          </div>
        </div>

        {/* Swap Button Divider */}
        <div className="flex justify-center -my-3 z-10 relative">
          <button
            onClick={handleSwap}
            className="w-9 h-9 rounded-full bg-white border border-slate-200 shadow-sm flex items-center justify-center hover:bg-slate-50 active:scale-95 transition cursor-pointer text-slate-700"
          >
            <ArrowDownUp className="w-4 h-4" />
          </button>
        </div>

        {/* To Box */}
        <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 mt-2 mb-4">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
            You Receive
          </span>
          <div className="flex items-center justify-between">
            <span className="text-2xl font-extrabold font-mono text-slate-900">
              {calculateTarget()}
            </span>
            <select
              value={toCurrency}
              onChange={(e) => setToCurrency(e.target.value as any)}
              className="bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
            >
              <option value="EUR">EUR (€)</option>
              <option value="USD">USD ($)</option>
              <option value="GBP">GBP (£)</option>
              <option value="JPY">JPY (¥)</option>
            </select>
          </div>
        </div>

        {/* Rate info */}
        <div className="text-center text-xs text-slate-400 mb-5">
          1 {fromCurrency} = {(rates[toCurrency] / rates[fromCurrency]).toFixed(4)} {toCurrency} · Zero markup applied
        </div>

        {/* CTA */}
        <button
          onClick={handleExecute}
          disabled={isConverting}
          className="w-full py-3.5 rounded-2xl bg-[#D8FB52] hover:bg-[#cbed3b] text-slate-900 font-bold text-xs shadow-xs transition cursor-pointer flex items-center justify-center gap-2"
        >
          {isConverting ? (
            <RefreshCw className="w-4 h-4 animate-spin" />
          ) : (
            'Confirm Exchange'
          )}
        </button>
      </div>
    </div>
  );
};
