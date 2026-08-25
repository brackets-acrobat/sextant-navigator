/**
 * L'estime : où l'on croit être.
 *
 * Le point astronomique n'a de sens que par rapport à une estime, et l'estime
 * n'a de valeur que par ce qu'elle ignore. Un équipage connaît son CAP — il le
 * lit au compas — et sa VITESSE PROPRE — il la lit au badin. Il ne connaît ni
 * sa route sol ni sa vitesse sol : elles dépendent du vent, et le vent, il le
 * suppose. C'est de cette supposition que naît l'erreur, et c'est cette erreur
 * que la droite de hauteur révèle.
 *
 * Ce module ne contient donc QUE le triangle des vitesses direct. Il ne sait
 * rien du simulateur, et c'est volontaire : la vitesse sol vraie et la route
 * sol vraie existent quelque part dans le programme, à portée d'une ligne, et
 * il ne faut pas qu'elles puissent entrer ici. Une estime nourrie de la vérité
 * ne dérive jamais — et un jeu où l'estime ne dérive pas n'a plus d'objet.
 *
 * LE SENS INVERSE — trouver le cap à tenir pour suivre une route donnée — est
 * un autre problème, celui de la préparation du vol, et il vit côté application
 * dans `vent-plan.js`. Celui-ci est le problème du navigateur EN VOL : on a
 * tenu un cap pendant dix minutes, où est-on ?
 */

import { norm360, sind, cosd, atan2d } from './time.js';

/**
 * Le vent qu'on a SUBI, tiré d'un point observé. C'est le sens inverse du
 * triangle, et c'était l'autre métier du navigateur.
 *
 * LE PLOT AIR. Depuis une position connue, on tient un cap à une vitesse
 * propre : au bout d'une heure, on serait à tel endroit *s'il n'y avait pas de
 * vent*. Cet endroit fictif est la POSITION AIR, et on la construit sans rien
 * savoir du vent — cap et badin suffisent, deux lectures de cockpit. Le point
 * astronomique donne ensuite où l'on est vraiment. Le segment qui va de la
 * position air au point EST le déplacement dû au vent, et divisé par le temps
 * écoulé il donne sa force. Sa direction, retournée de 180°, donne d'où il
 * souffle.
 *
 * C'est pour cela que la droite de hauteur valait un poste entier : elle ne
 * rend pas seulement une position, elle rend le vent — et le vent est ce qui
 * permet de tenir l'estime jusqu'au point suivant.
 *
 * POURQUOI PAS « ESTIME MOINS POINT ». On pourrait comparer le point à l'estime
 * et corriger le vent supposé de l'écart : c'est équivalent, mais seulement si
 * le vent supposé est resté le même pendant tout l'intervalle. Le plot air ne
 * suppose rien du tout — il ignore le vent par construction, y compris celui
 * qu'on croyait. C'est plus court à expliquer et impossible à fausser.
 *
 * @param {object} o
 * @param {{lat:number, lon:number}} o.air  position AIR à l'instant du point
 * @param {{lat:number, lon:number}} o.fix  le point observé
 * @param {number} o.hours                  temps écoulé depuis l'ancrage
 * @param {number} [o.minKt=1]  en dessous, la direction n'a plus de sens : un
 *        déplacement d'un demi-mille sur une heure, c'est du bruit de mesure,
 *        et lui donner un azimut au dixième serait une invention.
 * @returns {{ windFromDeg: number|null, windKt: number, driftNm: number,
 *             towardDeg: number|null }|null}
 */
export function windFromAirPlot({ air, fix, hours, minKt = 1 } = {}) {
  const bon = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon);
  if (!bon(air) || !bon(fix) || !Number.isFinite(hours) || hours <= 0) return null;

  const dN = (fix.lat - air.lat) * 60;
  const dE = (fix.lon - air.lon) * 60 * cosd((fix.lat + air.lat) / 2);
  const driftNm = Math.hypot(dN, dE);
  const windKt = driftNm / hours;

  // Vent calme : la force est honnête, la direction ne l'est pas.
  if (windKt < minKt) {
    return { windFromDeg: null, windKt, driftNm, towardDeg: null };
  }
  const towardDeg = norm360(atan2d(dE, dN));
  return {
    // Convention des METAR et du simulateur : la direction D'OÙ VIENT le vent.
    // C'est l'opposé de celle vers laquelle il vous a poussé, et c'est
    // l'inversion qui fait les erreurs de 180°.
    windFromDeg: norm360(towardDeg + 180),
    windKt,
    driftNm,
    towardDeg,
  };
}

/**
 * Route sol et vitesse sol, à partir du cap tenu et du vent supposé.
 *
 * Addition vectorielle, rien de plus : le vecteur air (cap, vitesse propre)
 * plus le vecteur vent donnent le vecteur sol. Le seul piège est la convention
 * du vent, et c'est celui qui fait les erreurs de 180° : `windFromDeg` est la
 * direction D'OÙ VIENT le vent — celle des METAR, celle de MSFS — donc le
 * vecteur qui déplace l'avion pointe à l'opposé.
 *
 * @param {object} o
 * @param {number} o.headingTrue  cap VRAI tenu, en degrés
 * @param {number} o.tasKt        vitesse propre vraie, en nœuds
 * @param {number} [o.windFromDeg] direction d'où vient le vent, en degrés vrais
 * @param {number} [o.windKt]     force du vent, en nœuds
 * @returns {{ trackDeg: number, groundSpeedKt: number, driftDeg: number }}
 *          `driftDeg` est la dérive, positive quand le vent pousse à droite.
 */
export function groundVector({ headingTrue, tasKt, windFromDeg = 0, windKt = 0 }) {
  const tas = Number.isFinite(tasKt) ? tasKt : 0;
  const w = Number.isFinite(windKt) && windKt > 0 ? windKt : 0;
  const dir = Number.isFinite(windFromDeg) ? windFromDeg : 0;
  const cap = Number.isFinite(headingTrue) ? headingTrue : 0;

  // Composantes nord et est. Le vent SOUFFLE VERS `dir + 180`.
  const nord = tas * cosd(cap) - w * cosd(dir);
  const est = tas * sind(cap) - w * sind(dir);

  const gs = Math.sqrt(nord * nord + est * est);
  // Vitesse sol nulle — vent debout exactement égal à la vitesse propre, ou
  // avion arrêté : la route n'existe pas. On rend le cap, faute de mieux, et
  // une vitesse nulle qui ne déplacera rien.
  if (gs < 1e-9) return { trackDeg: norm360(cap), groundSpeedKt: 0, driftDeg: 0 };

  const track = norm360(atan2d(est, nord));
  // Écart route − cap, replié sur ±180 : c'est la dérive telle qu'on la lit.
  let derive = track - cap;
  derive = ((derive + 180) % 360 + 360) % 360 - 180;
  return { trackDeg: track, groundSpeedKt: gs, driftDeg: derive };
}
