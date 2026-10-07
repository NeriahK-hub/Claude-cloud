import React, { useMemo, useState } from 'react';
import { Search, Check } from 'lucide-react';
import { CURRENCIES } from '../data/currencies';

interface CurrencyPickerProps {
  value: string | null;
  onChange: (code: string | null) => void;
  allowNone?: boolean; // option "Aucune"
  exclude?: string; // devise à ne pas proposer
  searchable?: boolean;
}

// Liste de devises : drapeau + code + pays, avec recherche
export const CurrencyPicker: React.FC<CurrencyPickerProps> = ({ value, onChange, allowNone, exclude, searchable = true }) => {
  const [query, setQuery] = useState('');
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CURRENCIES.filter(
      (c) => c.code !== exclude && (!q || c.code.toLowerCase().includes(q) || c.country.toLowerCase().includes(q))
    );
  }, [query, exclude]);

  const row = (key: string, selected: boolean, onClick: () => void, left: React.ReactNode, label: string, sub?: string) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-3 py-2.5 text-left cursor-pointer transition ${selected ? 'bg-accent/15' : 'hover:bg-slate-50'}`}
    >
      <span className="w-7 text-xl text-center">{left}</span>
      <span className="flex-1 min-w-0">
        <span className="text-sm font-semibold text-slate-900">{label}</span>
        {sub && <span className="text-xs text-slate-400 ml-2">{sub}</span>}
      </span>
      {selected && (
        <span className="w-5 h-5 rounded-full bg-accent flex items-center justify-center">
          <Check className="w-3 h-3 stroke-[3]" />
        </span>
      )}
    </button>
  );

  return (
    <div>
      {searchable && (
        <div className="relative mb-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une devise ou un pays"
            className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-100 text-sm outline-none focus:ring-2 focus:ring-accent"
          />
        </div>
      )}
      <div className="max-h-56 overflow-y-auto rounded-2xl border border-slate-100 divide-y divide-slate-100">
        {allowNone && row('none', value === null, () => onChange(null), '🚫', 'Aucune')}
        {list.map((c) => row(c.code, value === c.code, () => onChange(c.code), c.flag, c.code, c.country))}
        {list.length === 0 && <p className="p-4 text-center text-sm text-slate-400">Aucune devise trouvée</p>}
      </div>
    </div>
  );
};
