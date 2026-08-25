/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

/**
 * Le carnet des visees recues.
 *
 * Deux choses s'y jouent, et aucune n'est cosmetique :
 *
 *   - le DEDOUBLONNAGE, qui n'est pas une precaution mais le protocole : le
 *     panneau renvoie tout a chaque reconnexion, donc la meme visee arrive
 *     plusieurs fois, par construction ;
 *   - la MISE SOUS SCELLES de la position reelle. Tout le jeu tient a ce que
 *     le joueur ignore ou il est. Une visee la transporte — le debriefing en
 *     aura besoin — et c'est ici qu'elle doit s'arreter.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// `config.js` demande son dossier de travail a Electron, qui n'est pas la.
// On le remplace dans le cache de modules AVANT de charger `visees.js` : le
// code de production n'a donc aucune trappe de test, et les tests n'ecrivent
// pas dans les documents de l'utilisateur.
const DOSSIER = fs.mkdtempSync(path.join(os.tmpdir(), 'sextant-visees-'));
const cheminConfig = require.resolve('../src/main/config.js');
require.cache[cheminConfig] = {
  id: cheminConfig,
  filename: cheminConfig,
  loaded: true,
  exports: { dossierBase: () => DOSSIER, dossierDonnees: () => DOSSIER, chargerConfig: () => ({}) },
};

const visees = require('../src/main/visees.js');

const brute = (o) => Object.assign({
  id: 'v1',
  body: 'Vega',
  utc: '2026-01-15T19:30:00.000Z',
  hs: 43.21,
  seconds: 62,
  flight: { altitudeFt: 9000, groundSpeedKt: 150, trackDeg: 285 },
  truth: { lat: 34.5, lon: -122.0 },
}, o);

test.beforeEach(() => visees.vider());

// ---------------------------------------------------------------------------

test('carnet — une visee arrive, et se retrouve', () => {
  const r = visees.ajouter(brute());
  assert.equal(r.ok, true);
  assert.equal(r.nouvelle, true);
  const l = visees.liste();
  assert.equal(l.visees.length, 1);
  assert.equal(l.visees[0].body, 'Vega');
  assert.equal(l.visees[0].hs, 43.21);
});

test('carnet — LA VERITE NE SORT PAS', () => {
  // Le point de tout le jeu. Si cette position remontait a l'interface, une
  // evolution ulterieure pourrait l'afficher par distraction, et le joueur
  // saurait ou il est sans avoir fait son point.
  visees.ajouter(brute());
  const sortie = visees.liste().visees[0];
  assert.equal(sortie.truth, undefined, 'la position reelle a franchi la porte');
  // Mais elle est bien conservee — le debriefing en aura besoin.
  assert.equal(sortie.aVerite, true);
  const interne = visees.listeAvecVerite()[0];
  assert.equal(interne.truth.lat, 34.5);

  // Et rien n'en subsiste dans le texte rendu : c'est le controle qui attrape
  // une fuite par une cle qu'on aurait oublie de retirer.
  assert.equal(/34\.5|-122/.test(JSON.stringify(visees.liste())), false);
});

test('carnet — la meme visee deux fois n’en fait qu’une', () => {
  assert.equal(visees.ajouter(brute()).nouvelle, true);
  const second = visees.ajouter(brute());
  assert.equal(second.ok, true, 'un renvoi n’est pas une erreur');
  assert.equal(second.nouvelle, false);
  assert.equal(visees.liste().visees.length, 1);
});

test('carnet — deux visees distinctes cohabitent', () => {
  visees.ajouter(brute({ id: 'a' }));
  visees.ajouter(brute({ id: 'b', body: 'Deneb' }));
  assert.equal(visees.liste().visees.length, 2);
});

test('carnet — l’ordre est celui du CIEL, pas celui du reseau', () => {
  // Une visee qui a attendu la reconnexion arrive apres, mais elle a eu lieu
  // avant : le carnet doit raconter le vol, pas le reseau.
  visees.ajouter(brute({ id: 'tard', utc: '2026-01-15T19:40:00.000Z' }));
  visees.ajouter(brute({ id: 'tot', utc: '2026-01-15T19:20:00.000Z' }));
  assert.deepEqual(visees.liste().visees.map((v) => v.id), ['tot', 'tard']);
});

test('carnet — ce qui n’est pas une visee est refuse', () => {
  // La charge vient d'une socket. Meme sur la boucle locale, on ne range pas
  // dans le carnet ce qu'on n'a pas relu.
  const mauvaises = [
    null,
    'Vega',
    brute({ id: undefined }),
    brute({ id: '' }),
    brute({ body: undefined }),
    brute({ utc: 'jeudi' }),
    brute({ hs: 'quarante-trois' }),
    brute({ hs: NaN }),
  ];
  for (const m of mauvaises) {
    const r = visees.ajouter(m);
    assert.equal(r.ok, false, `acceptee a tort : ${JSON.stringify(m)}`);
  }
  assert.equal(visees.liste().visees.length, 0);
});

test('carnet — les champs de vol manquants deviennent null, pas undefined', () => {
  // Le carnet sera relu par la reduction : un champ absent doit se voir, pas
  // se confondre avec un zero.
  const r = visees.ajouter(brute({ id: 'sansvol', flight: undefined, seconds: undefined }));
  assert.equal(r.ok, true);
  const v = visees.liste().visees.find((x) => x.id === 'sansvol');
  assert.equal(v.seconds, null);
  assert.equal(v.flight.altitudeFt, null);
});

test('carnet — LA VITESSE SOL ET LA ROUTE SOL NE SORTENT PAS NON PLUS', () => {
  // Moins evident que la position, et tout aussi decisif : elles contiennent
  // le vent. Servies a la reduction, elles transporteraient les droites de
  // hauteur exactement comme il faut, le point tomberait juste a tous les
  // coups, et l'estime n'aurait plus aucun role.
  visees.ajouter(brute());
  const sortie = visees.liste().visees[0];
  assert.equal(sortie.flight.groundSpeedKt, undefined, 'la vitesse sol a franchi la porte');
  assert.equal(sortie.flight.trackDeg, undefined, 'la route sol a franchi la porte');
  // L'altitude passe : c'est une lecture d'altimetre, et la refraction en a
  // besoin. Ce qui se lit dans le cockpit est permis, ce qui contient le vent
  // ne l'est pas.
  assert.equal(sortie.flight.altitudeFt, 9000);
  // Elles restent sur le disque : le debriefing en aura besoin.
  assert.equal(visees.listeAvecVerite()[0].flight.groundSpeedKt, 150);
  // Et le controle qui attrape une fuite par une cle qu'on aurait oubliee.
  assert.equal(/150|285/.test(JSON.stringify(visees.liste())), false);
});

test('carnet — il survit a la fermeture de l’application', () => {
  visees.ajouter(brute({ id: 'persistee' }));
  // On relit le fichier comme le ferait un demarrage suivant.
  const surDisque = JSON.parse(fs.readFileSync(visees.chemin(), 'utf-8'));
  assert.equal(surDisque.visees.length, 1);
  assert.equal(surDisque.visees[0].id, 'persistee');
  // Et la verite EST sur le disque : c'est le seul endroit ou elle a le droit
  // d'etre, puisque le debriefing viendra la chercher.
  assert.equal(surDisque.visees[0].truth.lat, 34.5);
});

test('carnet — une visee se supprime, le carnet se vide', () => {
  visees.ajouter(brute({ id: 'a' }));
  visees.ajouter(brute({ id: 'b' }));
  assert.equal(visees.supprimer('a').ok, true);
  assert.equal(visees.supprimer('inconnue').ok, false);
  assert.deepEqual(visees.liste().visees.map((v) => v.id), ['b']);
  visees.vider();
  assert.equal(visees.liste().visees.length, 0);
});

test.after(() => {
  try { fs.rmSync(DOSSIER, { recursive: true, force: true }); } catch (_) {}
});
