import { useSyncExternalStore } from 'react';

// Icônes SVG créées par l'utilisateur (Paramètres > Mes icônes).
// On les affiche comme des images (jamais injectées dans la page) : un SVG ne peut donc
// pas exécuter de script. Par défaut l'icône sert de « masque » et prend la couleur
// de la catégorie / du portefeuille ; « keepColors » garde les couleurs d'origine.

export interface CustomIcon {
  id: string; // toujours préfixé "custom:" (c'est ce nom qui est enregistré dans icon)
  name: string;
  dataUrl: string; // data:image/svg+xml;base64,…
  keepColors: boolean;
}

export const CUSTOM_PREFIX = 'custom:';
export const MAX_SVG_BYTES = 20_000;

const KEY = 'ap.customIcons';
let icons: CustomIcon[] = read();
const listeners = new Set<() => void>();

function read(): CustomIcon[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function save(next: CustomIcon[]) {
  icons = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // stockage plein : l'icône reste disponible pour cette session
  }
  listeners.forEach((l) => l());
}

export const getCustomIcon = (id: string) => icons.find((i) => i.id === id);

export function useCustomIcons(): CustomIcon[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => icons
  );
}

export function addCustomIcon(name: string, dataUrl: string, keepColors: boolean) {
  save([...icons, { id: `${CUSTOM_PREFIX}${Date.now()}`, name, dataUrl, keepColors }]);
}

export const getAllCustomIcons = () => icons;

// Restauration d'une sauvegarde : seules des images SVG en data URL sont acceptées
export function replaceCustomIcons(list: unknown) {
  if (!Array.isArray(list)) return;
  save(
    list.filter(
      (i): i is CustomIcon =>
        !!i && typeof i.id === 'string' && i.id.startsWith(CUSTOM_PREFIX) && typeof i.name === 'string' &&
        typeof i.dataUrl === 'string' && i.dataUrl.startsWith('data:image/svg+xml')
    ).map((i) => ({ id: i.id, name: i.name, dataUrl: i.dataUrl, keepColors: !!i.keepColors }))
  );
}

export function deleteCustomIcon(id: string) {
  save(icons.filter((i) => i.id !== id));
}

// Vérifie le code SVG et le nettoie. Renvoie l'image prête à enregistrer, ou une erreur lisible.
export function prepareSvg(code: string): { dataUrl: string; width: number; height: number } | { error: string } {
  const text = code.trim();
  if (!text) return { error: 'Colle le code SVG ou choisis un fichier .svg.' };
  if (new Blob([text]).size > MAX_SVG_BYTES) return { error: 'Fichier trop lourd (20 Ko maximum). Simplifie le dessin.' };

  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const svg = doc.documentElement;
  if (doc.querySelector('parsererror') || svg.nodeName.toLowerCase() !== 'svg') {
    return { error: "Ce n'est pas un SVG valide. Le code doit commencer par <svg …>." };
  }

  // Nettoyage : scripts, objets étrangers, attributs d'événement, liens externes
  svg.querySelectorAll('script, foreignObject, iframe, object, embed').forEach((n) => n.remove());
  [svg, ...svg.querySelectorAll('*')].forEach((el) => {
    for (const attr of [...el.attributes]) {
      const n = attr.name.toLowerCase();
      if (n.startsWith('on')) el.removeAttribute(attr.name);
      if ((n === 'href' || n === 'xlink:href') && !attr.value.startsWith('#')) el.removeAttribute(attr.name);
    }
  });
  if (!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  // Taille : on s'appuie sur viewBox (sinon width/height)
  const vb = svg.getAttribute('viewBox')?.split(/[\s,]+/).map(Number);
  const width = vb && vb.length === 4 ? vb[2] : parseFloat(svg.getAttribute('width') ?? '');
  const height = vb && vb.length === 4 ? vb[3] : parseFloat(svg.getAttribute('height') ?? '');
  if (!(width > 0 && height > 0)) return { error: 'Ajoute un viewBox à ton SVG (ex. viewBox="0 0 24 24").' };
  if (!vb) svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  // L'app choisit la taille d'affichage
  svg.removeAttribute('width');
  svg.removeAttribute('height');

  const clean = new XMLSerializer().serializeToString(svg);
  const dataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(clean)))}`;
  return { dataUrl, width, height };
}
