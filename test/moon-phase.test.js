/**
 * La phase de la Lune, et l'orientation de son croissant.
 *
 * Deux tests de nature différente, et il faut les deux.
 *
 * Le premier confronte le calcul aux nombres de Meeus, exemple 48.a — la seule
 * façon honnête de contrôler une formule d'éphéméride, puisqu'il donne aussi
 * les résultats intermédiaires. On lui donne SES positions, pas les nôtres :
 * on teste la formule de phase, pas la théorie lunaire, déjà éprouvée ailleurs.
 *
 * Le second ne vérifie aucun nombre publié : il vérifie une VÉRITÉ. Le limbe
 * éclairé d'un astre pointe vers ce qui l'éclaire. L'angle rendu dans le repère
 * de l'oculaire doit donc désigner le Soleil, où qu'il soit sous l'horizon. Ce
 * test-là attrape ce qu'aucune table ne peut attraper : une erreur de signe, un
 * angle parallactique oublié, un sens de rotation inversé.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { moonIllumination } from '../src/moon.js';
import { simulateSight, parallacticAngle } from '../src/index.js';

const D = Math.PI / 180;

test('phase — exemple 48.a de Meeus, 1992 avril 12', () => {
  // Les valeurs de l'exemple, telles qu'imprimées.
  const soleil = { ra: 20.6579, dec: 8.6964, distanceAU: 0.99760 };
  const lune = { ra: 134.6885, dec: 13.7684, distanceKm: 368410 };

  const p = moonIllumination(soleil, lune);

  assert.ok(Math.abs(p.elongation - 110.7929) < 0.001, `ψ = ${p.elongation}`);
  assert.ok(Math.abs(p.phaseAngle - 69.0756) < 0.001, `i = ${p.phaseAngle}`);
  assert.ok(Math.abs(p.illuminated - 0.6786) < 0.0001, `k = ${p.illuminated}`);
  assert.ok(Math.abs(p.brightLimbPA - 285.0) < 0.1, `χ = ${p.brightLimbPA}`);
});

test('phase — la fraction éclairée reste dans [0, 1] sur une lunaison', () => {
  let min = 1;
  let max = 0;
  for (let h = 0; h < 30 * 24; h += 3) {
    const utc = new Date(Date.UTC(2026, 0, 1) + h * 3600000);
    const k = simulateSight({ utc, body: 'Moon', actual: { lat: 0, lon: 0 } }).illuminated;
    assert.ok(k >= 0 && k <= 1, `k = ${k} le ${utc.toISOString()}`);
    min = Math.min(min, k);
    max = Math.max(max, k);
  }
  // Une lunaison entière passe forcément par la nouvelle et la pleine lune.
  assert.ok(min < 0.02, `la nouvelle lune n'est pas atteinte : min ${min}`);
  assert.ok(max > 0.98, `la pleine lune n'est pas atteinte : max ${max}`);
});

/**
 * Gisement de A vers B dans le repère horizontal, compté depuis le zénith et
 * croissant vers les azimuts croissants. C'est la formule ordinaire du cap
 * initial, où la latitude devient la hauteur et la longitude l'azimut.
 */
function gisementDepuisZenith(a, b) {
  const dz = (b.trueAzimuth - a.trueAzimuth) * D;
  const h1 = a.trueAltitude * D;
  const h2 = b.trueAltitude * D;
  return (
    (Math.atan2(
      Math.sin(dz) * Math.cos(h2),
      Math.cos(h1) * Math.sin(h2) - Math.sin(h1) * Math.cos(h2) * Math.cos(dz),
    ) *
      180) /
    Math.PI
  );
}

test('phase — le limbe éclairé pointe vers le Soleil, dans le champ', () => {
  const cas = [
    ['Californie, nuit', Date.UTC(2026, 0, 15, 4, 30), 34.5, -122],
    ['Paris, soir d’été', Date.UTC(2026, 5, 3, 20, 0), 48, 2],
    ['Sydney, hémisphère sud', Date.UTC(2026, 8, 20, 3, 0), -33, 151],
    ['haute latitude nord', Date.UTC(2026, 2, 9, 22, 0), 68, 25],
    ['équateur', Date.UTC(2026, 10, 1, 1, 0), 0, 0],
  ];

  for (const [nom, t, lat, lon] of cas) {
    const utc = new Date(t);
    const lune = simulateSight({ utc, body: 'Moon', actual: { lat, lon } });
    const soleil = simulateSight({ utc, body: 'Sun', actual: { lat, lon } });

    // `limbAngle` est compté depuis le haut du champ vers la GAUCHE, donc dans
    // le sens direct ; le gisement ci-dessus va vers la droite. D'où le signe.
    const attendu = ((-gisementDepuisZenith(lune, soleil) % 360) + 360) % 360;
    const ecart = Math.abs(((lune.limbAngle - attendu + 540) % 360) - 180);

    assert.ok(
      ecart < 0.05,
      `${nom} : limbe à ${lune.limbAngle.toFixed(2)}°, Soleil à ${attendu.toFixed(2)}°`,
    );
  }
});

test('angle parallactique — nul au méridien, positif à l’ouest', () => {
  // Au méridien, le zénith et le pôle sont dans le même plan vertical.
  assert.equal(parallacticAngle(45, 10, 0).toFixed(6), '0.000000');
  // À l'ouest (angle horaire positif), le zénith est à l'est de l'astre.
  assert.ok(parallacticAngle(45, 0, 60) > 0);
  // À l'est, l'inverse, et par symétrie.
  assert.ok(
    Math.abs(parallacticAngle(45, 0, 300) + parallacticAngle(45, 0, 60)) < 1e-9,
  );
});
