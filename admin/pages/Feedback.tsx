import React, { useEffect, useState } from 'react';
import { Frown, Annoyed, Meh, Smile, Laugh, Lightbulb, Bug, MessageCircle, Check, Eye, Trash2, RefreshCw, Inbox } from 'lucide-react';
import { api, errorText, FeedbackRow } from '../api';
import { Button, Card, dateFr, ErrorLine, Loading } from '../ui';

// Avis envoyés depuis l'app (Profil › Donner mon avis) : à lire, puis marquer « traité ».

const MOOD = [null, { Icon: Frown, color: '#EF4444' }, { Icon: Annoyed, color: '#F97316' }, { Icon: Meh, color: '#F59E0B' }, { Icon: Smile, color: '#22C55E' }, { Icon: Laugh, color: '#10B981' }];
const KIND = {
  idea: { label: 'Idée', Icon: Lightbulb, cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
  problem: { label: 'Problème', Icon: Bug, cls: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-300' },
  other: { label: 'Autre', Icon: MessageCircle, cls: 'bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300' },
};
type Filter = 'all' | FeedbackRow['status'];
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'new', label: 'Nouveaux' },
  { id: 'read', label: 'Lus' },
  { id: 'done', label: 'Traités' },
  { id: 'all', label: 'Tous' },
];

export const FeedbackPage: React.FC = () => {
  const [list, setList] = useState<FeedbackRow[] | null>(null);
  const [filter, setFilter] = useState<Filter>('new');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setBusy(true);
    setError('');
    try {
      setList(await api.feedback());
    } catch (e) {
      setError(errorText(e));
      setList([]);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    load();
  }, []);

  const setStatus = async (id: string, status: FeedbackRow['status']) => {
    setList((l) => l?.map((f) => (f.id === id ? { ...f, status } : f)) ?? null);
    try {
      await api.setFeedbackStatus(id, status);
    } catch (e) {
      setError(errorText(e));
      load();
    }
  };
  const remove = async (id: string) => {
    if (!confirm('Supprimer cet avis ?')) return;
    try {
      await api.deleteFeedback(id);
      setList((l) => l?.filter((f) => f.id !== id) ?? null);
    } catch (e) {
      setError(errorText(e));
    }
  };

  if (!list) return <Loading />;
  const shown = list.filter((f) => filter === 'all' || f.status === filter);
  const count = (s: Filter) => (s === 'all' ? list.length : list.filter((f) => f.status === s).length);
  const moods = list.filter((f) => f.mood).map((f) => f.mood!);
  const avg = moods.length ? moods.reduce((s, m) => s + m, 0) / moods.length : null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          ['Avis reçus', String(list.length)],
          ['À lire', String(count('new'))],
          ['Problèmes ouverts', String(list.filter((f) => f.kind === 'problem' && f.status !== 'done').length)],
          ['Satisfaction moyenne', avg ? `${avg.toFixed(1).replace('.', ',')} / 5` : '—'],
        ].map(([l, v]) => (
          <div key={l} className="bg-white dark:bg-[#151a21] rounded-2xl border border-slate-200/70 dark:border-white/5 p-4">
            <div className="text-[13px] text-slate-500">{l}</div>
            <div className="text-[24px] font-bold tabular-nums mt-0.5">{v}</div>
          </div>
        ))}
      </div>

      <Card
        right={
          <Button onClick={load} busy={busy}>
            {!busy && <RefreshCw className="w-4 h-4" />} Actualiser
          </Button>
        }
        title="Avis des utilisateurs"
        hint="Envoyés depuis Profil › Donner mon avis."
      >
        <div className="flex flex-wrap gap-1.5 mb-4">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-full text-[13px] font-semibold cursor-pointer transition ${
                filter === f.id ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-300'
              }`}
            >
              {f.label} <span className="opacity-60 tabular-nums">{count(f.id)}</span>
            </button>
          ))}
        </div>
        <ErrorLine text={error} />

        {shown.length === 0 ? (
          <div className="py-10 flex flex-col items-center text-center text-slate-500">
            <Inbox className="w-8 h-8 mb-2 opacity-60" />
            <p className="text-[14px]">Aucun avis ici.</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {shown.map((f) => {
              const m = f.mood ? MOOD[f.mood] : null;
              const k = KIND[f.kind];
              return (
                <li key={f.id} className={`rounded-2xl border p-4 ${f.status === 'new' ? 'border-accent/60 bg-accent/5' : 'border-slate-200/70 dark:border-white/5'}`}>
                  <div className="flex items-center gap-2 flex-wrap mb-2">
                    {m && <m.Icon className="w-5 h-5" style={{ color: m.color }} />}
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[12px] font-semibold ${k.cls}`}>
                      <k.Icon className="w-3.5 h-3.5" /> {k.label}
                    </span>
                    <span className="text-[13px] text-slate-500">{f.email ?? 'Sans compte'}</span>
                    <span className="text-[12px] text-slate-400 ml-auto">{dateFr(f.created_at, true)}</span>
                  </div>
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{f.message}</p>
                  {f.device && <p className="text-[11px] text-slate-400 mt-2 break-all">{f.app_version ? `v${f.app_version} · ` : ''}{f.device}</p>}
                  <div className="flex flex-wrap gap-2 mt-3">
                    {f.status !== 'read' && f.status !== 'done' && (
                      <Button onClick={() => setStatus(f.id, 'read')}>
                        <Eye className="w-4 h-4" /> Marquer lu
                      </Button>
                    )}
                    {f.status !== 'done' ? (
                      <Button kind="primary" onClick={() => setStatus(f.id, 'done')}>
                        <Check className="w-4 h-4" /> Traité
                      </Button>
                    ) : (
                      <Button onClick={() => setStatus(f.id, 'new')}>Rouvrir</Button>
                    )}
                    <Button kind="danger" onClick={() => remove(f.id)} aria-label="Supprimer">
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
