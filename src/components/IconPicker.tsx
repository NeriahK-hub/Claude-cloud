import React, { useRef, useState } from 'react';
import { ImagePlus, Pipette } from 'lucide-react';
import { AppIcon } from './AppIcon';
import { resizeImage } from '../lib/resizeImage';
import { useCustomIcons } from '../lib/customIcons';
import { useRemoteConfig } from '../lib/remoteConfig';
import { groupByFolder } from '../lib/iconFolders';
import { haptic } from '../lib/haptics';

interface IconPickerProps {
  choices: string[];
  icon: string;
  image?: string;
  color: string;
  onIcon: (name: string) => void;
  onImage: (dataUrl: string | undefined) => void;
}

// Grille d'icônes lucide + option "Choisir une image" (partagée : catégories et portefeuilles)
export const IconPicker: React.FC<IconPickerProps> = ({ choices, icon, image, color, onIcon, onImage }) => {
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  // Icônes Wallo (ajoutées depuis l'espace admin, rangées par dossier), puis les miennes
  const global = useRemoteConfig().icons;
  const mine = useCustomIcons();
  const custom = [...global, ...mine];
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const q = norm(query.trim());
  const match = (i: { name: string; folder?: string }) => !q || norm(i.name).includes(q) || norm(i.folder ?? '').includes(q);
  // Les miennes d'abord (logos Orange, Airtel, banques…), puis celles de Wallo, puis les icônes simples
  const sections: { title: string | null; ids: string[] }[] = [
    { title: 'Mes icônes', ids: mine.filter(match).map((i) => i.id) },
    ...groupByFolder(global.filter(match)).map((g) => ({ title: g.folder, ids: g.items.map((i) => i.id) })),
    { title: custom.length ? 'Simples' : null, ids: q ? [] : choices },
  ].filter((s) => s.ids.length > 0);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permet de rechoisir la même image
    if (!file) return;
    try {
      setError('');
      onImage(await resizeImage(file));
    } catch {
      setError('Cette image ne peut pas être lue. Essaie une photo JPG ou PNG.');
    }
  };

  const tile = 'h-10 rounded-xl flex items-center justify-center cursor-pointer';
  return (
    <div className="mb-4">
      <input ref={fileInput} type="file" accept="image/*" onChange={onPick} className="hidden" />
      {custom.length > 12 && (
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher (ex. Orange, Rawbank)"
          className="w-full mb-2 px-3.5 py-2 rounded-xl bg-slate-100 text-sm outline-none focus:ring-2 focus:ring-accent"
        />
      )}
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      {sections.length === 0 && <p className="text-xs text-slate-400 py-3 text-center">Aucune icône pour « {query.trim()} »</p>}
      {sections.map((s, i) => (
        <div key={s.title ?? 'base'}>
          {s.title && <div className="text-[12px] font-semibold text-slate-500 mt-2 mb-1 px-0.5">{s.title}</div>}
          <div className="grid grid-cols-7 gap-1">
            {/* Une photo à soi : la première case */}
            {i === 0 && (
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                aria-label={image ? 'Changer la photo' : 'Choisir une photo'}
                title={image ? 'Changer la photo' : 'Choisir une photo'}
                className={`${tile} overflow-hidden ${image ? 'sel-ring' : 'bg-slate-100 hover:bg-slate-200'}`}
              >
                {image ? <img src={image} alt="" className="w-full h-full object-cover" /> : <ImagePlus className="w-5 h-5 text-slate-500" />}
              </button>
            )}
            {s.ids.map((name) => {
              const on = !image && icon === name;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    onIcon(name);
                    if (image) onImage(undefined); // une icône remplace la photo
                  }}
                  aria-label={custom.find((x) => x.id === name)?.name ?? name}
                  className={`${tile} ${on ? 'sel-ring' : 'hover:bg-slate-100'}`}
                  style={on ? { backgroundColor: color + '22' } : undefined}
                >
                  <AppIcon name={name} className="w-5 h-5" style={{ color: on ? color : '#475569' }} />
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {!custom.length && <p className="text-[12px] text-slate-400 mt-2">Tes propres logos (Orange, Airtel, ta banque…) : Paramètres › Mes données › Mes icônes.</p>}
    </div>
  );
};

export const COLOR_CHOICES = ['#F97316', '#EAB308', '#EF4444', '#EC4899', '#8B5CF6', '#3B82F6', '#0EA5E9', '#14B8A6', '#059669', '#64748B'];

// Panoplie de couleurs : les vives, puis les foncées, puis les neutres (toutes lisibles avec du texte blanc)
const PALETTE = [
  '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16', '#22C55E', '#10B981', '#14B8A6', '#06B6D4',
  '#0EA5E9', '#3B82F6', '#6366F1', '#8B5CF6', '#A855F7', '#D946EF', '#EC4899', '#F43F5E', '#059669',
  '#B91C1C', '#C2410C', '#B45309', '#A16207', '#4D7C0F', '#15803D', '#047857', '#0F766E', '#0E7490',
  '#0369A1', '#1D4ED8', '#4338CA', '#6D28D9', '#7E22CE', '#A21CAF', '#BE185D', '#BE123C', '#92400E',
  '#64748B', '#475569', '#334155', '#1E293B', '#0F172A', '#78716C', '#57534E', '#44403C',
];

// Choix de la couleur : la palette + « Autre couleur » (sélecteur du téléphone / de l'ordinateur)
export const ColorPicker: React.FC<{ value: string; onChange: (color: string) => void }> = ({ value, onChange }) => {
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const isCustom = !PALETTE.some((c) => same(c, value));
  const ring = 'ring-2 ring-offset-2 ring-[var(--sel-ring)]';

  return (
    // 9 par ligne, étalées sur toute la largeur (44 couleurs + « Autre » = 5 lignes pleines)
    <div className="grid grid-cols-9 gap-2 mt-1 mb-4">
      {PALETTE.map((col) => (
        <button
          key={col}
          type="button"
          onClick={() => { haptic(); onChange(col); }}
          aria-label={`Couleur ${col}`}
          aria-pressed={same(col, value)}
          className={`w-full aspect-square rounded-full border border-white/10 cursor-pointer ${same(col, value) ? ring : ''}`}
          style={{ backgroundColor: col }}
        />
      ))}
      <label
        title="Autre couleur"
        className={`relative w-full aspect-square rounded-full cursor-pointer flex items-center justify-center overflow-hidden ${isCustom ? ring : ''}`}
        style={{ background: isCustom ? value : 'conic-gradient(#EF4444, #EAB308, #22C55E, #06B6D4, #3B82F6, #A855F7, #EC4899, #EF4444)' }}
      >
        <Pipette className="w-3.5 h-3.5 text-white drop-shadow" />
        <input
          type="color"
          value={value.length === 7 ? value.toLowerCase() : '#000000'}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          aria-label="Autre couleur"
          className="absolute inset-0 opacity-0 cursor-pointer"
        />
      </label>
    </div>
  );
};
