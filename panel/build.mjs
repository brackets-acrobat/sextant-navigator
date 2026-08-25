/**
 * Assemblage du paquet Community.
 *
 * Deux taches, aucune dependance :
 *   1. recopier le noyau dans l'application du panneau, pour que le paquet
 *      soit autonome une fois depose dans Community ;
 *   2. regenerer `layout.json`, que MSFS lit pour connaitre le contenu du
 *      paquet — chemins en minuscules, taille, et date au format FILETIME.
 *
 * Le `.spb` n'est pas produit ici : il demande `fspackagetool` du SDK. Voir
 * README.md.
 *
 *   node panel/build.mjs
 */

import { readdir, readFile, writeFile, mkdir, stat, rm } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..');
const pkg = join(here, 'sixk-sextant');
const appDir = join(pkg, 'html_ui', 'InGamePanels', 'Sextant', 'app');
const coreDir = join(appDir, 'core');

/** Fichiers a ne jamais lister dans layout.json. */
const LAYOUT_EXCLUDE = new Set(['layout.json', 'manifest.json']);

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

/** Date Windows : intervalles de 100 ns depuis le 1er janvier 1601. */
function fileTime(ms) {
  return (BigInt(Math.round(ms)) + 11644473600000n) * 10000n;
}

async function copyCore() {
  await rm(coreDir, { recursive: true, force: true });
  await mkdir(coreDir, { recursive: true });
  const src = join(repo, 'src');
  const files = (await readdir(src)).filter((f) => f.endsWith('.js'));
  for (const f of files) {
    await writeFile(join(coreDir, f), await readFile(join(src, f)));
  }
  return files.length;
}

/**
 * Recopie le `.spb` produit par `fspackagetool` dans le paquet.
 *
 * Le descripteur compile vit sous `Build/Packages/<projet>/Build/`, mais MSFS
 * l'attend a la racine du paquet, dans `InGamePanels/`. Sans lui, le bouton de
 * barre d'outils n'existe pas : le panneau est present mais introuvable.
 *
 * On le recopie ici, avant la generation du layout, pour qu'il y soit liste —
 * un fichier absent du layout est invisible pour le simulateur.
 */
async function copySpb() {
  const source = join(here, 'Build', 'Packages');
  let compiles = [];
  try {
    compiles = (await walk(source)).filter((f) => f.toLowerCase().endsWith('.spb'));
  } catch (e) {
    return 0; // rien de compile : ce n'est pas une erreur, juste un build partiel
  }
  if (!compiles.length) return 0;
  const dest = join(pkg, 'InGamePanels');
  await mkdir(dest, { recursive: true });
  for (const f of compiles) {
    await writeFile(join(dest, f.split('\\').pop().split('/').pop()), await readFile(f));
  }
  return compiles.length;
}

async function writeLayout() {
  const files = await walk(pkg);
  const content = [];
  for (const f of files) {
    const rel = relative(pkg, f).split('\\').join('/');
    if (LAYOUT_EXCLUDE.has(rel)) continue;
    const st = await stat(f);
    content.push({
      path: rel.toLowerCase(),
      size: st.size,
      date: Number(fileTime(st.mtimeMs)),
    });
  }
  content.sort((a, b) => (a.path < b.path ? -1 : 1));
  // Les dates FILETIME depassent Number.MAX_SAFE_INTEGER : on les ecrit a la
  // main pour ne pas les voir arrondies par JSON.stringify.
  const body = content
    .map(
      (c) =>
        `    {\n      "path": ${JSON.stringify(c.path)},\n` +
        `      "size": ${c.size},\n      "date": ${c.date}\n    }`,
    )
    .join(',\n');
  await writeFile(join(pkg, 'layout.json'), `{\n  "content": [\n${body}\n  ]\n}\n`);
  return content.length;
}

const modules = await copyCore();
const spb = await copySpb();
const listed = await writeLayout();
console.log(`Noyau recopie : ${modules} modules dans app/core/`);
console.log(
  spb
    ? `Descripteur recopie : ${spb} .spb dans InGamePanels/`
    : 'Descripteur : AUCUN .spb — lancer « npm run panel:spb » (pas de bouton de barre sans lui)',
);
console.log(`layout.json regenere : ${listed} fichiers`);
console.log(`Paquet pret : ${relative(process.cwd(), pkg)}`);
