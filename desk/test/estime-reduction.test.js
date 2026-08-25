/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

/**
 * LA BOUCLE DU JEU, DE BOUT EN BOUT, SANS ELECTRON NI SIMULATEUR.
 *
 * On simule un vol : l'avion suit un cap, le simulateur lui applique un vent,
 * et le navigateur en suppose un autre. L'estime dérive donc — et c'est tout
 * l'objet. On prend ensuite trois visées, produites par le calcul du SIMULATEUR
 * depuis la position VRAIE (c'est ce que fait le panneau), et on les réduit
 * contre l'estime. Le point doit rattraper la dérive.
 *
 * Si ce fichier passe, la chaîne entière tient : triangle des vitesses, estime,
 * transport des droites, réduction, moindres carrés, débriefing.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const noyau = require('../src/main/noyau.js');
const { Estime } = require('../src/main/estime.js');
const reduction = require('../src/main/reduction.js');

let n = null;
test.before(async () => { n = await noyau.charger(); });

// Départ : au large de la Californie, une nuit d'hiver — le même ciel que le
// vol fictif du panneau, donc des astres hauts et bien répartis.
const DEPART = { lat: 34.5, lon: -122.0 };
const T0 = Date.parse('2026-01-15T04:30:00Z');
const CAP = 285;
const TAS = 150;
const ALT = 9000;

// Le simulateur applique ce vent-là. Le navigateur, lui, en a prévu un autre.
const VENT_REEL = { dir: 20, kt: 30 };
const VENT_CRU = { dir: 200, kt: 30 };

const distanceNm = (a, b) => Math.hypot(
  (a.lat - b.lat) * 60,
  (a.lon - b.lon) * 60 * Math.cos((b.lat * Math.PI) / 180),
);

/**
 * Fait voler l'avion et tenir l'estime, une seconde à la fois.
 * Rend la vérité et l'estime à la fin, plus l'objet Estime pour la suite.
 */
function voler(minutes, { ventCru = VENT_CRU, ventReel = VENT_REEL } = {}) {
  const estime = new Estime();
  estime.setVent(ventCru);

  // Au sol d'abord : l'estime se cale sur le terrain, canal légitime.
  estime.avancer({ t: T0, headingTrue: CAP, tasKt: 0, onGround: true, latSol: DEPART.lat, lonSol: DEPART.lon });

  let verite = { lat: DEPART.lat, lon: DEPART.lon };
  const vraiVecteur = n.groundVector({ headingTrue: CAP, tasKt: TAS, windFromDeg: ventReel.dir, windKt: ventReel.kt });

  // L'AVION BOUGE PENDANT QU'ON VISE, et c'est justement ce que le transport
  // existe pour rattraper. On garde donc la vérité SECONDE PAR SECONDE : une
  // visée doit être produite depuis la position qu'occupait l'appareil à SON
  // instant, pas depuis celle de la fin du vol.
  const piste = [{ t: T0, lat: verite.lat, lon: verite.lon }];

  const pas = 1000;
  for (let ms = pas; ms <= minutes * 60000; ms += pas) {
    // Le simulateur avance l'avion avec le VRAI vent.
    verite = n.advancePosition(verite, (vraiVecteur.groundSpeedKt * pas) / 3600000, vraiVecteur.trackDeg);
    piste.push({ t: T0 + ms, lat: verite.lat, lon: verite.lon });
    // Le navigateur ne voit que son cap et son badin.
    estime.avancer({ t: T0 + ms, headingTrue: CAP, tasKt: TAS, onGround: false });
  }

  // La vérité à un instant donné, par l'échantillon le plus proche.
  const veriteA = (t) => {
    let best = piste[0];
    let ecart = Math.abs(best.t - t);
    for (const p of piste) { const d = Math.abs(p.t - t); if (d < ecart) { ecart = d; best = p; } }
    return { lat: best.lat, lon: best.lon };
  };

  return { estime, verite, veriteA, vrai: vraiVecteur, e: estime.etat() };
}

/**
 * Une visée telle que le panneau la produirait : le calcul du simulateur, avec
 * la VRAIE vitesse sol et la VRAIE route — c'est ce que fait `app.js` là-bas,
 * et c'est ce qui met la bonne correction de Coriolis dans le Hs.
 *
 * La réduction, elle, appliquera la correction avec les valeurs CRUES. L'écart
 * entre les deux est une des façons dont l'erreur de vent se paie, et il fait
 * partie du jeu — pas du banc.
 */
