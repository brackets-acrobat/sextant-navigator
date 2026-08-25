/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// reduction.js — du carnet de visées au point observé.
//
// C'est la chaîne du navigateur, et elle ne calcule rien elle-même : tout est
// au noyau (`sight`, `fixFromSights`), éprouvé par ses propres tests. Ce module
// assemble, et surtout il DÉCIDE CE QU'ON A LE DROIT DE LUI DONNER.
//
// LE TRANSPORT, ET POURQUOI IL EST LE POINT SENSIBLE. Les visées ne sont pas
// simultanées et l'avion avance : le noyau les ramène à un instant commun en
// reculant le long de la route parcourue. Pour cela il lui faut une route et
// une vitesse — et ce doivent être CELLES QUE LE NAVIGATEUR CROIT AVOIR.
// Celles du simulateur donneraient un transport exact, un point juste à tous
// les coups, et une estime décorative.
//
// Elles viennent donc de l'estime (`estime.cruesA`), qui les déduit du cap, du
// badin et du VENT PRÉVU. Le carnet, lui, ne les porte plus : `visees.js` les
// met sous scellés avec la position vraie, précisément pour qu'elles ne
// puissent pas arriver ici par distraction.
//
// L'ERREUR D'INDEX est l'autre inconnue. Le panneau en a tiré une au hasard et
// ne la dit à personne ; le navigateur la découvre en étalonnant. Tant qu'il
// ne l'a pas fait, la réduction travaille avec la valeur qu'il croit — zéro par
// défaut — et le point porte l'erreur, comme dans la vraie vie.
// ============================================================

const noyau = require('./noyau');

/** Une visée est-elle réductible ? */
function utilisable(v) {
  return v && typeof v.body === 'string' && Number.isFinite(v.hs)
    && !Number.isNaN(new Date(v.utc).getTime());
}

/**
 * Réduit un carnet et, s'il y a de quoi, en tire un point.
 *
 * @param {object} o
 * @param {Array} o.visees        visées du carnet (sans vérité, sans vitesse sol)
 * @param {{lat:number, lon:number}} o.assumed  l'estime À L'INSTANT COMMUN
 * @param {number} [o.indexError] correction d'index que le navigateur applique
 * @param {Array<{trackDeg:number, gsKt:number}>} [o.crues]  route et vitesse
 *        CRUES au moment de chaque visée, dans le même ordre. Sans elles, le
 *        transport se fait sans course — honnête si l'on n'a rien tenu.
 * @param {number} [o.commonUtc]  instant commun ; par défaut la dernière visée
 */
