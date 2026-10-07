import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDownLeft, ArrowUpRight, ChevronLeft, ChevronRight, CloudOff, HandCoins, Home, PieChart, Plus, ReceiptText,
  RefreshCw, Smartphone, User, Users, Wallet, X, Target, Flame, CalendarClock, Zap, Check, ArrowRightLeft, HeartPulse, Footprints, Trophy,
  Lightbulb, CalendarDays, FileText, CloudCheck, CloudUpload, QrCode, ScanLine, Sparkles, CalendarRange,
} from 'lucide-react';
import { useFeature } from '../lib/remoteConfig';
import { useIsDesktop } from '../hooks/useIsDesktop';

// Tutoriel de prise en main : quelques écrans à faire défiler (glisser, flèches, points),
// à la toute première ouverture (après l'écran d'accueil) et depuis Profil › « Comment ça marche ».
// Les illustrations sont de petites maquettes de l'app en HTML : elles suivent l'accent et le mode sombre.

const KEY = 'ap.tutorialSeen';

export function shouldShowTutorial(): boolean {
  try {
    if (localStorage.getItem(KEY) === '1') return false;
    // Déjà des opérations sur ce téléphone (utilisé avant cette mise à jour) : pas une nouvelle personne
    const raw = localStorage.getItem('ap.transactions');
    if (raw && raw !== '[]') {
      markTutorialSeen();
      return false;
    }
    return true;
  } catch {
    return false; // stockage bloqué : sinon il reviendrait à chaque ouverture
  }
}

// Nouveautés : montrées une fois aux personnes qui avaient déjà vu le tutoriel
const NEWS_KEY = 'ap.newsSeen';
const NEWS_VERSION = '2026-10c'; // changer à chaque nouveauté pour remontrer le « Quoi de neuf »
// Par vague de nouveautés : on montre seulement celles que la personne n'a pas encore vues
const NEWS_WAVES: [string, string[]][] = [
  ['2026-10', ['goals', 'upcoming', 'split', 'health', 'reports', 'rate', 'network']],
  ['2026-10b', ['badges']],
  ['2026-10c', ['simple', 'qr', 'insights']],
];
const newsSlides = (): string[] => {
  let seen: string | null = null;
  try {
    seen = localStorage.getItem(NEWS_KEY);
  } catch {
    // rien
  }
  const from = NEWS_WAVES.findIndex(([v]) => v === seen) + 1; // -1 + 1 = 0 : tout montrer
  return NEWS_WAVES.slice(from).flatMap(([, ids]) => ids);
};
export function shouldShowNews(): boolean {
  try {
    return localStorage.getItem(KEY) === '1' && localStorage.getItem(NEWS_KEY) !== NEWS_VERSION;
  } catch {
    return false;
  }
}
export function markNewsSeen() {
  try {
    localStorage.setItem(NEWS_KEY, NEWS_VERSION);
  } catch {
    // rien
  }
}

export function markTutorialSeen() {
  try {
    localStorage.setItem(KEY, '1');
    localStorage.setItem(NEWS_KEY, NEWS_VERSION); // le tutoriel complet contient déjà les nouveautés
  } catch {
    // rien
  }
}

// ---------- Petites pièces des maquettes ----------

// Écran de téléphone simplifié (cadre arrondi, contenu en dessous)
const Phone: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="relative w-[200px] h-[300px] rounded-[2.2rem] bg-white border-[6px] border-slate-200 shadow-[0_20px_50px_rgba(15,23,42,0.18)] overflow-hidden">
    <span className="absolute top-2 left-1/2 -translate-x-1/2 w-16 h-4 rounded-full bg-slate-200" aria-hidden />
    <div className="pt-8 px-3 h-full">{children}</div>
  </div>
);

// Carte qui « flotte » à côté du téléphone, comme une notification
const Float: React.FC<{ className?: string; delay?: number; children: React.ReactNode }> = ({ className = '', delay = 0, children }) => (
  <div
    className={`tuto-float absolute bg-white border border-slate-100 rounded-2xl shadow-[0_12px_30px_rgba(15,23,42,0.14)] px-3 py-2.5 flex items-center gap-2.5 ${className}`}
    style={{ animationDelay: `${delay}ms` }}
  >
    {children}
  </div>
);

