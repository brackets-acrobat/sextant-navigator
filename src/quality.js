/**
 * Qualité géométrique d'un point : l'angle de coupe, et ce qu'il coûte.
 *
 * Une droite de hauteur ne donne pas une position, elle donne une ligne. Le
 * point naît du croisement, et tout tient à l'angle sous lequel les lignes se
 * coupent. Deux droites presque parallèles se coupent quelque part, mais où
 * exactement, personne ne le sait : la minute d'arc d'erreur qui déplace chaque
 * droite d'un mille en déplace l'intersection de plusieurs.
 *
 * C'est le critère qui décide de la valeur d'un point AVANT la qualité de la
 * visée — un chapeau minuscule sur trois astres mal répartis vaut moins qu'un
 * grand chapeau sur trois astres bien ouverts. Aucune table d'almanach ne
 * l'affiche : le navigateur l'estimait à l'œil sur sa rose, en cherchant deux
 * astres à 90° l'un de l'autre, ou trois à 120°.
 *
 * Tout ce module ne travaille que sur des AZIMUTS. Ni les hauteurs, ni les
 * intercepts, ni l'heure n'entrent dans la géométrie du croisement : on peut
 * donc juger un jeu d'astres avant d'en avoir visé un seul, et c'est bien à ce
 * moment-là que le choix se fait.
 */

import { norm360, sind, cosd } from './time.js';

/**
 * Angle sous lequel deux droites de hauteur se coupent, de 0 à 90°.
 *
 * La droite est PERPENDICULAIRE à l'azimut, donc l'angle de croisement est
 * l'écart des azimuts. Et comme une droite n'a pas de sens — deux astres
 * opposés à 180° donnent deux droites PARALLÈLES, pas un beau croisement —
 * l'écart se replie sur 0-90 : 170° d'écart valent 10° de coupe, et 90° reste
 * le maximum.
 */
export function cutAngle(znA, znB) {
  const d = norm360(znA - znB) % 180;
  return d > 90 ? 180 - d : d;
}

/**
 * Coupe idéale pour n droites également réparties, en degrés.
 *
 * Les azimuts se replient sur un demi-tour : n directions au mieux étalées se
 * partagent donc 180°, pas 360. Deux astres à 90°, trois à 60° — c'est-à-dire
 * les trois à 120° d'azimut, la règle du navigateur, qui donne bien 60° de
 * coupe entre chaque paire.
 */
export function idealCut(count) {
  return count >= 2 ? 180 / count : null;
}

/**
 * Dilution minimale atteignable avec n droites, pour normaliser.
 * Voir `fixQuality` : 1,41 à deux astres, 1,15 à trois, 1,00 à quatre.
 */
export function idealDilution(count) {
  return count >= 2 ? 2 / Math.sqrt(count) : null;
}

/**
 * Ce que la géométrie fait subir à l'erreur des visées.
 *
 * Chaque visée porte une erreur le long de son azimut — c'est l'intercept qui
 * se trompe, donc la droite qui glisse parallèlement à elle-même. En posant
 * pour chaque astre la direction (cos Zn, sin Zn), les moindres carrés donnent
 * la covariance du point : σ² (AᵀA)⁻¹. L'erreur du point, en distance, vaut
 * donc σ × √tr(AᵀA)⁻¹.
 *
 * Ce facteur est ce que rend `dilution` : **le nombre par lequel l'erreur d'une
 * visée est multipliée pour donner l'erreur du point**. Il ne descend jamais
 * sous 1 — croiser des droites ne crée pas de précision — et il explose quand
 * les astres se rapprochent en azimut : deux astres à 20° de coupe donnent 4,1,
 * à 10° ils donnent 8,1. Une erreur d'une minute d'arc, soit un mille, en fait
 * huit sur la carte.
 *
 * L'hypothèse est celle du calcul de moindres carrés : erreurs indépendantes et
 * de même écart-type d'une visée à l'autre. C'est raisonnable pour un sextant à
 * bulle, où l'erreur dominante est la moyenne de la bulle sur deux minutes, la
 * même pour tous les astres. Elle le serait moins près de l'horizon, où la
 * réfraction devient incertaine — raison de plus pour ne pas y viser.
 *
 * @param {number[]} azimuths azimuts vrais, en degrés
 * @returns {{ count: number, cutMin: number|null, dilution: number|null }}
 *          `cutMin` est la plus petite coupe entre deux droites du jeu : c'est
 *          elle qui commande, une seule paire pincée gâte tout le point.
 *          `dilution` vaut Infinity si les droites sont parallèles.
 */
