import React from 'react';

// Écran qui se charge : une barre de titre et quelques cartes grises, au lieu d'une page vide.
const Bar: React.FC<{ w: string; h?: string; round?: string }> = ({ w, h = 'h-3.5', round = 'rounded-full' }) => <span className={`skeleton block ${h} ${round}`} style={{ width: w }} />;

export const PageSkeleton: React.FC = () => (
  <div className="px-5 pt-4 pb-8" role="status" aria-label="Chargement">
    <div className="flex items-center gap-3 mb-6">
      <span className="skeleton block w-11 h-11 rounded-full shrink-0" />
      <Bar w="40%" h="h-5" />
    </div>
    <div className="space-y-3">
      <div className="bg-white rounded-3xl border border-slate-100 p-5 space-y-3">
        <Bar w="35%" />
        <Bar w="65%" h="h-7" />
        <Bar w="50%" />
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="bg-white rounded-3xl border border-slate-100 p-4 flex items-center gap-3">
          <span className="skeleton block w-11 h-11 rounded-full shrink-0" />
          <span className="flex-1 space-y-2">
            <Bar w="55%" />
            <Bar w="35%" h="h-3" />
          </span>
          <Bar w="18%" />
        </div>
      ))}
    </div>
  </div>
);
