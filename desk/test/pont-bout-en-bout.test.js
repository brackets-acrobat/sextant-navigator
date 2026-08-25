/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

/**
 * Les deux moities du pont, face a face.
 *
 * `pont.test.js` eprouve le serveur contre le client natif de Node : il prouve
 * que le protocole est conforme. Il ne prouve PAS que les deux bouts du projet
 * se comprennent — un serveur parfait et un client parfait peuvent tres bien
 * s'envoyer des messages que l'autre ignore poliment.
 *
 * Ce fichier-ci branche donc le VRAI client du panneau sur le VRAI serveur de
 * l'application. Il traverse la frontiere des deux projets, et c'est voulu :
 * un pont est par definition ce qui n'appartient a aucune des deux rives, et
 * s'il doit casser, c'est ici qu'il faut que ca se voie.
 *
 * Le client du panneau est du JavaScript pur — WebSocket, setTimeout, rien
 * d'autre. Il n'a besoin ni du simulateur, ni d'un DOM, ni d'Electron : il
 * tourne tel quel dans Node.
 *
 * CE QUI A CHANGE LE 25 AOUT 2026. L'accuse de reception a disparu, remplace
 * par l'annonce du CARNET : la table dit ce qu'elle detient, le panneau retire
 * de sa file ce qui y figure. La difference tient en une phrase, et elle est
 * eprouvee plus bas — un accuse perdu bloquait une visee pour toujours, une
 * annonce perdue ne coute qu'un tour de relance.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');

const { Pont: PontServeur } = require('../src/main/pont.js');

const CHEMIN_CLIENT = path.join(
  __dirname, '..', '..', 'panel', 'sixk-sextant', 'html_ui',
  'InGamePanels', 'Sextant', 'app', 'pont.js',
);

// Le client du panneau est en modules ES ; ce fichier est en CommonJS. Meme
// frontiere que pour le noyau d'ephemerides, meme passage : l'import dynamique.
let PontClient = null;
let PONT_PORT = null;
test.before(async () => {
  const mod = await import(pathToFileURL(CHEMIN_CLIENT).href);
  PontClient = mod.Pont;
  PONT_PORT = mod.PONT_PORT;
});

// Le client vise un port en dur : c'est sa contrainte, un panneau MSFS ne lit
// aucun fichier de reglages. Les EPREUVES, elles, prennent un port libre a
// chaque fois — deux suites lancees coup sur coup se disputeraient le port
// fixe, et un test qui echoue une fois sur dix ne vaut pas mieux que pas de
// test. L'accord des deux constantes est verifie a part, ci-dessous.
let prochainPort = 8830;
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
 * Un client de panneau instrumente : on note tout ce qui lui arrive.
 *
 * La relance est ramenee a 60 ms — en service elle vaut cinq secondes, et une
 * suite de tests qui les attend vraiment ne se lance plus.
 */
function clientInstrumente(port, options) {
  const vu = { consignes: [], etats: [], vidages: [] };
  const c = new PontClient({
    surConsigne: (x) => vu.consignes.push(x),
    surEtat: (e) => vu.etats.push(e),
    surVidage: (f) => vu.vidages.push(f.slice()),
  }, Object.assign({ port, relanceMs: 60 }, options));
  return { c, vu };
}

/**
 * Une table qui range tout ce qu'on lui donne et annonce son carnet.
 *
 * C'est le comportement de `main.js` en resume ; la version qui passe par le
 * VRAI carnet sur disque est eprouvee dans `pont-carnet.test.js`.
 */
function tableQuiRange(serveur) {
  const carnet = new Map();
  const annoncer = () => serveur.annoncerCarnet([...carnet.keys()]);
  serveur.on('demande-carnet', annoncer);
  serveur.on('visee', (v) => { carnet.set(v.id, v); annoncer(); });
  return { carnet, annoncer, recues: () => [...carnet.values()] };
}

// ---------------------------------------------------------------------------

