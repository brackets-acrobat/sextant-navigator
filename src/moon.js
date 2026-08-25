/**
 * Position apparente de la Lune (Meeus, ch. 47 — série ELP tronquée).
 *
 * 60 termes en longitude et distance, 60 en latitude.
 * Précision annoncée : 10″ en longitude, 4″ en latitude, soit 0,17′.
 *
 * Les tables sont exprimées en multiples des quatre arguments de Delaunay
 * D, M, M', F ; les coefficients de Σl et Σb sont en 1e-6 degré, ceux de Σr
 * en 1e-3 km.
 */

import { centuriesSinceJ2000, norm360, sind, cosd, tand, asind, atan2d } from './time.js';
import { nutation } from './nutation.js';

// [D, M, M', F, coeff_l (1e-6 deg), coeff_r (1e-3 km)]  — Meeus table 47.A
const TABLE_LR = [
  [0, 0, 1, 0, 6288774, -20905355],
  [2, 0, -1, 0, 1274027, -3699111],
  [2, 0, 0, 0, 658314, -2955968],
  [0, 0, 2, 0, 213618, -569925],
  [0, 1, 0, 0, -185116, 48888],
  [0, 0, 0, 2, -114332, -3149],
  [2, 0, -2, 0, 58793, 246158],
  [2, -1, -1, 0, 57066, -152138],
  [2, 0, 1, 0, 53322, -170733],
  [2, -1, 0, 0, 45758, -204586],
  [0, 1, -1, 0, -40923, -129620],
  [1, 0, 0, 0, -34720, 108743],
  [0, 1, 1, 0, -30383, 104755],
  [2, 0, 0, -2, 15327, 10321],
  [0, 0, 1, 2, -12528, 0],
  [0, 0, 1, -2, 10980, 79661],
  [4, 0, -1, 0, 10675, -34782],
  [0, 0, 3, 0, 10034, -23210],
  [4, 0, -2, 0, 8548, -21636],
  [2, 1, -1, 0, -7888, 24208],
  [2, 1, 0, 0, -6766, 30824],
  [1, 0, -1, 0, -5163, -8379],
  [1, 1, 0, 0, 4987, -16675],
  [2, -1, 1, 0, 4036, -12831],
  [2, 0, 2, 0, 3994, -10445],
  [4, 0, 0, 0, 3861, -11650],
  [2, 0, -3, 0, 3665, 14403],
  [0, 1, -2, 0, -2689, -7003],
  [2, 0, -1, 2, -2602, 0],
  [2, -1, -2, 0, 2390, 10056],
  [1, 0, 1, 0, -2348, 6322],
  [2, -2, 0, 0, 2236, -9884],
  [0, 1, 2, 0, -2120, 5751],
  [0, 2, 0, 0, -2069, 0],
  [2, -2, -1, 0, 2048, -4950],
  [2, 0, 1, -2, -1773, 4130],
  [2, 0, 0, 2, -1595, 0],
  [4, -1, -1, 0, 1215, -3958],
  [0, 0, 2, 2, -1110, 0],
  [3, 0, -1, 0, -892, 3258],
  [2, 1, 1, 0, -810, 2616],
  [4, -1, -2, 0, 759, -1897],
  [0, 2, -1, 0, -713, -2117],
  [2, 2, -1, 0, -700, 2354],
  [2, 1, -2, 0, 691, 0],
  [2, -1, 0, -2, 596, 0],
  [4, 0, 1, 0, 549, -1423],
  [0, 0, 4, 0, 537, -1117],
  [4, -1, 0, 0, 520, -1571],
  [1, 0, -2, 0, -487, -1739],
  [2, 1, 0, -2, -399, 0],
  [0, 0, 2, -2, -381, -4421],
  [1, 1, 1, 0, 351, 0],
  [3, 0, -2, 0, -340, 0],
  [4, 0, -3, 0, 330, 0],
  [2, -1, 2, 0, 327, 0],
  [0, 2, 1, 0, -323, 1165],
  [1, 1, -1, 0, 299, 0],
  [2, 0, 3, 0, 294, 0],
  [2, 0, -1, -2, 0, 8752],
];

