/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// visees.js — ce que le pont rapporte du sextant.
//
// Une visée est le travail du joueur : deux minutes de collimation contre une
// bulle qui danse. Elle ne doit jamais se perdre parce qu'on a fermé une
// fenêtre. Elle est donc écrite sur le disque dès son arrivée, dans le dossier
// de travail, à côté des plans de vol.
//
// LE DÉDOUBLONNAGE N'EST PAS UNE PRÉCAUTION, C'EST LE PROTOCOLE. Le panneau
// garde ses visées tant qu'il n'a pas reçu l'accusé, et les renvoie toutes à
// chaque reconnexion. C'est ce qui permet de viser avec l'application fermée.
// La contrepartie est qu'une visée arrive plusieurs fois, et que c'est ICI
// qu'on la reconnaît — par son identifiant.
//
// LA VÉRITÉ EST SOUS SCELLÉS. Chaque visée porte la position RÉELLE de
// l'appareil à la mi-temps : le simulateur la connaît, le joueur non, et tout
// le jeu tient à cette ignorance. Elle voyage jusqu'ici parce que le
// débriefing en aura besoin — « votre point était à 4 milles » — mais `liste()`
// ne la rend PAS. Le renderer ne l'a jamais entre les mains, donc aucune
// évolution de l'interface ne pourra la laisser fuir par distraction.
// ============================================================

const fs = require('fs');
const path = require('path');

const { dossierBase } = require('./config');

const FICHIER = 'visees.json';

// Une navigation en compte une dizaine. Le plafond n'existe que pour qu'un
// panneau devenu fou ne fasse pas grossir le fichier sans fin ; au-delà, ce
// sont les plus anciennes qui cèdent.
const MAX = 1000;

let _cache = null;

function chemin() { return path.join(dossierBase(), FICHIER); }

function charger() {
  if (_cache) return _cache;
  try {
    const brut = fs.readFileSync(chemin(), 'utf-8');
    const obj = JSON.parse(brut);
    _cache = Array.isArray(obj.visees) ? obj.visees : [];
  } catch (_) {
    _cache = [];   // pas de fichier, ou fichier illisible : on repart à vide
  }
  return _cache;
}

function ecrire() {
  try {
    fs.mkdirSync(dossierBase(), { recursive: true });
    fs.writeFileSync(chemin(), JSON.stringify({ visees: _cache }, null, 2), 'utf-8');
    return true;
  } catch (err) {
    // Le disque a refusé. On garde la visée en mémoire — la session continue —
    // mais il faut que ça se sache, sinon le joueur croira son carnet à l'abri.
    return false;
  }
}

const estNombre = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Normalise ce qui arrive du pont. Le contenu vient d'une socket : même sur la
 * boucle locale, on ne range pas dans le carnet ce qu'on n'a pas relu.
 * @returns {object|null} la visée propre, ou null si elle n'en est pas une
 */
function normaliser(v) {
  if (!v || typeof v !== 'object') return null;
  if (typeof v.id !== 'string' || !v.id) return null;
  if (typeof v.body !== 'string' || !v.body) return null;
  const t = new Date(v.utc);
  if (Number.isNaN(t.getTime())) return null;
  if (!estNombre(v.hs)) return null;

  const vol = v.flight && typeof v.flight === 'object' ? v.flight : {};
  return {
    id: v.id,
    body: v.body,
    utc: t.toISOString(),
    hs: v.hs,
    seconds: estNombre(v.seconds) ? v.seconds : null,
    flight: {
      altitudeFt: estNombre(vol.altitudeFt) ? vol.altitudeFt : null,
      groundSpeedKt: estNombre(vol.groundSpeedKt) ? vol.groundSpeedKt : null,
      trackDeg: estNombre(vol.trackDeg) ? vol.trackDeg : null,
    },
    // Sous scellés : conservée, jamais rendue par liste().
    truth: v.truth && estNombre(v.truth.lat) && estNombre(v.truth.lon)
      ? { lat: v.truth.lat, lon: v.truth.lon } : null,
    recuA: new Date().toISOString(),
  };
}

