// Cartes bancaires d'un portefeuille : seulement de quoi les reconnaître (voir 20261030000000_wallet_cards.sql)
import { BankCard } from '../types';

export const MAX_CARDS = 10;
export const NETWORKS: { id: BankCard['network']; label: string }[] = [
  { id: 'visa', label: 'Visa' },
  { id: 'mastercard', label: 'Mastercard' },
  { id: 'other', label: 'Autre' },
];

// Même forme et même ordre des clés partout : la synchro compare des empreintes (sinon elle renverrait en boucle)
export function cleanCards(list: unknown): BankCard[] {
  if (!Array.isArray(list)) return [];
  const out: BankCard[] = [];
  for (const c of list as Partial<BankCard>[]) {
    if (!c || typeof c !== 'object') continue;
    const last4 = String(c.last4 ?? '');
    const expires = String(c.expires ?? '');
    if (!/^\d{4}$/.test(last4) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(expires)) continue;
    const network = c.network === 'visa' || c.network === 'mastercard' ? c.network : 'other';
    const card: BankCard = { id: String(c.id ?? ''), label: String(c.label ?? '').slice(0, 40), network, last4, expires };
    const bank = String(c.bank ?? '').trim().slice(0, 40);
    if (bank) card.bank = bank;
    out.push(card);
    if (out.length >= MAX_CARDS) break;
  }
  return out;
}

// Un numéro de carte collé dans un texte (13 chiffres ou plus, espaces et tirets compris) : refusé
export const looksLikeCardNumber = (s: string) => /\d{13,}/.test(s.replace(/[\s-]/g, ''));

// Une carte vaut jusqu'à la fin de son mois d'expiration
export function cardStatus(c: BankCard, today = new Date()): 'ok' | 'soon' | 'expired' {
  const [y, m] = c.expires.split('-').map(Number);
  const end = new Date(y, m, 0, 23, 59, 59); // dernier jour du mois
  if (end < today) return 'expired';
  return end.getTime() - today.getTime() < 60 * 86400000 ? 'soon' : 'ok';
}

export const expiresLabel = (c: BankCard) => `${c.expires.slice(5)}/${c.expires.slice(2, 4)}`;