// [D, M, M', F, coeff_b (1e-6 deg)]  — Meeus table 47.B
const TABLE_B = [
  [0, 0, 0, 1, 5128122],
  [0, 0, 1, 1, 280602],
  [0, 0, 1, -1, 277693],
  [2, 0, 0, -1, 173237],
  [2, 0, -1, 1, 55413],
  [2, 0, -1, -1, 46271],
  [2, 0, 0, 1, 32573],
  [0, 0, 2, 1, 17198],
  [2, 0, 1, -1, 9266],
  [0, 0, 2, -1, 8822],
  [2, -1, 0, -1, 8216],
  [2, 0, -2, -1, 4324],
  [2, 0, 1, 1, 4200],
  [2, 1, 0, -1, -3359],
  [2, -1, -1, 1, 2463],
  [2, -1, 0, 1, 2211],
  [2, -1, -1, -1, 2065],
  [0, 1, -1, -1, -1870],
  [4, 0, -1, -1, 1828],
  [0, 1, 0, 1, -1794],
  [0, 0, 0, 3, -1749],
  [0, 1, -1, 1, -1565],
  [1, 0, 0, 1, -1491],
  [0, 1, 1, 1, -1475],
  [0, 1, 1, -1, -1410],
  [0, 1, 0, -1, -1344],
  [1, 0, 0, -1, -1335],
  [0, 0, 3, 1, 1107],
  [4, 0, 0, -1, 1021],
  [4, 0, -1, 1, 833],
  [0, 0, 1, -3, 777],
  [4, 0, -2, 1, 671],
  [2, 0, 0, -3, 607],
  [2, 0, 2, -1, 596],
  [2, -1, 1, -1, 491],
  [2, 0, -2, 1, -451],
  [0, 0, 3, -1, 439],
  [2, 0, 2, 1, 422],
  [2, 0, -3, -1, 421],
  [2, 1, -1, 1, -366],
  [2, 1, 0, 1, -351],
  [4, 0, 0, 1, 331],
  [2, -1, 1, 1, 315],
  [2, -2, 0, -1, 302],
  [0, 0, 1, 3, -283],
  [2, 1, 1, -1, -229],
  [1, 1, 0, -1, 223],
  [1, 1, 0, 1, 223],
  [0, 1, -2, -1, -220],
  [2, 1, -1, -1, -220],
  [1, 0, 1, 1, -185],
  [2, -1, -2, -1, 181],
  [0, 1, 2, 1, -177],
  [4, 0, -2, -1, 176],
  [4, -1, -1, -1, 166],
  [1, 0, 1, -1, -164],
  [4, 0, 1, -1, 132],
  [1, 0, -1, -1, -119],
  [4, -1, 0, -1, 115],
  [2, -2, 0, 1, 107],
];

/**
 * Coordonnées géocentriques de la Lune, rapportées à l'équinoxe de la date.
 *
 * @param {number} jdTT jour julien en Temps Terrestre
 * @returns {{ lambda: number, beta: number, distanceKm: number,
 *             parallax: number, semiDiameter: number,
 *             ra: number, dec: number }}
 *          angles en degrés.
 */
