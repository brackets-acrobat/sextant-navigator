/**
 * Nutation et obliquité de l'écliptique (Meeus, ch. 22).
 *
 * On utilise la forme abrégée : précision annoncée 0,5″ sur Δψ et 0,1″ sur Δε,
 * soit 0,008′ — trois ordres de grandeur sous l'erreur d'un sextant à bulle.
 */

import { centuriesSinceJ2000, norm360, sind, cosd } from './time.js';

const ARCSEC = 1 / 3600;

/**
 * @param {number} jdTT jour julien en Temps Terrestre
 * @returns {{ dpsi: number, deps: number, eps0: number, eps: number }}
 *          angles en degrés : nutation en longitude, en obliquité,
 *          obliquité moyenne et obliquité vraie.
 */
export function nutation(jdTT) {
  const T = centuriesSinceJ2000(jdTT);

  // Longitude moyenne du Soleil et de la Lune.
  const L = norm360(280.4665 + 36000.7698 * T);
  const Lp = norm360(218.3165 + 481267.8813 * T);
  // Longitude du nœud ascendant de l'orbite lunaire moyenne.
  const omega = norm360(125.04452 - 1934.136261 * T + 0.0020708 * T * T + (T * T * T) / 450000);

  const dpsi =
    (-17.2 * sind(omega) -
      1.32 * sind(2 * L) -
      0.23 * sind(2 * Lp) +
      0.21 * sind(2 * omega)) *
    ARCSEC;

  const deps =
    (9.2 * cosd(omega) +
      0.57 * cosd(2 * L) +
      0.1 * cosd(2 * Lp) -
      0.09 * cosd(2 * omega)) *
    ARCSEC;

  const eps0 = meanObliquity(jdTT);

  return { dpsi, deps, eps0, eps: eps0 + deps, omega };
}

/**
 * Obliquité moyenne de l'écliptique, en degrés (Meeus 22.2).
 * Valable à 0,01″ près sur ±1000 ans autour de 2000.
 */
export function meanObliquity(jdTT) {
  const U = centuriesSinceJ2000(jdTT) / 100;
  const seconds =
    21.448 -
    4680.93 * U -
    1.55 * U ** 2 +
    1999.25 * U ** 3 -
    51.38 * U ** 4 -
    249.67 * U ** 5 -
    39.05 * U ** 6 +
    7.12 * U ** 7 +
    27.87 * U ** 8 +
    5.79 * U ** 9 +
    2.45 * U ** 10;
  return 23 + 26 / 60 + seconds / 3600;
}
