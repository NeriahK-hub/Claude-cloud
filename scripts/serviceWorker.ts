// Plugin Vite : génère /sw.js à la construction, avec la liste exacte des fichiers
// de cette version (l'app s'ouvre sans réseau, et chaque mise en ligne remplace
// proprement l'ancienne version).
import { createHash } from 'node:crypto';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { Plugin } from 'vite';

const listFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? listFiles(p) : [p];
  });

export function serviceWorker(): Plugin {
  return {
    name: 'wallo-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const files = [
        ...Object.keys(bundle),
        ...listFiles('public').map((p) => relative('public', p).split('\\').join('/')),
      ].filter((f) => !f.endsWith('.map') && f !== 'sw.js');
      const urls = ['/', ...files.map((f) => `/${f}`)];
      const version = createHash('sha256').update(urls.join('\n')).digest('hex').slice(0, 10);
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: swSource(version, urls) });
    },
  };
}

const swSource = (version: string, urls: string[]) => `// Généré à la construction (scripts/serviceWorker.ts) : ne pas modifier.
const CACHE = 'wallo-${version}';
const PRECACHE = ${JSON.stringify(urls)};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((url) => new Request(url, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('wallo-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Page : le réseau d'abord (3 s max), sinon la version enregistrée
async function page(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error('lent')), 3000)),
    ]);
    if (response.ok) cache.put('/', response.clone());
    return response;
  } catch {
    return (await cache.match(request, { ignoreSearch: true })) || (await cache.match('/')) || Response.error();
  }
}

// Fichiers : la version enregistrée d'abord, sinon le réseau (et on la garde)
async function file(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request, { ignoreSearch: true });
  if (hit) return hit;
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') cache.put(request, response.clone());
    return response;
  } catch (error) {
    // /confidentialite -> /confidentialite.html
    const page = await cache.match(new URL(request.url).pathname + '.html');
    if (page) return page;
    throw error;
  }
}

// Notification push envoyée par Supabase (même app fermée) : { title, body, tag, url }
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Wallo', {
      body: data.body || '',
      tag: data.tag,
      icon: '/icons/icon-192.png',
      data: { url: data.url || '/' },
    })
  );
});

// Toucher une notification : revenir sur Wallo s'il est ouvert, sinon l'ouvrir
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const open = list.find((c) => new URL(c.url).origin === self.location.origin);
      if (!open) return self.clients.openWindow(url);
      // App déjà ouverte : on lui passe l'adresse (ex. « ?goal=…&deposit=10 » ouvre l'ajout d'argent)
      open.postMessage({ type: 'open-url', url });
      return open.focus();
    })
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  // Seulement l'app elle-même : jamais la base de données ni Google
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  if (request.mode === 'navigate' && !url.pathname.includes('.') && url.pathname !== '/confidentialite') {
    event.respondWith(page(request));
  } else {
    event.respondWith(file(request));
  }
});
`;
