import { defineConfig } from 'vite';

// Nome del repository GitHub: il sito è pubblicato su https://<utente>.github.io/<REPO_NAME>/
const REPO_NAME = 'sagra-porcino';

export default defineConfig(({ command }) => ({
  // In sviluppo il sito sta alla radice, in produzione sotto /<REPO_NAME>/
  base: command === 'build' ? `/${REPO_NAME}/` : '/',
  server: {
    port: 5173,
  },
}));
