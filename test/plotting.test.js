/**
 * La planchette de report : la géométrie, avant tout dessin.
 *
 * Ce que ces tests protègent tient en une phrase : **le tracé doit être celui
 * qui a produit le point**. Une planchette qui dessinerait joliment une figure
 * cohérente avec elle-même, mais pas avec le point affiché à côté, serait pire
 * que pas de planchette du tout — le navigateur croirait voir son travail.
 *
 * D'où le test central : le point des moindres carrés doit tomber À
 * L'INTÉRIEUR du chapeau tracé, et sur des visées parfaites les trois droites
 * doivent se couper au même endroit, qui est le point.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  plotSheet,
  cockedHat,
  lopIntersection,
  fixFromSights,
  simulateSight,
  advancePosition,
} from '../src/index.js';

const ESTIME = { lat: 34.5, lon: -122.0 };

/** Une droite de hauteur, au format que rend `fixFromSights`. */
const droite = (zn, signedNm, body = 'X') => ({ zn, signedNm, body });

// ---------------------------------------------------------------------------
// La géométrie nue
// ---------------------------------------------------------------------------

test('planchette — deux droites perpendiculaires se coupent où il faut', () => {
  // Un astre au nord, intercept 3 milles vers lui : la droite est horizontale à
  // 3 milles au nord. Un astre à l'est, intercept 4 : droite verticale à 4
  // milles à l'est. Le croisement est à (4, 3), et il n'y a rien à discuter.
  const p = lopIntersection(droite(0, 3), droite(90, 4));
  assert.ok(Math.abs(p.x - 4) < 1e-9, `x = ${p.x}`);
  assert.ok(Math.abs(p.y - 3) < 1e-9, `y = ${p.y}`);
});

test('planchette — un intercept négatif porte la droite à l’opposé de l’astre', () => {
  const p = lopIntersection(droite(0, -3), droite(90, 0));
  assert.ok(Math.abs(p.y + 3) < 1e-9, `y = ${p.y} : la droite doit être AU SUD`);
});

test('planchette — deux droites parallèles n’ont pas de sommet', () => {
  assert.equal(lopIntersection(droite(45, 2), droite(45, 5)), null);
  // Et deux astres opposés donnent aussi des droites parallèles : c'est le
  // piège, parce que 180° d'écart d'azimut a l'air d'une coupe idéale.
  assert.equal(lopIntersection(droite(30, 2), droite(210, 5)), null);
});

test('planchette — le chapeau de trois droites a trois sommets', () => {
  const h = cockedHat([droite(0, 1, 'A'), droite(120, 1, 'B'), droite(240, 1, 'C')]);
  assert.equal(h.vertices.length, 3);
  assert.ok(h.maxSideNm > 0);
  // Quatre astres ne font plus un triangle mais un polygone à six sommets, et
  // c'est le cas réel dès qu'on vise quatre astres.
  const quatre = [droite(0, 1), droite(60, 1), droite(120, 1), droite(200, 1)];
  assert.equal(cockedHat(quatre).vertices.length, 6);

  // Mais deux astres OPPOSÉS ne fournissent pas de sommet, et c'est le piège :
  // 180° d'écart d'azimut a l'air de la coupe idéale alors que les deux droites
  // sont parallèles. Ici, 0/180 et 90/270 tombent — il reste quatre sommets.
  const opposes = [droite(0, 1), droite(90, 1), droite(180, 1), droite(270, 1)];
  assert.equal(cockedHat(opposes).vertices.length, 4);
});

test('planchette — trois droites concourantes donnent un chapeau nul', () => {
  // Trois droites qui passent toutes par (0, 2) : les intercepts valent
  // 2·cos(Zn − 0) pour un point au nord à 2 milles.
  const p = { x: 0, y: 2 };
  const lops = [0, 120, 240].map((zn) => droite(
    zn,
    p.x * Math.sin((zn * Math.PI) / 180) + p.y * Math.cos((zn * Math.PI) / 180),
  ));
  const h = cockedHat(lops);
  assert.ok(h.maxSideNm < 1e-9, `chapeau ${h.maxSideNm}`);
  for (const s of h.vertices) {
    assert.ok(Math.abs(s.x) < 1e-9 && Math.abs(s.y - 2) < 1e-9);
  }
});

