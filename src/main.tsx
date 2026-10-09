import './lib/proPreview';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initTheme } from './lib/theme';
import { initAccent } from './lib/accent';
import { installTapHaptics } from './lib/haptics';
import { initRemoteConfig } from './lib/remoteConfig';
import { initMarketRates } from './lib/marketRate';
import { installScrollLock } from './lib/scrollLock';
import { installKeyboardFit } from './lib/keyboard';
import { installSheetClose } from './lib/sheetClose';
import { installFeedbackSync } from './lib/feedback';
import { initUsage } from './lib/usage';
import { initInstall } from './lib/install';
import { getPrefs } from './lib/display';

initTheme();
initAccent();
installTapHaptics();
initRemoteConfig();
initMarketRates();
installScrollLock();
installKeyboardFit();
installSheetClose();
installFeedbackSync();
initInstall();
{
  const p = getPrefs();
  initUsage({ simple: p.simpleMode, icons: p.iconsOnly, festiveOff: p.festiveOff });
}

createRoot(document.getElementById('root')!).render(<App />);

// Demande au navigateur de ne jamais effacer les données de l'app (sinon Safari peut vider
// le stockage d'un site pas ouvert depuis quelques jours : réglages et opérations perdus)
navigator.storage?.persist?.().catch(() => {});

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
