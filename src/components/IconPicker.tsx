import React, { useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { AppIcon } from './AppIcon';
import { resizeImage } from '../lib/resizeImage';
import { useCustomIcons } from '../lib/customIcons';

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
  const custom = useCustomIcons();
  const all = [...choices, ...custom.map((i) => i.id)];

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

  return (
    <>
      <label className="text-xs font-semibold text-slate-500">Icône</label>
      <input ref={fileInput} type="file" accept="image/*" onChange={onPick} className="hidden" />
      <div className="flex gap-2 mt-1 mb-2">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="flex-1 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-sm font-semibold flex items-center justify-center gap-2 cursor-pointer"
        >
          <ImagePlus className="w-4 h-4" />
          {image ? "Changer l'image" : 'Choisir une image'}
        </button>
        {image && (
          <button
            type="button"
            onClick={() => onImage(undefined)}
            className="px-4 py-2.5 rounded-2xl bg-slate-100 hover:bg-red-50 text-sm font-semibold text-slate-600 cursor-pointer"
          >
            Retirer
          </button>
        )}
      </div>
      {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
      {!image && <p className="text-xs text-slate-400 mb-1">Ou choisis une icône (ajoute les tiennes dans Paramètres › Mes icônes) :</p>}
      <div className={`grid grid-cols-7 gap-1 mt-1 mb-4 ${image ? 'hidden' : ''}`}>
        {all.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => onIcon(name)}
            aria-label={custom.find((i) => i.id === name)?.name ?? name}
            className={`h-10 rounded-xl flex items-center justify-center cursor-pointer ${
              icon === name ? 'ring-2 ring-slate-900' : 'hover:bg-slate-100'
            }`}
            style={icon === name ? { backgroundColor: color + '22' } : undefined}
          >
            <AppIcon name={name} className="w-5 h-5" style={{ color: icon === name ? color : '#475569' }} />
          </button>
        ))}
      </div>
    </>
  );
};

export const COLOR_CHOICES = ['#F97316', '#EAB308', '#EF4444', '#EC4899', '#8B5CF6', '#3B82F6', '#0EA5E9', '#14B8A6', '#059669', '#64748B'];
