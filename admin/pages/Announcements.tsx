import React, { useEffect, useState } from 'react';
import { Trash2, Send } from 'lucide-react';
import { Announcement, api, errorText } from '../api';
import { Button, Card, dateFr, ErrorLine, inputCls, Loading, Switch } from '../ui';

const KINDS: { id: Announcement['kind']; label: string }[] = [
  { id: 'info', label: 'Information' },
  { id: 'update', label: 'Nouveauté' },
  { id: 'warning', label: 'Important' },
];

// Annonces : elles arrivent dans les notifications de tout le monde (une seule fois par appareil)
export const AnnouncementsPage: React.FC = () => {
  const [list, setList] = useState<Announcement[] | null>(null);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [kind, setKind] = useState<Announcement['kind']>('info');
  const [until, setUntil] = useState(''); // AAAA-MM-JJ, facultatif
  const [push, setPush] = useState(true); // aussi en notification sur les téléphones (même app fermée)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = () => api.announcements().then(setList).catch((e) => { setError(errorText(e)); setList([]); });
  useEffect(() => {
    load();
  }, []);

  const publish = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const a = { title: title.trim(), message: message.trim(), kind, expires_at: until ? new Date(`${until}T23:59:59`).toISOString() : null };
      // Sans la colonne push (migration 20261009000000_push.sql pas encore lancée) : annonce seule
      await api.addAnnouncement(push ? { ...a, push } : a);
      setTitle('');
      setMessage('');
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

  return (
    <div className="space-y-4">
      <Card title="Nouvelle annonce" hint="Elle apparaît dans les notifications de chaque personne à sa prochaine ouverture de Wallo (connectée ou non).">
        <form onSubmit={publish} className="space-y-3">
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} required placeholder="Titre (ex. Nouveau : suggestions de notes)" className={inputCls} />
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            maxLength={600}
            required
            rows={3}
            placeholder="Message (600 caractères max.)"
            className={`${inputCls} resize-y`}
          />
          <div className="flex flex-wrap gap-3 items-end">
            <label className="text-[13px] text-slate-500">
              Type
              <select value={kind} onChange={(e) => setKind(e.target.value as Announcement['kind'])} className={`${inputCls} mt-1 w-auto`}>
                {KINDS.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[13px] text-slate-500">
              Visible jusqu'au (facultatif)
              <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className={`${inputCls} mt-1 w-auto`} />
            </label>
            <label className="flex items-center gap-2 text-[13px] text-slate-600 dark:text-slate-300 cursor-pointer pb-2.5">
              <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)} className="w-4 h-4 accent-current" />
              Envoyer aussi en notification (téléphones abonnés, même app fermée)
            </label>
            <Button kind="primary" type="submit" busy={busy} disabled={!title.trim() || !message.trim()} className="ml-auto py-2.5">
              {!busy && <Send className="w-4 h-4" />} Publier
            </Button>
          </div>
        </form>
        <ErrorLine text={error} />
      </Card>

      <Card title="Annonces publiées" hint="Désactiver une annonce la retire pour ceux qui ne l'ont pas encore reçue.">
        {!list ? (
          <Loading />
        ) : list.length === 0 ? (
          <p className="text-[14px] text-slate-500 text-center py-6">Aucune annonce pour l'instant.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/5">
            {list.map((a) => {
              const expired = !!a.expires_at && new Date(a.expires_at) < new Date();
              return (
                <li key={a.id} className="py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[15px] font-semibold">{a.title}</span>
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300">
                        {KINDS.find((k) => k.id === a.kind)?.label}
                      </span>
                      {expired && <span className="text-[11px] font-semibold text-amber-600">Expirée</span>}
                      {a.push && <span className="text-[11px] font-semibold text-emerald-600">Notification envoyée</span>}
                    </div>
                    <p className="text-[14px] text-slate-600 dark:text-slate-300 mt-0.5 whitespace-pre-line">{a.message}</p>
                    <p className="text-[12px] text-slate-500 mt-1">
                      Publiée le {dateFr(a.created_at, true)}
                      {a.expires_at && ` · jusqu'au ${dateFr(a.expires_at)}`}
                    </p>
                  </div>
                  <Switch label="Annonce active" checked={a.active} onChange={(v) => run(() => api.setAnnouncementActive(a.id, v))} />
                  <Button kind="danger" aria-label="Supprimer l'annonce" onClick={() => confirm('Supprimer cette annonce ?') && run(() => api.deleteAnnouncement(a.id))}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
};
