import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronDown, ChevronRight, Sun, Moon, SmartphoneIcon, Check, Palette, Bell, Lock, Coins, Database } from 'lucide-react';
import { useNotifyState } from '../lib/notify';
import { useLockConfig } from '../lib/lock';
import { useCustomIcons } from '../lib/customIcons';
import { formatMoney } from '../lib/money';
import { formatDate } from '../lib/display';
import { Budget, Ristourne, Settings, Transaction, Wallet } from '../types';
import { Category } from '../data/categories';
import { Backup, ImportPlan } from '../lib/importExport';
import { DataSection } from './DataSection';
import { CurrencyPicker } from './CurrencyPicker';
import { currencyInfo } from '../data/currencies';
import { currenciesNeedingRate } from '../lib/money';
import { getThemePref, setThemePref, ThemePref } from '../lib/theme';
import { CustomIconsSection } from './CustomIconsSection';
import { DisplaySettings } from './DisplaySettings';
import { NotificationsSettings } from './NotificationsSettings';
import { setAutoRates, useAutoRates } from '../lib/rates';
import { LockSettings } from './AppLock';
import { hapticsEnabled, setHapticsEnabled } from '../lib/haptics';
import { ACCENTS, accentVars, setAccent, useAccent } from '../lib/accent';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { InterfacePicker } from './InterfacePicker';
import { setPrefs, useDisplayPrefs } from '../lib/display';
import { HomeSettings } from './HomeSettings';
import { TrashSettings } from './TrashSettings';
import { useTrash } from '../lib/trash';
import { HOME_CARDS } from '../lib/homeLayout';

interface SettingsViewProps {
  settings: Settings;
  wallets: Wallet[];
  transactions: Transaction[];
  categories: Category[];
  budgets: Budget[];
  ristournes: Ristourne[];
  onImport: (plan: ImportPlan, replace: boolean) => void;
  onRestore: (backup: Backup) => void;
  onRestoreTrash: (id: string) => void;
  onChange: (s: Settings) => void;
  onBack: () => void;
}

