/**
 * Validation du noyau contre les exemples résolus de Meeus,
 * « Astronomical Algorithms », 2e édition.
 *
 * Ces exemples sont la seule façon honnête de vérifier une éphéméride écrite à
 * la main : ils donnent les résultats intermédiaires, donc une erreur se situe
 * au lieu de se deviner.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { julianDay, gmst, norm360 } from '../src/time.js';
import { nutation, meanObliquity } from '../src/nutation.js';
import { sunApparent } from '../src/sun.js';
import { moonApparent } from '../src/moon.js';
import { starApparent } from '../src/stars.js';

/** Écart en secondes d'arc entre deux angles en degrés. */
const arcsec = (a, b) => Math.abs(a - b) * 3600;

function closeArcsec(actual, expected, tolerance, label) {
  const d = arcsec(actual, expected);
  assert.ok(
    d <= tolerance,
    `${label} : écart ${d.toFixed(3)}″ (obtenu ${actual}, attendu ${expected}, toléré ${tolerance}″)`,
  );
}

// ---------------------------------------------------------------------------

test('jour julien — Meeus exemple 7.a et époques de référence', () => {
  assert.equal(julianDay(1957, 10, 4, 19, 26, 24), 2436116.31);
  assert.equal(julianDay(2000, 1, 1, 12, 0, 0), 2451545.0);
  assert.equal(julianDay(1987, 1, 27, 0, 0, 0), 2446822.5);
  assert.equal(julianDay(1988, 6, 19, 12, 0, 0), 2447332.0);
});

test('temps sidéral moyen — Meeus exemple 12.a', () => {
  // 1987 avril 10, 0h UT → 13h10m46,3668s = 197,693195°
  const theta = gmst(2446895.5);
  closeArcsec(theta, 197.693195, 0.05, 'GMST');
});

test('obliquité moyenne — Meeus exemple 22.a', () => {
  // ε0 = 23°26′27,407″
  const expected = 23 + 26 / 60 + 27.407 / 3600;
  closeArcsec(meanObliquity(2446895.5), expected, 0.02, 'obliquité moyenne');
});

test('nutation abrégée — ordre de grandeur de Meeus exemple 22.a', () => {
  // Δψ = −3,788″ et Δε = +9,443″ avec la table complète.
  // La forme abrégée est annoncée à 0,5″ près sur Δψ, 0,1″ sur Δε.
  const { dpsi, deps } = nutation(2446895.5);
  closeArcsec(dpsi, -3.788 / 3600, 0.6, 'Δψ');
  closeArcsec(deps, 9.443 / 3600, 0.2, 'Δε');
});

// ---------------------------------------------------------------------------

test('Soleil — Meeus exemple 25.a/25.b (1992 octobre 13,0 TD)', () => {
  const s = sunApparent(2448908.5);

  // Longitude apparente λ = 199,90895°
  closeArcsec(s.lambda, 199.90895, 2, 'longitude apparente du Soleil');
  // Ascension droite α = 198,38083° (13h13m31,4s)
  closeArcsec(s.ra, 198.38083, 2, 'ascension droite du Soleil');
  // Déclinaison δ = −7,78507° (−7°47′06,3″)
  closeArcsec(s.dec, -7.78507, 2, 'déclinaison du Soleil');
  // Rayon vecteur R = 0,99766 UA
  assert.ok(
    Math.abs(s.distanceAU - 0.99766) < 1e-5,
    `distance Soleil : ${s.distanceAU}`,
  );
});

test('Soleil — demi-diamètre et parallaxe plausibles toute l’année', () => {
  // Le demi-diamètre oscille entre 15′45″ (aphélie) et 16′18″ (périhélie).
  for (const jd of [2448908.5, 2451545.0, 2460676.5]) {
    const s = sunApparent(jd);
    const sdMin = s.semiDiameter * 60;
    assert.ok(sdMin > 15.7 && sdMin < 16.4, `demi-diamètre ${sdMin}′`);
    const parMin = s.parallax * 60;
    assert.ok(parMin > 0.14 && parMin < 0.16, `parallaxe ${parMin}′`);
  }
});

// ---------------------------------------------------------------------------

test('Lune — Meeus exemple 47.a (1992 avril 12,0 TD)', () => {
  const m = moonApparent(2448724.5);

  // Longitude géométrique λ = 133,162655°
  closeArcsec(m.lambdaGeometric, 133.162655, 1, 'longitude géométrique de la Lune');
  // Latitude β = −3,229126°
  closeArcsec(m.beta, -3.229126, 1, 'latitude de la Lune');
  // Distance Δ = 368409,7 km
  assert.ok(
    Math.abs(m.distanceKm - 368409.7) < 1,
    `distance Lune : ${m.distanceKm} km`,
  );
  // Parallaxe horizontale π = 0,991990°
  closeArcsec(m.parallax, 0.99199, 1, 'parallaxe horizontale de la Lune');
  // Longitude apparente = 133,167265° (nutation incluse)
  closeArcsec(m.lambda, 133.167265, 2, 'longitude apparente de la Lune');
});

