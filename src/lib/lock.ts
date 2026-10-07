// Verrouillage de l'app : code à 4 chiffres, et Face ID / empreinte en option
// • Le code n'est jamais gardé tel quel : seulement son empreinte (PBKDF2, avec un sel propre à l'appareil).
// • Face ID / empreinte : une « clé d'accès » de l'appareil (WebAuthn). Le téléphone vérifie le visage
//   ou le doigt lui-même ; Wallo ne voit qu'un « oui ». Le code reste toujours possible.
// • C'est une protection de l'écran (quelqu'un qui prend le téléphone), pas un chiffrement des données.
import { useSyncExternalStore } from 'react';

const KEY = 'ap.lock';
export const PIN_LENGTH = 4;

export interface LockConfig {
  salt: string;
  hash: string;
  bio?: string; // identifiant de la clé d'accès (base64url)
  delay: number; // secondes hors de l'app avant de redemander le code (0 = à chaque fois)
}

const read = (): LockConfig | null => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
};
let config = typeof window === 'undefined' ? null : read();
const listeners = new Set<() => void>();
const save = (next: LockConfig | null) => {
  config = next;
  try {
    if (next) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    // stockage bloqué : le verrou dure le temps de la session
  }
  listeners.forEach((l) => l());
};

export function useLockConfig(): LockConfig | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => config,
    () => null,
  );
}
export const lockEnabled = () => !!config;

// ---------- Code ----------

const b64 = (bytes: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
const random = (n: number) => crypto.getRandomValues(new Uint8Array(n));

async function digest(pin: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unb64(salt), iterations: 150_000 }, key, 256);
  return b64(bits);
}

export async function setPin(pin: string) {
  const salt = b64(random(16));
  save({ delay: 60, ...config, salt, hash: await digest(pin, salt) });
}

export async function checkPin(pin: string) {
  if (!config) return true;
  return (await digest(pin, config.salt)) === config.hash;
}

export const setLockDelay = (delay: number) => config && save({ ...config, delay });
export const disableLock = () => save(null);

// ---------- Face ID / empreinte ----------

export async function bioAvailable(): Promise<boolean> {
  try {
    return !!window.PublicKeyCredential && (await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
  } catch {
    return false;
  }
}

export async function enableBio(): Promise<boolean> {
  if (!config) return false;
  try {
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: random(32),
        rp: { name: 'Wallo', id: location.hostname },
        user: { id: random(16), name: 'Wallo', displayName: 'Déverrouiller Wallo' },
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },
          { type: 'public-key', alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required', residentKey: 'discouraged' },
        timeout: 60_000,
      },
    })) as PublicKeyCredential | null;
    if (!cred) return false;
    save({ ...config, bio: b64(cred.rawId) });
    return true;
  } catch {
    return false; // annulé, ou pas de capteur
  }
}

export const disableBio = () => config && save({ ...config, bio: undefined });

export async function checkBio(): Promise<boolean> {
  if (!config?.bio) return false;
  try {
    const ok = await navigator.credentials.get({
      publicKey: {
        challenge: random(32),
        allowCredentials: [{ type: 'public-key', id: unb64(config.bio) }],
        userVerification: 'required',
        timeout: 60_000,
      },
    });
    return !!ok;
  } catch {
    return false;
  }
}
