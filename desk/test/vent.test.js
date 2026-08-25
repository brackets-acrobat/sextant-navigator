/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

/**
 * LE VENT CALCULÉ — l'autre métier du navigateur.
 *
 * Le simulateur applique un vent que le joueur ne connaît pas. Le joueur en
 * suppose un autre, et son estime dérive d'autant. Au point suivant, il compare
 * sa POSITION AIR — où il serait s'il n'y avait pas de vent, construite au cap
 * et au badin seuls — au point observé : l'écart, divisé par le temps écoulé,
 * est le vent qu'il a subi.
 *
 * Ces tests vérifient que le vent RETROUVÉ est bien celui que le simulateur
 * appliquait, sans que la valeur ait jamais transité par l'estime.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const noyauMod = require('../src/main/noyau.js');
const { Estime } = require('../src/main/estime.js');

let n = null;
test.before(async () => { n = await noyauMod.charger(); });

const DEPART = { lat: 34.5, lon: -122.0 };
// L'horloge du SIMULATEUR : une nuit de janvier 2026, sans rapport avec celle
// du PC qui fait tourner le test. C'est tout l'objet du changement d'horloge.
const TSIM0 = Date.parse('2026-01-15T04:30:00Z');
const CAP = 285;
const TAS = 150;

const VENT_REEL = { dir: 20, kt: 30 };     // ce que le simulateur applique
const VENT_CRU = { dir: 200, kt: 25 };     // ce que le navigateur croit

/**
 * Fait voler l'avion et tenir l'estime, deux secondes à la fois. Rend la vérité
 * et l'objet Estime.
 */
function voler(minutes, { ventCru = VENT_CRU, ventReel = VENT_REEL, cap = CAP } = {}) {
  const estime = new Estime();
  estime.setVent(ventCru);

  // Au sol d'abord : l'estime se cale sur le terrain, et le plot air s'y ancre.
  estime.avancer({ t: 0, tSim: TSIM0, headingTrue: cap, tasKt: 0, onGround: true, latSol: DEPART.lat, lonSol: DEPART.lon });

  let verite = { lat: DEPART.lat, lon: DEPART.lon };
  const vraiVecteur = n.groundVector({
    headingTrue: cap, tasKt: TAS, windFromDeg: ventReel.dir, windKt: ventReel.kt,
  });

  // Deux secondes : au-delà de cinq, `avancer()` prend le pas pour une coupure
  // de flux et ne déplace rien — c'est le garde-fou contre les pauses.
  const PAS_S = 2;
  for (let s = PAS_S; s <= minutes * 60; s += PAS_S) {
    const tSim = TSIM0 + s * 1000;
    verite = n.advancePosition(verite, (vraiVecteur.groundSpeedKt * PAS_S) / 3600, vraiVecteur.trackDeg);
    estime.avancer({ t: s * 1000, tSim, headingTrue: cap, tasKt: TAS, onGround: false });
  }
  return { estime, verite, tSim: TSIM0 + minutes * 60 * 1000 };
}

const distanceNm = (a, b) => Math.hypot(
  (a.lat - b.lat) * 60,
  (a.lon - b.lon) * 60 * Math.cos((b.lat * Math.PI) / 180),
);

// ---------------------------------------------------------------------------

test('vent — le point rend le vent que le simulateur appliquait', () => {
  const { estime, verite, tSim } = voler(40);

  // L'estime a dérivé : c'est la preuve qu'elle n'a jamais vu le vent réel.
  const derive = distanceNm(estime.etat(), verite);
  assert.ok(derive > 20, `l'estime doit avoir dérivé (${derive.toFixed(1)} NM)`);

  // Le point observé tombe sur la vérité (visées parfaites) : on le donne tel quel.
  const v = estime.ventCalcule({ lat: verite.lat, lon: verite.lon, t: tSim });
  assert.equal(v.ok, true, v.error);

  const ecartDir = Math.abs(((v.windFromDeg - VENT_REEL.dir + 540) % 360) - 180);
  assert.ok(ecartDir < 2, `direction ${v.windFromDeg.toFixed(0)}° pour ${VENT_REEL.dir}°`);
  assert.ok(
    Math.abs(v.windKt - VENT_REEL.kt) < 1,
    `force ${v.windKt.toFixed(1)} kt pour ${VENT_REEL.kt}`,
  );

  // Et il rend aussi ce que le navigateur croyait : c'est l'écart entre les deux
  // qui a produit toute la dérive.
  assert.equal(v.ventCru.dir, VENT_CRU.dir);
  assert.equal(v.ventCru.kt, VENT_CRU.kt);
});

test('vent — un vent nul se trouve aussi, et sans direction inventée', () => {
  const { estime, verite, tSim } = voler(40, { ventReel: { dir: 0, kt: 0 } });
  const v = estime.ventCalcule({ lat: verite.lat, lon: verite.lon, t: tSim });
  assert.equal(v.ok, true);
  assert.ok(v.windKt < 1, `force ${v.windKt.toFixed(2)} kt`);
  // Sous le seuil, donner un azimut au dixième serait une invention.
  assert.equal(v.windFromDeg, null);
});

