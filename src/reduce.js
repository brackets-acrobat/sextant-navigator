/**
 * Réduction de visée : passer d'une position de coordonnées célestes à une
 * droite de hauteur.
 *
 * Conventions retenues, celles de l'almanach :
 *   - GHA   angle horaire de Greenwich, compté vers l'OUEST, 0 à 360°
 *   - SHA   angle horaire sidéral d'une étoile = 360° − α
 *   - LHA   angle horaire local = GHA + longitude, longitude EST positive
 *   - Zn    azimut vrai, compté depuis le nord vers l'est, 0 à 360°
 *
 * Le sextant à bulle n'a ni dépression d'horizon ni demi-diamètre : la bulle
 * est l'horizon artificiel, et l'on pointe le CENTRE de l'astre. C'est ce qui
 * distingue les corrections de l'Air Almanac de celles du Nautical Almanac.
 */

import { norm360, sind, cosd, tand, asind, atan2d } from './time.js';

/** GHA d'un astre depuis le temps sidéral apparent et son ascension droite. */
export function ghaFromRa(gastDeg, raDeg) {
  return norm360(gastDeg - raDeg);
}

/** SHA d'une étoile depuis son ascension droite. */
export function shaFromRa(raDeg) {
  return norm360(360 - raDeg);
}

/** Angle horaire local. Longitude est positive, ouest négative. */
export function localHourAngle(ghaDeg, lonDeg) {
  return norm360(ghaDeg + lonDeg);
}

/**
 * Hauteur calculée et azimut vrai depuis une position estimée.
 * C'est le cœur de la réduction : ce que l'on DEVRAIT mesurer si l'on était
 * exactement à la position estimée.
 *
 * @returns {{ hc: number, zn: number }} en degrés
 */
export function computedAltitudeAzimuth(latDeg, decDeg, lhaDeg) {
  const sinHc =
    sind(latDeg) * sind(decDeg) + cosd(latDeg) * cosd(decDeg) * cosd(lhaDeg);
  const hc = asind(sinHc);

  // Forme vectorielle : pas de quadrant à lever à la main, pas de cas limite
  // au méridien.
  const y = -cosd(decDeg) * sind(lhaDeg);
  const x = cosd(latDeg) * sind(decDeg) - sind(latDeg) * cosd(decDeg) * cosd(lhaDeg);
  const zn = norm360(atan2d(y, x));

  return { hc, zn };
}

/**
 * Angle parallactique : de combien la verticale du lieu s'écarte du pôle, vu
 * depuis l'astre (Meeus 14.1).
 *
 * C'est la pièce qui manque pour porter dans le champ d'un instrument un angle
 * mesuré dans le ciel. L'angle de position du limbe éclairé de la Lune se
 * compte depuis le pôle nord céleste ; l'oculaire, lui, a le zénith en haut.
 * L'écart entre les deux est cet angle-là, et il change à chaque instant : la
 * même Lune, au même quartier, ne présente pas son croissant sous le même angle
 * au lever et au coucher. C'est ce que les vignettes figées ne savent pas faire.
 *
 * Compté depuis le nord vers l'est, comme un angle de position. Nul au passage
 * au méridien, positif à l'ouest.
 *
 * @param {number} latDeg latitude de l'observateur
 * @param {number} decDeg déclinaison de l'astre
 * @param {number} lhaDeg angle horaire local, compté vers l'ouest
 */
export function parallacticAngle(latDeg, decDeg, lhaDeg) {
  return atan2d(
    sind(lhaDeg),
    tand(latDeg) * cosd(decDeg) - sind(decDeg) * cosd(lhaDeg),
  );
}

/**
 * Atmosphère standard OACI, depuis une altitude-pression en pieds.
 * @returns {{ pressureHpa: number, tempC: number }}
 */
export function standardAtmosphere(altitudeFt) {
  if (altitudeFt <= 36089) {
    const tK = 288.15 - 0.0019812 * altitudeFt;
    return {
      pressureHpa: 1013.25 * (tK / 288.15) ** 5.255877,
      tempC: tK - 273.15,
    };
  }
  const tK = 216.65;
  return {
    pressureHpa: 226.32 * Math.exp(-0.0000480637 * (altitudeFt - 36089)),
    tempC: tK - 273.15,
  };
}

/**
 * Réfraction astronomique, en minutes d'arc (formule de Bennett).
 * Prend la hauteur APPARENTE et rend la correction à SOUSTRAIRE.
 *
 * En vol, la réfraction s'effondre avec la pression : au niveau de la mer elle
 * vaut 1,7′ à 30° de hauteur, mais seulement 1,2′ à 10 000 ft et 0,5′ à
 * 35 000 ft. L'ignorer serait une erreur de plusieurs milles.
 */
