/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// astres.js — catalogue des astres exploitables, et qualité du point.
//
// Ce module est le SEUL point de contact entre l'application et le noyau
// d'éphémérides. Le noyau n'est pas recopié ici : il est importé tel quel, si
// bien que l'application calcule avec exactement le code que les 100 tests de
// `sextant/test/` éprouvent. Une correction d'éphéméride profite au panneau et
// à l'application le même jour, sans transcription.
//
// LA FRONTIÈRE DE MODULES. Le noyau est en modules ES ("type": "module" dans
// sextant/package.json), ce process est en CommonJS. `require()` échoue net sur
// cette frontière — c'est le message ERR_REQUIRE_ESM. Seul l'import DYNAMIQUE
// la traverse, et il faut lui donner une URL de fichier : sous Windows,
// `import('C:\\…')` prend le C: pour un protocole. D'où pathToFileURL.
// ============================================================

const noyau = require('./noyau');

// Le chargement du noyau, sa frontière de modules et son emplacement une fois
// l'application empaquetée sont expliqués dans noyau.js — un seul endroit les
// connaît, pour qu'il n'y ait pas trois chemins à corriger le jour venu.

// --- Réglages par défaut -----------------------------------------------------
//
// Les bornes de hauteur sont celles du métier, pas des goûts : sous 15° la
// réfraction devient incertaine et sa correction douteuse ; au-dessus de 75°
// l'azimut varie si vite que la droite de hauteur perd son sens — c'est le
// domaine de la « visée circulaire », que le sextant à bulle ne fait pas.
// Elles restent réglables : un vol polaire ou un astre unique peut obliger à
// sortir du domaine, et mieux vaut le faire sciemment.
const DEFAUTS = { minAltitude: 15, maxAltitude: 75, maxMagnitude: 2.5 };

function nombre(v, defaut) {
  return Number.isFinite(v) ? v : defaut;
}

/**
 * Catalogue des astres exploitables depuis une position, à un instant.
 *
 * Le tri, les règles de crépuscule et le choix des planètes viennent du noyau
 * (`visibleBodies`) : ils encodent la doctrine de l'AFM 51-40, et les
 * redécider ici en ferait deux versions divergentes. Ce module se contente
 * d'ENRICHIR chaque astre de ce que la table du navigateur demande et que le
 * noyau n'a pas à connaître : le gisement (donc le cap de l'appareil), la
 * désignation de Bayer, et la géométrie de croisement.
 *
 * @param {object} o
 * @param {string} o.utc                instant, en ISO
 * @param {number} o.lat
 * @param {number} o.lon                est positive
 * @param {number} [o.headingTrue]      cap VRAI, pour le gisement
 * @param {number} [o.minAltitude]
 * @param {number} [o.maxAltitude]
 * @param {number} [o.maxMagnitude]
 */
