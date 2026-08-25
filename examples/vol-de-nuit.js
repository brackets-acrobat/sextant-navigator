/**
 * Une traversée de nuit, de bout en bout.
 *
 *   node examples/vol-de-nuit.js
 *
 * Un DC-3 quelque part au-dessus de l'Atlantique nord. Le navigateur croit
 * être à un endroit, il est ailleurs. Il ouvre l'astrodôme, vise trois étoiles,
 * réduit, trace — et retrouve sa position à un mille près.
 */

import {
  visibleBodies,
  simulateSight,
  sight,
  fixFromSights,
  almanacPage,
  formatAngle,
  formatLatitude,
  formatLongitude,
  standardAtmosphere,
} from '../src/index.js';

// --- La situation ----------------------------------------------------------

const UTC = '2026-08-18T23:20:00Z';

/** Ce que le simulateur sait, et que le joueur ignore. */
const POSITION_VRAIE = { lat: 49.6, lon: -28.9 };

/** Ce que le navigateur croit, après trois heures d'estime dans le vent. */
const ESTIME = { lat: 49.15, lon: -29.55 };

const VOL = {
  altitudeFt: 9000,
  groundSpeedKt: 165,
  trackDeg: 262,
  headingTrue: 258,
  indexError: -1.4, // le sextant du bord a toujours eu ce défaut
};

const isa = standardAtmosphere(VOL.altitudeFt);

