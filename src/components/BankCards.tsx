import React, { useState } from 'react';
import { CreditCard, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { BankCard } from '../types';
import { cardStatus, expiresLabel, looksLikeCardNumber, MAX_CARDS, NETWORKS } from '../lib/bankCards';
import { uuid } from '../lib/ids';

const MONTHS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const networkLabel = (n: BankCard['network']) => NETWORKS.find((x) => x.id === n)?.label ?? 'Carte';

// Une carte en une ligne : réseau, 4 derniers chiffres, expiration (et si elle expire bientôt)
export const CardLine: React.FC<{ card: BankCard; onClick?: () => void }> = ({ card: c, onClick }) => {
  const status = cardStatus(c);
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} className={`w-full flex items-center gap-3 px-4 min-h-[56px] text-left ${onClick ? 'cursor-pointer active:bg-slate-200/60 transition-colors' : ''}`}>
      {/* Couleurs fixes : une carte reste sombre, même en mode sombre */}
      <span className="w-10 h-7 rounded-md flex items-center justify-center shrink-0" style={{ background: '#1E293B' }}>
        <CreditCard className="w-4 h-4" style={{ color: '#fff' }} />
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-[15px] text-slate-900 truncate">{c.label || `${networkLabel(c.network)}${c.bank ? ` ${c.bank}` : ''}`}</span>
        <span className="block text-[12px] text-slate-500 tabular-nums truncate">
          •••• {c.last4} · exp. {expiresLabel(c)}
        </span>
      </span>
      {status !== 'ok' && (
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${status === 'expired' ? 'bg-red-500/10 text-red-600' : 'bg-amber-500/10 text-amber-700'}`}>
          {status === 'expired' ? 'Expirée' : 'Expire bientôt'}
        </span>
      )}
    </Tag>
  );
};

// Ajouter ou modifier une carte (dans la fiche du portefeuille)
const CardForm: React.FC<{ card: BankCard | null; onSave: (c: BankCard) => void; onDelete?: () => void; onCancel: () => void }> = ({ card, onSave, onDelete, onCancel }) => {
  const year = new Date().getFullYear();
  const [label, setLabel] = useState(card?.label ?? '');
  const [bank, setBank] = useState(card?.bank ?? '');
  const [network, setNetwork] = useState<BankCard['network']>(card?.network ?? 'visa');
  const [last4, setLast4] = useState(card?.last4 ?? '');
  const [month, setMonth] = useState(card?.expires.slice(5) ?? '');
  const [yearSel, setYearSel] = useState(card?.expires.slice(0, 4) ?? '');
  const years = Array.from(new Set([...(card ? [Number(card.expires.slice(0, 4))] : []), ...Array.from({ length: 11 }, (_, i) => year + i)])).sort();
  const fullNumber = looksLikeCardNumber(label) || looksLikeCardNumber(bank);
  const valid = /^\d{4}$/.test(last4) && !!month && !!yearSel && !fullNumber;
  const field = 'w-full px-3.5 py-2.5 rounded-xl bg-white text-[15px] outline-none focus:ring-2 focus:ring-accent';
  return (
    <div className="p-3 space-y-2.5 animate-fade-in">
      <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40} placeholder="Nom (ex. Visa Rawbank)" aria-label="Nom de la carte" className={field} />
      <input value={bank} onChange={(e) => setBank(e.target.value)} maxLength={40} placeholder="Banque (facultatif)" aria-label="Banque" className={field} />
      <div className="flex gap-1.5">
        {NETWORKS.map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => setNetwork(n.id)}
            className={`flex-1 py-2 rounded-xl text-[13px] font-semibold cursor-pointer bg-white ${network === n.id ? 'is-selected sel-ring' : 'text-slate-600'}`}
          >
            {n.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <label className="flex-1 min-w-0">
          <span className="block text-[12px] text-slate-500 mb-1 px-1">4 derniers chiffres</span>
          <input
            value={last4}
            onChange={(e) => setLast4(e.target.value.replace(/\D/g, '').slice(-4))}
            inputMode="numeric"
            placeholder="4821"
            className={`${field} tabular-nums tracking-widest`}
          />
        </label>
        <label className="w-[84px] shrink-0">
          <span className="block text-[12px] text-slate-500 mb-1 px-1">Mois</span>
          <select value={month} onChange={(e) => setMonth(e.target.value)} className={`${field} tabular-nums`}>
            <option value="">--</option>
            {MONTHS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="w-[96px] shrink-0">
          <span className="block text-[12px] text-slate-500 mb-1 px-1">Année</span>
          <select value={yearSel} onChange={(e) => setYearSel(e.target.value)} className={`${field} tabular-nums`}>
            <option value="">----</option>
            {years.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>
      {fullNumber && <p className="text-[12px] text-red-600 px-1">Pas le numéro complet : seulement les 4 derniers chiffres.</p>}
      <div className="flex gap-2 pt-1">
        {onDelete && (
          <button type="button" onClick={onDelete} aria-label="Retirer la carte" className="w-11 shrink-0 rounded-xl bg-white text-red-600 flex items-center justify-center cursor-pointer">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
        <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl bg-white text-[14px] font-semibold text-slate-700 cursor-pointer">
          Annuler
        </button>
        <button
          type="button"
          disabled={!valid}
          onClick={() =>
            onSave({
              id: card?.id ?? uuid(),
              label: label.trim(),
              ...(bank.trim() ? { bank: bank.trim() } : {}),
              network,
              last4,
              expires: `${yearSel}-${month}`,
            })
          }
          className="flex-[1.4] py-2.5 rounded-xl bg-accent hover:bg-accent-hover disabled:opacity-40 text-[14px] font-bold cursor-pointer"
        >
          {card ? 'Enregistrer' : 'Ajouter'}
        </button>
      </div>
    </div>
  );
};

// Section « Cartes bancaires » de la fiche d'un portefeuille
export const CardsGroup: React.FC<{ cards: BankCard[]; onChange: (cards: BankCard[]) => void }> = ({ cards, onChange }) => {
  const [editing, setEditing] = useState<BankCard | 'new' | null>(null);
  return (
    <section className="mb-5">
      <h3 className="text-[12px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 px-4">Cartes bancaires</h3>
      <div className="rounded-2xl bg-slate-100 divide-y divide-slate-200/70 overflow-hidden">
        {cards.map((c) =>
          editing !== 'new' && editing?.id === c.id ? (
            <CardForm
              key={c.id}
              card={c}
              onCancel={() => setEditing(null)}
              onDelete={() => {
                onChange(cards.filter((x) => x.id !== c.id));
                setEditing(null);
              }}
              onSave={(n) => {
                onChange(cards.map((x) => (x.id === c.id ? n : x)));
                setEditing(null);
              }}
            />
          ) : (
            <CardLine key={c.id} card={c} onClick={() => setEditing(c)} />
          )
        )}
        {editing === 'new' ? (
          <CardForm
            card={null}
            onCancel={() => setEditing(null)}
            onSave={(n) => {
              onChange([...cards, n]);
              setEditing(null);
            }}
          />
        ) : (
          cards.length < MAX_CARDS && (
            <button type="button" onClick={() => setEditing('new')} className="w-full flex items-center gap-3 px-4 min-h-[48px] text-left text-[15px] text-blue-600 font-semibold cursor-pointer active:bg-slate-200/60 transition-colors">
              <Plus className="w-4 h-4" /> Ajouter une carte
            </button>
          )
        )}
      </div>
      <p className="text-[12px] text-slate-400 mt-1.5 px-4 leading-snug flex gap-1.5">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-px" />
        <span>Seulement de quoi la reconnaître. Ne note jamais le numéro complet, le code au dos (CVV) ni ton code PIN.</span>
      </p>
    </section>
  );
};
