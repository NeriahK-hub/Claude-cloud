import React from 'react';
import { ArrowDownLeft, ArrowUpRight, Sparkles } from 'lucide-react';

// Accueil d'une personne qui n'a encore rien noté : une seule carte, un seul geste à faire,
// à la place des cartes vides (rapport à 0, liste vide).
export const StartCard: React.FC<{ onExpense: () => void; onIncome: () => void }> = ({ onExpense, onIncome }) => (
  <div className="bg-white rounded-3xl border border-slate-100 p-5 text-center">
    <span className="w-12 h-12 mx-auto rounded-2xl bg-accent flex items-center justify-center mb-3">
      <Sparkles className="w-6 h-6" style={{ color: 'var(--on-accent)' }} />
    </span>
    <h2 className="text-[18px] font-extrabold tracking-tight text-slate-900">Note ta première opération</h2>
    <p className="text-[14px] text-slate-500 mt-1 max-w-[280px] mx-auto leading-snug">
      Ça prend 10 secondes. Wallo calcule ensuite tes totaux, ton rapport et te rappelle ce qui revient.
    </p>
    <div className="grid grid-cols-2 gap-2.5 mt-4">
      <button onClick={onExpense} className="h-12 rounded-2xl bg-accent hover:bg-accent-hover text-[15px] font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.97] transition">
        <ArrowUpRight className="w-4 h-4" /> Une dépense
      </button>
      <button onClick={onIncome} className="h-12 rounded-2xl bg-slate-100 hover:bg-slate-200/70 text-[15px] font-bold text-slate-900 flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.97] transition">
        <ArrowDownLeft className="w-4 h-4" /> Un revenu
      </button>
    </div>
  </div>
);
