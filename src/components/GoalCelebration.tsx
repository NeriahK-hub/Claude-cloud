import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Archive, Plus, X } from 'lucide-react';
import { Transaction, Wallet } from '../types';
import { formatMoney } from '../lib/money';
import { getPrefs } from '../lib/display';
import { haptic } from '../lib/haptics';
import { goalInsight } from '../lib/goals';
import { Crossing, MILESTONE_TEXT } from '../lib/goalMilestones';
import { GoalRing } from './WalletsView';
import { IconBadge } from './AppIcon';

const round = (v: number, currency: string) => formatMoney(v, currency, { ...getPrefs(), decimals: 'auto' });
const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// ---------- Confettis (canvas, sans librairie) ----------
const Confetti: React.FC<{ amount: number }> = ({ amount }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || reducedMotion()) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const W = window.innerWidth;
    const H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#d8fb52';
    const colors = [accent, '#34d399', '#60a5fa', '#f472b6', '#fbbf24', '#a78bfa'];
    // Deux canons depuis les coins du bas, qui tirent vers le centre
    const parts = Array.from({ length: amount }, (_, i) => {
      const left = i % 2 === 0;
      const angle = (left ? -60 : -120) * (Math.PI / 180) + (Math.random() - 0.5) * 0.9;
      const speed = 9 + Math.random() * 9;
      return {
        x: left ? W * 0.1 : W * 0.9,
        y: H * 0.85,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        w: 5 + Math.random() * 5,
        h: 8 + Math.random() * 6,
        r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        color: colors[i % colors.length],
      };
    });
    let frame = 0;
    let raf = 0;
    const tick = () => {
      frame++;
      ctx.clearRect(0, 0, W, H);
      const fade = Math.max(0, 1 - Math.max(0, frame - 110) / 60);
      for (const p of parts) {
        p.vy += 0.28; // gravité
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.r += p.vr;
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.color;
        // Effet « papier qui tourne » : la largeur oscille
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w * Math.abs(Math.cos(p.r * 2)), p.h);
        ctx.restore();
      }
      if (fade > 0) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [amount]);
  return <canvas ref={ref} aria-hidden className="fixed inset-0 w-full h-full pointer-events-none z-[71]" />;
};