test('bout en bout — les deux cotes visent le MEME port', () => {
  // Le seul reglage partage du projet, et il est en dur des deux cotes : un
  // panneau MSFS ne lit aucun fichier. Si l'un des deux derive, le pont ne se
  // forme jamais, et rien dans l'interface ne dira pourquoi.
  const { DEFAULTS } = require('../src/main/config.js');
  assert.equal(PONT_PORT, DEFAULTS.pontPort,
    `le panneau appelle le port ${PONT_PORT}, l’application ecoute le ${DEFAULTS.pontPort}`);
});

test('bout en bout — la consigne descend jusqu’a l’instrument', async () => {
  const port = portLibre();
  const serveur = new PontServeur();
  await serveur.demarrer(port);
  const { c, vu } = clientInstrumente(port);
  try {
    c.demarrer();
    assert.ok(await jusqua(() => c.etat().connecte), 'le panneau ne s’est pas connecte');

    serveur.envoyerConsigne({ body: 'Altair', hc: 41.2, zn: 205, gisement: 280 });
    assert.ok(await jusqua(() => vu.consignes.length === 1), 'consigne non recue');
    assert.equal(vu.consignes[0].body, 'Altair');
    assert.equal(vu.consignes[0].gisement, 280);

    // `body: null` annule : le navigateur n'a plus rien a proposer, et le
    // champ du sextant doit se vider plutot que de garder un astre perime.
    serveur.envoyerConsigne({ body: null });
    assert.ok(await jusqua(() => vu.consignes.length === 2), 'annulation non recue');
    assert.equal(vu.consignes[1], null);
  } finally {
    c.arreter();
    serveur.arreter();
  }
});

test('bout en bout — une visee monte, le carnet la retire de la file', async () => {
  const port = portLibre();
  const serveur = new PontServeur();
  await serveur.demarrer(port);
  const table = tableQuiRange(serveur);
  const { c } = clientInstrumente(port);
  try {
    c.demarrer();
    assert.ok(await jusqua(() => c.etat().connecte));

    c.deposer(visee('v1'));
    assert.ok(await jusqua(() => table.carnet.size === 1), 'la visee n’est pas arrivee');
    assert.equal(table.recues()[0].body, 'Vega');
    assert.equal(table.recues()[0].hs, 43.21);
    // Et la file se vide : c'est l'annonce du carnet qui l'autorise, rien d'autre.
    assert.ok(await jusqua(() => c.etat().enAttente === 0), 'la visee reste en attente');
  } finally {
    c.arreter();
    serveur.arreter();
  }
});

test('bout en bout — UNE ANNONCE PERDUE NE BLOQUE RIEN', async () => {
  /*
   * LE TEST QUI N'EXISTAIT PAS, ET QUI AURAIT EVITE L'APRES-MIDI DU 25 AOUT.
   *
   * Avec l'ancien accuse, ce scenario etait sans issue : le message se perdait,
   * la visee restait en file pour toujours, et rien ne la relancait tant que la
   * connexion tenait. Le seul remede etait une reconnexion, que rien ne
   * provoquait — le joueur voyait « 3 PENDING » sans explication ni recours.
   *
   * Ici, la table range mais avale sa premiere annonce. La relance doit
   * rattraper, SANS que la connexion soit retombee.
   */
  const port = portLibre();
  const serveur = new PontServeur();
  await serveur.demarrer(port);

  const carnet = new Map();
  // On avale l'annonce qui suit la PREMIERE visee — celle de l'accueil passe
  // normalement, sinon le test se contenterait de prouver que l'accueil repare,
  // ce qui n'est pas la propriete cherchee.
  let avalerProchaine = true;
  serveur.on('demande-carnet', () => serveur.annoncerCarnet([...carnet.keys()]));
  serveur.on('visee', (v) => {
    carnet.set(v.id, v);
    if (avalerProchaine) { avalerProchaine = false; return; }
    serveur.annoncerCarnet([...carnet.keys()]);
  });

  const { c } = clientInstrumente(port);
  try {
    c.demarrer();
    assert.ok(await jusqua(() => c.etat().connecte));

    c.deposer(visee('v-annonce-perdue'));
    assert.ok(await jusqua(() => carnet.size === 1), 'la visee n’est pas arrivee');

    // L'annonce a ete avalee : a cet instant precis, la file est encore pleine.
    assert.equal(c.etat().enAttente, 1);
    assert.equal(c.etat().connecte, true, 'la connexion doit tenir : c’est tout le sujet');

    // Et pourtant elle se vide, parce que la relance repropose la file et que
    // la table repond cette fois. Aucune reconnexion n'a eu lieu.
    assert.ok(await jusqua(() => c.etat().enAttente === 0, 3000),
      'la file ne se repare pas toute seule : la relance ne fonctionne pas');
    assert.equal(c.etat().connecte, true, 'la reparation ne doit rien devoir a une reconnexion');
  } finally {
    c.arreter();
    serveur.arreter();
  }
});

