/**
 * Échelles de temps et temps sidéral.
 *
 * Le simulateur fournit une date et une heure UTC. Toute la chaîne part de là :
 *   UTC → JD(UT1)  pour le temps sidéral (donc pour les GHA)
 *   UTC → JD(TT)   pour les positions des astres (Soleil, Lune)
 *
 * On confond UT1 et UTC : l'écart (DUT1) reste sous 0,9 s, soit moins de 0,004′
 * sur un GHA. Invisible pour un sextant à bulle.
 */

export const J2000 = 2451545.0;
export const DAYS_PER_CENTURY = 36525.0;

const DEG = Math.PI / 180;

/**
 * Normalise un angle en degrés dans [0, 360).
 *
 * Le garde-fou final n'est pas décoratif : pour un angle négatif infinitésimal,
 * `x + 360` arrondit à exactement 360 en double précision. Un azimut affiché
 * « 360° » au lieu de « 000° » est une coquille visible par l'utilisateur.
 */
export function norm360(deg) {
  let x = deg % 360;
  if (x < 0) x += 360;
  return x >= 360 ? 0 : x;
}

/** Normalise un angle en degrés dans [-180, 180). */
export function norm180(deg) {
  const x = norm360(deg + 180);
  return x - 180;
}

export const sind = (d) => Math.sin(d * DEG);
export const cosd = (d) => Math.cos(d * DEG);
export const tand = (d) => Math.tan(d * DEG);
export const asind = (x) => Math.asin(Math.max(-1, Math.min(1, x))) / DEG;
export const atan2d = (y, x) => Math.atan2(y, x) / DEG;

/**
 * Jour julien depuis une date du calendrier grégorien (Meeus, ch. 7).
 * Les mois sont 1-12. La fraction de jour est incluse.
 */
export function julianDay(year, month, day, hour = 0, minute = 0, second = 0) {
  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  const dayFraction = (hour + minute / 60 + second / 3600) / 24;
  return (
    Math.floor(365.25 * (y + 4716)) +
    Math.floor(30.6001 * (m + 1)) +
    day +
    dayFraction +
    B -
    1524.5
  );
}

/** Jour julien depuis un objet Date JavaScript, interprété en UTC. */
export function julianDayFromDate(date) {
  return julianDay(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds() + date.getUTCMilliseconds() / 1000,
  );
}

/** Siècles juliens depuis J2000. */
export function centuriesSinceJ2000(jd) {
  return (jd - J2000) / DAYS_PER_CENTURY;
}

/**
 * ΔT = TT − UT, en secondes. Polynômes d'Espenak & Meeus (NASA).
 *
 * Ce n'est pas un problème de formule mais de physique : la rotation de la
 * Terre n'est pas prévisible. Les branches couvrent 1900-2150 à mieux qu'une
 * seconde ; au-delà, la formule séculaire générique prend le relais et l'on
 * sort du domaine garanti (voir `epoch.js`).
 *
 * L'enjeu reste modeste : 1 s de ΔT déplace la Lune de 0,009′ et le Soleil de
 * 0,0007′. Même dix secondes d'erreur passent inaperçues au sextant à bulle.
 * Les branches d'avant 1961 servent surtout aux scénarios historiques, où l'on
 * veut que la Lune de 1943 soit à sa vraie place.
 */
export function deltaT(year, month = 1) {
  const y = year + (month - 0.5) / 12;

  if (y >= 2005 && y < 2050) {
    const t = y - 2000;
    return 62.92 + 0.32217 * t + 0.005589 * t * t;
  }
  if (y >= 1986 && y < 2005) {
    const t = y - 2000;
    return (
      63.86 +
      0.3345 * t -
      0.060374 * t ** 2 +
      0.0017275 * t ** 3 +
      0.000651814 * t ** 4 +
      0.00002373599 * t ** 5
    );
  }
  if (y >= 2050 && y < 2150) {
    const u = (y - 1820) / 100;
    return -20 + 32 * u * u - 0.5628 * (2150 - y);
  }
  if (y >= 1961 && y < 1986) {
    const t = y - 1975;
    return 45.45 + 1.067 * t - t ** 2 / 260 - t ** 3 / 718;
  }
  if (y >= 1941 && y < 1961) {
    const t = y - 1950;
    return 29.07 + 0.407 * t - t ** 2 / 233 + t ** 3 / 2547;
  }
  if (y >= 1920 && y < 1941) {
    const t = y - 1920;
    return 21.2 + 0.84493 * t - 0.0761 * t ** 2 + 0.0020936 * t ** 3;
  }
  if (y >= 1900 && y < 1920) {
    const t = y - 1900;
    return (
      -2.79 +
      1.494119 * t -
      0.0598939 * t ** 2 +
      0.0061966 * t ** 3 -
      0.000197 * t ** 4
    );
  }
  // Hors du domaine garanti : formule séculaire générique, à quelques dizaines
  // de secondes près.
  const u = (y - 1820) / 100;
  return -20 + 32 * u * u;
}

/** Jour julien en Temps Terrestre, depuis un JD en UT. */
export function jdToTT(jdUT, year, month) {
  return jdUT + deltaT(year, month) / 86400;
}

/**
 * Temps sidéral moyen de Greenwich, en degrés (Meeus 12.4).
 * Prend un JD en UT (pas en TT).
 */
export function gmst(jdUT) {
  const T = centuriesSinceJ2000(jdUT);
  const theta =
    280.46061837 +
    360.98564736629 * (jdUT - J2000) +
    0.000387933 * T * T -
    (T * T * T) / 38710000;
  return norm360(theta);
}

/**
 * Temps sidéral apparent de Greenwich, en degrés.
 * GAST = GMST + équation des équinoxes = GMST + Δψ·cos(ε).
 *
 * @param {number} jdUT  jour julien en UT
 * @param {number} dpsi  nutation en longitude, en degrés
 * @param {number} eps   obliquité vraie, en degrés
 */
export function gast(jdUT, dpsi, eps) {
  return norm360(gmst(jdUT) + dpsi * cosd(eps));
}

/**
 * Angle horaire de Greenwich du point vernal, en degrés.
 * C'est le « GHA Aries » de l'almanach : il vaut exactement le temps sidéral
 * apparent de Greenwich, compté vers l'ouest.
 */
export const ghaAries = gast;
