// Invitation dans un portefeuille partagé par lien : https://…/r/K7P4QX9M
// Le code ouvert par un lien est gardé ici le temps de se connecter (même après un aller-retour chez Google).

const KEY = 'ap.invite';

export const cleanCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');
// K7P4QX9M -> K7P4-QX9M (plus facile à lire et à dicter)
export const formatCode = (code: string) => {
  const c = cleanCode(code);
  return c.length > 4 ? `${c.slice(0, 4)}-${c.slice(4)}` : c;
};
export const inviteUrl = (code: string) => `${window.location.origin}/r/${cleanCode(code)}`;

// Au démarrage : un lien d'invitation ouvert (ou une invitation pas encore finie)
export function takeInviteFromUrl(): string | null {
  const m = window.location.pathname.match(/^\/r\/([A-Za-z0-9-]{4,20})\/?$/);
  if (m) {
    const code = cleanCode(m[1]);
    try {
      localStorage.setItem(KEY, code);
    } catch {
      // stockage bloqué : l'invitation marche pour cette ouverture seulement
    }
    window.history.replaceState(null, '', '/');
    return code;
  }
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearPendingInvite() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // rien à effacer
  }
}

// Menu de partage du téléphone (WhatsApp, SMS…), sinon lien copié
export async function shareInvite(walletName: string, code: string): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  const url = inviteUrl(code);
  const text = `Rejoins mon portefeuille « ${walletName} » sur Wallo (code ${formatCode(code)}) :`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Wallo', text, url });
      return 'shared';
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'cancelled';
      // partage impossible ici : on copie
    }
  }
  return (await copyText(`${text} ${url}`)) ? 'copied' : 'failed';
}

// Partager l'app elle-même (bouton « Partager Wallo » du Profil)
export const APP_URL = 'https://wallo-b13b0.web.app';
export const APP_PITCH = [
  'Je gère mon argent avec Wallo 💸',
  '',
  '• Tous tes portefeuilles au même endroit : cash, Mobile Money, banque, carte',
  '• Dépenses et revenus en $ et en FC, avec le taux que tu choisis',
  '• Budgets, dettes et prêts, ristournes (tontines)',
  '• Portefeuilles partagés avec ta famille',
  '• Gratuit, marche même sans internet',
  '',
  `Essaie-la : ${APP_URL}`,
].join('\n');

export async function shareApp(): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  if (navigator.share) {
    try {
      // Le lien est DANS le texte (pas de champ url à part) : sinon WhatsApp, Messages…
      // sur iPhone ne gardent que le lien et la description disparaît
      await navigator.share({ title: 'Wallo', text: APP_PITCH });
      return 'shared';
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'cancelled';
    }
  }
  return (await copyText(APP_PITCH)) ? 'copied' : 'failed';
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

// ---------- Ristournes : lien https://…/t/K7P4QX9M (t comme tontine) ----------
const R_KEY = 'ap.inviteRistourne';
export const ristourneInviteUrl = (code: string) => `${window.location.origin}/t/${cleanCode(code)}`;

export function takeRistourneInviteFromUrl(): string | null {
  const m = window.location.pathname.match(/^\/t\/([A-Za-z0-9-]{4,20})\/?$/);
  if (m) {
    const code = cleanCode(m[1]);
    try {
      localStorage.setItem(R_KEY, code);
    } catch {
      // stockage bloqué : l'invitation marche pour cette ouverture seulement
    }
    window.history.replaceState(null, '', '/');
    return code;
  }
  try {
    return localStorage.getItem(R_KEY);
  } catch {
    return null;
  }
}

export function clearPendingRistourneInvite() {
  try {
    localStorage.removeItem(R_KEY);
  } catch {
    // rien à effacer
  }
}

export async function shareRistourneInvite(name: string, code: string): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  const url = ristourneInviteUrl(code);
  const text = `Rejoins la ristourne « ${name} » sur Wallo (code ${formatCode(code)}) : ${url}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Wallo', text });
      return 'shared';
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'cancelled';
    }
  }
  return (await copyText(text)) ? 'copied' : 'failed';
}

// ---------- Dettes partagées : lien https://…/d/K7P4QX9M (d comme dette) ----------
const D_KEY = 'ap.inviteDebt';
export const debtInviteUrl = (code: string) => `${window.location.origin}/d/${cleanCode(code)}`;

export function takeDebtInviteFromUrl(): string | null {
  const m = window.location.pathname.match(/^\/d\/([A-Za-z0-9-]{4,20})\/?$/);
  if (m) {
    const code = cleanCode(m[1]);
    try {
      localStorage.setItem(D_KEY, code);
    } catch {
      // stockage bloqué : l'invitation marche pour cette ouverture seulement
    }
    window.history.replaceState(null, '', '/');
    return code;
  }
  try {
    return localStorage.getItem(D_KEY);
  } catch {
    return null;
  }
}

export function clearPendingDebtInvite() {
  try {
    localStorage.removeItem(D_KEY);
  } catch {
    // rien à effacer
  }
}

// side : MON côté (receivable = il/elle me doit)
export async function shareDebtInvite(side: 'receivable' | 'payable', amount: string, code: string): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  const url = debtInviteUrl(code);
  const what = side === 'receivable' ? `Tu me dois ${amount}` : `Je te dois ${amount}`;
  const text = `${what}. Suis cette dette avec moi sur Wallo : chaque remboursement est confirmé par nous deux (code ${formatCode(code)}) : ${url}`;
  if (navigator.share) {
    try {
      await navigator.share({ title: 'Wallo', text });
      return 'shared';
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return 'cancelled';
    }
  }
  return (await copyText(text)) ? 'copied' : 'failed';
}

// ---------- Code QR scanné DANS l'app ----------
// Un lien ouvert depuis WhatsApp part dans le navigateur, pas dans l'app installée (où la personne
// est déjà connectée). Scanner le QR depuis Wallo évite ce détour : on lit le lien et on ouvre l'invitation ici.
export type InviteKind = 'wallet' | 'ristourne' | 'debt';
const KIND_OF: Record<string, InviteKind> = { r: 'wallet', t: 'ristourne', d: 'debt' };

export function parseInvite(text: string): { kind: InviteKind; code: string } | null {
  const t = text.trim();
  // Lien Wallo : https://…/r/CODE, /t/CODE, /d/CODE
  const m = t.match(/\/([rtd])\/([A-Za-z0-9-]{4,20})\/?(?:[?#].*)?$/);
  if (m) return { kind: KIND_OF[m[1]], code: cleanCode(m[2]) };
  return null;
}

export const qrUrl = (kind: InviteKind, code: string) => (kind === 'wallet' ? inviteUrl(code) : kind === 'ristourne' ? ristourneInviteUrl(code) : debtInviteUrl(code));