test('Lune — ascension droite et déclinaison de l’exemple 47.a', () => {
  const m = moonApparent(2448724.5);
  // Meeus poursuit l'exemple : α = 134,688470°, δ = +13,768368°
  closeArcsec(m.ra, 134.68847, 3, 'ascension droite de la Lune');
  closeArcsec(m.dec, 13.768368, 3, 'déclinaison de la Lune');
});

test('Lune — parallaxe et demi-diamètre dans les bornes physiques', () => {
  // π varie de 53,9′ (apogée) à 61,5′ (périgée) ; SD ≈ π × 0,2725.
  for (let jd = 2460676.5; jd < 2460706.5; jd += 1) {
    const m = moonApparent(jd);
    const parMin = m.parallax * 60;
    assert.ok(parMin > 53.5 && parMin < 61.8, `parallaxe Lune ${parMin}′`);
    const ratio = m.semiDiameter / m.parallax;
    assert.ok(Math.abs(ratio - 0.2725) < 0.001, `rapport SD/π ${ratio}`);
  }
});

// ---------------------------------------------------------------------------

const THETA_PERSEI = {
  name: 'θ Persei',
  bayer: 'θ Per',
  raHours: 2 + 44 / 60 + 11.986 / 3600,
  decDeg: 49 + 13 / 60 + 42.48 / 3600,
  // Meeus donne µα = +0,03425 s(temps)/an et µδ = −0,0895″/an.
  // Converti en µα* (mas/an, cos δ inclus) : 0,03425 × 15 × cos δ × 1000.
  pmRA: 0.03425 * 15 * Math.cos(((49 + 13 / 60 + 42.48 / 3600) * Math.PI) / 180) * 1000,
  pmDec: -89.5,
  magnitude: 4.1,
};

test('étoile — mouvement propre + précession, Meeus exemple 21.b', () => {
  // 2028 novembre 13,19 TD → JDE 2462088,69
  // Résultat attendu : α = 2h46m11,331s, δ = +49°20′54,54″
  const p = starApparent(THETA_PERSEI, 2462088.69);

  const expectedRa = (2 + 46 / 60 + 11.331 / 3600) * 15;
  const expectedDec = 49 + 20 / 60 + 54.54 / 3600;

  closeArcsec(p.raMean, expectedRa, 0.5, 'α précessée (position moyenne)');
  closeArcsec(p.decMean, expectedDec, 0.5, 'δ précessée (position moyenne)');
});

test('étoile — position apparente complète, Meeus exemple 23.a', () => {
  // Nutation et aberration comprises : α = 2h46m14,390s, δ = +49°21′07,45″
  const p = starApparent(THETA_PERSEI, 2462088.69);

  const expectedRa = (2 + 46 / 60 + 14.39 / 3600) * 15;
  const expectedDec = 49 + 21 / 60 + 7.45 / 3600;

  // Tolérance 3″ : la nutation abrégée et l'absence de correction FK5 coûtent
  // chacune quelques dixièmes de seconde d'arc. 3″ = 0,05′ = 0,05 NM.
  closeArcsec(p.ra, expectedRa, 3, 'α apparente');
  closeArcsec(p.dec, expectedDec, 3, 'δ apparente');
});

test('étoile — le mouvement propre n’est pas négligeable', () => {
  // Contrôle de non-régression : si quelqu'un supprime le mouvement propre,
  // Arcturus dérive de près d'une minute d'arc sur 26 ans et ce test tombe.
  const arcturus = {
    raHours: 14 + 15 / 60 + 39.67 / 3600,
    decDeg: 19 + 10 / 60 + 56.7 / 3600,
    pmRA: -1093.45,
    pmDec: -1999.4,
  };
  const j2000 = starApparent(arcturus, 2451545.0);
  const j2026 = starApparent(arcturus, 2451545.0 + 26 * 365.25);
  const decDrift = Math.abs(j2026.decMean - j2000.decMean) * 60;
  assert.ok(decDrift > 0.5, `dérive en déclinaison seulement ${decDrift}′`);
});

// ---------------------------------------------------------------------------

test('normalisation des angles', () => {
  assert.equal(norm360(-10), 350);
  assert.equal(norm360(370), 10);
  assert.equal(norm360(360), 0);
});
