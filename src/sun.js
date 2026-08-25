/**
 * Position apparente du Soleil (Meeus, ch. 25 — méthode « basse précision »).
 *
 * Précision annoncée par Meeus : 0,01° soit 0,6′, en pratique plutôt 0,3′.
 * Un sextant à bulle en vol donne 5 à 10′ d'erreur : l'éphéméride est un ordre
 * de grandeur meilleure que l'instrument qu'elle alimente.
 */

import { centuriesSinceJ2000, norm360, sind, cosd, asind, atan2d } from './time.js';
import { nutation } from './nutation.js';

/**
 * @param {number} jdTT jour julien en Temps Terrestre
 * @returns {{ ra: number, dec: number, distanceAU: number,
 *             semiDiameter: number, parallax: number, lambda: number }}
 *          ra/dec apparentes en degrés, demi-diamètre et parallaxe horizontale
 *          en degrés.
 */
export function sunApparent(jdTT) {
  const T = centuriesSinceJ2000(jdTT);
  const { dpsi, eps0, omega } = nutation(jdTT);

  // Longitude moyenne géométrique, rapportée à l'équinoxe de la date.
  const L0 = norm360(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
  // Anomalie moyenne.
  const M = norm360(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
  // Excentricité de l'orbite terrestre.
  const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;

  // Équation du centre.
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * sind(M) +
    (0.019993 - 0.000101 * T) * sind(2 * M) +
    0.000289 * sind(3 * M);

  const trueLon = L0 + C;
  const trueAnomaly = M + C;

  // Rayon vecteur en unités astronomiques.
  const R = (1.000001018 * (1 - e * e)) / (1 + e * cosd(trueAnomaly));

  // Longitude apparente : correction de nutation + aberration annuelle.
  // Le terme -0.00569° est l'aberration (-20,4898″/R), le terme en Ω est la
  // part de nutation en longitude retenue par la méthode abrégée de Meeus.
  const lambda = trueLon - 0.00569 - 0.00478 * sind(omega);

  // Obliquité corrigée pour le calcul des coordonnées apparentes (Meeus 25.8).
  const epsCorrected = eps0 + 0.00256 * cosd(omega);

  const ra = norm360(atan2d(cosd(epsCorrected) * sind(lambda), cosd(lambda)));
  const dec = asind(sind(epsCorrected) * sind(lambda));

  return {
    ra,
    dec,
    distanceAU: R,
    // Demi-diamètre apparent : 15′59,63″ à 1 UA.
    semiDiameter: 0.2665685 / R,
    // Parallaxe horizontale équatoriale : 8,794″ à 1 UA.
    parallax: 0.0024427778 / R,
    lambda: norm360(lambda),
    dpsi,
  };
}