async function reduire({ visees, assumed, indexError = 0, crues = [], commonUtc } = {}) {
  if (!assumed || !Number.isFinite(assumed.lat) || !Number.isFinite(assumed.lon)) {
    return { ok: false, error: 'estime' };
  }
  const liste = (visees || []).filter(utilisable);
  if (!liste.length) return { ok: false, error: 'carnet-vide' };

  let n;
  try {
    n = await noyau.charger();
  } catch (err) {
    return { ok: false, error: 'noyau', detail: err && err.message };
  }

  try {
    // Ce qu'on passe au noyau, visée par visée. L'altitude est une lecture
    // d'altimètre — permise, et la réfraction en a besoin. La route et la
    // vitesse viennent de l'estime, jamais du carnet.
    const pourNoyau = liste.map((v, i) => {
      const c = crues[i] || {};
      return {
        utc: v.utc,
        body: v.body,
        hs: v.hs,
        indexError,
        altitudeFt: Number.isFinite(v.flight && v.flight.altitudeFt) ? v.flight.altitudeFt : 0,
        groundSpeedKt: Number.isFinite(c.gsKt) ? c.gsKt : 0,
        trackDeg: Number.isFinite(c.trackDeg) ? c.trackDeg : 0,
      };
    });

    // Une ligne par visée, réduite depuis l'estime SANS transport : c'est ce
    // que le navigateur écrit sur sa feuille avant de tracer. L'intercept y est
    // celui de la visée prise isolément.
    const lignes = pourNoyau.map((s, i) => {
      const r = n.sight(Object.assign({}, s, { assumed }));
      return {
        id: liste[i].id,
        body: r.body,
        kind: r.kind,
        utc: r.utc,
        hs: r.hs,
        ho: r.ho,
        hc: r.hc,
        zn: r.zn,
        interceptNm: r.interceptNm,
        toward: r.toward,
        corrections: r.corrections,
        epochWarning: r.epochWarning || null,
      };
    });

    const qualite = n.fixQuality(lignes.map((l) => l.zn));

    // Le point demande au moins deux droites. Une seule visée donne une droite
    // de hauteur — c'est déjà quelque chose, mais ce n'est pas une position.
    let point = null;
    let planchette = null;
    if (pourNoyau.length >= 2) {
      const f = n.fixFromSights({
        assumed,
        sights: pourNoyau,
        iterations: 3,
        transport: true,
        commonUtc,
      });

      // LA FEUILLE DE POSITION, dressée ici plutôt que dans l'interface.
      //
      // Elle est faite des droites de la PREMIÈRE passe — celles qu'un
      // navigateur porte sur sa planchette, mesurées depuis SON estime. Le
      // noyau explique pourquoi les passes suivantes ne se tracent pas.
      //
      // Rien de ce qui entre ici ne vient du simulateur : l'estime est celle
      // que le navigateur tient, les droites sortent de ses visées. La feuille
      // ne peut donc pas divulguer la position vraie, et le tracé montre ce
      // qu'il a trouvé, jamais où il est.
      planchette = n.plotSheet({ assumed, fix: f, lops: f.lops });

      point = {
        lat: f.lat,
        lon: f.lon,
        // Le chapeau. ATTENTION À CE QU'IL DIT : il mesure la CONCORDANCE des
        // droites, pas la justesse du point. Une erreur commune à toutes les
        // visées — une erreur d'index mal estimée, par exemple — resserre le
        // chapeau tout en déplaçant le point. Un beau triangle n'est pas une
        // preuve.
        rmsNm: f.rmsNm,
        residualsNm: f.residualsNm,
        northNm: f.northNm,
        eastNm: f.eastNm,
        runSpanNm: f.runSpanNm,
        commonUtc: f.commonUtc,
        iterations: f.iterations,
        // Déplacement depuis l'estime : c'est la correction que le point
        // apporte, et donc la mesure de ce que l'estime avait dérivé.
        ecartEstimeNm: Math.hypot(
          (f.lat - assumed.lat) * 60,
          (f.lon - assumed.lon) * 60 * Math.cos((assumed.lat * Math.PI) / 180),
        ),
      };
    }

    return {
      ok: true,
      assumed: { lat: assumed.lat, lon: assumed.lon },
      indexError,
      lignes,
      point,
      planchette,
      qualite: {
        count: qualite.count,
        cutMin: qualite.cutMin,
        dilution: Number.isFinite(qualite.dilution) ? qualite.dilution : null,
        parallele: qualite.dilution === Infinity,
        ideal: n.idealDilution(qualite.count),
      },
    };
  } catch (err) {
    return { ok: false, error: 'calcul', detail: err && err.message };
  }
}

/**
 * Le débriefing : ce que le point valait vraiment.
 *
 * C'est la SEULE porte par laquelle la position réelle ressort, et elle ne
 * s'ouvre qu'après coup, sur un point déjà fait. Tant que le navigateur n'a
 * pas rendu sa copie, il ne peut pas savoir.
 *
 * @param {{lat:number, lon:number}} point   le point observé
 * @param {{lat:number, lon:number}} estime  l'estime dont il est parti
 * @param {{lat:number, lon:number}} verite  la position vraie à l'instant commun
 */
function debriefer({ point, estime, verite } = {}) {
  const bon = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon);
  if (!bon(point) || !bon(verite)) return { ok: false, error: 'incomplet' };

  const nm = (a, b) => Math.hypot(
    (a.lat - b.lat) * 60,
    (a.lon - b.lon) * 60 * Math.cos((b.lat * Math.PI) / 180),
  );
  const relevement = (de, vers) => {
    const dN = (vers.lat - de.lat) * 60;
    const dE = (vers.lon - de.lon) * 60 * Math.cos((de.lat * Math.PI) / 180);
    return ((Math.atan2(dE, dN) * 180) / Math.PI + 360) % 360;
  };

  const erreurPoint = nm(point, verite);
  const erreurEstime = bon(estime) ? nm(estime, verite) : null;
  return {
    ok: true,
    verite: { lat: verite.lat, lon: verite.lon },
    erreurPointNm: erreurPoint,
    erreurEstimeNm: erreurEstime,
    // De combien le point a rapproché de la vérité. Négatif : il a éloigné —
    // ça arrive, et c'est instructif.
    gainNm: erreurEstime === null ? null : erreurEstime - erreurPoint,
    relevementVerite: relevement(point, verite),
  };
}

module.exports = { reduire, debriefer };
