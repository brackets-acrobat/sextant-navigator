/**
 * L'étalonnage.
 *
 * L'AFM 51-40 est catégorique : l'erreur d'index et l'erreur personnelle sont
 * inséparables, et on ne mesure que leur somme. La procédure de la « courbe
 * Hc » consiste à viser depuis une position CONNUE et à comparer la hauteur
 * observée à la hauteur calculée — la différence est l'erreur du sextant, et la
 * correction est son opposé.
 *
 * Ces tests vérifient que la chaîne restitue une erreur d'index qu'on lui a
 * cachée, et que la convention de signe est celle du manuel.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  simulateSight,
  sight,
  altitudeRate,
  calibrationSeries,
  indexErrorFromSeries,
  visibleBodies,
  computedAltitudeAzimuth,
  bodyPosition,
  localHourAngle,
} from '../src/index.js';

const KNOWN = { lat: 34.5, lon: -122.0 };
const FLIGHT = { altitudeFt: 200, groundSpeedKt: 0, trackDeg: 0 };
const BODIES = ['Kochab', 'Capella', 'Sirius', 'Procyon', 'Pollux', 'Dubhe'];

/** Une série de visées parfaites depuis une position connue, à la minute près. */
function series(instrumentError, count = 10) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const when = new Date(Date.UTC(2026, 0, 15, 4, 30 + i * 2, 0));
    const body = BODIES[i % BODIES.length];
    out.push({
      utc: when.toISOString(),
      body,
      hs: simulateSight({
        utc: when,
        body,
        actual: KNOWN,
        indexError: instrumentError,
        ...FLIGHT,
      }).hs,
    });
  }
  return out;
}

/** Erreur de sextant d'une visée, au sens de l'AFM : Ho − Hc, en minutes. */
function errorOf(shot) {
  const r = sight({ ...shot, assumed: KNOWN, indexError: 0, ...FLIGHT });
  return (r.ho - r.hc) * 60;
}

test('étalonnage — la série restitue l’erreur cachée de l’instrument', () => {
  for (const hidden of [-5, -2.4, 0, 1.7, 6]) {
    const errs = series(hidden).map(errorOf);
    const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
    // L'erreur mesurée est l'opposé de la correction que `sight` attend.
    assert.ok(
      Math.abs(-mean - hidden) < 0.02,
      `erreur cachée ${hidden}′ : mesuré ${(-mean).toFixed(3)}′`,
    );
    // Visées parfaites : aucune dispersion.
    const sd = Math.sqrt(errs.reduce((a, b) => a + (b - mean) ** 2, 0) / (errs.length - 1));
    assert.ok(sd < 0.01, `dispersion ${sd.toFixed(4)}′ sur des visées parfaites`);
  }
});

test('étalonnage — la correction adoptée annule le biais sur une visée réelle', () => {
  const hidden = -3.8;
  const errs = series(hidden).map(errorOf);
  const mean = errs.reduce((a, b) => a + b, 0) / errs.length;
  const correction = -mean;

  // Une visée quelconque, réduite avec la correction trouvée, doit tomber juste.
  const when = new Date(Date.UTC(2026, 0, 15, 5, 12, 0));
  const hs = simulateSight({
    utc: when, body: 'Vega', actual: KNOWN, indexError: hidden, ...FLIGHT,
  }).hs;

  const sans = sight({ utc: when, body: 'Vega', assumed: KNOWN, hs, indexError: 0, ...FLIGHT });
  const avec = sight({ utc: when, body: 'Vega', assumed: KNOWN, hs, indexError: correction, ...FLIGHT });

  assert.ok(
    Math.abs(sans.signedNm) > 3,
    `sans correction, le biais doit se voir (obtenu ${sans.signedNm.toFixed(2)} NM)`,
  );
  assert.ok(
    Math.abs(avec.signedNm) < 0.02,
    `avec correction, intercept ${avec.signedNm.toFixed(4)} NM`,
  );
});

