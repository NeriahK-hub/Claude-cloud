import React, { useEffect, useState } from 'react';
import { Plus, Sparkles, Trash2, UserPlus } from 'lucide-react';
import { api, errorText, Feature, ProAccessRow, ProFeatureRow } from '../api';
import { Button, Card, dateFr, ErrorLine, inputCls, Loading, Switch } from '../ui';

// Wallo Pro : allumer l'offre, dire ce qui est gratuit et ce qui est Pro, donner l'accès à un compte.
// Pas de prix ni de paiement pour l'instant. L'offre n'apparaît dans l'app (Profil) que si elle est allumée.
export const ProPage: React.FC = () => {
  const [flag, setFlag] = useState<Feature | null | undefined>(undefined);
  const [items, setItems] = useState<ProFeatureRow[] | null>(null);
  const [access, setAccess] = useState<ProAccessRow[] | null>(null);
  const [label, setLabel] = useState('');
  const [description, setDescription] = useState('');
  const [tier, setTier] = useState<'free' | 'pro'>('pro');
  const [email, setEmail] = useState('');
  const [until, setUntil] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => {
    api.features().then((l) => setFlag(l.find((f) => f.key === 'pro') ?? null)).catch((e) => { setError(errorText(e)); setFlag(null); });
    api.proFeatures().then(setItems).catch((e) => { setError(errorText(e)); setItems([]); });
    api.proAccess().then(setAccess).catch((e) => { setError(errorText(e)); setAccess([]); });
  };
  useEffect(load, []);

  const run = async (fn: () => Promise<void>, after?: () => void) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      after?.();
      load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const section = (t: 'free' | 'pro') => (items ?? []).filter((i) => i.tier === t);
  const row = (i: ProFeatureRow) => (
    <li key={i.id} className="py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="text-[15px] font-semibold">{i.label}</div>
        {i.description && <div className="text-[13px] text-slate-500">{i.description}</div>}
      </div>
      <Button onClick={() => run(() => api.setProTier(i.id, i.tier === 'pro' ? 'free' : 'pro'))}>{i.tier === 'pro' ? 'Rendre gratuit' : 'Rendre Pro'}</Button>
      <Button kind="danger" aria-label="Retirer" onClick={() => confirm('Retirer cette ligne de la liste ?') && run(() => api.deleteProFeature(i.id))}>
        <Trash2 className="w-4 h-4" />
      </Button>
    </li>
  );

  return (
    <div className="space-y-4">
      <Card title="L'offre Wallo Pro" hint="Éteinte : personne ne voit « Passer à Wallo Pro » dans Profil. Allumée : tout le monde voit la liste ci-dessous, et les comptes de la dernière carte ont l'accès Pro. Aucun prix pour l'instant.">
        {flag === undefined ? (
          <Loading />
        ) : flag === null ? (
          <p className="text-[14px] text-slate-500">La base n'est pas encore à jour : exécute la migration 20261025 (Pro) dans Supabase.</p>
        ) : (
          <div className="flex items-center gap-4">
            <Sparkles className="w-5 h-5 text-slate-400" />
            <span className="flex-1 text-[15px] font-semibold">Afficher l'offre dans l'app</span>
            <span className={`text-[13px] font-semibold ${flag.enabled ? 'text-emerald-600' : 'text-slate-400'}`}>{flag.enabled ? 'Allumée' : 'Éteinte'}</span>
            <Switch label="Afficher l'offre" checked={flag.enabled} disabled={busy} onChange={(v) => run(() => api.setFeature('pro', v))} />
          </div>
        )}
      </Card>

      <Card title="Ce qui est Pro" hint="Pour l'instant c'est une liste d'information : rien n'est encore verrouillé dans l'app.">
        {!items ? <Loading /> : section('pro').length === 0 ? <p className="text-[14px] text-slate-500 py-2">Rien de Pro pour l'instant.</p> : <ul className="divide-y divide-slate-100 dark:divide-white/5">{section('pro').map(row)}</ul>}
      </Card>
      <Card title="Ce qui est gratuit">
        {!items ? <Loading /> : section('free').length === 0 ? <p className="text-[14px] text-slate-500 py-2">Rien de gratuit dans la liste.</p> : <ul className="divide-y divide-slate-100 dark:divide-white/5">{section('free').map(row)}</ul>}
      </Card>

      <Card title="Ajouter à la liste">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => api.addProFeature({ label: label.trim(), description: description.trim(), tier }, (items?.length ?? 0) + 1), () => { setLabel(''); setDescription(''); });
          }}
        >
          <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={80} required placeholder="Nom (ex. Rapports en PDF)" className={inputCls} />
          <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="Une phrase pour l'expliquer (facultatif)" className={inputCls} />
          <div className="flex gap-3 items-end">
            <label className="text-[13px] text-slate-500">
              Où le mettre
              <select value={tier} onChange={(e) => setTier(e.target.value as 'free' | 'pro')} className={`${inputCls} mt-1 w-auto`}>
                <option value="pro">Wallo Pro</option>
                <option value="free">Gratuit</option>
              </select>
            </label>
            <Button kind="primary" type="submit" busy={busy} disabled={!label.trim()} className="ml-auto py-2.5">
              {!busy && <Plus className="w-4 h-4" />} Ajouter
            </Button>
          </div>
        </form>
      </Card>

      <Card title="Donner l'accès Pro" hint="Le compte doit déjà exister (adresse e-mail de connexion). Sans date de fin, l'accès dure jusqu'à ce que tu le retires.">
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            run(() => api.grantPro(email.trim(), until ? new Date(`${until}T23:59:59`).toISOString() : null, note.trim()), () => { setEmail(''); setUntil(''); setNote(''); });
          }}
        >
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="adresse@exemple.com" className={inputCls} />
          <div className="flex flex-wrap gap-3 items-end">
            <label className="text-[13px] text-slate-500">
              Jusqu'au (facultatif)
              <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={`${inputCls} mt-1 w-auto`} />
            </label>
            <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="Note (ex. testeur, cadeau)" className={`${inputCls} flex-1 min-w-[160px]`} />
            <Button kind="primary" type="submit" busy={busy} disabled={!email.trim()} className="py-2.5">
              {!busy && <UserPlus className="w-4 h-4" />} Donner l'accès
            </Button>
          </div>
        </form>
        <ErrorLine text={error} />
        <div className="mt-4">
          {!access ? (
            <Loading />
          ) : access.length === 0 ? (
            <p className="text-[14px] text-slate-500 text-center py-4">Personne n'a l'accès Pro pour l'instant.</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-white/5">
              {access.map((a) => (
                <li key={a.user_id} className="py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[15px] font-semibold truncate">{a.email}</div>
                    <div className="text-[13px] text-slate-500">
                      {a.until ? `Jusqu'au ${dateFr(a.until)}` : 'Sans date de fin'} · donné le {dateFr(a.granted_at)}
                      {a.note ? ` · ${a.note}` : ''}
                    </div>
                  </div>
                  <Button kind="danger" onClick={() => confirm(`Retirer l'accès Pro à ${a.email} ?`) && run(() => api.revokePro(a.user_id))}>
                    Retirer
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
};
