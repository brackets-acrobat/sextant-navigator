/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

/**
 * LE TEST QUI MANQUAIT.
 *
 * `pont-bout-en-bout.test.js` branche le vrai client sur le vrai serveur, mais
 * la table y est un bouchon : elle range dans une Map et annonce. Elle ne se
 * trompe jamais, n'a pas de disque, et ne connait pas le dedoublonnage.
 *
 * Or c'est justement entre le pont et le carnet que la chaine peut casser sans
 * que rien ne le montre. Le 25 aout 2026, le diagnostic a coute une apres-midi
 * parce que la seule couture non eprouvee du projet etait la ligne de `main.js`
 * qui decide de repondre ou non :
 *
 *     if (res.ecrit || !res.ok) pont.accuser(v && v.id);   // l'ancienne
 *
 * Elle est remplacee, mais la lecon tient : ce fichier eprouve la chaine
 * COMPLETE — client du panneau, serveur, carnet sur disque, annonce — avec le
 * VRAI `visees.js`, ses ecritures, son dedoublonnage et sa mise sous scelles.
 *
 * `visees.js` passe par `config.js`, qui demande a Electron ou sont les
 * documents de l'utilisateur. Electron n'est pas la sous `node --test` : on lui
 * substitue un dossier temporaire, ce qui a l'avantage de ne jamais toucher au
 * carnet reel du joueur.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');
const { pathToFileURL } = require('url');

// --- Electron, en toc, AVANT le premier require de config.js ---------------
const RACINE_TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sextant-carnet-'));
const vraiLoad = Module._load;
Module._load = function (req, parent, isMain) {
  if (req === 'electron') return { app: { getPath: () => RACINE_TMP }, dialog: {} };
  return vraiLoad.call(this, req, parent, isMain);
};

const { Pont: PontServeur } = require('../src/main/pont.js');
const visees = require('../src/main/visees.js');

const CHEMIN_CLIENT = path.join(
  __dirname, '..', '..', 'panel', 'sixk-sextant', 'html_ui',
  'InGamePanels', 'Sextant', 'app', 'pont.js',
);

let PontClient = null;
test.before(async () => {
  PontClient = (await import(pathToFileURL(CHEMIN_CLIENT).href)).Pont;
});

test.after(() => {
  Module._load = vraiLoad;
  try { fs.rmSync(RACINE_TMP, { recursive: true, force: true }); } catch (_) {}
});

let prochainPort = 8860;
const portLibre = () => prochainPort++;

async function jusqua(cond, ms = 6000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 20));
  }
  return false;
}

function visee(id, body = 'Vega') {
  return {
    id,
    body,
    utc: '2026-01-15T19:30:00.000Z',
    hs: 43.21,
    seconds: 62,
    flight: { altitudeFt: 9000, groundSpeedKt: 150, trackDeg: 285 },
    truth: { lat: 34.5, lon: -122.0 },
  };
}

/**
 * La table, exactement comme `main.js` la cable. Si cette fonction et main.js
 * divergent, ce fichier ne prouve plus rien — c'est le prix d'un test qui
 * traverse un process principal qu'on ne peut pas instancier.
 */
function tableReelle(serveur) {
  const annoncer = () => serveur.annoncerCarnet(visees.ids());
  serveur.on('demande-carnet', annoncer);
  serveur.on('visee', (v) => { visees.ajouter(v); annoncer(); });
  return annoncer;
}

function videLeCarnet() { visees.vider(); }

// ---------------------------------------------------------------------------

test('carnet — une visee traverse tout, du panneau au disque, et la file se vide', async () => {
  videLeCarnet();
  const port = portLibre();
  const serveur = new PontServeur();
  await serveur.demarrer(port);
  tableReelle(serveur);
  const c = new PontClient({ surEtat: () => {}, surVidage: () => {} }, { port, relanceMs: 60 });
  try {
    c.demarrer();
    assert.ok(await jusqua(() => c.etat().connecte));

    c.deposer(visee('v-disque'));
    assert.ok(await jusqua(() => c.etat().enAttente === 0), 'la file ne s’est pas videe');

    // Et ce n'est pas une politesse : c'est ECRIT.
    const surDisque = JSON.parse(fs.readFileSync(visees.chemin(), 'utf-8')).visees;
    assert.equal(surDisque.length, 1);
    assert.equal(surDisque[0].id, 'v-disque');
  } finally {
    c.arreter();
    serveur.arreter();
  }
});

