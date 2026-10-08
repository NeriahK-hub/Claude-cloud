// Réglages de l'appareil gardés dans le compte (métadonnées de l'utilisateur Supabase) :
// affichage, thème, couleur, vibrations. Sur un nouveau téléphone (ou après une reconnexion),
// on les retrouve. Le plus récent gagne (ce téléphone ou le compte).
import type { SupabaseClient } from '@supabase/supabase-js';
import { DisplayPrefs, getPrefs, setPrefs } from '../display';
import { getThemePref, setThemePref, ThemePref } from '../theme';
import { getAccentId, setAccent } from '../accent';
import { hapticsEnabled, setHapticsEnabled } from '../haptics';
import { prefsChangedAt, setPrefsChangedAt, withoutStamp } from '../prefsStamp';

export interface CloudPrefs {
  at: number; // date du changement (ms)
  display: Omit<DisplayPrefs, 'hideBalance' | 'textSize'>; // solde masqué et taille du texte : propres à l'appareil
  theme: ThemePref;
  accent: string;
  haptics: boolean;
}

export function collectPrefs(): CloudPrefs {
  const { hideBalance: _h, textSize: _t, ...display } = getPrefs();
  return { at: prefsChangedAt() || Date.now(), display, theme: getThemePref(), accent: getAccentId(), haptics: hapticsEnabled() };
}

function applyPrefs(p: CloudPrefs) {
  withoutStamp(() => {
    if (p.display) setPrefs(p.display);
    if (p.theme && p.theme !== getThemePref()) setThemePref(p.theme);
    if (p.accent && p.accent !== getAccentId()) setAccent(p.accent);
    if (typeof p.haptics === 'boolean' && p.haptics !== hapticsEnabled()) setHapticsEnabled(p.haptics);
  });
  setPrefsChangedAt(p.at);
}

export async function pushPrefs(sb: SupabaseClient) {
  const { error } = await sb.auth.updateUser({ data: { prefs: collectPrefs() } });
  if (error) throw new Error(error.message);
}

// Compare avec le compte : reprend ses réglages s'ils sont plus récents, sinon envoie ceux d'ici
export async function reconcilePrefs(sb: SupabaseClient) {
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) return;
  const remote = data.user.user_metadata?.prefs as CloudPrefs | undefined;
  const localAt = prefsChangedAt();
  if (remote && typeof remote.at === 'number' && remote.at > localAt) applyPrefs(remote);
  else if (localAt && localAt > (remote?.at ?? 0)) await pushPrefs(sb);
}
