// Appareils connectés : une clé au hasard gardée sur cet appareil, un nom lisible (« iPhone · Safari »).
const KEY = 'ap.deviceKey';

export function deviceKey(): string {
  try {
    let k = localStorage.getItem(KEY);
    if (!k) {
      k = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^a-zA-Z0-9-]/g, '');
      localStorage.setItem(KEY, k);
    }
    return k;
  } catch {
    return 'session';
  }
}

export function deviceName(): string {
  const ua = navigator.userAgent;
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Appareil';
  const app = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone ? 'app installée' : /Edg\//.test(ua) ? 'Edge' : /Chrome|CriOS/.test(ua) ? 'Chrome' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /Safari/.test(ua) ? 'Safari' : 'navigateur';
  return `${os} · ${app}`;
}

export interface DeviceRow {
  id: string;
  device_key: string;
  name: string;
  last_seen: string;
}
