/**
 * L'étalonnage : ce que vaut VOTRE exemplaire, et ce que vaut votre main.
 *
 * L'AFM 51-40 est catégorique — l'erreur d'index et l'erreur personnelle sont
 * inséparables, et l'on ne mesure jamais que leur somme. La procédure de la
 * « courbe Hc » consiste à viser depuis une position CONNUE et à comparer la
 * hauteur observée à la hauteur calculée : la différence est l'erreur du
 * sextant, la correction est son opposé.
 *
 * CE QUE LE MANUEL NE DIT PAS, ET QU'UN VOL RÉEL A APPRIS. Une série de visées
 * depuis un point connu ne mesure pas seulement l'instrument : elle mesure aussi
 * le RETARD DE MANIVELLE. L'intégrateur moyenne la position du tambour, pas la
 * vérité du ciel ; si l'astre descend de dix minutes d'arc par minute et que la
 * molette ne le suit pas, la moyenne est trop haute d'autant. Sur six visées
 * réelles, l'écart tenu pour « erreur d'index de +6′ » n'était que le retard sur
 * Arcturus, qui descendait à 10,9′/min. Altair, lent, tombait juste les deux
 * fois. La dispersion passait de ±6,0′ à ±1,3′ dès qu'on modélisait le retard.
 *
 * D'où la règle qui gouverne ce module : **on étalonne sur des astres LENTS**.
 * Un astre au méridien ne monte ni ne descend — sa vitesse verticale vaut
 * 15,04 × cos(latitude) × sin(Zn), donc elle s'annule au nord et au sud, et
 * culmine au plein est et au plein ouest. Le navigateur qui étalonne cherche
 * donc le méridien, exactement comme celui qui prend une latitude.
 *
 * ET CE QUE LA SÉRIE PEUT DIRE EN PLUS. Si les visées couvrent une gamme de
 * vitesses, l'erreur de chacune s'écrit
 *
 *     erreur = E − (τ/60) × vitesse
 *
 * où E est l'erreur du sextant, τ le retard en secondes, et la vitesse est
 * signée (positive si l'astre monte). C'est une droite : sa hauteur à l'origine
 * donne E débarrassé du retard, sa pente donne τ. Une régression sur toute la
 * série rend donc les deux nombres — l'instrument ET le geste — là où la moyenne
 * des astres lents ne rend que le premier. Le prix est un bras de levier : sans
 * astres rapides dans la série, la pente n'est pas déterminée. On ne peut pas
 * avoir les deux à la fois, et ce module dit lequel il a.
 *
 * Ce fichier ne fait AUCUNE astronomie : il reçoit des erreurs et des vitesses
 * déjà calculées, et il en tire des nombres. L'assemblage avec l'éphéméride est
 * dans `index.js` (`calibrationSeries`), comme la géométrie du point est dans
 * `quality.js` et son assemblage dans `fixFromSights`.
 */

/**
 * Au-delà de cette vitesse verticale, une visée n'étalonne plus l'instrument :
 * elle mesure la main. La valeur est celle de la colonne « ′/min » du catalogue
 * d'astres — les deux DOIVENT rester d'accord, sinon un astre affiché « lent »
 * au moment du choix se verrait écarté à la mesure, sans que rien ne l'explique.
 */
export const SLOW_RATE_MIN_PER_MIN = 3;

/**
 * Combien de visées avant d'adopter. L'AFM demande une cinquantaine de visées
 * simples, ou une dizaine de visées moyennées d'au moins une minute. Notre
 * intégrateur fait la moyenne, donc c'est la seconde règle qui s'applique : six
 * pour se prononcer, dix pour une série complète.
 */
export const MIN_SIGHTS = 6;
export const FULL_SERIES = 10;

