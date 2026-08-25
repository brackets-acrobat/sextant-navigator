/**
 * Validation de la chaîne de réduction : géométrie, corrections, et surtout la
 * boucle complète — viser trois astres depuis une position inconnue et
 * retrouver cette position.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  computedAltitudeAzimuth,
  standardAtmosphere,
  refraction,
  coriolisCorrection,
  observedAltitude,
  sextantReading,
  simulateSight,
  intercept,
  fixFromLops,
  fixFromSights,
  formatAngle,
  formatLatitude,
  shaFromRa,
  localHourAngle,
  bodyPosition,
  almanacPage,
  timeContext,
  sight,
  visibleBodies,
  STARS,
} from '../src/index.js';

// ---------------------------------------------------------------------------

test('géométrie — un astre au zénith donne Hc = 90°', () => {
  const { hc } = computedAltitudeAzimuth(45, 45, 0);
  assert.ok(Math.abs(hc - 90) < 1e-9, `Hc = ${hc}`);
});

test('géométrie — azimut au passage au méridien', () => {
  // Observateur à 45°N, astre à 10°N au méridien supérieur (LHA = 0) :
  // il est plein sud.
  assert.ok(Math.abs(computedAltitudeAzimuth(45, 10, 0).zn - 180) < 1e-9);
  // Astre à 60°N au méridien : il est plein nord, au-dessus du pôle.
  assert.ok(Math.abs(computedAltitudeAzimuth(45, 60, 0).zn - 0) < 1e-9);
  // Au méridien inférieur (LHA = 180), plein nord.
  assert.ok(Math.abs(computedAltitudeAzimuth(45, 60, 180).zn - 0) < 1e-9);
});

test('géométrie — l’azimut est à l’est le matin, à l’ouest le soir', () => {
  // LHA négatif (astre pas encore au méridien) → azimut est.
  assert.ok(computedAltitudeAzimuth(45, 10, 350).zn < 180);
  // LHA positif (astre passé au méridien) → azimut ouest.
  assert.ok(computedAltitudeAzimuth(45, 10, 10).zn > 180);
});

test('géométrie — Hc reste dans [-90, 90] sur un balayage complet', () => {
  for (let lat = -80; lat <= 80; lat += 20) {
    for (let dec = -60; dec <= 60; dec += 30) {
      for (let lha = 0; lha < 360; lha += 15) {
        const { hc, zn } = computedAltitudeAzimuth(lat, dec, lha);
        assert.ok(hc >= -90.0001 && hc <= 90.0001, `Hc hors bornes : ${hc}`);
        assert.ok(zn >= 0 && zn < 360, `Zn hors bornes : ${zn}`);
      }
    }
  }
});

// ---------------------------------------------------------------------------

test('atmosphère standard', () => {
  const sl = standardAtmosphere(0);
  assert.ok(Math.abs(sl.pressureHpa - 1013.25) < 0.01);
  assert.ok(Math.abs(sl.tempC - 15) < 0.02);

  const fl100 = standardAtmosphere(10000);
  assert.ok(fl100.pressureHpa > 690 && fl100.pressureHpa < 700, `${fl100.pressureHpa} hPa`);

  const tropo = standardAtmosphere(36089);
  assert.ok(Math.abs(tropo.pressureHpa - 226.32) < 1, `${tropo.pressureHpa} hPa`);
  assert.ok(Math.abs(tropo.tempC + 56.5) < 0.5, `${tropo.tempC} °C`);
});

test('réfraction — valeurs de référence et effondrement avec l’altitude', () => {
  // Au niveau de la mer, conditions normales.
  assert.ok(Math.abs(refraction(90) - 0) < 0.02, 'nulle au zénith');
  assert.ok(Math.abs(refraction(45, 1010, 10) - 0.97) < 0.05, `45° : ${refraction(45)}′`);
  assert.ok(Math.abs(refraction(30, 1010, 10) - 1.72) < 0.06, `30° : ${refraction(30)}′`);
  assert.ok(Math.abs(refraction(10, 1010, 10) - 5.3) < 0.2, `10° : ${refraction(10)}′`);

  // À 30 000 ft il ne reste qu'un tiers de la réfraction du niveau de la mer.
  const high = standardAtmosphere(30000);
  const r0 = refraction(20, 1010, 10);
  const rHigh = refraction(20, high.pressureHpa, high.tempC);
  assert.ok(rHigh < r0 * 0.5, `${rHigh}′ contre ${r0}′ au sol`);
  assert.ok(rHigh > 0.5, 'mais elle ne disparaît pas non plus');
});

test('Coriolis — module et géométrie', () => {
  // 300 kt à 45°N : 0,0263 × 300 × 0,7071 = 5,6′ de basculement maximal.
  const maxima = coriolisCorrection(300, 45, 0, 90); // astre à droite de la route
  assert.ok(Math.abs(maxima - 5.58) < 0.1, `${maxima}′`);

  // Un astre droit devant ou droit derrière n'est pas affecté.
  assert.ok(Math.abs(coriolisCorrection(300, 45, 0, 0)) < 1e-9);
  assert.ok(Math.abs(coriolisCorrection(300, 45, 0, 180)) < 1e-9);

  // Le signe s'inverse dans l'hémisphère sud.
  assert.ok(coriolisCorrection(300, -45, 0, 90) < 0);

  // Nul à l'équateur, nul à l'arrêt.
  assert.ok(Math.abs(coriolisCorrection(300, 0, 0, 90)) < 1e-9);
  assert.equal(coriolisCorrection(0, 45, 0, 90), 0);
});

// ---------------------------------------------------------------------------

test('intercept — sens de report', () => {
  const toward = intercept(30.5, 30.0, 120);
  assert.ok(toward.toward);
  assert.ok(Math.abs(toward.interceptNm - 30) < 1e-9);
  assert.equal(toward.bearing, 120);

  const away = intercept(29.5, 30.0, 120);
  assert.ok(!away.toward);
  assert.ok(Math.abs(away.interceptNm - 30) < 1e-9);
  assert.equal(away.bearing, 300);
});

test('point observé — trois droites concourantes', () => {
  // Position vraie 12 NM au nord et 7 NM à l'est de l'estime.
  const north = 12;
  const east = 7;
  const azimuts = [35, 150, 265];
  const lops = azimuts.map((zn) => ({
    zn,
    signedNm:
      Math.cos((zn * Math.PI) / 180) * north + Math.sin((zn * Math.PI) / 180) * east,
  }));

  const fix = fixFromLops(lops, { lat: 48, lon: -5 });
  assert.ok(Math.abs(fix.northNm - north) < 1e-9, `nord ${fix.northNm}`);
  assert.ok(Math.abs(fix.eastNm - east) < 1e-9, `est ${fix.eastNm}`);
  assert.ok(fix.rmsNm < 1e-9, `résidu ${fix.rmsNm}`);
});

test('point observé — le chapeau se voit dans le résidu', () => {
  // Une visée fausse de 4 NM doit produire un résidu non nul.
  const lops = [
    { zn: 35, signedNm: 10 },
    { zn: 150, signedNm: -3 },
    { zn: 265, signedNm: 6 },
  ];
  const fix = fixFromLops(lops, { lat: 48, lon: -5 });
  assert.ok(fix.rmsNm > 0.5, `résidu trop faible : ${fix.rmsNm}`);
  assert.equal(fix.residualsNm.length, 3);
});

test('point observé — deux droites parallèles sont refusées', () => {
  assert.throws(
    () =>
      fixFromLops(
        [
          { zn: 90, signedNm: 3 },
          { zn: 270, signedNm: -3 },
        ],
        { lat: 0, lon: 0 },
      ),
    /indéterminé/,
  );
  assert.throws(() => fixFromLops([{ zn: 90, signedNm: 3 }], { lat: 0, lon: 0 }), /deux/);
});

// ---------------------------------------------------------------------------

test('almanach — GHA Aries + SHA reconstitue le GHA d’une étoile', () => {
  const ctx = timeContext('2026-08-18T22:30:00Z');
  const vega = bodyPosition('Vega', ctx);
  const rebuilt = (ctx.ghaAries + vega.sha) % 360;
  assert.ok(Math.abs(rebuilt - vega.gha) < 1e-9, `${rebuilt} vs ${vega.gha}`);
  assert.ok(Math.abs(shaFromRa(vega.ra) - vega.sha) < 1e-9);
});

test('almanach — la page complète est cohérente', () => {
  const page = almanacPage('2026-08-18T22:30:00Z');
  assert.equal(page.stars.length, 58);
  assert.ok(page.ghaAries >= 0 && page.ghaAries < 360);

  for (const b of [page.sun, page.moon, ...page.stars]) {
    assert.ok(Number.isFinite(b.gha) && b.gha >= 0 && b.gha < 360, `${b.name} GHA`);
    assert.ok(Number.isFinite(b.dec) && Math.abs(b.dec) <= 90, `${b.name} Dec`);
  }

  // Polaris doit rester à moins de 1° du pôle.
  const polaris = page.stars.find((s) => s.name === 'Polaris');
  assert.ok(polaris.dec > 89, `Polaris à δ = ${polaris.dec}`);

  // Le Soleil ne peut pas sortir des tropiques.
  assert.ok(Math.abs(page.sun.dec) < 23.5, `δ Soleil = ${page.sun.dec}`);
});

test('almanach — la déclinaison du Soleil suit les saisons', () => {
  const solsticeJuin = almanacPage('2026-06-21T12:00:00Z').sun.dec;
  const solsticeDec = almanacPage('2026-12-21T12:00:00Z').sun.dec;
  const equinoxeMars = almanacPage('2026-03-20T12:00:00Z').sun.dec;

  assert.ok(solsticeJuin > 23.2 && solsticeJuin < 23.5, `juin : ${solsticeJuin}`);
  assert.ok(solsticeDec < -23.2 && solsticeDec > -23.5, `décembre : ${solsticeDec}`);
  assert.ok(Math.abs(equinoxeMars) < 0.4, `équinoxe : ${equinoxeMars}`);
});

test('almanach — le GHA Aries avance de 15,04° par heure', () => {
  const a = timeContext('2026-08-18T00:00:00Z').ghaAries;
  const b = timeContext('2026-08-18T01:00:00Z').ghaAries;
  const delta = (b - a + 360) % 360;
  assert.ok(Math.abs(delta - 15.0411) < 0.001, `avance de ${delta}°/h`);
});

// ---------------------------------------------------------------------------

test('corrections — la chaîne est inversible', () => {
  // Hs → Ho → Hs doit revenir au point de départ. C'est le test qui attrape
  // une correction appliquée dans le mauvais sens, la faute la plus banale et
  // la plus coûteuse d'un programme de navigation : elle double l'erreur au
  // lieu de l'annuler, sans jamais rien casser de visible.
  const conditions = {
    indexError: -2.3,
    parallax: 0.95, // Lune
    pressureHpa: 700,
    tempC: -5,
    groundSpeedKt: 220,
    trackDeg: 310,
    latDeg: 52,
    znDeg: 145,
  };

  for (const hs of [12, 25, 40, 60, 78]) {
    const { ho } = observedAltitude({ hs, ...conditions });
    const retour = sextantReading({ ho, ...conditions });
    assert.ok(
      Math.abs(retour - hs) * 3600 < 0.5,
      `Hs = ${hs}° revient à ${retour}° (écart ${(Math.abs(retour - hs) * 60).toFixed(4)}′)`,
    );
  }
});

test('visée — la boucle complète retrouve la position vraie', () => {
  // Le scénario réel, de bout en bout :
  //   le simulateur connaît `vraie`, il en déduit la lecture du tambour ;
  //   le navigateur ne connaît que `estime`, il réduit et trace ;
  //   les droites doivent le ramener sur `vraie`.
  const utc = '2026-08-18T21:45:00Z';
  const estime = { lat: 48.0, lon: -20.0 };
  const vraie = { lat: 48.2, lon: -19.7 }; // ≈ 12 NM nord, 12 NM est

  const conditions = {
    altitudeFt: 9000,
    groundSpeedKt: 170,
    trackDeg: 265,
    indexError: -1.2,
  };

  const astres = ['Vega', 'Altair', 'Deneb', 'Arcturus'];
  const lops = [];

  for (const nom of astres) {
    // Côté simulateur : ce que le joueur lira sur l'instrument.
    const instrument = simulateSight({ utc, body: nom, actual: vraie, ...conditions });
    // Côté navigateur : il ne dispose que de son estime et de cette lecture.
    const reduite = sight({
      utc,
      body: nom,
      assumed: estime,
      hs: instrument.hs,
      ...conditions,
    });
    lops.push({ zn: reduite.zn, signedNm: reduite.signedNm });
  }

  const fix = fixFromLops(lops, estime);

  const erreurNm = Math.hypot(
    (fix.lat - vraie.lat) * 60,
    (fix.lon - vraie.lon) * 60 * Math.cos((vraie.lat * Math.PI) / 180),
  );

  // Une seule passe laisse la résidu de linéarisation de Marcq Saint-Hilaire :
  // de l'ordre de d²/(2r), soit ~0,1 NM ici. C'est correct, pas une erreur.
  assert.ok(erreurNm < 0.25, `le point tombe à ${erreurNm.toFixed(3)} NM de la vérité`);
  assert.ok(erreurNm > 0.01, 'résidu suspectement nul : le test ne prouve plus rien');
  assert.ok(fix.rmsNm < 0.25, `chapeau de ${fix.rmsNm.toFixed(3)} NM`);
});

test('visée — itérer la réduction fait disparaître le résidu', () => {
  const utc = '2026-08-18T21:45:00Z';
  // Estime volontairement mauvaise : 60 NM de nord et 40 NM d'est.
  const estime = { lat: 47.0, lon: -21.0 };
  const vraie = { lat: 48.0, lon: -20.0 };

  const conditions = { altitudeFt: 9000, groundSpeedKt: 170, trackDeg: 265 };
  const sights = ['Vega', 'Altair', 'Deneb', 'Arcturus'].map((body) => ({
    utc,
    body,
    hs: simulateSight({ utc, body, actual: vraie, ...conditions }).hs,
    ...conditions,
  }));

  const unePasse = fixFromSights({ assumed: estime, sights, iterations: 1 });
  const troisPasses = fixFromSights({ assumed: estime, sights, iterations: 3 });

  const ecart = (f) =>
    Math.hypot(
      (f.lat - vraie.lat) * 60,
      (f.lon - vraie.lon) * 60 * Math.cos((vraie.lat * Math.PI) / 180),
    );

  assert.ok(ecart(unePasse) > 0.5, `une passe devrait rester grossière : ${ecart(unePasse)}`);
  assert.ok(
    ecart(troisPasses) < 0.01,
    `trois passes tombent encore à ${ecart(troisPasses).toFixed(4)} NM`,
  );
  assert.equal(troisPasses.history.length, 3);
  // Le déplacement décroît d'une passe à l'autre : c'est ça, converger.
  assert.ok(troisPasses.history[2].shiftNm < troisPasses.history[0].shiftNm / 10);
});

test('visée — un carnet d’une seule visée est refusé', () => {
  assert.throws(
    () =>
      fixFromSights({
        assumed: { lat: 0, lon: 0 },
        sights: [{ utc: '2026-08-18T21:45:00Z', body: 'Vega', hs: 40 }],
      }),
    /au moins deux/,
  );
});

test('visée — le gisement à afficher est l’azimut moins le cap', () => {
  // Le point qui dispense d'interroger la caméra : la couronne de gisement se
  // règle en relatif, et le cap lu dans le simulateur fait la conversion.
  const s = simulateSight({
    utc: '2026-08-18T21:45:00Z',
    body: 'Vega',
    actual: { lat: 48, lon: -20 },
    headingTrue: 270,
  });
  const attendu = (s.trueAzimuth - 270 + 360) % 360;
  assert.ok(Math.abs(s.relativeBearing - attendu) < 1e-9);
  assert.ok(s.relativeBearing >= 0 && s.relativeBearing < 360);
});

test('visée — sans hauteur mesurée, on obtient seulement Hc et Zn', () => {
  const s = sight({
    utc: '2026-08-18T21:45:00Z',
    body: 'Vega',
    assumed: { lat: 48, lon: -20 },
  });
  assert.ok(Number.isFinite(s.hc) && Number.isFinite(s.zn));
  assert.equal(s.ho, undefined);
  assert.equal(s.interceptNm, undefined);
});

test('visée — les corrections sont détaillées et de bon signe', () => {
  const s = sight({
    utc: '2026-08-18T21:45:00Z',
    body: 'Vega',
    assumed: { lat: 48, lon: -20 },
    hs: 40,
    indexError: -1.5,
    altitudeFt: 10000,
    groundSpeedKt: 180,
    trackDeg: 270,
  });

  assert.ok(s.corrections.refraction < 0, 'la réfraction abaisse toujours la hauteur');
  assert.equal(s.corrections.parallax, 0, 'une étoile n’a pas de parallaxe');
  assert.equal(s.corrections.indexError, -1.5);
  assert.ok(s.ho < 40, 'Ho doit être sous Hs ici');
  assert.ok(Number.isFinite(s.interceptNm));
});

test('visée — la Lune porte une parallaxe de plusieurs dizaines de minutes', () => {
  const s = sight({
    utc: '2026-08-18T21:45:00Z',
    body: 'Moon',
    assumed: { lat: 48, lon: -20 },
    hs: 30,
  });
  // π ≈ 57′ ; en hauteur à 30° cela fait π·cos(30°) ≈ 49′.
  assert.ok(s.corrections.parallax > 40 && s.corrections.parallax < 62, `${s.corrections.parallax}′`);
});

test('visée — un astre inconnu lève une erreur explicite', () => {
  assert.throws(
    () => sight({ utc: Date.now(), body: 'Bételgeuze', assumed: { lat: 0, lon: 0 } }),
    /Astre inconnu/,
  );
});

// ---------------------------------------------------------------------------

test('astres exploitables — de jour, seuls le Soleil et la Lune', () => {
  // Midi vrai vers 0° de longitude en été.
  const v = visibleBodies({
    utc: '2026-06-21T12:00:00Z',
    position: { lat: 45, lon: 0 },
  });
  assert.ok(v.sunAltitude > 40, `Soleil à ${v.sunAltitude}°`);
  assert.equal(v.starsUsable, false);
  assert.ok(v.bodies.every((b) => b.kind !== 'star'));
});

test('astres exploitables — de nuit, un choix d’étoiles bien réparties', () => {
  const v = visibleBodies({
    utc: '2026-08-18T23:30:00Z',
    position: { lat: 48, lon: -20 },
  });
  assert.equal(v.starsUsable, true);
  assert.ok(v.bodies.length >= 3, `seulement ${v.bodies.length} astres`);
  for (const b of v.bodies) {
    assert.ok(b.hc >= 15 && b.hc <= 75, `${b.name} à ${b.hc}°`);
  }
  // La liste est triée par azimut croissant, pour choisir un bon triangle.
  for (let i = 1; i < v.bodies.length; i += 1) {
    assert.ok(v.bodies[i].zn >= v.bodies[i - 1].zn);
  }
});

// ---------------------------------------------------------------------------

test('formatage almanach', () => {
  assert.equal(formatAngle(123.76), '123° 45.6′');
  assert.equal(formatAngle(0), '0° 00.0′');
  // Le report de 59,97′ ne doit pas produire « 60,0′ ».
  assert.equal(formatAngle(12.99995), '13° 00.0′');
  assert.equal(formatLatitude(-17.5), 'S 17° 30.0′');
});

test('catalogue — 58 étoiles, coordonnées plausibles, noms uniques', () => {
  assert.equal(STARS.length, 58);
  const noms = new Set(STARS.map((s) => s.name));
  assert.equal(noms.size, 58, 'des noms sont dupliqués');
  for (const s of STARS) {
    assert.ok(s.raHours >= 0 && s.raHours < 24, `${s.name} : α = ${s.raHours} h`);
    assert.ok(Math.abs(s.decDeg) <= 90, `${s.name} : δ = ${s.decDeg}°`);
    assert.ok(s.magnitude < 3.0, `${s.name} : magnitude ${s.magnitude}`);
  }
});

test('catalogue — les étoiles sont réparties sur les 24 heures', () => {
  // Un catalogue amputé se repérerait à un trou d'ascension droite.
  const seaux = new Array(12).fill(0);
  for (const s of STARS) seaux[Math.floor(s.raHours / 2)] += 1;
  assert.ok(
    seaux.every((n) => n > 0),
    `trou d’ascension droite : ${seaux.join(',')}`,
  );
});

test('localHourAngle — la longitude est compte positivement', () => {
  assert.equal(localHourAngle(100, 20), 120);
  assert.equal(localHourAngle(100, -120), 340);
  assert.equal(localHourAngle(350, 20), 10);
});