const Dot: React.FC<{ className: string; children: React.ReactNode }> = ({ className, children }) => (
  <span className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${className}`}>{children}</span>
);

const Line: React.FC<{ title: string; hint: string }> = ({ title, hint }) => (
  <span className="min-w-0">
    <span className="block text-[12px] font-bold text-slate-900 leading-tight whitespace-nowrap">{title}</span>
    <span className="block text-[10px] text-slate-500 leading-tight whitespace-nowrap">{hint}</span>
  </span>
);

// Ligne d'opération dans la maquette
const Row: React.FC<{ label: string; amount: string; plus?: boolean }> = ({ label, amount, plus }) => (
  <div className="flex items-center gap-2 py-1.5">
    <span className="w-6 h-6 rounded-full bg-slate-100 shrink-0" />
    <span className="flex-1 text-[10px] font-semibold text-slate-700 truncate">{label}</span>
    <span className={`text-[10px] font-bold ${plus ? 'text-emerald-600' : 'text-slate-900'}`}>{amount}</span>
  </div>
);

// ---------- Les illustrations ----------

const IlluHome = () => (
  <>
    <Phone>
      <p className="text-[9px] text-slate-500">Solde total</p>
      <p className="text-[20px] font-extrabold text-slate-900 leading-tight">1 250 $</p>
      <p className="text-[10px] font-semibold text-slate-500 mb-2">+ 380 000 FC</p>
      <div className="grid grid-cols-4 gap-1.5 mb-3">
        {[ArrowUpRight, ArrowDownLeft, PieChart, Users].map((I, i) => (
          <span key={i} className={`h-8 rounded-xl flex items-center justify-center ${i === 0 ? 'bg-accent' : 'bg-slate-100'}`}>
            <I className="w-3.5 h-3.5" />
          </span>
        ))}
      </div>
      <Row label="Marché" amount="- 25 000 FC" />
      <Row label="Salaire" amount="+ 600 $" plus />
      <Row label="Transport" amount="- 3 $" />
    </Phone>
    <Float className="-right-20 top-16" delay={350}>
      <Dot className="bg-emerald-100 text-emerald-700"><ArrowDownLeft className="w-4 h-4" /></Dot>
      <Line title="Revenu" hint="+ 600 $ ce mois-ci" />
    </Float>
    <Float className="-left-20 bottom-12" delay={600}>
      <Dot className="bg-accent"><span className="text-[11px] font-extrabold">FC</span></Dot>
      <Line title="USD et Francs" hint="Les deux devises ensemble" />
    </Float>
  </>
);

const IlluAdd = () => (
  <>
    <Phone>
      <p className="text-[10px] font-bold text-slate-900 text-center mb-2">Nouvelle dépense</p>
      <p className="text-[24px] font-extrabold text-slate-900 text-center leading-none mb-3">15 000 <span className="text-[13px]">FC</span></p>
      <div className="flex flex-wrap gap-1 justify-center mb-3">
        {['Nourriture', 'Transport', 'Crédit tél.', 'Loyer'].map((c, i) => (
          <span key={c} className={`px-2 py-1 rounded-full text-[9px] font-semibold ${i === 0 ? 'bg-accent' : 'bg-slate-100 text-slate-600'}`}>{c}</span>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-1">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((k) => (
          <span key={k} className="h-6 rounded-lg bg-slate-100 text-[10px] font-bold text-slate-700 flex items-center justify-center">{k}</span>
        ))}
      </div>
    </Phone>
    {/* Le bouton + de la barre du bas */}
    <div className="tuto-float absolute -bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center" style={{ animationDelay: '400ms' }}>
      <span className="tuto-pulse w-14 h-14 rounded-full bg-accent shadow-lg flex items-center justify-center">
        <Plus className="w-6 h-6" strokeWidth={2.5} />
      </span>
    </div>
    <Float className="-right-20 top-[150px]" delay={650}>
      <Dot className="bg-rose-100 text-rose-600"><ArrowUpRight className="w-4 h-4" /></Dot>
      <Line title="Dépense ou revenu" hint="En quelques secondes" />
    </Float>
  </>
);

const IlluWallets = () => (
  <>
    <Phone>
      <p className="text-[11px] font-bold text-slate-900 mb-2">Portefeuilles</p>
      {[
        { n: 'Cash', a: '120 $', c: 'bg-accent' },
        { n: 'M-Pesa', a: '250 000 FC', c: 'bg-rose-100' },
        { n: 'Orange Money', a: '45 $', c: 'bg-orange-100' },
        { n: 'Banque', a: '1 085 $', c: 'bg-sky-100' },
      ].map((w) => (
        <div key={w.n} className="flex items-center gap-2 p-2 mb-1.5 rounded-xl bg-slate-50 border border-slate-100">
          <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${w.c}`}><Wallet className="w-3.5 h-3.5" /></span>
          <span className="flex-1 text-[10px] font-semibold text-slate-700 truncate">{w.n}</span>
          <span className="text-[10px] font-bold text-slate-900">{w.a}</span>
        </div>
      ))}
    </Phone>
    <Float className="-left-20 top-24" delay={350}>
      <Dot className="bg-slate-100 text-slate-700"><RefreshCw className="w-4 h-4" /></Dot>
      <Line title="Transfert" hint="Cash → M-Pesa" />
    </Float>
    <Float className="-right-20 -bottom-5" delay={600}>
      <Dot className="bg-accent"><Users className="w-4 h-4" /></Dot>
      <Line title="Partagé" hint="Avec ta famille" />
    </Float>
  </>
);

const IlluBudgets = () => (
  <>
    <Phone>
      <p className="text-[11px] font-bold text-slate-900 mb-2">Budgets du mois</p>
      {[
        { n: 'Nourriture', p: 72 },
        { n: 'Transport', p: 45 },
        { n: 'Sorties', p: 95 },
      ].map((b) => (
        <div key={b.n} className="mb-2.5">
          <div className="flex justify-between text-[10px] font-semibold text-slate-700 mb-1">
            <span>{b.n}</span>
            <span className={b.p > 90 ? 'text-rose-600' : 'text-slate-500'}>{b.p} %</span>
          </div>
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className={`animate-bar h-full rounded-full ${b.p > 90 ? 'bg-rose-500' : 'bg-accent'}`} style={{ width: `${b.p}%` }} />
          </div>
        </div>
      ))}
      {/* Petit graphique du rapport */}
      <div className="flex items-end gap-1.5 h-14 mt-3 px-1">
        {[40, 65, 30, 80, 55, 70].map((h, i) => (
          <span key={i} className={`tuto-grow flex-1 rounded-t-md ${i === 3 ? 'bg-accent' : 'bg-slate-200'}`} style={{ height: `${h}%`, animationDelay: `${i * 60}ms` }} />
        ))}
      </div>
    </Phone>
    <Float className="-right-20 -bottom-5" delay={400}>
      <Dot className="bg-rose-100 text-rose-600"><PieChart className="w-4 h-4" /></Dot>
      <Line title="Sorties : 95 %" hint="Attention à la limite" />
    </Float>
  </>
);

