import React, { useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2, ExternalLink, Eye, MousePointerClick, Ruler, X } from 'lucide-react';
import { AdRow, api, errorText } from '../api';
import { Button, Card, dateFr, ErrorLine, inputCls, Loading, nf, Switch } from '../ui';

// Format des bannières : 4:1 (le même que dans mes autres applications). L'image envoyée est recadrée au centre à 1600 × 400 px.
const W = 1600;
const H = 400;

// Image choisie -> bannière 1600 × 400 (recadrée au centre, comme dans l'app), en WebP léger
type Banner = { blob?: Blob; url: string; srcW: number; srcH: number; remote?: boolean };

// Image donnée par un lien (https) : pas d'envoi ni de recadrage, l'app la recadre au centre à l'affichage
function fromLink(url: string): Promise<Banner> {
  return new Promise((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve({ url, srcW: i.naturalWidth, srcH: i.naturalHeight, remote: true });
    i.onerror = () => reject(new Error("Image introuvable à ce lien. Vérifie qu'il mène directement à une image (.jpg, .png, .webp) et qu'il est public."));
    i.src = url;
  });
}

async function toBanner(file: File): Promise<Banner> {
  const src = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Image illisible. Choisis un JPG, PNG ou WebP.'));
      i.src = src;
    });
    const sw = img.naturalWidth;
    const sh = img.naturalHeight;
    const scale = Math.max(W / sw, H / sh);
    const cw = W / scale;
    const ch = H / scale;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, W, H);
    const encode = (type: string, q: number) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, q));
    // WebP si le navigateur sait le faire, sinon JPEG ; toujours sous 1 Mo
    let blob = await encode('image/webp', 0.86);
    if (!blob || blob.type !== 'image/webp') blob = await encode('image/jpeg', 0.86);
    for (let q = 0.78; blob && blob.size > 950_000 && q > 0.4; q -= 0.12) blob = await encode(blob.type, q);
    if (!blob) throw new Error("L'image n'a pas pu être préparée.");
    return { blob, url: URL.createObjectURL(blob), srcW: sw, srcH: sh };
  } finally {
    URL.revokeObjectURL(src);
  }
}

const toIso = (day: string, end = false) => (day ? new Date(`${day}T${end ? '23:59:59' : '00:00:00'}`).toISOString() : null);

