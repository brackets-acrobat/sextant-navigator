/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// carte.js — carte Leaflet : fonds, échelle, suivi de l'estime.
// ============================================================

// --- Carte (fond OpenTopoMap) ---
let map = null;
// Mode « suivi » (bouton). Il suit désormais l'ESTIME, et non l'appareil : la
// position réelle n'est plus affichée nulle part, et une carte qui se centrerait
// dessus la révélerait aussi sûrement qu'un marqueur — le milieu de l'écran
// SERAIT la réponse. Voir avion.js.
// Si l'utilisateur déplace la carte, on la laisse et on recentre 5 s plus tard.
let suiviActif = localStorage.getItem('sextant-follow') === '1';
let suiviPause = false;      // déplacement utilisateur en cours → centrage suspendu
let _suiviTimer = null;      // minuteur de recentrage (5 s après déplacement)
let suiviBtnEl = null;       // bouton (pour l'état visuel actif)
const SUIVI_RECENTRE_MS = 5000;

// Fonds de carte. OpenTopoMap par défaut : le relief compte pour un vol VFR.
// Dark Matter et Positron (CARTO) sont volontairement pâles — ce sont les fonds
// qui laissent le mieux ressortir le tracé et les symboles par-dessus.
let baseLayer = null;
const BASE_LAYERS = {
  opentopomap: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    options: { maxZoom: 17, attribution: '© OpenTopoMap (CC-BY-SA), © OpenStreetMap' },
  },
  openstreetmap: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: { maxZoom: 19, attribution: '© OpenStreetMap' },
  },
  darkmatter: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    options: { maxZoom: 20, subdomains: 'abcd', attribution: '© OpenStreetMap, © CARTO' },
  },
  positron: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    options: { maxZoom: 20, subdomains: 'abcd', attribution: '© OpenStreetMap, © CARTO' },
  },
  // Google : serveurs de tuiles mt0–mt3, paramètre lyrs = couche demandée
  // (m = plan, s = satellite, p = relief ombré avec routes).
  googlemaps: {
    url: 'https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    options: { maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: '© Google' },
  },
  googlesatellite: {
    url: 'https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}',
    options: { maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: '© Google' },
  },
  googleterrain: {
    url: 'https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',
    options: { maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: '© Google' },
  },
};

// Couches de données MSFS (aéroports / héliports / hydrobases / navaids).
let airportsLayer = null, heliportsLayer = null, seaplanesLayer = null, navaidsLayer = null;

// Y a-t-il un mode qui attend un clic sur la carte pour désigner un point ?
// (mesure en cours de traçage, flanquement en attente de sa cible)
//
// Ces modes s'approprient le clic gauche. Sans cette question, tout ce qui
// intercepte le clic — le tracé de route, ses points tournants, les marqueurs
// d'aéroport, la sonde des espaces — répondrait AUSSI au geste : cliquer le
// tracé pour poser une cible y insérait un point tournant, et le clic n'arrivait
// jamais jusqu'à la carte. Chaque intercepteur pose donc cette question d'abord.
function saisiePointEnCours() {
  if (typeof mesureEnCours === 'function' && mesureEnCours()) return true;
  if (typeof flanquementAttendPoint === 'function' && flanquementAttendPoint()) return true;
  return false;
}
let _couchesTimer = null, _airReqId = 0, _navReqId = 0;
const ZOOM_MIN_COUCHES = 8;
// Les petits terrains encombrent la carte au zoom le plus large : on ne les
// affiche qu'à partir du zoom 9. Est « petit » un terrain dont la piste
// principale mesure moins de 2200 ft (longueur inconnue → on l'affiche).
const ZOOM_MIN_PISTES_COURTES = 9;
const LONGUEUR_PISTE_MIN_FT = 2200;
const TAILLES_AEROPORT = { large_airport: 9, medium_airport: 7, small_airport: 5, heliport: 6, seaplane_base: 6 };
// États des couches, persistés (off par défaut → on les fait apparaître via le menu)
const layerState = {
  airports:  localStorage.getItem('sextant-layer-airports')  === '1',
  heliports: localStorage.getItem('sextant-layer-heliports') === '1',
  seaplanes: localStorage.getItem('sextant-layer-seaplanes') === '1',
  navaids:   localStorage.getItem('sextant-layer-navaids')   === '1',
};

