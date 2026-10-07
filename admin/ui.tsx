// Petits éléments communs de l'espace admin (clair / sombre)
import React from 'react';
import { Loader2 } from 'lucide-react';

export const Card: React.FC<{ title?: string; hint?: string; right?: React.ReactNode; children: React.ReactNode; className?: string }> = ({
  title,
  hint,
  right,
  children,
  className = '',
}) => (
  <section className={`bg-white dark:bg-[#151a21] rounded-2xl border border-slate-200/70 dark:border-white/5 p-5 ${className}`}>
    {(title || right) && (
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          {title && <h2 className="text-[15px] font-semibold">{title}</h2>}
          {hint && <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-0.5">{hint}</p>}
        </div>
        {right}
      </div>
    )}
    {children}
  </section>
);

type BtnKind = 'primary' | 'plain' | 'danger';
const BTN: Record<BtnKind, string> = {
  primary: 'bg-accent text-slate-900 hover:brightness-95',
  plain: 'bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15',
  danger: 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/25',
};

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { kind?: BtnKind; busy?: boolean }> = ({
  kind = 'plain',
  busy,
  className = '',
  children,
  disabled,
  ...rest
}) => (
  <button
    {...rest}
    disabled={disabled || busy}
    className={`inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl text-[14px] font-semibold transition cursor-pointer disabled:opacity-50 disabled:cursor-default ${BTN[kind]} ${className}`}
  >
    {busy && <Loader2 className="w-4 h-4 animate-spin" />}
    {children}
  </button>
);

export const inputCls =
  'w-full px-3.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 text-[15px] outline-none focus:ring-2 focus:ring-accent placeholder:text-slate-400';

export const Switch: React.FC<{ checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }> = ({ checked, onChange, disabled, label }) => (
  <button
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={() => onChange(!checked)}
    className={`relative w-12 h-7 rounded-full transition shrink-0 cursor-pointer disabled:opacity-50 ${checked ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-white/15'}`}
  >
    <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
  </button>
);

export const ErrorLine: React.FC<{ text: string }> = ({ text }) =>
  text ? <p className="text-[13px] text-red-600 dark:text-red-400 mt-2">{text}</p> : null;

export const Loading: React.FC = () => (
  <div className="py-10 flex justify-center text-slate-400">
    <Loader2 className="w-5 h-5 animate-spin" />
  </div>
);

export const dateFr = (iso: string | null | undefined, withTime = false) =>
  iso
    ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}) })
    : '—';

export const nf = (n: number) => n.toLocaleString('fr-FR');