test('carnet — LE SCENARIO DU 25 AOUT : trois visees bloquees se debloquent seules', async () => {
  /*
   * L'etat exact dans lequel le joueur s'est retrouve : le panneau tient trois
   * visees, la table les a deja rangees, et rien ne les liberait.
   *
   * Sous l'ancien protocole, il fallait une reconnexion pour esperer un nouvel
   * accuse. Ici, la simple annonce du carnet a l'accueil suffit.
   */
  videLeCarnet();
  const trois = [visee('v-a', 'Rasalhague'), visee('v-b', 'Moon'), visee('v-c', 'Moon')];
  for (const v of trois) visees.ajouter(v);        // la table les detient deja
  assert.equal(visees.ids().length, 3);

  const port = portLibre();
  const serveur = new PontServeur();
  await serveur.demarrer(port);
  tableReelle(serveur);
  const c = new PontClient({ surEtat: () => {}, surVidage: () => {} }, { port, relanceMs: 60 });
  try {
    c.reprendre(trois);                            // le panneau les tient encore
    assert.equal(c.etat().enAttente, 3);

    c.demarrer();
    assert.ok(await jusqua(() => c.etat().enAttente === 0),
      'les trois visees restent bloquees : la reconciliation ne fonctionne pas');

    // Rien n'a ete duplique au passage.
    assert.equal(visees.ids().length, 3);
  } finally {
    c.arreter();
    serveur.arreter();
  }
});

test('carnet — un renvoi ne cree pas de doublon, et libere quand meme', async () => {
  videLeCarnet();
  const port = portLibre();
  const serveur = new PontServeur();
  await serveur.demarrer(port);
  tableReelle(serveur);
  const c = new PontClient({ surEtat: () => {}, surVidage: () => {} }, { port, relanceMs: 60 });
  try {
    c.demarrer();
    assert.ok(await jusqua(() => c.etat().connecte));
    c.deposer(visee('v-double'));
    assert.ok(await jusqua(() => c.etat().enAttente === 0));

    // Le panneau la repropose (reconnexion, relance, panneau rouvert…).
    c.reprendre([visee('v-double')]);
    c._annoncerFile();
    assert.ok(await jusqua(() => c.etat().enAttente === 0), 'un renvoi doit etre libere aussi');
    assert.equal(visees.ids().length, 1, 'le carnet a garde un doublon');
  } finally {
    c.arreter();
    serveur.arreter();
  }
});

test('carnet — une visee ILLISIBLE n’entre au carnet NI ne s’installe en file', async () => {
  /*
   * Ce test exigeait exactement le contraire jusqu'au 25 aout 2026 : il
   * verifiait que le panneau GARDE une visee illisible, au motif que rien ne
   * doit se perdre. C'etait le defaut, ecrit noir sur blanc et protege par une
   * epreuve — une entree que la table ne peut pas ranger restait en file a
   * vie, et le compteur du panneau ne redescendait plus jamais.
   *
   * La regle est donc renversee, et elle ne contredit pas « rien ne se perd » :
   * ce qui n'est pas une visee n'est pas du travail, et le retenir ne le sauve
   * pas — cela masque seulement les visees qui, elles, attendent vraiment.
   */
  videLeCarnet();
  const port = portLibre();
  const serveur = new PontServeur();
  await serveur.demarrer(port);
  tableReelle(serveur);
  const c = new PontClient({ surEtat: () => {}, surVidage: () => {} }, { port, relanceMs: 60 });
  try {
    c.demarrer();
    assert.ok(await jusqua(() => c.etat().connecte));

    const infirme = visee('v-infirme');
    delete infirme.hs;                    // plus de hauteur : ce n'est plus une visee
    c.deposer(infirme);

    await new Promise((r) => setTimeout(r, 250));
    assert.equal(visees.ids().length, 0, 'le carnet a accepte une visee illisible');
    assert.equal(c.etat().enAttente, 0, 'elle n’aurait jamais du entrer en file');
    assert.equal(c.etat().rebuts, 1, 'et le menage doit pouvoir se dire');
  } finally {
    c.arreter();
    serveur.arreter();
  }
});

