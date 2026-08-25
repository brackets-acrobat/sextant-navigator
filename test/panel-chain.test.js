/**
 * La chaîne du panneau, de bout en bout.
 *
 * C'est le test qui compte pour l'instrument : le simulateur produit ce que le
 * tambour affiche, le joueur rend ces lectures avec une estime fausse, et le
 * point doit retomber sur la position réelle. Si ces deux chaînes ne sont pas
 * exactement inverses, le jeu ment au joueur.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { simulateSight, fixFromSights, sight, visibleBodies } from '../src/index.js';

/** Nuit d'hiver au large de la Californie, DC-3 en croisière. */
const UTC = new Date('2026-01-15T04:30:00Z');
const ACTUAL = { lat: 34.5, lon: -122.0 };
const FLIGHT = {
  altitudeFt: 9000,
  groundSpeedKt: 150,
  trackDeg: 285,
  indexError: -5,
};

test('panneau — le tambour rendu par le simulateur se réduit en intercept nul', () => {
  const truth = simulateSight({
    utc: UTC,
    body: 'Vega',
    actual: ACTUAL,
    headingTrue: 285,
    ...FLIGHT,
  });

  // Le joueur qui connaîtrait exactement sa position doit trouver un intercept
  // nul : c'est la définition même des deux chaînes inverses.
  const reduced = sight({
    utc: UTC,
    body: 'Vega',
    assumed: ACTUAL,
    hs: truth.hs,
    ...FLIGHT,
  });

  assert.ok(
    Math.abs(reduced.signedNm) < 0.01,
    `intercept ${reduced.signedNm.toFixed(4)} NM au lieu de 0`,
  );
  assert.ok(Math.abs(reduced.zn - truth.trueAzimuth) < 1e-6);
});

test('panneau — trois visées depuis une estime fausse retrouvent la position', () => {
  const list = visibleBodies({ utc: UTC, position: ACTUAL });
  assert.ok(list.starsUsable, 'la nuit choisie doit permettre les étoiles');

  // On prend trois astres bien répartis en azimut : c'est la règle du
  // navigateur, et c'est ce qui rend le chapeau petit.
  const chosen = [];
  for (const b of list.bodies) {
    if (chosen.every((c) => Math.abs(((b.zn - c.zn + 540) % 360) - 180) > 60)) {
      chosen.push(b);
    }
    if (chosen.length === 3) break;
  }
  assert.equal(chosen.length, 3, 'il faut trois astres à plus de 60° les uns des autres');

  const sights = chosen.map((b) => ({
    utc: UTC,
    body: b.name,
    hs: simulateSight({ utc: UTC, body: b.name, actual: ACTUAL, ...FLIGHT }).hs,
    indexError: FLIGHT.indexError,
    altitudeFt: FLIGHT.altitudeFt,
    groundSpeedKt: FLIGHT.groundSpeedKt,
    trackDeg: FLIGHT.trackDeg,
  }));

  // Estime fausse de ~30 NM au nord-est, l'ordre de grandeur d'une heure
  // d'estime sans vent connu.
  const assumed = { lat: ACTUAL.lat + 0.4, lon: ACTUAL.lon + 0.4 };
  const fix = fixFromSights({ assumed, sights });

  const errNm = Math.hypot(
    (fix.lat - ACTUAL.lat) * 60,
    (fix.lon - ACTUAL.lon) * 60 * Math.cos((ACTUAL.lat * Math.PI) / 180),
  );
  assert.ok(errNm < 0.1, `point retrouvé à ${errNm.toFixed(3)} NM de la vérité`);
  assert.ok(fix.rmsNm < 0.1, `chapeau ${fix.rmsNm.toFixed(3)} NM sur des visées parfaites`);
});

test('panneau — l\'erreur d\'index déplace le point, elle ne s\'annule pas', () => {
  const list = visibleBodies({ utc: UTC, position: ACTUAL });
  const chosen = [];
  for (const b of list.bodies) {
    if (chosen.every((c) => Math.abs(((b.zn - c.zn + 540) % 360) - 180) > 60)) chosen.push(b);
    if (chosen.length === 3) break;
  }

  // Le simulateur applique une erreur d'index de -5', le joueur croit qu'elle
  // est nulle : le point doit être faux, et faux de l'ordre de 5 NM.
  const sights = chosen.map((b) => ({
    utc: UTC,
    body: b.name,
    hs: simulateSight({ utc: UTC, body: b.name, actual: ACTUAL, ...FLIGHT }).hs,
    indexError: 0,
    altitudeFt: FLIGHT.altitudeFt,
    groundSpeedKt: FLIGHT.groundSpeedKt,
    trackDeg: FLIGHT.trackDeg,
  }));

  const fix = fixFromSights({ assumed: ACTUAL, sights });
  const errNm = Math.hypot(
    (fix.lat - ACTUAL.lat) * 60,
    (fix.lon - ACTUAL.lon) * 60 * Math.cos((ACTUAL.lat * Math.PI) / 180),
  );
  assert.ok(errNm > 1, `une erreur d'index de 5′ doit déplacer le point (obtenu ${errNm.toFixed(2)} NM)`);
  assert.ok(errNm < 12, `déplacement invraisemblable : ${errNm.toFixed(2)} NM`);
});
