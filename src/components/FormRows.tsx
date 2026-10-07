import React from 'react';
import { Check, ChevronRight } from 'lucide-react';

// Petits éléments de formulaire façon Réglages d'iOS (groupes arrondis, lignes, interrupteurs)

// Groupe de lignes arrondi, avec un titre au-dessus et une aide en dessous
export const Group: React.FC<{ title?: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
  <section className="mb-5">
    {title && <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 px-4">{title}</h3>}
    <div className="rounded-2xl bg-slate-100 divide-y divide-slate-200/70 overflow-hidden">{children}</div>
    {hint && <p className="text-[12px] text-slate-400 mt-1.5 px-4 leading-snug">{hint}</p>}
  </section>
);

// Ligne « libellé ……… valeur › » ; avec `select`, toute la ligne ouvre la liste du téléphone
export const SelectRow: React.FC<{ label: string; value: string; display: string; onChange: (v: string) => void; options: { value: string; label: string }[] }> = ({
  label,
  value,
  display,
  onChange,
  options,
}) => (
  <label className="relative flex items-center gap-3 px-4 min-h-[48px] cursor-pointer active:bg-slate-200/60 transition-colors">
    <span className="text-[15px] text-slate-900 shrink-0">{label}</span>
    <span className="flex-1 min-w-0 text-right text-[15px] text-slate-500 truncate">{display}</span>
    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="absolute inset-0 opacity-0 cursor-pointer">
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  </label>
);

// Ligne « libellé ……… valeur › » qui ouvre une liste dans la fenêtre
export const NavRow: React.FC<{ label: string; display: string; icon?: React.ReactNode; onClick: () => void }> = ({ label, display, icon, onClick }) => (
  <button type="button" onClick={onClick} className="w-full flex items-center gap-3 px-4 min-h-[48px] text-left cursor-pointer active:bg-slate-200/60 transition-colors">
    <span className="text-[15px] text-slate-900 shrink-0">{label}</span>
    <span className="flex-1 min-w-0 flex items-center justify-end gap-2 text-[15px] text-slate-500">
      {icon}
      <span className="truncate">{display}</span>
    </span>
    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
  </button>
);

// Une ligne d'une liste de choix : icône, nom, petite aide, coche si choisie
export const PickRow: React.FC<{ selected: boolean; onClick: () => void; icon?: React.ReactNode; title: string; sub?: string; indent?: boolean }> = ({
  selected,
  onClick,
  icon,
  title,
  sub,
  indent,
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full flex items-center gap-3 pr-4 min-h-[52px] text-left cursor-pointer active:bg-slate-200/60 transition-colors ${indent ? 'pl-9' : 'pl-4'}`}
  >
    {icon}
    <span className="flex-1 min-w-0">
      <span className={`block text-[15px] truncate ${selected ? 'font-semibold text-slate-900' : 'text-slate-900'}`}>{title}</span>
      {sub && <span className="block text-[12px] text-slate-500 truncate">{sub}</span>}
    </span>
    {selected && <Check className="w-5 h-5 text-blue-600 stroke-[2.6] shrink-0" />}
  </button>
);

export const SwitchRow: React.FC<{ label: string; checked: boolean; onChange: (v: boolean) => void }> = ({ label, checked, onChange }) => (
  <div className="flex items-center gap-3 px-4 min-h-[48px]">
    <span className="flex-1 text-[15px] text-slate-900">{label}</span>
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`w-[51px] h-[31px] shrink-0 rounded-full p-0.5 transition-colors duration-200 cursor-pointer ${checked ? 'bg-emerald-500' : 'bg-slate-300'}`}
    >
      {/* Toujours blanc, même en mode sombre (comme sur iPhone) */}
      <span style={{ background: '#fff' }} className={`block w-[27px] h-[27px] rounded-full shadow transition-transform duration-200 ${checked ? 'translate-x-5' : ''}`} />
    </button>
  </div>
);

// Ligne « libellé ……… champ » : le champ est aligné à droite, sans cadre (toute la ligne s'éclaire quand on écrit)
export const InputRow: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  suffix?: string;
  numeric?: boolean;
  maxLength?: number;
}> = ({ label, value, onChange, placeholder, suffix, numeric, maxLength }) => (
  <label className="flex items-center gap-3 px-4 min-h-[48px] cursor-text transition-colors focus-within:bg-slate-200/50">
    <span className="text-[15px] text-slate-900 shrink-0">{label}</span>
    <input
      inputMode={numeric ? 'decimal' : undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      className={`flex-1 min-w-0 bg-transparent text-right text-[15px] text-slate-900 outline-none field-plain placeholder:text-slate-400 ${numeric ? 'tabular-nums' : ''}`}
    />
    {suffix && <span className="text-[15px] text-slate-500 shrink-0">{suffix}</span>}
  </label>
);