export function refraction(apparentAltDeg, pressureHpa = 1013.25, tempC = 10) {
  if (apparentAltDeg < -1) return 0;
  const h = Math.max(apparentAltDeg, -0.5);
  const r = 1 / tand(h + 7.31 / (h + 4.4)); // minutes d'arc, conditions normales
  return r * (pressureHpa / 1010) * (283 / (273 + tempC));
}

/**
 * Correction de Coriolis pour une visée prise en vol, en minutes d'arc.
 *
 * En vol rectiligne stabilisé, la force spécifique que « sent » la bulle vaut
 * f = 2(Ω × v) − g. Le terme de Coriolis, de module 2ΩV sin φ, est dirigé à
 * 90° à DROITE de la route dans l'hémisphère nord ; le fil à plomb bascule
 * donc vers la GAUCHE et le zénith apparent vers la DROITE de la route.
 *
 *   2ΩV sinφ / g  avec Ω = 7,292115e-5 rad/s
 *   → 0,0263 × V(kt) × sin(latitude)  minutes d'arc
 *
 * La valeur rendue est à AJOUTER à la hauteur mesurée. Le signe suit celui de
 * sin(latitude), donc l'hémisphère sud s'inverse tout seul.
 *
 * Recoupé contre la table « Correction for Coriolis Acceleration » du USAF
 * Celestial booklet, NIF 3-3-2, avril 1944. Au coin le plus extrême de la table
 * (75° de latitude, 400 kt) elle donne 10,17′, la formule ci-dessus 10,16′ ;
 * l'accord tient sur toute la grille 0-75° × 100-400 kt.
 *
 * Le signe vient du même document, mot pour mot : « Translate all lines right
 * in Northern Hemisphere, left in Southern Hemisphere, perpendicular to track. »
 * La correction est donc une TRANSLATION de la droite de hauteur entière, en
 * milles, et non une correction de hauteur — les deux se confondent
 * numériquement (1′ = 1 NM), mais c'est la translation qu'il faut présenter à
 * l'utilisateur. Projeter ce déplacement sur l'azimut de l'astre donne le
 * cos(Zn − (route + 90°)) ci-dessous, d'où l'effet maximal sur les visées par
 * le travers et nul sur les visées dans l'axe — ce que le document confirme :
 * « the correction is at a maximum on beam shots ».
 *
 * La correction de loxodromie (vol au cap constant plutôt qu'en orthodromie)
 * n'est PAS incluse : elle forme l'autre moitié de la table Z de l'Air Almanac,
 * sous le libellé « Coriolis & rhumb line » du formulaire de précalcul.
 */
export function coriolisCorrection(groundSpeedKt, latDeg, trackDeg, znDeg) {
  if (!groundSpeedKt) return 0;
  const magnitude = 0.0263 * groundSpeedKt * sind(latDeg);
  const tiltAzimuth = trackDeg + 90; // vers la droite de la route
  return magnitude * cosd(znDeg - tiltAzimuth);
}

/**
 * Chaîne de corrections d'un sextant à bulle : hauteur instrumentale → hauteur
 * vraie.
 *
 * @param {object} o
 * @param {number} o.hs           hauteur lue au sextant, en degrés
 * @param {number} o.indexError   erreur d'index, en minutes d'arc (à ajouter)
 * @param {number} [o.parallax]   parallaxe horizontale de l'astre, en degrés
 * @param {number} [o.pressureHpa]
 * @param {number} [o.tempC]
 * @param {number} [o.groundSpeedKt]
 * @param {number} [o.trackDeg]
 * @param {number} [o.latDeg]
 * @param {number} [o.znDeg]
 * @returns {{ ho: number, terms: Record<string, number> }}
 *          ho en degrés, termes détaillés en minutes d'arc.
 */
export function observedAltitude({
  hs,
  indexError = 0,
  parallax = 0,
  pressureHpa = 1013.25,
  tempC = 10,
  groundSpeedKt = 0,
  trackDeg = 0,
  latDeg = 0,
  znDeg = 0,
}) {
  const ha = hs + indexError / 60;

  const refr = -refraction(ha, pressureHpa, tempC);
  // Parallaxe en hauteur : sensible pour la Lune (jusqu'à 61′), négligeable
  // pour le Soleil (0,15′), nulle pour les étoiles.
  const par = parallax * 60 * cosd(ha);
  const cor = coriolisCorrection(groundSpeedKt, latDeg, trackDeg, znDeg);

  const totalMin = refr + par + cor;

  return {
    ho: ha + totalMin / 60,
    terms: {
      indexError,
      refraction: refr,
      parallax: par,
      coriolis: cor,
      total: indexError + totalMin,
    },
  };
}

