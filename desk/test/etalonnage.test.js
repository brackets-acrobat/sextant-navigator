/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

/**
 * L'ÉTALONNAGE, DE LA SESSION À LA CORRECTION ADOPTÉE.
 *
 * Le noyau sait déjà mesurer une série (voir sextant/test/calibration.test.js) ;
 * ce qui se joue ici est autour : qui a le droit d'ouvrir une session, quelles
 * visées lui appartiennent, et ce qu'il advient de la correction.
 *
 * Le point le plus facile à casser sans s'en apercevoir est la FENÊTRE DE
 * TEMPS. Le carnet porte deux horloges — l'heure zulu du simulateur, qui peut
 * être une nuit de 1943, et l'heure d'arrivée réelle. La session se déroule ce
 * soir : elle doit donc filtrer sur la seconde. Les confondre viderait la série
 * sans que rien ne l'explique.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Même procédé que le test du carnet : on remplace `config.js` dans le cache de
// modules avant tout le reste, pour que rien n'écrive dans les documents de
// l'utilisateur — et pour que le code de production n'ait aucune trappe.
const DOSSIER = fs.mkdtempSync(path.join(os.tmpdir(), 'sextant-etal-'));
const cheminConfig = require.resolve('../src/main/config.js');
require.cache[cheminConfig] = {
  id: cheminConfig,
  filename: cheminConfig,
  loaded: true,
  exports: { dossierBase: () => DOSSIER, dossierDonnees: () => DOSSIER, chargerConfig: () => ({}) },
};

const noyauMod = require('../src/main/noyau.js');
const visees = require('../src/main/visees.js');
const etalonnage = require('../src/main/etalonnage.js');

let n = null;
test.before(async () => { n = await noyauMod.charger(); });

// Le parking : une position CONNUE, et c'est tout ce que la procédure demande.
const TERRAIN = { lat: 34.5, lon: -122.0 };
const ALT = 200;

// Les deux défauts cachés. CORRECTION est ce que le navigateur doit finir par
// trouver ; RETARD est le temps dont son tambour traîne derrière le ciel.
const CORRECTION = -4.5;
const RETARD = 30;

/**
 * Fabrique des visées comme le panneau les enverrait, avec le retard de
 * manivelle simulé : le tambour montre le ciel d'il y a RETARD secondes, et la
 * visée est datée de l'instant courant. C'est physiquement ce que fait un
 * intégrateur qu'on manivelle en retard.
 */
function fabriquer({ maxRate = null, minRate = null, combien = 8 } = {}) {
  const out = [];
  const base = Date.UTC(2026, 0, 15, 4, 30, 0);
  for (let i = 0; i < 24 && out.length < combien; i += 1) {
    const quand = new Date(base + i * 10 * 60000);
    const vue = n.visibleBodies({ utc: quand, position: TERRAIN });
    for (const b of vue.bodies) {
      if (b.kind !== 'star' || out.length >= combien) continue;
      const vitesse = n.altitudeRate({ body: b.name, utc: quand, position: TERRAIN });
      if (maxRate !== null && Math.abs(vitesse) > maxRate) continue;
      if (minRate !== null && Math.abs(vitesse) < minRate) continue;
      out.push({
        id: `v${out.length}-${b.name}`,
        body: b.name,
        utc: quand.toISOString(),
        hs: n.simulateSight({
          utc: new Date(quand.getTime() - RETARD * 1000),
          body: b.name,
          actual: TERRAIN,
          indexError: CORRECTION,
          altitudeFt: ALT,
        }).hs,
        seconds: 90,
        flight: { altitudeFt: ALT, groundSpeedKt: 0, trackDeg: 0 },
        truth: TERRAIN,
      });
    }
  }
  return out;
}

test.beforeEach(() => {
  visees.vider();
  etalonnage.oublier();
  etalonnage.arreter();
});

// ---------------------------------------------------------------------------

test('étalonnage — en vol, on refuse', () => {
  // Ce n'est pas de la prudence : contre une estime qui a dérivé de cinq
  // milles, on mesurerait la dérive au lieu de l'instrument.
  const r = etalonnage.demarrer({ lat: TERRAIN.lat, lon: TERRAIN.lon, auSol: false });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'en-vol');
  assert.equal(etalonnage.lire().session, null);
});

test('étalonnage — la position du terrain n’est offerte qu’au sol', () => {
  assert.equal(etalonnage.demarrer({ lat: 1, lon: 2, origine: 'sol', auSol: null }).error, 'pas-au-sol');
  assert.equal(etalonnage.demarrer({ lat: 1, lon: 2, origine: 'sol', auSol: true }).ok, true);
});

test('étalonnage — sans simulateur, la saisie manuelle passe', () => {
  // Rejouer un carnet, application seule : rien ne dit que l'appareil vole,
  // donc rien ne justifie de refuser.
  const r = etalonnage.demarrer({ lat: TERRAIN.lat, lon: TERRAIN.lon, auSol: null });
  assert.equal(r.ok, true);
  assert.equal(r.session.origine, 'manuelle');
});

