import React, { useMemo, useRef, useState } from 'react';
import { X, Plus, ChevronLeft, Check, Trash2, Zap } from 'lucide-react';
import { Category, categoriesFor } from '../data/categories';
import { Wallet } from '../types';
import { IconBadge, WalletChipIcon } from './AppIcon';
import { DateField, localDay } from './DatePicker';
import { SelCheck } from './SelCheck';
import { NoteHistoryItem, suggestNotes, UsualAmount } from '../lib/noteSuggestions';
import { formatMoney } from '../lib/money';
import { haptic } from '../lib/haptics';

// « Plusieurs dépenses » : on note d'un coup tout ce qu'on a dépensé aujourd'hui (ou un autre jour).
// Une ligne = une note, un montant, une catégorie. Les habitudes se rajoutent d'un toucher.

export interface BatchItem {
  amount: number;
  category: Category;
  note: string;
}

interface Row {
  key: number;
  note: string;
  amount: string;
  categoryId: string;
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const BatchAddSheet: React.FC<{
  categories: Category[];
  wallets: Wallet[]; // portefeuilles actifs
  defaultWalletId: string;
  noteHistory: NoteHistoryItem[];
  usualAmounts: Record<string, UsualAmount[]>;
  onClose: () => void;
  onSave: (items: BatchItem[], walletId: string, day: string) => void;
}> = ({ categories, wallets, defaultWalletId, noteHistory, usualAmounts, onClose, onSave }) => {
  const spendable = useMemo(() => wallets.filter((w) => (w.kind ?? 'basic') !== 'goal'), [wallets]);
  const expense = useMemo(() => categoriesFor('expense', categories).filter((c) => c.type !== 'debt'), [categories]);
  const [walletId, setWalletId] = useState(spendable.find((w) => w.id === defaultWalletId)?.id ?? spendable[0]?.id ?? '');
  const [day, setDay] = useState(localDay(new Date()));
  const seq = useRef(2);
  const [rows, setRows] = useState<Row[]>([
    { key: 0, note: '', amount: '', categoryId: '' },
    { key: 1, note: '', amount: '', categoryId: '' },
  ]);
  const [picking, setPicking] = useState<number | null>(null); // clé de la ligne dont on choisit la catégorie
  const [tried, setTried] = useState(false);
  const wallet = wallets.find((w) => w.id === walletId);
  const cur = wallet?.currency ?? '';

  const catOf = (id: string) => expense.find((c) => c.id === id);
  // La catégorie d'habitude d'une note déjà utilisée
  const guess = (note: string) => {
    const hit = noteHistory.find((h) => norm(h.text) === norm(note));
    if (!hit) return '';
    return Object.entries(hit.cats).filter(([id]) => catOf(id)).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
  };
  const parse = (a: string) => parseFloat(a.replace(/\s/g, '').replace(',', '.')) || 0;

  const patch = (key: number, changes: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...changes } : r)));
  const addRow = (init: Partial<Row> = {}) => {
    const key = seq.current++;
    setRows((rs) => {
      // une ligne vide en fin de liste est remplie plutôt que doublée
      const last = rs[rs.length - 1];
      if (last && !last.note && !last.amount && !last.categoryId && Object.keys(init).length) return [...rs.slice(0, -1), { ...last, ...init }, { key, note: '', amount: '', categoryId: '' }];
      return [...rs, { key, note: '', amount: '', categoryId: '', ...init }];
    });
    return key;
  };

  // Habitudes : les notes les plus utilisées, à ajouter d'un toucher
  const ideas = useMemo(() => suggestNotes(noteHistory, '', expense.map((c) => c.id), '', 8), [noteHistory, expense]);
  const addIdea = (x: NoteHistoryItem) => {
    haptic();
    const catId = Object.entries(x.cats).filter(([id]) => catOf(id)).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    const usual = catId ? usualAmounts[catId]?.find((u) => u.currency === cur) : undefined;
    addRow({ note: x.text, categoryId: catId, amount: usual ? String(usual.amount) : '' });
  };

  const filled = rows.filter((r) => r.note.trim() || parse(r.amount) > 0);
  const valid = filled.filter((r) => parse(r.amount) > 0 && catOf(r.categoryId || guess(r.note)));
  const incomplete = filled.length - valid.length;
  const total = valid.reduce((s, r) => s + parse(r.amount), 0);

  const save = () => {
    if (valid.length === 0 || incomplete > 0) {
      setTried(true);
      return;
    }
    onSave(
      valid.map((r) => ({ amount: parse(r.amount), category: catOf(r.categoryId || guess(r.note))!, note: r.note.trim() })),
      walletId,
      day
    );
  };

  // ---- Choix de la catégorie d'une ligne ----
  if (picking !== null) {
    const row = rows.find((r) => r.key === picking);
    const tops = expense.filter((c) => !c.parentId);
    const kids = (id: string) => expense.filter((c) => c.parentId === id);
    const tile = (c: Category) => {
      const on = (row?.categoryId || guess(row?.note ?? '')) === c.id;
      return (
        <button
          key={c.id}
          type="button"
          onClick={() => {
            patch(picking, { categoryId: c.id });
            setPicking(null);
          }}
          className={`relative min-w-0 min-h-[84px] flex flex-col items-center justify-center gap-1 px-1 py-2 rounded-2xl text-center transition active:scale-[0.95] cursor-pointer ${on ? 'is-selected' : 'bg-slate-100 hover:bg-slate-200/70'}`}
        >
          {on && <SelCheck />}
          <IconBadge icon={c.icon} image={c.image} color={c.color} size="md" />
          <span className="w-full text-[12px] font-bold text-slate-900 leading-tight line-clamp-2 hyphens-auto break-words" lang="fr">
            {c.name}
          </span>
        </button>
      );
    };
    const alone = tops.filter((t) => kids(t.id).length === 0);
    return (
      <Shell title="Catégorie" onClose={onClose} onBack={() => setPicking(null)}>
        {alone.length > 0 && <div className="grid grid-cols-3 gap-2 mb-5">{alone.map(tile)}</div>}
        {tops
          .filter((t) => kids(t.id).length > 0)
          .map((t) => (
            <section key={t.id} className="mb-5">
              <h4 className="text-[12px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 px-1">{t.name}</h4>
              <div className="grid grid-cols-3 gap-2">{[t, ...kids(t.id)].map(tile)}</div>
            </section>
          ))}
      </Shell>
    );
  }

  return (
    <Shell title="Plusieurs dépenses" onClose={onClose}>
      {/* Où et quand : valable pour toutes les lignes */}
      <div className="flex gap-2 mb-3">
        <div className="flex-1 min-w-0 flex gap-1.5 overflow-x-auto no-scrollbar">
          {spendable.map((w) => (
            <button
              key={w.id}
              onClick={() => setWalletId(w.id)}
              aria-pressed={w.id === walletId}
              className={`shrink-0 h-10 pl-1.5 pr-3 rounded-full flex items-center gap-1.5 text-[13px] font-semibold cursor-pointer transition ${w.id === walletId ? 'is-selected' : 'bg-slate-100 text-slate-600'}`}
            >
              <WalletChipIcon wallet={w} />
              <span className="max-w-[110px] truncate">{w.name}</span>
            </button>
          ))}
        </div>
      </div>
      <DateField value={day} onChange={setDay} shortcuts="past" label="Date des dépenses" className="mb-4" />

      {/* Habitudes en un toucher */}
      {ideas.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center gap-1 text-[12px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 px-1">
            <Zap className="w-3 h-3" /> Tes habitudes
          </div>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
            {ideas.map((x) => (
              <button
                key={x.text}
                onClick={() => addIdea(x)}
                className="shrink-0 max-w-[60%] h-8 px-3 rounded-full bg-white border border-slate-200 text-[13px] font-semibold text-slate-700 truncate cursor-pointer active:scale-95 transition"
              >
                + {x.text}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Les lignes */}
      <div className="rounded-2xl bg-slate-100 divide-y divide-slate-200/70 overflow-hidden">
        {rows.map((r, i) => {
          const c = catOf(r.categoryId || guess(r.note));
          const bad = tried && (r.note.trim() || parse(r.amount) > 0) && !(parse(r.amount) > 0 && c);
          return (
            <div key={r.key} className={`flex items-center gap-2 pl-2 pr-2 py-2 ${bad ? 'bg-amber-500/10' : ''}`}>
              <button
                onClick={() => setPicking(r.key)}
                aria-label={c ? `Catégorie : ${c.name}` : 'Choisir la catégorie'}
                className="shrink-0 cursor-pointer active:scale-90 transition"
              >
                {c ? (
                  <IconBadge icon={c.icon} image={c.image} color={c.color} size="sm" />
                ) : (
                  <span className={`w-9 h-9 rounded-full border-2 border-dashed flex items-center justify-center ${bad ? 'border-amber-500 text-amber-600' : 'border-slate-300 text-slate-400'}`}>
                    <Plus className="w-4 h-4" />
                  </span>
                )}
              </button>
              <input
                value={r.note}
                onChange={(e) => patch(r.key, { note: e.target.value })}
                placeholder={i === 0 ? 'Ex. Taxi' : 'Note'}
                aria-label={`Note, ligne ${i + 1}`}
                className="min-w-0 flex-1 bg-transparent text-[15px] text-slate-900 outline-none field-plain"
              />
              <input
                value={r.amount}
                onChange={(e) => patch(r.key, { amount: e.target.value.replace(/[^0-9.,]/g, '') })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && i === rows.length - 1) addRow();
                }}
                inputMode="decimal"
                placeholder="0"
                aria-label={`Montant, ligne ${i + 1}`}
                className="w-24 bg-transparent text-right text-[16px] font-bold tabular-nums text-slate-900 outline-none field-plain"
              />
              <span className="text-[12px] font-semibold text-slate-400 w-8 shrink-0">{cur}</span>
              {rows.length > 1 && (
                <button onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} aria-label="Retirer la ligne" className="w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-slate-400 cursor-pointer">
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      <button onClick={() => addRow()} className="mt-2 w-full h-11 rounded-2xl border border-dashed border-slate-300 text-[14px] font-semibold text-slate-600 flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.99] transition">
        <Plus className="w-4 h-4" /> Ajouter une ligne
      </button>
      {tried && incomplete > 0 && <p className="text-[13px] text-amber-600 mt-2 px-1">Il manque un montant ou une catégorie sur {incomplete > 1 ? `${incomplete} lignes` : 'une ligne'}.</p>}

      <button
        onClick={save}
        disabled={filled.length === 0}
        className="w-full mt-4 h-12 rounded-2xl bg-accent hover:bg-accent-hover disabled:bg-slate-100 disabled:text-slate-400 text-[15px] font-bold flex items-center justify-center gap-2 cursor-pointer disabled:cursor-default active:scale-[0.98] transition"
      >
        <Check className="w-4 h-4" />
        {valid.length === 0 ? 'Ajoute au moins une dépense' : `Enregistrer ${valid.length} dépense${valid.length > 1 ? 's' : ''} · −${formatMoney(total, cur)}`}
      </button>
    </Shell>
  );
};

// Fenêtre : même allure que les autres feuilles de l'app
const Shell: React.FC<{ title: string; onClose: () => void; onBack?: () => void; children: React.ReactNode }> = ({ title, onClose, onBack, children }) => (
  <div className="fixed inset-0 z-[60] bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={(e) => { e.stopPropagation(); onClose(); }}>
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="w-full sm:max-w-[460px] max-h-[94dvh] overflow-y-auto bg-white rounded-t-[32px] sm:rounded-[32px] px-5 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-slide-up"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="sheet-head flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2 min-w-0">
          {onBack && (
            <button onClick={onBack} aria-label="Retour" className="w-9 h-9 shrink-0 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
              <ChevronLeft className="w-4 h-4" />
            </button>
          )}
          <h2 className="text-[20px] font-bold tracking-tight text-slate-900 truncate">{title}</h2>
        </div>
        <button onClick={onClose} aria-label="Fermer" className="w-9 h-9 shrink-0 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>
      {children}
    </div>
  </div>
);
