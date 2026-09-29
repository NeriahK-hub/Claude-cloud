// Devises proposées dans les paramètres (code ISO 4217)
export interface CurrencyInfo {
  code: string;
  flag: string;
  country: string;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'CDF', flag: '🇨🇩', country: 'Congo RDC' },
  { code: 'USD', flag: '🇺🇸', country: 'États-Unis' },
  { code: 'EUR', flag: '🇪🇺', country: 'Zone euro' },
  { code: 'XAF', flag: '🇨🇲', country: 'Afrique centrale' },
  { code: 'XOF', flag: '🇸🇳', country: "Afrique de l'Ouest" },
  { code: 'ZAR', flag: '🇿🇦', country: 'Afrique du Sud' },
  { code: 'GBP', flag: '🇬🇧', country: 'Royaume-Uni' },
  { code: 'CAD', flag: '🇨🇦', country: 'Canada' },
  { code: 'CNY', flag: '🇨🇳', country: 'Chine' },
  { code: 'AOA', flag: '🇦🇴', country: 'Angola' },
  { code: 'RWF', flag: '🇷🇼', country: 'Rwanda' },
  { code: 'UGX', flag: '🇺🇬', country: 'Ouganda' },
  { code: 'KES', flag: '🇰🇪', country: 'Kenya' },
];

export const currencyInfo = (code: string): CurrencyInfo =>
  CURRENCIES.find((c) => c.code === code) ?? { code, flag: '🏳️', country: code };
