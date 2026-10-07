import React, { useEffect, useRef, useState } from 'react';
import { FileUp, Trash2, Plus } from 'lucide-react';
import { api, errorText, GlobalIconRow } from '../api';
import { Button, Card, ErrorLine, inputCls, Loading } from '../ui';
import { ICON_FOLDERS, groupByFolder } from '../../src/lib/iconFolders';
import { hasEmbeddedImage, isHeavySvg, prepareSvg, rasterizeIcon, svgToDataUrl } from '../../src/lib/customIcons';

// Icônes proposées à tout le monde dans Wallo (catégories et portefeuilles), en plus des icônes perso.
// Même préparation que « Mes icônes » dans l'app : SVG nettoyé, ou image convertie en petit PNG.
export const IconsPage: React.FC = () => {
  const [list, setList] = useState<GlobalIconRow[] | null>(null);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [keepColors, setKeepColors] = useState(false);
  const [folder, setFolder] = useState<string>(ICON_FOLDERS[0].name);
  const [raster, setRaster] = useState<string | null>(null);
  const [prepError, setPrepError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api.icons().then(setList).catch((e) => { setError(errorText(e)); setList([]); });
  useEffect(() => {
    load();
  }, []);

  const convert = async (src: string) => {
    setPrepError('');
    try {
      setRaster((await rasterizeIcon(src)).dataUrl);
    } catch (e) {
      setRaster(null);
      setPrepError(e instanceof Error ? e.message : 'Image illisible');
    }
  };

  const needsRaster = !!code.trim() && (hasEmbeddedImage(code) || isHeavySvg(code));
  useEffect(() => {
    if (needsRaster) convert(svgToDataUrl(code));
    else if (code.trim()) setRaster(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const svg = code.trim() && !needsRaster ? prepareSvg(code) : null;
  const dataUrl = raster ?? (svg && 'dataUrl' in svg ? svg.dataUrl : null);
  const prepMsg = prepError || (svg && 'error' in svg ? svg.error : '');

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!name) setName(file.name.replace(/\.(svg|png|jpe?g|webp)$/i, ''));
    setRaster(null);
    if (/\.svg$/i.test(file.name) || file.type === 'image/svg+xml') setCode(await file.text());
    else {
      setCode('');
      const url = URL.createObjectURL(file);
      await convert(url);
      URL.revokeObjectURL(url);
    }
  };

  const add = async () => {
    if (!dataUrl) return;
    setBusy(true);
    setError('');
    try {
      await api.addIcon(name.trim() || 'Icône', dataUrl, keepColors, folder);
      setCode('');
      setName('');
      setRaster(null);
      setKeepColors(false);
      await load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const move = async (i: GlobalIconRow, folder: string) => {
    try {
      await api.setIconFolder(i.id, folder);
      await load();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const remove = async (i: GlobalIconRow) => {
    if (!confirm(`Retirer l'icône « ${i.name} » ? Les catégories qui l'utilisent afficheront une icône par défaut.`)) return;
    try {
      await api.deleteIcon(i.id);
      await load();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const preview = (url: string, keep: boolean, px: number, color: string) =>
    keep ? (
      <img src={url} alt="" style={{ width: px, height: px }} className="object-contain" />
    ) : (
      <span className="inline-block" style={{ width: px, height: px, backgroundColor: color, mask: `url("${url}") center / contain no-repeat`, WebkitMask: `url("${url}") center / contain no-repeat` }} />
    );

  return (
    <div className="space-y-4">
      <Card title="Ajouter une icône" hint="SVG carré (viewBox 0 0 24 24, une couleur, fond transparent) ou PNG / JPG : un fond uni est retiré automatiquement.">
        <input ref={fileInput} type="file" accept=".svg,image/svg+xml,image/png,image/jpeg,image/webp" onChange={onFile} className="hidden" />
        <div className="grid md:grid-cols-[1fr_auto] gap-4">
          <div className="space-y-3">
            <Button onClick={() => fileInput.current?.click()}>
              <FileUp className="w-4 h-4" /> Choisir un fichier
            </Button>
            <textarea value={code} onChange={(e) => setCode(e.target.value)} rows={4} placeholder="…ou colle le code SVG ici" className={`${inputCls} font-mono text-[13px]`} />
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Nom (ex. Orange Money, Rawbank, SNEL)" className={inputCls} />
            <label className="block text-[13px] text-slate-500">
              Dossier (rangement dans le choix d'icône de l'app)
              <select value={folder} onChange={(e) => setFolder(e.target.value)} className={`${inputCls} mt-1`}>
                {ICON_FOLDERS.map((f) => (
                  <option key={f.name} value={f.name}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-[14px] cursor-pointer">
              <input type="checkbox" checked={keepColors} onChange={(e) => setKeepColors(e.target.checked)} />
              Garder les couleurs d'origine (logo multicolore)
            </label>
            {prepMsg && <ErrorLine text={prepMsg} />}
          </div>
          <div className="flex md:flex-col items-center justify-center gap-4 p-4 rounded-2xl bg-slate-100 dark:bg-white/5 min-w-[140px]">
            {dataUrl ? (
              <>
                {preview(dataUrl, keepColors, 40, '#059669')}
                <div className="flex gap-3">
                  {preview(dataUrl, keepColors, 20, '#F97316')}
                  {preview(dataUrl, keepColors, 16, '#6366F1')}
                </div>
              </>
            ) : (
              <span className="text-[13px] text-slate-400 text-center">Aperçu</span>
            )}
          </div>
        </div>
        <Button kind="primary" className="mt-4" disabled={!dataUrl} busy={busy} onClick={add}>
          {!busy && <Plus className="w-4 h-4" />} Publier pour tout le monde
        </Button>
        <ErrorLine text={error} />
      </Card>

      <Card title="Icônes publiées" hint="Visibles dans le choix d'icône de chaque personne, rangées par dossier, avant ses propres icônes. Change le dossier d'une icône avec la petite liste sous son nom.">
        {!list ? (
          <Loading />
        ) : list.length === 0 ? (
          <p className="text-[14px] text-slate-500 text-center py-6">Aucune icône pour l'instant.</p>
        ) : (
          <div className="space-y-5">
          {groupByFolder(list).map((g) => (
          <div key={g.folder}>
          <h3 className="text-[13px] font-semibold text-slate-500 mb-2">{g.folder} · {g.items.length}</h3>
          <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-8 gap-2">
            {g.items.map((i) => (
              <div key={i.id} className="relative group flex flex-col items-center gap-1.5 p-3 rounded-2xl bg-slate-100 dark:bg-white/5">
                {preview(i.data_url, i.keep_colors, 28, '#059669')}
                <span className="w-full text-center text-[12px] text-slate-600 dark:text-slate-300 truncate">{i.name}</span>
                <select
                  value={i.folder ?? 'Divers'}
                  onChange={(e) => move(i, e.target.value)}
                  aria-label={`Dossier de ${i.name}`}
                  className="w-full text-[11px] bg-transparent text-slate-500 text-center cursor-pointer outline-none"
                >
                  {ICON_FOLDERS.map((f) => (
                    <option key={f.name} value={f.name}>
                      {f.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => remove(i)}
                  aria-label={`Retirer ${i.name}`}
                  className="absolute top-1 right-1 w-7 h-7 rounded-full bg-white dark:bg-[#151a21] text-red-500 flex items-center justify-center opacity-100 md:opacity-0 group-hover:opacity-100 transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          </div>
          ))}
          </div>
        )}
      </Card>
    </div>
  );
};
