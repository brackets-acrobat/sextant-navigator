/**
 * Noyau d'éphémérides et de réduction de visée — API publique.
 *
 * Aucune dépendance, ESM pur : tourne tel quel dans Node et dans un panneau
 * HTML du simulateur.
 *
 *   import { almanacPage, sight, visibleBodies } from './src/index.js';
 */

import {
  julianDayFromDate,
  jdToTT,
  gast,
  norm360,
  sind,
  cosd,
  asind,
} from './time.js';
import { nutation } from './nutation.js';
import {
  checkEpoch,
  setEpochPolicy,
  getEpochPolicy,
  resetEpochWarnings,
  EPOCH_MIN_YEAR,
  EPOCH_MAX_YEAR,
} from './epoch.js';
import { sunApparent } from './sun.js';
import { moonApparent, moonIllumination } from './moon.js';
import { starApparent } from './stars.js';
import { planetApparent, findPlanet, PLANET_NAMES } from './planets.js';
import { STARS, findStar, STAR_NAMES } from './catalog.js';
import { groundVector, windFromAirPlot } from './estime.js';
import {
  cutAngle,
  idealCut,
  idealDilution,
  fixQuality,
  bestFixSet,
} from './quality.js';
import {
  indexErrorFromSeries,
  SLOW_RATE_MIN_PER_MIN,
  MIN_SIGHTS,
  FULL_SERIES,
} from './calibration.js';
import { plotSheet, cockedHat, lopIntersection } from './plotting.js';
import {
  ghaFromRa,
  shaFromRa,
  localHourAngle,
  computedAltitudeAzimuth,
  parallacticAngle,
  standardAtmosphere,
  refraction,
  coriolisCorrection,
  observedAltitude,
  sextantReading,
  intercept,
  fixFromLops,
  formatAngle,
  formatLatitude,
  formatLongitude,
} from './reduce.js';

export {
  STARS,
  STAR_NAMES,
  findStar,
  PLANET_NAMES,
  findPlanet,
  setEpochPolicy,
  getEpochPolicy,
  resetEpochWarnings,
  EPOCH_MIN_YEAR,
  EPOCH_MAX_YEAR,
  computedAltitudeAzimuth,
  parallacticAngle,
  standardAtmosphere,
  refraction,
  coriolisCorrection,
  observedAltitude,
  sextantReading,
  intercept,
  fixFromLops,
  formatAngle,
  formatLatitude,
  formatLongitude,
  shaFromRa,
  localHourAngle,
  cutAngle,
  idealCut,
  idealDilution,
  fixQuality,
  bestFixSet,
  groundVector,
  windFromAirPlot,
  indexErrorFromSeries,
  SLOW_RATE_MIN_PER_MIN,
  MIN_SIGHTS,
  FULL_SERIES,
  plotSheet,
  cockedHat,
  lopIntersection,
};

/**
 * `valeur ?? defaut`, écrit à la main.
 *
 * Le moteur du panneau est un WebKit 604 : ni `??`, ni `?.`, ni la
 * décomposition d'objet `{ ...x }` — mesuré, voir `tools/coherent-probe`. Ce
 * fichier tourne sous Node ET là-bas, donc il s'écrit en ES2017.
 *
 * NE PAS remplacer par `||` : une pression de 0 hPa, une température de 0 °C,
 * une route au 000 ou une vitesse nulle sont des VALEURS, pas des absences, et
 * `||` les écraserait silencieusement par le défaut. C'est exactement le genre
 * de faute qui ne se voit qu'en vol.
 */
function ouSinon(valeur, defaut) {
  return valeur === undefined || valeur === null ? defaut : valeur;
}

/**
 * Contexte temporel commun à tous les calculs d'un même instant.
 * On le calcule une fois et on le passe partout : sur une page d'almanach
 * complète, ça évite 58 recalculs de nutation.
 */