/**
 * Chaîne inverse : hauteur vraie → hauteur que le tambour du sextant affichera.
 *
 * C'est la moitié du travail que `observedAltitude` ne fait pas, et le
 * simulateur en a besoin : il connaît la position réelle de l'appareil, donc la
 * hauteur vraie de l'astre, et doit rendre au joueur une lecture d'instrument
 * crédible — réfraction remise, parallaxe retirée, erreur d'index appliquée.
 *
 * La réfraction dépend de la hauteur apparente, qui dépend de la réfraction :
 * on itère. Quatre tours suffisent largement, la dérivée étant faible.
 *
 * @returns {number} hauteur instrumentale Hs, en degrés
 */
export function sextantReading({
  ho,
  indexError = 0,
  parallax = 0,
  pressureHpa = 1013.25,
  tempC = 10,
  groundSpeedKt = 0,
  trackDeg = 0,
  latDeg = 0,
  znDeg = 0,
}) {
  const cor = coriolisCorrection(groundSpeedKt, latDeg, trackDeg, znDeg);
  let ha = ho;
  for (let i = 0; i < 4; i += 1) {
    const totalMin =
      -refraction(ha, pressureHpa, tempC) + parallax * 60 * cosd(ha) + cor;
    ha = ho - totalMin / 60;
  }
  return ha - indexError / 60;
}

/**
 * Intercept de Marcq Saint-Hilaire.
 * @returns {{ interceptNm: number, toward: boolean, bearing: number }}
 *          distance en milles nautiques, et le cap le long duquel la reporter.
 */
export function intercept(hoDeg, hcDeg, znDeg) {
  const nm = (hoDeg - hcDeg) * 60;
  return {
    interceptNm: Math.abs(nm),
    signedNm: nm,
    toward: nm >= 0,
    bearing: nm >= 0 ? norm360(znDeg) : norm360(znDeg + 180),
  };
}

/**
 * Point observé par moindres carrés à partir de plusieurs droites de hauteur.
 *
 * Chaque droite impose, en milles nautiques depuis la position estimée :
 *   Δnord · cos(Zn) + Δest · sin(Zn) = intercept
 *
 * Deux droites donnent une solution exacte, trois donnent un chapeau et un
 * résidu — c'est ce résidu qui dit au navigateur si sa visée vaut quelque chose.
 *
 * @param {{ zn: number, signedNm: number }[]} lops
 * @param {{ lat: number, lon: number }} assumed
 * @returns {{ lat: number, lon: number, northNm: number, eastNm: number,
 *             residualsNm: number[], rmsNm: number }}
 */
export function fixFromLops(lops, assumed) {
  if (lops.length < 2) {
    throw new Error('Il faut au moins deux droites de hauteur pour un point.');
  }

  // Système normal 2×2 : Aᵀ A x = Aᵀ b
  let a11 = 0;
  let a12 = 0;
  let a22 = 0;
  let b1 = 0;
  let b2 = 0;

  for (const { zn, signedNm } of lops) {
    const cn = cosd(zn);
    const ce = sind(zn);
    a11 += cn * cn;
    a12 += cn * ce;
    a22 += ce * ce;
    b1 += cn * signedNm;
    b2 += ce * signedNm;
  }

  const det = a11 * a22 - a12 * a12;
  if (Math.abs(det) < 1e-9) {
    throw new Error(
      'Droites de hauteur parallèles ou trop proches : le point est indéterminé.',
    );
  }

  const northNm = (b1 * a22 - b2 * a12) / det;
  const eastNm = (a11 * b2 - a12 * b1) / det;

  const residualsNm = lops.map(
    ({ zn, signedNm }) => cosd(zn) * northNm + sind(zn) * eastNm - signedNm,
  );
  const rmsNm = Math.sqrt(
    residualsNm.reduce((s, r) => s + r * r, 0) / residualsNm.length,
  );

  const lat = assumed.lat + northNm / 60;
  const lon = assumed.lon + eastNm / 60 / cosd(assumed.lat);

  return { lat, lon, northNm, eastNm, residualsNm, rmsNm };
}

/** Formatage almanach : 123° 45,6′ */
export function formatAngle(deg, { minutesDecimals = 1 } = {}) {
  const sign = deg < 0 ? '-' : '';
  const a = Math.abs(deg);
  let d = Math.floor(a);
  let m = (a - d) * 60;
  if (m.toFixed(minutesDecimals) === (60).toFixed(minutesDecimals)) {
    d += 1;
    m = 0;
  }
  return `${sign}${d}° ${m.toFixed(minutesDecimals).padStart(minutesDecimals + 3, '0')}′`;
}

/** Formatage d'une déclinaison ou latitude : N 12° 34,5′ */
export function formatLatitude(deg) {
  return `${deg >= 0 ? 'N' : 'S'} ${formatAngle(Math.abs(deg))}`;
}

/** Formatage d'une longitude : E 012° 34,5′ */
export function formatLongitude(deg) {
  return `${deg >= 0 ? 'E' : 'W'} ${formatAngle(Math.abs(deg))}`;
}
