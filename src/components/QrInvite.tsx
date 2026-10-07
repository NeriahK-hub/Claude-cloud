import React, { useEffect, useRef, useState } from 'react';
import { track } from '../lib/usage';
import { X, QrCode, ScanLine, Camera, Loader2, Keyboard, Smartphone, Wallet, Users, HandCoins, ChevronRight } from 'lucide-react';
import { formatCode, InviteKind, parseInvite, qrUrl } from '../lib/invite';
import { haptic } from '../lib/haptics';

// Invitation par code QR : l'invitant montre un grand QR, l'invité le scanne DANS Wallo
// (menu › Scanner un code). Pas de détour par le navigateur, pas de nouvelle connexion.

const KIND_TEXT: Record<InviteKind, string> = {
  wallet: 'rejoindre ce portefeuille',
  ristourne: 'rejoindre cette ristourne',
  debt: 'suivre cette dette avec toi',
};

// Bouton « Montrer le code QR », sous « Inviter » : crée l'invitation si besoin, puis montre le QR
export const QrButton: React.FC<{ kind: InviteKind; getCode: () => Promise<string>; name?: string; onError?: (e: unknown) => void }> = ({ kind, getCode, name, onError }) => {
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const open = async () => {
    track('qr.show');
    setBusy(true);
    try {
      setCode(await getCode());
    } catch (e) {
      onError?.(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={busy}
        className="w-full mt-2 py-3 rounded-2xl bg-white border border-slate-200 text-sm font-bold text-slate-800 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.98] transition disabled:opacity-60"
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />} Montrer le code QR
      </button>
      {code && <QrSheet kind={kind} code={code} name={name} onClose={() => setCode(null)} />}
    </>
  );
};

const QrSheet: React.FC<{ kind: InviteKind; code: string; name?: string; onClose: () => void }> = ({ kind, code, name, onClose }) => {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let alive = true;
    import('qrcode').then((QR) =>
      QR.toString(qrUrl(kind, code), { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0d1015', light: '#ffffff' } }).then((s) => alive && setSvg(s))
    );
    return () => {
      alive = false;
    };
  }, [kind, code]);
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Code QR"
        className="w-full sm:max-w-[420px] max-h-[92dvh] overflow-y-auto bg-white rounded-t-[32px] sm:rounded-[32px] px-5 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head flex items-center justify-between mb-1">
          <h2 className="text-[22px] font-bold tracking-tight text-slate-900">Fais scanner ce code</h2>
          <button onClick={onClose} aria-label="Fermer" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[14px] text-slate-500 leading-snug mb-5">
          Pour {KIND_TEXT[kind]}{name ? <> «&nbsp;{name}&nbsp;»</> : null}.
        </p>

        {/* Le QR toujours sur fond blanc (même en mode sombre) pour bien se lire */}
        <div className="mx-auto w-full max-w-[280px] aspect-square rounded-[28px] p-4 shadow-[0_10px_40px_-12px_rgb(0_0_0/0.25)] cloud-pop" style={{ background: '#ffffff' }}>
          {svg ? (
            <div className="w-full h-full [&>svg]:w-full [&>svg]:h-full" dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#94A3B8' }} />
            </div>
          )}
        </div>
        <div className="text-center mt-4">
          <div className="text-[12px] text-slate-500">ou le code</div>
          <div className="text-[26px] font-extrabold tracking-[0.18em] tabular-nums text-slate-900 select-all">{formatCode(code)}</div>
        </div>

        {/* Comment faire, en 3 étapes */}
        <ol className="mt-4 rounded-2xl bg-slate-100 p-4 space-y-3">
          {[
            { Icon: Smartphone, text: 'L’autre personne ouvre Wallo sur son téléphone.' },
            { Icon: ScanLine, text: 'Elle touche le menu, puis « Scanner un code ».' },
            { Icon: Camera, text: 'Elle pointe la caméra vers ce code : c’est fait.' },
          ].map(({ Icon, text }, i) => (
            <li key={i} className="flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-white flex items-center justify-center shrink-0 text-slate-700">
                <Icon className="w-4 h-4" />
              </span>
              <span className="text-[14px] text-slate-700 leading-snug">{text}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
};

// ---------- Scanner (caméra) ----------
type BarcodeDetectorLike = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

export const QrScanner: React.FC<{ onClose: () => void; onFound: (kind: InviteKind, code: string) => void; onTypeCode: () => void }> = ({ onClose, onFound, onTypeCode }) => {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'starting' | 'scanning' | 'denied' | 'unsupported'>('starting');
  const [wrong, setWrong] = useState(false);
  useEffect(() => track('qr.scan'), []);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setState('unsupported');
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      } catch {
        return setState('denied');
      }
      if (stopped) return stream.getTracks().forEach((t) => t.stop());
      const v = video.current!;
      v.srcObject = stream;
      await v.play().catch(() => undefined);
      setState('scanning');
      // Android : détecteur du téléphone (rapide). iPhone : jsQR (lecture image par image)
      const Detector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => BarcodeDetectorLike }).BarcodeDetector;
      const detector = Detector ? new Detector({ formats: ['qr_code'] }) : null;
      const jsQR = detector ? null : (await import('jsqr')).default;
      let busy = false;
      const tick = async () => {
        if (stopped) return;
        if (!busy && v.readyState >= 2 && v.videoWidth) {
          busy = true;
          let text: string | null = null;
          try {
            if (detector) text = (await detector.detect(v))[0]?.rawValue ?? null;
            else if (jsQR && ctx) {
              const w = 480;
              const h = Math.round((v.videoHeight / v.videoWidth) * w);
              canvas.width = w;
              canvas.height = h;
              ctx.drawImage(v, 0, 0, w, h);
              text = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' })?.data ?? null;
            }
          } catch {
            /* image suivante */
          }
          busy = false;
          if (text) {
            const inv = parseInvite(text);
            if (inv) {
              haptic('success');
              stopped = true;
              onFound(inv.kind, inv.code);
              return;
            }
            setWrong(true);
          }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    start();
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col animate-fade-in" style={{ background: '#000' }} data-own-leave>
      <video ref={video} playsInline muted className="absolute inset-0 w-full h-full object-cover" />
      {/* Voile sombre autour du cadre */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative w-[70vw] max-w-[280px] aspect-square rounded-[32px]" style={{ boxShadow: '0 0 0 100vmax rgb(0 0 0 / 0.55)' }}>
          {/* Coins du cadre */}
          {['top-0 left-0 border-t-4 border-l-4 rounded-tl-[32px]', 'top-0 right-0 border-t-4 border-r-4 rounded-tr-[32px]', 'bottom-0 left-0 border-b-4 border-l-4 rounded-bl-[32px]', 'bottom-0 right-0 border-b-4 border-r-4 rounded-br-[32px]'].map((c) => (
            <span key={c} className={`absolute w-12 h-12 ${c}`} style={{ borderColor: 'var(--accent)' }} />
          ))}
          {state === 'scanning' && <span className="qr-scan-line absolute left-4 right-4 h-0.5 rounded-full" style={{ background: 'var(--accent)', boxShadow: '0 0 12px var(--accent)' }} />}
        </div>
      </div>

      <div className="relative flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))]">
        <span className="text-[17px] font-bold" style={{ color: '#fff' }}>
          Scanner un code
        </span>
        <button onClick={onClose} aria-label="Fermer" className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer" style={{ background: 'rgb(255 255 255 / 0.18)', color: '#fff' }}>
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="relative mt-auto px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] text-center">
        <p className="text-[15px] font-semibold mb-1" style={{ color: '#fff' }}>
          {state === 'denied'
            ? 'Wallo n’a pas accès à la caméra'
            : state === 'unsupported'
              ? 'La caméra n’est pas disponible ici'
              : wrong
                ? 'Ce code n’est pas une invitation Wallo'
                : 'Pointe la caméra vers le code QR'}
        </p>
        <p className="text-[13px] mb-4" style={{ color: 'rgb(255 255 255 / 0.7)' }}>
          {state === 'denied' ? 'Autorise la caméra dans les réglages du téléphone, ou tape le code.' : 'Celui que l’autre personne te montre dans Wallo.'}
        </p>
        <button onClick={onTypeCode} className="mx-auto px-5 py-3 rounded-full text-[14px] font-bold flex items-center gap-2 cursor-pointer active:scale-95 transition" style={{ background: 'rgb(255 255 255 / 0.18)', color: '#fff' }}>
          <Keyboard className="w-4 h-4" /> Taper le code à la place
        </button>
      </div>
    </div>
  );
};

// « Taper le code à la place » : on demande d'abord à quoi sert le code (chaque sorte a sa fenêtre)
export const TypeCodeSheet: React.FC<{ onClose: () => void; onPick: (kind: InviteKind) => void }> = ({ onClose, onPick }) => (
  <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-end sm:items-center justify-center animate-fade-in" onClick={onClose}>
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Taper un code"
      className="w-full sm:max-w-[420px] bg-white rounded-t-[32px] sm:rounded-[32px] px-5 pt-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] animate-slide-up"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="sheet-head flex items-center justify-between mb-1">
        <h2 className="text-[22px] font-bold tracking-tight text-slate-900">Le code sert à…</h2>
        <button onClick={onClose} aria-label="Fermer" className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 cursor-pointer">
          <X className="w-4 h-4" />
        </button>
      </div>
      <p className="text-[14px] text-slate-500 mb-4">Choisis, puis tape le code reçu.</p>
      <div className="rounded-2xl bg-slate-100 divide-y divide-slate-200/70 overflow-hidden">
        {(
          [
            { kind: 'wallet', label: 'Rejoindre un portefeuille', Icon: Wallet, color: '#14B8A6' },
            { kind: 'ristourne', label: 'Rejoindre une ristourne', Icon: Users, color: '#8B5CF6' },
            { kind: 'debt', label: 'Suivre une dette', Icon: HandCoins, color: '#F59E0B' },
          ] as const
        ).map(({ kind, label, Icon, color }) => (
          <button key={kind} onClick={() => onPick(kind)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left cursor-pointer active:bg-slate-200/60">
            <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: `${color}1f`, color }}>
              <Icon className="w-4 h-4" />
            </span>
            <span className="flex-1 text-[15px] font-semibold text-slate-900">{label}</span>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </button>
        ))}
      </div>
    </div>
  </div>
);
