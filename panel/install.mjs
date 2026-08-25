/**
 * Relie le paquet au simulateur.
 *
 *   npm run panel:install            pose la jonction
 *   npm run panel:install -- --etat  dit seulement ce qui est en place
 *   npm run panel:install -- --oter  retire la jonction
 *
 * Une JONCTION plutot qu'une copie : le simulateur lit alors directement
 * `panel/sixk-sextant`, donc un `npm run panel:build` suffit a mettre a jour ce
 * qu'il verra au prochain demarrage. Une copie obligerait a reinstaller a
 * chaque modification, et finirait par diverger sans qu'on le remarque.
 *
 * Le dossier Community est lu dans `UserCfg.opt` — c'est le simulateur qui
 * decide, et il y a plusieurs Community sur cette machine. `MSFS_COMMUNITY`
 * permet d'en imposer un autre.
 */

import { existsSync, readFileSync, lstatSync, symlinkSync, rmSync, readlinkSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const paquet = join(here, 'sixk-sextant');
const NOM = 'sixk-sextant';

const args = process.argv.slice(2);
const oter = args.includes('--oter');
const etatSeul = args.includes('--etat');

/** Le Community actif, tel que le simulateur le connait. */
function trouveCommunity() {
  if (process.env.MSFS_COMMUNITY) return process.env.MSFS_COMMUNITY;
  const cfg = join(
    homedir(), 'AppData', 'Roaming', 'Microsoft Flight Simulator 2024', 'UserCfg.opt',
  );
  if (!existsSync(cfg)) return null;
  const m = readFileSync(cfg, 'utf8').match(/InstalledPackagesPath\s+"([^"]+)"/);
  return m ? join(m[1], 'Community') : null;
}

const community = trouveCommunity();
if (!community || !existsSync(community)) {
  console.error(`Dossier Community introuvable${community ? ` : ${community}` : ''}.`);
  console.error('Renseigner MSFS_COMMUNITY pour en imposer un.');
  process.exit(2);
}

const cible = join(community, NOM);
console.log(`Community : ${community}`);

/** Ce qui occupe la place, s'il y a quelque chose. */
function etat() {
  if (!existsSync(cible)) {
    // Une jonction cassee n'existe pas au sens de existsSync : on verifie.
    try {
      lstatSync(cible);
      return { quoi: 'lien-casse' };
    } catch (e) {
      return { quoi: 'rien' };
    }
  }
  const st = lstatSync(cible);
  if (st.isSymbolicLink()) {
    const vers = resolve(readlinkSync(cible));
    return { quoi: vers === resolve(paquet) ? 'lien-vers-nous' : 'lien-ailleurs', vers };
  }
  return { quoi: 'vrai-dossier' };
}

const e = etat();

if (etatSeul) {
  const dit = {
    rien: 'rien d’installe',
    'lien-vers-nous': `jonction en place vers ${e.vers}`,
    'lien-ailleurs': `ATTENTION : jonction vers ${e.vers}, pas vers ce depot`,
    'lien-casse': 'jonction cassee',
    'vrai-dossier': 'un VRAI dossier occupe la place (copie manuelle ?)',
  }[e.quoi];
  console.log(dit);
  console.log(existsSync(join(paquet, 'InGamePanels')) ? 'descripteur .spb : present' : 'descripteur .spb : ABSENT');
  process.exit(0);
}

if (oter) {
  if (e.quoi === 'vrai-dossier') {
    console.error('Refus : ce n’est pas une jonction mais un vrai dossier. A retirer a la main.');
    process.exit(1);
  }
  if (e.quoi === 'rien') {
    console.log('rien a retirer.');
    process.exit(0);
  }
  rmSync(cible, { recursive: false, force: true });
  console.log(`jonction retiree : ${cible}`);
  process.exit(0);
}

// --- La pose ----------------------------------------------------------------

if (!existsSync(join(paquet, 'InGamePanels'))) {
  console.error('Aucun .spb dans le paquet : lancer d’abord « npm run panel:spb ».');
  console.error('Sans descripteur, le panneau existe mais aucun bouton ne l’ouvre.');
  process.exit(1);
}

if (e.quoi === 'vrai-dossier') {
  console.error(`Un vrai dossier occupe deja ${cible}.`);
  console.error('Le retirer a la main, puis relancer — on n’efface pas ce qu’on n’a pas pose.');
  process.exit(1);
}
if (e.quoi === 'lien-ailleurs') {
  console.error(`Une jonction pointe deja ailleurs : ${e.vers}`);
  console.error('La retirer d’abord (npm run panel:install -- --oter).');
  process.exit(1);
}
if (e.quoi === 'lien-casse') rmSync(cible, { force: true });
if (e.quoi === 'lien-vers-nous') {
  console.log('jonction deja en place, rien a faire.');
  process.exit(0);
}

// 'junction' : pas besoin de droits administrateur, contrairement a un lien
// symbolique de dossier sous Windows.
symlinkSync(resolve(paquet), cible, 'junction');
console.log(`jonction posee : ${cible}\n            -> ${resolve(paquet)}`);
console.log('\nRedemarrer le simulateur : le contenu de Community est lu au lancement.');
