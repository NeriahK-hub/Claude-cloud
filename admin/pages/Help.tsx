import React, { useEffect, useState } from 'react';
import { Trash2, Plus, Smartphone } from 'lucide-react';
import { api, errorText, HelpRow } from '../api';
import { Button, Card, dateFr, ErrorLine, inputCls, Loading, Switch } from '../ui';

const PLATFORMS: { id: '' | 'iphone' | 'android'; label: string }[] = [
  { id: '', label: 'Tous les téléphones' },
  { id: 'iphone', label: 'iPhone (astuce iPhone)' },
  { id: 'android', label: 'Android (astuce Android)' },
];
const CATEGORIES = ['Démarrer', 'Saisie', 'Suivi', 'Dettes et partage', 'Sécurité', 'iPhone et Android', 'Autres'];

// Aide : des articles qui s'ajoutent à ceux de l'app (Profil › Aide et astuces), sans mise à jour de l'app
export const HelpPage: React.FC = () => {
  const [list, setList] = useState<HelpRow[] | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('Autres');
  const [platform, setPlatform] = useState<'' | 'iphone' | 'android'>('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () => api.helpArticles().then(setList).catch((e) => { setError(errorText(e)); setList([]); });
  useEffect(() => {
    load();
  }, []);

  const publish = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.addHelp({ title: title.trim(), body: body.trim(), category, platform: platform || null });
      setTitle('');
      setBody('');
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

  return (
    <div className="space-y-4">
      <Card
        title="Nouvel article d'aide"
        hint="Il apparaît dans Profil › Aide et astuces de chaque personne (après quelques minutes). Une ligne vide sépare les paragraphes ; « - » au début d'une ligne fait une puce ; « 1. » une étape."
      >
        <form onSubmit={publish} className="space-y-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required placeholder="Titre (ex. Installer Wallo sur ton iPhone)" className={inputCls} />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={4000}
            required
            rows={7}
            placeholder={'Réponse (4 000 caractères max.)\n\n1. Première étape\n2. Deuxième étape'}
            className={`${inputCls} resize-y`}
          />
          <div className="flex flex-wrap gap-3 items-end">
            <label className="text-[13px] text-slate-500">
              Thème
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${inputCls} mt-1 w-auto`}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[13px] text-slate-500">
              Pour qui
              <select value={platform} onChange={(e) => setPlatform(e.target.value as '' | 'iphone' | 'android')} className={`${inputCls} mt-1 w-auto`}>
                {PLATFORMS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <Button kind="primary" type="submit" busy={busy} disabled={!title.trim() || !body.trim()} className="ml-auto py-2.5">
              {!busy && <Plus className="w-4 h-4" />} Publier
            </Button>
          </div>
        </form>
        <ErrorLine text={error} />
      </Card>

      <Card title="Articles publiés" hint="Désactiver un article le retire de l'aide, sans le supprimer.">
        {!list ? (
          <Loading />
        ) : list.length === 0 ? (
          <p className="text-[14px] text-slate-500 text-center py-6">Aucun article ajouté pour l'instant : l'aide de base de l'app suffit.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {list.map((a) => (
              <li key={a.id} className="py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[15px] font-semibold">{a.title}</span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300">{a.category}</span>
                    {a.platform && (
                      <span className="text-[11px] font-semibold text-sky-600 inline-flex items-center gap-1">
                        <Smartphone className="w-3 h-3" /> {a.platform === 'iphone' ? 'iPhone' : 'Android'}
                      </span>
                    )}
                  </div>
                  <p className="text-[14px] text-slate-600 dark:text-slate-300 mt-0.5 whitespace-pre-line line-clamp-3">{a.body}</p>
                  <p className="text-[12px] text-slate-500 mt-1">Publié le {dateFr(a.created_at, true)}</p>
                </div>
                <Switch label="Article actif" checked={a.active} onChange={(v) => run(() => api.setHelpActive(a.id, v))} />
                <Button kind="danger" aria-label="Supprimer l'article" onClick={() => confirm('Supprimer cet article ?') && run(() => api.deleteHelp(a.id))}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
};