export const AdsPage: React.FC = () => {
  const [list, setList] = useState<AdRow[] | null>(null);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const [banner, setBanner] = useState<Banner | null>(null);
  const [imageLink, setImageLink] = useState(''); // ou l'adresse d'une image en ligne
  const [checking, setChecking] = useState(false);
  const [title, setTitle] = useState('');
  const [link, setLink] = useState('');
  const [sponsored, setSponsored] = useState(true);
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [busy, setBusy] = useState(false);
  const [guides, setGuides] = useState(true);

  const load = () => api.ads().then(setList).catch((e) => { setError(errorText(e)); setList([]); });
  useEffect(() => {
    load();
  }, []);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try {
      if (banner && !banner.remote) URL.revokeObjectURL(banner.url);
      setImageLink('');
      setBanner(await toBanner(file));
      if (!title) setTitle(file.name.replace(/\.\w+$/, '').slice(0, 80));
    } catch (err) {
      setError(errorText(err));
    }
  };

  const applyImageLink = async () => {
    const url = imageLink.trim();
    if (!/^https:\/\/\S+$/.test(url)) return setError("Le lien de l'image doit commencer par https://");
    setChecking(true);
    setError('');
    try {
      if (banner && !banner.remote) URL.revokeObjectURL(banner.url);
      setBanner(await fromLink(url));
      if (!title) setTitle(decodeURIComponent(url.split('/').pop()?.replace(/[?#].*$/, '').replace(/\.\w+$/, '') ?? '').slice(0, 80));
    } catch (err) {
      setBanner(null);
      setError(errorText(err));
    } finally {
      setChecking(false);
    }
  };

  const linkOk = !link.trim() || /^https:\/\/\S+\.\S+$/.test(link.trim());
  const ratio = banner ? banner.srcW / banner.srcH : 4;
  const warnings = banner
    ? [
        banner.srcW < 1200 || banner.srcH < 300 ? `Image petite (${banner.srcW} × ${banner.srcH} px) : elle sera un peu floue. Idéal : 1600 × 400 px.` : '',
        Math.abs(ratio - 4) > 0.2 ? `Image au format ${ratio.toFixed(2)}:1 : les bords ${ratio > 4 ? 'gauche et droit' : 'du haut et du bas'} seront coupés (voir l'aperçu).` : '',
      ].filter(Boolean)
    : [];

  const publish = async () => {
    if (!banner || !title.trim() || !linkOk) return;
    setBusy(true);
    setError('');
    try {
      await api.addAd(banner.remote ? banner.url : banner.blob!, {
        title: title.trim(),
        link_url: link.trim() || null,
        sponsored,
        starts_at: toIso(from),
        expires_at: toIso(until, true),
      });
      if (!banner.remote) URL.revokeObjectURL(banner.url);
      setBanner(null);
      setImageLink('');
      setTitle('');
      setLink('');
      setFrom('');
      setUntil('');
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const run = async (fn: () => Promise<void>) => {
    setError('');
    try {
      await fn();
      await load();
    } catch (err) {
      setError(errorText(err));
    }
  };

  const status = (a: AdRow) => {
    const now = new Date();
    if (!a.active) return ['Arrêtée', 'text-slate-400'];
    if (a.starts_at && new Date(a.starts_at) > now) return [`Commence le ${dateFr(a.starts_at)}`, 'text-indigo-600'];
    if (a.expires_at && new Date(a.expires_at) < now) return ['Terminée', 'text-amber-600'];
    return ['En ligne', 'text-emerald-600'];
  };

  return (
    <div className="space-y-4">
      <SizeGuide />

      <Card title="Nouvelle publicité" hint="Elle s'affiche sur l'accueil de Wallo, sous le solde, pour tout le monde. Chacun peut la masquer avec la croix.">
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={onFile} className="hidden" />
        {!banner ? (
          <>
          <button
            onClick={() => fileInput.current?.click()}
            className="w-full aspect-[4/1] max-h-64 rounded-2xl border-2 border-dashed border-slate-300 dark:border-white/15 flex flex-col items-center justify-center gap-2 text-slate-500 hover:bg-slate-50 dark:hover:bg-white/5 cursor-pointer"
          >
            <ImagePlus className="w-7 h-7" />
            <span className="text-[15px] font-semibold">Choisir l'image de la bannière</span>
            <span className="text-[13px]">1600 × 400 px conseillé (4:1) · JPG, PNG ou WebP</span>
          </button>
          {/* …ou une image déjà en ligne (site de l'annonceur, Canva partagé, etc.) */}
          <div className="flex items-center gap-3 my-3 text-[12px] text-slate-400">
            <span className="flex-1 h-px bg-slate-200 dark:bg-white/10" /> ou le lien d'une image <span className="flex-1 h-px bg-slate-200 dark:bg-white/10" />
          </div>
          <div className="flex gap-2">
            <input
              value={imageLink}
              onChange={(e) => setImageLink(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyImageLink()}
              inputMode="url"
              placeholder="https://exemple.com/banniere.jpg"
              className={inputCls}
            />
            <Button onClick={applyImageLink} busy={checking} disabled={!imageLink.trim()}>
              Utiliser
            </Button>
          </div>
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-slate-500">
                Aperçu tel qu'affiché dans l'app ·{' '}
                {banner.remote ? `image en ligne (${banner.srcW} × ${banner.srcH} px), recadrée au centre` : `${W} × ${H} px · ${Math.round(banner.blob!.size / 1024)} Ko`}
              </span>
              <label className="flex items-center gap-2 text-[13px] cursor-pointer">
                <input type="checkbox" checked={guides} onChange={(e) => setGuides(e.target.checked)} /> Zones à éviter
              </label>
            </div>
            <div className="grid md:grid-cols-[343px_1fr] gap-4 items-start">
              <div>
                <div className="text-[12px] text-slate-500 mb-1">Téléphone (343 px de large)</div>
                <Preview url={banner.url} sponsored={sponsored} guides={guides} width={343} />
              </div>
              <div className="min-w-0">
                <div className="text-[12px] text-slate-500 mb-1">Ordinateur</div>
                <Preview url={banner.url} sponsored={sponsored} guides={guides} />
              </div>
            </div>
            {warnings.map((w) => (
              <p key={w} className="text-[13px] text-amber-600">
                {w}
              </p>
            ))}
            {banner.remote && (
              <p className="text-[13px] text-slate-500 break-all">
                Image hébergée ailleurs : {banner.url}. Si elle est supprimée ou déplacée, la bannière disparaît de l'app.
              </p>
            )}
            <div className="flex gap-2">
              <Button onClick={() => fileInput.current?.click()}>Changer d'image</Button>
              <Button onClick={() => { if (!banner.remote) URL.revokeObjectURL(banner.url); setBanner(null); }}>
                Utiliser un lien
              </Button>
            </div>
          </div>
        )}

        <div className="grid md:grid-cols-2 gap-3 mt-4">
          <label className="text-[13px] text-slate-500">
            Nom (lu par les lecteurs d'écran)
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="ex. Magic Event : invitations" className={`${inputCls} mt-1`} />
          </label>
          <label className="text-[13px] text-slate-500">
            Lien (facultatif)
            <input value={link} onChange={(e) => setLink(e.target.value)} inputMode="url" placeholder="https://site-de-l-annonceur.com" className={`${inputCls} mt-1`} />
            {!linkOk && <span className="block text-red-600 mt-1">Le lien doit commencer par https://</span>}
          </label>
          <label className="text-[13px] text-slate-500">
            Début (facultatif)
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} mt-1`} />
          </label>
          <label className="text-[13px] text-slate-500">
            Fin (facultatif)
            <input type="date" value={until} min={from || undefined} onChange={(e) => setUntil(e.target.value)} className={`${inputCls} mt-1`} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-[14px] mt-3 cursor-pointer">
          <input type="checkbox" checked={sponsored} onChange={(e) => setSponsored(e.target.checked)} />
          Afficher « Sponsorisé » (conseillé pour une pub payée par un annonceur)
        </label>
        <Button kind="primary" className="mt-4" disabled={!banner || !title.trim() || !linkOk} busy={busy} onClick={publish}>
          Publier la publicité
        </Button>
        <ErrorLine text={error} />
      </Card>

      <Card title="Publicités" hint="Vues : une par personne et par jour. Clics : ouvertures du lien.">
        {!list ? (
          <Loading />
        ) : list.length === 0 ? (
          <p className="text-[14px] text-slate-500 text-center py-6">Aucune publicité pour l'instant.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {list.map((a) => {
              const [label, tone] = status(a);
              return (
                <li key={a.id} className="py-4 flex flex-wrap gap-4 items-start">
                  <img src={a.image_url} alt="" className="w-full sm:w-64 aspect-[4/1] object-cover rounded-xl bg-slate-100" />
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[15px] font-semibold">{a.title}</span>
                      <span className={`text-[12px] font-semibold ${tone}`}>{label}</span>
                    </div>
                    {a.link_url ? (
                      <a href={a.link_url} target="_blank" rel="noopener noreferrer" className="text-[13px] text-indigo-600 inline-flex items-center gap-1 break-all">
                        {a.link_url} <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    ) : (
                      <div className="text-[13px] text-slate-500">Sans lien</div>
                    )}
                    <div className="text-[12px] text-slate-500 mt-1">
                      {a.starts_at ? `Du ${dateFr(a.starts_at)} ` : 'Dès sa création '}
                      {a.expires_at ? `au ${dateFr(a.expires_at)}` : 'sans date de fin'}
                    </div>
                    <div className="flex gap-4 text-[13px] mt-2">
                      <span className="inline-flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5 text-slate-400" /> {nf(a.views)} vues
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MousePointerClick className="w-3.5 h-3.5 text-slate-400" /> {nf(a.clicks)} clics
                      </span>
                      {a.views > 0 && <span className="text-slate-500">{((a.clicks / a.views) * 100).toFixed(1)} % de clics</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch label="Publicité active" checked={a.active} onChange={(v) => run(() => api.setAdActive(a.id, v))} />
                    <Button kind="danger" aria-label="Supprimer la publicité" onClick={() => confirm(`Supprimer « ${a.title} » et son image ?`) && run(() => api.deleteAd(a))}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
};

// Aperçu fidèle : coins arrondis, croix et « Sponsorisé » placés comme dans l'app.
// Zones à éviter (en rouge) : les coins du haut (croix, « Sponsorisé ») et la marge des coins arrondis.
const Preview: React.FC<{ url: string; sponsored: boolean; guides: boolean; width?: number }> = ({ url, sponsored, guides, width }) => (
  <div className="relative aspect-[4/1] rounded-2xl overflow-hidden bg-slate-100" style={width ? { width } : undefined}>
    <img src={url} alt="" className="w-full h-full object-cover" />
    {guides && (
      <>
        {/* zone sûre : 80 px à gauche et à droite, 50 px en haut et en bas (sur 1600 × 400) */}
        <div className="absolute border-2 border-dashed border-emerald-400/90 rounded-lg pointer-events-none" style={{ top: '12.5%', bottom: '12.5%', left: '5%', right: '5%' }} />
        <div className="absolute top-0 left-0 bg-red-500/30 pointer-events-none" style={{ width: '8.75%', height: '35%' }} />
        <div className="absolute top-0 right-0 bg-red-500/30 pointer-events-none" style={{ width: '25%', height: '28%' }} />
      </>
    )}
    <span className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-black/45 text-white flex items-center justify-center">
      <X className="w-3 h-3" strokeWidth={2.5} />
    </span>
    {sponsored && (
      <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full bg-black/45 text-white text-[9px] font-semibold tracking-wider uppercase">Sponsorisé</span>
    )}
  </div>
);

// Les mesures à donner au graphiste (ou à régler dans Canva)
const SizeGuide: React.FC = () => {
  const [open, setOpen] = useState(true);
  return (
    <Card
      title="Mesures des bannières"
      right={
        <Button onClick={() => setOpen((o) => !o)}>
          <Ruler className="w-4 h-4" /> {open ? 'Masquer' : 'Afficher'}
        </Button>
      }
    >
      {open && (
        <div className="grid md:grid-cols-2 gap-x-8 gap-y-3 text-[14px] leading-relaxed">
          <Row k="Taille de l'image" v="1600 × 400 px (format 4:1, le même que tes autres applications). Minimum 1200 × 300 px." />
          <Row k="Dans Canva" v="Créer un design › Taille personnalisée › 1600 × 400 px. Exporter en PNG ou JPG." />
          <Row k="Fichier" v="JPG, PNG ou WebP. Recadré au centre et compressé automatiquement (moins de 1 Mo)." />
          <Row k="Taille à l'écran" v="≈ 343 × 86 px sur téléphone, jusqu'à ≈ 900 × 225 px sur ordinateur." />
          <Row k="Zone sûre" v="Garde textes et logo dans le rectangle central de 1440 × 300 px : 80 px de marge à gauche et à droite, 50 px en haut et en bas (coins arrondis)." />
          <Row k="Coins du haut" v="Rien d'important dans les 140 × 140 px en haut à gauche (croix) ni dans les 400 × 110 px en haut à droite (« Sponsorisé »)." />
          <Row k="Texte" v="Titre d'au moins 64 px de haut, bouton ou texte secondaire d'au moins 48 px : sinon illisible sur téléphone (la bannière n'y fait que 86 px de haut). 6 à 8 mots maximum." />
          <Row k="Couleurs" v="Fond plein ou dégradé, fort contraste texte / fond. La bannière est la même en mode clair et sombre." />
        </div>
      )}
    </Card>
  );
};

const Row: React.FC<{ k: string; v: string }> = ({ k, v }) => (
  <div>
    <div className="text-[13px] font-semibold text-slate-500">{k}</div>
    <div>{v}</div>
  </div>
);
