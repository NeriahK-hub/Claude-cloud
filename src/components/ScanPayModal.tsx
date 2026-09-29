import React, { useState } from 'react';
import { X, Flashlight, Image as ImageIcon, QrCode, CheckCircle2 } from 'lucide-react';

interface ScanPayModalProps {
  isOpen: boolean;
  onClose: () => void;
  onScannedMerchant: (name: string, amount: number) => void;
}

export const ScanPayModal: React.FC<ScanPayModalProps> = ({
  isOpen,
  onClose,
  onScannedMerchant,
}) => {
  const [torchOn, setTorchOn] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(true);

  if (!isOpen) return null;

  const mockQRCodes = [
    { name: 'Starbucks Coffee', amount: 6.45 },
    { name: 'Whole Foods Market', amount: 48.20 },
    { name: 'Blue Bottle Bistro', amount: 14.50 },
  ];

  const handleSimulateScan = (qr: { name: string; amount: number }) => {
    setIsScanning(false);
    setTimeout(() => {
      onScannedMerchant(qr.name, qr.amount);
      onClose();
    }, 600);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
      <div className="w-full max-w-sm rounded-3xl overflow-hidden bg-slate-950 text-white flex flex-col items-center justify-between p-6 relative border border-slate-800 shadow-2xl min-h-[500px]">
        {/* Top Controls */}
        <div className="w-full flex items-center justify-between z-10">
          <button
            onClick={() => setTorchOn(!torchOn)}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition cursor-pointer ${
              torchOn ? 'bg-[#D8FB52] text-slate-900' : 'bg-white/10 text-white hover:bg-white/20'
            }`}
          >
            <Flashlight className="w-5 h-5" />
          </button>
          <span className="text-sm font-bold tracking-tight">Scan QR to Pay</span>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewfinder Window */}
        <div className="relative w-64 h-64 my-6 flex items-center justify-center">
          {/* 4 Corner Markers */}
          <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-[#D8FB52] rounded-tl-xl"></div>
          <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-[#D8FB52] rounded-tr-xl"></div>
          <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-[#D8FB52] rounded-bl-xl"></div>
          <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-[#D8FB52] rounded-br-xl"></div>

          {/* Animated Laser Scanning Line */}
          <div className="absolute inset-x-2 h-0.5 bg-gradient-to-r from-transparent via-[#D8FB52] to-transparent shadow-[0_0_12px_#D8FB52] animate-[bounce_2.5s_infinite]"></div>

          {/* Target graphic */}
          <div className="w-40 h-40 border border-dashed border-white/20 rounded-2xl flex items-center justify-center">
            <QrCode className="w-16 h-16 text-white/30" />
          </div>
        </div>

        {/* Quick test merchant scans */}
        <div className="w-full z-10 text-center">
          <p className="text-xs text-slate-400 mb-2">Simulate scanning a merchant QR:</p>
          <div className="grid grid-cols-3 gap-2">
            {mockQRCodes.map((qr) => (
              <button
                key={qr.name}
                onClick={() => handleSimulateScan(qr)}
                className="py-2 px-1 rounded-xl bg-white/10 hover:bg-[#D8FB52] hover:text-slate-900 text-[11px] font-bold transition cursor-pointer truncate"
              >
                {qr.name.split(' ')[0]} (${qr.amount})
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