test('étalonnage — la série ne prend que ce qui est arrivé APRÈS l’ouverture', async () => {
  // Une visée de la session précédente, déjà au carnet.
  const [avant] = fabriquer({ maxRate: 1, combien: 1 });
  visees.ajouter(avant);
  // L'heure d'arrivée est prise à la milliseconde : sans ce souffle, la visée
  // d'avant et l'ouverture de la session tomberaient dans la même, et le test
  // mesurerait la résolution de l'horloge au lieu du filtre. En usage réel il
  // y a des minutes entre les deux.
  await new Promise((r) => setTimeout(r, 5));

  etalonnage.demarrer({ lat: TERRAIN.lat, lon: TERRAIN.lon, auSol: true, origine: 'sol' });
  // Les visées suivantes portent des heures ZULU de 2026 comme la première :
  // seule leur heure d'ARRIVÉE les distingue, et c'est elle qui doit compter.
  for (const v of fabriquer({ maxRate: 1, combien: 7 })) {
    if (v.id !== avant.id) visees.ajouter(v);
  }

  const m = await etalonnage.mesurer({ visees: visees.liste().visees });
  assert.equal(m.ok, true);
  assert.ok(m.lignes.length >= 5, `${m.lignes.length} visées dans la série`);
  assert.ok(!m.lignes.some((l) => l.id === avant.id), 'la visée d’avant ne doit pas y être');
});

test('étalonnage — une série d’astres lents retrouve la correction cachée', async () => {
  etalonnage.demarrer({ lat: TERRAIN.lat, lon: TERRAIN.lon, auSol: true, origine: 'sol' });
  for (const v of fabriquer({ maxRate: 1, combien: 8 })) visees.ajouter(v);

  const m = await etalonnage.mesurer({ visees: visees.liste().visees });
  assert.equal(m.ok, true);
  assert.equal(m.resume.methode, 'lents');
  assert.ok(m.lignes.every((l) => l.lente), 'toutes ces visées sont lentes');
  assert.ok(
    Math.abs(m.resume.correctionMin - CORRECTION) < 0.35,
    `correction ${m.resume.correctionMin.toFixed(2)}′ pour ${CORRECTION}′`,
  );
});

test('étalonnage — une série d’astres rapides mesure la main, pas l’instrument', async () => {
  etalonnage.demarrer({ lat: TERRAIN.lat, lon: TERRAIN.lon, auSol: true, origine: 'sol' });
  for (const v of fabriquer({ minRate: 8, combien: 8 })) visees.ajouter(v);

  const m = await etalonnage.mesurer({ visees: visees.liste().visees });
  assert.equal(m.resume.lents.n, 0);
  assert.ok(m.lignes.every((l) => !l.lente), 'aucune de ces visées n’est lente');
  // La moyenne brute est fausse de plusieurs minutes d'arc — c'est l'erreur
  // qu'on a réellement commise en vol, et le module doit la rendre visible.
  assert.ok(
    Math.abs(-m.resume.brut.meanMin - CORRECTION) > 1.5,
    `moyenne brute ${(-m.resume.brut.meanMin).toFixed(2)}′ contre ${CORRECTION}′`,
  );
});

test('étalonnage — une visée refusée sort du calcul mais reste affichée', async () => {
  etalonnage.demarrer({ lat: TERRAIN.lat, lon: TERRAIN.lon, auSol: true, origine: 'sol' });
  const lot = fabriquer({ maxRate: 1, combien: 8 });
  for (const v of lot) visees.ajouter(v);

  const avant = await etalonnage.mesurer({ visees: visees.liste().visees });
  const bascule = etalonnage.basculer(lot[0].id);
  assert.equal(bascule.ok, true);
  const apres = await etalonnage.mesurer({ visees: visees.liste().visees });

  assert.equal(apres.lignes.length, avant.lignes.length - 1);
  assert.equal(apres.refusees.length, 1);
  assert.equal(apres.refusees[0].id, lot[0].id);

  // Et l'on peut la remettre : un refus n'est pas une suppression.
  etalonnage.basculer(lot[0].id);
  const remis = await etalonnage.mesurer({ visees: visees.liste().visees });
  assert.equal(remis.lignes.length, avant.lignes.length);
});

test('étalonnage — adopter ferme la session et garde la provenance', async () => {
  etalonnage.demarrer({ lat: TERRAIN.lat, lon: TERRAIN.lon, auSol: true, origine: 'sol' });
  for (const v of fabriquer({ maxRate: 1, combien: 8 })) visees.ajouter(v);
  const m = await etalonnage.mesurer({ visees: visees.liste().visees });

  const r = etalonnage.adopter({
    correctionMin: m.resume.correctionMin,
    incertitudeMin: m.resume.incertitudeMin,
    methode: m.resume.methode,
    n: m.resume.lents.n,
    position: TERRAIN,
  });
  assert.equal(r.ok, true);
  // La session est close : la laisser ouverte ferait grossir la série de toutes
  // les visées du vol qui suit.
  assert.equal(r.session, null);
  assert.ok(Math.abs(r.adoptee.correctionMin - CORRECTION) < 0.35);
  assert.equal(r.adoptee.methode, 'lents');
  assert.ok(r.adoptee.faitLe, 'une correction sans sa date est un nombre qu’on n’ose plus toucher');

  // Et elle survit à un rechargement : le sextant garde son étalon.
  assert.ok(fs.existsSync(etalonnage.chemin()));
  const surDisque = JSON.parse(fs.readFileSync(etalonnage.chemin(), 'utf-8'));
  assert.ok(Math.abs(surDisque.adoptee.correctionMin - CORRECTION) < 0.35);
});

test('étalonnage — mesurer sans session ne calcule rien', async () => {
  const m = await etalonnage.mesurer({ visees: visees.liste().visees });
  assert.equal(m.ok, false);
  assert.equal(m.error, 'pas-de-session');
});
