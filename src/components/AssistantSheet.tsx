import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, Laptop, RotateCcw, Settings2, Sparkles, X } from 'lucide-react';
import { AssistantConfig, ChatMessage, DEFAULT_URL, askAssistant, buildContext, ping, readConfig, saveConfig } from '../lib/assistant';
import { haptic } from '../lib/haptics';

// « Demande à Wallo » : une question sur tes finances, Claude répond depuis ton ordinateur.
// Écran épuré : la conversation, des idées de questions, une barre pour écrire.

const IDEAS = ['Où part mon argent ce mois-ci ?', 'Est-ce que je dépense plus que d’habitude ?', 'Comment tenir mes budgets ?', 'Combien je peux mettre de côté ?'];
const CHAT_KEY = 'ap.assistantChat';

type Status = 'checking' | 'ok' | 'off' | 'bad-code';

const loadChat = (): ChatMessage[] => {
  try {
    return JSON.parse(localStorage.getItem(CHAT_KEY) ?? '[]');
  } catch {
    return [];
  }
};

export const AssistantSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [config, setConfig] = useState<AssistantConfig | null>(readConfig);
  const [setup, setSetup] = useState(!config);
  const [status, setStatus] = useState<Status>('checking');
  const [messages, setMessages] = useState<ChatMessage[]>(loadChat);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // L'ordinateur répond-il ? (à l'ouverture et quand le réglage change)
  useEffect(() => {
    if (!config) return;
    let on = true;
    setStatus('checking');
    ping(config).then((s) => on && setStatus(s));
    return () => {
      on = false;
    };
  }, [config]);

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_KEY, JSON.stringify(messages.slice(-40)));
    } catch {
      /* stockage plein */
    }
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy || !config) return;
    haptic();
    const history = messages;
    setMessages((m) => [...m, { role: 'user', text: q }]);
    setDraft('');
    setBusy(true);
    try {
      const answer = await askAssistant(config, q, buildContext(), history);
      setMessages((m) => [...m, { role: 'assistant', text: answer }]);
      setStatus('ok');
    } catch (e) {
      setMessages((m) => [...m, { role: 'assistant', text: e instanceof Error ? e.message : 'Une erreur est survenue.', error: true }]);
      ping(config).then(setStatus);
    } finally {
      setBusy(false);
    }
  };

  // Barre d'écriture qui grandit avec le texte (jusqu'à 5 lignes)
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [draft]);

  const statusText =
    status === 'ok' ? 'Ton ordinateur est connecté' : status === 'checking' ? 'Connexion à ton ordinateur…' : status === 'bad-code' ? 'Code incorrect' : 'Ton ordinateur ne répond pas';
  const dot = status === 'ok' ? 'bg-emerald-500' : status === 'checking' ? 'bg-slate-300 animate-pulse' : 'bg-amber-500';

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
      <div
        className="w-full sm:max-w-[520px] h-[94dvh] sm:h-[82vh] flex flex-col bg-white rounded-t-[32px] sm:rounded-[32px] overflow-hidden animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête */}
        <div className="flex items-center gap-2 px-5 pt-5 pb-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-[17px] font-bold text-slate-900">Demande à Wallo</h2>
            {!setup && (
              <p className="flex items-center gap-1.5 text-[12px] text-slate-500 mt-0.5">
                <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                {statusText}
              </p>
            )}
          </div>
          {!setup && messages.length > 0 && (
            <button onClick={() => setMessages([])} aria-label="Nouvelle conversation" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
              <RotateCcw className="w-4 h-4" />
            </button>
          )}
          {!setup && (
            <button onClick={() => setSetup(true)} aria-label="Réglages de l'assistant" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
              <Settings2 className="w-4 h-4" />
            </button>
          )}
          <button onClick={onClose} aria-label="Fermer" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        {setup ? (
          <Setup
            config={config}
            onSave={(c) => {
              saveConfig(c);
              setConfig(c);
              setSetup(false);
            }}
            onCancel={config ? () => setSetup(false) : undefined}
            onForget={
              config
                ? () => {
                    saveConfig(null);
                    setConfig(null);
                    setMessages([]);
                  }
                : undefined
            }
          />
        ) : (
          <>
            {/* Conversation */}
            <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto px-5 pb-4">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-2">
                  <span className="w-14 h-14 rounded-full bg-accent/40 flex items-center justify-center mb-3">
                    <Sparkles className="w-6 h-6 text-slate-900" />
                  </span>
                  <p className="text-[16px] font-bold text-slate-900">Pose une question sur ton argent</p>
                  <p className="text-[13px] text-slate-500 mt-1 max-w-[300px]">Wallo regarde tes portefeuilles, tes dépenses et tes budgets pour te répondre.</p>
                  <div className="mt-5 w-full space-y-2">
                    {IDEAS.map((q) => (
                      <button
                        key={q}
                        onClick={() => send(q)}
                        disabled={status !== 'ok'}
                        className="w-full text-left px-4 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200/70 text-[14px] text-slate-700 cursor-pointer transition active:scale-[0.99] disabled:opacity-50 disabled:cursor-default"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                  {status !== 'ok' && status !== 'checking' && <OffHint status={status} onRetry={() => config && ping(config).then(setStatus)} />}
                </div>
              ) : (
                <div className="space-y-3 pt-1">
                  {messages.map((msg, i) =>
                    msg.role === 'user' ? (
                      <div key={i} className="flex justify-end">
                        <p className="max-w-[85%] px-4 py-2.5 rounded-[20px] rounded-br-md bg-accent text-[14.5px] leading-snug whitespace-pre-wrap break-words">{msg.text}</p>
                      </div>
                    ) : (
                      <div key={i} className={`max-w-[92%] text-[14.5px] leading-relaxed ${msg.error ? 'text-amber-700' : 'text-slate-800'}`}>
                        <Answer text={msg.text} />
                      </div>
                    )
                  )}
                  {busy && (
                    <div className="flex items-center gap-1.5 py-2" aria-label="Wallo réfléchit">
                      {[0, 1, 2].map((i) => (
                        <span key={i} className="w-2 h-2 rounded-full bg-slate-300 animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Barre pour écrire */}
            <div className="px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] border-t border-slate-100">
              <div className="flex items-end gap-2 rounded-[24px] bg-slate-100 pl-4 pr-1.5 py-1.5">
                <textarea
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      send(draft);
                    }
                  }}
                  rows={1}
                  placeholder="Écris ta question…"
                  aria-label="Ta question"
                  className="field-plain flex-1 min-w-0 resize-none bg-transparent py-2 text-[15px] leading-snug text-slate-900 outline-none placeholder:text-slate-400"
                />
                <button
                  onClick={() => send(draft)}
                  disabled={!draft.trim() || busy}
                  aria-label="Envoyer"
                  className="w-9 h-9 shrink-0 rounded-full bg-accent hover:bg-accent-hover flex items-center justify-center cursor-pointer transition active:scale-95 disabled:opacity-30 disabled:cursor-default"
                >
                  <ArrowUp className="w-4.5 h-4.5 stroke-[2.5]" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// Ordinateur éteint / code faux : quoi faire, en une phrase
const OffHint: React.FC<{ status: Status; onRetry: () => void }> = ({ status, onRetry }) => (
  <div className="mt-5 w-full rounded-2xl bg-amber-500/10 px-4 py-3 text-left">
    <p className="text-[13px] text-slate-700 leading-snug">
      {status === 'bad-code' ? (
        <>Le code ne correspond pas. Touche ⚙︎ et recolle celui affiché sur ton ordinateur.</>
      ) : (
        <>
          Allume ton ordinateur et lance <code className="font-mono text-[12px] px-1 py-0.5 rounded bg-white">npm run assistant</code> dans le dossier de Wallo.
        </>
      )}
    </p>
    <button onClick={onRetry} className="mt-2 text-[13px] font-bold text-amber-700 cursor-pointer">
      Réessayer
    </button>
  </div>
);

// Réglage : 3 étapes, un champ pour le code
const Setup: React.FC<{ config: AssistantConfig | null; onSave: (c: AssistantConfig) => void; onCancel?: () => void; onForget?: () => void }> = ({ config, onSave, onCancel, onForget }) => {
  const [code, setCode] = useState(config?.code ?? '');
  const [url, setUrl] = useState(config?.url ?? DEFAULT_URL);
  const [more, setMore] = useState(false);
  const [state, setState] = useState<'idle' | 'checking' | 'off' | 'bad-code'>('idle');

  const connect = async () => {
    const c = { url: url.trim().replace(/\/$/, '') || DEFAULT_URL, code: code.trim().toUpperCase() };
    setState('checking');
    const s = await ping(c);
    if (s === 'ok') {
      haptic('success');
      onSave(c);
    } else setState(s);
  };

  const step = (n: number, children: React.ReactNode) => (
    <li className="flex gap-3">
      <span className="w-6 h-6 shrink-0 rounded-full bg-slate-100 text-[12px] font-bold text-slate-600 flex items-center justify-center">{n}</span>
      <span className="text-[14px] text-slate-700 leading-snug pt-0.5">{children}</span>
    </li>
  );

  return (
    <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="flex flex-col items-center text-center pt-2 pb-5">
        <span className="w-14 h-14 rounded-full bg-accent/40 flex items-center justify-center mb-3">
          <Laptop className="w-6 h-6 text-slate-900" />
        </span>
        <p className="text-[16px] font-bold text-slate-900">Ton assistant, sur ton ordinateur</p>
        <p className="text-[13px] text-slate-500 mt-1 max-w-[320px]">Il utilise Claude Code avec ton abonnement. Il répond quand ton ordinateur est allumé.</p>
      </div>

      <ol className="space-y-3 mb-5">
        {step(1, <>Sur ton ordinateur, ouvre le Terminal dans le dossier de Wallo.</>)}
        {step(2, <>Tape <code className="font-mono text-[13px] px-1.5 py-0.5 rounded-md bg-slate-100">npm run assistant</code> et laisse la fenêtre ouverte.</>)}
        {step(3, <>Colle ici le code qui s'affiche.</>)}
      </ol>

      <input
        value={code}
        onChange={(e) => {
          setCode(e.target.value.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 8));
          setState('idle');
        }}
        onKeyDown={(e) => e.key === 'Enter' && code.length === 8 && connect()}
        placeholder="Code à 8 caractères"
        aria-label="Code de l'assistant"
        autoCapitalize="characters"
        spellCheck={false}
        className="field-plain w-full h-14 px-4 rounded-2xl bg-slate-100 text-center text-[20px] font-bold tracking-[0.3em] font-mono text-slate-900 outline-none focus:ring-2 focus:ring-accent placeholder:text-[14px] placeholder:font-sans placeholder:tracking-normal placeholder:font-medium placeholder:text-slate-400"
      />

      {state === 'off' && <p className="text-[13px] text-amber-700 mt-2 text-center">Ton ordinateur ne répond pas : la commande tourne-t-elle ? (Wallo doit être ouvert sur ce même ordinateur.)</p>}
      {state === 'bad-code' && <p className="text-[13px] text-amber-700 mt-2 text-center">Ce code ne correspond pas à celui de ton ordinateur.</p>}

      <button
        onClick={connect}
        disabled={code.length !== 8 || state === 'checking'}
        className="mt-4 w-full h-12 rounded-2xl bg-accent hover:bg-accent-hover text-[15px] font-bold cursor-pointer transition active:scale-[0.98] disabled:opacity-40 disabled:cursor-default"
      >
        {state === 'checking' ? 'Connexion…' : 'Connecter'}
      </button>
      {onCancel && (
        <button onClick={onCancel} className="mt-2 w-full h-11 rounded-2xl text-[14px] font-semibold text-slate-500 cursor-pointer">
          Annuler
        </button>
      )}

      <p className="text-[12px] text-slate-400 mt-5 leading-snug text-center">
        Avec chaque question, toutes tes données Wallo passent par ton ordinateur et sont lues par Claude (en lecture seule) pour te répondre. Elles sont effacées de l'ordinateur quand tu arrêtes l'assistant.
      </p>

      <div className="mt-4 text-center">
        <button onClick={() => setMore((v) => !v)} className="text-[12px] font-semibold text-slate-400 cursor-pointer">
          {more ? 'Masquer' : 'Réglages avancés'}
        </button>
      </div>
      {more && (
        <div className="mt-3 space-y-3 animate-fade-in">
          <label className="block">
            <span className="text-[12px] text-slate-500">Adresse de l'ordinateur</span>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              spellCheck={false}
              className="field-plain mt-1 w-full h-11 px-3 rounded-xl bg-slate-100 text-[14px] font-mono outline-none focus:ring-2 focus:ring-accent"
            />
          </label>
          {onForget && (
            <button onClick={onForget} className="w-full h-11 rounded-xl bg-slate-100 text-[14px] font-semibold text-red-600 cursor-pointer">
              Déconnecter et effacer la conversation
            </button>
          )}
        </div>
      )}
    </div>
  );
};

// Réponse : paragraphes, listes à tirets et **gras**, sans plus
const Answer: React.FC<{ text: string }> = ({ text }) => {
  const bold = (s: string) => s.split(/(\*\*[^*]+\*\*)/g).map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <b key={i} className="font-semibold text-slate-900">{p.slice(2, -2)}</b> : p));
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="space-y-2.5">
      {blocks.map((b, i) => {
        const lines = b.split('\n').filter((l) => l.trim());
        if (lines.length && lines.every((l) => /^\s*([-•*]|\d+[.)])\s+/.test(l)))
          return (
            <ul key={i} className="space-y-1.5">
              {lines.map((l, j) => (
                <li key={j} className="flex gap-2">
                  <span className="mt-[9px] w-1.5 h-1.5 shrink-0 rounded-full bg-slate-300" />
                  <span className="min-w-0">{bold(l.replace(/^\s*([-•*]|\d+[.)])\s+/, ''))}</span>
                </li>
              ))}
            </ul>
          );
        return (
          <p key={i} className="whitespace-pre-wrap break-words">
            {bold(b.replace(/^#+\s*/gm, ''))}
          </p>
        );
      })}
    </div>
  );
};