test('carnet — LA PANNE REELLE : une entree sans identifiant ne bloque plus la file', async () => {
  /*
   * Ce qui s'est reellement passe le 25 aout 2026, et que ni la reproduction ni
   * les tests ne voyaient — parce que tous deux n'employaient que de VRAIES
   * visees.
   *
   * Le panneau tenait en file trois entrees sans `id`. La table les refusait a
   * chaque proposition, `normaliser()` exigeant un identifiant ; elles
   * n'entraient donc jamais au carnet ; le carnet ne les nommait donc jamais ;
   * elles ne quittaient donc jamais la file. « 3 PENDING » a vie, insensible
   * aux reconnexions, aux relances et aux redemarrages.
   *
   * La file refuse desormais ce qu'aucune table ne pourra ranger.
   */
  videLeCarnet();
  const port = portLibre();
  const serveur = new PontServeur();
  await serveur.demarrer(port);
  tableReelle(serveur);

  const sansId = visee('peu-importe');
  delete sansId.id;                     // l'entree empoisonnee
  const bonne = visee('v-saine');

  const c = new PontClient({ surEtat: () => {}, surVidage: () => {} }, { port, relanceMs: 60 });
  try {
    c.reprendre([sansId, sansId, sansId, bonne]);
    assert.equal(c.etat().enAttente, 1, 'les entrees inutilisables doivent etre ecartees a la reprise');
    assert.equal(c.etat().rebuts, 3, 'et leur nombre doit pouvoir se dire');

    c.demarrer();
    assert.ok(await jusqua(() => c.etat().enAttente === 0),
      'la visee saine doit partir sans etre retenue par les autres');
    assert.deepEqual(visees.ids(), ['v-saine']);
  } finally {
    c.arreter();
    serveur.arreter();
  }
});

test('carnet — ce qui traverse le pont ne contient PAS la verite', async () => {
  /*
   * L'annonce du carnet est une liste d'identifiants, et c'est deliberé : elle
   * ne peut rien reveler. Ce test le verifie par recherche textuelle dans ce
   * qui sort reellement de la socket — la meme discipline que pour `liste()`,
   * parce que tout le jeu tient a cette ignorance.
   */
  videLeCarnet();
  const port = portLibre();
  const serveur = new PontServeur();
  await serveur.demarrer(port);
  tableReelle(serveur);

  const sorti = [];
  const vraiEnvoyer = serveur._envoyer.bind(serveur);
  serveur._envoyer = (client, obj) => { sorti.push(JSON.stringify(obj)); return vraiEnvoyer(client, obj); };

  const c = new PontClient({ surEtat: () => {}, surVidage: () => {} }, { port, relanceMs: 60 });
  try {
    c.demarrer();
    assert.ok(await jusqua(() => c.etat().connecte));
    c.deposer(visee('v-scellee'));       // truth : lat 34.5, lon -122.0
    assert.ok(await jusqua(() => c.etat().enAttente === 0));

    const tout = sorti.join('\n');
    assert.ok(!tout.includes('34.5'), 'la latitude reelle est sortie par le pont');
    assert.ok(!tout.includes('-122'), 'la longitude reelle est sortie par le pont');
    assert.ok(!tout.includes('truth'), 'la verite est sortie par le pont');
    assert.ok(tout.includes('v-scellee'), 'l’identifiant, lui, doit bien sortir');
  } finally {
    c.arreter();
    serveur.arreter();
  }
});
