import React, { useEffect, useState } from 'react';
import { api, errorText, Feature } from '../api';
import { Card, dateFr, ErrorLine, Loading, Switch } from '../ui';

// Fonctionnalités : activer / couper une partie de Wallo pour tout le monde, sans redéployer l'app.
// Les données ne sont jamais effacées : elles réapparaissent quand on réactive.
export const FeaturesPage: React.FC = () => {
  const [list, setList] = useState<Feature[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const load = () => api.features().then(setList).catch((e) => { setError(errorText(e)); setList([]); });
  useEffect(() => {
    load();
  }, []);

  const toggle = async (f: Feature, enabled: boolean) => {
    setBusy(f.key);
    setError('');
    setList((l) => l?.map((x) => (x.key === f.key ? { ...x, enabled } : x)) ?? l); // affichage immédiat
    try {
      await api.setFeature(f.key, enabled);
      await load();
    } catch (e) {
      setError(errorText(e));
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card hint="Le changement arrive dans l'app à sa prochaine ouverture (ou au retour dans l'app, au plus tard 5 minutes après). Couper une fonctionnalité cache ses boutons, sans effacer aucune donnée.">
      <ErrorLine text={error} />
      {!list ? (
        <Loading />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-white/5">
          {list.map((f) => (
            <li key={f.key} className="py-3.5 flex items-center gap-4">
              <div className="flex-1 min-w-0">
                <div className="text-[15px] font-semibold">{f.label}</div>
                <div className="text-[13px] text-slate-500">{f.description}</div>
                <div className="text-[12px] text-slate-400 mt-0.5">Modifié le {dateFr(f.updated_at, true)}</div>
              </div>
              <span className={`text-[13px] font-semibold ${f.enabled ? 'text-emerald-600' : 'text-slate-400'}`}>{f.enabled ? 'Activée' : 'Coupée'}</span>
              <Switch label={f.label} checked={f.enabled} disabled={busy === f.key} onChange={(v) => toggle(f, v)} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
};