export function timeContext(utc) {
  const date = utc instanceof Date ? utc : new Date(utc);
  if (Number.isNaN(date.getTime())) {
    throw new TypeError(`Date invalide : ${JSON.stringify(utc)}`);
  }
  // Contrôle du domaine une seule fois par instant : tout ce qui suit en hérite.
  const epochWarning = checkEpoch(date);
  const jdUT = julianDayFromDate(date);
  const jdTT = jdToTT(jdUT, date.getUTCFullYear(), date.getUTCMonth() + 1);
  const nut = nutation(jdTT);
  return {
    date,
    jdUT,
    jdTT,
    nutation: nut,
    epochWarning,
    /** GHA du point vernal, en degrés — le « GHA Aries » de l'almanach. */
    ghaAries: gast(jdUT, nut.dpsi, nut.eps),
  };
}

/**
 * Position d'un astre pour un instant donné, sous forme almanach.
 *
 * @param {string} bodyName 'Sun', 'Moon', ou un nom d'étoile du catalogue
 * @param {Date|number|string|ReturnType<typeof timeContext>} when
 * @returns {{ name: string, kind: 'sun'|'moon'|'star', gha: number, dec: number,
 *             sha: number|null, ra: number, parallax: number,
 *             semiDiameter: number, magnitude: number|null }}
 */
export function bodyPosition(bodyName, when) {
  const ctx = when && when.jdTT ? when : timeContext(when);

  if (/^sun$|^soleil$/i.test(bodyName)) {
    const s = sunApparent(ctx.jdTT);
    return {
      name: 'Sun',
      kind: 'sun',
      gha: ghaFromRa(ctx.ghaAries, s.ra),
      dec: s.dec,
      sha: null,
      ra: s.ra,
      parallax: s.parallax,
      semiDiameter: s.semiDiameter,
      magnitude: -26.7,
    };
  }

  if (/^moon$|^lune$/i.test(bodyName)) {
    const m = moonApparent(ctx.jdTT);
    // La phase demande le Soleil. Le calcul est court — pas de série — et sans
    // lui la Lune serait un disque plein, ce qui se voit immédiatement dans un
    // oculaire.
    const phase = moonIllumination(sunApparent(ctx.jdTT), m);
    return {
      name: 'Moon',
      kind: 'moon',
      gha: ghaFromRa(ctx.ghaAries, m.ra),
      dec: m.dec,
      sha: null,
      ra: m.ra,
      parallax: m.parallax,
      semiDiameter: m.semiDiameter,
      distanceKm: m.distanceKm,
      magnitude: -12.7,
      illuminated: phase.illuminated,
      phaseAngle: phase.phaseAngle,
      brightLimbPA: phase.brightLimbPA,
      waxing: phase.waxing,
    };
  }

  const planete = findPlanet(bodyName);
  if (planete) {
    const p = planetApparent(planete, ctx.jdTT);
    return {
      name: planete,
      kind: 'planet',
      gha: ghaFromRa(ctx.ghaAries, p.ra),
      dec: p.dec,
      sha: shaFromRa(p.ra),
      ra: p.ra,
      // La parallaxe d'une planète n'est pas toujours négligeable : Vénus
      // proche atteint une demi-minute d'arc, autant que celle du Soleil au
      // carré. L'almanach nautique lui consacre d'ailleurs une correction
      // supplémentaire. Jupiter et Saturne, eux, restent sous deux secondes.
      parallax: 0.0024427778 / p.distanceAU,
      // Une planète se vise comme un point : pas de limbe à poser sur la bulle.
      semiDiameter: 0,
      distanceAU: p.distanceAU,
      magnitude: p.magnitude,
      illuminated: p.illuminated,
      phaseAngle: p.phaseAngle,
    };
  }

  const star = findStar(bodyName);
  if (!star) {
    throw new Error(`Astre inconnu : « ${bodyName} ». Voir STAR_NAMES.`);
  }
  const p = starApparent(star, ctx.jdTT);
  return {
    name: star.name,
    kind: 'star',
    bayer: star.bayer,
    gha: ghaFromRa(ctx.ghaAries, p.ra),
    dec: p.dec,
    sha: shaFromRa(p.ra),
    ra: p.ra,
    parallax: 0,
    semiDiameter: 0,
    magnitude: star.magnitude,
  };
}

/**
 * Page d'almanach complète pour un instant : GHA Aries, Soleil, Lune et les
 * 57 étoiles. C'est ce que le panneau affichera dans son cahier de visées.
 */