test('bout en bout — le carnet vide la file DES LA CONNEXION', async () => {
  // Le panneau rouvre en tenant des visees que la table a rangees depuis
  // longtemps — parce que l'annonce s'etait perdue, ou qu'il etait ferme quand
  // elle est passee. Il ne doit pas attendre d'en redeposer une pour l'apprendre.
  const port = portLibre();
  const serveur = new PontServeur();
  await serveur.demarrer(port);

  const dejaLa = ['v-rangee-1', 'v-rangee-2'];
  serveur.on('demande-carnet', () => serveur.annoncerCarnet(dejaLa));

  const { c } = clientInstrumente(port);
  try {
    c.reprendre([visee('v-rangee-1'), visee('v-rangee-2'), visee('v-inconnue')]);
    assert.equal(c.etat().enAttente, 3);

    c.demarrer();
    assert.ok(await jusqua(() => c.etat().enAttente === 1), 'la file n’a pas ete reconciliee');
    // Celle que la table n'a pas reste : on ne jette que sur preuve.
    assert.equal(c.file[0].id, 'v-inconnue');
  } finally {
    c.arreter();
    serveur.arreter();
  }
});

test('bout en bout — VISER SANS LA TABLE, puis la retrouver', async () => {
  // Le scenario qui justifie toute la file d'attente : on vole, on vise, et
  // l'application n'est pas lancee. Deux minutes de collimation ne doivent pas
  // disparaitre parce qu'une fenetre etait fermee.
  const port = portLibre();
  const { c } = clientInstrumente(port);
  try {
    c.demarrer();                       // personne n'ecoute
    c.deposer(visee('v-seul-1'));
    c.deposer(visee('v-seul-2', 'Deneb'));
    assert.equal(c.etat().connecte, false);
    assert.equal(c.etat().enAttente, 2, 'les visees doivent rester en file');

    // Le navigateur ouvre enfin la table.
    const serveur = new PontServeur();
    await serveur.demarrer(port);
    const table = tableQuiRange(serveur);
    try {
      // La reconnexion est temporisee (1 s, puis le double a chaque echec) :
      // c'est delibere, un panneau qui martele le port coute des images au
      // simulateur pendant tout un vol.
      assert.ok(await jusqua(() => c.etat().connecte, 15000), 'pas de reconnexion');
      assert.ok(await jusqua(() => table.carnet.size === 2),
        `${table.carnet.size} visee(s) rattrapee(s) sur 2`);
      assert.deepEqual(table.recues().map((v) => v.body).sort(), ['Deneb', 'Vega']);
      assert.ok(await jusqua(() => c.etat().enAttente === 0), 'file non videe apres le carnet');
    } finally {
      serveur.arreter();
    }
  } finally {
    c.arreter();
  }
});

