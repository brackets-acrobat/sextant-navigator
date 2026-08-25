/**
 * Position apparente d'une étoile (Meeus, ch. 21 et 23).
 *
 * Chaîne complète, dans l'ordre :
 *   catalogue J2000 → mouvement propre → précession rigoureuse
 *                   → nutation → aberration annuelle
 *
 * Les quatre étapes comptent. Pour Arcturus, 26 ans de mouvement propre
 * déplacent la position de 0,9′, soit près d'un mille nautique sur la droite
 * de hauteur ; l'aberration vaut jusqu'à 20″ et la nutation jusqu'à 17″.
 */

import { centuriesSinceJ2000, norm360, sind, cosd, tand, asind, atan2d } from './time.js';
import { nutation } from './nutation.js';

const ARCSEC = 1 / 3600;
/** Constante d'aberration, en degrés. */
const KAPPA = 20.49552 * ARCSEC;

/**
 * Position apparente d'une étoile du catalogue.
 *
 * @param {import('./catalog.js').Star} star
 * @param {number} jdTT jour julien en Temps Terrestre
 * @returns {{ ra: number, dec: number }} en degrés
 */
export function starApparent(star, jdTT) {
  const T = centuriesSinceJ2000(jdTT);
  const years = T * 100;

  // --- 1. Mouvement propre, appliqué aux coordonnées J2000 -----------------
  const dec0Deg = star.decDeg + (star.pmDec * years) / 3.6e6;
  // µα* contient déjà cos δ : on le divise pour revenir à un Δα vrai.
  const ra0Deg =
    star.raHours * 15 + (star.pmRA * years) / 3.6e6 / cosd(star.decDeg);

  // --- 2. Précession rigoureuse de J2000 à la date (Meeus 21.3) -----------
  const zeta = (2306.2181 * T + 0.30188 * T ** 2 + 0.017998 * T ** 3) * ARCSEC;
  const z = (2306.2181 * T + 1.09468 * T ** 2 + 0.018203 * T ** 3) * ARCSEC;
  const theta = (2004.3109 * T - 0.42665 * T ** 2 - 0.041833 * T ** 3) * ARCSEC;

  const A = cosd(dec0Deg) * sind(ra0Deg + zeta);
  const B =
    cosd(theta) * cosd(dec0Deg) * cosd(ra0Deg + zeta) - sind(theta) * sind(dec0Deg);
  const C =
    sind(theta) * cosd(dec0Deg) * cosd(ra0Deg + zeta) + cosd(theta) * sind(dec0Deg);

  let ra = norm360(atan2d(A, B) + z);
  // Près des pôles, asin(C) perd sa précision : on passe par acos.
  let dec =
    Math.abs(dec0Deg) > 80
      ? Math.sign(C) * (Math.acos(Math.hypot(A, B)) * 180) / Math.PI
      : asind(C);

  // --- 3. Nutation (Meeus 23.1) -------------------------------------------
  const { dpsi, deps, eps } = nutation(jdTT);
  const dRaNut =
    (cosd(eps) + sind(eps) * sind(ra) * tand(dec)) * dpsi -
    cosd(ra) * tand(dec) * deps;
  const dDecNut = sind(eps) * cosd(ra) * dpsi + sind(ra) * deps;

  // --- 4. Aberration annuelle (Meeus 23.2) --------------------------------
  // Longitude vraie du Soleil et longitude du périhélie de l'orbite terrestre.
  const L0 = norm360(280.46646 + 36000.76983 * T + 0.0003032 * T * T);
  const M = norm360(357.52911 + 35999.05029 * T - 0.0001537 * T * T);
  const Ccentre =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * sind(M) +
    (0.019993 - 0.000101 * T) * sind(2 * M) +
    0.000289 * sind(3 * M);
  const sunLon = L0 + Ccentre;
  const e = 0.016708634 - 0.000042037 * T - 0.0000001267 * T * T;
  const periLon = 102.93735 + 1.71946 * T + 0.00046 * T * T;

  const dRaAbr =
    (-KAPPA * (cosd(ra) * cosd(sunLon) * cosd(eps) + sind(ra) * sind(sunLon))) /
      cosd(dec) +
    (e * KAPPA * (cosd(ra) * cosd(periLon) * cosd(eps) + sind(ra) * sind(periLon))) /
      cosd(dec);

  const dDecAbr =
    -KAPPA *
      (cosd(sunLon) * cosd(eps) * (tand(eps) * cosd(dec) - sind(ra) * sind(dec)) +
        cosd(ra) * sind(dec) * sind(sunLon)) +
    e *
      KAPPA *
      (cosd(periLon) * cosd(eps) * (tand(eps) * cosd(dec) - sind(ra) * sind(dec)) +
        cosd(ra) * sind(dec) * sind(periLon));

  return {
    ra: norm360(ra + dRaNut + dRaAbr),
    dec: dec + dDecNut + dDecAbr,
    raMean: ra,
    decMean: dec,
  };
}
