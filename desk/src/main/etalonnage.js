/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// etalonnage.js — mesurer ce que vaut SON exemplaire.
//
// C'est la procédure d'avant-vol, et c'est la seule du jeu où l'on a le droit
// de dire au navigateur où il est. Ce n'est pas une fuite : il est au parking
// d'un terrain dont les coordonnées sont sur la carte, et un équipage de 1943
// les avait aussi. Le canal se referme au décollage, comme celui de l'estime.
//
// EN VOL, ON REFUSE. Non par prudence de programmeur, mais parce que la mesure
// n'aurait aucun sens : l'étalonnage compare une hauteur observée à une hauteur
// CALCULÉE, et la hauteur calculée dépend de la position. Contre une estime qui
// a dérivé de cinq milles, on mesurerait la dérive au lieu de l'instrument.
//
// CE QUE LA SÉRIE MESURE VRAIMENT, et c'est la leçon d'un vol réel : pas
// seulement le sextant, mais aussi la MAIN qui manivelle. Un tambour qui suit
// l'astre avec trente secondes de retard fait lire trop haut sur un astre qui
// descend, et l'on met ça sur le compte de l'erreur d'index. D'où la règle qui
// gouverne ce module — on étalonne sur des astres LENTS — et d'où la colonne
// « ′/min » qui accompagne chaque visée de la série. Le calcul est au noyau
// (`calibrationSeries`, `indexErrorFromSeries`) ; ici, on tient la session.
//
// LA SESSION EST UNE FENÊTRE DE TEMPS, pas une liste de visées. Le navigateur
// déclare « je commence », vise, puis « je mesure » : tout ce qui est arrivé du
// pont entre-temps fait partie de la série. C'est ce qui permet d'écarter une
// visée ratée sans avoir à cocher les neuf autres, et c'est plus proche du geste
// que de faire une sélection dans un carnet.
//
// LE FILTRE PARLE. Les visées écartées restent dans la série, marquées, avec la
// raison — trop rapide, ou refusée à la main. Un filtre muet a déjà coûté une
// Lune qu'on cherchait à l'œil sans qu'aucune ligne ne dise pourquoi elle ne
// figurait pas au catalogue.
// ============================================================

const fs = require('fs');
const path = require('path');

const noyau = require('./noyau');
const { dossierBase } = require('./config');

const FICHIER = 'etalonnage.json';

let _cache = null;

function chemin() { return path.join(dossierBase(), FICHIER); }

function charger() {
  if (_cache) return _cache;
  try {
    const obj = JSON.parse(fs.readFileSync(chemin(), 'utf-8'));
    _cache = {
      session: obj.session && typeof obj.session === 'object' ? obj.session : null,
      adoptee: obj.adoptee && typeof obj.adoptee === 'object' ? obj.adoptee : null,
    };
  } catch (_) {
    _cache = { session: null, adoptee: null };
  }
  return _cache;
}

function ecrire() {
  try {
    fs.mkdirSync(dossierBase(), { recursive: true });
    fs.writeFileSync(chemin(), JSON.stringify(charger(), null, 2), 'utf-8');
    return true;
  } catch (_) {
    return false;
  }
}

const estNombre = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Ouvre une session. La position est CONNUE, et c'est tout ce qui compte.
 *
 * @param {object} o
 * @param {number} o.lat
 * @param {number} o.lon
 * @param {'sol'|'manuelle'} [o.origine]  d'où vient la position connue
 * @param {boolean|null} [o.auSol]        ce que l'estime sait de l'appareil :
 *        `false` = en vol, et l'on refuse ; `null` = pas de simulateur, on
 *        laisse faire, le navigateur rejoue peut-être un carnet.
 */
