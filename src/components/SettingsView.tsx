import React, { useState } from 'react';
import { ChevronLeft, ChevronDown, Sun, Moon, SmartphoneIcon } from 'lucide-react';
import { Settings, Transaction, Wallet } from '../types';
import { Category } from '../data/categories';
import { Backup, ImportPlan } from '../lib/importExport';
import { DataSection } from './DataSection';
import { CurrencyPicker } from './CurrencyPicker';
import { currencyInfo } from '../data/currencies';
import { currenciesNeedingRate } from '../lib/money';
import { getThemePref, setThemePref, ThemePref } from '../lib/theme';
import { CustomIconsSection } from './CustomIconsSection';

interface SettingsViewProps {
  settings: Settings;
  wallets: Wallet[];
  transactions: Transaction[];
  categories: Category[];
  onImport: (plan: ImportPlan, replace: boolean) => void;
  onRestore: (backup: Backup) => void;
  onChange: (s: Settings) => void;
  onBack: () => void;
}

const Section: React.FC<{ title: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
  <div className="bg-white rounded-3xl border border-slate-100 p-5 mb-4">
    <h2 className="text-sm font-bold text-slate-900">{title}</h2>
    {hint && <p className="text-xs text-slate-400 mt-0.5 mb-3">{hint}</p>}
    {!hint && <div className="mb-3" />}
    {children}
  </div>
);

// Bouton qui déplie la liste de devises (évite deux longues listes à l'écran)
const Collapsible: React.FC<{ label: string; children: (close: () => void) => React.ReactNode }> = ({ label, children }) => {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full px-4 py-3 rounded-2xl bg-slate-100 text-sm font-semibold flex items-center justify-between cursor-pointer"
      >
        {label}
        <ChevronDown className={`w-4 h-4 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="mt-2">{children(() => setOpen(false))}</div>}
    </div>
  );
};

const label = (code: string | null) => {
  if (!code) return 'Aucune';
  const c = currencyInfo(code);
  return `${c.flag} ${c.code} · ${c.country}`;
};

const THEMES: { id: ThemePref; label: string; Icon: typeof Sun }[] = [
  { id: 'system', label: 'Système', Icon: SmartphoneIcon },
  { id: 'light', label: 'Clair', Icon: Sun },
  { id: 'dark', label: 'Sombre', Icon: Moon },
];

export const SettingsView: React.FC<SettingsViewProps> = ({ settings, wallets, transactions, categories, onImport, onRestore, onChange, onBack }) => {
  const [theme, setTheme] = useState(getThemePref);
  const needed = currenciesNeedingRate(wallets, settings);
  // Texte tapé dans les champs de taux (on garde le texte pour ne pas gêner la saisie)
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(settings.rates).map(([k, v]) => [k, String(v)]))
  );

  const setMain = (code: string) => {
    if (code === settings.mainCurrency) return;
    // Les taux sont relatifs à la devise principale : on les remet à zéro
    setDraft({});
    onChange({
      mainCurrency: code,
      secondCurrency: settings.secondCurrency === code ? null : settings.secondCurrency,
      rates: {},
    });
  };

  const setRate = (code: string, text: string) => {
    setDraft((d) => ({ ...d, [code]: text }));
    const n = parseFloat(text.replace(/\s/g, '').replace(',', '.'));
    const rates = { ...settings.rates };
    if (Number.isFinite(n) && n > 0) rates[code] = n;
    else delete rates[code];
    onChange({ ...settings, rates });
  };

  return (
    <div className="px-5 pt-4 pb-8 animate-screen">
      <div className="flex items-center gap-3 mb-5">
        <button onClick={onBack} aria-label="Retour" className="w-11 h-11 rounded-full bg-white border border-slate-100 flex items-center justify-center cursor-pointer">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-slate-900">Paramètres</h1>
      </div>

      <Section title="Mes données" hint="Importe ton historique (Money Lover, Excel…) ou exporte tout.">
        <DataSection
          wallets={wallets}
          transactions={transactions}
          categories={categories}
          settings={settings}
          onImport={onImport}
          onRestore={onRestore}
        />
      </Section>

      <Section title="Apparence" hint="« Système » suit le réglage clair / sombre de ton téléphone.">
        <div className="grid grid-cols-3 gap-1 p-1 rounded-2xl bg-slate-100">
          {THEMES.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => {
                setTheme(id);
                setThemePref(id);
              }}
              aria-pressed={theme === id}
              className={`py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                theme === id ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500'
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>
      </Section>

      <Section title="Devise principale" hint="Le solde de l'accueil est affiché dans cette devise.">
        <Collapsible label={label(settings.mainCurrency)}>
          {(close) => <CurrencyPicker value={settings.mainCurrency} onChange={(c) => { if (c) { setMain(c); close(); } }} />}
        </Collapsible>
        <p className="text-xs text-slate-400 mt-2">Changer de devise principale remet les taux de change à zéro.</p>
      </Section>

      <Section title="Deuxième devise (facultatif)" hint="Le total est aussi affiché dans cette devise, en plus petit.">
        <Collapsible label={label(settings.secondCurrency)}>
          {(close) => (
            <CurrencyPicker
              allowNone
              exclude={settings.mainCurrency}
              value={settings.secondCurrency}
              onChange={(c) => { onChange({ ...settings, secondCurrency: c }); close(); }}
            />
          )}
        </Collapsible>
      </Section>

      <Section title="Taux de change" hint={`Combien vaut 1 unité de chaque devise en ${settings.mainCurrency}. Tape le taux toi-même.`}>
        {needed.length === 0 ? (
          <p className="text-sm text-slate-400">Aucune autre devise n'est utilisée pour l'instant.</p>
        ) : (
          <div className="space-y-3">
            {needed.map((code) => {
              const missing = !settings.rates[code];
              return (
                <div key={code}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">
                      {currencyInfo(code).flag} 1 {code} =
                    </span>
                    <input
                      inputMode="decimal"
                      value={draft[code] ?? ''}
                      onChange={(e) => setRate(code, e.target.value)}
                      placeholder="Taux"
                      className={`flex-1 min-w-0 px-3 py-2.5 rounded-2xl bg-slate-100 text-sm tabular-nums outline-none focus:ring-2 focus:ring-[#D8FB52] ${missing ? 'ring-1 ring-amber-300' : ''}`}
                    />
                    <span className="text-sm font-semibold text-slate-500">{settings.mainCurrency}</span>
                  </div>
                  {missing && <p className="text-xs text-amber-600 mt-1">Taux manquant : cette devise est comptée 1 pour 1 en attendant.</p>}
                </div>
              );
            })}
          </div>
        )}
      </Section>
      <Section title="Mes icônes" hint="Crée tes propres icônes SVG pour tes catégories et portefeuilles.">
        <CustomIconsSection />
      </Section>
    </div>
  );
};
