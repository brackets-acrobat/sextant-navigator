/**
 * La planchette de report : où tombe chaque trait sur la feuille.
 *
 * Ce module ne dessine rien. Il place. Il reçoit un point observé et les
 * droites qui l'ont produit, et il rend des coordonnées en MILLES sur une
 * feuille blanche centrée sur l'estime — à charge du renderer d'en faire des
 * pixels. La séparation n'est pas de la coquetterie : le jour où l'on voudra
 * tracer à la main, au rapporteur et au compas à pointes sèches, c'est cette
 * couche-là qu'il faudra garder et l'autre qu'il faudra refaire.
 *
 * POURQUOI UNE FEUILLE ET PAS UNE CARTE. Le navigateur ne trace pas sur sa
 * carte : il trace sur une feuille de position. Au-dessus de l'océan, de nuit,
 * la carte n'a rien à montrer ; et surtout l'échelle utile n'est pas la sienne.
 * Un intercept fait quelques milles, une carte en couvre mille. Le point
 * observé, lui, se reporte ensuite sur la carte — c'est le partage historique
 * du travail, et c'est celui qu'on respecte ici.
 *
 * L'ORIGINE EST L'ESTIME, à l'instant commun. Tout ce qui est tracé est un
 * ÉCART à elle : c'est le sens même de la méthode de Marcq Saint-Hilaire, où
 * une droite de hauteur ne donne pas une position mais une correction à une
 * position supposée. Une feuille centrée sur autre chose raconterait autre
 * chose.
 *
 * TOUTES LES DROITES PARTENT DE L'ORIGINE, y compris quand les visées sont
 * étalées dans le temps — et c'est le point qu'il ne faut pas se tromper à
 * dessiner. Le noyau transporte en DÉPLAÇANT L'ESTIME : chaque visée est
 * réduite depuis l'endroit où l'on était à son heure, si bien que son intercept
 * est déjà rapporté à l'instant commun. Le repère entier a suivi l'avion. Sur
 * la feuille, la course parcourue n'est donc pas une chaîne de points d'où
 * partiraient les droites : c'est une information de CONTEXTE, qu'on trace en
 * clair parce qu'elle explique de combien les droites ont bougé — et rien de
 * plus.
 *
 * Repère de la feuille : `x` vers l'EST, `y` vers le NORD, en milles nautiques.
 * C'est le repère du navigateur, pas celui de l'écran — au renderer de
 * retourner `y`, une seule fois, au moment de peindre.
 */

import { sind, cosd, atan2d, norm360 } from './time.js';

/** Pas de graduation « ronds » : ceux qu'une règle porte vraiment. */
const PAS = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];

/**
 * Vecteur unitaire de l'azimut, dans le repère de la feuille.
 * C'est la direction de l'astre, donc la direction de l'intercept.
 */
function versAstre(zn) {
  return { x: sind(zn), y: cosd(zn) };
}

/**
 * Vecteur unitaire de la DROITE elle-même, perpendiculaire à l'azimut.
 * Une droite de hauteur n'a pas de sens : celui-ci est arbitraire, choisi pour
 * que le couple (astre, droite) tourne dans le sens direct.
 */
function leLongDeLaDroite(zn) {
  return { x: cosd(zn), y: -sind(zn) };
}

/**
 * Une droite de hauteur, sous la forme dont on a besoin partout : `u·P = c`.
 *
 * `u` est la direction de l'astre, `c` la distance signée de l'origine à la
 * droite comptée le long de cette direction — c'est-à-dire l'intercept
 * lui-même. Toute la géométrie qui suit tient dans ces deux nombres.
 */
function forme(lop) {
  return { u: versAstre(lop.zn), c: lop.signedNm, zn: lop.zn };
}

/** Intersection de deux droites de hauteur. `null` si elles sont parallèles. */
export function lopIntersection(a, b) {
  const A = forme(a);
  const B = forme(b);
  // Le déterminant vaut sin(Za − Zb) : il s'annule quand les deux astres sont
  // dans le même azimut ou opposés — deux droites parallèles, pas de sommet.
  const det = sind(a.zn - b.zn);
  if (Math.abs(det) < 1e-9) return null;
  return {
    x: (A.c * B.u.y - B.c * A.u.y) / det,
    y: (B.c * A.u.x - A.c * B.u.x) / det,
  };
}