// ---------- 25 / 50 / 75 % : carte en haut de l'écran, qui part toute seule ----------
const MilestoneCard: React.FC<{ crossing: Crossing; onClose: () => void; onOpen: () => void }> = ({ crossing, onClose, onOpen }) => {
  const { wallet: w, level, saved } = crossing;
  const text = MILESTONE_TEXT[level];
  useEffect(() => {
    haptic('success');
    const t = setTimeout(onClose, 5000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <>
      <Confetti amount={90} />
      <div className="fixed top-0 inset-x-0 z-[72] flex justify-center px-4 pt-[max(1rem,env(safe-area-inset-top))] pointer-events-none">
        <div
          role="status"
          onClick={onOpen}
          className="pointer-events-auto w-full max-w-sm bg-white rounded-[24px] border border-slate-100 shadow-[0_12px_40px_-12px_rgb(0_0_0/0.25)] p-4 flex items-center gap-3.5 cursor-pointer animate-toast"
        >
          <GoalRing ratio={level / 100} size={52} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 text-[15px] font-bold tracking-tight text-slate-900">
              {text.title}
              <text.Icon className="w-4 h-4 text-slate-500" />
            </div>
            <div className="text-[13px] text-slate-500 tabular-nums truncate">
              {w.name} · {round(saved, w.currency)} sur {round(w.goalAmount ?? 0, w.currency)}
            </div>
          </div>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label="Fermer"
            className="w-8 h-8 shrink-0 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );
};

// Durée lisible : « 12 jours », « 5 mois », « 1 an et 2 mois »
function duration(days: number): string {
  if (days < 1) return "Aujourd'hui";
  if (days < 31) return `${days} jour${days > 1 ? 's' : ''}`;
  const months = Math.round(days / 30.44);
  if (months < 12) return `${months} mois`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return `${y} an${y > 1 ? 's' : ''}${m ? ` et ${m} mois` : ''}`;
}
const dayDiff = (a: Date, b: Date) =>
  Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime() - new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()) / 86400000);

// ---------- 100 % : écran plein « Objectif atteint » ----------
const GoalReached: React.FC<{
  wallet: Wallet;
  transactions: Transaction[];
  onClose: () => void;
  onNewGoal: () => void;
  onArchive: () => void;
}> = ({ wallet: w, transactions, onClose, onNewGoal, onArchive }) => {
  const [ratio, setRatio] = useState(0); // l'anneau se remplit à l'ouverture
  useEffect(() => {
    haptic('success');
    const t = setTimeout(() => setRatio(1), 120);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const now = new Date();
    const g = goalInsight(w, transactions, now);
    const mine = transactions.filter((t) => t.walletId === w.id);
    const deposits = mine.filter((t) => t.amount > 0);
    const out: { value: string; label: string }[] = [
      { value: g?.start ? duration(dayDiff(g.start, now)) : "Aujourd'hui", label: "d'efforts" },
      { value: String(deposits.length), label: deposits.length > 1 ? 'dépôts' : 'dépôt' },
    ];
    if (w.goalDate) {
      const d = dayDiff(now, new Date(w.goalDate + 'T00:00'));
      if (d === 0) out.push({ value: 'Pile', label: 'à la date visée' });
      else {
        const n = Math.abs(d);
        const v = n >= 14 ? `${Math.round(n / 7)} sem.` : `${n} j`;
        out.push({ value: v, label: d > 0 ? "d'avance" : 'après la date' });
      }
    } else if (deposits.length) {
      out.push({ value: round(Math.max(...deposits.map((t) => t.amount)), w.currency), label: 'plus gros dépôt' });
    }
    return { saved: g?.saved ?? 0, out };
  }, [w, transactions]);

  return (
    <>
      <Confetti amount={180} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Objectif atteint"
        className="fixed inset-0 z-[70] bg-white overflow-y-auto animate-fade-in"
      >
        <div className="min-h-full max-w-md mx-auto px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] flex flex-col">
          <div className="flex justify-end">
            <button onClick={onClose} aria-label="Fermer" className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 flex flex-col items-center justify-center text-center py-6">
            <div className="relative">
              <GoalRing ratio={ratio} size={150} />
              <div className="absolute -bottom-1 -right-1">
                <IconBadge icon={w.icon} image={w.image} color={w.color} size="sm" />
              </div>
            </div>
            <p className="mt-7 text-[13px] font-semibold uppercase tracking-wider text-emerald-600">Objectif atteint</p>
            <h1 className="mt-1 text-[30px] leading-tight font-bold tracking-tight text-slate-900">{w.name}</h1>
            {w.goalWhy?.trim() && <p className="mt-2 text-[14px] italic text-slate-500">« {w.goalWhy.trim()} »</p>}
            <p className="mt-2 text-[15px] text-slate-500">
              Tu as épargné <span className="font-semibold text-slate-900 tabular-nums">{round(stats.saved, w.currency)}</span>. Bravo, tu l'as fait !
            </p>

            <div className="mt-8 w-full flex rounded-2xl bg-slate-50 divide-x divide-slate-200/70">
              {stats.out.map((s) => (
                <div key={s.label} className="flex-1 min-w-0 py-3 px-1.5 text-center">
                  <div className="text-[17px] font-bold tracking-tight tabular-nums text-slate-900 truncate">{s.value}</div>
                  <div className="text-[11px] font-medium text-slate-500">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <button
              onClick={onNewGoal}
              className="w-full h-14 rounded-2xl bg-accent hover:bg-accent-hover text-[15px] font-bold flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition"
            >
              <Plus className="w-5 h-5 stroke-[2.5]" /> Créer le prochain objectif
            </button>
            <button
              onClick={onArchive}
              className="w-full h-12 rounded-2xl text-[15px] font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              <Archive className="w-4 h-4" /> Archiver cet objectif
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

// Point d'entrée : carte pour 25 / 50 / 75 %, plein écran pour 100 %
export const GoalCelebration: React.FC<{
  crossing: Crossing;
  transactions: Transaction[];
  onClose: () => void;
  onOpenGoals: () => void;
  onNewGoal: () => void;
  onArchive: (walletId: string) => void;
}> = ({ crossing, transactions, onClose, onOpenGoals, onNewGoal, onArchive }) =>
  crossing.level === 100 ? (
    <GoalReached
      wallet={crossing.wallet}
      transactions={transactions}
      onClose={onClose}
      onNewGoal={onNewGoal}
      onArchive={() => onArchive(crossing.wallet.id)}
    />
  ) : (
    <MilestoneCard crossing={crossing} onClose={onClose} onOpen={onOpenGoals} />
  );
