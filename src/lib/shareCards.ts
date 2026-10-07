import React from 'react';
import { track } from './usage';
import { fit, roundRect, shareImage } from './shareReport';
import { yearTheme } from './yearTheme';

export { roundRect };

// Images à partager (WhatsApp, statut…) : badge obtenu, bilan de la semaine, bilan de l'année.
// Dessinées sur un canvas 1080 × 1350 (format portrait), sans dépendre de l'écran.

export const W = 1080;
export const H = 1350;
export const font = (w: number, s: number) => `${w} ${s}px Inter, -apple-system, "Segoe UI", Roboto, sans-serif`;

export async function makeCanvas(h = H) {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = h;
  await document.fonts?.ready;
  return { canvas, ctx: canvas.getContext('2d')! };
}

// Une icône lucide dessinée sur le canvas (rendue en SVG puis chargée comme image)
export async function iconImage(Icon: React.ComponentType<Record<string, unknown>>, color: string, size: number, strokeWidth = 2): Promise<HTMLImageElement> {
  const { renderToStaticMarkup } = await import('react-dom/server');
  const svg = renderToStaticMarkup(React.createElement(Icon, { color, size, strokeWidth, xmlns: 'http://www.w3.org/2000/svg' }));
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  return img;
}

export const toBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image impossible'))), 'image/png'));

// Texte sur plusieurs lignes, centré
export function wrapCenter(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, max: number, lineH: number, maxLines = 3) {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const t = line ? `${line} ${w}` : w;
    if (ctx.measureText(t).width > max && line) {
      lines.push(line);
      line = w;
    } else line = t;
  }
  if (line) lines.push(line);
  lines.slice(0, maxLines).forEach((l, i) => ctx.fillText(i === maxLines - 1 && lines.length > maxLines ? fit(ctx, `${l}…`, max) : l, cx, y + i * lineH));
  return Math.min(lines.length, maxLines) * lineH;
}

// Pied de page Wallo
export function footer(ctx: CanvasRenderingContext2D, color: string, h = H) {
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.font = font(800, 34);
  ctx.fillText('Wallo', W / 2, h - 90);
  ctx.font = font(500, 26);
  ctx.globalAlpha = 0.7;
  ctx.fillText('Mon argent, en clair · wallo-b13b0.web.app', W / 2, h - 50);
  ctx.globalAlpha = 1;
}

// ---------- Badge obtenu ----------
export async function shareBadge(b: { name: string; done: string; color: string; Icon: React.ComponentType<Record<string, unknown>>; date: string }) {
  track('share.badge');
  const { canvas, ctx } = await makeCanvas();
  // Fond : dégradé de la couleur du badge
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, b.color);
  g.addColorStop(1, '#0d1015');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // Halo
  const halo = ctx.createRadialGradient(W / 2, 520, 50, W / 2, 520, 420);
  halo.addColorStop(0, 'rgba(255,255,255,0.35)');
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = font(800, 34);
  ctx.fillText('NOUVEAU BADGE', W / 2, 190);

  // Médaille
  const R = 210;
  ctx.beginPath();
  ctx.arc(W / 2, 520, R, 0, Math.PI * 2);
  ctx.fillStyle = b.color;
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = 60;
  ctx.shadowOffsetY = 24;
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 16;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.stroke();
  const icon = await iconImage(b.Icon, '#ffffff', 190, 2.2);
  ctx.drawImage(icon, W / 2 - 95, 520 - 95, 190, 190);

  ctx.fillStyle = '#ffffff';
  ctx.font = font(800, 76);
  ctx.fillText(fit(ctx, b.name, W - 160), W / 2, 860);
  ctx.font = font(500, 38);
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  wrapCenter(ctx, b.done, W / 2, 940, W - 220, 52, 3);
  ctx.font = font(600, 30);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillText(`Obtenu le ${b.date}`, W / 2, 1140);

  footer(ctx, '#ffffff');
  return shareImage(await toBlob(canvas), `wallo-badge.png`, `Badge ${b.name}`);
}