function demarrer({ lat, lon, origine = 'manuelle', auSol = null } = {}) {
  if (!estNombre(lat) || !estNombre(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return { ok: false, error: 'position' };
  }
  if (auSol === false) return { ok: false, error: 'en-vol' };
  if (origine === 'sol' && auSol !== true) return { ok: false, error: 'pas-au-sol' };

  const etat = charger();
  etat.session = {
    depuis: new Date().toISOString(),
    position: { lat, lon },
    origine: origine === 'sol' ? 'sol' : 'manuelle',
    // Visées que le navigateur a refusées à la main : une bulle perdue, un coup
    // de manivelle raté. Il les voit toujours, barrées.
    exclues: [],
  };
  return Object.assign({ ok: true, ecrit: ecrire() }, lire());
}

/** Ferme la session sans rien adopter. La correction déjà adoptée survit. */
function arreter() {
  const etat = charger();
  etat.session = null;
  return Object.assign({ ok: true, ecrit: ecrire() }, lire());
}

/** Écarte une visée de la série, ou l'y remet. */
function basculer(id) {
  const etat = charger();
  if (!etat.session) return { ok: false, error: 'pas-de-session' };
  if (typeof id !== 'string' || !id) return { ok: false, error: 'id' };
  const i = etat.session.exclues.indexOf(id);
  if (i < 0) etat.session.exclues.push(id);
  else etat.session.exclues.splice(i, 1);
  return Object.assign({ ok: true, ecrit: ecrire() }, lire());
}

/** L'état, tel que l'interface le voit. */
function lire() {
  const etat = charger();
  return { session: etat.session, adoptee: etat.adoptee };
}

/**
 * Les visées du carnet qui appartiennent à la session.
 *
 * On filtre sur l'heure d'ARRIVÉE, pas sur l'heure de visée : le carnet porte
 * l'heure zulu du simulateur, qui peut être une nuit de 1943, alors que la
 * session se déroule ce soir. Les deux horloges n'ont rien à voir, et les
 * confondre viderait la série sans que rien ne l'explique.
 */
function viseesDeLaSession(visees, session) {
  if (!session) return [];
  const depuis = Date.parse(session.depuis);
  if (Number.isNaN(depuis)) return [];
  return (visees || []).filter((v) => {
    const t = Date.parse(v.recuA);
    return !Number.isNaN(t) && t >= depuis;
  });
}

/**
 * Mesure la série : une ligne par visée, et ce qu'on en tire.
 *
 * @param {object} o
 * @param {Array} o.visees  le carnet expurgé (sans vérité) — voir visees.js
 */
async function mesurer({ visees } = {}) {
  const etat = charger();
  if (!etat.session) return { ok: false, error: 'pas-de-session' };

  let n;
  try {
    n = await noyau.charger();
  } catch (err) {
    return { ok: false, error: 'noyau', detail: err && err.message };
  }

  const dansLaSession = viseesDeLaSession(visees, etat.session);
  const exclues = new Set(etat.session.exclues || []);

  // Les visées refusées à la main sortent AVANT le calcul : elles ne doivent
  // peser ni sur la moyenne, ni sur la pente. Mais elles restent affichées.
  const retenues = dansLaSession.filter((v) => !exclues.has(v.id));

  try {
    const serie = n.calibrationSeries({
      sights: retenues.map((v) => ({
        id: v.id,
        body: v.body,
        utc: v.utc,
        hs: v.hs,
        altitudeFt: v.flight && Number.isFinite(v.flight.altitudeFt) ? v.flight.altitudeFt : 0,
      })),
      known: etat.session.position,
    });

    // Chaque ligne dit son sort. `retenue` est faux quand la vitesse dépasse le
    // seuil : la visée compte encore pour la pente — c'est même elle qui donne
    // le bras de levier — mais pas pour la moyenne des lents.
    const seuil = n.SLOW_RATE_MIN_PER_MIN;
    const lignes = serie.rows.map((r) => ({
      id: r.id,
      body: r.body,
      kind: r.kind,
      utc: r.utc,
      hs: r.hs,
      ho: r.ho,
      hc: r.hc,
      zn: r.zn,
      errorMin: r.errorMin,
      rateMinPerMin: r.rateMinPerMin,
      lente: Math.abs(r.rateMinPerMin) <= seuil,
      epochWarning: r.epochWarning || null,
    }));

    return {
      ok: true,
      session: etat.session,
      seuil,
      minCount: n.MIN_SIGHTS,
      serieComplete: n.FULL_SERIES,
      lignes,
      // Les refusées à la main, pour que l'interface les montre barrées plutôt
      // que de les faire disparaître.
      refusees: dansLaSession.filter((v) => exclues.has(v.id))
        .map((v) => ({ id: v.id, body: v.body, utc: v.utc, hs: v.hs })),
      resume: serie.resume,
      adoptee: etat.adoptee,
    };
  } catch (err) {
    return { ok: false, error: 'calcul', detail: err && err.message };
  }
}

/**
 * Adopte une correction. C'est le geste qui donne son sens à toute la
 * procédure : à partir de là, les réductions s'en servent.
 *
 * On enregistre AVEC quoi elle a été obtenue — méthode, nombre de visées,
 * dispersion, retard mesuré. Une correction sans sa provenance est un nombre
 * qu'on n'ose plus toucher six mois après.
 */
function adopter({ correctionMin, incertitudeMin, methode, n, retardS, position } = {}) {
  if (!estNombre(correctionMin)) return { ok: false, error: 'valeur' };
  const etat = charger();
  etat.adoptee = {
    correctionMin,
    incertitudeMin: estNombre(incertitudeMin) ? incertitudeMin : null,
    methode: typeof methode === 'string' ? methode : null,
    n: Number.isInteger(n) ? n : null,
    retardS: estNombre(retardS) ? retardS : null,
    position: position && estNombre(position.lat) && estNombre(position.lon)
      ? { lat: position.lat, lon: position.lon } : null,
    faitLe: new Date().toISOString(),
  };
  // La session a fait son travail. La garder ouverte ferait grossir la série de
  // toutes les visées du vol qui suit, et la mesure ne voudrait plus rien dire.
  etat.session = null;
  return Object.assign({ ok: true, ecrit: ecrire() }, lire());
}

/** Oublie la correction adoptée : on repart de zéro, comme un sextant neuf. */
function oublier() {
  const etat = charger();
  etat.adoptee = null;
  return Object.assign({ ok: true, ecrit: ecrire() }, lire());
}

module.exports = {
  demarrer, arreter, basculer, mesurer, adopter, oublier, lire, chemin,
  viseesDeLaSession,
};