test('bout en bout — non rangee, la visee ne s’oublie pas', async () => {
  // Le cas du disque plein : la table recoit la visee mais n'arrive pas a
  // l'ecrire, donc elle ne l'annonce pas. Le panneau doit la GARDER — sans quoi
  // deux minutes de collimation n'existeraient plus nulle part.
  const port = portLibre();
  const muet = new PontServeur();
  await muet.demarrer(port);
  const vues = [];
  muet.on('visee', (v) => vues.push(v));   // recue, mais jamais annoncee
  muet.on('demande-carnet', () => muet.annoncerCarnet([]));   // « je ne detiens rien »
  const { c } = clientInstrumente(port);
  try {
    c.demarrer();
    assert.ok(await jusqua(() => c.etat().connecte));
    c.deposer(visee('v-non-rangee'));
    assert.ok(await jusqua(() => vues.length >= 1), 'la visee n’est pas arrivee');
    // On laisse passer plusieurs relances : rien ne doit la faire disparaitre.
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(c.etat().enAttente, 1, 'la visee a ete oubliee sans preuve de rangement');
    muet.arreter();

    // La table repart, le disque va mieux : la visee revient d'elle-meme.
    assert.ok(await jusqua(() => !c.etat().connecte));
    const bonne = new PontServeur();
    await bonne.demarrer(port);
    const table = tableQuiRange(bonne);
    try {
      assert.ok(await jusqua(() => table.carnet.size === 1, 15000), 'la visee n’est pas revenue');
      assert.ok(table.carnet.has('v-non-rangee'));
      assert.ok(await jusqua(() => c.etat().enAttente === 0), 'file non videe apres rangement');
    } finally {
      bonne.arreter();
    }
  } finally {
    c.arreter();
  }
});

test('bout en bout — la table qui ouvre apres coup retrouve la consigne', async () => {
  // Symetrique du precedent : le panneau se rebranche, et le serveur lui
  // rejoue la derniere consigne sans que le navigateur ait a re-cliquer.
  const port = portLibre();
  const serveur = new PontServeur();
  await serveur.demarrer(port);
  serveur.envoyerConsigne({ body: 'Sirius', hc: 15.2, zn: 132, gisement: 207 });
  const { c, vu } = clientInstrumente(port);
  try {
    c.demarrer();
    assert.ok(await jusqua(() => vu.consignes.length >= 1), 'consigne non rejouee a l’arrivee');
    assert.equal(vu.consignes[0].body, 'Sirius');
    assert.equal(c.etat().consigne.body, 'Sirius');
  } finally {
    c.arreter();
    serveur.arreter();
  }
});

test('bout en bout — la file survit au panneau ferme', async () => {
  // Le panneau est detruit (on ferme la fenetre dans le simulateur) et rouvert.
  // Ce qu'il avait garde lui est rendu par `reprendre`, et repart.
  const enAttente = [visee('v-persistee')];

  const port = portLibre();
  const serveur = new PontServeur();
  await serveur.demarrer(port);
  const table = tableQuiRange(serveur);
  const { c } = clientInstrumente(port);
  try {
    c.reprendre(enAttente);              // ce que le stockage avait garde
    assert.equal(c.etat().enAttente, 1);
    c.demarrer();
    assert.ok(await jusqua(() => table.carnet.size === 1), 'la visee persistee n’est pas repartie');
    assert.ok(table.carnet.has('v-persistee'));
  } finally {
    c.arreter();
    serveur.arreter();
  }
});

test('bout en bout — la table qui tombe en vol ne perd pas la visee suivante', async () => {
  const port = portLibre();
  const serveur = new PontServeur();
  await serveur.demarrer(port);
  const { c } = clientInstrumente(port);
  try {
    c.demarrer();
    assert.ok(await jusqua(() => c.etat().connecte));

    // L'application se ferme brutalement au milieu du vol.
    serveur.arreter();
    assert.ok(await jusqua(() => !c.etat().connecte), 'le panneau se croit toujours connecte');

    // On continue de viser : la file reprend son office.
    c.deposer(visee('v-apres-chute'));
    assert.equal(c.etat().enAttente, 1);

    const serveur2 = new PontServeur();
    await serveur2.demarrer(port);
    const table = tableQuiRange(serveur2);
    try {
      assert.ok(await jusqua(() => table.carnet.size === 1, 15000), 'visee perdue apres la chute');
      assert.ok(table.carnet.has('v-apres-chute'));
    } finally {
      serveur2.arreter();
    }
  } finally {
    c.arreter();
  }
});