export function almanacPage(utc) {
  const ctx = timeContext(utc);
  return {
    utc: ctx.date.toISOString(),
    jdUT: ctx.jdUT,
    jdTT: ctx.jdTT,
    ghaAries: ctx.ghaAries,
    epochWarning: ctx.epochWarning,
    sun: bodyPosition('Sun', ctx),
    moon: bodyPosition('Moon', ctx),
    planets: PLANET_NAMES.map((n) => bodyPosition(n, ctx)),
    stars: STARS.map((s) => bodyPosition(s.name, ctx)),
  };
}

/**
 * Réduction complète d'une visée.
 *
 * Le simulateur ne donne JAMAIS la position au navigateur : il donne une
 * hauteur mesurée. C'est le joueur qui fournit sa position estimée, et le
 * calcul lui rend l'écart. Cette asymétrie est tout le jeu.
 *
 * @param {object} o
 * @param {Date|number|string} o.utc
 * @param {string} o.body
 * @param {{ lat: number, lon: number }} o.assumed  position estimée, lon EST positive
 * @param {number} [o.hs]           hauteur lue au sextant, en degrés.
 *                                  Omise, la fonction rend seulement Hc et Zn.
 * @param {number} [o.indexError]   erreur d'index, minutes d'arc
 * @param {number} [o.altitudeFt]   altitude-pression, pour la réfraction
 * @param {number} [o.pressureHpa]  écrase l'atmosphère standard
 * @param {number} [o.tempC]        écrase l'atmosphère standard
 * @param {number} [o.groundSpeedKt]
 * @param {number} [o.trackDeg]
 */
export function sight({
  utc,
  body,
  assumed,
  hs = null,
  indexError = 0,
  altitudeFt = 0,
  pressureHpa,
  tempC,
  groundSpeedKt = 0,
  trackDeg = 0,
}) {
  const ctx = timeContext(utc);
  const pos = bodyPosition(body, ctx);
  const lha = localHourAngle(pos.gha, assumed.lon);
  const { hc, zn } = computedAltitudeAzimuth(assumed.lat, pos.dec, lha);

  const isa = standardAtmosphere(altitudeFt);
  const p = ouSinon(pressureHpa, isa.pressureHpa);
  const t = ouSinon(tempC, isa.tempC);

  const result = {
    utc: ctx.date.toISOString(),
    body: pos.name,
    kind: pos.kind,
    epochWarning: ctx.epochWarning,
    ghaAries: ctx.ghaAries,
    gha: pos.gha,
    sha: pos.sha,
    dec: pos.dec,
    lha,
    hc,
    zn,
    assumed: Object.assign({}, assumed),
    atmosphere: { pressureHpa: p, tempC: t, altitudeFt },
  };

  if (hs === null) return result;

  const obs = observedAltitude({
    hs,
    indexError,
    parallax: pos.parallax,
    pressureHpa: p,
    tempC: t,
    groundSpeedKt,
    trackDeg,
    latDeg: assumed.lat,
    znDeg: zn,
  });

  // Object.assign tient lieu de `{ ...a, ...b }` : mêmes propriétés propres et
  // énumérables, même règle du dernier qui gagne, et l'intercept passe en
  // dernier comme dans l'écriture d'origine.
  return Object.assign(
    {},
    result,
    { hs, ho: obs.ho, corrections: obs.terms },
    intercept(obs.ho, hc, zn),
  );
}

/**
 * Déplace une position d'une distance donnée sur une route donnée.
 *
 * Une distance négative fait reculer : c'est ce qui sert à retrouver où l'on
 * était au moment d'une visée antérieure.
 */
export function advancePosition({ lat, lon }, distanceNm, trackDeg) {
  const lat2 = lat + (distanceNm * cosd(trackDeg)) / 60;
  const meanLat = (lat + lat2) / 2;
  const lon2 = lon + (distanceNm * sind(trackDeg)) / 60 / cosd(meanLat);
  return { lat: lat2, lon: lon2 };
}