// ============================================================
// LA VITESSE VERTICALE, ET CE QU'ELLE FAIT À L'ÉTALONNAGE
//
// Les six visées d'un vol réel ont tranché la question : l'erreur dominante
// n'était pas la collimation mais le RETARD DE MANIVELLE. L'astre le plus lent
// donnait la meilleure visée les deux fois, le plus rapide la pire les deux
// fois, et ce qu'on avait pris pour « +6′ d'erreur d'index » n'était que le
// retard sur un astre qui descendait à 10,9′/min. Le critère d'un bon astre
// d'étalonnage est donc la VITESSE, pas la hauteur.
// ============================================================

test('vitesse verticale — accord avec 15,04 × cos(lat) × sin(Zn)', () => {
  // La différence finie doit retomber sur la formule analytique, qui est exacte
  // pour une étoile. Si elle en diverge, c'est la différence finie qui a tort —
  // et c'est elle qu'on emploie partout, y compris pour trier les visées.
  const when = new Date(Date.UTC(2026, 0, 15, 4, 30, 0));
  const vue = visibleBodies({ utc: when, position: KNOWN });
  let vus = 0;
  for (const b of vue.bodies) {
    if (b.kind !== 'star') continue;      // la Lune et les planètes bougent en plus
    const mesure = altitudeRate({ body: b.name, utc: when, position: KNOWN });
    const analytique = 15.041 * Math.cos((KNOWN.lat * Math.PI) / 180)
      * Math.sin((b.zn * Math.PI) / 180);
    assert.ok(
      Math.abs(mesure - analytique) < 0.05,
      `${b.name} : mesuré ${mesure.toFixed(2)}, attendu ${analytique.toFixed(2)} ′/min`,
    );
    vus += 1;
  }
  assert.ok(vus >= 8, `il faut des étoiles pour éprouver quoi que ce soit (${vus})`);

  // Polaris ne bouge pas : c'est le cas limite, et c'est l'astre d'étalonnage
  // que le manuel recommande précisément pour cette raison.
  assert.ok(
    Math.abs(altitudeRate({ body: 'Polaris', utc: when, position: KNOWN })) < 0.2,
    'Polaris doit être immobile',
  );
});

test('série — la moyenne des lents et la régression disent la même chose', () => {
  // Rangées fabriquées à la main : erreur = E − (τ/60) × vitesse, sans bruit.
  // On doit retrouver les deux nombres, exactement.
  const E = -4.2;
  const TAU = 30;
  const vitesses = [-12, -8, -3, -2, -1, 1, 2, 3, 8, 12];
  const rows = vitesses.map((v) => ({ errorMin: E - (TAU / 60) * v, rateMinPerMin: v }));

  const r = indexErrorFromSeries(rows);

  // La régression sépare proprement l'instrument du geste.
  assert.ok(r.retard, 'la série a du bras de levier, la pente doit exister');
  assert.ok(Math.abs(r.retard.erreurMin - E) < 1e-6, `erreur ${r.retard.erreurMin}`);
  assert.ok(Math.abs(r.retard.retardS - TAU) < 1e-6, `retard ${r.retard.retardS} s`);

  // Six visées à |v| ≤ 3 suffisent, et comme leurs vitesses sont symétriques,
  // le retard s'annule dans la moyenne. C'est le cas idéal — celui qu'on obtient
  // en visant de part et d'autre du méridien.
  assert.equal(r.methode, 'lents');
  assert.ok(Math.abs(r.correctionMin - -E) < 1e-6, `correction ${r.correctionMin}`);

  // Et la moyenne BRUTE tombe juste elle aussi, parce que toute la série est
  // symétrique. C'est le piège : une série équilibrée pardonne, une série
  // penchée d'un côté ne pardonne pas — c'est le cas suivant.
  assert.ok(Math.abs(-r.brut.meanMin - -E) < 1e-6);

  // CE QUI RESTE MALGRÉ TOUT. Le tri par la vitesse ne supprime pas le retard,
  // il le borne : un astre à 3′/min avec trente secondes de retard laisse encore
  // une minute et demie dans la mesure — presque la précision revendiquée de
  // l'instrument. C'est la raison de viser AU MÉRIDIEN et pas à la limite du
  // seuil, et le module doit pouvoir le dire.
  assert.ok(Math.abs(r.biaisResiduelMin - (3 * TAU) / 60) < 1e-6, `biais résiduel ${r.biaisResiduelMin}`);
});