function viser(body, tMs, verite, vrai) {
  const utc = new Date(tMs).toISOString();
  const s = n.simulateSight({
    utc, body, actual: verite, headingTrue: CAP, indexError: 0, altitudeFt: ALT,
    groundSpeedKt: vrai.groundSpeedKt, trackDeg: vrai.trackDeg,
  });
  return { id: `${body}-${tMs}`, body, utc, hs: s.hs, seconds: 60, flight: { altitudeFt: ALT } };
}

// ---------------------------------------------------------------------------

test('estime — au sol, elle colle au terrain et ne vieillit pas', () => {
  const estime = new Estime();
  estime.setVent(VENT_CRU);
  estime.avancer({ t: T0, headingTrue: CAP, tasKt: 0, onGround: true, latSol: DEPART.lat, lonSol: DEPART.lon });
  const e = estime.etat();
  assert.equal(e.calee, true);
  assert.equal(e.origine, 'sol');
  assert.equal(e.ageS, 0, 'au sol, l’estime ne vieillit pas');
  assert.equal(e.lat, DEPART.lat);
});

test('estime — UN VENT MAL PRÉVU LA FAIT DÉRIVER', () => {
  const { verite, e } = voler(30);
  const derive = distanceNm({ lat: e.lat, lon: e.lon }, verite);
  // 30 kt de travers dans un sens contre 30 dans l'autre : l'écart relatif
  // atteint 60 kt, dont la composante en travers de la route pendant une
  // demi-heure fait une trentaine de milles.
  assert.ok(derive > 15 && derive < 45, `dérive de ${derive.toFixed(1)} NM après 30 min`);
  assert.ok(e.ageS > 1700, `l’estime doit annoncer son âge (${e.ageS} s)`);
  assert.equal(e.origine, 'estime');
});

test('estime — le MÊME vent des deux côtés ne dérive pas', () => {
  // Le contrôle qui prouve que la dérive vient bien du vent et non d'un défaut
  // d'intégration : si le navigateur devine juste, son estime est exacte.
  const { verite, e } = voler(30, { ventCru: VENT_REEL });
  const derive = distanceNm({ lat: e.lat, lon: e.lon }, verite);
  assert.ok(derive < 0.2, `${derive.toFixed(3)} NM — l’intégration elle-même doit être exacte`);
});

test('estime — une coupure du flux ne téléporte pas l’avion', () => {
  // Pause du simulateur, fenêtre masquée, chargement : une trame arrive dix
  // minutes après la précédente. L'estime ne doit pas franchir vingt-cinq
  // milles d'un coup — mieux vaut en retard que lancée à travers la carte.
  const estime = new Estime();
  estime.setVent(VENT_CRU);
  estime.avancer({ t: T0, headingTrue: CAP, tasKt: 0, onGround: true, latSol: DEPART.lat, lonSol: DEPART.lon });
  estime.avancer({ t: T0 + 1000, headingTrue: CAP, tasKt: TAS, onGround: false });
  const avant = estime.etat();
  estime.avancer({ t: T0 + 601000, headingTrue: CAP, tasKt: TAS, onGround: false });
  const apres = estime.etat();
  const saut = distanceNm({ lat: apres.lat, lon: apres.lon }, { lat: avant.lat, lon: avant.lon });
  assert.ok(saut < 0.1, `saut de ${saut.toFixed(2)} NM sur un trou de dix minutes`);
});

// ---------------------------------------------------------------------------

