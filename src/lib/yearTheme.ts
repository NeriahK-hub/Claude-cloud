// Couleurs du Wrapped : une palette par année (2026 vert / turquoise, puis ça tourne).
// Servent partout : carte du Rapport, carte de l'accueil, compte à rebours, story, image partagée.

// Décor des écrans du Wrapped : change chaque année (en plus des couleurs)
export type YearStyle = 'bands' | 'orbs' | 'rings' | 'equalizer' | 'grid';

export interface YearTheme {
  a: string; // couleur principale (la boule lumineuse)
  b: string; // deuxième couleur
  hi: string; // texte mis en valeur (« 26 » de 2026)
  style: YearStyle;
}

// 7 palettes et 5 décors qui tournent chacun de leur côté : la même combinaison ne revient
// qu'au bout de 35 ans (2026 → 2060). Une année garde toujours le même look : l'historique reste juste.
const PALETTES = [
  { a: '#22C55E', b: '#06B6D4', hi: '#86EFAC' }, // 2026 : vert / turquoise
  { a: '#8B5CF6', b: '#EC4899', hi: '#F0ABFC' }, // 2027 : violet / rose
  { a: '#F59E0B', b: '#EF4444', hi: '#FDE68A' }, // 2028 : ambre / rouge
  { a: '#3B82F6', b: '#22D3EE', hi: '#BAE6FD' }, // 2029 : bleu / cyan
  { a: '#F43F5E', b: '#A855F7', hi: '#FDA4AF' }, // 2030 : rose / violet
  { a: '#84CC16', b: '#14B8A6', hi: '#D9F99D' }, // 2031 : citron vert / sarcelle
  { a: '#6366F1', b: '#F59E0B', hi: '#C7D2FE' }, // 2032 : indigo / or
];
const STYLES: YearStyle[] = ['bands', 'orbs', 'rings', 'equalizer', 'grid']; // 2026 bandes, 2027 bulles…

const mod = (n: number, m: number) => ((n % m) + m) % m;
export const yearTheme = (year: number): YearTheme => ({ ...PALETTES[mod(year - 2026, PALETTES.length)], style: STYLES[mod(year - 2026, STYLES.length)] });

// Petit téléphone (peu de cœurs ou de mémoire) ou « moins d'animations » : décor allégé
export const isLiteDevice = () =>
  (typeof navigator !== 'undefined' && ((navigator.hardwareConcurrency ?? 8) <= 4 || ((navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8) <= 2)) ||
  (typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

// Fond « Replay » : noir, une grande boule de lumière en bas à droite, une lueur douce en haut
export const replayBg = (t: YearTheme) =>
  [
    `radial-gradient(circle at 78% 112%, ${t.b} 0%, ${t.a} 22%, ${t.a}55 42%, transparent 62%)`,
    `radial-gradient(ellipse at 15% 0%, ${t.a}33 0%, transparent 55%)`,
    '#050807',
  ].join(', ');