test('série — une série qui penche d’un côté trompe la moyenne brute', () => {
  const E = 0;
  const TAU = 33;
  // Tous les astres descendent : le retard fait lire trop haut, à chaque fois
  // dans le même sens. C'est exactement la première série du vol réel.
  const vitesses = [-11, -10, -9, -8, -7, -6];
  const rows = vitesses.map((v) => ({ errorMin: E - (TAU / 60) * v, rateMinPerMin: v }));

  const r = indexErrorFromSeries(rows);
  assert.equal(r.lents.n, 0, 'aucun astre lent dans cette série');

  // La moyenne brute est fausse de plusieurs minutes d'arc : le navigateur
  // croirait son sextant faux de −5′ alors qu'il est juste.
  assert.ok(-r.brut.meanMin < -4, `correction brute ${(-r.brut.meanMin).toFixed(2)}′`);

  // Mais la série garde cinq minutes d'arc par minute d'étendue, donc la pente
  // est calculable — et le module la préfère à la moyenne, ce qui sauve la
  // mesure. C'est le rattrapage, pas la procédure : il faut quand même le dire
  // au navigateur, parce que sa série n'était pas la bonne.
  assert.equal(r.methode, 'retard');
  assert.ok(r.retard, 'la pente doit être calculable');
  assert.ok(Math.abs(r.retard.erreurMin - E) < 1e-6, 'la pente, elle, retrouve zéro');
  assert.ok(Math.abs(r.correctionMin) < 1e-6, 'donc aucune correction à adopter');
});

test('série — sans bras de levier, aucune pente n’est annoncée', () => {
  // Six astres tous lents : c'est la BONNE série pour l'instrument, et elle ne
  // peut rien dire du retard. Il faut le reconnaître au lieu d'ajuster du bruit.
  const rows = [-1, -0.5, 0, 0.4, 1, 1.5].map((v) => ({ errorMin: -3 + 0.1 * v, rateMinPerMin: v }));
  const r = indexErrorFromSeries(rows);
  assert.equal(r.retard, null);
  assert.equal(r.retardConnu, false);
  assert.equal(r.methode, 'lents');
  assert.ok(r.manque.pourLaPente > 0, 'et l’interface doit pouvoir dire ce qui manque');
});