/**
 * Point observé à partir d'un carnet de visées, par itérations successives.
 *
 * **Le transport de droite.** Les visées ne sont pas simultanées et l'avion
 * avance : à 150 kt, deux minutes valent 5 milles, un DC-3 en fait 12 sur une
 * fenêtre de visées, un 707 en fait 40. Réduire trois visées depuis une même
 * position estimée revient à prétendre qu'elles ont été prises au même endroit,
 * ce qui est faux et déplace le point sans ouvrir le chapeau — l'erreur la plus
 * traîtresse qui soit, puisque le triangle reste beau.
 *
 * La méthode du navigateur : on ramène tout à un instant commun, celui de la
 * dernière visée. Plutôt que de déplacer les droites une à une, on déplace la
 * position estimée : pour chaque visée on calcule où l'on était à *son* heure,
 * en reculant depuis l'estime de l'instant commun le long de la route parcourue.
 * La réduction faite depuis ce point-là donne un intercept déjà rapporté à
 * l'instant commun — le repère entier a été translaté avec l'avion.
 *
 * La route et la vitesse employées sont celles que le NAVIGATEUR croit avoir
 * (`trackDeg`, `groundSpeedKt` de chaque visée), jamais la vérité du simulateur.
 * Une estime fausse en route ou en vitesse dégrade donc le point, exactement
 * comme en vol.
 *
 * La droite de hauteur est une droite, la ligne de position est un cercle : la
 * méthode de Marcq Saint-Hilaire linéarise, et l'erreur croît avec le carré de
 * l'écart entre position estimée et position vraie. À 12 NM d'écart sur un
 * astre haut, elle vaut déjà 0,1 NM ; à 60 NM elle dépasse 3 NM. Le remède est
 * celui des navigateurs : rejouer la réduction depuis le point qu'on vient de
 * trouver. Deux passes suffisent presque toujours, trois convergent au
 * centimètre.
 *
 * @param {object} o
 * @param {{ lat: number, lon: number }} o.assumed  estime À L'INSTANT COMMUN
 * @param {Array<object>} o.sights  visées, chacune au format de `sight`
 *                                  ({ utc, body, hs, altitudeFt, … }) mais
 *                                  SANS `assumed` : il est fourni ici.
 * @param {number} [o.iterations=3]
 * @param {boolean} [o.transport=true]  mettre à false pour reproduire le
 *                                      comportement naïf, à fin de comparaison.
 * @param {Date|string|number} [o.commonUtc]  instant commun ; par défaut la
 *                                            dernière visée du carnet.
 */