test('vent — LE PLOT AIR IGNORE LE VENT SUPPOSÉ', () => {
  // Deux vols identiques, deux suppositions opposées : le vent trouvé doit être
  // le même. C'est ce qui distingue le plot air d'un « estime moins point », qui
  // dépendrait, lui, de la constance du vent supposé.
  const a = voler(40, { ventCru: { dir: 200, kt: 25 } });
  const b = voler(40, { ventCru: { dir: 340, kt: 60 } });

  const va = a.estime.ventCalcule({ lat: a.verite.lat, lon: a.verite.lon, t: a.tSim });
  const vb = b.estime.ventCalcule({ lat: b.verite.lat, lon: b.verite.lon, t: b.tSim });

  assert.ok(Math.abs(va.windKt - vb.windKt) < 0.01, 'la force ne doit pas dépendre de ce qu\'on croyait');
  assert.ok(Math.abs(va.windFromDeg - vb.windFromDeg) < 0.01, 'la direction non plus');

  // Alors que les deux estimes, elles, sont à des lieues l'une de l'autre.
  assert.ok(distanceNm(a.estime.etat(), b.estime.etat()) > 20);
});

test('vent — un point trop récent ne donne rien', () => {
  const { estime, verite, tSim } = voler(3);
  const v = estime.ventCalcule({ lat: verite.lat, lon: verite.lon, t: tSim });
  assert.equal(v.ok, false);
  assert.equal(v.error, 'trop-court');
});

test('vent — un calage réancre le plot air', () => {
  // Le vent tourne en cours de route. Après un point, la mesure suivante doit
  // porter sur le NOUVEAU tronçon, pas sur la moyenne des deux.
  const premier = voler(40, { ventReel: { dir: 20, kt: 30 } });
  const { estime } = premier;

  // On recale sur le point observé — c'est la boucle du navigateur.
  estime.caler({ lat: premier.verite.lat, lon: premier.verite.lon, t: premier.tSim, origine: 'point' });

  // Puis quarante minutes de plus, avec un autre vent réel.
  const VENT_2 = { dir: 250, kt: 40 };
  const g2 = n.groundVector({ headingTrue: CAP, tasKt: TAS, windFromDeg: VENT_2.dir, windKt: VENT_2.kt });
  let verite = { lat: premier.verite.lat, lon: premier.verite.lon };
  for (let s = 2; s <= 40 * 60; s += 2) {
    verite = n.advancePosition(verite, (g2.groundSpeedKt * 2) / 3600, g2.trackDeg);
    estime.avancer({ t: 0, tSim: premier.tSim + s * 1000, headingTrue: CAP, tasKt: TAS, onGround: false });
  }

  const v = estime.ventCalcule({ lat: verite.lat, lon: verite.lon, t: premier.tSim + 40 * 60 * 1000 });
  assert.equal(v.ok, true);
  const ecartDir = Math.abs(((v.windFromDeg - VENT_2.dir + 540) % 360) - 180);
  assert.ok(ecartDir < 2, `direction ${v.windFromDeg.toFixed(0)}° pour ${VENT_2.dir}° — le plot air a-t-il été réancré ?`);
  assert.ok(Math.abs(v.windKt - VENT_2.kt) < 1, `force ${v.windKt.toFixed(1)} pour ${VENT_2.kt}`);
});

test('estime — un calage sans heure garde l’horloge du simulateur', () => {
  // L'interface recale sur un point observé. Si elle y injectait l'heure du PC
  // — ce qu'elle faisait — l'horloge de l'estime sauterait de plusieurs
  // décennies en vol historique, et le plot air compterait ensuite un temps
  // écoulé absurde. Sans heure, l'estime doit garder la sienne.
  const { estime, verite, tSim } = voler(40);
  const avant = estime.t;

  estime.caler({ lat: verite.lat, lon: verite.lon, origine: 'point' });
  assert.equal(estime.t, avant, 'l’horloge ne doit pas bouger');
  assert.equal(estime.airT, avant, 'le plot air se réancre à CETTE heure-là');

  // Et le temps écoulé repart de zéro : la mesure suivante porte sur le
  // tronçon qui vient, pas sur celui qui vient de se clore.
  const v = estime.ventCalcule({ lat: verite.lat, lon: verite.lon, t: tSim });
  assert.equal(v.ok, false);
  assert.equal(v.error, 'trop-court');
});

test('estime — l’historique se lit à l’heure du SIMULATEUR', () => {
  // Le carnet porte l'heure zulu simulée. Interroger l'historique avec elle
  // devait rendre l'échantillon du bon moment — et non, comme avant, le premier
  // de la liste parce que les deux horloges étaient à des décennies d'écart.
  const { estime } = voler(40);
  const tot = estime.historique.length;
  assert.ok(tot > 100, `historique trop court (${tot})`);

  const debut = estime.cruesA(TSIM0 + 60 * 1000);
  const fin = estime.cruesA(TSIM0 + 39 * 60 * 1000);
  assert.ok(Number.isFinite(debut.gsKt) && debut.gsKt > 0);
  assert.ok(Number.isFinite(fin.gsKt) && fin.gsKt > 0);

  // Cap constant : les deux échantillons se ressemblent. Ce qui doit différer,
  // c'est l'INSTANT retenu — vérifié en cherchant l'échantillon lui-même.
  const a = estime._echantillonA(TSIM0 + 60 * 1000);
  const b = estime._echantillonA(TSIM0 + 39 * 60 * 1000);
  assert.ok(Math.abs(a.t - (TSIM0 + 60 * 1000)) < 6000, 'échantillon du début mal retrouvé');
  assert.ok(Math.abs(b.t - (TSIM0 + 39 * 60 * 1000)) < 6000, 'échantillon de la fin mal retrouvé');
  assert.notEqual(a.t, b.t);
});