const IlluDebts = () => (
  <>
    <Phone>
      <p className="text-[11px] font-bold text-slate-900 mb-2">Dettes et prêts</p>
      <div className="grid grid-cols-2 gap-1.5 mb-3">
        <div className="p-2 rounded-xl bg-emerald-50">
          <p className="text-[8px] text-emerald-700 font-semibold">On me doit</p>
          <p className="text-[12px] font-extrabold text-emerald-700">80 $</p>
        </div>
        <div className="p-2 rounded-xl bg-rose-50">
          <p className="text-[8px] text-rose-700 font-semibold">Je dois</p>
          <p className="text-[12px] font-extrabold text-rose-700">30 $</p>
        </div>
      </div>
      <p className="text-[10px] font-bold text-slate-900 mb-1.5">Ristourne du quartier</p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((t) => (
          <span key={t} className={`flex-1 h-7 rounded-lg text-[9px] font-bold flex items-center justify-center ${t <= 2 ? 'bg-accent' : 'bg-slate-100 text-slate-500'}`}>
            {t}
          </span>
        ))}
      </div>
      <p className="text-[9px] text-slate-500 mt-1.5">Tour 3 : à toi de recevoir</p>
    </Phone>
    <Float className="-left-20 top-16" delay={350}>
      <Dot className="bg-emerald-100 text-emerald-700"><HandCoins className="w-4 h-4" /></Dot>
      <Line title="Papa Jean" hint="Te doit 50 $" />
    </Float>
    <Float className="-right-20 bottom-12" delay={600}>
      <Dot className="bg-accent"><Users className="w-4 h-4" /></Dot>
      <Line title="Ristourne" hint="5 membres, 20 $ / tour" />
    </Float>
  </>
);

const IlluCloud = () => (
  <>
    <Phone>
      <div className="flex flex-col items-center text-center pt-6">
        <span className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-3">
          <CloudOff className="w-6 h-6 text-slate-500" />
        </span>
        <p className="text-[12px] font-bold text-slate-900">Pas de connexion ?</p>
        <p className="text-[10px] text-slate-500 mt-1 px-2">Pas de souci, tout est gardé sur ton téléphone.</p>
      </div>
      <div className="absolute bottom-0 inset-x-0 h-11 border-t border-slate-100 bg-white flex items-center justify-around px-3">
        {[Home, ReceiptText, Wallet, User].map((I, i) => <I key={i} className={`w-4 h-4 ${i === 3 ? 'text-slate-900' : 'text-slate-300'}`} />)}
      </div>
    </Phone>
    <Float className="-right-20 -top-3" delay={350}>
      <Dot className="bg-accent"><RefreshCw className="w-4 h-4" /></Dot>
      <Line title="Synchronisé" hint="Téléphone et ordinateur" />
    </Float>
    <Float className="-left-20 bottom-16" delay={600}>
      <Dot className="bg-slate-100 text-slate-700"><Smartphone className="w-4 h-4" /></Dot>
      <Line title="Compte gratuit" hint="Dans l'onglet Profil" />
    </Float>
  </>
);


// ---------- Nouveautés ----------

const IlluGoals = () => (
  <>
    <Phone>
      <p className="text-[11px] font-bold text-slate-900 mb-2">Objectifs</p>
      <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-2.5 mb-2">
        <span className="relative w-12 h-12 shrink-0">
          <svg viewBox="0 0 48 48" className="w-full h-full -rotate-90">
            <circle cx="24" cy="24" r="20" fill="none" strokeWidth="5" className="stroke-slate-200" />
            <circle cx="24" cy="24" r="20" fill="none" strokeWidth="5" strokeLinecap="round" strokeDasharray="125.7" strokeDashoffset="45" className="tuto-ring" style={{ stroke: 'var(--accent-deep)' }} />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-extrabold">64%</span>
        </span>
        <span className="min-w-0">
          <span className="block text-[11px] font-bold text-slate-900">Moto</span>
          <span className="block text-[9px] text-slate-500">771 $ sur 1 200 $</span>
        </span>
      </div>
      <div className="p-2.5 rounded-2xl bg-violet-50 border border-violet-100">
        <p className="text-[10px] font-bold text-violet-700">Défi 52 semaines</p>
        <div className="flex gap-0.5 mt-1.5">
          {Array.from({ length: 12 }, (_, i) => (
            <span key={i} className={`flex-1 h-2 rounded-full ${i < 7 ? 'bg-violet-500' : 'bg-violet-200'}`} />
          ))}
        </div>
        <p className="text-[8px] text-violet-600 mt-1">Semaine 8 : mets 8 $</p>
      </div>
      <span className="mt-2 w-full h-7 rounded-xl bg-accent text-[10px] font-bold flex items-center justify-center">Ajouter de l'argent</span>
    </Phone>
    <Float className="-right-20 top-14" delay={350}>
      <Dot className="bg-orange-100 text-orange-600"><Flame className="w-4 h-4" /></Dot>
      <Line title="4 semaines d'affilée" hint="Continue comme ça" />
    </Float>
    <Float className="-left-20 bottom-14" delay={600}>
      <Dot className="bg-accent"><Target className="w-4 h-4" /></Dot>
      <Line title="75 % atteints" hint="Plus que 300 $" />
    </Float>
  </>
);

