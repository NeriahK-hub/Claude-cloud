// Dossiers des icônes proposées à tous (espace admin › Icônes). Même ordre dans le choix d'icône de l'app.
// « slug » = nom conseillé du dossier sur l'ordinateur (ex. icones/mobile-money/orange-money.png).
export const ICON_FOLDERS = [
  { name: 'Mobile Money', slug: 'mobile-money' },
  { name: 'Banques', slug: 'banques' },
  { name: 'Microfinance', slug: 'microfinance' },
  { name: "Transferts d'argent", slug: 'transferts' },
  { name: 'Cartes & paiements', slug: 'cartes-paiements' },
  { name: 'Télécoms & internet', slug: 'telecoms' },
  { name: 'TV & streaming', slug: 'tv-streaming' },
  { name: 'Énergie & eau', slug: 'energie-eau' },
  { name: 'Carburant', slug: 'carburant' },
  { name: 'Transport & voyage', slug: 'transport' },
  { name: 'Courses & magasins', slug: 'courses' },
  { name: 'Santé', slug: 'sante' },
  { name: 'Éducation', slug: 'education' },
  { name: 'Maison & famille', slug: 'maison' },
  { name: 'Église & dons', slug: 'eglise-dons' },
  { name: 'Impôts & État', slug: 'impots-etat' },
  { name: 'Divers', slug: 'divers' },
] as const;

// Rang d'un dossier (un dossier inconnu, créé à la main, passe avant « Divers »)
export function folderRank(name: string): number {
  const i = ICON_FOLDERS.findIndex((f) => f.name === name);
  return i < 0 ? ICON_FOLDERS.length - 1.5 : i;
}

// Regroupe des icônes par dossier, dans l'ordre de ICON_FOLDERS
export function groupByFolder<T extends { folder?: string }>(items: T[]): { folder: string; items: T[] }[] {
  const map = new Map<string, T[]>();
  for (const it of items) {
    const f = it.folder || 'Divers';
    map.set(f, [...(map.get(f) ?? []), it]);
  }
  return [...map.entries()].sort((a, b) => folderRank(a[0]) - folderRank(b[0]) || a[0].localeCompare(b[0], 'fr')).map(([folder, items]) => ({ folder, items }));
}