// Un bloc de réglages (carte blanche), avec un petit titre et une explication facultatifs
const Block: React.FC<{ title?: string; hint?: string; children: React.ReactNode }> = ({ title, hint, children }) => (
  <div className="mb-4">
    {title && <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-400 px-4 mb-1.5">{title}</h3>}
    <div className="bg-white rounded-3xl border border-slate-100 p-4">{children}</div>
    {hint && <p className="text-[12px] text-slate-400 px-4 mt-1.5 leading-snug">{hint}</p>}
  </div>
);

type PanelId = 'appearance' | 'notifications' | 'lock' | 'currencies' | 'data';

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

export const SettingsView: React.FC<SettingsViewProps> = ({ settings, wallets, transactions, categories, budgets, ristournes, onImport, onRestore, onRestoreTrash, onChange, onBack }) => {
  const trashCount = useTrash().length;
  const desktop = useIsDesktop(); // ordinateur : pas de retour ni de titre en double, contenu sur plusieurs colonnes
  const [theme, setTheme] = useState(getThemePref);
  const [haptics, setHaptics] = useState(hapticsEnabled);
  const accent = useAccent();
  // Mode simple : les réglages techniques sont rangés sous « Réglages avancés »
  const prefs = useDisplayPrefs();
  const { simpleMode } = prefs;
  const [advanced, setAdvanced] = useState(false);
  const showAll = !simpleMode || advanced;
  const [panel, setPanel] = useState<PanelId | null>(null); // écran de réglage ouvert (null = la liste)
  const notify = useNotifyState();
  const lock = useLockConfig();
  const customIcons = useCustomIcons();
  // Chaque écran commence en haut
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [panel]);
  const needed = currenciesNeedingRate(wallets, settings);
  // Texte tapé dans les champs de taux (on garde le texte pour ne pas gêner la saisie)
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(settings.rates).map(([k, v]) => [k, String(v)]))
  );
  const autoRates = useAutoRates();
  // Taux automatiques : les champs montrent les taux reçus (virgule à la française)
  const ratesKey = JSON.stringify(settings.rates);
  useEffect(() => {
    if (autoRates.on) setDraft(Object.fromEntries(Object.entries(settings.rates).map(([k, v]) => [k, String(v).replace('.', ',')])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRates.on, ratesKey]);

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

  // ---------- Contenu de chaque écran de réglage (réutilisé tel quel) ----------
  const panels: Record<string, React.ReactNode> = {
    appearance: (
      <>
        <Block title="Interface">
          <InterfacePicker />
        </Block>
        <Block title="Couleur de l'app">
          <div className="grid grid-cols-4 gap-2">
            {ACCENTS.map((a) => {
              const on = a.id === accent.id;
              return (
                <button
                  key={a.id}
                  onClick={() => setAccent(a.id)}
                  aria-pressed={on}
                  className={`flex flex-col items-center gap-1.5 py-2.5 rounded-2xl cursor-pointer transition ${on ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
                >
                  <span className={`w-10 h-10 rounded-full flex items-center justify-center transition ${on ? 'ring-2 ring-offset-2 ring-slate-400 scale-105' : ''}`} style={{ backgroundColor: a.hex }}>
                    {on && <Check className="w-4 h-4" strokeWidth={3} style={{ color: accentVars(a.hex)['--on-accent'] }} />}
                  </span>
                  <span className={`text-[12px] leading-tight text-center ${on ? 'font-bold text-slate-900' : 'font-semibold text-slate-500'}`}>{a.name}</span>
                </button>
              );
            })}
          </div>
        </Block>
        <Block title="Thème" hint="« Système » suit le réglage clair / sombre de ton téléphone.">
          <div className="grid grid-cols-3 gap-2">
            {THEMES.map(({ id, label, Icon }) => {
              const on = theme === id;
              return (
                <button
                  key={id}
                  onClick={() => {
                    setTheme(id);
                    setThemePref(id);
                  }}
                  aria-pressed={on}
                  className={`relative rounded-2xl p-2 pb-2.5 flex flex-col items-center gap-2 cursor-pointer transition ${on ? 'bg-slate-100' : 'hover:bg-slate-50'}`}
                >
                  {/* Petit aperçu de l'écran */}
                  <span
                    className="w-full h-16 rounded-xl border overflow-hidden flex flex-col gap-1 p-1.5"
                    style={
                      id === 'dark'
                        ? { background: '#0f1218', borderColor: '#262b33' }
                        : id === 'light'
                          ? { background: '#f4f6f8', borderColor: '#e2e8f0' }
                          : { background: 'linear-gradient(90deg, #f4f6f8 50%, #0f1218 50%)', borderColor: '#94a3b8' }
                    }
                  >
                    <span className="h-1.5 w-1/2 rounded-full" style={{ background: id === 'dark' ? '#334155' : '#cbd5e1' }} />
                    <span className="h-4 rounded-md" style={{ background: id === 'dark' ? '#1e2530' : '#ffffff' }} />
                    <span className="h-1.5 w-2/3 rounded-full bg-accent" />
                  </span>
                  <span className={`text-[13px] flex items-center gap-1 ${on ? 'font-bold text-slate-900' : 'font-semibold text-slate-500'}`}>
                    <Icon className="w-3.5 h-3.5" /> {label}
                  </span>
                  {on && (
                    <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-accent text-on-accent flex items-center justify-center">
                      <Check className="w-3 h-3" strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </Block>
        <Block title="Confort">
          <div className="mb-3">
            <div className="text-sm font-semibold text-slate-800 mb-2">Taille du texte</div>
            <div role="radiogroup" aria-label="Taille du texte" className="flex gap-1 p-1 rounded-full bg-slate-100">
              {([
                ['normal', 'Normal', 'text-[13px]'],
                ['large', 'Grand', 'text-[15px]'],
                ['xlarge', 'Très grand', 'text-[17px]'],
              ] as const).map(([id, label, size]) => (
                <button
                  key={id}
                  role="radio"
                  aria-checked={prefs.textSize === id}
                  onClick={() => setPrefs({ textSize: id })}
                  className={`flex-1 min-w-0 h-10 rounded-full font-semibold cursor-pointer transition ${size} ${prefs.textSize === id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
                >
                  <span className="truncate">{label}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="divide-y divide-slate-100 -mx-1">
            {([
              ['Moins d\u2019animations', 'Les écrans s’ouvrent sans mouvement.', prefs.reduceMotion, (v: boolean) => setPrefs({ reduceMotion: v })],
              ['Masquer aussi les montants des opérations', 'Quand l’œil est fermé, la liste des opérations est masquée elle aussi.', prefs.hideAmounts, (v: boolean) => setPrefs({ hideAmounts: v })],
              ['Retour haptique', 'Petite vibration au toucher (iPhone avec iOS 18 ou plus récent, Android).', haptics, (v: boolean) => { setHaptics(v); setHapticsEnabled(v); }],
            ] as const).map(([title, hint, checked, set]) => (
              <label key={title} className="flex items-center justify-between gap-3 px-1 py-3 cursor-pointer">
                <span>
                  <span className="block text-sm font-semibold text-slate-800">{title}</span>
                  <span className="block text-xs text-slate-400">{hint}</span>
                </span>
                <input type="checkbox" role="switch" checked={checked} onChange={(e) => set(e.target.checked)} className="toggle shrink-0" />
              </label>
            ))}
          </div>
        </Block>
        <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-400 px-4 mb-1.5">Accueil</h3>
        <div className="mb-4">
          <HomeSettings />
        </div>
        <Block title="Formats" hint="Comment s’écrivent les montants, les dates et les mois.">
          <DisplaySettings currency={settings.mainCurrency} />
        </Block>
      </>
    ),
    _trash: <TrashSettings onRestore={onRestoreTrash} />,
    notifications: (
      <Block hint="Budget dépassé, tour de ristourne, remboursement à confirmer, invitation… Avec un compte connecté, elles arrivent même quand Wallo est fermé.">
        <NotificationsSettings />
      </Block>
    ),
    lock: (
      <Block hint="Un code (et Face ID ou l'empreinte si ton téléphone le permet) pour ouvrir Wallo.">
        <LockSettings />
      </Block>
    ),
    currencies: (
      <>
        <Block title="Devise principale" hint="Le solde de l'accueil est affiché dans cette devise. La changer remet les taux à zéro.">
          <Collapsible label={label(settings.mainCurrency)}>
            {(close) => (
              <CurrencyPicker
                value={settings.mainCurrency}
                onChange={(c) => {
                  if (c) {
                    setMain(c);
                    close();
                  }
                }}
              />
            )}
          </Collapsible>
        </Block>
        <Block title="Deuxième devise (facultatif)" hint="Le total est aussi affiché dans cette devise, en plus petit.">
          <Collapsible label={label(settings.secondCurrency)}>
            {(close) => (
              <CurrencyPicker
                allowNone
                exclude={settings.mainCurrency}
                value={settings.secondCurrency}
                onChange={(c) => {
                  onChange({ ...settings, secondCurrency: c });
                  close();
                }}
              />
            )}
          </Collapsible>
        </Block>
      </>
    ),
    _rates: (
      <Block hint={`Combien vaut 1 unité de chaque devise en ${settings.mainCurrency}.`}>
        {needed.length > 0 && (
          <label className="flex items-center justify-between gap-3 mb-4 cursor-pointer">
            <span>
              <span className="block text-sm font-semibold text-slate-800">Taux du marché, automatique</span>
              <span className="block text-xs text-slate-400">
                {autoRates.on
                  ? autoRates.at
                    ? `Mis à jour ${new Date(autoRates.at).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · source ExchangeRate-API`
                    : 'Mise à jour dès que tu es en ligne…'
                  : 'Sinon, tape ton propre taux (celui de ton cambiste par exemple).'}
              </span>
            </span>
            <input type="checkbox" role="switch" checked={autoRates.on} onChange={(e) => setAutoRates(e.target.checked)} className="toggle shrink-0" />
          </label>
        )}
        {needed.length === 0 ? (
          <p className="text-sm text-slate-400">Aucune autre devise n&rsquo;est utilisée pour l&rsquo;instant.</p>
        ) : (
          <div className="space-y-3">
            {needed.map((code) => {
              const missing = !settings.rates[code];
              return (
                <div key={code}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">1 {code} =</span>
                    <input
                      inputMode="decimal"
                      value={draft[code] ?? ''}
                      onChange={(e) => {
                        if (autoRates.on) setAutoRates(false); // taux tapé à la main : on arrête de le remplacer
                        setRate(code, e.target.value);
                      }}
                      placeholder="Taux"
                      className={`flex-1 min-w-0 px-3 py-2.5 rounded-2xl bg-slate-100 text-sm tabular-nums outline-none focus:ring-2 focus:ring-accent ${missing ? 'ring-1 ring-amber-300' : ''}`}
                    />
                    <span className="text-sm font-semibold text-slate-500">{settings.mainCurrency}</span>
                  </div>
                  {missing && <p className="text-xs text-amber-600 mt-1">Taux manquant : cette devise est comptée 1 pour 1 en attendant.</p>}
                </div>
              );
            })}
          </div>
        )}
      </Block>
    ),
    data: (
      <Block hint="Importe ton historique (Money Lover, Excel…) ou exporte tout.">
        <DataSection wallets={wallets} transactions={transactions} categories={categories} budgets={budgets} ristournes={ristournes} settings={settings} onImport={onImport} onRestore={onRestore} />
      </Block>
    ),
    _icons: (
      <Block hint="Ajoute tes propres icônes (SVG, PNG ou JPG) pour tes catégories et portefeuilles.">
        <CustomIconsSection />
      </Block>
    ),
  };

  // Réglages regroupés : « Devises et taux », « Mes données » (sauvegarde, corbeille, icônes)
  const sectionTitle = (t: string) => <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-400 px-4 mb-1.5 mt-2">{t}</h3>;
  panels.currencies = (
    <>
      {panels.currencies}
      {sectionTitle('Taux de change')}
      {panels._rates}
    </>
  );
  panels.data = (
    <>
      {sectionTitle('Importer et sauvegarder')}
      {panels.data}
      {sectionTitle('Corbeille')}
      {panels._trash}
      <div className="mt-4">{sectionTitle('Mes icônes')}</div>
      {panels._icons}
    </>
  );

  // ---------- Les lignes de la page principale, avec leur valeur actuelle ----------
  const themeName = THEMES.find((t) => t.id === theme)?.label ?? '';
  const firstRate = needed[0];
  const rateText = autoRates.on
    ? 'Automatique'
    : needed.length === 0
      ? 'Aucune autre devise'
      : settings.rates[firstRate]
        ? // Dans le sens qui se lit bien : « 1 USD = 2 304 CDF » plutôt que « 1 CDF = 0,0004 USD »
          settings.rates[firstRate] >= 1
          ? `1 ${firstRate} = ${Math.round(settings.rates[firstRate]).toLocaleString('fr-FR')} ${settings.mainCurrency}`
          : `1 ${settings.mainCurrency} = ${Math.round(1 / settings.rates[firstRate]).toLocaleString('fr-FR')} ${firstRate}`
        : 'Taux à ajouter';
  const rows: { id: PanelId; title: string; value: string; Icon: typeof Sun; color: string; advanced?: boolean; alert?: boolean }[] = [
    { id: 'appearance', title: 'Apparence', value: `${themeName} · ${accent.name} · ${HOME_CARDS.length - prefs.homeHidden.length} cartes à l’accueil`, Icon: Palette, color: '#A855F7' },
    { id: 'notifications', title: 'Notifications', value: notify === 'on' ? 'Activées' : notify === 'denied' ? 'Bloquées' : notify === 'off' ? 'Coupées' : 'À activer', Icon: Bell, color: '#EF4444' },
    { id: 'lock', title: 'Verrouillage', value: lock ? 'Code activé' : 'Désactivé', Icon: Lock, color: '#10B981' },
    // Devises et taux : l'alerte reste visible (même en interface simple) tant qu'un taux manque
    { id: 'currencies', title: 'Devises et taux', value: `${settings.secondCurrency ? `${settings.mainCurrency} · ${settings.secondCurrency}` : settings.mainCurrency} · ${rateText}`, Icon: Coins, color: '#F59E0B', alert: needed.some((c) => !settings.rates[c]) },
    { id: 'data', title: 'Mes données', value: trashCount ? `Sauvegarde, icônes · ${trashCount} dans la corbeille` : customIcons.length ? `Sauvegarde, corbeille · ${customIcons.length} icône${customIcons.length > 1 ? 's' : ''}` : 'Importer, exporter, corbeille, icônes', Icon: Database, color: '#0EA5E9', advanced: true },
  ];
  const visible = rows.filter((r) => showAll || !r.advanced);
  const groups: { title: string; ids: PanelId[] }[] = [
    { title: 'Général', ids: ['appearance', 'notifications', 'lock'] },
    { title: 'Argent et données', ids: ['currencies', 'data'] },
  ];
  const current = rows.find((r) => r.id === (desktop ? (panel ?? 'appearance') : panel));

  const list = (
    <div>
      {/* « Ton Wallo » : un résumé du look, en couleur */}
      <div className="relative overflow-hidden rounded-[28px] p-4 mb-5 flex items-center gap-3.5" style={{ background: `linear-gradient(135deg, ${accent.hex}33, ${accent.hex}0d)` }}>
        <span className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-xs" style={{ background: accent.hex }}>
          <img src="/icons/wallo.svg" alt="" className="w-10 h-10" />
        </span>
        <span className="flex-1 min-w-0">
          <span className="block text-[17px] font-bold text-slate-900">Ton Wallo</span>
          <span className="block text-[13px] text-slate-500 leading-snug">
            {themeName} · {accent.name} · {simpleMode ? 'Mode simple' : 'Interface complète'}
          </span>
        </span>
      </div>

      {groups.map((g) => {
        const items = g.ids.map((id) => visible.find((r) => r.id === id)).filter(Boolean) as typeof rows;
        if (!items.length) return null;
        return (
          <div key={g.title} className="mb-5">
            <h2 className="text-[12px] font-semibold uppercase tracking-wider text-slate-400 px-4 mb-1.5">{g.title}</h2>
            <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden divide-y divide-slate-100">
              {items.map((r) => {
                const on = desktop && current?.id === r.id;
                return (
                  <button
                    key={r.id}
                    onClick={() => setPanel(r.id)}
                    aria-current={on ? 'page' : undefined}
                    className={`w-full flex items-center gap-3 pl-3.5 pr-3 py-3 text-left cursor-pointer transition-colors ${on ? 'bg-slate-100' : 'hover:bg-slate-50 active:bg-slate-100'}`}
                  >
                    <span className="w-9 h-9 rounded-[11px] flex items-center justify-center shrink-0" style={{ background: r.color }}>
                      <r.Icon className="w-[18px] h-[18px]" style={{ color: '#fff' }} strokeWidth={2.2} />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[15px] font-semibold text-slate-900">{r.title}</span>
                      <span className={`block text-[12px] truncate ${r.alert ? 'text-amber-600 font-semibold' : 'text-slate-500'}`}>{r.value}</span>
                    </span>
                    {r.alert && <span className="w-2 h-2 rounded-full bg-amber-500 shrink-0" />}
                    <ChevronRight className="w-4 h-4 text-slate-300 shrink-0" />
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {simpleMode && (
        <button
          onClick={() => setAdvanced((a) => !a)}
          aria-expanded={advanced}
          className="w-full py-3.5 rounded-2xl bg-white border border-slate-100 text-[14px] font-semibold text-slate-600 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] transition"
        >
          {advanced ? 'Cacher les réglages avancés' : 'Voir les réglages avancés'}
          <ChevronDown className={`w-4 h-4 transition-transform duration-300 ${advanced ? 'rotate-180' : ''}`} />
        </button>
      )}
      <p className="text-center text-[12px] text-slate-400 mt-5">Wallo · Ton argent, en clair</p>
    </div>
  );

  // Écran de détail : grande icône, titre, puis le réglage
  const detail = current && (
    <div key={current.id} className={desktop ? 'animate-fade-in' : 'animate-pick-in'}>
      <div className="flex flex-col items-center text-center mb-5 mt-1">
        <span className="w-16 h-16 rounded-[20px] flex items-center justify-center shadow-xs" style={{ background: current.color }}>
          <current.Icon className="w-8 h-8" style={{ color: '#fff' }} strokeWidth={2} />
        </span>
        <h2 className="text-[22px] font-bold tracking-tight text-slate-900 mt-3">{current.title}</h2>
      </div>
      {panels[current.id]}
    </div>
  );

  // Ordinateur : la liste à gauche, le réglage à droite
  if (desktop) {
    return (
      <div className="max-w-6xl animate-screen">
        <div className="desk-head flex items-center gap-3 mb-5">
          <h1 className="text-xl font-bold text-slate-900">Paramètres</h1>
        </div>
        <div className="grid grid-cols-[340px_minmax(0,1fr)] gap-6 items-start">
          <div className="sticky top-4">{list}</div>
          <div className="max-w-2xl">{detail}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-5 pt-4 pb-8 animate-screen">
      <div className="page-head flex items-center gap-3 mb-5">
        <button
          onClick={() => (panel ? setPanel(null) : onBack())}
          aria-label="Retour"
          className="w-11 h-11 rounded-full bg-white border border-slate-100 flex items-center justify-center cursor-pointer"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-bold text-slate-900">{panel ? 'Paramètres' : 'Paramètres'}</h1>
      </div>
      {panel ? detail : <div className="animate-pick-back">{list}</div>}
    </div>
  );
};
