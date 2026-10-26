import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { serviceWorker } from './scripts/serviceWorker';

// Version visible dans Paramètres : numéro de package.json, commit et date du build.
// « dirty » : construit avec des modifications pas encore commitées (on sait alors que ce n'est pas une branche telle quelle)
const git = (cmd: string) => {
  try {
    return execSync(`git ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
};
const appVersion = {
  version: JSON.parse(readFileSync('package.json', 'utf8')).version as string,
  commit: git('rev-parse --short HEAD'),
  dirty: git('status --porcelain --untracked-files=no -- src index.html vite.config.ts package.json') !== '',
  builtAt: new Date().toISOString(),
};

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), serviceWorker()],
    define: { __APP_VERSION__: JSON.stringify(appVersion) },
    server: {
      // DISABLE_HMR=true coupe le rechargement à chaud (utile pour certains éditeurs en ligne)
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
