import React, { useEffect, useRef } from 'react';

// Feux d'artifice dessinés sur un canvas : une fusée monte, éclate en gerbe de couleurs,
// les étincelles retombent et s'éteignent. Léger : peu de particules, pause quand l'app est cachée,
// rien du tout si le téléphone demande moins d'animations.

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number; // 1 -> 0
  decay: number;
  color: string;
  size: number;
}
interface Rocket {
  x: number;
  y: number;
  vy: number;
  targetY: number;
  color: string;
}

const COLORS = ['#FDE047', '#F472B6', '#60A5FA', '#34D399', '#F97316', '#C084FC', '#FFFFFF'];

export const Fireworks: React.FC<{ every?: number; className?: string; style?: React.CSSProperties }> = ({ every = 1400, className = '', style }) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    // Petits téléphones : moins d'étincelles
    const lowEnd = (navigator.hardwareConcurrency ?? 8) <= 4 || ((navigator as unknown as { deviceMemory?: number }).deviceMemory ?? 8) <= 2;
    const perBurst = lowEnd ? 26 : 46;
    const dpr = Math.min(window.devicePixelRatio || 1, lowEnd ? 1.5 : 2);
    let w = 0;
    let h = 0;
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const rockets: Rocket[] = [];
    const sparks: Spark[] = [];
    const launch = () => {
      if (document.hidden || !w) return;
      rockets.push({ x: w * (0.15 + Math.random() * 0.7), y: h, vy: -(h * 0.018 + Math.random() * 2), targetY: h * (0.12 + Math.random() * 0.28), color: COLORS[Math.floor(Math.random() * COLORS.length)] });
    };
    const explode = (r: Rocket) => {
      const second = COLORS[Math.floor(Math.random() * COLORS.length)];
      for (let i = 0; i < perBurst; i++) {
        const a = (Math.PI * 2 * i) / perBurst + Math.random() * 0.2;
        const speed = 2.4 + Math.random() * 3;
        sparks.push({ x: r.x, y: r.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: 1, decay: 0.012 + Math.random() * 0.012, color: i % 3 === 0 ? second : r.color, size: 1.8 + Math.random() * 1.6 });
      }
    };

    let raf = 0;
    let last = performance.now();
    let since = every * 0.6;
    const tick = (now: number) => {
      const dt = Math.min(48, now - last) / 16.7; // 1 = une image à 60 i/s
      last = now;
      since += dt * 16.7;
      if (since >= every) {
        since = 0;
        launch();
      }
      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';
      // Fusées : un trait lumineux qui monte
      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i];
        r.y += r.vy * dt;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(r.x, r.y);
        ctx.lineTo(r.x, r.y + 14);
        ctx.stroke();
        if (r.y <= r.targetY) {
          explode(r);
          rockets.splice(i, 1);
        }
      }
      // Étincelles : gravité, frottement, elles s'éteignent
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.vx *= 0.985;
        s.vy = s.vy * 0.985 + 0.045 * dt;
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.life -= s.decay * dt;
        if (s.life <= 0) {
          sparks.splice(i, 1);
          continue;
        }
        ctx.globalAlpha = Math.max(0, s.life);
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size * (0.6 + s.life * 0.6), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    // App cachée : on arrête de dessiner, on reprend au retour
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) {
        last = performance.now();
        raf = requestAnimationFrame(tick);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [every]);

  return <canvas ref={ref} className={`pointer-events-none ${className}`} style={{ width: '100%', height: '100%', ...style }} aria-hidden />;
};