test('bout en bout — LE TEMOIN DE LIAISON dit ce que la liaison vaut', async () => {
  /*
   * L'autre moitie de la lecon du 25 aout : le panneau ne savait pas dire si la
   * table etait la. La plaque de consigne ne compte pas — elle affiche le
   * dernier papier recu et ne se rafraichit jamais, donc elle reste lisible
   * longtemps apres que la table a ferme. C'est precisement ce qui a fait
   * croire, des heures durant, que le pont etait vivant.
   *
   * `lien` ne se contente donc pas d'une socket ouverte : il exige que la table
   * se soit manifestee recemment.
   */
  const port = portLibre();
  const serveur = new PontServeur();
  await serveur.demarrer(port);
  // Silence court, pour ne pas attendre quinze secondes dans une epreuve.
  const { c } = clientInstrumente(port, { silenceMs: 250 });
  try {
    assert.equal(c.etat().lien, false, 'sans connexion, il n’y a pas de lien');

    c.demarrer();
    assert.ok(await jusqua(() => c.etat().connecte), 'pas de connexion');
    // Le serveur envoie « bienvenue » des l'accueil : la table s'est dite.
    assert.ok(await jusqua(() => c.etat().lien), 'la table repond, le lien devrait etre etabli');

    // Elle se tait. La socket, elle, reste ouverte — c'est le cas qui trompait.
    await new Promise((r) => setTimeout(r, 400));
    assert.equal(c.etat().connecte, true, 'la socket doit rester ouverte pour que le test ait un sens');
    assert.equal(c.etat().lien, false, 'une table silencieuse ne doit pas passer pour presente');

    // Elle reparle : le lien revient sans reconnexion.
    serveur.envoyerConsigne({ body: 'Vega', hc: 40, zn: 90, gisement: 45 });
    assert.ok(await jusqua(() => c.etat().lien), 'le lien ne se retablit pas quand la table reparle');
  } finally {
    c.arreter();
    serveur.arreter();
  }
});

test('bout en bout — UNE TABLE SAINE ET UNE FILE VIDE NE DECLENCHENT PAS D’ALARME', async () => {
  /*
   * Le premier defaut du temoin, trouve en vol le soir meme de sa mise en
   * service : file vide, table parfaitement vivante, et « NO TABLE » en rouge.
   *
   * La raison etait que plus rien ne circulait — la table n'annonce son carnet
   * qu'a une connexion ou a un rangement, le panneau ne repropose que s'il a
   * quelque chose a proposer — et le silence est le cas NORMAL. Le temoin
   * mesurait « il s'est passe quelque chose recemment » au lieu de « la table
   * me repond ».
   *
   * Le panneau appelle donc a vide, et la table repond. Une fausse alarme
   * permanente est pire qu'aucune alarme : elle rend les vraies illisibles.
   */
  const port = portLibre();
  const serveur = new PontServeur();
  await serveur.demarrer(port);
  tableQuiRange(serveur);                       // repond aux appels
  // Silence tres court : trois battements suffisent a le franchir s'il n'y a
  // vraiment plus rien qui circule.
  const { c } = clientInstrumente(port, { silenceMs: 200 });
  try {
    c.demarrer();
    assert.ok(await jusqua(() => c.etat().lien), 'lien non etabli');
    assert.equal(c.etat().enAttente, 0, 'la file doit etre vide : c’est tout le sujet');

    await new Promise((r) => setTimeout(r, 600));   // dix battements sans rien a dire
    assert.equal(c.etat().lien, true,
      'une table vivante ne doit pas passer pour absente parce qu’il n’y a rien a s’envoyer');
  } finally {
    c.arreter();
    serveur.arreter();
  }
});
