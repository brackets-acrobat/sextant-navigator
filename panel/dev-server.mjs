/**
 * Serveur statique minimal pour developper l'instrument dans un navigateur.
 *
 * Le panneau n'a aucune dependance au simulateur : sans messages `sim-state`,
 * l'application bascule sur son avion fictif. On peut donc tout mettre au point
 * hors de MSFS — ce qui est aussi plus rapide que de relancer le sim.
 *
 *   node panel/dev-server.mjs     puis ouvrir l'adresse affichee
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, 'sixk-sextant', 'html_ui', 'InGamePanels', 'Sextant', 'app');
const port = Number(process.env.PORT) || 8123;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

createServer(async (req, res) => {
  const url = decodeURIComponent((req.url || '/').split('?')[0]);
  const rel = normalize(url === '/' ? '/index.html' : url).replace(/^([/\\])+/, '');
  const file = join(root, rel);
  // Un serveur de developpement reste un serveur : on ne sort pas de la racine.
  if (!file.startsWith(root)) {
    res.writeHead(403).end('Interdit');
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404).end('Introuvable');
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`Sextant en developpement : http://127.0.0.1:${port}/`);
  console.log('Ctrl+C pour arreter.');
});
