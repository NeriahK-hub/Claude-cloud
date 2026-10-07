// Rapport en image (PNG 1080 × 1350, format WhatsApp / Instagram), dessiné directement sur un canvas :
// période, entrées, sorties, solde et les principales dépenses. Partagé avec la feuille de partage
// du téléphone (WhatsApp…), sinon téléchargé.
import { track } from './usage';

export interface ReportImage {
  title: string; // ex. « Rapport · Octobre 2026 »
  subtitle: string; // ex. « Tous les portefeuilles »
  income: string;
  expense: string;
  net: string;
  netPositive: boolean;
  opening: string;
  closing: string;
  top: { name: string; color: string; amount: string; share: number }[]; // share : 0 à 1
}

const W = 1080; // largeur fixe ; la hauteur suit le nombre de catégories (1350 px avec 5, format portrait)

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.max(0, Math.min(r, w / 2, h / 2)); // un arrondi plus grand que la forme la déformerait
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Raccourcit un texte avec « … » pour tenir dans la largeur
export function fit(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

export async function drawReport(r: ReportImage): Promise<Blob> {
  const rows = Math.max(1, Math.min(5, r.top.length));
  const listH = 110 + rows * 68;
  const H = 792 + listH + 108;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const css = getComputedStyle(document.documentElement);
  const accent = css.getPropertyValue('--accent').trim() || '#D8FB52';
  const onAccent = css.getPropertyValue('--on-accent').trim() || '#0F172A';
  const font = (w: number, s: number) => `${w} ${s}px Inter, -apple-system, "Segoe UI", Roboto, sans-serif`;
  await document.fonts?.ready;

  // Fond
  ctx.fillStyle = '#F1F5F9';
  ctx.fillRect(0, 0, W, H);

  // En-tête couleur d'accent
  ctx.fillStyle = accent;
  roundRect(ctx, 48, 48, W - 96, 300, 48);
  ctx.fill();
  ctx.fillStyle = onAccent;
  ctx.font = font(800, 40);
  ctx.fillText('Wallo', 96, 124);
  ctx.font = font(800, 64);
  ctx.fillText(fit(ctx, r.title, W - 192), 96, 230);
  ctx.globalAlpha = 0.75;
  ctx.font = font(600, 34);
  ctx.fillText(fit(ctx, r.subtitle, W - 192), 96, 290);
  ctx.globalAlpha = 1;

  // Entrées / sorties
  const tile = (x: number, label: string, value: string, color: string) => {
    ctx.fillStyle = '#FFFFFF';
    roundRect(ctx, x, 384, (W - 96 - 24) / 2, 170, 36);
    ctx.fill();
    ctx.fillStyle = '#64748B';
    ctx.font = font(600, 30);
    ctx.fillText(label, x + 36, 444);
    ctx.fillStyle = color;
    ctx.font = font(800, 46);
    ctx.fillText(fit(ctx, value, (W - 96 - 24) / 2 - 72), x + 36, 512);
  };
  tile(48, 'Entrées', r.income, '#059669');
  tile(48 + (W - 96 + 24) / 2, 'Sorties', r.expense, '#E11D48');

  // Solde net + ouverture / fin
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, 48, 578, W - 96, 190, 36);
  ctx.fill();
  ctx.fillStyle = '#64748B';
  ctx.font = font(600, 30);
  ctx.fillText('Revenu net', 84, 638);
  ctx.fillStyle = r.netPositive ? '#059669' : '#E11D48';
  ctx.font = font(800, 58);
  ctx.fillText(fit(ctx, r.net, 520), 84, 714);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#64748B';
  ctx.font = font(600, 26);
  ctx.fillText(`Ouverture : ${r.opening}`, W - 84, 650);
  ctx.fillText(`Fin : ${r.closing}`, W - 84, 700);
  ctx.textAlign = 'left';

  // Principales dépenses
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, 48, 792, W - 96, listH, 36);
  ctx.fill();
  ctx.fillStyle = '#0F172A';
  ctx.font = font(800, 34);
  ctx.fillText('Où est parti l\'argent', 84, 852);
  if (r.top.length === 0) {
    ctx.fillStyle = '#94A3B8';
    ctx.font = font(600, 30);
    ctx.fillText('Aucune dépense sur cette période.', 84, 920);
  }
  r.top.slice(0, 5).forEach((c, i) => {
    const y = 912 + i * 68;
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.arc(98, y - 10, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#0F172A';
    ctx.font = font(600, 30);
    ctx.fillText(fit(ctx, c.name, 420), 126, y);
    ctx.textAlign = 'right';
    ctx.font = font(700, 30);
    ctx.fillText(`${c.amount} · ${Math.round(c.share * 100)} %`, W - 84, y);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#E2E8F0';
    roundRect(ctx, 126, y + 14, W - 210, 10, 5);
    ctx.fill();
    ctx.fillStyle = c.color;
    roundRect(ctx, 126, y + 14, Math.max(10, (W - 210) * c.share), 10, 5);
    ctx.fill();
  });

  // Pied
  ctx.fillStyle = '#94A3B8';
  ctx.font = font(600, 26);
  ctx.textAlign = 'center';
  ctx.fillText('Fait avec Wallo · wallo-b13b0.web.app', W / 2, H - 40);

  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image impossible'))), 'image/png'));
}

// Feuille de partage du téléphone si possible (WhatsApp…), sinon téléchargement
export async function shareImage(blob: Blob, fileName: string, title: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], fileName, { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}

export async function shareReport(r: ReportImage, fileName: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  track('share.report');
  return shareImage(await drawReport(r), fileName, r.title);
}