const IlluUpcoming = () => (
  <>
    <Phone>
      <p className="text-[11px] font-bold text-slate-900 mb-2">À venir</p>
      {[
        { n: 'SNEL', d: 'Demain', a: '25 000 FC', c: 'bg-amber-100 text-amber-600', late: false },
        { n: 'Loyer', d: 'Le 5', a: '150 $', c: 'bg-sky-100 text-sky-600', late: false },
        { n: 'REGIDESO', d: 'En retard', a: '12 000 FC', c: 'bg-rose-100 text-rose-600', late: true },
      ].map((x) => (
        <div key={x.n} className="flex items-center gap-2 p-2 mb-1.5 rounded-xl bg-slate-50 border border-slate-100">
          <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${x.c}`}><Zap className="w-3.5 h-3.5" /></span>
          <span className="flex-1 min-w-0">
            <span className="block text-[10px] font-bold text-slate-900">{x.n}</span>
            <span className={`block text-[8px] ${x.late ? 'text-rose-600 font-semibold' : 'text-slate-500'}`}>{x.d} · {x.a}</span>
          </span>
          <span className="px-1.5 py-1 rounded-lg bg-accent text-[8px] font-bold">Payé</span>
        </div>
      ))}
    </Phone>
    <Float className="-right-20 -top-2" delay={350}>
      <Dot className="bg-amber-100 text-amber-600"><CalendarClock className="w-4 h-4" /></Dot>
      <Line title="Facture : SNEL" hint="À payer demain" />
    </Float>
    <Float className="-left-20 bottom-10" delay={600}>
      <Dot className="bg-emerald-100 text-emerald-700"><Check className="w-4 h-4" /></Dot>
      <Line title="Salaire reçu ?" hint="Oui, c'est noté" />
    </Float>
  </>
);

const IlluSplit = () => (
  <>
    <Phone>
      <p className="text-[11px] font-bold text-slate-900 mb-1">Partager l'addition</p>
      <p className="text-[20px] font-extrabold text-slate-900 leading-tight mb-2">60 000 <span className="text-[11px]">FC</span></p>
      {[
        { n: 'Toi', c: 'bg-accent', a: '20 000' },
        { n: 'Grace', c: 'bg-sky-100 text-sky-600', a: '20 000' },
        { n: 'Jo', c: 'bg-amber-100 text-amber-600', a: '20 000' },
      ].map((x) => (
        <div key={x.n} className="flex items-center gap-2 py-1.5 border-b border-slate-100 last:border-0">
          <span className={`w-6 h-6 rounded-full text-[8px] font-bold flex items-center justify-center ${x.c}`}>{x.n.slice(0, x.n === 'Toi' ? 3 : 1)}</span>
          <span className="flex-1 text-[10px] font-semibold text-slate-700">{x.n}</span>
          <span className="text-[10px] font-bold text-slate-900">{x.a} FC</span>
        </div>
      ))}
      <div className="flex h-2 rounded-full overflow-hidden gap-0.5 mt-3">
        <span className="w-1/3 rounded-full bg-accent" />
        <span className="flex-1 rounded-full bg-emerald-500" />
      </div>
    </Phone>
    <Float className="-right-20 -bottom-4" delay={350}>
      <Dot className="bg-emerald-100 text-emerald-700"><HandCoins className="w-4 h-4" /></Dot>
      <Line title="Grace te doit" hint="20 000 FC" />
    </Float>
    <Float className="-left-20 -top-3" delay={600}>
      <Dot className="bg-accent"><Users className="w-4 h-4" /></Dot>
      <Line title="Restaurant, voyage…" hint="Chacun sa part" />
    </Float>
  </>
);

const IlluHealth = () => (
  <>
    <Phone>
      <p className="text-[11px] font-bold text-slate-900 mb-2 text-center">Santé financière</p>
      <div className="relative w-24 h-24 mx-auto mb-2">
        <svg viewBox="0 0 96 96" className="w-full h-full -rotate-90">
          <circle cx="48" cy="48" r="40" fill="none" strokeWidth="9" className="stroke-slate-100" />
          <circle cx="48" cy="48" r="40" fill="none" strokeWidth="9" strokeLinecap="round" strokeDasharray="251.3" strokeDashoffset="55" stroke="#22C55E" className="tuto-ring" />
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[24px] font-extrabold text-slate-900 leading-none">78</span>
          <span className="text-[8px] text-slate-400">sur 100</span>
        </span>
      </div>
      {[
        ['Épargne', 80, '#10B981'],
        ['Budgets', 60, '#F59E0B'],
        ['Dettes', 100, '#10B981'],
      ].map(([n, v, c]) => (
        <div key={n as string} className="mb-1.5">
          <div className="flex justify-between text-[9px] font-semibold text-slate-600 mb-0.5">
            <span>{n}</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div className="animate-bar h-full rounded-full" style={{ width: `${v}%`, background: c as string }} />
          </div>
        </div>
      ))}
    </Phone>
    <Float className="-right-20 -top-5" delay={350}>
      <Dot className="bg-amber-100 text-amber-600"><Lightbulb className="w-4 h-4" /></Dot>
      <Line title="Conseil de la semaine" hint="Garde 10 % de tes revenus" />
    </Float>
    <Float className="-left-20 -bottom-4" delay={600}>
      <Dot className="bg-rose-100 text-rose-600"><HeartPulse className="w-4 h-4" /></Dot>
      <Line title="+5 points" hint="depuis la semaine dernière" />
    </Float>
  </>
);

const IlluBadges = () => (
  <>
    <Phone>
      <p className="text-[11px] font-bold text-slate-900 mb-2 text-center">Séries et badges</p>
      <div className="w-16 h-16 mx-auto rounded-full bg-orange-500/15 flex items-center justify-center">
        <Flame className="w-8 h-8 text-orange-500 flame-flicker" fill="#F9731655" />
      </div>
      <p className="text-center mt-1.5">
        <span className="text-[20px] font-extrabold text-slate-900">5</span> <span className="text-[9px] text-slate-500">jours de suite</span>
      </p>
      <div className="grid grid-cols-3 gap-1.5 mt-2">
        {[
          ['#0EA5E9', Footprints],
          ['#F97316', Flame],
          ['#F59E0B', Trophy],
        ].map(([c, I], i) => {
          const Icon = I as typeof Flame;
          return (
            <span key={i} className="badge-pop mx-auto w-9 h-9 rounded-full flex items-center justify-center" style={{ background: c as string, animationDelay: `${300 + i * 150}ms` }}>
              <Icon className="w-4 h-4 text-white" />
            </span>
          );
        })}
      </div>
    </Phone>
    <Float className="-right-20 -top-5" delay={350}>
      <Dot className="bg-orange-100 text-orange-600"><Flame className="w-4 h-4" /></Dot>
      <Line title="Série de 5 jours" hint="Note chaque jour" />
    </Float>
    <Float className="-left-20 -bottom-4" delay={600}>
      <Dot className="bg-amber-100 text-amber-600"><Trophy className="w-4 h-4" /></Dot>
      <Line title="Nouveau badge !" hint="Objectif atteint" />
    </Float>
  </>
);

const IlluSimple = () => (
  <>
    <Phone>
      <p className="text-[11px] font-bold text-slate-900 mb-1 text-center">Mon compte</p>
      <p className="text-[18px] font-extrabold text-slate-900 text-center mb-2">125 000 FC</p>
      <div className="grid grid-cols-2 gap-1.5">
        <span className="rounded-xl border border-slate-200 p-2 flex flex-col gap-1">
          <span className="w-7 h-7 rounded-lg bg-red-500 flex items-center justify-center"><ArrowUpRight className="w-4 h-4 text-white" /></span>
          <span className="text-[9px] font-bold text-slate-900">J&rsquo;ai dépensé</span>
        </span>
        <span className="rounded-xl border border-slate-200 p-2 flex flex-col gap-1">
          <span className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center"><ArrowDownLeft className="w-4 h-4 text-white" /></span>
          <span className="text-[9px] font-bold text-slate-900">J&rsquo;ai reçu</span>
        </span>
      </div>
      <div className="mt-2 rounded-xl bg-slate-100 p-2 space-y-1">
        <div className="h-1.5 rounded-full bg-emerald-400 w-4/5" />
        <div className="h-1.5 rounded-full bg-red-400 w-3/5" />
      </div>
    </Phone>
    <Float className="-right-20 -top-5" delay={350}>
      <Dot className="bg-violet-100 text-violet-600"><Sparkles className="w-4 h-4" /></Dot>
      <Line title="Mode simple" hint="Paramètres › Apparence" />
    </Float>
  </>
);

const IlluQr = () => (
  <>
    <Phone>
      <p className="text-[11px] font-bold text-slate-900 mb-3 text-center">Fais scanner ce code</p>
      <div className="mx-auto w-28 h-28 rounded-2xl bg-white border border-slate-200 p-2 grid grid-cols-5 gap-0.5">
        {Array.from({ length: 25 }, (_, i) => (
          <span key={i} className={`rounded-[2px] ${[0, 1, 3, 4, 5, 7, 9, 12, 14, 15, 17, 19, 20, 21, 23, 24, 6, 18].includes(i) ? 'bg-slate-900' : 'bg-transparent'}`} />
        ))}
      </div>
      <p className="text-[13px] font-extrabold tracking-[0.15em] text-slate-900 text-center mt-2">K7P4-QX9M</p>
    </Phone>
    <Float className="-right-20 -top-5" delay={350}>
      <Dot className="bg-fuchsia-100 text-fuchsia-600"><ScanLine className="w-4 h-4" /></Dot>
      <Line title="Scanner un code" hint="Dans le menu de Wallo" />
    </Float>
    <Float className="-left-20 -bottom-4" delay={600}>
      <Dot className="bg-emerald-100 text-emerald-600"><QrCode className="w-4 h-4" /></Dot>
      <Line title="Déjà connecté" hint="Pas besoin du navigateur" />
    </Float>
  </>
);

const IlluInsights = () => (
  <>
    <Phone>
      <p className="text-[11px] font-bold text-slate-900 mb-2 text-center">Ta semaine</p>
      <div className="flex items-end gap-1 h-20 px-1">
        {[40, 70, 25, 100, 0, 55, 30].map((h, i) => (
          <span key={i} className="flex-1 rounded-md animate-bar-up" style={{ height: `${Math.max(6, h)}%`, background: h === 100 ? '#EF4444' : h === 0 ? '#10B981' : '#CBD5E1', animationDelay: `${i * 60}ms` }} />
        ))}
      </div>
      <p className="text-[9px] text-slate-500 text-center mt-2">Jour le plus cher : jeudi</p>
      <div className="mt-2 rounded-xl p-2 text-center" style={{ background: 'linear-gradient(135deg, #7B5CFF, #EC4899)' }}>
        <span className="text-[9px] font-bold" style={{ color: '#fff' }}>Ton année 2026</span>
      </div>
    </Phone>
    <Float className="-right-20 -top-5" delay={350}>
      <Dot className="bg-emerald-100 text-emerald-600"><CalendarRange className="w-4 h-4" /></Dot>
      <Line title="Bilan de la semaine" hint="Chaque dimanche soir" />
    </Float>
    <Float className="-left-20 -bottom-4" delay={600}>
      <Dot className="bg-orange-100 text-orange-600"><Lightbulb className="w-4 h-4" /></Dot>
      <Line title="Petites dépenses" hint="Ce qu'elles coûtent par an" />
    </Float>
  </>
);

const IlluReports = () => (
  <>
    <Phone>
      <p className="text-[11px] font-bold text-slate-900 mb-2">Calendrier des dépenses</p>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 28 }, (_, i) => {
          const v = [0, 0.9, 0.2, 0, 0.5, 0.3, 0, 0.7, 0, 0.25, 1, 0, 0.4, 0.15, 0, 0.6, 0.3, 0, 0.8, 0.2, 0, 0.35, 0, 0.5, 0.1, 0, 0.65, 0.2][i];
          return (
            <span
              key={i}
              className={`aspect-square rounded-full text-[7px] font-bold flex items-center justify-center ${v ? '' : 'bg-slate-100 text-slate-400'}`}
              style={v ? { background: `rgb(239 68 68 / ${0.2 + v * 0.8})`, color: v > 0.5 ? '#fff' : '#7f1d1d' } : undefined}
            >
              {i + 1}
            </span>
          );
        })}
      </div>
      <div className="flex gap-1.5 mt-3">
        <span className="flex-1 p-1.5 rounded-xl bg-slate-50 border border-slate-100 text-[8px] font-semibold text-slate-600 flex items-center gap-1"><ArrowRightLeft className="w-3 h-3" /> Comparer</span>
        <span className="flex-1 p-1.5 rounded-xl bg-slate-50 border border-slate-100 text-[8px] font-semibold text-slate-600 flex items-center gap-1"><FileText className="w-3 h-3" /> PDF</span>
      </div>
    </Phone>
    <Float className="-right-20 -top-6" delay={350}>
      <Dot className="bg-emerald-100 text-emerald-700"><CalendarDays className="w-4 h-4" /></Dot>
      <Line title="−12 % de dépenses" hint="par rapport à septembre" />
    </Float>
    <Float className="-left-20 -bottom-4" delay={600}>
      <Dot className="bg-amber-100 text-amber-600"><Flame className="w-4 h-4" /></Dot>
      <Line title="Taxi : 22 fois" hint="≈ 180 $ par an" />
    </Float>
  </>
);

const IlluRate = () => (
  <>
    <Phone>
      <div className="p-2.5 rounded-2xl bg-slate-50 border border-slate-100 flex items-center gap-2 mb-3">
        <ArrowRightLeft className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-[10px] text-slate-600">Aujourd'hui, <b className="text-slate-900">1 $ = 2 850 FC</b></span>
      </div>
      <p className="text-[9px] text-slate-500 text-center">1 dollar vaut</p>
      <p className="text-[22px] font-extrabold text-slate-900 text-center leading-tight">2 850 FC</p>
      <p className="text-[8px] text-slate-500 text-center mb-2">Marché (cambistes)</p>
      <svg viewBox="0 0 160 50" className="w-full h-12">
        <path d="M0,40 L20,36 L40,38 L60,30 L80,32 L100,24 L120,26 L140,18 L160,14" fill="none" strokeWidth="2.5" strokeLinejoin="round" style={{ stroke: 'var(--accent-deep)' }} className="tuto-draw" />
        <path d="M0,44 L40,42 L80,40 L120,36 L160,34" fill="none" strokeWidth="1.5" strokeDasharray="4 3" className="stroke-slate-300" />
      </svg>
    </Phone>
    <Float className="-right-20 -bottom-4" delay={350}>
      <Dot className="bg-accent"><ArrowRightLeft className="w-4 h-4" /></Dot>
      <Line title="Ton cambiste" hint="1 $ = 2 870 FC" />
    </Float>
  </>
);

const IlluNetwork = () => (
  <>
    <Phone>
      <div className="flex items-center justify-center gap-1.5 mb-4">
        <span className="text-[12px] font-bold text-slate-900">Mon compte</span>
        <CloudCheck className="w-4 h-4" style={{ color: '#10B981' }} />
      </div>
      {[
        { I: CloudCheck, c: '#10B981', t: 'Tout est sauvegardé' },
        { I: CloudUpload, c: '#0EA5E9', t: 'Envoi en cours' },
        { I: CloudOff, c: '#94A3B8', t: 'Pas de connexion' },
        { I: CloudOff, c: '#F59E0B', t: 'En attente (3)' },
      ].map((x, i) => (
        <div key={i} className="flex items-center gap-2 p-2 mb-1.5 rounded-xl bg-slate-50 border border-slate-100">
          <x.I className="w-4 h-4 shrink-0" style={{ color: x.c }} />
          <span className="text-[10px] font-semibold text-slate-700">{x.t}</span>
        </div>
      ))}
    </Phone>
    <Float className="-right-20 -bottom-4" delay={350}>
      <Dot className="bg-emerald-100 text-emerald-700"><CloudCheck className="w-4 h-4" /></Dot>
      <Line title="Le réseau est revenu" hint="Tout est envoyé" />
    </Float>
  </>
);

interface Slide {
  id: string;
  title: string;
  text: string;
  desk?: string; // texte propre à l'ordinateur (clic, menu de gauche)
  Illu: React.FC;
}

const SLIDES: Slide[] = [
  {
    id: 'home',
    title: 'Ton argent, en clair',
    text: 'Wallo t\'aide à suivre tout ce qui entre et tout ce qui sort, en dollars comme en francs congolais.',
    Illu: IlluHome,
  },
  {
    id: 'add',
    title: 'Note chaque dépense',
    text: 'Touche le bouton + en bas de l\'écran, tape le montant et choisis une catégorie. C\'est tout !',
    desk: 'Clique sur « Ajouter une transaction » en bas du menu de gauche, tape le montant et choisis une catégorie. C\'est tout !',
    Illu: IlluAdd,
  },
  {
    id: 'wallets',
    title: 'Un portefeuille par compte',
    text: 'Cash, M-Pesa, Orange Money, banque… Crée-les dans l\'onglet Portefeuilles, fais des transferts et partage-en avec tes proches.',
    desk: 'Cash, M-Pesa, Orange Money, banque… Crée-les depuis Portefeuilles dans le menu, fais des transferts et partage-en avec tes proches.',
    Illu: IlluWallets,
  },
  {
    id: 'budgets',
    title: 'Budgets et rapports',
    text: 'Fixe une limite par mois pour chaque catégorie. Le rapport te montre où part ton argent.',
    Illu: IlluBudgets,
  },
  {
    id: 'debts',
    title: 'Dettes, prêts et ristournes',
    text: 'Note qui te doit et à qui tu dois. Gère ta ristourne : les membres, les tours et qui a payé.',
    Illu: IlluDebts,
  },
  {
    id: 'goals',
    title: 'Objectifs et défis',
    text: 'Fixe un objectif (moto, loyer, rentrée…), ajoute de l\'argent quand tu peux et suis ta progression. Lance un défi comme « 52 semaines » pour épargner sans y penser.',
    desk: 'Fixe un objectif depuis « Objectifs », ajoute de l\'argent quand tu peux et suis ta progression. Lance un défi comme « 52 semaines » pour épargner sans y penser.',
    Illu: IlluGoals,
  },
  {
    id: 'upcoming',
    title: 'Factures à ne pas oublier',
    text: 'SNEL, REGIDESO, loyer, salaire… Note ce qui revient chaque mois : Wallo te prévient avant, et un seul geste suffit pour dire « c\'est payé ».',
    Illu: IlluUpcoming,
  },
  {
    id: 'split',
    title: 'Partager l\'addition',
    text: 'Restaurant, voyage, courses à plusieurs : dans une dépense, touche « Partager ». Wallo note ta part et retient qui te doit combien.',
    Illu: IlluSplit,
  },
  {
    id: 'health',
    title: 'Ta santé financière',
    text: 'Une note sur 100 sur l\'accueil : épargne, budgets, dettes, réserve. Touche-la pour voir le détail et le conseil de la semaine.',
    Illu: IlluHealth,
  },
  {
    id: 'simple',
    title: 'Le mode simple',
    text: 'Deux gros boutons « J\'ai dépensé » et « J\'ai reçu », et ton mois en deux chiffres. À activer dans Paramètres › Apparence, avec les icônes seules si tu lis peu.',
    Illu: IlluSimple,
  },
  {
    id: 'qr',
    title: 'Inviter avec un code QR',
    text: 'Montre le code QR, l\'autre personne touche « Scanner un code » dans le menu de son Wallo : elle rejoint sans passer par le navigateur.',
    Illu: IlluQr,
  },
  {
    id: 'insights',
    title: 'Comprendre ton argent',
    text: 'Dans le Rapport : bilan de la semaine et de l\'année, ton jour le plus cher, tes petites dépenses et tes abonnements.',
    Illu: IlluInsights,
  },
  {
    id: 'badges',
    title: 'Séries et badges',
    text: 'Note au moins une opération par jour : ta série grandit. Et gagne des badges en épargnant, en tenant tes budgets ou en réglant tes dettes.',
    Illu: IlluBadges,
  },
  {
    id: 'reports',
    title: 'Comprendre où part ton argent',
    text: 'Dans le Rapport : le calendrier de tes dépenses, la comparaison de deux mois, tes dépenses qui reviennent le plus, et un rapport PDF à partager.',
    Illu: IlluReports,
  },
  {
    id: 'rate',
    title: 'Le taux du jour',
    text: 'Sur l\'accueil, le taux du dollar chez les cambistes. Tu peux noter celui de ton cambiste et l\'utiliser pour tes conversions.',
    Illu: IlluRate,
  },
  {
    id: 'network',
    title: 'Les nuages en haut',
    text: 'Le petit nuage à côté de « Mon compte » te dit si tout est sauvegardé. Touche-le pour savoir ce que veut dire chaque couleur.',
    Illu: IlluNetwork,
  },
  {
    id: 'cloud',
    title: 'Même sans internet',
    text: 'L\'app marche hors ligne. Crée un compte depuis Profil pour sauvegarder et retrouver tes données partout.',
    Illu: IlluCloud,
  },
];

export const Tutorial: React.FC<{ onDone: () => void; news?: boolean }> = ({ onDone, news }) => {
  const budgetsOn = useFeature('budgets');
  const debtsOn = useFeature('debts');
  const ristournesOn = useFeature('ristournes');
  const accountsOn = useFeature('accounts');
  const [newsIds] = useState(newsSlides);
  // Pas d'écran pour une fonctionnalité coupée depuis l'espace admin
  const slides = SLIDES.filter(
    (s) =>
      (s.id !== 'budgets' || budgetsOn) &&
      (s.id !== 'debts' || debtsOn || ristournesOn) &&
      (s.id !== 'split' || debtsOn) &&
      (s.id !== 'cloud' || accountsOn) &&
      (s.id !== 'network' || accountsOn) &&
      // « Quoi de neuf » : seulement les nouveaux écrans
      (!news || newsIds.includes(s.id)),
  );

  const desktop = useIsDesktop();
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const last = index >= slides.length - 1;
  const slide = slides[Math.min(index, slides.length - 1)];

  const close = () => {
    if (leaving) return;
    if (news) markNewsSeen();
    else markTutorialSeen();
    setLeaving(true);
    setTimeout(onDone, 300);
  };
  const go = (i: number) => setIndex(Math.max(0, Math.min(slides.length - 1, i)));
  const next = () => (last ? close() : go(index + 1));

  // Flèches du clavier (ordinateur), Échap pour passer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') go(index - 1);
      else if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onTouchStart = (e: React.TouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return;
    if (dx < 0) next();
    else go(index - 1);
  };

  // ---------- Ordinateur : fenêtre centrée, illustration à gauche, texte à droite ----------
  if (desktop) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Comment marche Wallo"
        className={`fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-8 ${leaving ? 'tuto-out' : 'animate-fade-in'}`}
        onClick={(e) => e.target === e.currentTarget && close()}
      >
        <div className="w-full max-w-4xl bg-white rounded-[2rem] shadow-2xl overflow-hidden grid grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] min-h-[520px]">
          {/* Illustration */}
          <div className="relative bg-slate-50 flex items-center justify-center overflow-hidden py-12">
            <div key={slide.id} className="tuto-illu relative [@media(max-height:700px)]:scale-[0.85]">
              <span className="absolute -inset-10 rounded-full bg-accent/25 blur-3xl" aria-hidden />
              <div className="relative"><slide.Illu /></div>
            </div>
          </div>

          {/* Texte et navigation */}
          <div className="flex flex-col p-10">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400 tabular-nums tracking-wider">
                {news && <span className="mr-2 px-2.5 py-1 rounded-full bg-accent text-slate-900 tracking-normal">Quoi de neuf</span>}
                {index + 1} / {slides.length}
              </span>
              <button
                onClick={close}
                aria-label={last ? 'Fermer' : 'Passer le tutoriel'}
                title={last ? 'Fermer' : 'Passer (Échap)'}
                className="w-10 h-10 -mr-2 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div key={`t-${slide.id}`} className="tuto-text flex-1 flex flex-col justify-center py-8">
              <h2 className="text-[32px] font-extrabold text-slate-900 tracking-tight leading-tight">{slide.title}</h2>
              <p className="mt-4 text-base text-slate-500 leading-relaxed">{slide.desk ?? slide.text}</p>
            </div>

            <div className="flex gap-1.5 mb-6">
              {slides.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => go(i)}
                  aria-label={`Écran ${i + 1} sur ${slides.length}`}
                  aria-current={i === index}
                  className="py-2 cursor-pointer"
                >
                  <span className={`block h-2 rounded-full transition-all duration-300 ${i === index ? 'w-6 bg-slate-900' : 'w-2 bg-slate-200 hover:bg-slate-300'}`} />
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              {index > 0 && (
                <button
                  onClick={() => go(index - 1)}
                  className="h-12 px-5 rounded-2xl border border-slate-200 text-sm font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 transition cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Précédent
                </button>
              )}
              <button
                onClick={next}
                className="flex-1 h-12 rounded-2xl bg-accent hover:bg-accent-hover text-sm font-bold flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-[0.98]"
              >
                {last ? 'C\'est parti !' : index === 0 && !news ? 'Découvrir' : 'Suivant'}
                {!last && <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
            <p className="mt-4 text-[12px] text-slate-400">Astuce : les flèches ← → du clavier marchent aussi, Échap pour passer.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    // « fixed inset-0 z-50 » : la page derrière est figée (src/lib/scrollLock.ts)
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Comment marche Wallo"
      className={`fixed inset-0 z-50 bg-white flex justify-center ${leaving ? 'tuto-out' : 'animate-fade-in'}`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="w-full max-w-md h-full flex flex-col pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {/* Haut : retour et « Passer » */}
        <div className="flex items-center justify-between px-4 h-11 shrink-0">
          <button
            onClick={() => go(index - 1)}
            aria-label="Écran précédent"
            className={`w-10 h-10 rounded-full flex items-center justify-center text-slate-700 hover:bg-slate-100 transition cursor-pointer ${index === 0 ? 'invisible' : ''}`}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          {news && <span className="px-3 h-7 rounded-full bg-accent text-[12px] font-bold flex items-center">Quoi de neuf</span>}
          {!last ? (
            <button onClick={close} className="px-3 h-10 rounded-full text-sm font-semibold text-slate-500 hover:bg-slate-100 transition cursor-pointer">
              Passer
            </button>
          ) : (
            <button onClick={close} aria-label="Fermer" className="w-10 h-10 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-100 transition cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Illustration (rejouée à chaque écran grâce à la clé) */}
        <div className="flex-1 min-h-0 flex items-center justify-center overflow-hidden">
          <div key={slide.id} className="tuto-illu relative scale-[0.85] min-[380px]:scale-100 [@media(max-height:640px)]:scale-[0.75]">
            <span className="absolute -inset-10 rounded-full bg-accent/25 blur-3xl" aria-hidden />
            <div className="relative"><slide.Illu /></div>
          </div>
        </div>

        {/* Texte */}
        <div key={`t-${slide.id}`} className="tuto-text px-7 text-center shrink-0 min-h-[136px]">
          <h2 className="text-[24px] font-extrabold text-slate-900 tracking-tight leading-tight">{slide.title}</h2>
          <p className="mt-2.5 text-[15px] text-slate-500 leading-relaxed">{slide.text}</p>
        </div>

        {/* Points */}
        <div className="flex justify-center gap-1.5 my-5 shrink-0">
          {slides.map((s, i) => (
            <button
              key={s.id}
              onClick={() => go(i)}
              aria-label={`Écran ${i + 1} sur ${slides.length}`}
              aria-current={i === index}
              className="py-2 cursor-pointer"
            >
              <span className={`block h-2 rounded-full transition-all duration-300 ${i === index ? 'w-6 bg-slate-900' : 'w-2 bg-slate-200'}`} />
            </button>
          ))}
        </div>

        <div className="px-5 shrink-0">
          <button
            onClick={next}
            className="w-full h-14 rounded-2xl bg-accent hover:bg-accent-hover text-base font-bold transition cursor-pointer active:scale-[0.98]"
          >
            {last ? 'C\'est parti !' : index === 0 && !news ? 'Découvrir' : 'Suivant'}
          </button>
        </div>
      </div>
    </div>
  );
};