export function fixFromSights({
  assumed,
  sights,
  iterations = 3,
  transport = true,
  commonUtc,
}) {
  if (!sights || sights.length < 2) {
    throw new Error('Il faut au moins deux visées pour faire un point.');
  }

  const times = sights.map((s) => new Date(s.utc).getTime());
  if (times.some((t) => Number.isNaN(t))) {
    throw new Error('Toutes les visées doivent porter une heure valide.');
  }
  const common = commonUtc === undefined ? Math.max(...times) : new Date(commonUtc).getTime();

  let current = { lat: assumed.lat, lon: assumed.lon };
  let result = null;
  let plotted = null;
  const history = [];

  for (let i = 0; i < iterations; i += 1) {
    const lops = sights.map((s, k) => {
      let ap = current;
      let runNm = 0;
      if (transport) {
        // Négatif pour une visée antérieure à l'instant commun : on recule.
        runNm = (ouSinon(s.groundSpeedKt, 0) * (times[k] - common)) / 3600000;
        ap = advancePosition(current, runNm, ouSinon(s.trackDeg, 0));
      }
      const r = sight(Object.assign({}, s, { assumed: ap }));
      return {
        zn: r.zn,
        signedNm: r.signedNm,
        body: r.body,
        runNm,
        utc: r.utc,
        // La position d'où cette droite a été réduite. Elle ne sert pas au
        // calcul — `fixFromLops` rapporte tout à l'estime commune, c'est le
        // principe même du transport par déplacement de l'estime — mais elle
        // est ce qu'il faut pour DESSINER la course sur la planchette : c'est
        // là qu'on était à l'heure de cette visée.
        ap: { lat: ap.lat, lon: ap.lon },
      };
    });
    // La PREMIÈRE passe, et elle seule, est celle qui se trace. Voir la note
    // sur `lops` dans le retour : les suivantes n'ont pas d'équivalent sur le
    // papier.
    if (i === 0) plotted = lops;
    result = fixFromLops(lops, current);
    current = { lat: result.lat, lon: result.lon };
    history.push({
      pass: i + 1,
      lat: result.lat,
      lon: result.lon,
      rmsNm: result.rmsNm,
      shiftNm: Math.hypot(result.northNm, result.eastNm),
    });
  }

  return Object.assign({}, result, {
    iterations,
    history,
    transport,
    /**
     * De l'estime de DÉPART au point, en milles — le déplacement que les visées
     * ont apporté, et le seul chiffre que le navigateur reporte sur sa carte.
     *
     * À ne pas confondre avec `northNm` et `eastNm`, qui viennent de
     * `fixFromLops` et ne décrivent que la DERNIÈRE passe : après convergence
     * ils ne valent plus que quelques centièmes de mille. Les prendre pour la
     * correction du point est la faute qui attend le prochain lecteur.
     */
    shiftNorthNm: (result.lat - assumed.lat) * 60,
    shiftEastNm: (result.lon - assumed.lon) * 60 * cosd(assumed.lat),
    /**
     * Les droites de la PREMIÈRE passe : celles qui se tracent.
     *
     * Le choix de la passe n'est pas un détail, et il se voit sur la feuille.
     * Les passes suivantes re-réduisent depuis le point qu'on vient de trouver,
     * donc leurs intercepts ne valent plus que le résidu — quelques centièmes
     * de mille. Les tracer donnerait une figure microscopique autour du point,
     * vraie mais vide de sens : le navigateur ne verrait plus de combien ses
     * visées ont corrigé son estime, qui est la seule chose qu'il regarde.
     *
     * Ce qu'on rend ici est donc ce qu'un navigateur porte sur sa planchette :
     * les intercepts mesurés depuis SA position estimée. Ils croisent au point
     * de la première passe, lequel diffère du point rendu par l'erreur de
     * linéarisation de Marcq Saint-Hilaire — 0,1 NM à 12 NM d'écart d'estime,
     * c'est-à-dire l'épaisseur du trait. Sur le papier, cette différence
     * n'existait pas : personne ne replottait.
     *
     * `ap` est la position d'où chaque droite a été réduite (l'estime reculée à
     * l'heure de la visée), `runNm` la course correspondante.
     */
    lops: plotted,
    commonUtc: new Date(common).toISOString(),
    /** Course parcourue depuis la visée la plus ancienne, en milles. */
    runSpanNm: transport
      ? Math.max(
          ...sights.map(
            (s, k) => Math.abs((ouSinon(s.groundSpeedKt, 0) * (times[k] - common)) / 3600000),
          ),
        )
      : 0,
  });
}

/**
 * Sens inverse : ce que l'instrument doit AFFICHER.
 *
 * `sight` est le calcul du navigateur ; celui-ci est le calcul du simulateur.
 * Il part de la position réelle de l'appareil — la seule chose que le jeu
 * connaisse et que le joueur ignore — et rend la hauteur que le tambour du
 * sextant montrera une fois l'astre posé sur la bulle.
 *
 * `relativeBearing` est la valeur à afficher sur la couronne de gisement pour
 * trouver l'astre : c'est l'azimut vrai moins le cap de l'appareil. C'est par
 * là que le panneau se relie au simulateur sans jamais interroger la caméra.
 */
export function simulateSight({
  utc,
  body,
  actual,
  headingTrue = 0,
  indexError = 0,
  altitudeFt = 0,
  pressureHpa,
  tempC,
  groundSpeedKt = 0,
  trackDeg = 0,
}) {
  const ctx = timeContext(utc);
  const pos = bodyPosition(body, ctx);
  const lha = localHourAngle(pos.gha, actual.lon);
  const { hc, zn } = computedAltitudeAzimuth(actual.lat, pos.dec, lha);

  const isa = standardAtmosphere(altitudeFt);
  const p = ouSinon(pressureHpa, isa.pressureHpa);
  const t = ouSinon(tempC, isa.tempC);

  const hs = sextantReading({
    ho: hc,
    indexError,
    parallax: pos.parallax,
    pressureHpa: p,
    tempC: t,
    groundSpeedKt,
    trackDeg,
    latDeg: actual.lat,
    znDeg: zn,
  });

  // La Lune emporte de quoi se dessiner. `limbAngle` est deja exprime dans le
  // repere de l'oculaire : angle du milieu du limbe eclaire, compte depuis le
  // HAUT du champ — la verticale du lieu — et croissant vers la gauche, sens
  // direct. C'est l'angle de position celeste moins l'angle parallactique ; le
  // panneau n'a plus qu'a tourner son pinceau.
  const lune = {};
  if (pos.kind === 'moon') {
    lune.illuminated = pos.illuminated;
    lune.brightLimbPA = pos.brightLimbPA;
    lune.parallactic = parallacticAngle(actual.lat, pos.dec, lha);
    lune.limbAngle = norm360(pos.brightLimbPA - lune.parallactic);
    lune.waxing = pos.waxing;
  }

  return Object.assign({
    utc: ctx.date.toISOString(),
    body: pos.name,
    kind: pos.kind,
    epochWarning: ctx.epochWarning,
    trueAltitude: hc,
    trueAzimuth: zn,
    relativeBearing: norm360(zn - headingTrue),
    hs,
    semiDiameter: pos.semiDiameter,
    atmosphere: { pressureHpa: p, tempC: t, altitudeFt },
  }, lune);
}

