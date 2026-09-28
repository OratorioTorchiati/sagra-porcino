import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { menuPlugin } from './scripts/menu-plugin.js';

// Nome del repository GitHub: il sito è pubblicato su https://<proprietario>.github.io/<REPO_NAME>/
const REPO_NAME = 'sagra-porcino';

export default defineConfig(({ command, isPreview }) => ({
  // In sviluppo il sito sta alla radice, in produzione (e in `npm run preview`) sotto /<REPO_NAME>/
  base: command === 'build' || isPreview ? `/${REPO_NAME}/` : '/',
  server: {
    port: 5173,
  },
  plugins: [
    // Percorso relativo a questo file, non alla cartella da cui si avvia Vite
    menuPlugin({ csvPath: fileURLToPath(new URL('../contenuti/menu.csv', import.meta.url)) }),
    VitePWA({
      // L'aggiornamento lo applichiamo noi nel momento giusto (src/lib/app-update.js),
      // mai a metà di una partita
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'Sagra del Porcino',
        short_name: 'Sagra Porcino',
        description: 'Menù e minigiochi della Sagra del Porcino',
        lang: 'it',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#7a4a1e',
        background_color: '#fbf5ea',
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        // Tutto il sito in cache al primo accesso: poi si apre anche in modalità aereo
        globPatterns: ['**/*.{js,css,html,svg,woff2,webmanifest}'],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
}));