export function fixQuality(azimuths) {
  const az = (azimuths || []).filter((z) => Number.isFinite(z));
  if (az.length < 2) return { count: az.length, cutMin: null, dilution: null };

  let cutMin = 90;
  for (let i = 0; i < az.length; i += 1) {
    for (let j = i + 1; j < az.length; j += 1) {
      const c = cutAngle(az[i], az[j]);
      if (c < cutMin) cutMin = c;
    }
  }

  // Matrice normale AᵀA, montée à la main : elle est 2×2, son inverse tient en
  // une division, et la trace de l'inverse vaut (sxx + syy) / det.
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const z of az) {
    const c = cosd(z);
    const s = sind(z);
    sxx += c * c;
    sxy += c * s;
    syy += s * s;
  }
  const det = sxx * syy - sxy * sxy;

  return {
    count: az.length,
    cutMin,
    // Déterminant nul : toutes les droites sont parallèles, il n'y a pas de
    // point. Le cas se produit vraiment — deux visées du même astre à quelques
    // minutes d'intervalle, ce qui est la faute classique du débutant.
    dilution: det <= 1e-12 ? Infinity : Math.sqrt((sxx + syy) / det),
  };
}

/**
 * Le meilleur jeu d'astres à prendre parmi ceux qui sont visibles.
 *
 * Le critère est la dilution, pas la coupe : c'est le même classement dans les
 * cas simples, mais la dilution sait départager là où la coupe minimale
 * plafonne — trois astres à 118°, 120° et 122° d'azimut ont tous 58 à 60° de
 * coupe, seule la dilution dit lequel des jeux est le meilleur.
 *
 * À géométrie équivalente (1 % près, ce que l'œil ne distingue pas sur la
 * carte), on préfère les astres BRILLANTS. Ce n'est pas de la coquetterie : un
 * astre qu'on met deux minutes à trouver dans le champ est un astre qu'on vise
 * mal, et la magnitude est le seul indice qu'on ait de sa facilité. La
 * géométrie passe d'abord, la trouvabilité tranche.
 *
 * La recherche est exhaustive. À trois astres parmi la soixantaine que le ciel
 * peut offrir au mieux, cela fait 34 000 combinaisons de trois cosinus : c'est
 * une milliseconde, et l'exhaustivité évite d'avoir à défendre une heuristique.
 *
 * @param {Array<{name: string, zn: number, magnitude?: number}>} bodies
 * @param {{ size?: number }} [options]
 * @returns {{ bodies: Array, names: string[], cutMin: number, dilution: number }|null}
 */
export function bestFixSet(bodies, { size = 3 } = {}) {
  const list = (bodies || []).filter((b) => b && Number.isFinite(b.zn));
  if (size < 2 || list.length < size) return null;

  let best = null;
  const choix = new Array(size);

  const eclat = (set) => set.reduce((s, b) => s + (Number.isFinite(b.magnitude) ? b.magnitude : 6), 0);

  const explorer = (depart, rang) => {
    if (rang === size) {
      const q = fixQuality(choix.map((b) => b.zn));
      if (!best) {
        best = { set: choix.slice(), q, mag: eclat(choix) };
        return;
      }
      // Plus la dilution est basse, mieux c'est. L'égalité à 1 % près se
      // tranche à la magnitude (plus basse = plus brillante).
      const mieux = q.dilution < best.q.dilution * 0.99
        || (q.dilution < best.q.dilution * 1.01 && eclat(choix) < best.mag);
      if (mieux) best = { set: choix.slice(), q, mag: eclat(choix) };
      return;
    }
    for (let i = depart; i <= list.length - (size - rang); i += 1) {
      choix[rang] = list[i];
      explorer(i + 1, rang + 1);
    }
  };
  explorer(0, 0);

  if (!best) return null;
  return {
    bodies: best.set,
    names: best.set.map((b) => b.name),
    cutMin: best.q.cutMin,
    dilution: best.q.dilution,
  };
}