async function catalogue({ utc, lat, lon, headingTrue, minAltitude, maxAltitude, maxMagnitude } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { ok: false, error: 'position' };
  }
  const instant = new Date(utc);
  if (Number.isNaN(instant.getTime())) return { ok: false, error: 'heure' };

  let n;
  try {
    n = await noyau.charger();
  } catch (err) {
    return { ok: false, error: 'noyau', detail: err && err.message };
  }

  try {
    const bornes = {
      minAltitude: nombre(minAltitude, DEFAUTS.minAltitude),
      maxAltitude: nombre(maxAltitude, DEFAUTS.maxAltitude),
      maxMagnitude: nombre(maxMagnitude, DEFAUTS.maxMagnitude),
    };
    // On demande TOUT ce qui est au-dessus de l'horizon, et l'on applique le
    // domaine de visée ici. Le noyau saurait filtrer lui-même, mais alors un
    // astre écarté n'existerait plus du tout — et c'est exactement ce qui a fait
    // chercher la Lune : elle était à 12,9°, sous une borne à 15°, et rien ne le
    // disait. Un filtre qui ne montre pas ce qu'il retire est un filtre qu'on
    // soupçonne d'avoir perdu quelque chose.
    const vue = n.visibleBodies({
      utc: instant,
      position: { lat, lon },
      minAltitude: 0,
      maxAltitude: 90,
      maxMagnitude: bornes.maxMagnitude,
    });
    const dansLeDomaine = (b) => b.hc >= bornes.minAltitude && b.hc <= bornes.maxAltitude;

    // Un seul contexte temporel pour tout l'enrichissement : sans lui, chaque
    // astre refait la nutation, soit une vingtaine de fois par rafraîchissement.
    const ctx = n.timeContext(instant);

    // Deux contextes de plus, à trente secondes de part et d'autre : ils
    // servent à mesurer la VITESSE VERTICALE de chaque astre, et ils sont
    // construits ICI parce qu'ils se partagent — sans eux, vingt astres
    // referaient vingt fois la même nutation à chaque rafraîchissement.
    //
    // Le calcul lui-même est au noyau (`altitudeRate`), et il DOIT y rester :
    // l'étalonnage se sert du même chiffre pour décider si une visée mesure
    // l'instrument ou la main. Deux différences finies écrites séparément, ce
    // sont deux chiffres qui finissent par diverger — et un astre affiché
    // « lent » au catalogue qui se verrait écarté à la mesure, sans explication.
    const SPAN_S = 60;
    const contextes = {
      before: n.timeContext(new Date(instant.getTime() - (SPAN_S / 2) * 1000)),
      after: n.timeContext(new Date(instant.getTime() + (SPAN_S / 2) * 1000)),
    };
    const bayerDe = new Map(n.STARS.map((s) => [s.name, s.bayer]));
    const capConnu = Number.isFinite(headingTrue);

    const astres = vue.bodies.filter(dansLeDomaine).map((b) => {
      const p = n.bodyPosition(b.name, ctx);
      return {
        name: b.name,
        kind: b.kind,
        bayer: bayerDe.get(b.name) || null,
        magnitude: b.magnitude,
        hc: b.hc,
        zn: b.zn,
        // Gisement : l'azimut vu depuis le nez de l'appareil, ce qu'on affiche
        // sur la couronne du sextant pour aller chercher l'astre. Sans cap
        // connu il n'existe pas — et surtout, il ne vaut pas l'azimut.
        gisement: capConnu ? ((b.zn - headingTrue) % 360 + 360) % 360 : null,
        // Minutes d'arc par minute de temps, signée : positive si l'astre
        // monte. C'est ce qui dit s'il faudra manivelier pendant l'intégration
        // — l'intégrateur moyenne la position du TAMBOUR, et un tambour qui ne
        // suit pas un astre qui descend rend une hauteur trop forte.
        vitesse: n.altitudeRate({
          body: b.name,
          position: { lat, lon },
          spanSeconds: SPAN_S,
          contexts: contextes,
        }),
        dec: p.dec,
        gha: p.gha,
        sha: p.sha,
        // La Lune se vise autrement selon sa phase : un croissant n'a pas de
        // centre visible, on pose un limbe sur la bulle et l'on corrige.
        illuminated: p.illuminated === undefined ? null : p.illuminated,
      };
    });

    // Matrice des coupes, tous couples confondus. Elle part avec le catalogue
    // parce que l'interface en a besoin à chaque clic, et qu'un aller-retour
    // par astre coché pour trois lignes d'arithmétique n'aurait pas de sens.
    // Elle est symétrique et diagonale nulle : une vingtaine d'astres, donc
    // quatre cents nombres, ce que l'IPC avale sans ciller.
    const coupes = astres.map((a) => astres.map((b) => n.cutAngle(a.zn, b.zn)));

    // Le meilleur jeu, calculé ici plutôt que proposé à l'œil : c'est la seule
    // chose que la table du navigateur sache faire et que l'almanach ne fasse
    // pas. Le trio d'abord — c'est le point classique — la paire ensuite, pour
    // les crépuscules pauvres où trois astres ne sont pas au rendez-vous.
    const meilleurTrio = n.bestFixSet(astres, { size: 3 });
    const meilleurePaire = n.bestFixSet(astres, { size: 2 });

    // Ceux que le domaine a écartés, les plus proches d'y rentrer en tête : un
    // astre à un demi-degré sous la borne intéresse le navigateur, un astre à
    // deux degrés au-dessus de l'horizon ne l'intéresse pas.
    const ecartes = vue.bodies
      .filter((b) => !dansLeDomaine(b))
      .map((b) => ({
        name: b.name,
        kind: b.kind,
        hc: b.hc,
        // Négatif : sous la borne basse. Positif : au-dessus de la haute.
        depassement: b.hc < bornes.minAltitude ? b.hc - bornes.minAltitude : b.hc - bornes.maxAltitude,
      }))
      .sort((a, b) => Math.abs(a.depassement) - Math.abs(b.depassement));

    return {
      ok: true,
      utc: instant.toISOString(),
      position: { lat, lon },
      headingTrue: capConnu ? headingTrue : null,
      bornes,
      ecartes,
      sunAltitude: vue.sunAltitude,
      starsUsable: vue.starsUsable,
      epochWarning: vue.epochWarning || null,
      astres,
      coupes,
      meilleurTrio: reduireJeu(meilleurTrio),
      meilleurePaire: reduireJeu(meilleurePaire),
      ideal: { trio: n.idealDilution(3), paire: n.idealDilution(2) },
    };
  } catch (err) {
    return { ok: false, error: 'calcul', detail: err && err.message };
  }
}

// Un jeu d'astres ne traverse l'IPC que par ses noms et ses deux chiffres :
// l'interface a déjà les astres eux-mêmes dans le catalogue.
function reduireJeu(jeu) {
  if (!jeu) return null;
  return { names: jeu.names, cutMin: jeu.cutMin, dilution: jeu.dilution };
}

/**
 * Qualité géométrique d'une sélection d'astres.
 *
 * Appelé à chaque coche : l'interface pourrait refaire ces deux lignes
 * elle-même, mais alors la formule existerait à deux endroits, et c'est
 * exactement de cette façon qu'une correction s'applique à un seul des deux.
 */
async function qualite({ azimuths } = {}) {
  let n;
  try {
    n = await noyau.charger();
  } catch (err) {
    return { ok: false, error: 'noyau', detail: err && err.message };
  }
  const q = n.fixQuality(azimuths || []);
  return {
    ok: true,
    count: q.count,
    cutMin: q.cutMin,
    // JSON ne transporte pas Infinity : il le sérialise en null, ce qui se
    // confondrait avec « pas de valeur ». Le cas est réel — deux visées du même
    // astre — donc il porte un drapeau à lui.
    dilution: Number.isFinite(q.dilution) ? q.dilution : null,
    parallele: q.dilution === Infinity,
    ideal: n.idealDilution(q.count),
    idealCut: n.idealCut(q.count),
  };
}

module.exports = { catalogue, qualite, DEFAUTS };