// L'ICÔNE D'AVION EST PARTIE. Elle vivait ici, orientée au cap, et le tracé
// magenta accumulait les positions vraies derrière elle. C'est ce qui donnait
// la réponse avant qu'on ait visé. Ce que la carte porte désormais, c'est
// l'ESTIME — cercle pointillé bleu, trace en pointillés, dessinée par
// js/features/estime.js — et rien d'autre ne sait où l'on est.

// Barre d'échelle à trois unités (km, miles, NM). Leaflet ne fournit que le
// métrique et l'impérial : on étend L.Control.Scale pour ajouter une ligne NM
// (1 NM = 1852 m). Indépendante du fond : valable sur satellite, CARTO, OSM, topo.
const ScaleTriple = L.Control.Scale.extend({
  options: { metric: true, imperial: true, nautical: true },
  _addScales(options, className, container) {
    L.Control.Scale.prototype._addScales.call(this, options, className, container);
    if (options.nautical) { this._nScale = L.DomUtil.create('div', className, container); }
  },
  _updateScales(maxMeters) {
    L.Control.Scale.prototype._updateScales.call(this, maxMeters);
    if (this.options.nautical && maxMeters) { this._updateNautical(maxMeters); }
  },
  _updateNautical(maxMeters) {
    const maxNm = maxMeters / 1852;
    if (maxNm < 1) { this._updateScale(this._nScale, '', 0); return; }  // trop zoomé : pas de NM
    const nm = this._getRoundNum(maxNm);
    this._updateScale(this._nScale, nm + ' NM', nm / maxNm);
  },
});

function initMap() {
  map = L.map('map', { zoomControl: true }).setView([46.8, 2.5], 5);  // vue par défaut (France)
  appliquerFond(localStorage.getItem('sextant-basemap') || 'opentopomap');  // OpenTopoMap par défaut
  new ScaleTriple({ position: 'bottomleft', maxWidth: 120 }).addTo(map);  // échelle km / mi / NM
  // Suivi : pendant un déplacement utilisateur, on suspend le centrage ; 5 s
  // après la fin du déplacement, on recentre sur l'avion. En mode libre, rien.
  map.on('dragstart', () => {
    if (!suiviActif) return;
    suiviPause = true;
    if (_suiviTimer) { clearTimeout(_suiviTimer); _suiviTimer = null; }
  });
  map.on('dragend', () => {
    if (!suiviActif) return;
    if (_suiviTimer) clearTimeout(_suiviTimer);
    _suiviTimer = setTimeout(() => { suiviPause = false; recentrerAvion(); }, SUIVI_RECENTRE_MS);
  });

  // Couches de données + contrôles déroulants (haut-droite). L'ordre de
  // création fait l'ordre d'empilement : les terrains et navaids d'abord, la
  // route et l'avion par-dessus.
  airportsLayer  = L.layerGroup().addTo(map);
  heliportsLayer = L.layerGroup().addTo(map);
  seaplanesLayer = L.layerGroup().addTo(map);
  navaidsLayer   = L.layerGroup().addTo(map);
  _rangeLayer    = L.layerGroup().addTo(map);   // cercles de portée (magenta)
  routeLayer     = L.layerGroup().addTo(map);   // ligne de route départ → arrivée
  ajouterBoutonSuivi();
  ajouterControlesCarte();
  initCompas();   // rose des vents (son propre pane, sous l'avion)
  map.on('moveend', planifierRafraichirCouches);
  map.on('zoomend', planifierRafraichirCouches);
  // Franchir l'antiméridien à la souris change de copie du monde : les calques,
  // posés dans l'ancienne, sortiraient de l'écran. On les y ramène.
  map.on('moveend', replacerCalquesSurVue);
  // Clic droit sur le fond de carte (hors marqueur) → départ (ZZZY) / arrivée (ZZZZ).
  map.on('contextmenu', ouvrirMenuFondCarte);
  map.on('movestart zoomstart', fermerMenuContextuel);
  // Au zoom, on ré-évalue l'affichage des étiquettes de leg (seuil de longueur).
  map.on('zoomend', () => dessinerRoute());
  rafraichirCouches();
}

