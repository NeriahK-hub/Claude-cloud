import React, { useEffect, useRef, useState } from 'react';
import { FileUp, Trash2 } from 'lucide-react';
import { AppIcon } from './AppIcon';
import { askConfirm } from '../lib/confirm';
import { addCustomIcon, deleteCustomIcon, hasEmbeddedImage, isHeavySvg, prepareSvg, rasterizeIcon, svgToDataUrl, useCustomIcons } from '../lib/customIcons';

// Paramètres > Mes icônes : importer ou coller une icône SVG
export const CustomIconsSection: React.FC = () => {
  const icons = useCustomIcons();
  const fileInput = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [keepColors, setKeepColors] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Icône « image » : PNG / JPG, ou SVG qui contient une image (export Canva) -> petite image PNG
  const [raster, setRaster] = useState<{ dataUrl: string; removedBackground: boolean } | null>(null);
  const [rasterError, setRasterError] = useState('');
  const [busy, setBusy] = useState(false);
  const needsRaster = !!code.trim() && (hasEmbeddedImage(code) || isHeavySvg(code));

  const convert = async (src: string) => {
    setBusy(true);
    setRasterError('');
    try {
      setRaster(await rasterizeIcon(src));
    } catch (err) {
      setRaster(null);
      setRasterError(err instanceof Error ? err.message : 'Image illisible');
    } finally {
      setBusy(false);
    }
  };

  // SVG collé ou importé trop lourd / avec une image dedans : conversion automatique
  useEffect(() => {
    if (needsRaster) convert(svgToDataUrl(code));
    else if (code.trim()) setRaster(null); // SVG léger tapé / collé : utilisé tel quel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const result = code.trim() && !needsRaster ? prepareSvg(code) : null;
  const ok = raster ?? (result && 'dataUrl' in result ? result : null);
  const error = rasterError || (result && 'error' in result ? result.error : '');
  const notSquare = !raster && result && 'dataUrl' in result && Math.abs(result.width - result.height) > 0.5 ? result : null;

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!name) setName(file.name.replace(/\.(svg|png|jpe?g|webp)$/i, ''));
    setRaster(null);
    if (/\.svg$/i.test(file.name) || file.type === 'image/svg+xml') {
      setCode(await file.text());
    } else {
      // PNG / JPG : lu directement
      setCode('');
      const url = URL.createObjectURL(file);
      await convert(url);
      URL.revokeObjectURL(url);
    }
  };

  const add = () => {
    if (!ok) return;
    addCustomIcon(name.trim() || 'Mon icône', ok.dataUrl, keepColors);
    setCode('');
    setName('');
    setKeepColors(false);
    setRaster(null);
  };

  // Aperçu : image (couleurs d'origine) ou masque coloré, comme dans l'app
  const preview = (px: number, color: string) =>
    ok &&
    (keepColors ? (
      <img src={ok.dataUrl} alt="" style={{ width: px, height: px }} className="object-contain" />
    ) : (
      <span
        className="inline-block"
        style={{ width: px, height: px, backgroundColor: color, mask: `url("${ok.dataUrl}") center / contain no-repeat`, WebkitMask: `url("${ok.dataUrl}") center / contain no-repeat` }}
      />
    ));

  return (
    <>
      <button onClick={() => setShowHelp((s) => !s)} className="text-xs font-semibold text-emerald-700 mb-3 cursor-pointer">
        {showHelp ? 'Masquer les consignes' : 'Quelle taille pour que ça rende bien ?'}
      </button>
      {showHelp && (
        <ul className="text-xs text-slate-600 bg-slate-100 rounded-2xl p-3 mb-3 space-y-1 list-disc pl-5">
          <li>
            Zone de dessin <b>carrée de 24 × 24</b> : <code>viewBox="0 0 24 24"</code> (comme les icônes de l'app).
          </li>
          <li>
            Laisse <b>2 px de marge</b> : le dessin tient dans le carré 20 × 20 au centre.
          </li>
          <li>
            Traits de <b>2 px</b>, bouts arrondis (<code>stroke-linecap="round"</code>). Pas de trait sous 1,5 px : il disparaît en petit.
          </li>
          <li>
            <b>Fond transparent</b>, une seule couleur : l'app la remplace par la couleur de la catégorie. Coche « Garder mes couleurs » pour un logo multicolore.
          </li>
          <li>
            Affichée à <b>16, 20 et 24 px</b> dans l'app. SVG de <b>20 Ko maximum</b>. Texte à convertir en tracés.
          </li>
          <li>
            <b>Depuis Canva</b> : carré de <b>240 × 240 px</b>, un dessin d'une seule couleur, exporté en <b>PNG</b> (ou SVG).
            Pas besoin de fond transparent : un fond uni est retiré automatiquement.
          </li>
        </ul>
      )}

      {icons.length > 0 && (
        <div className="grid grid-cols-4 gap-2 mb-4">
          {icons.map((i) => (
            <div key={i.id} className="relative flex flex-col items-center gap-1 p-2 rounded-2xl bg-slate-100">
              <AppIcon name={i.id} className="w-6 h-6" style={{ color: '#059669' }} />
              <span className="w-full text-center text-[11px] font-semibold text-slate-600 truncate">{i.name}</span>
              <button
                onClick={async () => (await askConfirm({ title: `Supprimer l'icône « ${i.name} » ?`, message: 'Les catégories et portefeuilles qui l\'utilisent afficheront une icône par défaut.', confirmLabel: 'Supprimer', danger: true })) && deleteCustomIcon(i.id)}
                aria-label={`Supprimer ${i.name}`}
                className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-red-500 flex items-center justify-center cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <input ref={fileInput} type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,image/webp" onChange={onFile} className="hidden" />
      <button
        onClick={() => fileInput.current?.click()}
        className="w-full py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
      >
        <FileUp className="w-4 h-4" /> Importer une icône (SVG, PNG ou JPG)
      </button>
      <textarea
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder={'…ou colle le code ici : <svg viewBox="0 0 24 24">…</svg>'}
        rows={3}
        className="w-full mt-2 px-3 py-2 rounded-2xl bg-slate-100 text-xs font-mono outline-none focus:ring-2 focus:ring-accent"
      />
      {busy && <p className="text-xs text-slate-500 mt-1">Préparation de l'icône…</p>}
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      {raster && (
        <p className="text-xs text-slate-500 mt-1">
          Image convertie en petite icône{raster.removedBackground ? ', fond uni retiré' : ''}. Vérifie l'aperçu ci-dessous.
        </p>
      )}

      {ok && (
        <div className="mt-3">
          <div className="flex items-center gap-4 p-3 rounded-2xl bg-slate-100">
            {[16, 20, 24].map((px) => (
              <div key={px} className="flex flex-col items-center gap-1">
                <span className="w-11 h-11 rounded-full flex items-center justify-center" style={{ backgroundColor: '#05966922' }}>
                  {preview(px, '#059669')}
                </span>
                <span className="text-[11px] text-slate-500">{px} px</span>
              </div>
            ))}
            <span className="text-[12px] text-slate-500 leading-snug">Aperçu tel qu'il apparaîtra dans l'app.</span>
          </div>
          {notSquare && (
            <p className="text-xs text-amber-600 mt-1">
              Ton SVG n'est pas carré ({notSquare.width} × {notSquare.height}) : il sera centré, mais un format 24 × 24 rend mieux.
            </p>
          )}
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom de l'icône (ex. Moto)"
            className="w-full mt-2 px-4 py-2.5 rounded-2xl bg-slate-100 text-sm outline-none focus:ring-2 focus:ring-accent"
          />
          <label className="flex items-center gap-2 mt-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={keepColors} onChange={(e) => setKeepColors(e.target.checked)} className="w-4 h-4 accent-emerald-600" />
            Garder mes couleurs (logo multicolore)
          </label>
          <button onClick={add} className="w-full mt-3 py-3 rounded-2xl bg-accent font-bold text-sm text-slate-900 cursor-pointer">
            Ajouter l'icône
          </button>
        </div>
      )}
    </>
  );
};