const nm = (x) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(1)} NM`;
const rule = (t = '') =>
  console.log(`\n\x1b[2m${'─'.repeat(72)}\x1b[0m${t ? `\n\x1b[1m${t}\x1b[0m\n` : ''}`);

// --- 1. Le ciel ------------------------------------------------------------

rule('1.  LE CIEL À 23 h 20 UTC');

console.log(
  `Vol  FL090, ${VOL.groundSpeedKt} kt, route ${VOL.trackDeg}°, cap vrai ${VOL.headingTrue}°`,
);
console.log(
  `Air  ${isa.pressureHpa.toFixed(0)} hPa, ${isa.tempC.toFixed(1)} °C  (atmosphère standard)`,
);
console.log(`Estime  ${formatLatitude(ESTIME.lat)}   ${formatLongitude(ESTIME.lon)}\n`);

const ciel = visibleBodies({ utc: UTC, position: ESTIME });
console.log(
  `Soleil à ${ciel.sunAltitude.toFixed(1)}° — ` +
    (ciel.starsUsable ? 'nuit astronomique, les étoiles sont bonnes.' : 'trop clair.'),
);
console.log('\n  astre              hauteur    azimut   gisement');
console.log('  ─────────────────────────────────────────────────');
for (const b of ciel.bodies) {
  const gisement = (b.zn - VOL.headingTrue + 360) % 360;
  console.log(
    `  ${b.name.padEnd(18)} ${b.hc.toFixed(1).padStart(5)}°   ` +
      `${b.zn.toFixed(0).padStart(4)}°     ${gisement.toFixed(0).padStart(4)}°`,
  );
}

// --- 2. Les visées ---------------------------------------------------------

rule('2.  TROIS VISÉES');

// On choisit trois astres bien répartis en azimut : plus le triangle est ouvert,
// plus le chapeau est petit.
const choisis = choisirTrois(ciel.bodies);

const carnet = [];
console.log('  astre              gisement    Hs lu au tambour');
console.log('  ─────────────────────────────────────────────────');

for (const astre of choisis) {
  const instrument = simulateSight({
    utc: UTC,
    body: astre.name,
    actual: POSITION_VRAIE,
    ...VOL,
  });
  carnet.push({ utc: UTC, body: astre.name, hs: instrument.hs, ...VOL });
  console.log(
    `  ${astre.name.padEnd(18)} ${instrument.relativeBearing.toFixed(0).padStart(4)}°   ` +
      `   ${formatAngle(instrument.hs).padStart(12)}`,
  );
}

// --- 3. La réduction -------------------------------------------------------

rule('3.  RÉDUCTION DEPUIS L’ESTIME');

console.log('  astre                  Hc         Ho     intercept   report');
console.log('  ──────────────────────────────────────────────────────────────');
for (const v of carnet) {
  const r = sight({ ...v, assumed: ESTIME });
  console.log(
    `  ${r.body.padEnd(18)} ${formatAngle(r.hc).padStart(10)} ` +
      `${formatAngle(r.ho).padStart(10)}   ${nm(r.signedNm).padStart(9)}   ` +
      `${r.bearing.toFixed(0).padStart(3)}°`,
  );
}

// --- 4. Le point -----------------------------------------------------------

rule('4.  LE POINT');

const fix = fixFromSights({ assumed: ESTIME, sights: carnet, iterations: 3 });

console.log(`Estime    ${formatLatitude(ESTIME.lat)}   ${formatLongitude(ESTIME.lon)}`);
console.log(`Observé   ${formatLatitude(fix.lat)}   ${formatLongitude(fix.lon)}`);
console.log(`Vérité    ${formatLatitude(POSITION_VRAIE.lat)}   ${formatLongitude(POSITION_VRAIE.lon)}`);

const erreur = distanceNm(fix, POSITION_VRAIE);
const deplacement = distanceNm(ESTIME, fix);

console.log(
  `\nL’estime était fausse de ${deplacement.toFixed(1)} NM. ` +
    `Le point observé tombe à ${erreur.toFixed(2)} NM de la position réelle.`,
);
console.log(
  `Chapeau (écart-type des trois droites) : ${(fix.rmsNm * 1852).toFixed(0)} m — ` +
    'nul, parce qu’aucune erreur de visée n’a été simulée.',
);
console.log('\nConvergence :');
for (const h of fix.history) {
  console.log(
    `  passe ${h.pass} — déplacement ${h.shiftNm.toFixed(3).padStart(7)} NM,` +
      ` résidu ${h.rmsNm.toExponential(1)}`,
  );
}

// --- 5. La page d'almanach -------------------------------------------------

rule('5.  EXTRAIT DE LA PAGE D’ALMANACH');

const page = almanacPage(UTC);
console.log(`GHA Aries   ${formatAngle(page.ghaAries)}\n`);
console.log('  astre                  SHA           Déc');
console.log('  ────────────────────────────────────────────────');
for (const nom of [...choisis.map((c) => c.name), 'Polaris']) {
  const b = page.stars.find((s) => s.name === nom);
  if (!b) continue;
  console.log(
    `  ${b.name.padEnd(18)} ${formatAngle(b.sha).padStart(11)}   ${formatLatitude(b.dec)}`,
  );
}
console.log(
  `  ${'Soleil'.padEnd(18)} ${'—'.padStart(11)}   ${formatLatitude(page.sun.dec)}`,
);
console.log(
  `  ${'Lune'.padEnd(18)} ${'—'.padStart(11)}   ${formatLatitude(page.moon.dec)}` +
    `   (π ${(page.moon.parallax * 60).toFixed(1)}′)`,
);
console.log();

// --- outils ----------------------------------------------------------------

function distanceNm(a, b) {
  return Math.hypot(
    (a.lat - b.lat) * 60,
    (a.lon - b.lon) * 60 * Math.cos((((a.lat + b.lat) / 2) * Math.PI) / 180),
  );
}

/**
 * Trois astres aussi proches que possible de 120° d'écart en azimut.
 * Le navigateur fait ça à l'œil ; ici on le fait par force brute, la liste est
 * courte.
 */
function choisirTrois(bodies) {
  if (bodies.length <= 3) return bodies;
  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      for (let k = j + 1; k < bodies.length; k += 1) {
        const trio = [bodies[i], bodies[j], bodies[k]];
        const az = trio.map((b) => b.zn).sort((a, b) => a - b);
        const gaps = [az[1] - az[0], az[2] - az[1], 360 - az[2] + az[0]];
        // Maximiser le plus petit écart : c'est ce qui minimise le chapeau.
        const score = Math.min(...gaps);
        if (score > bestScore) {
          bestScore = score;
          best = trio;
        }
      }
    }
  }
  return best;
}
