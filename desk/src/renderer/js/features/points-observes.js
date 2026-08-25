/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// points-observes.js — le point porté sur la carte.
//
// C'est le partage historique du travail : le navigateur CONSTRUIT sur sa
// feuille de position — azimuts, intercepts, chapeau — et REPORTE le résultat
// sur sa carte. La planchette reçoit la géométrie, la carte ne reçoit que le
// point, daté.
//
// ET C'EST LÉGITIME AU REGARD DE LA COUPURE. Ce qui est interdit, c'est de
// montrer où l'appareil EST. Un point observé n'est pas cela : c'est ce que le
// navigateur a CONCLU, à partir de son estime et de ses visées, sans que la
// vérité soit jamais entrée dans le calcul. S'il tombe juste, la carte montre
// bien sa position — mais il l'a gagnée. C'est la récompense, pas la fuite.
//
// DEUX FORMES, DEUX NATURES. Le rond va à ce qu'on a MESURÉ, le carré (celui de
// l'estime) à ce qu'on SUPPOSE. C'est la convention de carte, elle est gratuite
// à respecter, et elle sépare d'un coup d'œil les deux choses que tout le jeu
// enseigne à ne pas confondre.
//
// LE VECTEUR EST L'ESSENTIEL. Le trait qui va de l'estime au point est ce que
// les visées ont corrigé — donc ce que le vent avait fait dériver. Sur un vol
// entier, la carte finit par raconter l'histoire : l'estime dérive, un point la
// rattrape, elle repart, elle redérive. Et la direction constante des
// rattrapages EST le vent qu'on avait mal prévu.
// ============================================================

// Un point par instant commun. La clé est l'heure du point, si bien que
// recalculer le MÊME carnet — après avoir changé l'erreur d'index, par exemple
// — remplace la marque au lieu d'en empiler une seconde au même endroit.
const _pointsObserves = new Map();

// Le rond du point observé. Vert, et non le bleu de l'estime : sur la carte, la
// chose dont il faut le distinguer est l'estime, et deux bleus voisins ne se
// distinguent pas. (Sur la planchette il est encre bleue, parce que là-bas la
// chose voisine est un trait de crayon gris — même règle, contexte différent.)
function iconePointObserve(heure) {
  return L.divIcon({
    className: 'point-obs-icone',
    html: '<div class="point-obs-rond"></div>'
      + `<span class="point-obs-heure">${escapeHtml(heure)}</span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  });
}

/** L'heure du point, telle qu'on l'écrit à côté d'une marque : HHMM zulu. */
function heurePoint(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(11, 16).replace(':', '') + 'Z';
}

/**
 * Porte un point observé sur la carte, avec le vecteur qui le relie à l'estime
 * dont il est parti.
 *
 * @param {object} o
 * @param {string} o.utc   instant commun du point — sert aussi de clé
 * @param {number} o.lat
 * @param {number} o.lon
 * @param {{lat:number, lon:number}} [o.depuis]  l'estime au même instant
 */
function reporterPoint({ utc, lat, lon, depuis } = {}) {
  if (!map || !Number.isFinite(lat) || !Number.isFinite(lon)) return;
  const cle = utc || String(Date.now());

  effacerPoint(cle);

  const couches = [];
  // Le vecteur d'abord : il passe SOUS la marque, pas dessus.
  if (depuis && Number.isFinite(depuis.lat) && Number.isFinite(depuis.lon)) {
    couches.push(L.polyline([[depuis.lat, depuis.lon], [lat, lon]], {
      color: '#059669',
      weight: 2,
      opacity: 0.9,
      interactive: false,
    }).addTo(map));
  }
  couches.push(L.marker([lat, lon], {
    icon: iconePointObserve(heurePoint(utc)),
    interactive: false,
    zIndexOffset: 500,
  }).addTo(map));

  _pointsObserves.set(cle, couches);
}

function effacerPoint(cle) {
  const couches = _pointsObserves.get(cle);
  if (!couches) return;
  couches.forEach((c) => { try { map.removeLayer(c); } catch (_) {} });
  _pointsObserves.delete(cle);
}

/** Table rase : nouveau vol. */
function effacerPointsObserves() {
  for (const cle of Array.from(_pointsObserves.keys())) effacerPoint(cle);
}
