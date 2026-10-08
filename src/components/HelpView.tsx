import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronDown, Search, X, LifeBuoy, Smartphone } from 'lucide-react';
import { HELP_ARTICLES, HELP_CATEGORIES, HelpArticle } from '../data/help';
import { useRemoteConfig } from '../lib/remoteConfig';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { FeedbackSheet } from './FeedbackSheet';

// Aide et astuces : on cherche, ou on parcourt par thème. Les astuces du téléphone qu'on tient viennent en premier.
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const phone = (): 'iphone' | 'android' | null => {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) ? 'iphone' : /Android/.test(ua) ? 'android' : null;
};

// Texte -> paragraphes, puces et étapes
const Body: React.FC<{ text: string }> = ({ text }) => (
  <div className="space-y-2.5">
    {text.split(/\n{2,}/).map((block, i) => {
      const lines = block.split('\n');
      const bullets = lines.every((l) => /^- /.test(l));
      const steps = lines.every((l) => /^\d+\. /.test(l));
      if (bullets)
        return (
          <ul key={i} className="space-y-1.5">
            {lines.map((l, j) => (
              <li key={j} className="flex gap-2 text-[14px] text-slate-600 leading-snug">
                <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-slate-300 shrink-0" />
                <span>{l.slice(2)}</span>
              </li>
            ))}
          </ul>
        );
      if (steps)
        return (
          <ol key={i} className="space-y-2">
            {lines.map((l, j) => (
              <li key={j} className="flex gap-2.5 text-[14px] text-slate-600 leading-snug">
                <span className="w-5 h-5 rounded-full bg-slate-100 text-[11px] font-bold text-slate-600 flex items-center justify-center shrink-0 mt-px">{j + 1}</span>
                <span>{l.replace(/^\d+\. /, '')}</span>
              </li>
            ))}
          </ol>
        );
      return (
        <p key={i} className="text-[14px] text-slate-600 leading-relaxed [text-wrap:pretty]">
          {block}
        </p>
      );
    })}
  </div>
);

export const HelpView: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const desktop = useIsDesktop();
  const remote = useRemoteConfig();
  const mine = phone();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('Tout');
  const [open, setOpen] = useState<string | null>(null);
  const [feedback, setFeedback] = useState(false);

  const all = useMemo(() => [...HELP_ARTICLES, ...remote.help], [remote.help]);
  const cats = useMemo(() => ['Tout', ...HELP_CATEGORIES, ...[...new Set(remote.help.map((h) => h.category))].filter((c) => !HELP_CATEGORIES.includes(c))], [remote.help]);

  const list = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    return all
      .filter((a) => (cat === 'Tout' || a.category === cat) && words.every((w) => norm(`${a.title} ${a.body} ${a.category}`).includes(w)))
      // les astuces de ce téléphone d'abord, quand on ne cherche rien de précis
      .sort((a, b) => Number(b.platform === mine && !!mine) - Number(a.platform === mine && !!mine));
  }, [all, q, cat, mine]);

  const row = (a: HelpArticle) => {
    const on = open === a.id;
    return (
      <div key={a.id}>
        <button onClick={() => setOpen(on ? null : a.id)} aria-expanded={on} className="w-full flex items-center gap-3 px-4 py-3.5 text-left cursor-pointer active:bg-slate-50 transition-colors">
          <span className="flex-1 min-w-0">
            <span className="block text-[15px] font-semibold text-slate-900">{a.title}</span>
            {(q || cat === 'Tout') && (
              <span className="flex items-center gap-1 text-[12px] text-slate-400 mt-0.5">
                {a.platform && <Smartphone className="w-3 h-3" />}
                {a.category}
              </span>
            )}
          </span>
          <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-300 ${on ? 'rotate-180' : ''}`} />
        </button>
        <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${on ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
          <div className="overflow-hidden">
            <div className="px-4 pb-4">
              <Body text={a.body} />
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={desktop ? 'max-w-3xl animate-screen' : 'px-5 pt-4 pb-8 animate-screen'}>
      <div className={`${desktop ? 'desk-head' : 'page-head'} flex items-center gap-3 mb-4`}>
        {!desktop && (
          <button onClick={onBack} aria-label="Retour" className="w-11 h-11 shrink-0 rounded-full bg-white border border-slate-100 flex items-center justify-center cursor-pointer">
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        <h1 className="flex-1 text-xl font-bold text-slate-900">Aide et astuces</h1>
      </div>

      {/* Recherche */}
      <label className="flex items-center gap-2.5 h-12 px-4 rounded-2xl bg-white border border-slate-100 mb-3 focus-within:ring-2 focus-within:ring-accent">
        <Search className="w-[18px] h-[18px] text-slate-400 shrink-0" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Que cherches-tu ? (ex. budget, iPhone)"
          aria-label="Chercher dans l’aide"
          className="flex-1 min-w-0 bg-transparent text-[15px] text-slate-900 outline-none field-plain"
        />
        {q && (
          <button onClick={() => setQ('')} aria-label="Effacer" className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </label>

      {/* Thèmes */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-5 px-5 mb-4">
        {cats.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            aria-pressed={cat === c}
            className={`shrink-0 h-9 px-3.5 rounded-full text-[13px] font-semibold cursor-pointer transition ${cat === c ? 'is-selected' : 'bg-white border border-slate-100 text-slate-600'}`}
          >
            {c}
          </button>
        ))}
      </div>

      {mine === 'iphone' && cat === 'Tout' && !q && (
        <button onClick={() => setCat('iPhone et Android')} className="w-full flex items-center gap-3 p-3.5 mb-4 rounded-2xl bg-white border border-slate-100 text-left cursor-pointer active:scale-[0.99] transition">
          <span className="w-10 h-10 rounded-full bg-sky-500/10 text-sky-500 flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[14px] font-semibold text-slate-900">Astuces pour ton iPhone</span>
            <span className="block text-[12px] text-slate-500">Installer l’app, notifications, Face ID, vibrations</span>
          </span>
        </button>
      )}

      {list.length === 0 ? (
        <div className="bg-white rounded-3xl border border-slate-100 p-6 text-center">
          <span className="w-14 h-14 mx-auto rounded-full bg-slate-100 flex items-center justify-center mb-3">
            <LifeBuoy className="w-6 h-6 text-slate-400" />
          </span>
          <p className="text-[15px] font-semibold text-slate-900">Aucune réponse trouvée</p>
          <p className="text-[13px] text-slate-500 mt-1">Essaie un autre mot, ou écris-nous : on te répond.</p>
        </div>
      ) : (
        <div className="bg-white rounded-3xl border border-slate-100 overflow-hidden divide-y divide-slate-100">{list.map(row)}</div>
      )}

      <button onClick={() => setFeedback(true)} className="mt-5 mx-auto flex items-center gap-1.5 h-10 px-4 rounded-full bg-slate-100 text-[13px] font-semibold text-slate-700 cursor-pointer active:scale-95 transition">
        Je n’ai pas trouvé ma réponse
      </button>
      {feedback && <FeedbackSheet onClose={() => setFeedback(false)} />}
    </div>
  );
};
