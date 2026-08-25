/**
 * Les quatre planètes de navigation : Vénus, Mars, Jupiter, Saturne.
 *
 * Ce sont celles de l'almanach nautique, et ce n'est pas un hasard : assez
 * brillantes pour se viser au crépuscule, assez lentes pour se tabuler. Vénus
 * est l'astre du navigateur par excellence — visible en plein jour quand on
 * sait où regarder, et souvent le premier point lumineux du soir.
 *
 * Méthode : Meeus, chapitres 32 et 33. Position héliocentrique par VSOP87
 * tronqué, différence avec la Terre, itération sur le temps-lumière, passage au
 * FK5, aberration annuelle, nutation. Rien d'exotique — mais l'ordre compte, et
 * chaque étape se voit dans le résultat final.
 *
 * Les coefficients ne sont PAS saisis à la main : `src/vsop87.js` est engendré
 * depuis les fichiers officiels de l'IMCCE par `tools/build-vsop87.mjs`. Le
 * projet a déjà payé une coquille de saisie ; on ne recommence pas.
 */

import {
  norm360, sind, cosd, tand, asind, atan2d, centuriesSinceJ2000,
} from './time.js';
import { nutation } from './nutation.js';
import { VSOP87 } from './vsop87.js';

const RAD = 180 / Math.PI;
/** Temps que met la lumière à parcourir une unité astronomique, en jours. */
const JOURS_PAR_UA = 0.0057755183;
/** Constante de l'aberration, en degrés. */
const KAPPA = 20.49552 / 3600;

/**
 * Les quatre, plus ce qu'il faut pour les dessiner et les nommer.
 *
 * `magnitude` donne la formule de l'Astronomical Almanac reprise par Meeus 41 :
 * une magnitude de base, la distance, et l'angle de phase. Elle sert à la
 * taille du point dans l'oculaire et au classement dans la liste, pas à la
 * navigation — un sextant se moque de l'éclat.
 */
const PLANETES = {
  Venus: { cle: 'venus', base: -4.4, phase: (i) => 0.0009 * i + 0.000239 * i * i - 0.00000065 * i * i * i },
  Mars: { cle: 'mars', base: -1.52, phase: (i) => 0.016 * i },
  Jupiter: { cle: 'jupiter', base: -9.4, phase: (i) => 0.005 * i },
  // L'éclat de Saturne dépend surtout de l'ouverture de ses anneaux, qui
  // demande leur inclinaison. On s'en tient au terme de distance : l'erreur
  // atteint une magnitude, ce qui change la taille du point et rien d'autre.
  Saturn: { cle: 'saturn', base: -8.88, phase: () => 0 },
};

export const PLANET_NAMES = Object.keys(PLANETES);

/** Reconnaît une planète, en français comme en anglais. */
export function findPlanet(nom) {
  if (!nom) return null;
  const n = String(nom).trim().toLowerCase();
  const alias = {
    venus: 'Venus', vénus: 'Venus', venuz: 'Venus',
    mars: 'Mars',
    jupiter: 'Jupiter',
    saturn: 'Saturn', saturne: 'Saturn',
  };
  return alias[n] || null;
}

/** Évalue une série VSOP87 en τ, millénaires depuis J2000. */
function serie(table, tau) {
  let total = 0;
  let puissance = 1;
  for (const termes of table) {
    let somme = 0;
    for (let k = 0; k < termes.length; k += 1) {
      const t = termes[k];
      somme += t[0] * Math.cos(t[1] + t[2] * tau);
    }
    total += somme * puissance;
    puissance *= tau;
  }
  return total;
}

/**
 * Position héliocentrique, écliptique et équinoxe moyens de la date.
 * @returns {{ l: number, b: number, r: number }} degrés, degrés, UA
 */
export function heliocentric(cle, jdTT) {
  const tau = (jdTT - 2451545) / 365250;
  const t = VSOP87[cle];
  return {
    l: norm360(serie(t.L, tau) * RAD),
    b: serie(t.B, tau) * RAD,
    r: serie(t.R, tau),
  };
}

/** Coordonnées rectangulaires écliptiques, depuis les sphériques. */
function rectangulaires(p) {
  return [
    p.r * cosd(p.b) * cosd(p.l),
    p.r * cosd(p.b) * sind(p.l),
    p.r * sind(p.b),
  ];
}

