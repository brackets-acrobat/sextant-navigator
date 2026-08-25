/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

/**
 * LA FEUILLE DE POSITION, telle que la réduction la rend à l'interface.
 *
 * Deux choses s'y jouent, et la seconde est la plus importante.
 *
 * D'abord que le TRACÉ SOIT LE CALCUL : la feuille doit décrire le point
 * affiché à côté, pas une figure cohérente avec elle-même. Un tracé qui
 * diverge du résultat est pire que pas de tracé — le navigateur croit voir son
 * travail.
 *
 * Ensuite, et surtout, que LA VÉRITÉ N'Y ENTRE PAS. La planchette est une
 * surface de dessin qui reçoit des coordonnées : c'est exactement le genre
 * d'endroit par lequel la position réelle finirait par ressortir un jour, sans
 * que rien ne casse. Tout le jeu tient sur cette ignorance.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const noyauMod = require('../src/main/noyau.js');
const reduction = require('../src/main/reduction.js');

let n = null;
test.before(async () => { n = await noyauMod.charger(); });

const VRAIE = { lat: 34.62, lon: -121.83 };
const ESTIME = { lat: 34.5, lon: -122.0 };      // fausse de ~11 milles
const T0 = Date.UTC(2026, 0, 15, 4, 40, 0);
const ALT = 9000;

/** Un carnet tel que le pont le livre : sans vérité, sans vitesse sol. */
function carnet(bodies) {
  return bodies.map((body, i) => {
    const utc = new Date(T0 + i * 120000);
    return {
      id: 'v' + i,
      body,
      utc: utc.toISOString(),
      hs: n.simulateSight({ utc, body, actual: VRAIE, altitudeFt: ALT }).hs,
      flight: { altitudeFt: ALT },
    };
  });
}

test('planchette — la réduction rend une feuille dressée', async () => {
  const r = await reduction.reduire({
    visees: carnet(['Capella', 'Alphecca', 'Fomalhaut']),
    assumed: ESTIME,
  });
  assert.equal(r.ok, true);
  const f = r.planchette;
  assert.ok(f, 'la réduction doit rendre la feuille');
  assert.equal(f.droites.length, 3);
  assert.ok(f.chapeau && f.chapeau.vertices.length === 3);
  assert.ok(f.stepNm > 0, 'une feuille sans échelle ne dit rien');
  assert.ok(f.halfSpanNm > 0);

  // Chaque droite porte de quoi se tracer : deux bouts, un pied, un nom.
  for (const d of f.droites) {
    assert.ok(typeof d.body === 'string' && d.body.length);
    for (const clef of ['a', 'b', 'foot', 'u', 'v']) {
      assert.ok(Number.isFinite(d[clef].x) && Number.isFinite(d[clef].y), `${d.body}.${clef}`);
    }
  }
});

test('planchette — LE TRACÉ EST LE CALCUL', async () => {
  const r = await reduction.reduire({
    visees: carnet(['Capella', 'Alphecca', 'Fomalhaut']),
    assumed: ESTIME,
  });

  // Le point tracé, en milles depuis l'estime, doit être le point affiché.
  const dessine = Math.hypot(r.planchette.point.x, r.planchette.point.y);
  assert.ok(
    Math.abs(dessine - r.point.ecartEstimeNm) < 0.01,
    `tracé à ${dessine.toFixed(2)} NM, affiché à ${r.point.ecartEstimeNm.toFixed(2)}`,
  );
  assert.ok(Math.abs(r.planchette.correction.nm - r.point.ecartEstimeNm) < 0.01);

  // Et les droites se croisent bien là : visées parfaites, avion immobile, le
  // chapeau se referme. Les 0,08 NM qui restent sont l'erreur de linéarisation
  // de Marcq Saint-Hilaire, expliquée au noyau.
  assert.ok(
    r.planchette.chapeau.maxSideNm < 0.15,
    `chapeau ${r.planchette.chapeau.maxSideNm.toFixed(3)} NM`,
  );
  for (const s of r.planchette.chapeau.vertices) {
    assert.ok(Math.hypot(s.x - r.planchette.point.x, s.y - r.planchette.point.y) < 0.15);
  }
});

test('planchette — LA VÉRITÉ N’Y EST PAS', async () => {
  const visees = carnet(['Capella', 'Alphecca', 'Fomalhaut']);
  const r = await reduction.reduire({ visees, assumed: ESTIME });
  const brut = JSON.stringify(r.planchette);

  // Aucun champ de vérité, sous aucun nom.
  for (const interdit of ['truth', 'verite', 'actual', 'reelle']) {
    assert.ok(!brut.includes(interdit), `la feuille porte un champ « ${interdit} »`);
  }

  // Et aucune coordonnée n'y ressemble : la seule position de la feuille est
  // son origine, qui est l'estime — celle que le navigateur tient.
  assert.equal(r.planchette.origin.lat, ESTIME.lat);
  assert.equal(r.planchette.origin.lon, ESTIME.lon);
  assert.ok(!brut.includes(String(VRAIE.lat)) && !brut.includes(String(VRAIE.lon)));

  // Le point tracé tombe SUR la vérité — c'est le but du travail — mais il en
  // vient par les visées, pas par une copie. La preuve : réduit contre une
  // estime différente, le tracé change entièrement de coordonnées alors que le
  // point reste au même endroit du monde.
  const autre = { lat: 34.4, lon: -121.6 };
  const r2 = await reduction.reduire({ visees, assumed: autre });
  assert.ok(
    Math.abs(r2.planchette.point.x - r.planchette.point.x) > 5,
    'le tracé est relatif à l’estime, il doit bouger avec elle',
  );
  const ecartMonde = Math.hypot(
    (r2.point.lat - r.point.lat) * 60,
    (r2.point.lon - r.point.lon) * 60 * Math.cos((r.point.lat * Math.PI) / 180),
  );
  assert.ok(ecartMonde < 0.2, `le point du monde ne doit pas bouger (${ecartMonde.toFixed(2)} NM)`);
});

test('planchette — une seule visée ne fait pas de feuille', async () => {
  const r = await reduction.reduire({ visees: carnet(['Capella']), assumed: ESTIME });
  assert.equal(r.ok, true);
  assert.equal(r.point, null, 'une droite n’est pas un point');
  assert.equal(r.planchette, null, 'et il n’y a rien à tracer');
});
