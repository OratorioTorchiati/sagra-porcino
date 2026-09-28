// Plugin Vite: rende disponibile il menù all'app come modulo `virtual:menu`, generato da contenuti/menu.csv.
// In sviluppo, salvando il CSV la pagina si ricarica da sola.

import fs from 'node:fs';
import path from 'node:path';
import { parseMenuCsv } from './menu-csv.js';

const VIRTUAL_ID = 'virtual:menu';
const RESOLVED_ID = '\0virtual:menu';

export function menuPlugin({ csvPath }) {
  const csvFile = path.resolve(csvPath);

  return {
    name: 'sagra-menu',

    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID;
    },

    load(id) {
      if (id !== RESOLVED_ID) return;
      this.addWatchFile(csvFile);
      const menu = parseMenuCsv(fs.readFileSync(csvFile, 'utf8'));
      return `export default ${JSON.stringify(menu)};`;
    },

    configureServer(server) {
      server.watcher.add(csvFile);
      server.watcher.on('change', (file) => {
        if (path.resolve(file) !== csvFile) return;
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      });
    },
  };
}