/**
 * Position apparente d'une planète, vue du centre de la Terre.
 *
 * @param {string} nom  'Venus', 'Mars', 'Jupiter' ou 'Saturn'
 * @param {number} jdTT jour julien en Temps Terrestre
 * @returns {{ ra: number, dec: number, distanceAU: number, phaseAngle: number,
 *             illuminated: number, magnitude: number, lambda: number, beta: number }}
 */
export function planetApparent(nom, jdTT) {
  const p = PLANETES[nom];
  if (!p) throw new Error(`Planète inconnue : « ${nom} »`);

  const T = centuriesSinceJ2000(jdTT);
  const { dpsi, eps } = nutation(jdTT);

  const terre = heliocentric('earth', jdTT);
  const [xt, yt, zt] = rectangulaires(terre);

  // Temps-lumière : on ne voit pas la planète où elle est, mais où elle était
  // quand elle a émis la lumière qui nous arrive. Pour Saturne cela fait plus
  // d'une heure, et jusqu'à une minute d'arc de déplacement.
  let planete = heliocentric(p.cle, jdTT);
  let x = 0; let y = 0; let z = 0; let delta = 0;
  for (let i = 0; i < 3; i += 1) {
    const [xp, yp, zp] = rectangulaires(planete);
    x = xp - xt;
    y = yp - yt;
    z = zp - zt;
    delta = Math.sqrt(x * x + y * y + z * z);
    planete = heliocentric(p.cle, jdTT - delta * JOURS_PAR_UA);
  }

  let lambda = norm360(atan2d(y, x));
  let beta = atan2d(z, Math.sqrt(x * x + y * y));

  // Passage de VSOP87 au repère FK5 (Meeus 32.3). Deux centièmes de seconde
  // d'arc : indécelable pour nous, mais l'omettre serait un mensonge sur la
  // nature du repère, et la correction coûte trois lignes.
  const lprime = lambda - 1.397 * T - 0.00031 * T * T;
  lambda += (-0.09033 / 3600) + (0.03916 / 3600) * (cosd(lprime) + sind(lprime)) * tand(beta);
  beta += (0.03916 / 3600) * (cosd(lprime) - sind(lprime));

  // Aberration annuelle (Meeus 33.2). Le temps-lumière ci-dessus donne la
  // direction de la position retardée ; l'aberration ajoute l'effet de NOTRE
  // propre vitesse, et vaut jusqu'à 20″.
  const soleil = norm360(terre.l + 180);
  const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;
  const pi = 102.93735 + 1.71946 * T + 0.00046 * T * T;
  const dLambda =
    (-KAPPA * cosd(soleil - lambda) + e * KAPPA * cosd(pi - lambda)) / cosd(beta);
  const dBeta =
    -KAPPA * sind(beta) * (sind(soleil - lambda) - e * sind(pi - lambda));
  lambda += dLambda;
  beta += dBeta;

  // Nutation en longitude, puis passage à l'équateur avec l'obliquité vraie.
  lambda = norm360(lambda + dpsi);

  const ra = norm360(
    atan2d(sind(lambda) * cosd(eps) - tand(beta) * sind(eps), cosd(lambda)),
  );
  const dec = asind(sind(beta) * cosd(eps) + cosd(beta) * sind(eps) * sind(lambda));

  // Angle de phase : l'angle Soleil-planète-Terre, par la loi des cosinus dans
  // le triangle dont on connaît les trois côtés.
  const r = planete.r;
  const R = terre.r;
  const cosI = (r * r + delta * delta - R * R) / (2 * r * delta);
  const i = Math.acos(Math.max(-1, Math.min(1, cosI))) * RAD;

  return {
    ra,
    dec,
    lambda,
    beta,
    distanceAU: delta,
    heliocentricAU: r,
    phaseAngle: i,
    illuminated: (1 + cosd(i)) / 2,
    magnitude: p.base + 5 * Math.log10(r * delta) + p.phase(i),
    // Une planète se vise comme une étoile : un point. Son diamètre apparent
    // dépasse rarement une minute d'arc, et l'almanach ne lui donne pas de
    // demi-diamètre — on ne pose pas son limbe sur la bulle, mais son éclat.
    semiDiameter: 0,
    parallax: 0,
  };
}
