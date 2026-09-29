import React, { useMemo, useRef, useState } from 'react';
import { Upload, FileSpreadsheet, DatabaseBackup, X, AlertTriangle, Loader2 } from 'lucide-react';
import { Budget, Settings, Transaction, Wallet } from '../types';
import { Category } from '../data/categories';
import { Backup, exportBackup, exportExcel, ImportPlan, planImport, readBackup, readImportFile, ReadResult } from '../lib/importExport';

interface DataSectionProps {
  wallets: Wallet[];
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  settings: Settings;
  onImport: (plan: ImportPlan, replace: boolean) => void;
  onRestore: (backup: Backup) => void;
}

const fmtDate = (d: Date | null) => (d ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');

// Paramètres > Mes données : importer (Money Lover, Excel, CSV, sauvegarde) et exporter
export const DataSection: React.FC<DataSectionProps> = ({ wallets, transactions, categories, budgets, settings, onImport, onRestore }) => {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<'read' | 'excel' | null>(null);
  const [error, setError] = useState('');
  const [read, setRead] = useState<{ result: ReadResult; fileName: string } | null>(null);
  const [replace, setReplace] = useState(false);
  const [backup, setBackup] = useState<Backup | null>(null);
  const plan = useMemo(
    () => (read ? planImport(read.result, { wallets, categories, transactions, settings }, replace) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [read, replace]
  );

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setBusy('read');
    try {
      if (file.name.toLowerCase().endsWith('.json')) setBackup(await readBackup(file));
      else {
        const result = await readImportFile(file);
        if (result.rows.length === 0) throw new Error('Aucune transaction lisible dans ce fichier.');
        setReplace(false);
        setRead({ result, fileName: file.name });
      }
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : "Ce fichier n'a pas pu être lu. Utilise un fichier .xlsx, .csv ou une sauvegarde .json.");
    } finally {
      setBusy(null);
    }
  };

  const onExcel = async () => {
    setBusy('excel');
    try {
      await exportExcel({ wallets, transactions, settings });
    } finally {
      setBusy(null);
    }
  };

  const btn = 'w-full px-4 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-sm font-semibold flex items-center gap-3 cursor-pointer disabled:opacity-50 text-left';

  return (
    <>
      <input ref={input} type="file" accept=".xlsx,.csv,.json,.txt" onChange={onPick} className="hidden" />
      <div className="space-y-2">
        <button onClick={() => input.current?.click()} disabled={!!busy} className={`${btn} !bg-[#D8FB52] text-slate-900`}>
          {busy === 'read' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5" />}
          <span className="flex-1">
            Importer un fichier
            <span className="block text-xs font-medium opacity-70">Money Lover, Excel (.xlsx), CSV ou sauvegarde</span>
          </span>
        </button>
        <button onClick={onExcel} disabled={!!busy || transactions.length === 0} className={btn}>
          {busy === 'excel' ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileSpreadsheet className="w-5 h-5 text-emerald-600" />}
          <span className="flex-1">
            Exporter en Excel
            <span className="block text-xs font-medium text-slate-500">{transactions.length} transactions, format Money Lover</span>
          </span>
        </button>
        <button onClick={() => exportBackup({ wallets, transactions, categories, settings, budgets })} disabled={!!busy} className={btn}>
          <DatabaseBackup className="w-5 h-5 text-indigo-600" />
          <span className="flex-1">
            Sauvegarde complète (.json)
            <span className="block text-xs font-medium text-slate-500">Tout, pour restaurer sur un autre appareil</span>
          </span>
        </button>
      </div>
      {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

      {read && plan && (
        <Sheet title="Vérifie avant d'importer" onClose={() => setRead(null)}>
          <p className="text-xs text-slate-500 mb-3 truncate">{read.fileName}</p>
          <div className="grid grid-cols-2 gap-2 mb-3">
            <Stat label="Transactions à ajouter" value={String(plan.transactions.length)} />
            <Stat label="Période" value={`${fmtDate(plan.from)} → ${fmtDate(plan.to)}`} small />
            <Stat label="Nouvelles catégories" value={String(plan.newCategories.length)} />
            <Stat label="Transferts / ajustements" value={`${plan.transfers} / ${plan.adjustments}`} />
          </div>

          <div className="text-xs font-bold text-slate-500 mb-1.5">Portefeuilles</div>
          <div className="rounded-2xl border border-slate-100 divide-y divide-slate-100 mb-3 max-h-40 overflow-y-auto">
            {plan.walletSummary.map((w) => (
              <div key={w.name} className="flex items-center gap-2 px-3 py-2 text-sm">
                <span className="flex-1 truncate font-semibold text-slate-800">{w.name}</span>
                <span className="text-xs text-slate-400">{w.currency} · {w.count}</span>
                {w.isNew && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[#D8FB52] text-slate-900">NOUVEAU</span>}
              </div>
            ))}
          </div>

          {plan.nested > 0 && (
            <Note>
              {plan.nested} sous-catégories rangées sous leur catégorie parente (retrouvées grâce aux totaux Money Lover)
              {plan.categoryUpdates.length > 0 ? `, dont ${plan.categoryUpdates.length} déjà dans l'app` : ''}.
            </Note>
          )}
          {plan.duplicates > 0 && <Note>{plan.duplicates} transactions déjà présentes dans l'app seront ignorées (pas de doublons).</Note>}
          {plan.invalid.length > 0 && (
            <Note warn>
              {plan.invalid.length} ligne{plan.invalid.length > 1 ? 's' : ''} illisible{plan.invalid.length > 1 ? 's' : ''} ignorée{plan.invalid.length > 1 ? 's' : ''} (ligne {plan.invalid.slice(0, 5).join(', ')}
              {plan.invalid.length > 5 ? '…' : ''}).
            </Note>
          )}
          {plan.missingRates.length > 0 && (
            <Note warn>
              Taux de change manquant pour {plan.missingRates.join(', ')} : ajoute-le dans Paramètres › Taux de change, sinon le total compte ces montants 1 pour 1.
            </Note>
          )}
          <Note>Les soldes sont calculés à partir des transactions du fichier. S'il ne commence pas au tout début, ajuste ensuite le solde de chaque portefeuille.</Note>

          <label className="flex items-start gap-2.5 mt-3 p-3 rounded-2xl bg-slate-100 cursor-pointer">
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="mt-0.5 w-4 h-4 accent-slate-900" />
            <span className="text-sm">
              <span className="font-semibold">Effacer mes transactions actuelles</span>
              <span className="block text-xs text-slate-500">Les {transactions.length} transactions déjà dans l'app seront remplacées par celles du fichier.</span>
            </span>
          </label>

          <div className="flex gap-2 mt-4">
            <button onClick={() => setRead(null)} className="flex-1 py-3 rounded-2xl bg-slate-100 text-sm font-bold cursor-pointer">
              Annuler
            </button>
            <button
              disabled={plan.transactions.length === 0 && plan.categoryUpdates.length === 0}
              onClick={() => {
                onImport(plan, replace);
                setRead(null);
              }}
              className="flex-[2] py-3 rounded-2xl bg-[#D8FB52] text-slate-900 text-sm font-bold cursor-pointer disabled:opacity-40"
            >
              {plan.transactions.length > 0 || plan.categoryUpdates.length === 0
                ? `Importer ${plan.transactions.length} transactions`
                : `Ranger ${plan.categoryUpdates.length} catégories`}
            </button>
          </div>
        </Sheet>
      )}

      {backup && (
        <Sheet title="Restaurer la sauvegarde ?" onClose={() => setBackup(null)}>
          <p className="text-sm text-slate-600 mb-3">
            Sauvegarde du {fmtDate(new Date(backup.exportedAt))} : {backup.wallets.length} portefeuilles, {backup.transactions.length} transactions,{' '}
            {backup.categories.length} catégories{backup.budgets?.length ? `, ${backup.budgets.length} budgets` : ''}.
          </p>
          <Note warn>Toutes tes données actuelles (portefeuilles, transactions, catégories, réglages) seront remplacées.</Note>
          <div className="flex gap-2 mt-4">
            <button onClick={() => setBackup(null)} className="flex-1 py-3 rounded-2xl bg-slate-100 text-sm font-bold cursor-pointer">
              Annuler
            </button>
            <button
              onClick={() => {
                onRestore(backup);
                setBackup(null);
              }}
              className="flex-[2] py-3 rounded-2xl bg-slate-900 text-white text-sm font-bold cursor-pointer"
            >
              Tout remplacer
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
};

const Stat: React.FC<{ label: string; value: string; small?: boolean }> = ({ label, value, small }) => (
  <div className="p-3 rounded-2xl bg-slate-100">
    <div className="text-[11px] font-semibold text-slate-500">{label}</div>
    <div className={`font-bold tabular-nums text-slate-900 ${small ? 'text-xs mt-0.5' : 'text-lg'}`}>{value}</div>
  </div>
);

const Note: React.FC<{ warn?: boolean; children: React.ReactNode }> = ({ warn, children }) => (
  <p className={`flex gap-1.5 text-xs mb-1.5 ${warn ? 'text-amber-700' : 'text-slate-500'}`}>
    {warn && <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />}
    <span>{children}</span>
  </p>
);

const Sheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
    <div
      className="w-full sm:max-w-[420px] max-h-[92dvh] overflow-y-auto bg-white rounded-t-[28px] sm:rounded-[28px] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-slide-up"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-base font-bold">{title}</h2>
        <button onClick={onClose} aria-label="Fermer" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>
      {children}
    </div>
  </div>
);
