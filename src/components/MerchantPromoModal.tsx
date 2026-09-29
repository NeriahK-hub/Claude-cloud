import React, { useState } from 'react';
import { X, Copy, Check, ExternalLink, Sparkles } from 'lucide-react';
import { MerchantOffer } from '../types';

interface MerchantPromoModalProps {
  merchant: MerchantOffer | null;
  onClose: () => void;
}

export const MerchantPromoModal: React.FC<MerchantPromoModalProps> = ({
  merchant,
  onClose,
}) => {
  const [copied, setCopied] = useState<boolean>(false);

  if (!merchant) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(merchant.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4 animate-fade-in">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-6 shadow-2xl relative animate-slide-up">
        {/* Close Button */}
        <div className="flex items-center justify-between pb-3">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold">
            <Sparkles className="w-3 h-3" />
            <span>{merchant.badge}</span>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="text-center py-4">
          <h3 className="text-2xl font-extrabold text-slate-900 tracking-tight">
            {merchant.title}
          </h3>
          <p className="text-sm text-slate-500 mt-1 font-medium">
            {merchant.subtitle} — {merchant.merchantName}
          </p>

          {/* Promo Code Box */}
          <div className="my-6 p-4 rounded-2xl bg-slate-50 border-2 border-dashed border-slate-200 flex items-center justify-between">
            <div className="text-left">
              <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                PROMO CODE
              </span>
              <span className="text-xl font-mono font-extrabold text-slate-900 tracking-wider">
                {merchant.code}
              </span>
            </div>

            <button
              onClick={handleCopy}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-[#D8FB52]" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>

          <p className="text-xs text-slate-400">
            Valid until end of season ({merchant.expiresIn}). Automatically applied when checking out with your AetherPay Card.
          </p>
        </div>

        {/* Action Button */}
        <button
          onClick={onClose}
          className="w-full py-3.5 rounded-2xl bg-[#D8FB52] hover:bg-[#cbed3b] text-slate-900 font-bold text-sm shadow-xs transition cursor-pointer flex items-center justify-center gap-2"
        >
          <span>Use Offer Now</span>
          <ExternalLink className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