// ---------------------------------------------------------------------------
// La feuille
// ---------------------------------------------------------------------------

test('planchette — les droites traversent la feuille de bord à bord', () => {
  // Une droite de hauteur n'a pas d'extrémités. La tronquer autour de son pied
  // laisserait croire qu'elle en a, et le navigateur chercherait un croisement
  // hors du trait.
  const f = plotSheet({
    assumed: ESTIME,
    fix: { lat: 34.55, lon: -122.0 },
    lops: [droite(0, 3, 'A'), droite(90, 4, 'B')],
  });
  for (const d of f.droites) {
    const longueur = Math.hypot(d.b.x - d.a.x, d.b.y - d.a.y);
    assert.ok(
      longueur >= f.halfSpanNm * 2 * Math.SQRT2 - 1e-9,
      `${d.body} : ${longueur.toFixed(2)} NM pour une feuille de ${(f.halfSpanNm * 2).toFixed(2)}`,
    );
    // Et le pied de l'intercept est bien sur le trait.
    const surLaDroite = Math.abs(
      (d.foot.x - d.a.x) * (d.b.y - d.a.y) - (d.foot.y - d.a.y) * (d.b.x - d.a.x),
    );
    assert.ok(surLaDroite < 1e-6, `le pied de ${d.body} n’est pas sur sa droite`);
  }
});

test('planchette — l’échelle contient tout ce qui est tracé', () => {
  const f = plotSheet({
    assumed: ESTIME,
    fix: { lat: 34.5, lon: -122.0 },
    lops: [droite(10, 12, 'A'), droite(130, -7, 'B'), droite(250, 3, 'C')],
  });
  const dedans = (p) => Math.abs(p.x) <= f.halfSpanNm + 1e-9 && Math.abs(p.y) <= f.halfSpanNm + 1e-9;
  assert.ok(dedans({ x: 0, y: 0 }), 'l’estime doit être sur la feuille');
  for (const d of f.droites) assert.ok(dedans(d.foot), `${d.body} : pied hors feuille`);
  for (const s of f.chapeau.vertices) assert.ok(dedans(s), 'sommet de chapeau hors feuille');
  // Le pas de graduation reste lisible : jamais plus de dix divisions.
  assert.ok(f.halfSpanNm * 2 / f.stepNm <= 10, `${f.halfSpanNm * 2 / f.stepNm} divisions`);
});

test('planchette — une estime juste et des visées parfaites ne dégénèrent pas', () => {
  // Tout tombe à l'origine : il faut quand même une échelle pour dessiner la
  // croix, sinon la feuille a un rayon nul et le renderer divise par zéro.
  const f = plotSheet({
    assumed: ESTIME,
    fix: { lat: ESTIME.lat, lon: ESTIME.lon },
    lops: [droite(0, 0, 'A'), droite(120, 0, 'B')],
  });
  assert.ok(f.halfSpanNm > 0);
  assert.ok(f.stepNm > 0);
});

test('planchette — la correction se lit en relèvement et distance', () => {
  // Le point à 3 milles plein est de l'estime : relèvement 090, distance 3.
  const est = { lat: ESTIME.lat, lon: ESTIME.lon + 3 / 60 / Math.cos((ESTIME.lat * Math.PI) / 180) };
  const f = plotSheet({ assumed: ESTIME, fix: est, lops: [droite(0, 1), droite(90, 1)] });
  assert.ok(Math.abs(f.correction.nm - 3) < 0.01, `${f.correction.nm} NM`);
  assert.ok(Math.abs(f.correction.bearing - 90) < 0.1, `${f.correction.bearing}°`);
});

// ---------------------------------------------------------------------------
// L'accord avec le point : ce que ces tests existent pour protéger
// ---------------------------------------------------------------------------

