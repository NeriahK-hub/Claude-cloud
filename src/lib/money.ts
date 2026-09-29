import { Settings, Transaction, Wallet } from '../types';
import { DisplayPrefs, getPrefs, NUMBER_LOCALES } from './display';

const formatters = new Map<string, Intl.NumberFormat>();

// UNIQUE fonction d'affichage des montants de toute l'app (suit Paramètres › Affichage).
// `prefs` permet d'afficher un aperçu avec un autre réglage.
export function formatMoney(amount: number, currency: string, prefs: Pick<DisplayPrefs, 'number' | 'decimals'> = getPrefs()): string {
  const { number, decimals } = prefs;
  const locale = NUMBER_LOCALES[number];
  const digits = decimals === 'never' || (decimals === 'auto' && Math.abs(amount - Math.round(amount)) < 0.005) ? 0 : 2;
  const key = `${locale}|${currency}|${digits}`;
  try {
    let f = formatters.get(key);
    if (!f) {
      f = new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: digits, maximumFractionDigits: digits });
      formatters.set(key, f);
    }
    return f.format(amount);
  } catch {
    // code de devise inconnu
    return `${amount.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${currency}`;
  }
}

// Solde d'un portefeuille = solde de départ + somme de ses transactions
// Les transferts et ajustements déplacent ou corrigent de l'argent : ce ne sont pas des dépenses/revenus
export function countsInStats(t: Transaction): boolean {
  return t.type !== 'transfer' && t.type !== 'adjustment' && !t.excludeFromReport;
}

export function walletBalance(wallet: Wallet, transactions: Transaction[]): number {
  return transactions
    .filter((t) => t.walletId === wallet.id)
    .reduce((sum, t) => sum + t.amount, wallet.initialBalance);
}

// Taux : settings.rates[X] = combien de devise principale vaut 1 X (ex. 1 USD = 2850 CDF)
export function rateToMain(currency: string, settings: Settings): number | null {
  if (currency === settings.mainCurrency) return 1;
  const r = settings.rates[currency];
  return r && r > 0 ? r : null;
}

// Convertit un montant vers la devise principale (taux manquant : montant gardé tel quel)
export function toMain(amount: number, currency: string, settings: Settings): number {
  return amount * (rateToMain(currency, settings) ?? 1);
}

// Convertit un montant exprimé en devise principale vers la 2e devise
export function mainToSecond(amountMain: number, settings: Settings): number | null {
  if (!settings.secondCurrency) return null;
  const r = rateToMain(settings.secondCurrency, settings);
  return r ? amountMain / r : null;
}

// Devises utilisées (portefeuilles + 2e devise) qui ont besoin d'un taux
export function currenciesNeedingRate(wallets: Wallet[], settings: Settings): string[] {
  const set = new Set(wallets.map((w) => w.currency));
  if (settings.secondCurrency) set.add(settings.secondCurrency);
  set.delete(settings.mainCurrency);
  return [...set];
}

// Total des portefeuilles inclus (non archivés), en devise principale
export function totalInMain(wallets: Wallet[], transactions: Transaction[], settings: Settings): number {
  return wallets
    .filter((w) => w.includeInTotal && !w.archived)
    .reduce((s, w) => s + toMain(walletBalance(w, transactions), w.currency, settings), 0);
}

// ---------- Dates ----------
export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((start(new Date()) - start(d)) / 86400000);
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return 'Hier';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

// Ce qu'on affiche en gros sur l'accueil : le solde en devise principale (+ 2e devise en petit)
export interface BalanceInfo {
  main: number;
  mainCurrency: string;
  second: number | null;
  secondCurrency: string | null;
}

export function makeBalance(amountMain: number, settings: Settings): BalanceInfo {
  return {
    main: amountMain,
    mainCurrency: settings.mainCurrency,
    second: mainToSecond(amountMain, settings),
    secondCurrency: settings.secondCurrency,
  };
}

// Convertit entre deux devises via la devise principale (null si un taux manque)
export function convertBetween(amount: number, from: string, to: string, settings: Settings): number | null {
  if (from === to) return amount;
  const a = rateToMain(from, settings);
  const b = rateToMain(to, settings);
  return a && b ? (amount * a) / b : null;
}