test('LE POINT RATTRAPE LA DÉRIVE DE L’ESTIME', async () => {
  const { estime, verite, veriteA, vrai } = voler(40);
  const e = estime.etat();
  const deriveAvant = distanceNm({ lat: e.lat, lon: e.lon }, verite);
  assert.ok(deriveAvant > 15, `l’estime doit avoir dérivé (${deriveAvant.toFixed(1)} NM)`);

  // Trois visées bien réparties, prises dans les dernières minutes du vol.
  const tFin = T0 + 40 * 60000;
  const carnet = [
    viser('Vega', tFin - 240000, veriteA(tFin - 240000), vrai),
    viser('Capella', tFin - 120000, veriteA(tFin - 120000), vrai),
    viser('Aldebaran', tFin, veriteA(tFin), vrai),
  ];
  const crues = carnet.map((v) => estime.cruesA(new Date(v.utc).getTime()));

  const r = await reduction.reduire({
    visees: carnet,
    assumed: { lat: e.lat, lon: e.lon },
    indexError: 0,
    crues,
  });
  assert.equal(r.ok, true, `réduction : ${r.error} ${r.detail || ''}`);
  assert.equal(r.lignes.length, 3);
  assert.ok(r.point, 'trois visées doivent donner un point');

  const erreur = distanceNm({ lat: r.point.lat, lon: r.point.lon }, verite);
  // Le point doit rapprocher FRANCHEMENT — d'un ordre de grandeur.
  assert.ok(erreur < deriveAvant / 5, `${erreur.toFixed(2)} NM contre ${deriveAvant.toFixed(1)} d’estime`);
  // Il ne tombe pas EXACTEMENT sur la vérité, et ce n'est pas un défaut : le
  // transport recule les droites le long de la route que le navigateur CROIT
  // avoir suivie, donc il hérite de l'erreur de vent. Le test « tournée étalée »
  // mesure ce que cela coûte.
  assert.ok(erreur < 6, `le point tombe à ${erreur.toFixed(2)} NM de la vérité`);
  // Le déplacement ANNONCÉ va de l'estime au POINT ; la dérive RÉELLE va de
  // l'estime à la VÉRITÉ. Les deux ne peuvent pas coïncider exactement : leur
  // différence est précisément l'erreur du point, celle que le navigateur ne
  // connaîtra qu'au débriefing. Elles doivent en revanche s'accorder au mille
  // près sur une dérive de quarante.
  assert.ok(Math.abs(r.point.ecartEstimeNm - deriveAvant) <= erreur + 0.5,
    `écart annoncé ${r.point.ecartEstimeNm.toFixed(1)} NM, dérive réelle ${deriveAvant.toFixed(1)}, `
    + `erreur du point ${erreur.toFixed(2)}`);
});

test('quand le vent est bien prévu, le point tombe pile', async () => {
  // Le contrôle qui isole la chaîne de calcul : si l'estime ne dérive pas, le
  // transport est exact et le point retombe sur la vérité au dixième de mille.
  // Tout ce qui dépasse, dans les autres cas, vient du vent.
  const { estime, verite, veriteA, vrai } = voler(40, { ventCru: VENT_REEL });
  const e = estime.etat();
  const tFin = T0 + 40 * 60000;
  const carnet = [
    viser('Vega', tFin - 240000, veriteA(tFin - 240000), vrai),
    viser('Capella', tFin - 120000, veriteA(tFin - 120000), vrai),
    viser('Aldebaran', tFin, veriteA(tFin), vrai),
  ];
  const r = await reduction.reduire({
    visees: carnet,
    assumed: { lat: e.lat, lon: e.lon },
    crues: carnet.map((v) => estime.cruesA(new Date(v.utc).getTime())),
  });
  const erreur = distanceNm({ lat: r.point.lat, lon: r.point.lon }, verite);
  assert.ok(erreur < 0.3, `${erreur.toFixed(3)} NM — la chaîne elle-même doit être exacte`);
});

test('UNE TOURNEE DE VISEES ETALEE COUTE CHER', async () => {
  // Le transport se fait à la route CRUE : plus la tournée dure, plus l'erreur
  // de vent a le temps de la fausser. C'est la raison pour laquelle un
  // navigateur enchaîne ses trois visées au lieu de les étaler sur la soirée.
  const { estime, verite, veriteA, vrai } = voler(60);
  const e = estime.etat();
  const tFin = T0 + 60 * 60000;
  const tournee = async (etalementMin) => {
    const dt = etalementMin * 30000;   // deux intervalles pour trois visées
    const carnet = [
      viser('Vega', tFin - 2 * dt, veriteA(tFin - 2 * dt), vrai),
      viser('Capella', tFin - dt, veriteA(tFin - dt), vrai),
      viser('Aldebaran', tFin, veriteA(tFin), vrai),
    ];
    const r = await reduction.reduire({
      visees: carnet,
      assumed: { lat: e.lat, lon: e.lon },
      crues: carnet.map((v) => estime.cruesA(new Date(v.utc).getTime())),
    });
    return distanceNm({ lat: r.point.lat, lon: r.point.lon }, verite);
  };
  const serree = await tournee(2);
  const etalee = await tournee(20);
  assert.ok(serree < etalee,
    `tournée serrée ${serree.toFixed(2)} NM, tournée étalée ${etalee.toFixed(2)} NM`);
  assert.ok(etalee > serree * 1.5, `l'écart doit être net : ${serree.toFixed(2)} contre ${etalee.toFixed(2)}`);
});

