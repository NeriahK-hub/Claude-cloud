// Rapport PDF (1 à 3 pages), créé sur le téléphone : marche hors ligne.
// jsPDF n'est chargé qu'au moment de créer le fichier (l'app reste légère).

export interface PdfReport {
  title: string; // « Rapport · Octobre 2026 »
  person: string; // nom (profil) ou « Wallo »
  scope: string; // « Tous les portefeuilles »
  generated: string; // date de création
  summary: { label: string; value: string; tone?: 'good' | 'bad' }[];
  categories: { name: string; color: string; value: string; share: number }[];
  budgets: { name: string; value: string; ratio: number }[];
  goals: { name: string; value: string; ratio: number }[];
  transactions?: { date: string; title: string; category: string; value: string; positive: boolean }[];
}

// Les polices de base du PDF ne connaissent pas certains caractères : on les remplace
const clean = (s: string) =>
  s
    .replace(/[   ]/g, ' ')
    .replace(/−/g, '-')
    .replace(/≈/g, '~')
    .replace(/›/g, '>')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\u0000-ÿ…€]/g, '');

const hex = (c: string): [number, number, number] => {
  const m = c.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [100, 116, 139];
};

export async function buildReportPdf(r: PdfReport): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210;
  const M = 16; // marge
  const inner = W - 2 * M;
  let y = 0;
  const ink: [number, number, number] = [15, 23, 42];
  const grey: [number, number, number] = [100, 116, 139];
  const light: [number, number, number] = [241, 245, 249];
  const green: [number, number, number] = [16, 185, 129];
  const red: [number, number, number] = [239, 68, 68];

  const text = (s: string, x: number, yy: number, o: { size?: number; bold?: boolean; color?: [number, number, number]; align?: 'left' | 'right' | 'center' } = {}) => {
    doc.setFont('helvetica', o.bold ? 'bold' : 'normal');
    doc.setFontSize(o.size ?? 10);
    doc.setTextColor(...(o.color ?? ink));
    doc.text(clean(s), x, yy, { align: o.align ?? 'left' });
  };
  const ensure = (h: number) => {
    if (y + h > 297 - 18) {
      doc.addPage();
      y = 18;
    }
  };
  const section = (title: string) => {
    ensure(16);
    y += 6;
    text(title.toUpperCase(), M, y, { size: 8.5, bold: true, color: grey });
    y += 4;
  };
  const bar = (x: number, yy: number, w: number, ratio: number, color: [number, number, number]) => {
    doc.setFillColor(...light);
    doc.roundedRect(x, yy, w, 2.2, 1.1, 1.1, 'F');
    const fw = Math.max(0, Math.min(1, ratio)) * w;
    if (fw > 0.5) {
      doc.setFillColor(...color);
      doc.roundedRect(x, yy, fw, 2.2, 1.1, 1.1, 'F');
    }
  };

  // En-tête : bandeau sombre, nom de l'app et période
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, W, 38, 'F');
  text('Wallo', M, 15, { size: 12, bold: true, color: [216, 251, 82] });
  text(r.title, M, 25, { size: 18, bold: true, color: [255, 255, 255] });
  text(`${r.person} · ${r.scope}`, M, 32, { size: 9.5, color: [203, 213, 225] });
  text(`Créé le ${r.generated}`, W - M, 15, { size: 8.5, color: [148, 163, 184], align: 'right' });
  y = 48;

  // Chiffres clés : des cases arrondies
  const cols = Math.min(4, r.summary.length);
  const cw = (inner - (cols - 1) * 4) / cols;
  r.summary.forEach((s, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    const x = M + col * (cw + 4);
    const yy = y + row * 24;
    doc.setFillColor(...light);
    doc.roundedRect(x, yy, cw, 20, 3, 3, 'F');
    text(s.label, x + 4, yy + 7, { size: 8, color: grey });
    text(s.value, x + 4, yy + 15, { size: 12, bold: true, color: s.tone === 'good' ? green : s.tone === 'bad' ? red : ink });
  });
  y += Math.ceil(r.summary.length / cols) * 24;

  // Dépenses par catégorie
  if (r.categories.length) {
    section('Dépenses par catégorie');
    for (const c of r.categories.slice(0, 14)) {
      ensure(10);
      y += 6;
      doc.setFillColor(...hex(c.color));
      doc.circle(M + 2, y - 1.3, 1.8, 'F');
      text(c.name, M + 6, y, { size: 10 });
      text(`${Math.round(c.share * 100)} %`, M + 120, y, { size: 9, color: grey, align: 'right' });
      text(c.value, W - M, y, { size: 10, bold: true, align: 'right' });
      bar(M + 6, y + 1.8, 114, c.share, hex(c.color));
      y += 2.5;
    }
  }

  // Budgets
  if (r.budgets.length) {
    section('Budgets');
    for (const b of r.budgets) {
      ensure(10);
      y += 6;
      text(b.name, M, y, { size: 10 });
      text(b.value, W - M, y, { size: 10, bold: true, align: 'right', color: b.ratio >= 1 ? red : ink });
      bar(M, y + 1.8, inner, b.ratio, b.ratio >= 1 ? red : b.ratio >= 0.8 ? [245, 158, 11] : green);
      y += 2.5;
    }
  }

  // Objectifs
  if (r.goals.length) {
    section("Objectifs d'épargne");
    for (const g of r.goals) {
      ensure(10);
      y += 6;
      text(g.name, M, y, { size: 10 });
      text(g.value, W - M, y, { size: 10, bold: true, align: 'right' });
      bar(M, y + 1.8, inner, g.ratio, green);
      y += 2.5;
    }
  }

  // Opérations
  if (r.transactions?.length) {
    section(`Opérations (${r.transactions.length})`);
    y += 2;
    for (const [i, t] of r.transactions.entries()) {
      ensure(7);
      if (i % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(M, y - 0.5, inner, 6.5, 'F');
      }
      y += 4.3;
      text(t.date, M + 2, y, { size: 8.5, color: grey });
      text(t.title.length > 46 ? `${t.title.slice(0, 45)}…` : t.title, M + 22, y, { size: 8.5 });
      text(t.category.length > 24 ? `${t.category.slice(0, 23)}…` : t.category, M + 118, y, { size: 8.5, color: grey });
      text(t.value, W - M - 2, y, { size: 8.5, bold: true, align: 'right', color: t.positive ? green : ink });
      y += 2.2;
    }
  }

  // Pied de page sur chaque page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    text(`Wallo · ${r.title}`, M, 290, { size: 8, color: grey });
    text(`${i} / ${pages}`, W - M, 290, { size: 8, color: grey, align: 'right' });
  }
  return doc.output('blob');
}

// Partager (WhatsApp, e-mail…) si le téléphone sait le faire, sinon télécharger
export async function sharePdf(blob: Blob, fileName: string, title: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([blob], fileName, { type: 'application/pdf' });
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
