import React from 'react';
import { formatMoney } from '../lib/money';
import { ChevronLeft, ChevronRight, Users, CheckCircle2, Clock, Hourglass, CalendarDays } from 'lucide-react';

type PayStatus = 'paid' | 'checking' | 'waiting';

interface Member {
  name: string;
  status: PayStatus;
  turn: number; // position dans l'ordre des tours
}

// Données de test : plus tard, elles viendront d'une base partagée
export const RISTOURNE = {
  name: 'Ristourne des amis',
  contribution: 20,
  frequency: 'Chaque samedi',
  currentTurn: 3,
  deadline: 'Samedi 3 octobre',
  members: [
    { name: 'Neriah', status: 'paid', turn: 1 },
    { name: 'Grâce', status: 'paid', turn: 2 },
    { name: 'Patrick', status: 'paid', turn: 3 },
    { name: 'Merveille', status: 'checking', turn: 4 },
    { name: 'Jonathan', status: 'waiting', turn: 5 },
    { name: 'Sarah', status: 'paid', turn: 6 },
  ] as Member[],
};

const STATUS = {
  paid: { label: 'Payé', icon: CheckCircle2, cls: 'bg-emerald-50 text-emerald-700' },
  checking: { label: 'En vérification', icon: Clock, cls: 'bg-amber-50 text-amber-700' },
  waiting: { label: 'En attente', icon: Hourglass, cls: 'bg-slate-100 text-slate-500' },
};

const initials = (n: string) => n.slice(0, 2).toUpperCase();

// Petite carte résumé, utilisée sur l'accueil (mobile et PC)
export const RistourneSummaryCard: React.FC<{ onOpen: () => void }> = ({ onOpen }) => {
  const paid = RISTOURNE.members.filter((m) => m.status === 'paid').length;
  return (
    <button
      onClick={onOpen}
      className="w-full text-left bg-white border border-slate-100 rounded-3xl p-4 flex items-center gap-3 cursor-pointer hover:border-slate-200 active:scale-[0.99] transition"
    >
      <div className="w-11 h-11 rounded-2xl bg-[#D8FB52] flex items-center justify-center shrink-0">
        <Users className="w-5 h-5 text-slate-900" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold text-slate-900">{RISTOURNE.name}</div>
        <div className="text-xs text-slate-500">
          Tour {RISTOURNE.currentTurn} sur {RISTOURNE.members.length}, {paid} membres ont payé
        </div>
      </div>
      <ChevronRight className="w-5 h-5 text-slate-400 shrink-0" />
    </button>
  );
};

export const RistourneView: React.FC<{ onBack: () => void; currency: string }> = ({ onBack, currency }) => {
  const { members, contribution, currentTurn } = RISTOURNE;
  const total = members.length * contribution;
  const collected = members.filter((m) => m.status === 'paid').length * contribution;
  const progress = Math.round((collected / total) * 100);
  const beneficiary = members.find((m) => m.turn === currentTurn)!;

  return (
    <div className="px-5 pt-4 pb-8 animate-screen">
      {/* En-tête */}
      <div className="flex items-center justify-between mb-6">
        <button onClick={onBack} aria-label="Retour" className="w-11 h-11 rounded-full bg-white border border-slate-100 flex items-center justify-center cursor-pointer">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-base font-bold text-slate-900">{RISTOURNE.name}</h1>
        <div className="w-11" />
      </div>

      {/* Cagnotte du tour */}
      <div className="bg-white rounded-3xl p-5 border border-slate-100 mb-6">
        <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
          <span>Tour {currentTurn} sur {members.length}</span>
          <span>{formatMoney(contribution, currency)} / personne</span>
        </div>
        <div className="text-[34px] font-extrabold tracking-tight tabular-nums text-slate-900">
          {formatMoney(collected, currency)} <span className="text-lg text-slate-400 font-bold">/ {formatMoney(total, currency)}</span>
        </div>
        <div className="h-2.5 rounded-full bg-slate-100 overflow-hidden my-3">
          <div className="h-full bg-[#D8FB52] rounded-full transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="text-sm text-slate-700">
          Ce tour, la cagnotte part chez <strong>{beneficiary.name}</strong>.
        </p>
        <p className="text-xs text-slate-400 mt-1">Date limite : {RISTOURNE.deadline}</p>

        <button className="w-full mt-4 py-3 rounded-2xl bg-[#D8FB52] font-bold text-sm text-slate-900 cursor-pointer">
          Envoyer ma preuve de paiement
        </button>
      </div>

      {/* Membres */}
      <h2 className="text-base font-bold text-slate-900 mb-3">Qui a payé ?</h2>
      <div className="flex flex-col gap-3 mb-6">
        {members.map((m) => {
          const s = STATUS[m.status];
          const Icon = s.icon;
          return (
            <div key={m.name} className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-full bg-[#16382F] text-white text-sm font-bold flex items-center justify-center">
                {initials(m.name)}
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-slate-900">{m.name}</div>
                <div className="text-xs text-slate-400">Reçoit au tour {m.turn}</div>
              </div>
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${s.cls}`}>
                <Icon className="w-3.5 h-3.5" />
                {s.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Calendrier des tours */}
      <h2 className="text-base font-bold text-slate-900 mb-3">Ordre des tours</h2>
      <div className="bg-white rounded-3xl border border-slate-100 divide-y divide-slate-100">
        {[...members].sort((a, b) => a.turn - b.turn).map((m) => (
          <div key={m.name} className="flex items-center gap-3 px-4 py-3">
            <CalendarDays className={`w-4 h-4 ${m.turn < currentTurn ? 'text-slate-300' : 'text-slate-700'}`} />
            <span className={`flex-1 text-sm ${m.turn < currentTurn ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
              Tour {m.turn} : {m.name}
            </span>
            {m.turn === currentTurn && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-[#D8FB52]">En cours</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
