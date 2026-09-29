import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { serviceWorker } from './scripts/serviceWorker';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), serviceWorker()],
    server: {
      // DISABLE_HMR=true coupe le rechargement à chaud (utile pour certains éditeurs en ligne)
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
