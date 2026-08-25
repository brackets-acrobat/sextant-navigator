/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// avion.js — le flux du simulateur, et ce qu'on en montre.
//
// CE FICHIER NE DESSINE PLUS L'APPAREIL, ET C'EST LE POINT DE BASCULE DU
// PROJET.
//
// Il portait le marqueur d'avion, son tracé magenta, la vitesse sol du bandeau,
// la latitude et la longitude en clair, et l'indicateur de vent. Tout cela
// venait de Clear Sky VFR, où c'est exactement ce qu'on attend d'une carte VFR :
// savoir où l'on est.
//
// Ici c'était la réponse affichée avant la question. Un navigateur qui lit sa
// position sur un écran n'a aucune raison de viser un astre, et tout ce qui a
// été construit autour — le sextant, le pont, l'estime, la réduction, le point —
// devenait cérémoniel. La vitesse sol et le vent étaient pires encore que la
// position : ils contiennent la dérive, donc ils donnent le vent, donc ils
// rendaient l'estime exacte sans effort.
//
// CE QUI RESTE VISIBLE, et pourquoi :
//
//   l'ALTITUDE       — c'est une lecture d'altimètre, et la réfraction en a
//                      besoin. Un équipage l'a toujours eue.
//   le CAP           — il se lit au compas.
//   l'HEURE ZULU     — elle se lit à la montre.
//
// Tout le reste passe par l'ESTIME, qui est une supposition, ou par le
// DÉBRIEFING, qui n'ouvre qu'après coup.
// ============================================================

// Dernière trame reçue du simulateur : le reste du renderer y puise plutôt que
// de s'abonner une seconde fois au flux. Elle CONTIENT la vérité — position,
// vitesse sol, route sol, vent réel — et c'est à chaque lecteur de ne prendre
// que ce à quoi il a droit. Voir main/estime.js, qui applique la même règle
// avec plus de rigueur, parce qu'il le peut.
let derniereTrame = null;

function viderScan() {
  derniereTrame = null;
  $('b-amsl').textContent = '—';
  suiviPause = false;
  if (_suiviTimer) { clearTimeout(_suiviTimer); _suiviTimer = null; }
  dessinerCompas();   // plus d'avion : la rose retombe au centre de la carte
}

function majScan(f) {
  derniereTrame = f;
  // L'altimètre, et rien d'autre du flux ne s'affiche en clair.
  $('b-amsl').textContent = fmt(f.amslFt);
  majLegActifDepuisAvion(f);   // séquencement du leg actif selon la position avion
  majCompas();                 // rose des vents : recentrée et réorientée sur la trame
  majCatalogueDepuisSim();     // catalogue d'astres : recalculé toutes les 10 s, pas à chaque trame
}