// Applique (et persiste) le fond de carte. Le tileLayer va dans le tilePane,
// donc toujours SOUS les marqueurs.
function appliquerFond(key) {
  const def = BASE_LAYERS[key] || BASE_LAYERS.opentopomap;
  if (baseLayer) map.removeLayer(baseLayer);
  baseLayer = L.tileLayer(def.url, def.options).addTo(map);
  baseLayer.bringToBack();
  localStorage.setItem('sextant-basemap', BASE_LAYERS[key] ? key : 'opentopomap');
}

// ============================================================
// Copies du monde (défilement horizontal infini de Leaflet).
//
// Leaflet ne replie PAS la longitude du centre de carte : franchir la ligne de
// changement de date à la souris fait glisser la vue dans la copie du monde
// suivante (+360°), et les tuiles, qui se répètent, n'en laissent rien
// paraître. Les calques, eux, restent posés à la longitude qu'on leur donne.
// Un tracé placé à sa longitude de stockage ([-180,180]) se retrouve alors des
// dizaines de milliers de pixels hors de l'écran : invisible, alors que le
// panneau du plan, qui ne calcule que des distances et des caps, continue de
// tout afficher correctement.
//
// C'est le Pacifique qui en souffre, et lui seul : la copie de référence se
// referme justement sur l'antiméridien. Partout ailleurs, on ne quitte pas la
// copie 0 sans le vouloir.
// ============================================================

// Longitude ramenée dans la plage de 360° qui commence à `west`. Convient aux
// symboles qu'on ne dessine QUE parce qu'ils sont dans la vue (couches MSFS).
function lonVersVue(lon, west) { return west + ((((lon - west) % 360) + 360) % 360); }

// Longitude ramenée dans la copie du monde la plus proche du centre de la carte.
// Contrairement à lonVersVue, qui part du bord ouest, celle-ci garde son sens
// pour un point hors écran — le départ d'une route dont on ne voit que l'arrivée.
function ancrerSurVue(lon) {
  if (!map || !Number.isFinite(lon)) return lon;
  return lon + Math.round((map.getCenter().lng - lon) / 360) * 360;
}

// Un calque posé à `lonDessinee` a-t-il quitté la copie du monde regardée ?
// C'est la question que chaque replaceur se pose avant de bouger quoi que ce
// soit : la comparaison porte sur la longitude RÉELLEMENT dessinée, si bien
// qu'après replacement elle concorde et que rien ne se répète.
//
// Elle ne se réduit pas au numéro de copie du centre : un point posé à 179,5°
// change d'ancrage quand la vue passe de 179° à −179°, alors que le centre
// n'a pas quitté la copie 0. C'est le cas des terrains qui bordent la ligne
// de changement de date — celui, précisément, qu'on ne veut pas manquer.
function copieMondeObsolete(lonStockee, lonDessinee) {
  return ancrerSurVue(lonStockee) !== lonDessinee;
}

// Replace, dans la copie du monde qu'on regarde, tous les calques posés à des
// longitudes de stockage. Appelé à chaque fin de déplacement de la carte ;
// chacun vérifie d'abord s'il a quelque chose à faire, et ne fait rien le
// reste du temps. Les couches MSFS n'y figurent pas : elles se reconstruisent
// déjà à chaque déplacement, avec leur propre recalage (lonVersVue).
function replacerCalquesSurVue() {
  reposerRouteSiCopieChangee();
  reposerEstimeSiCopieChangee();
  reposerCerclesSiCopieChangee();
  reposerMesureSiCopieChangee();
  reposerFlanquementsSiCopieChangee();
  reposerPointsObservesSiCopieChangee();
  reposerRepereRechercheSiCopieChangee();
  reposerCompasSiCopieChangee();
}

