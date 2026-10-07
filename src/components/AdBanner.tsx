import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { adEvent, useRemoteConfig } from '../lib/remoteConfig';
import { usePersistentState } from '../hooks/usePersistentState';

// Bannières publicitaires de l'accueil (créées dans l'espace admin, format 4:1, le même que dans les autres applications).
// Carrousel qui défile tout seul, croix pour masquer une pub sur cet appareil, mention « Sponsorisé ».
// Hors ligne ou image introuvable : la bannière ne s'affiche pas.
export const AdBanner: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { ads } = useRemoteConfig();
  const [hidden, setHidden] = usePersistentState<string[]>('ap.adsHidden', []);
  const [broken, setBroken] = useState<string[]>([]);
  const list = ads.filter((a) => !hidden.includes(a.id) && !broken.includes(a.id));
  const track = useRef<HTMLDivElement>(null);
  const [rawIndex, setIndex] = useState(0);
  const index = Math.min(rawIndex, Math.max(0, list.length - 1)); // une pub masquée : on reste dans la liste
  // Touchée à l'instant : pas de défilement automatique pendant 8 s (se lève toute seule, même si on a fait défiler la page)
  const pausedUntil = useRef(0);
  const pause = () => (pausedUntil.current = Date.now() + 8000);
  const pos = useRef({ index: 0, count: 0 });
  pos.current = { index, count: list.length };

  // Bannière visible (au moins 60 %) : une vue comptée
  useEffect(() => {
    const el = track.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          const id = (e.target as HTMLElement).dataset.ad;
          if (id) adEvent(id, 'view');
        }),
      { root: el, threshold: 0.6 }
    );
    el.querySelectorAll('[data-ad]').forEach((s) => obs.observe(s));
    return () => obs.disconnect();
  }, [list.map((a) => a.id).join()]);

  // Passe tout seul à la pub suivante toutes les 5 s (puis revient à la première).
  // Un seul minuteur tant que le nombre de pubs ne change pas : les rafraîchissements de l'écran ne le remettent pas à zéro.
  useEffect(() => {
    if (list.length < 2) return;
    const t = setInterval(() => {
      if (Date.now() < pausedUntil.current || document.visibilityState !== 'visible') return;
      const { index: i, count } = pos.current;
      if (count > 1) goTo((i + 1) % count);
    }, 5000);
    return () => clearInterval(t);
  }, [list.length]);

  // « Moins d'animations » demandé par le téléphone : on change de pub d'un coup, sans glisser
  const goTo = (i: number) => {
    const el = track.current;
    const instant = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: instant ? 'auto' : 'smooth' });
  };
  // Pub affichée = position du défilement (automatique ou au doigt)
  const onScroll = () => {
    const el = track.current;
    if (el && el.clientWidth) setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  if (list.length === 0) return null;

  return (
    <div className={className}>
      <div
        ref={track}
        onScroll={onScroll}
        onPointerDown={pause}
        onTouchStart={pause}
        onWheel={pause}
        className="flex overflow-x-auto snap-x snap-mandatory no-scrollbar rounded-2xl"
        aria-roledescription="carrousel"
        aria-label="Publicités"
      >
        {list.map((ad, i) => {
          const image = (
            <img
              src={ad.imageUrl}
              alt={ad.title}
              loading="lazy"
              decoding="async"
              onError={() => setBroken((b) => [...b, ad.id])}
              className="w-full h-full object-cover"
              draggable={false}
            />
          );
          return (
            <div key={ad.id} data-ad={ad.id} data-index={i} className="relative shrink-0 w-full snap-center aspect-[4/1] bg-slate-100 overflow-hidden rounded-2xl">
              {ad.linkUrl ? (
                <a
                  href={ad.linkUrl}
                  target="_blank"
                  rel="noopener noreferrer sponsored"
                  onClick={() => adEvent(ad.id, 'click')}
                  className="block w-full h-full"
                >
                  {image}
                </a>
              ) : (
                image
              )}
              <button
                onClick={() => setHidden((h) => [...h, ad.id])}
                aria-label="Masquer cette publicité"
                className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-black/45 text-white flex items-center justify-center backdrop-blur-sm cursor-pointer"
              >
                <X className="w-3 h-3" strokeWidth={2.5} />
              </button>
              {ad.sponsored && (
                <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full bg-black/45 text-white text-[9px] font-semibold tracking-wider uppercase backdrop-blur-sm pointer-events-none">
                  Sponsorisé
                </span>
              )}
            </div>
          );
        })}
      </div>
      {list.length > 1 && (
        <div className="flex justify-center gap-1.5 mt-2" role="tablist" aria-label="Choisir une publicité">
          {list.map((ad, i) => (
            <button
              key={ad.id}
              role="tab"
              aria-selected={i === index}
              aria-label={`Publicité ${i + 1} sur ${list.length}`}
              onClick={() => { pause(); goTo(i); }}
              className={`h-1.5 rounded-full transition-all cursor-pointer ${i === index ? 'w-4 bg-slate-700' : 'w-1.5 bg-slate-300'}`}
            />
          ))}
        </div>
      )}
    </div>
  );
};
