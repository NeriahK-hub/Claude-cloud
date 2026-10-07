import React, { useEffect, useState } from 'react';
import { X, Loader2, Plus, Undo2, Percent, ScanLine } from 'lucide-react';
import type { Cloud, DebtInviteInfo } from '../lib/sync/useCloud';
import { cleanCode, formatCode } from '../lib/invite';
import { frenchError, LoginSheet } from './Account';
import { formatMoney } from '../lib/money';
import { haptic } from '../lib/haptics';
import { IconBadge } from './AppIcon';
import type { Wallet } from '../types';

const PROBLEMS: Partial<Record<DebtInviteInfo['status'], string>> = {
  invalid: "Ce code n'existe pas. Vérifie-le (8 caractères, ex. K7P4-QX9M).",
  expired: "Ce lien a expiré ou a été annulé. Demande-en un nouveau à la personne qui te l'a envoyé.",
  blocked: "Trop de codes faux d'affilée. Réessaie dans une heure.",
  owner: "C'est ta propre dette : envoie ce lien à l'autre personne.",
  already: 'Tu suis déjà cette dette : elle est dans Dettes et prêts.',
  taken: "Quelqu'un d'autre suit déjà cette dette avec ce lien.",
};

const day = (iso: string) => new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

// « Suivre une dette partagée » : ouvert par un lien /d/CODE, ou depuis Dettes et prêts avec un code à taper
export const JoinDebtSheet: React.FC<{
  cloud: Cloud;
  initialCode: string; // '' = à taper
  profileName: string;
  people: string[]; // noms déjà utilisés dans mes dettes (pour reprendre le même)
  wallets: Wallet[]; // pour noter aussi l'historique dans un portefeuille (facultatif)
  onClose: () => void;
  onDone: (message: string, history?: { shareId: string; walletId: string }) => void;
  onScan?: () => void; // « Scanner un code QR » : ouvre le scanner de l'app
}> = ({ cloud, initialCode, people, wallets, onClose, onDone, onScan }) => {
  const [historyWallet, setHistoryWallet] = useState<string | null>(null);
  const [code, setCode] = useState(cleanCode(initialCode));
  const [checked, setChecked] = useState<string | null>(null);
  const [info, setInfo] = useState<DebtInviteInfo | null>(null);
  const [label, setLabel] = useState('');
  const [declining, setDeclining] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [login, setLogin] = useState(false);
  const ready = code.length === 8;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(frenchError(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
    }
  };
  const check = (c: string) =>
    run(async () => {
      setChecked(c);
      const res = await cloud.checkDebtInvite(c);
      setInfo(res);
      if (res.owner_name) setLabel((l) => l || res.owner_name!);
    });

  useEffect(() => {
    if (cloud.user && initialCode && checked === null) check(cleanCode(initialCode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cloud.user]);

  const field = 'w-full px-4 py-3 rounded-2xl bg-slate-100 text-base outline-none focus:ring-2 focus:ring-accent';
  const primary = 'w-full py-3.5 rounded-2xl bg-accent text-slate-900 text-sm font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40';
  const problem = info && PROBLEMS[info.status];
  const iOwe = info?.guest_side === 'payable';

  // Reste par devise (plus → la dette grandit, moins → remboursé)
  const byCurrency = new Map<string, number>();
  for (const m of info?.moves ?? []) byCurrency.set(m.currency, (byCurrency.get(m.currency) ?? 0) + (m.kind === 'repay' ? -m.amount : m.amount));
  const left = [...byCurrency].filter(([, v]) => Math.abs(v) > 0.004).map(([c, v]) => formatMoney(v, c)).join(' + ') || formatMoney(0, [...byCurrency.keys()][0] ?? 'CDF');
  const suggestions = people.filter((p) => p.toLowerCase() !== label.trim().toLowerCase()).slice(0, 6);

  let body: React.ReactNode;
  if (!cloud.configured) {
    body = <p className="text-sm text-slate-500">Les dettes partagées ne sont pas encore disponibles.</p>;
  } else if (!cloud.user) {
    body = (
      <>
        <p className="text-sm text-slate-500 mb-4">
          Pour suivre {initialCode ? 'cette dette' : 'une dette partagée'}, connecte-toi à Wallo. Pas de compte ? Il est créé tout de suite avec ton e-mail.
        </p>
        {initialCode && (
          <p className="text-xs text-slate-500 mb-4">
            Code : <b className="text-slate-800 tracking-wider">{formatCode(initialCode)}</b>
          </p>
        )}
        <button onClick={() => setLogin(true)} className={primary}>
          Se connecter pour continuer
        </button>
      </>
    );
  } else if (!info && checked !== null && busy) {
    body = (
      <div className="py-8 flex justify-center text-slate-400">
        <Loader2 className="w-5 h-5 animate-spin" />
      </div>
    );
  } else if (info?.status === 'ok') {
    body = (
      <div className="animate-fade-in">
        <div className="rounded-2xl bg-slate-50 border border-slate-100 p-4 mb-3 text-center">
          <p className="text-xs text-slate-500">{iOwe ? `${info.owner_name} dit que tu lui dois` : `${info.owner_name} dit qu'il/elle te doit`}</p>
          <p className={`text-2xl font-extrabold tabular-nums mt-1 ${iOwe ? 'text-rose-600' : 'text-emerald-600'}`}>{left}</p>
        </div>
        {(info.moves ?? []).length > 0 && (
          <div className="rounded-2xl border border-slate-100 divide-y divide-slate-100 mb-3">
            {info.moves!.map((m, i) => (
              <div key={i} className="flex items-center gap-2.5 px-3 py-2">
                {m.kind === 'repay' ? <Undo2 className="w-4 h-4 text-emerald-600 shrink-0" /> : m.kind === 'interest' ? <Percent className="w-4 h-4 text-slate-500 shrink-0" /> : <Plus className="w-4 h-4 text-slate-500 shrink-0" />}
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-slate-800 truncate">{m.note || (m.kind === 'more' ? (iOwe ? 'Emprunt' : 'Prêt') : m.kind === 'interest' ? 'Intérêts' : 'Remboursement')}</span>
                  <span className="block text-[12px] text-slate-500">{day(m.occurred_at)}</span>
                </span>
                <span className="text-sm font-bold tabular-nums">
                  {m.kind === 'repay' ? '−' : '+'}
                  {formatMoney(m.amount, m.currency)}
                </span>
              </div>
            ))}
          </div>
        )}
        {declining ? (
          <div className="p-4 rounded-2xl bg-red-50 animate-fade-in">
            <p className="text-sm font-bold text-red-600">Tu n'es pas d'accord avec ces montants&nbsp;?</p>
            <p className="text-xs text-red-600/85 mt-1">{info.owner_name} le verra et pourra corriger puis te renvoyer un lien. Rien n'est ajouté chez toi.</p>
            <div className="flex gap-2 mt-3">
              <button onClick={() => setDeclining(false)} className="flex-1 py-2.5 rounded-xl bg-white text-sm font-semibold text-slate-700 cursor-pointer">
                Retour
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const res = await cloud.declineDebt(info.code!);
                    if (res.status === 'declined') onDone(`${info.owner_name} saura que tu n'es pas d'accord`);
                    else setInfo(res);
                  })
                }
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold cursor-pointer disabled:opacity-60"
              >
                Refuser
              </button>
            </div>
          </div>
        ) : (
          <>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Son nom dans tes dettes</label>
            <input value={label} onChange={(ev) => setLabel(ev.target.value)} maxLength={80} className={`${field} mb-2`} />
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {suggestions.map((p) => (
                  <button key={p} onClick={() => setLabel(p)} className="px-2.5 py-1 rounded-full bg-slate-100 text-xs font-semibold cursor-pointer">
                    {p}
                  </button>
                ))}
              </div>
            )}
            {/* Facultatif : l'historique apparaît aussi dans un portefeuille (solde et Transactions) */}
            {(info.moves ?? []).some((m) => m.kind !== 'interest') && wallets.length > 0 && (
              <>
                <div className="text-xs font-semibold text-slate-500 mb-1.5">Noter aussi l'historique dans un portefeuille&nbsp;?</div>
                <div className="flex flex-wrap gap-1.5 mb-3">
                  <button
                    onClick={() => setHistoryWallet(null)}
                    className={`px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer ${historyWallet === null ? 'is-selected' : 'bg-slate-100'}`}
                  >
                    Non
                  </button>
                  {wallets.map((w) => (
                    <button
                      key={w.id}
                      onClick={() => setHistoryWallet(w.id)}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${historyWallet === w.id ? 'is-selected' : 'bg-slate-100'}`}
                    >
                      <IconBadge icon={w.icon} image={w.image} color={w.color} size="xs" /> {w.name}
                    </button>
                  ))}
                </div>
              </>
            )}
            <p className="text-[12px] text-slate-500 mb-3">
              En acceptant, tu confirmes ces montants. Ensuite, chaque remboursement noté par l'un est confirmé par l'autre.
              {historyWallet ? ' Ce qui reste à rembourser (sans les tours déjà réglés) sera ajouté à ce portefeuille, à sa date.' : ' Tes portefeuilles ne changent pas.'}
            </p>
            <button
              disabled={busy || !label.trim()}
              onClick={() =>
                run(async () => {
                  const res = await cloud.joinDebt(info.code!, label.trim());
                  if (res.status === 'joined') {
                    haptic('success');
                    onDone(
                      `Dette avec ${label.trim()} ajoutée`,
                      historyWallet && info.share_id ? { shareId: info.share_id, walletId: historyWallet } : undefined
                    );
                  } else setInfo(res);
                })
              }
              className={primary}
            >
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Accepter
            </button>
            <button onClick={() => setDeclining(true)} className="w-full mt-2 py-3 rounded-2xl text-sm font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer">
              Je ne suis pas d'accord
            </button>
          </>
        )}
      </div>
    );
  } else {
    // Code à taper (ou code d'un lien qui ne marche pas : on peut en taper un autre)
    body = (
      <>
        <p className="text-sm text-slate-500 mb-4">Tape le code reçu, ou colle le lien.</p>
        <input
          value={formatCode(code)}
          onChange={(ev) => {
            const v = ev.target.value;
            const fromLink = v.match(/\/d\/([A-Za-z0-9-]{4,20})/);
            setCode(cleanCode(fromLink ? fromLink[1] : v).slice(0, 8));
            setInfo(null);
          }}
          onKeyDown={(ev) => ev.key === 'Enter' && ready && check(code)}
          placeholder="K7P4-QX9M"
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className={`${field} text-center text-2xl font-extrabold tracking-[0.2em] uppercase`}
        />
        {info && <p className="text-sm text-red-600 mt-3">{problem ?? "Ce code ne marche pas."}</p>}
        <button onClick={() => check(code)} disabled={!ready || busy} className={`${primary} mt-3`}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />} Continuer
        </button>
        {/* Ou scanner le code QR montré par l'autre personne (scanner de l'app) */}
        {onScan && (
          <button onClick={onScan} className="mt-2 w-full h-12 rounded-full bg-slate-100 text-slate-900 text-[15px] font-bold flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition">
            <ScanLine className="w-4.5 h-4.5" /> Scanner un code QR
          </button>
        )}
      </>
    );
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
        <div
          className="w-full sm:max-w-[420px] max-h-[92dvh] overflow-y-auto bg-white rounded-t-[28px] sm:rounded-[28px] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] animate-slide-up"
          onClick={(ev) => ev.stopPropagation()}
        >
          <div className="sheet-head flex items-center justify-between mb-2">
            <h2 className="text-base font-bold">Suivre une dette partagée</h2>
            <button onClick={onClose} aria-label="Fermer" className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center cursor-pointer">
              <X className="w-4 h-4" />
            </button>
          </div>
          {body}
          {error && <p className="text-xs text-red-600 mt-3">{error}</p>}
        </div>
      </div>
      {login && !cloud.user && <LoginSheet cloud={cloud} onClose={() => setLogin(false)} />}
    </>
  );
};