/**
 * Étendue de vitesses au-dessous de laquelle la pente n'a pas de bras de levier.
 *
 * Six visées toutes à 1′/min donnent une droite dont la pente est un bruit :
 * l'ajustement passera par n'importe quoi. Quatre minutes d'arc par minute
 * d'écart entre la plus lente et la plus rapide, c'est le minimum pour que le
 * retard sorte du bruit — et cela se trouve sans effort, un astre au méridien et
 * un astre au plein est suffisent.
 */
const MIN_RATE_SPAN = 4;

/** Moyenne, écart-type d'échantillon, et incertitude sur la moyenne. */
function stats(values) {
  const n = values.length;
  if (!n) return { n: 0, meanMin: null, sdMin: null, seMin: null };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  if (n < 2) return { n, meanMin: mean, sdMin: null, seMin: null };
  const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  return { n, meanMin: mean, sdMin: sd, seMin: sd / Math.sqrt(n) };
}

/**
 * Droite des moindres carrés y = a + b·x, avec les incertitudes.
 *
 * Écrite ici plutôt qu'importée : elle tient en douze lignes, et la seule chose
 * qui compte est qu'on rende AUSSI les incertitudes. Une pente sans son
 * incertitude est une invitation à croire un retard de quarante secondes mesuré
 * sur trois visées serrées.
 */
function regress(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxx = 0;
  let sxy = 0;
  for (let i = 0; i < n; i += 1) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
  }
  if (sxx <= 1e-9) return null;          // toutes les visées à la même vitesse
  const slope = sxy / sxx;
  const intercept = my - slope * mx;

  // Écart-type des résidus : n − 2 degrés de liberté, deux paramètres ajustés.
  let ss = 0;
  for (let i = 0; i < n; i += 1) ss += (ys[i] - (intercept + slope * xs[i])) ** 2;
  const sdResid = n > 2 ? Math.sqrt(ss / (n - 2)) : 0;

  return {
    n,
    slope,
    intercept,
    sdResid,
    seSlope: sdResid / Math.sqrt(sxx),
    seIntercept: sdResid * Math.sqrt(1 / n + (mx * mx) / sxx),
  };
}

/**
 * Ce qu'une série de visées dit de l'instrument.
 *
 * @param {Array<{ errorMin: number, rateMinPerMin: number }>} rows
 *        une entrée par visée retenue par le navigateur : l'erreur Ho − Hc en
 *        minutes d'arc, mesurée depuis la position connue avec une correction
 *        d'index NULLE, et la vitesse verticale SIGNÉE de l'astre à cet instant.
 * @param {object} [options]
 * @param {number} [options.maxRate]   seuil de l'astre « lent »
 * @param {number} [options.minCount]  visées nécessaires pour adopter
 * @returns {object} voir `methode` : c'est elle qui dit lequel des trois
 *          calculs a été retenu, et le reste est là pour qu'on puisse en juger.
 */
