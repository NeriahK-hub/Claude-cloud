import React from 'react';
import { Wifi, Battery } from 'lucide-react';

interface StatusBarProps {
  darkText?: boolean;
}

export const StatusBar: React.FC<StatusBarProps> = ({ darkText = true }) => {
  return (
    <div className={`w-full px-6 pt-3 pb-1 flex items-center justify-between text-xs font-semibold select-none z-30 ${darkText ? 'text-slate-900' : 'text-white'}`}>
      {/* Time */}
      <span className="tracking-tight text-[15px] font-bold">9:41</span>

      {/* Dynamic Island Notch */}
      <div className="flex items-center justify-center">
        <div className="w-28 h-6 bg-black rounded-full flex items-center justify-between px-2.5 shadow-inner">
          <div className="w-2.5 h-2.5 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center">
            <div className="w-1 h-1 rounded-full bg-blue-950/80"></div>
          </div>
          <div className="w-2 h-2 rounded-full bg-green-500/20 flex items-center justify-center">
            <div className="w-1 h-1 rounded-full bg-green-400 animate-pulse"></div>
          </div>
        </div>
      </div>

      {/* Icons */}
      <div className="flex items-center space-x-1.5 text-inherit">
        {/* Signal */}
        <div className="flex items-end space-x-0.5 h-3">
          <span className="w-0.5 h-1.5 bg-current rounded-full"></span>
          <span className="w-0.5 h-2 bg-current rounded-full"></span>
          <span className="w-0.5 h-2.5 bg-current rounded-full"></span>
          <span className="w-0.5 h-3 bg-current rounded-full"></span>
        </div>
        <Wifi className="w-3.5 h-3.5 stroke-[2.5]" />
        <div className="flex items-center">
          <div className="w-5 h-2.5 border border-current rounded-sm p-0.5 flex items-center">
            <div className="h-full w-full bg-current rounded-2xs"></div>
          </div>
          <div className="w-0.5 h-1 bg-current rounded-r-xs"></div>
        </div>
      </div>
    </div>
  );
};