/**
 * Le chapeau : le polygone des intersections deux à deux.
 *
 * ATTENTION À CE QU'IL DIT — et c'est la raison pour laquelle on le trace au
 * lieu de se contenter du chiffre. Il mesure la CONCORDANCE des droites, pas la
 * justesse du point. Une erreur commune à toutes les visées — une erreur
 * d'index mal estimée, une heure fausse — le resserre tout en déplaçant le
 * point. On a mesuré le cas : trois droites concourantes à 0,02 NM autour d'un
 * point faux de 6,9. Un beau triangle n'est pas une preuve, et il faut le voir
 * pour le croire.
 *
 * À plus de trois droites il n'y a plus de triangle mais un polygone à
 * n(n−1)/2 sommets, ce qui est le cas réel dès qu'on vise quatre astres.
 */
export function cockedHat(lops) {
  const sommets = [];
  for (let i = 0; i < lops.length; i += 1) {
    for (let j = i + 1; j < lops.length; j += 1) {
      const p = lopIntersection(lops[i], lops[j]);
      if (p) sommets.push(Object.assign({ de: [lops[i].body, lops[j].body] }, p));
    }
  }
  if (sommets.length < 3) return sommets.length ? { vertices: sommets, maxSideNm: 0 } : null;

  // Le côté le plus long : c'est la mesure du chapeau qu'un navigateur lit à la
  // règle. Elle ne remplace pas le chiffre du chapeau — l'écart quadratique des
  // résidus — mais c'est celle qu'on voit.
  let maxSide = 0;
  for (let i = 0; i < sommets.length; i += 1) {
    for (let j = i + 1; j < sommets.length; j += 1) {
      const d = Math.hypot(sommets[i].x - sommets[j].x, sommets[i].y - sommets[j].y);
      if (d > maxSide) maxSide = d;
    }
  }
  return { vertices: sommets, maxSideNm: maxSide };
}

/** Le pas de graduation le plus fin qui ne fasse pas plus de ~10 divisions. */
function pasPour(spanNm) {
  for (const p of PAS) if (spanNm / p <= 10) return p;
  return PAS[PAS.length - 1];
}

/** Position d'un point géographique dans le repère de la feuille. */
function versFeuille(p, origine) {
  return {
    x: (p.lon - origine.lon) * 60 * cosd(origine.lat),
    y: (p.lat - origine.lat) * 60,
  };
}

/**
 * Dresse la feuille.
 *
 * @param {object} o
 * @param {{lat:number, lon:number}} o.assumed  l'estime À L'INSTANT COMMUN :
 *        c'est l'origine, et tout le reste est un écart à elle.
 * @param {{lat:number, lon:number}} o.fix      le point observé
 * @param {Array<{body:string, zn:number, signedNm:number, ap?:object, utc?:string}>} o.lops
 *        les droites qui ont produit le point — celles que `fixFromSights` rend.
 * @param {Array<object>} [o.ghosts]  les mêmes droites SANS transport, pour le
 *        tracé fantôme. C'est la comparaison la plus instructive de la
 *        planchette : on voit ce que le transport a déplacé.
 * @param {boolean} [o.includeRun=false]  cadrer assez large pour montrer toute
 *        la course parcourue. À vingt minutes d'étalement elle fait cinquante
 *        milles quand les intercepts en font trois : les deux ne tiennent pas
 *        lisiblement sur la même feuille, d'où deux cadrages.
 * @param {number} [o.marginNm]  marge ajoutée autour de ce qu'on cadre.
 */
