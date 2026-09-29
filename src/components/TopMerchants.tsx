import React from 'react';
import { ChevronRight, Sparkles } from 'lucide-react';
import { MerchantOffer } from '../types';

interface TopMerchantsProps {
  merchants: MerchantOffer[];
  onSelectMerchant: (merchant: MerchantOffer) => void;
  onViewAll?: () => void;
}

export const TopMerchants: React.FC<TopMerchantsProps> = ({
  merchants,
  onSelectMerchant,
  onViewAll,
}) => {
  return (
    <div className="w-full pt-2 pb-4">
      {/* Section Header */}
      <div className="px-5 flex items-center justify-between mb-3">
        <h2 className="text-base font-bold text-slate-900 tracking-tight">
          Top Merchants
        </h2>
        <button
          onClick={onViewAll}
          className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-0.5 transition cursor-pointer"
        >
          View all
          <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
        </button>
      </div>

      {/* Horizontal Carousel */}
      <div className="px-5 flex gap-3 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory">
        {merchants.map((merchant, idx) => (
          <div
            key={merchant.id}
            onClick={() => onSelectMerchant(merchant)}
            className={`flex-none w-[82%] sm:w-[310px] snap-start rounded-2xl p-4 bg-gradient-to-r ${merchant.bannerGradient} border border-slate-200/50 shadow-2xs hover:shadow-xs transition duration-200 cursor-pointer relative overflow-hidden flex items-center justify-between`}
          >
            {/* Left Content */}
            <div className="z-10 pr-2">
              <span className="text-sm font-bold text-slate-900 tracking-tight block">
                {merchant.title}
              </span>
              <span className="text-xs text-slate-500 font-medium block mt-0.5">
                {merchant.subtitle}
              </span>
              <div className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 bg-white/70 backdrop-blur-xs px-2 py-0.5 rounded-full shadow-2xs">
                <Sparkles className="w-3 h-3" />
                <span>Code: {merchant.code}</span>
              </div>
            </div>

            {/* Right Graphic: Hand-crafted 3D Gift Box & Cart Vector Illustration */}
            <div className="relative shrink-0 w-24 h-20 flex items-center justify-center">
              {idx === 0 ? (
                // 3D Festive Gift & Cart Illustration
                <svg
                  viewBox="0 0 100 80"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-full h-full drop-shadow-sm select-none"
                >
                  <defs>
                    <linearGradient id="cartGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#CBD5E1" />
                      <stop offset="100%" stopColor="#94A3B8" />
                    </linearGradient>
                    <linearGradient id="giftGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#C4B5FD" />
                      <stop offset="100%" stopColor="#8B5CF6" />
                    </linearGradient>
                    <linearGradient id="ribbonGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#FDE047" />
                      <stop offset="100%" stopColor="#EAB308" />
                    </linearGradient>
                    <linearGradient id="bagGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#FDBA74" />
                      <stop offset="100%" stopColor="#EA580C" />
                    </linearGradient>
                  </defs>

                  {/* Shopping Bag Back */}
                  <path d="M68 28 L82 34 L78 62 L64 56 Z" fill="url(#bagGrad)" opacity="0.9" />
                  <path d="M72 26 C72 22 78 22 78 26" stroke="#9A3412" strokeWidth="2" fill="none" />

                  {/* Big Purple Gift Box */}
                  <g transform="translate(38, 22)">
                    {/* Main Box Body */}
                    <rect x="0" y="8" width="32" height="32" rx="4" fill="url(#giftGrad1)" />
                    {/* Box Lid */}
                    <rect x="-2" y="5" width="36" height="8" rx="2" fill="#7C3AED" />
                    {/* Ribbon Vertical */}
                    <rect x="13" y="5" width="6" height="35" fill="url(#ribbonGrad)" />
                    {/* Ribbon Horizontal */}
                    <rect x="0" y="20" width="32" height="6" fill="url(#ribbonGrad)" />
                    {/* Ribbon Bow on top */}
                    <path
                      d="M16 5 C11 -2 8 4 16 5 C24 4 21 -2 16 5 Z"
                      fill="#FACC15"
                    />
                  </g>

                  {/* Wire Shopping Cart */}
                  <g transform="translate(10, 32)">
                    {/* Cart Basket */}
                    <path
                      d="M0 0 L6 16 L28 16 L34 2 L2 2"
                      stroke="url(#cartGrad)"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path d="M8 4 L11 14 M15 3 L17 15 M22 3 L23 15 M28 3 L27 14" stroke="#94A3B8" strokeWidth="1.2" />
                    <path d="M4 8 L32 8 M5 12 L29 12" stroke="#94A3B8" strokeWidth="1.2" />
                    {/* Wheels */}
                    <circle cx="9" cy="20" r="3" fill="#64748B" />
                    <circle cx="25" cy="20" r="3" fill="#64748B" />
                    <circle cx="9" cy="20" r="1.2" fill="#F1F5F9" />
                    <circle cx="25" cy="20" r="1.2" fill="#F1F5F9" />
                  </g>
                </svg>
              ) : idx === 1 ? (
                // Food / Dining Cashback Illustration
                <svg
                  viewBox="0 0 100 80"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-full h-full drop-shadow-sm select-none"
                >
                  <defs>
                    <linearGradient id="plateGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#FDA4AF" />
                      <stop offset="100%" stopColor="#E11D48" />
                    </linearGradient>
                  </defs>
                  <circle cx="50" cy="40" r="26" fill="url(#plateGrad)" />
                  <circle cx="50" cy="40" r="20" fill="#FFF1F2" />
                  <path d="M42 30 Q46 45 42 50 M44 30 Q48 45 44 50 M54 30 L54 50 M58 35 Q58 50 54 50" stroke="#E11D48" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="70" cy="22" r="6" fill="#FACC15" />
                  <text x="70" y="25" textAnchor="middle" fontSize="8" fontWeight="bold" fill="#78350F">%</text>
                </svg>
              ) : (
                // FX Travel Pass Illustration
                <svg
                  viewBox="0 0 100 80"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="w-full h-full drop-shadow-sm select-none"
                >
                  <defs>
                    <linearGradient id="globeGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#86EFAC" />
                      <stop offset="100%" stopColor="#16A34A" />
                    </linearGradient>
                  </defs>
                  <circle cx="50" cy="40" r="24" fill="url(#globeGrad)" />
                  <circle cx="50" cy="40" r="24" stroke="#15803D" strokeWidth="1.5" />
                  <ellipse cx="50" cy="40" rx="12" ry="24" stroke="#DCFCE7" strokeWidth="1.5" fill="none" />
                  <line x1="26" y1="40" x2="74" y2="40" stroke="#DCFCE7" strokeWidth="1.5" />
                  {/* Plane */}
                  <path d="M35 24 L52 28 L48 34 L40 31 L38 35 L35 34 Z" fill="#FFFFFF" />
                </svg>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