// Carte blanche arrondie
function card(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill = '#ffffff') {
  ctx.fillStyle = fill;
  roundRect(ctx, x, y, w, h, 40);
  ctx.fill();
}
const accentOf = () => {
  const css = getComputedStyle(document.documentElement);
  return { accent: css.getPropertyValue('--accent').trim() || '#D8FB52', on: css.getPropertyValue('--on-accent').trim() || '#0d1015' };
};

// ---------- Bilan de la semaine ----------
export async function shareWeek(w: {
  range: string;
  spent: string;
  received: string;
  freeDays: number;
  days: { label: string; ratio: number; top: boolean; free: boolean }[];
  top: { name: string; color: string; amount: string }[];
}) {
  track('share.week');
  const { canvas, ctx } = await makeCanvas();
  const { accent, on } = accentOf();
  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(0, 0, W, H);
  // En-tête
  card(ctx, 48, 48, W - 96, 330, accent);
  ctx.fillStyle = on;
  ctx.textAlign = 'left';
  ctx.font = font(700, 34);
  ctx.fillText('Ma semaine · ' + w.range, 96, 120);
  ctx.font = font(500, 32);
  ctx.globalAlpha = 0.75;
  ctx.fillText('J’ai dépensé', 96, 200);
  ctx.globalAlpha = 1;
  ctx.font = font(800, 92);
  ctx.fillText(fit(ctx, w.spent, W - 192), 96, 300);

  // Les 7 jours
  card(ctx, 48, 410, W - 96, 380);
  const bw = 90;
  const gap = (W - 96 - 96 - 7 * bw) / 6;
  w.days.forEach((d, i) => {
    const x = 96 + i * (bw + gap);
    const hBar = Math.max(14, d.ratio * 220);
    ctx.fillStyle = d.top ? '#EF4444' : d.free ? '#10B981' : '#CBD5E1';
    roundRect(ctx, x, 690 - hBar, bw, hBar, 18);
    ctx.fill();
    ctx.fillStyle = '#64748B';
    ctx.font = font(700, 30);
    ctx.textAlign = 'center';
    ctx.fillText(d.label, x + bw / 2, 750);
  });

  // Reçu + jours sans dépense
  card(ctx, 48, 820, (W - 96 - 24) / 2, 170);
  card(ctx, 48 + (W - 96 + 24) / 2, 820, (W - 96 - 24) / 2, 170);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#64748B';
  ctx.font = font(500, 28);
  ctx.fillText('Reçu', 90, 880);
  ctx.fillText('Jours sans dépense', 90 + (W - 96 + 24) / 2, 880);
  ctx.font = font(800, 48);
  ctx.fillStyle = '#10B981';
  ctx.fillText(fit(ctx, w.received, (W - 96 - 24) / 2 - 80), 90, 950);
  ctx.fillStyle = '#0F172A';
  ctx.fillText(String(w.freeDays), 90 + (W - 96 + 24) / 2, 950);

  // Top catégories
  card(ctx, 48, 1020, W - 96, 190);
  w.top.slice(0, 3).forEach((c, i) => {
    const y = 1075 + i * 52;
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.arc(108, y - 10, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0F172A';
    ctx.font = font(600, 32);
    ctx.textAlign = 'left';
    ctx.fillText(fit(ctx, c.name, 560), 140, y);
    ctx.textAlign = 'right';
    ctx.font = font(700, 32);
    ctx.fillText(c.amount, W - 96, y);
  });
  footer(ctx, '#0F172A');
  return shareImage(await toBlob(canvas), 'wallo-semaine.png', 'Ma semaine sur Wallo');
}

// Taille de police qui fait tenir le texte en entier (on réduit avant de couper)
function fitFont(ctx: CanvasRenderingContext2D, text: string, max: number, weight: number, start: number, min: number) {
  let size = start;
  ctx.font = font(weight, size);
  while (size > min && ctx.measureText(text).width > max) {
    size -= 2;
    ctx.font = font(weight, size);
  }
  return size;
}

// Carte « verre » : blanc transparent, coins ronds
function glass(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, alpha = 0.16, r = 44) {
  roundRect(ctx, x, y, w, h, r);
  ctx.fillStyle = 'rgba(14,14,22,0.82)'; // fond sombre : les bandes ne passent pas à travers
  ctx.fill();
  ctx.fillStyle = `rgba(255,255,255,${alpha * 0.6})`;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 2;
  ctx.stroke();
}

// ---------- Bilan de l'année : format story (1080 × 1920) ----------
export async function shareYear(y: {
  year: number;
  count: number;
  notedDays?: number;
  income: string;
  expense: string;
  saved: string;
  savedPositive: boolean;
  longest: number;
  topMonth: string;
  topMonthIndex?: number | null;
  bestMonthIndex?: number | null;
  topCat: { name: string; color: string } | null;
  persona?: { name: string; color: string; Icon: React.ComponentType<Record<string, unknown>> };
  months: number[]; // 0 à 1
}) {
  track('share.year');
  const SH = 1920;
  const { canvas, ctx } = await makeCanvas(SH);
  const lucide = await import('lucide-react');
  const ic = (I: unknown, color: string, size: number, sw = 2.2) => iconImage(I as React.ComponentType<Record<string, unknown>>, color, size, sw);
  const M = 72; // marge
  const CW = W - M * 2;

  // Fond : noir, lueurs violette et bleue, bandes lumineuses en diagonale (comme le Wrapped)
  ctx.fillStyle = '#07070B';
  ctx.fillRect(0, 0, W, SH);
  const th = yearTheme(y.year); // couleurs de l'année
  for (const [cx, cy, r, c] of [[0, 0, 800, `${th.a}55`], [W * 0.85, SH + 120, 1100, `${th.b}AA`], [W * 0.85, SH + 120, 700, `${th.a}CC`]] as const) {
    const gl = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    gl.addColorStop(0, c);
    gl.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(0, 0, W, SH);
  }
  const bands = (cx: number, cy: number, from: string, to: string) => {
    for (let i = 0; i < 3; i++) {
      ctx.save();
      ctx.translate(cx, cy + i * 120);
      ctx.rotate((-38 * Math.PI) / 180);
      const lg = ctx.createLinearGradient(-900, 0, 900, 0);
      lg.addColorStop(0, 'rgba(0,0,0,0)');
      lg.addColorStop(0.5, from);
      lg.addColorStop(1, to);
      ctx.globalAlpha = 0.85 - i * 0.22;
      ctx.fillStyle = lg;
      roundRect(ctx, -900, 0, 1800, 90 - i * 18, 45);
      ctx.fill();
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  };
  bands(W + 120, -260, th.a, th.b);

  // Pastille « Wallo · Mon année »
  ctx.textAlign = 'center';
  ctx.font = font(800, 30);
  const pill = 'WALLO  ·  WRAPPED';
  const pw = ctx.measureText(pill).width + 72;
  glass(ctx, (W - pw) / 2, 110, pw, 70, 0.2, 35);
  ctx.fillStyle = '#ffffff';
  ctx.fillText(pill, W / 2, 156);

  // L'année en très grand
  // « 20 » en blanc, « 26 » en jaune qui brille
  ctx.font = font(900, 270);
  const yy = String(y.year);
  const w1 = ctx.measureText(yy.slice(0, 2)).width;
  const w2 = ctx.measureText(yy.slice(2)).width;
  const x0 = (W - w1 - w2) / 2;
  ctx.textAlign = 'left';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(yy.slice(0, 2), x0, 440);
  ctx.shadowColor = th.a;
  ctx.shadowBlur = 50;
  ctx.fillStyle = th.hi;
  ctx.fillText(yy.slice(2), x0 + w1, 440);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.textAlign = 'center';
  ctx.font = font(600, 40);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillText(`${y.count.toLocaleString('fr-FR')} opérations notées${y.notedDays ? ` sur ${y.notedDays} jours` : ''}`, W / 2, 515);

  // Mois par mois
  let top = 580;
  glass(ctx, M, top, CW, 380);
  ctx.textAlign = 'left';
  ctx.font = font(700, 34);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('Mes dépenses mois par mois', M + 44, top + 70);
  const letters = 'JFMAMJJASOND';
  const bw = 52;
  const gap = (CW - 88 - 12 * bw) / 11;
  const base = top + 300;
  y.months.forEach((r, i) => {
    const x = M + 44 + i * (bw + gap);
    const h = r > 0 ? Math.max(18, r * 190) : 0;
    const special = i === y.topMonthIndex ? '#FDE047' : i === y.bestMonthIndex ? '#86EFAC' : null;
    if (h > 0) {
      ctx.fillStyle = special ?? 'rgba(255,255,255,0.88)';
      roundRect(ctx, x, base - h, bw, h, 16);
      ctx.fill();
    } else {
      // Mois sans dépense : un petit point
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.arc(x + bw / 2, base - 8, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.textAlign = 'center';
    ctx.font = font(700, 26);
    ctx.fillStyle = special ?? 'rgba(255,255,255,0.75)';
    ctx.fillText(letters[i], x + bw / 2, base + 48);
  });

  // Reçu / Dépensé / Gardé : une ligne chacun, le montant toujours en entier
  top += 400;
  const rows: { label: string; value: string; color: string; Icon: unknown; tint: string }[] = [
    { label: 'Reçu', value: y.income, color: '#ffffff', Icon: lucide.ArrowDownLeft, tint: '#34D399' },
    { label: 'Dépensé', value: y.expense, color: '#ffffff', Icon: lucide.ArrowUpRight, tint: '#FB7185' },
    { label: y.savedPositive ? 'Gardé' : 'En plus', value: y.saved, color: y.savedPositive ? '#BBF7D0' : '#FECDD3', Icon: lucide.PiggyBank, tint: y.savedPositive ? '#22C55E' : '#F43F5E' },
  ];
  for (const row of rows) {
    glass(ctx, M, top, CW, 118, 0.16, 40);
    ctx.beginPath();
    ctx.arc(M + 80, top + 59, 38, 0, Math.PI * 2);
    ctx.fillStyle = row.tint;
    ctx.fill();
    ctx.drawImage(await ic(row.Icon, '#ffffff', 42, 2.6), M + 59, top + 38, 42, 42);
    ctx.textAlign = 'left';
    ctx.font = font(600, 36);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(row.label, M + 142, top + 72);
    ctx.textAlign = 'right';
    const labelW = ctx.measureText(row.label).width;
    fitFont(ctx, row.value, CW - 142 - labelW - 80, 800, 56, 34);
    ctx.fillStyle = row.color;
    ctx.fillText(fit(ctx, row.value, CW - 142 - labelW - 80), W - M - 40, top + 78);
    top += 132;
  }

  // Quatre petites cartes
  top += 10;
  const tw = (CW - 24) / 2;
  const tiles: { label: string; value: string; Icon: unknown; color: string }[] = [
    { label: 'Plus longue série', value: `${y.longest} jour${y.longest > 1 ? 's' : ''}`, Icon: lucide.Flame, color: '#FDBA74' },
    { label: 'Mois le plus cher', value: y.topMonth, Icon: lucide.CalendarDays, color: '#FDE047' },
    { label: 'Catégorie n°1', value: y.topCat?.name ?? '—', Icon: lucide.Crown, color: '#FBCFE8' },
    { label: 'Mon profil', value: y.persona?.name ?? '—', Icon: y.persona?.Icon ?? lucide.Sparkles, color: '#C4B5FD' },
  ];
  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    const x = M + (i % 2) * (tw + 24);
    const yy = top + Math.floor(i / 2) * 200;
    glass(ctx, x, yy, tw, 186, 0.16, 40);
    ctx.drawImage(await ic(t.Icon, t.color, 44), x + 36, yy + 34, 44, 44);
    ctx.textAlign = 'left';
    ctx.font = font(600, 28);
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(t.label, x + 92, yy + 68);
    fitFont(ctx, t.value, tw - 72, 800, 46, 28);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(fit(ctx, t.value, tw - 72), x + 36, yy + 146);
  }

  footer(ctx, '#ffffff', SH);
  return shareImage(await toBlob(canvas), `wallo-${y.year}.png`, `Mon année ${y.year} sur Wallo`);
}