export function moonApparent(jdTT) {
  const T = centuriesSinceJ2000(jdTT);
  const { dpsi, eps } = nutation(jdTT);

  // Arguments fondamentaux (Meeus 47.1 à 47.6).
  const Lp = norm360(
    218.3164477 +
      481267.88123421 * T -
      0.0015786 * T ** 2 +
      T ** 3 / 538841 -
      T ** 4 / 65194000,
  );
  const D = norm360(
    297.8501921 +
      445267.1114034 * T -
      0.0018819 * T ** 2 +
      T ** 3 / 545868 -
      T ** 4 / 113065000,
  );
  const M = norm360(
    357.5291092 + 35999.0502909 * T - 0.0001536 * T ** 2 + T ** 3 / 24490000,
  );
  const Mp = norm360(
    134.9633964 +
      477198.8675055 * T +
      0.0087414 * T ** 2 +
      T ** 3 / 69699 -
      T ** 4 / 14712000,
  );
  const F = norm360(
    93.272095 +
      483202.0175233 * T -
      0.0036539 * T ** 2 -
      T ** 3 / 3526000 +
      T ** 4 / 863310000,
  );

  // Arguments additifs dus à Vénus, Jupiter et l'aplatissement terrestre.
  const A1 = norm360(119.75 + 131.849 * T);
  const A2 = norm360(53.09 + 479264.29 * T);
  const A3 = norm360(313.45 + 481266.484 * T);

  // Correction d'excentricité de l'orbite terrestre : les termes en M sont
  // multipliés par E^|M|.
  const E = 1 - 0.002516 * T - 0.0000074 * T * T;

  let sumL = 0;
  let sumR = 0;
  for (const [d, m, mp, f, cl, cr] of TABLE_LR) {
    const arg = d * D + m * M + mp * Mp + f * F;
    const ecc = m === 0 ? 1 : Math.abs(m) === 1 ? E : E * E;
    sumL += cl * ecc * sind(arg);
    sumR += cr * ecc * cosd(arg);
  }

  let sumB = 0;
  for (const [d, m, mp, f, cb] of TABLE_B) {
    const arg = d * D + m * M + mp * Mp + f * F;
    const ecc = m === 0 ? 1 : Math.abs(m) === 1 ? E : E * E;
    sumB += cb * ecc * sind(arg);
  }

  // Termes additifs.
  sumL += 3958 * sind(A1) + 1962 * sind(Lp - F) + 318 * sind(A2);
  sumB +=
    -2235 * sind(Lp) +
    382 * sind(A3) +
    175 * sind(A1 - F) +
    175 * sind(A1 + F) +
    127 * sind(Lp - Mp) -
    115 * sind(Lp + Mp);

  const lambdaGeo = norm360(Lp + sumL / 1e6);
  const beta = sumB / 1e6;
  const distanceKm = 385000.56 + sumR / 1000;

  // Longitude apparente : la nutation en longitude s'ajoute.
  // L'aberration de la Lune est déjà contenue dans la théorie.
  const lambda = norm360(lambdaGeo + dpsi);

  const ra = norm360(
    atan2d(sind(lambda) * cosd(eps) - tand(beta) * sind(eps), cosd(lambda)),
  );
  const dec = asind(sind(beta) * cosd(eps) + cosd(beta) * sind(eps) * sind(lambda));

  // Parallaxe horizontale équatoriale.
  const parallax = asind(6378.14 / distanceKm);
  // Demi-diamètre géocentrique : k = 0,272481 (rapport des rayons Lune/Terre).
  const semiDiameter = asind(0.272481 * sind(parallax));

  return {
    lambda,
    lambdaGeometric: lambdaGeo,
    beta,
    distanceKm,
    parallax,
    semiDiameter,
    ra,
    dec,
  };
}

/** Unité astronomique, en kilomètres (UAI 2012). */
const AU_KM = 149597870.7;

/**
 * Phase de la Lune, et orientation de son croissant (Meeus, ch. 48).
 *
 * Deux grandeurs, et la seconde est celle qui manque à tous les sextants de
 * simulateur : ils dessinent un croissant, mais ne savent pas l'ORIENTER.
 *
 *   - `illuminated` — la fraction éclairée du disque, de 0 à 1 ;
 *   - `brightLimbPA` — l'angle de position du milieu du limbe éclairé, compté
 *     depuis le pôle nord céleste vers l'est, en degrés.
 *
 * L'angle de position se lit dans le ciel, pas à l'écran : pour le porter dans
 * le champ d'un instrument il faut encore lui retirer l'angle parallactique,
 * qui dit de combien la verticale du lieu s'écarte du pôle. Voir
 * `parallacticAngle` dans reduce.js.
 *
 * La fraction éclairée passe par l'angle de phase i plutôt que par la simple
 * élongation : la différence tient au fait que le Soleil n'est pas à l'infini,
 * et elle atteint quelques dixièmes de pour cent.
 *
 * @param {{ ra: number, dec: number, distanceAU: number }} sun
 * @param {{ ra: number, dec: number, distanceKm: number }} moon
 */
export function moonIllumination(sun, moon) {
  const dRa = sun.ra - moon.ra;

  // Élongation géocentrique du Soleil à la Lune (48.2).
  const cosPsi =
    sind(sun.dec) * sind(moon.dec) + cosd(sun.dec) * cosd(moon.dec) * cosd(dRa);
  const psi = Math.acos(Math.max(-1, Math.min(1, cosPsi))) * (180 / Math.PI);

  // Angle de phase (48.3) : l'angle Soleil-Lune-Terre.
  const R = sun.distanceAU * AU_KM;
  const i = atan2d(R * sind(psi), moon.distanceKm - R * cosd(psi));

  // Angle de position du limbe éclairé (48.5). L'arc-tangente à deux
  // arguments est indispensable : la formule de Meeus, prise au sens strict,
  // perd le quadrant une fois sur deux.
  const chi = norm360(
    atan2d(
      cosd(sun.dec) * sind(dRa),
      sind(sun.dec) * cosd(moon.dec) - cosd(sun.dec) * sind(moon.dec) * cosd(dRa),
    ),
  );

  return {
    elongation: psi,
    phaseAngle: norm360(i),
    illuminated: (1 + cosd(i)) / 2,
    brightLimbPA: chi,
    /** Croissante avant la pleine lune, décroissante après. */
    waxing: norm360(dRa) > 180,
  };
}
