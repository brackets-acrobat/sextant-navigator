/**
 * Compile le descripteur de panneau, puis reassemble le paquet.
 *
 *   npm run panel:spb
 *
 * MSFS n'enregistre un bouton de barre d'outils que depuis un `.spb` compile,
 * et seul `fspackagetool` du SDK sait le produire — en LANCANT
 * `FlightSimulator2024.exe` en mode empaquetage. La compilation prend donc une
 * minute et fait tourner le moteur du jeu sans ouvrir de vol.
 *
 * A refaire apres chaque modification de
 * `Build/PackageSources/InGamePanel_Sextant.xml`, jamais autrement : le reste du
 * paquet (HTML, JS, icone) est lu tel quel par le simulateur.
 *
 * `MSFS_SDK` permet de designer un SDK installe ailleurs.
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SDK = process.env.MSFS_SDK || 'C:/MSFS 2024 SDK';
const outil = join(SDK, 'Tools', 'bin', 'fspackagetool.exe');
const projet = join(here, 'Build', 'sextant-panel.xml');

if (!existsSync(outil)) {
  console.error(`fspackagetool introuvable : ${outil}`);
  console.error('Renseigner MSFS_SDK si le SDK est ailleurs.');
  process.exit(2);
}

// -forcesteam : le jeu est installe par Steam ici, et l'outil hesite quand les
//   deux boutiques sont presentes.
// -nopause : sans lui, l'executable attend une touche et le script ne rend
//   jamais la main.
// Pas de -mirroring : il effacerait du dossier de sortie tout ce que le projet
//   ne declare pas.
console.log('compilation du .spb (le moteur du jeu est lance, sans ouvrir de vol)…');
const r = spawnSync(outil, [projet, '-forcesteam', '-nopause'], {
  stdio: 'inherit',
  windowsHide: true,
});

if (r.error) {
  console.error(r.error.message);
  process.exit(1);
}

const rapport = join(here, 'Build', '_Temp', '_RPTErrors.xml');
if (existsSync(rapport)) {
  const { readFileSync } = await import('node:fs');
  const texte = readFileSync(rapport, 'utf8').trim();
  if (texte !== '<RPTErrors/>') {
    console.error('\nLe compilateur a rapporte des erreurs :');
    console.error(texte.slice(0, 2000));
    process.exit(1);
  }
}

/*
 * LE VERDICT PORTE SUR LE FICHIER, PAS SUR LA SORTIE DE L'OUTIL.
 *
 * Ce script annonçait « compilation sans erreur » sur la seule foi de
 * `_RPTErrors.xml`, qui ne recueille que les erreurs de COMPILATION. Or
 * `fspackagetool` enchaine sur une VALIDATION du paquet, dont l'echec ne passe
 * pas par ce fichier : le 2026-08-24, le PackageValidator a refuse le paquet
 * (`package_order_hint` vide) et le script a quand meme dit que tout allait
 * bien. Un outil de construction qui ment est pire que pas d'outil.
 *
 * Le seul fait qui compte est donc verifie ici : le `.spb` existe-t-il, et
 * est-il plus recent que le XML dont il sort ? Si oui, il porte les valeurs
 * qu'on vient d'ecrire, quoi qu'ait dit le validateur ensuite.
 */
const source = join(here, 'Build', 'PackageSources', 'InGamePanel_Sextant.xml');
const produit = join(here, 'Build', 'Packages', 'sextant-panel', 'Build', 'InGamePanel_Sextant.spb');
const { statSync } = await import('node:fs');

if (!existsSync(produit)) {
  console.error(`\nECHEC : aucun .spb produit (${produit}).`);
  process.exit(1);
}
// TOLERANCE DE DEUX SECONDES, et elle n'est pas de confort : `fspackagetool`
// horodate le .spb a la SECONDE PLEINE, si bien qu'un fichier tout juste
// produit peut paraitre une fraction de seconde plus vieux que le XML qui vient
// de le declencher. Sans cette marge, le script echouerait sur ses propres
// succes — mesure : XML .113, .spb .000, meme seconde.
const TOLERANCE_MS = 2000;
if (statSync(produit).mtimeMs < statSync(source).mtimeMs - TOLERANCE_MS) {
  console.error('\nECHEC : le .spb est plus ancien que son XML — il n a pas ete recompile.');
  console.error(`  XML  ${new Date(statSync(source).mtimeMs).toISOString()}`);
  console.error(`  .spb ${new Date(statSync(produit).mtimeMs).toISOString()}`);
  process.exit(1);
}
console.log('.spb compile et a jour.');

/*
 * La VALIDATION, elle, est signalee sans faire echouer le script.
 *
 * Elle echoue sur `package_order_hint` vide — une chaine que le PackageBuilder
 * ecrit lui-meme dans le manifeste qu'il genere, et que son propre validateur
 * refuse ensuite. Rien dans la definition du paquet ne permet de la renseigner
 * (verifie dans le SDK 1.8.14 : ni schema, ni exemple). Et c'est sans portee
 * ici : la validation vient APRES la compilation, elle ne touche qu'aux
 * metadonnees de `Build/Packages/`, et une centaine de paquets Community
 * installes sur cette machine portent la meme chaine vide sans que le
 * simulateur s'en emeuve. Le paquet livre est `sixk-sextant/`, assemble
 * ci-dessous.
 */
if (r.status !== 0) {
  console.log(`(fspackagetool a rendu ${r.status} — validation du paquet en echec,`
    + ' sans consequence sur le .spb ni sur le paquet livre.)');
}

// Le reassemblage recopie le .spb dans le paquet et le liste dans layout.json.
await import('./build.mjs');
