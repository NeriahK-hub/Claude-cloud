import React, { useState } from 'react';
import { X, QrCode, Copy, Check, Share2, Send } from 'lucide-react';
import { QUICK_CONTACTS } from '../data/mockData';

interface RequestMoneyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRequestSent: (title: string, amount: number) => void;
}

export const RequestMoneyModal: React.FC<RequestMoneyModalProps> = ({
  isOpen,
  onClose,
  onRequestSent,
}) => {
  const [amount, setAmount] = useState<string>('50.00');
  const [selectedContact, setSelectedContact] = useState(QUICK_CONTACTS[1]);
  const [note, setNote] = useState<string>('Dinner & Drinks split');
  const [copied, setCopied] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(`https://aetherpay.me/pay/mikel?amount=${amount}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendRequest = () => {
    const num = parseFloat(amount);
    if (isNaN(num) || num <= 0) return;
    onRequestSent(`Payment Request to ${selectedContact.name}`, num);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 animate-fade-in">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl relative animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between pb-3">
          <h3 className="text-lg font-bold text-slate-900 tracking-tight">Request Money</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Amount Input */}
        <div className="text-center py-4">
          <span className="text-xs font-medium text-slate-400 block mb-1">Requested Amount</span>
          <div className="inline-flex items-center justify-center text-3xl font-extrabold font-mono text-slate-900">
            <span>$</span>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-32 text-center bg-transparent border-b-2 border-[#D8FB52] focus:outline-none font-mono"
            />
          </div>
        </div>

        {/* Contact selection */}
        <div className="mb-4">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
            Request From
          </span>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {QUICK_CONTACTS.map((c) => {
              const isSelected = selectedContact.id === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedContact(c)}
                  className={`flex items-center gap-2 p-1.5 pr-3 rounded-full border transition cursor-pointer ${
                    isSelected
                      ? 'border-[#B8E94C] bg-lime-50/60 ring-2 ring-[#D8FB52]/40'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <img
                    src={c.avatar}
                    alt={c.name}
                    className="w-7 h-7 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <span className="text-xs font-bold text-slate-800">{c.name.split(' ')[0]}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Note Input */}
        <div className="mb-5">
          <input
            type="text"
            placeholder="Add a note (e.g. Dinner, Rent)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#D8FB52]"
          />
        </div>

        {/* Buttons */}
        <div className="space-y-2">
          <button
            onClick={handleSendRequest}
            className="w-full py-3.5 rounded-2xl bg-[#D8FB52] hover:bg-[#cbed3b] text-slate-900 font-bold text-xs shadow-xs transition cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Send className="w-4 h-4" />
            <span>Send Request to {selectedContact.name}</span>
          </button>

          <button
            onClick={handleCopyLink}
            className="w-full py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? 'Link Copied to Clipboard!' : 'Copy Shareable Payment Link'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