test('planchette — LE POINT TRACÉ EST LE POINT CALCULÉ', () => {
  // Un vrai carnet, réduit par le noyau, puis mis en feuille. Le point des
  // moindres carrés doit tomber sur le croisement des droites tracées — sinon
  // la planchette dessine une figure qui n'est pas celle qui a produit le point.
  const VRAIE = { lat: 34.62, lon: -121.83 };
  const T0 = Date.UTC(2026, 0, 15, 4, 40, 0);
  const bodies = ['Capella', 'Aldebaran', 'Alphecca'];
  const sights = bodies.map((body, i) => {
    const utc = new Date(T0 + i * 120000);
    return {
      utc: utc.toISOString(),
      body,
      hs: simulateSight({ utc, body, actual: VRAIE, altitudeFt: 9000 }).hs,
      altitudeFt: 9000,
      groundSpeedKt: 0,
      trackDeg: 0,
    };
  });

  const point = fixFromSights({ assumed: ESTIME, sights });
  assert.ok(point.lops, 'fixFromSights doit rendre ses droites');

  const f = plotSheet({ assumed: ESTIME, fix: point, lops: point.lops });

  // Le point tracé est bien le point calculé, en coordonnées feuille.
  //
  // C'est `shiftNorthNm` qu'il faut comparer, PAS `northNm` : ce dernier vient
  // de la dernière passe des moindres carrés et ne vaut plus, après
  // convergence, que quelques centièmes de mille. C'est le piège du retour de
  // `fixFromSights`, et il est signalé là-bas.
  assert.ok(Math.abs(f.point.y - point.shiftNorthNm) < 1e-9);
  assert.ok(Math.abs(f.point.x - point.shiftEastNm) < 1e-9);

  // Visées parfaites, avion immobile : les trois droites sont concourantes.
  //
  // Concourantes à 0,08 NM, pas à zéro, et cet écart n'est pas du bruit : c'est
  // L'ERREUR DE LINÉARISATION de Marcq Saint-Hilaire. La feuille porte les
  // droites de la première passe, mesurées depuis une estime fausse de 11
  // milles ; le point rendu, lui, a convergé en trois passes. Sur le papier
  // cette différence n'existait pas — personne ne replottait — et elle vaut ici
  // moins que l'épaisseur du trait.
  assert.ok(f.chapeau.maxSideNm < 0.15, `chapeau tracé ${f.chapeau.maxSideNm.toFixed(4)} NM`);
  for (const s of f.chapeau.vertices) {
    assert.ok(
      Math.hypot(s.x - f.point.x, s.y - f.point.y) < 0.15,
      'un sommet du chapeau tombe loin du point',
    );
  }

  // Et le point est à sa place : le vrai point, vu depuis l'estime.
  const vraiEnFeuille = {
    x: (VRAIE.lon - ESTIME.lon) * 60 * Math.cos((ESTIME.lat * Math.PI) / 180),
    y: (VRAIE.lat - ESTIME.lat) * 60,
  };
  assert.ok(
    Math.hypot(f.point.x - vraiEnFeuille.x, f.point.y - vraiEnFeuille.y) < 0.1,
    'le point tracé doit tomber sur la position vraie',
  );
});