/**
 * Astres exploitables depuis une position, triés par intérêt pour le
 * navigateur : hauteur comprise dans la plage utile et azimuts bien répartis.
 *
 * Une visée sous 15° souffre trop de la réfraction ; au-dessus de 75° l'azimut
 * devient instable et la droite de hauteur ne vaut plus rien. La bonne visée
 * est entre les deux, et l'on cherche trois astres à 120° d'azimut les uns des
 * autres pour que le chapeau soit petit.
 */
export function visibleBodies({
  utc,
  position,
  minAltitude = 15,
  maxAltitude = 75,
  maxMagnitude = 2.5,
}) {
  const ctx = timeContext(utc);
  const sun = bodyPosition('Sun', ctx);
  const sunAlt = computedAltitudeAzimuth(
    position.lat,
    sun.dec,
    localHourAngle(sun.gha, position.lon),
  ).hc;

  // Crépuscule nautique : les étoiles ne sont utilisables que si le Soleil est
  // sous -6° (et l'horizon encore visible jusqu'à -12°, mais le sextant à bulle
  // n'a pas besoin de l'horizon).
  const starsUsable = sunAlt < -6;

  const candidates = [bodyPosition('Sun', ctx), bodyPosition('Moon', ctx)];

  // Les planètes n'attendent pas la nuit noire : elles percent dès que le
  // Soleil baisse, et c'est ce qui en fait les astres du crépuscule — le moment
  // où l'horizon est encore net pour un sextant marin, et où l'on voit assez
  // pour trouver son astre au sextant à bulle. Vénus fait exception dans
  // l'autre sens : assez brillante pour se viser en plein jour quand on sait où
  // regarder, ce que l'AFM enseigne.
  for (const n of PLANET_NAMES) {
    if (n === 'Venus' || sunAlt < -3) candidates.push(bodyPosition(n, ctx));
  }

  if (starsUsable) {
    for (const s of STARS) {
      if (s.magnitude <= maxMagnitude) candidates.push(bodyPosition(s.name, ctx));
    }
  }

  const out = [];
  for (const b of candidates) {
    const lha = localHourAngle(b.gha, position.lon);
    const { hc, zn } = computedAltitudeAzimuth(position.lat, b.dec, lha);
    if (hc < minAltitude || hc > maxAltitude) continue;
    if (b.kind === 'sun' && sunAlt < -1) continue;
    out.push({ name: b.name, kind: b.kind, hc, zn, magnitude: b.magnitude });
  }

  out.sort((a, b) => a.zn - b.zn);
  return { sunAltitude: sunAlt, starsUsable, bodies: out, epochWarning: ctx.epochWarning };
}