/**
 * Retire la vérité. Tout ce qui sort d'ici passe par cette porte.
 *
 * Elle retient DEUX choses, pas une :
 *
 *   - `truth`, la position réelle à la mi-temps — évidente ;
 *   - la VITESSE SOL et la ROUTE SOL du simulateur, moins évidentes et tout
 *     aussi interdites. Le panneau les envoie parce qu'elles décrivent les
 *     conditions de la visée, mais un équipage de 1943 ne les connaît pas :
 *     elles contiennent le vent, et le vent est ce qu'il doit deviner. Servies
 *     à la réduction, elles transporteraient les droites de hauteur exactement
 *     comme il faut, le point tomberait juste à tous les coups, et l'estime
 *     n'aurait plus aucun rôle.
 *
 * L'ALTITUDE, elle, passe : c'est une lecture d'altimètre, et la réfraction
 * en a besoin. Même règle que la vitesse propre côté estime — ce qui se lit
 * dans le cockpit est permis, ce qui se déduit du vent ne l'est pas.
 */
function sansVerite(v) {
  const { truth, flight, ...reste } = v;
  return Object.assign(reste, {
    flight: { altitudeFt: (flight && flight.altitudeFt) === undefined ? null : flight.altitudeFt },
    aVerite: !!truth,
  });
}

/**
 * Range une visée. Rend ce qui s'est passé, pour que l'appelant puisse le dire
 * à l'interface : une visée déjà connue n'est PAS une erreur, c'est le
 * fonctionnement normal du renvoi.
 * @returns {{ ok: boolean, nouvelle: boolean, visee: object|null, ecrit: boolean, raison?: string }}
 */
function ajouter(brute) {
  const v = normaliser(brute);
  if (!v) return { ok: false, nouvelle: false, visee: null, ecrit: false, raison: 'illisible' };

  const liste = charger();
  if (liste.some((x) => x.id === v.id)) {
    return { ok: true, nouvelle: false, visee: sansVerite(v), ecrit: true };
  }

  liste.push(v);
  // Rangées par instant de visée, pas d'arrivée : une visée qui a attendu la
  // reconnexion doit retrouver sa place dans la chronologie du vol, sinon le
  // carnet raconte l'ordre du réseau au lieu de l'ordre du ciel.
  liste.sort((a, b) => new Date(a.utc) - new Date(b.utc));
  if (liste.length > MAX) liste.splice(0, liste.length - MAX);

  return { ok: true, nouvelle: true, visee: sansVerite(v), ecrit: ecrire() };
}

/**
 * Les identifiants du carnet, et rien d'autre.
 *
 * C'est ce que le pont annonce au sextant pour qu'il vide sa file. Une liste
 * d'identifiants ne dit rien de la position, ni de l'heure, ni de la hauteur :
 * elle peut donc traverser le pont sans qu'on ait à se demander ce qu'elle
 * révèle. Le contraste avec `liste()`, qui doit passer par `sansVerite()`, est
 * volontaire — moins on fait sortir, moins on a à surveiller.
 */
function ids() {
  return charger().map((v) => v.id);
}

/** Le carnet, sans la vérité. C'est ce que l'interface reçoit. */
function liste() {
  return { ok: true, visees: charger().map(sansVerite), fichier: chemin() };
}

/**
 * Le carnet AVEC la vérité. Réservé au débriefing, une fois le point rendu —
 * personne ne l'appelle encore, et c'est volontairement une autre porte.
 */
function listeAvecVerite() {
  return charger().slice();
}

function supprimer(id) {
  const liste_ = charger();
  const i = liste_.findIndex((v) => v.id === id);
  if (i < 0) return { ok: false, raison: 'inconnue' };
  liste_.splice(i, 1);
  return { ok: true, ecrit: ecrire() };
}

function vider() {
  _cache = [];
  return { ok: true, ecrit: ecrire() };
}

module.exports = { ajouter, ids, liste, listeAvecVerite, supprimer, vider, chemin, normaliser };
