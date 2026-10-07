import path from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Espace admin : site séparé (dossier admin/), publié sur sa propre adresse Firebase.
// Il reprend les clés publiques Supabase du .env de Wallo.
const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.resolve(here, 'admin'),
  envDir: here,
  plugins: [react(), tailwindcss()],
  build: { outDir: path.resolve(here, 'dist-admin'), emptyOutDir: true },
  server: { port: 3001 },
});