export function indexErrorFromSeries(rows, { maxRate = SLOW_RATE_MIN_PER_MIN, minCount = MIN_SIGHTS } = {}) {
  const bonnes = (rows || []).filter(
    (r) => r && Number.isFinite(r.errorMin) && Number.isFinite(r.rateMinPerMin),
  );

  const erreurs = bonnes.map((r) => r.errorMin);
  const vitesses = bonnes.map((r) => r.rateMinPerMin);
  const lentes = bonnes.filter((r) => Math.abs(r.rateMinPerMin) <= maxRate);

  const brut = stats(erreurs);
  const lents = Object.assign(stats(lentes.map((r) => r.errorMin)), {
    maxRate,
    // La plus grande vitesse effectivement retenue. Ce n'est pas le seuil : une
    // série faite à 0,2′/min et une série faite à 2,9′/min passent toutes deux
    // le filtre et ne valent pas la même chose. Quand la pente n'est pas
    // mesurable — le cas d'une bonne série, justement, puisqu'elle n'a pas
    // d'astre rapide — c'est le seul chiffre qui dise ce qu'on risque encore.
    maxAbsRate: lentes.length ? Math.max(...lentes.map((r) => Math.abs(r.rateMinPerMin))) : null,
  });

  // La régression ne se tente que si la série a un bras de levier. Sans lui,
  // rendre une pente serait rendre du bruit avec trois décimales.
  const span = vitesses.length
    ? Math.max(...vitesses) - Math.min(...vitesses)
    : 0;
  const droite = span >= MIN_RATE_SPAN ? regress(vitesses, erreurs) : null;
  const retard = droite
    ? {
      n: droite.n,
      // La hauteur à l'origine EST l'erreur du sextant : c'est ce que vaudrait
      // une visée sur un astre parfaitement immobile, donc un astre au méridien.
      erreurMin: droite.intercept,
      seErreurMin: droite.seIntercept,
      // erreur = E − (τ/60) × vitesse : la pente vaut −τ/60, donc τ = −60 × pente.
      // Un retard POSITIF est un tambour en retard sur le ciel — le cas normal,
      // celui de la main qui manivelle trop tard. Un retard négatif n'a pas de
      // sens physique et signale une série trop bruitée pour dire quoi que ce soit.
      retardS: -60 * droite.slope,
      seRetardS: 60 * droite.seSlope,
      sdResidMin: droite.sdResid,
      spanRate: span,
    }
    : null;

  // Un retard n'est « connu » que si son incertitude est plus petite que
  // lui-même : sinon on a mesuré zéro avec des barres d'erreur.
  const retardConnu = !!retard && retard.retardS > 0 && retard.seRetardS < retard.retardS;

  // Le choix de la méthode, dans l'ordre de fidélité au manuel.
  let methode = null;
  let correctionMin = null;
  let incertitudeMin = null;
  if (lents.n >= minCount) {
    methode = 'lents';
    correctionMin = -lents.meanMin;
    incertitudeMin = lents.seMin;
  } else if (retardConnu && droite.n >= 4) {
    // Pas assez d'astres lents, mais la série est assez variée pour séparer les
    // deux effets. C'est le rattrapage, et il vaut d'être signalé : la mesure
    // est bonne, la SÉRIE ne l'était pas.
    methode = 'retard';
    correctionMin = -retard.erreurMin;
    incertitudeMin = retard.seErreurMin;
  } else if (brut.n >= minCount) {
    // Le dernier recours, et le plus dangereux : la moyenne brute mélange
    // l'instrument et la main. C'est exactement l'erreur qu'on a faite.
    methode = 'brut';
    correctionMin = -brut.meanMin;
    incertitudeMin = brut.seMin;
  }

  // Ce qui reste de retard DANS les visées retenues, même après le tri. Un astre
  // à 3′/min avec un retard de 30 s laisse encore 1,5′ dans la mesure — soit
  // presque la précision revendiquée de l'instrument. Ce nombre est la raison
  // de viser au méridien plutôt qu'à la limite du seuil.
  let biaisResiduelMin = null;
  if (methode === 'lents' && retardConnu && lentes.length) {
    const pire = Math.max(...lentes.map((r) => Math.abs(r.rateMinPerMin)));
    biaisResiduelMin = (pire * retard.retardS) / 60;
  }

  return {
    count: bonnes.length,
    brut,
    lents,
    retard,
    retardConnu,
    methode,
    correctionMin,
    incertitudeMin,
    biaisResiduelMin,
    // De quoi la série manque, pour que l'interface le dise au lieu de rester
    // muette — un filtre qui ne montre pas ce qu'il retire est un filtre qu'on
    // soupçonne d'avoir perdu quelque chose.
    manque: {
      lentes: Math.max(0, minCount - lents.n),
      total: Math.max(0, minCount - brut.n),
      pourLaPente: span >= MIN_RATE_SPAN ? 0 : MIN_RATE_SPAN - span,
    },
    serieComplete: lents.n >= FULL_SERIES,
  };
}