// Largeur (px) du panneau qui recouvre la carte sur sa droite — le plan de vol.
// 0 s'il n'est pas ouvert.
function largeurPanneauDroite() {
  const p = document.querySelector('#legs-panel:not([hidden])');
  return p ? p.getBoundingClientRect().width : 0;
}

// Hauteur (px) de la bande du profil vertical, qui recouvre le bas de la carte.
// Mesurée à chaque appel plutôt que lue dans --vp-h : sa hauteur suit son
// contenu et change d'un rendu à l'autre.
function hauteurBandeBas() {
  const p = document.querySelector('#vp-panel:not([hidden])');
  return p ? p.getBoundingClientRect().height : 0;
}

// Centre de carte à viser pour qu'un point apparaisse au milieu de la partie
// VISIBLE de la carte. Le conteneur, lui, court sous les panneaux : viser le
// point tel quel le poserait au milieu du conteneur, donc caché par le panneau
// de droite, par la bande du profil, ou les deux. On décale donc le centre
// d'une demi-largeur de panneau vers la droite et d'une demi-hauteur de bande
// vers le bas — même correction que celle appliquée à l'indicateur de vent.
function centreVisiblePour(latlng) {
  const dx = largeurPanneauDroite() / 2;
  const dy = hauteurBandeBas() / 2;
  if (!map || (dx === 0 && dy === 0)) return latlng;
  const p = map.latLngToContainerPoint(latlng);
  return map.containerPointToLatLng([p.x + dx, p.y + dy]);
}

// Recentre la carte sur l'ESTIME (zoom inchangé). Le nom est resté : il est
// appelé depuis cinq fichiers, et ce qu'il fait — ramener au centre ce que l'on
// suit — n'a pas changé. Ce que l'on suit, si.
function recentrerAvion() {
  if (!map || typeof positionEstimee !== 'function') return;
  const p = positionEstimee();
  if (p) map.panTo(centreVisiblePour([p.lat, p.lon]));
}

// Active/désactive le suivi (persisté). À l'activation, recentre tout de suite.
function setSuivi(on) {
  suiviActif = on;
  localStorage.setItem('sextant-follow', on ? '1' : '0');
  suiviPause = false;
  if (_suiviTimer) { clearTimeout(_suiviTimer); _suiviTimer = null; }
  if (suiviBtnEl) suiviBtnEl.classList.toggle('active', on);
  if (on) recentrerAvion();
}

// Bouton de suivi (haut-gauche, sous le contrôle de zoom).
//
// Il s'est appelé « Suivre l'avion » jusqu'au 2026-08-22, et c'était devenu un
// mensonge : depuis la coupure, l'appareil n'est plus sur la carte du tout. Ce
// que le bouton ramène au centre, c'est l'ESTIME — là où le navigateur croit
// être. Un libellé qui promet un avion absent fait chercher un marqueur qui
// n'existe pas.
function ajouterBoutonSuivi() {
  const ctl = L.control({ position: 'topleft' });
  ctl.onAdd = function () {
    const div = L.DomUtil.create('div', 'map-follow');
    div.innerHTML = `<button class="map-follow-btn" type="button" data-i18n-title="followTitle" title="${t('followTitle')}"><i class="ph-light ph-crosshair"></i></button>`;
    L.DomEvent.disableClickPropagation(div);
    suiviBtnEl = div.querySelector('.map-follow-btn');
    suiviBtnEl.classList.toggle('active', suiviActif);
    suiviBtnEl.addEventListener('click', () => setSuivi(!suiviActif));
    return div;
  };
  ctl.addTo(map);
}
