import { useSyncExternalStore } from 'react';
import { onOtherTabChange } from './crossTab';

// Icônes SVG créées par l'utilisateur (Paramètres > Mes icônes).
// On les affiche comme des images (jamais injectées dans la page) : un SVG ne peut donc
// pas exécuter de script. Par défaut l'icône sert de « masque » et prend la couleur
// de la catégorie / du portefeuille ; « keepColors » garde les couleurs d'origine.

export interface CustomIcon {
  id: string; // toujours préfixé "custom:" (c'est ce nom qui est enregistré dans icon)
  name: string;
  dataUrl: string; // data:image/svg+xml;base64,… ou data:image/png;base64,… (icône importée en image)
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

onOtherTabChange(KEY, () => {
  icons = read();
  listeners.forEach((l) => l());
});

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
        typeof i.dataUrl === 'string' && /^data:image\/(svg\+xml|png)[;,]/.test(i.dataUrl)
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

// ---------- Icônes « image » (PNG / JPG, ou SVG exporté par Canva qui contient une image) ----------
// On les transforme en petite image PNG de 96 px : légère, nette aux tailles de l'app (16 à 24 px).
// Un fond uni (ex. blanc) est retiré automatiquement pour que l'icône prenne la couleur de la catégorie.

export const hasEmbeddedImage = (svg: string) => /<image[\s>]/i.test(svg);
export const isHeavySvg = (svg: string) => new Blob([svg]).size > MAX_SVG_BYTES;

const OUT = 96;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image illisible'));
    img.src = src;
  });
}

export async function rasterizeIcon(src: string): Promise<{ dataUrl: string; removedBackground: boolean }> {
  const img = await loadImage(src);
  const w0 = img.naturalWidth || img.width || 256;
  const h0 = img.naturalHeight || img.height || 256;
  const scale = Math.min(1, 256 / Math.max(w0, h0)) || 1;
  const w = Math.max(1, Math.round(w0 * scale));
  const h = Math.max(1, Math.round(h0 * scale));
  const work = document.createElement('canvas');
  work.width = w;
  work.height = h;
  const ctx = work.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;

  // Fond uni : les 4 coins sont opaques et de la même couleur -> on le rend transparent
  const at = (x: number, y: number) => (y * w + x) * 4;
  const corners = [at(0, 0), at(w - 1, 0), at(0, h - 1), at(w - 1, h - 1)];
  const dist = (i: number, j: number) => Math.hypot(px[i] - px[j], px[i + 1] - px[j + 1], px[i + 2] - px[j + 2]);
  const removedBackground = corners.every((i) => px[i + 3] > 250) && corners.every((i) => dist(i, corners[0]) < 30);
  if (removedBackground) {
    const bg = corners[0];
    for (let i = 0; i < px.length; i += 4) {
      const d = dist(i, bg);
      if (d < 40) px[i + 3] = 0;
      else if (d < 90) px[i + 3] = Math.round((px[i + 3] * (d - 40)) / 50); // bords adoucis
    }
    ctx.putImageData(data, 0, 0);
  }

  // Recadrage sur le dessin (on enlève les marges vides), puis centré avec une petite marge
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++)
      if (px[at(x, y) + 3] > 12) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
  if (maxX < 0) throw new Error("L'image est vide (ou entièrement de la couleur du fond).");
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const inner = OUT * 0.84;
  const k = inner / Math.max(cw, ch);
  const out = document.createElement('canvas');
  out.width = OUT;
  out.height = OUT;
  const octx = out.getContext('2d')!;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(work, minX, minY, cw, ch, (OUT - cw * k) / 2, (OUT - ch * k) / 2, cw * k, ch * k);
  return { dataUrl: out.toDataURL('image/png'), removedBackground };
}

export const svgToDataUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