test('étalonnage — un retard de manivelle simulé se sépare de l’erreur d’index', () => {
  // LE TEST DE BOUT EN BOUT. On fabrique des visées avec DEUX défauts cachés :
  // l'erreur de l'exemplaire, et un tambour qui montre le ciel d'il y a trente
  // secondes. Le second se simule sans rien coder de spécial — il suffit de
  // demander au simulateur la hauteur d'un instant antérieur et de la dater de
  // l'instant courant. C'est physiquement ce que fait un intégrateur qu'on
  // manivelle en retard.
  // CORRECTION est ce que le navigateur doit finir par adopter : la valeur qui,
  // appliquée à ses réductions, annule le défaut de son exemplaire. L'erreur au
  // sens de l'AFM — Ho − Hc — est son opposé, et c'est elle que la série mesure.
  const CORRECTION = -4.5;
  const RETARD = 30;       // secondes de retard du tambour
  const ALT = 200;

  const brutes = [];
  const base = Date.UTC(2026, 0, 15, 4, 30, 0);
  for (let i = 0; i < 18; i += 1) {
    const when = new Date(base + i * 10 * 60000);
    const vue = visibleBodies({ utc: when, position: KNOWN });
    for (const b of vue.bodies) {
      if (b.kind !== 'star') continue;
      const retarde = new Date(when.getTime() - RETARD * 1000);
      brutes.push({
        body: b.name,
        utc: when.toISOString(),
        altitudeFt: ALT,
        hs: simulateSight({
          utc: retarde, body: b.name, actual: KNOWN, indexError: CORRECTION,
          altitudeFt: ALT, groundSpeedKt: 0, trackDeg: 0,
        }).hs,
        rate: altitudeRate({ body: b.name, utc: when, position: KNOWN }),
      });
    }
  }

  // Une série d'astres LENTS : c'est ce que la procédure demande.
  const lentes = brutes.filter((s) => Math.abs(s.rate) <= 1).slice(0, 8);
  assert.ok(lentes.length >= 6, `il faut six astres lents (${lentes.length})`);
  const serieLente = calibrationSeries({ sights: lentes, known: KNOWN });
  assert.equal(serieLente.resume.methode, 'lents');
  assert.ok(
    Math.abs(serieLente.resume.correctionMin - CORRECTION) < 0.35,
    `astres lents : correction ${serieLente.resume.correctionMin.toFixed(2)}′ pour ${CORRECTION}′`,
  );

  // La même série faite SANS regarder la vitesse — six astres pris au hasard,
  // dont des rapides. C'est l'erreur qu'on a commise, et elle se voit ici.
  const melange = [
    ...brutes.filter((s) => s.rate < -8).slice(0, 4),
    ...brutes.filter((s) => Math.abs(s.rate) <= 1).slice(0, 2),
  ];
  const serieMelee = calibrationSeries({ sights: melange, known: KNOWN });
  assert.ok(
    Math.abs(-serieMelee.resume.brut.meanMin - CORRECTION) > 2,
    'la moyenne brute d’une série penchée doit être fausse de plusieurs minutes',
  );

  // Et la régression sur une série VARIÉE retrouve les deux nombres : l'erreur
  // de l'instrument, et le retard de la main.
  const variee = [
    ...brutes.filter((s) => s.rate < -9).slice(0, 4),
    ...brutes.filter((s) => Math.abs(s.rate) <= 1).slice(0, 4),
    ...brutes.filter((s) => s.rate > 9).slice(0, 4),
  ];
  const serieVariee = calibrationSeries({ sights: variee, known: KNOWN });
  const rg = serieVariee.resume.retard;
  assert.ok(rg, 'la série variée doit avoir du bras de levier');
  assert.ok(
    Math.abs(rg.erreurMin - -CORRECTION) < 0.5,
    `régression : erreur ${rg.erreurMin.toFixed(2)}′ pour ${-CORRECTION}′`,
  );
  assert.ok(
    Math.abs(rg.retardS - RETARD) < 4,
    `régression : retard ${rg.retardS.toFixed(1)} s pour ${RETARD} s`,
  );
  assert.equal(serieVariee.resume.retardConnu, true);
});

test('étalonnage — un biais de collimation du joueur entre dans la mesure', () => {
  // Le manuel refuse de séparer erreur d'index et erreur personnelle. Ici
  // l'instrument vaut -4′ et l'observateur pose systématiquement l'astre 1,5′
  // trop haut : l'étalonnage doit retrouver la somme, pas l'une des deux.
  const hidden = -4;
  const personal = 1.5;
  const errs = series(hidden).map((s) => errorOf({ ...s, hs: s.hs + personal / 60 }));
  const mean = errs.reduce((a, b) => a + b, 0) / errs.length;

  assert.ok(
    Math.abs(-mean - (hidden - personal)) < 0.02,
    `somme attendue ${(hidden - personal).toFixed(2)}′, mesuré ${(-mean).toFixed(2)}′`,
  );
});
