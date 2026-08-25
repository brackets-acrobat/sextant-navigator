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

/** Un client de panneau instrumente : on note tout ce qui lui arrive. */
function clientInstrumente(port) {
  const vu = { consignes: [], etats: [], vidages: [] };
  const c = new PontClient({
    surConsigne: (x) => vu.consignes.push(x),
    surEtat: (e) => vu.etats.push(e),
    surVidage: (f) => vu.vidages.push(f.slice()),
  }, { port });
  return { c, vu };
}

// ---------------------------------------------------------------------------

test('bout en bout — les deux cotes visent le MEME port', () => {
  // Le seul reglage partage du projet, et il est en dur des deux cotes : un
  // panneau MSFS ne lit aucun fichier. Si l'un des deux derive, le pont ne se
  // forme jamais, et rien dans l'interface ne dira pourquoi — le panneau
  // afficherait « table hors ligne » avec l'application ouverte a cote.
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

test('bout en bout — une visee monte, l’accuse la retire de la file', async () => {
  const port = portLibre();
  const serveur = new PontServeur();
  await serveur.demarrer(port);
  const recues = [];
  serveur.on('visee', (v) => { recues.push(v); serveur.accuser(v.id); });
  const { c } = clientInstrumente(port);
  try {
    c.demarrer();
    assert.ok(await jusqua(() => c.etat().connecte));

    c.deposer(visee('v1'));
    assert.ok(await jusqua(() => recues.length === 1), 'la visee n’est pas arrivee');
    assert.equal(recues[0].body, 'Vega');
    assert.equal(recues[0].hs, 43.21);
    // Et la file se vide : c'est l'accuse qui l'autorise, rien d'autre.
    assert.ok(await jusqua(() => c.etat().enAttente === 0), 'la visee reste en attente');
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
    const recues = [];
    serveur.on('visee', (v) => { recues.push(v); serveur.accuser(v.id); });
    try {
      // La reconnexion est temporisee (1 s, puis le double a chaque echec) :
      // c'est deliberé, un panneau qui martele le port coute des images au
      // simulateur pendant tout un vol.
      assert.ok(await jusqua(() => c.etat().connecte, 15000), 'pas de reconnexion');
      assert.ok(await jusqua(() => recues.length === 2), `${recues.length} visee(s) rattrapee(s) sur 2`);
      assert.deepEqual(recues.map((v) => v.body).sort(), ['Deneb', 'Vega']);
      assert.ok(await jusqua(() => c.etat().enAttente === 0), 'file non videe apres accuse');
    } finally {
      serveur.arreter();
    }
  } finally {
    c.arreter();
  }
});

test('bout en bout — sans accuse, la visee ne s’oublie pas', async () => {
  // Le cas du disque plein : la table recoit la visee mais n'arrive pas a
  // l'ecrire, donc elle n'acquitte pas. Le panneau doit la GARDER — sans quoi
  // deux minutes de collimation n'existeraient plus nulle part.
  const port = portLibre();
  const muet = new PontServeur();
  await muet.demarrer(port);
  const vues = [];
  muet.on('visee', (v) => vues.push(v));   // recue, mais jamais acquittee
  const { c } = clientInstrumente(port);
  try {
    c.demarrer();
    assert.ok(await jusqua(() => c.etat().connecte));
    c.deposer(visee('v-non-acquittee'));
    assert.ok(await jusqua(() => vues.length === 1), 'la visee n’est pas arrivee');
    // On laisse passer du temps : rien ne doit la faire disparaitre.
    await new Promise((r) => setTimeout(r, 200));
    assert.equal(c.etat().enAttente, 1, 'la visee a ete oubliee sans accuse');
    muet.arreter();

    // La table repart, le disque va mieux : la visee revient d'elle-meme.
    assert.ok(await jusqua(() => !c.etat().connecte));
    const bonne = new PontServeur();
    await bonne.demarrer(port);
    const rangees = [];
    bonne.on('visee', (v) => { rangees.push(v); bonne.accuser(v.id); });
    try {
      assert.ok(await jusqua(() => rangees.length === 1, 15000), 'la visee n’est pas revenue');
      assert.equal(rangees[0].id, 'v-non-acquittee');
      assert.ok(await jusqua(() => c.etat().enAttente === 0), 'file non videe apres le bon accuse');
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
  const recues = [];
  serveur.on('visee', (v) => { recues.push(v); serveur.accuser(v.id); });
  const { c } = clientInstrumente(port);
  try {
    c.reprendre(enAttente);              // ce que le stockage avait garde
    assert.equal(c.etat().enAttente, 1);
    c.demarrer();
    assert.ok(await jusqua(() => recues.length === 1), 'la visee persistee n’est pas repartie');
    assert.equal(recues[0].id, 'v-persistee');
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
    const recues = [];
    serveur2.on('visee', (v) => { recues.push(v); serveur2.accuser(v.id); });
    try {
      assert.ok(await jusqua(() => recues.length === 1, 15000), 'visee perdue apres la chute');
      assert.equal(recues[0].id, 'v-apres-chute');
    } finally {
      serveur2.arreter();
    }
  } finally {
    c.arreter();
  }
});