test('planchette — le fantôme montre ce que le transport a déplacé', () => {
  // Même vol, mais l'avion court à 150 kt : les visées sont prises à cinq
  // minutes d'intervalle, donc à douze milles les unes des autres. Sans
  // transport, les droites sont ailleurs — et c'est exactement ce que le
  // fantôme doit rendre visible.
  const DEPART = { lat: 34.62, lon: -121.83 };
  const T0 = Date.UTC(2026, 0, 15, 4, 40, 0);
  const ROUTE = 270;
  const GS = 150;
  const bodies = ['Capella', 'Aldebaran', 'Alphecca'];

  const sights = bodies.map((body, i) => {
    const dtMin = i * 5;
    const utc = new Date(T0 + dtMin * 60000);
    const ou = advancePosition(DEPART, (GS * dtMin) / 60, ROUTE);
    return {
      utc: utc.toISOString(),
      body,
      hs: simulateSight({
        utc, body, actual: ou, altitudeFt: 9000, groundSpeedKt: GS, trackDeg: ROUTE,
      }).hs,
      altitudeFt: 9000,
      groundSpeedKt: GS,
      trackDeg: ROUTE,
    };
  });

  const estimeCommune = advancePosition(DEPART, (GS * 10) / 60, ROUTE);
  const avec = fixFromSights({ assumed: estimeCommune, sights, transport: true });
  const sans = fixFromSights({ assumed: estimeCommune, sights, transport: false });

  const f = plotSheet({
    assumed: estimeCommune,
    fix: avec,
    lops: avec.lops,
    ghosts: sans.lops,
  });

  assert.equal(f.fantomes.length, 3);

  // CE QUE LE FANTÔME MESURE, exactement : chaque droite s'est déplacée de la
  // PROJECTION DE LA COURSE SUR SON AZIMUT. C'est l'énoncé de manuel du
  // transport, et il se vérifie ici au dixième de mille près — le reste vient
  // de ce que l'azimut lui-même change un peu d'une position de réduction à
  // l'autre.
  f.droites.forEach((d, i) => {
    const ecart = Math.hypot(d.foot.x - f.fantomes[i].foot.x, d.foot.y - f.fantomes[i].foot.y);
    const projection = Math.abs(d.ap.x * d.u.x + d.ap.y * d.u.y);
    assert.ok(
      Math.abs(ecart - projection) < 0.15,
      `${d.body} : déplacée de ${ecart.toFixed(2)} NM pour une projection de ${projection.toFixed(2)}`,
    );
  });

  // La première visée a dix minutes de retard, soit vingt-cinq milles de
  // course : son fantôme est à dix-sept milles. La dernière est à l'instant
  // commun — sa course est nulle, son fantôme est confondu avec elle.
  const ecart0 = Math.hypot(
    f.droites[0].foot.x - f.fantomes[0].foot.x,
    f.droites[0].foot.y - f.fantomes[0].foot.y,
  );
  assert.ok(ecart0 > 5, `la première droite doit avoir bougé (${ecart0.toFixed(1)} NM)`);
  assert.equal(f.droites[2].runNm, 0, 'la dernière visée est à l’instant commun');

  // ET LA LEÇON DE LA FEUILLE : le transport referme le chapeau. Vingt-quatre
  // milles de triangle sans lui, zéro avec — et vingt et un milles entre les
  // deux points.
  const fSans = plotSheet({ assumed: estimeCommune, fix: sans, lops: sans.lops });
  assert.ok(
    fSans.chapeau.maxSideNm > 10 * f.chapeau.maxSideNm + 5,
    `chapeau sans transport ${fSans.chapeau.maxSideNm.toFixed(2)} NM contre ${f.chapeau.maxSideNm.toFixed(2)} avec`,
  );
  assert.ok(
    Math.hypot(sans.shiftNorthNm - avec.shiftNorthNm, sans.shiftEastNm - avec.shiftEastNm) > 3,
    'et les deux points sont loin l’un de l’autre',
  );
});

test('planchette — la course n’est cadrée que si on la demande', () => {
  const DEPART = { lat: 34.62, lon: -121.83 };
  const T0 = Date.UTC(2026, 0, 15, 4, 40, 0);
  const sights = ['Capella', 'Aldebaran', 'Alphecca'].map((body, i) => {
    const dtMin = i * 10;
    const utc = new Date(T0 + dtMin * 60000);
    const ou = advancePosition(DEPART, (150 * dtMin) / 60, 270);
    return {
      utc: utc.toISOString(),
      body,
      hs: simulateSight({ utc, body, actual: ou, altitudeFt: 9000, groundSpeedKt: 150, trackDeg: 270 }).hs,
      altitudeFt: 9000,
      groundSpeedKt: 150,
      trackDeg: 270,
    };
  });
  const estimeCommune = advancePosition(DEPART, (150 * 20) / 60, 270);
  const point = fixFromSights({ assumed: estimeCommune, sights });

  const serre = plotSheet({ assumed: estimeCommune, fix: point, lops: point.lops });
  const large = plotSheet({ assumed: estimeCommune, fix: point, lops: point.lops, includeRun: true });

  // Cinquante milles de course contre quelques milles d'intercept : les deux ne
  // tiennent pas lisiblement sur la même feuille, d'où les deux cadrages.
  assert.ok(large.halfSpanNm > serre.halfSpanNm * 2, `serré ${serre.halfSpanNm}, large ${large.halfSpanNm}`);
  for (const d of large.droites) {
    assert.ok(d.ap, 'chaque droite doit savoir d’où elle a été réduite');
    assert.ok(Math.abs(d.ap.x) <= large.halfSpanNm + 1e-9);
  }
});