test('le transport compte : sans lui, le point est faux', async () => {
  // Quatre minutes séparent la première visée de la dernière ; à 150 kt cela
  // fait dix milles de course. Le noyau les rattrape en reculant l'estime le
  // long de la route CRUE. On vérifie que la course a bien été prise en compte.
  const { estime, verite, veriteA, vrai } = voler(40);
  const e = estime.etat();
  const tFin = T0 + 40 * 60000;
  const carnet = [
    viser('Vega', tFin - 240000, veriteA(tFin - 240000), vrai),
    viser('Capella', tFin - 120000, veriteA(tFin - 120000), vrai),
    viser('Aldebaran', tFin, veriteA(tFin), vrai),
  ];

  const avecCrues = await reduction.reduire({
    visees: carnet,
    assumed: { lat: e.lat, lon: e.lon },
    crues: carnet.map((v) => estime.cruesA(new Date(v.utc).getTime())),
  });
  const sansCrues = await reduction.reduire({
    visees: carnet,
    assumed: { lat: e.lat, lon: e.lon },
    crues: [],   // aucune course : comme si l'avion était immobile
  });

  assert.ok(avecCrues.point.runSpanNm > 5,
    `la course couverte doit se voir (${avecCrues.point.runSpanNm.toFixed(1)} NM)`);
  assert.equal(sansCrues.point.runSpanNm, 0);

  const eAvec = distanceNm({ lat: avecCrues.point.lat, lon: avecCrues.point.lon }, verite);
  const eSans = distanceNm({ lat: sansCrues.point.lat, lon: sansCrues.point.lon }, verite);
  assert.ok(eAvec < eSans, `avec transport ${eAvec.toFixed(2)} NM, sans ${eSans.toFixed(2)} NM`);
});

test('une seule visée donne une droite, pas un point', async () => {
  const { estime, verite, veriteA, vrai } = voler(10);
  const e = estime.etat();
  const r = await reduction.reduire({
    visees: [viser('Vega', T0 + 600000, veriteA(T0 + 600000), vrai)],
    assumed: { lat: e.lat, lon: e.lon },
  });
  assert.equal(r.ok, true);
  assert.equal(r.lignes.length, 1);
  assert.equal(r.point, null, 'une droite n’est pas une position');
  assert.equal(r.qualite.cutMin, null);
});

test('réduction — sans estime, on refuse plutôt que d’inventer', async () => {
  const r = await reduction.reduire({ visees: [{ id: 'x', body: 'Vega', utc: '2026-01-15T04:30:00Z', hs: 40 }] });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'estime');
});

test('réduction — un carnet vide n’est pas un point à zéro', async () => {
  const r = await reduction.reduire({ visees: [], assumed: DEPART });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'carnet-vide');
});

// ---------------------------------------------------------------------------

test('débriefing — il dit ce que le point valait, et ce qu’il a gagné', async () => {
  const { estime, verite, veriteA, vrai } = voler(40);
  const e = estime.etat();
  const tFin = T0 + 40 * 60000;
  const carnet = [
    viser('Vega', tFin - 240000, veriteA(tFin - 240000), vrai),
    viser('Capella', tFin - 120000, veriteA(tFin - 120000), vrai),
    viser('Aldebaran', tFin, veriteA(tFin), vrai),
  ];
  const r = await reduction.reduire({
    visees: carnet,
    assumed: { lat: e.lat, lon: e.lon },
    crues: carnet.map((v) => estime.cruesA(new Date(v.utc).getTime())),
  });

  const d = reduction.debriefer({
    point: { lat: r.point.lat, lon: r.point.lon },
    estime: { lat: e.lat, lon: e.lon },
    verite,
  });
  assert.equal(d.ok, true);
  assert.ok(d.erreurPointNm < 6, `erreur du point ${d.erreurPointNm.toFixed(2)} NM`);
  assert.ok(d.erreurEstimeNm > 15, `erreur de l’estime ${d.erreurEstimeNm.toFixed(1)} NM`);
  assert.ok(d.gainNm > 15, `le point doit avoir gagné ${d.gainNm.toFixed(1)} NM`);
  assert.ok(d.relevementVerite >= 0 && d.relevementVerite < 360);
});

test('débriefing — il refuse tant qu’il manque une pièce', () => {
  assert.equal(reduction.debriefer({}).ok, false);
  assert.equal(reduction.debriefer({ point: DEPART }).ok, false);
});
