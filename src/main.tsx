import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initTheme } from './lib/theme';

initTheme();

createRoot(document.getElementById('root')!).render(<App />);

// Hors ligne : l'app s'ouvre même sans réseau (voir scripts/serviceWorker.ts)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  });
}
// Une nouvelle version a été mise en ligne pendant que l'app était ouverte :
// un écran pas encore chargé n'existe plus sur le serveur -> on recharge
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  window.location.reload();
});