/**
 * Vitesse verticale d'un astre : minutes d'arc par minute de temps, SIGNÉE.
 *
 * Positive, l'astre monte ; négative, il descend. C'est le chiffre qui dit ce
 * qu'il faudra suivre à la molette pendant l'intégration — l'intégrateur moyenne
 * la position du TAMBOUR, pas la vérité du ciel — et c'est le même chiffre qui
 * décide si une visée peut servir à étalonner l'instrument.
 *
 * ON LA MESURE, ON NE LA CALCULE PAS. La formule analytique
 * 15,04 × cos(latitude) × sin(Zn) est exacte pour une étoile, et l'on pourrait
 * s'en tenir là ; mais la Lune court d'un demi-degré par heure sur le fond du
 * ciel, et c'est précisément l'astre pour lequel on veut le bon chiffre. La
 * différence finie coûte deux éphémérides et n'a pas d'exception à connaître.
 *
 * @param {object} o
 * @param {string} o.body
 * @param {Date|number|string} [o.utc]      instant du milieu
 * @param {{lat:number, lon:number}} o.position
 * @param {number} [o.spanSeconds]          écart total entre les deux mesures
 * @param {{before: object, after: object}} [o.contexts]
 *        contextes temporels déjà construits, pour l'appelant qui traite tout un
 *        catalogue : sans eux, vingt astres refont vingt fois la même nutation.
 *        Ils doivent être distants de `spanSeconds`, et centrés sur l'instant.
 */
export function altitudeRate({ body, utc, position, spanSeconds = 60, contexts = null }) {
  const avant = contexts ? contexts.before : timeContext(new Date(new Date(utc).getTime() - (spanSeconds / 2) * 1000));
  const apres = contexts ? contexts.after : timeContext(new Date(new Date(utc).getTime() + (spanSeconds / 2) * 1000));
  const hauteur = (ctx) => {
    const p = bodyPosition(body, ctx);
    return computedAltitudeAzimuth(position.lat, p.dec, localHourAngle(p.gha, position.lon)).hc;
  };
  // Degrés sur `spanSeconds` → minutes d'arc par minute de temps.
  return (hauteur(apres) - hauteur(avant)) * 60 * (60 / spanSeconds);
}

/**
 * Une série d'étalonnage, réduite depuis une position CONNUE.
 *
 * C'est la seule procédure du jeu où l'on a le droit de dire au navigateur où il
 * est — parce qu'il le sait vraiment : il est au parking d'un terrain dont les
 * coordonnées sont sur la carte. En vol, cette porte est fermée, et l'étalonnage
 * n'a plus de sens puisqu'on ne saurait plus contre quoi comparer.
 *
 * Chaque visée est réduite avec une correction d'index NULLE : c'est justement
 * ce qu'on cherche, et l'appliquer d'avance reviendrait à mesurer zéro. La
 * vitesse verticale est mesurée à l'instant de mi-temps, depuis la même position
 * connue. Le reste — moyennes, tri des astres lents, régression sur le retard de
 * manivelle — est dans `calibration.js`, qui ne connaît rien au ciel.
 *
 * @param {object} o
 * @param {Array<{id?:string, body:string, utc:string, hs:number, altitudeFt?:number}>} o.sights
 * @param {{lat:number, lon:number}} o.known   la position connue, lon EST positive
 * @param {number} [o.maxRate]                 seuil de l'astre « lent »
 * @param {number} [o.minCount]                visées nécessaires pour adopter
 */
export function calibrationSeries({ sights, known, maxRate, minCount } = {}) {
  const rows = (sights || []).map((s) => {
    // Ni vitesse sol ni route : l'appareil est à l'arrêt sur son parking, donc
    // Coriolis est nul. Le passer autrement introduirait dans l'étalon une
    // correction qui n'a pas lieu d'être.
    const r = sight({
      utc: s.utc,
      body: s.body,
      assumed: known,
      hs: s.hs,
      indexError: 0,
      altitudeFt: Number.isFinite(s.altitudeFt) ? s.altitudeFt : 0,
    });
    const rate = altitudeRate({ body: s.body, utc: s.utc, position: known });
    return {
      id: s.id === undefined ? null : s.id,
      body: r.body,
      kind: r.kind,
      utc: r.utc,
      hs: r.hs,
      ho: r.ho,
      hc: r.hc,
      zn: r.zn,
      // L'erreur au sens de l'AFM : Ho − Hc, en minutes d'arc. La correction à
      // afficher au tambour est son opposé — courbe Hc au-dessus de la lecture,
      // erreur négative, correction positive.
      errorMin: (r.ho - r.hc) * 60,
      rateMinPerMin: rate,
      epochWarning: r.epochWarning || null,
    };
  });

  return {
    rows,
    known: { lat: known.lat, lon: known.lon },
    resume: indexErrorFromSeries(rows, { maxRate, minCount }),
  };
}