export function plotSheet({ assumed, fix, lops, ghosts = null, includeRun = false, marginNm } = {}) {
  if (!assumed || !lops || lops.length < 1) return null;

  const droites = lops.map((l) => {
    const u = versAstre(l.zn);
    const v = leLongDeLaDroite(l.zn);
    return {
      body: l.body,
      utc: l.utc === undefined ? null : l.utc,
      zn: l.zn,
      interceptNm: Math.abs(l.signedNm),
      // Le sens que le navigateur porte sur sa feuille : VERS l'astre si l'on a
      // mesuré plus haut que calculé, à l'opposé sinon.
      toward: l.signedNm >= 0,
      // Le pied de l'intercept : le point d'où part la droite, sur l'azimut.
      foot: { x: u.x * l.signedNm, y: u.y * l.signedNm },
      u,
      v,
      // La course de cette visée : où l'on était à son heure. Contexte, jamais
      // origine du tracé — voir l'en-tête du fichier.
      ap: l.ap ? versFeuille(l.ap, assumed) : null,
      runNm: Number.isFinite(l.runNm) ? l.runNm : null,
    };
  });

  const chapeau = droites.length >= 2 ? cockedHat(lops) : null;
  const point = fix ? versFeuille(fix, assumed) : null;

  // Ce que la feuille doit contenir. L'origine en fait toujours partie : une
  // planchette qui ne montrerait pas l'estime perdrait le sens de tout ce qui
  // s'y trace.
  const aCadrer = [{ x: 0, y: 0 }];
  for (const d of droites) aCadrer.push(d.foot);
  if (point) aCadrer.push(point);
  if (chapeau) for (const s of chapeau.vertices) aCadrer.push(s);
  if (includeRun) for (const d of droites) if (d.ap) aCadrer.push(d.ap);

  let rayon = 0;
  for (const p of aCadrer) rayon = Math.max(rayon, Math.abs(p.x), Math.abs(p.y));
  // Une feuille ne peut pas avoir un rayon nul : des visées parfaites depuis
  // une estime juste donnent tout à l'origine, et il faut quand même une
  // échelle pour dessiner la croix.
  if (rayon < 0.5) rayon = 0.5;
  const marge = Number.isFinite(marginNm) ? marginNm : rayon * 0.25;
  const demiEtendue = rayon + marge;
  const pas = pasPour(demiEtendue * 2);

  // Les droites sont tracées d'un bord à l'autre de la feuille : une droite de
  // hauteur n'a pas d'extrémités, et la tronquer autour de son pied laisserait
  // croire qu'elle en a. La demi-longueur est la diagonale de la feuille, ce
  // qui garantit la traversée quel que soit l'azimut.
  const demiLongueur = demiEtendue * Math.SQRT2;
  for (const d of droites) {
    d.a = { x: d.foot.x - d.v.x * demiLongueur, y: d.foot.y - d.v.y * demiLongueur };
    d.b = { x: d.foot.x + d.v.x * demiLongueur, y: d.foot.y + d.v.y * demiLongueur };
  }

  let fantomes = null;
  if (ghosts && ghosts.length) {
    fantomes = ghosts.map((l) => {
      const u = versAstre(l.zn);
      const v = leLongDeLaDroite(l.zn);
      const foot = { x: u.x * l.signedNm, y: u.y * l.signedNm };
      return {
        body: l.body,
        zn: l.zn,
        foot,
        a: { x: foot.x - v.x * demiLongueur, y: foot.y - v.y * demiLongueur },
        b: { x: foot.x + v.x * demiLongueur, y: foot.y + v.y * demiLongueur },
      };
    });
  }

  return {
    origin: { lat: assumed.lat, lon: assumed.lon },
    /** Demi-étendue de la feuille, en milles : elle couvre ±`halfSpanNm`. */
    halfSpanNm: demiEtendue,
    /** Pas des graduations de l'échelle, en milles. */
    stepNm: pas,
    droites,
    fantomes,
    chapeau,
    point,
    /**
     * De l'estime au point : ce que la visée a corrigé. C'est le seul chiffre
     * que le navigateur reporte ensuite sur sa carte, et il se lit en
     * relèvement et distance, pas en latitude et longitude.
     */
    correction: point
      ? { nm: Math.hypot(point.x, point.y), bearing: norm360(atan2d(point.x, point.y)) }
      : null,
  };
}
