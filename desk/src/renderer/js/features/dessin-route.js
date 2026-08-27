/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// dessin-route.js — tracé de la route sur la carte.
// ============================================================

// Résout les ICAO (asynchrone) puis dessine la route. Garde anti-concurrence.
async function majLigneRoute(opts) {
  if (!routeLayer) return;
  const reqId = ++_routeReqId;
  const dep = await resoudrePointIcao($('icao-dep').value);
  const arr = await resoudrePointIcao($('icao-arr').value);
  if (reqId !== _routeReqId) return;   // une saisie plus récente a pris le relais
  _routeDep = dep; _routeArr = arr;
  dessinerRoute();
  rafraichirDeclinaison();   // recalcule la déclinaison puis ré-étiquette
  if (opts && opts.fit) centrerSurRoute();   // ex. ouverture d'un plan → recadre sur tout le tracé
}

// Recadre la carte pour englober l'entièreté du tracé (dép. + points tournants +
// arr.), longitudes déroulées (antiméridien géré comme pour le tracé). Compense
// le panneau « Plan de vol » s'il couvre le tiers droit.
function centrerSurRoute() {
  if (!map || !_routeDep || !_routeArr) return;
  const pts = [_routeDep, ...routeWaypoints, _routeArr];
  const disp = deroulerLons(pts);
  const bounds = L.latLngBounds(pts.map((p, i) => [p.lat, disp[i]]));
  if (!bounds.isValid()) return;
  const panW = legsPanelVisible() ? $('legs-panel').getBoundingClientRect().width : 0;
  map.fitBounds(bounds, {
    paddingTopLeft: [40, 40],
    paddingBottomRight: [40 + panW, 40],
    maxZoom: 12,
  });
}

// La carte vient-elle de changer de copie du monde ? Le tracé est resté dans
// l'ancienne, donc hors écran : on le repose dans celle qu'on regarde. Appelé à
// chaque fin de déplacement — le seul moment où la question se pose, puisque le
// zoom, lui, redessine déjà. La comparaison porte sur la longitude RÉELLEMENT
// dessinée : après redessin elle concorde, aucun risque de boucle.
function reposerRouteSiCopieChangee() {
  if (!_routeGeom || !_routeGeom.points.length) return;
  if (ancrerSurVue(_routeGeom.points[0].lon) !== _routeGeom.disp[0]) dessinerRoute();
}

// ============================================================
// Survol du tracé → repère sur le profil vertical.
//
// L'écoute est posée sur la CARTE, pas sur les segments : le calque d'un leg ne
// capte que l'épaisseur de son trait, trois pixels, et suivre le tracé à la
// souris y devient un exercice d'adresse. On cherche donc à chaque mouvement le
// leg le plus proche du curseur, et on ne renonce qu'au-delà d'une bande de
// tolérance — mesurée en pixels, donc constante à l'écran quel que soit le zoom.
// La valeur est l'écart à l'AXE du trait : 8 px de part et d'autre.
// ============================================================
const TOLERANCE_SURVOL_PX = 8;

// Épaisseur de la zone de saisie d'un leg (insertion d'un point tournant par
// clic-glisser). Le trait visible fait 3 px ; on ajoute 3 px de chaque côté.
const LARGEUR_PRISE_LEG = 9;

let _routeGeom = null;        // { points, disp } du dernier tracé réellement dessiné
let _survolProfilBranche = false;

function _survolProfil(e) {
  if (_routeDragging || !_routeGeom || !map) return;
  const { points: pts, disp: lons } = _routeGeom;
  if (pts.length < 2) return;

  // Projection en pixels : c'est la distance À L'ÉCRAN qui décide, la seule que
  // le pilote perçoive. La position le long du leg, elle, se calcule ensuite en
  // grand cercle — un ratio de pixels dériverait sur un leg étendu en latitude.
  const p = map.latLngToLayerPoint(e.latlng);
  let best = null;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = map.latLngToLayerPoint(L.latLng(pts[i].lat, lons[i]));
    const b = map.latLngToLayerPoint(L.latLng(pts[i + 1].lat, lons[i + 1]));
    const d = L.LineUtil.pointToSegmentDistance(p, a, b);
    if (!best || d < best.d) best = { d, i };
  }
  if (!best || best.d > TOLERANCE_SURVOL_PX) { vpEffacerCurseur(); return; }

  const i = best.i;
  vpCurseurSurLeg(i, fractionSurLeg(e.latlng, pts[i], lons[i], pts[i + 1], lons[i + 1]));
}

// Branchement différé : la carte n'existe pas encore au chargement du script.
function brancherSurvolProfil() {
  if (_survolProfilBranche || !map) return;
  _survolProfilBranche = true;
  map.on('mousemove', _survolProfil);
  map.on('mouseout', vpEffacerCurseur);
}

// Où le curseur tombe-t-il le long d'un leg ? Rend la fraction [0,1] du pied de
// la perpendiculaire, via la même projection grand-cercle que le suivi de route.
// Les longitudes passées sont celles d'AFFICHAGE (déroulées), comme celles du
// tracé : le calcul reste juste de part et d'autre de l'antiméridien.
function fractionSurLeg(latlng, a, lonA, b, lonB) {
  if (!latlng) return 0;
  const longueur = distanceNM(a.lat, lonA, b.lat, lonB);
  if (!(longueur > 0)) return 0;
  const proj = distanceVersLeg(latlng.lat, latlng.lng, a.lat, lonA, b.lat, lonB);
  if (proj.status === 'BEFORE_START') return 0;
  if (proj.status === 'AFTER_END') return 1;
  if (!Number.isFinite(proj.distanceFrom1)) return 0;
  return Math.max(0, Math.min(1, proj.distanceFrom1 / longueur));
}

// Dessine la route à partir des extrémités en cache (synchrone). `opts.wps`
// remplace les points tournants (prévisualisation pendant un drag) ;
// `opts.activeIdx` est l'index, dans la suite complète, du point déplacé.
function dessinerRoute(opts) {
  if (!routeLayer) return;
  routeLayer.clearLayers();
  const dep = _routeDep, arr = _routeArr;
  if (!dep || !arr) {   // route effacée → vide tableau + profil, et plus rien à survoler
    if (!opts) { _routeGeom = null; vpEffacerCurseur(); rafraichirTableauLegs(); mettreAJourProfilVertical(); }
    return;
  }
  const wps = (opts && opts.wps) ? opts.wps : routeWaypoints;
  const activeIdx = (opts && Number.isFinite(opts.activeIdx)) ? opts.activeIdx : -1;

  // Suite complète : départ → points tournants → arrivée, longitudes d'affichage
  // déroulées (antiméridien).
  const points = [dep, ...wps, arr];
  const disp = deroulerLons(points);

  // Un segment par leg : bordure blanche (dessous) + trait coloré selon l'état du
  // leg (actif rouge / à venir magenta / fait gris). Clic-glisser → insertion d'un point.
  const nLeg = points.length - 1;
  const actLeg = nLeg > 0 ? Math.max(0, Math.min(_legActif, nLeg - 1)) : -1;
  for (let i = 0; i < points.length - 1; i++) {
    const latlngs = [[points[i].lat, disp[i]], [points[i + 1].lat, disp[i + 1]]];
    const legCol = i === actLeg ? LEG_COL_ACTIVE : (i < actLeg ? LEG_COL_PAST : LEG_COL_NEXT);
    L.polyline(latlngs, { color: '#ffffff', weight: 5, opacity: 1 }).addTo(routeLayer);
    const seg = L.polyline(latlngs, { color: legCol, weight: 3, opacity: 1 }).addTo(routeLayer);
    // Zone de saisie invisible, posée PAR-DESSUS le trait : un tracé SVG ne
    // capte le pointeur que sur l'épaisseur de son trait, soit ±1,5 px, ce qui
    // demande une main sûre pour attraper un leg. Ce calque transparent porte
    // donc tous les gestes du segment et élargit la prise à ±4,5 px, sans rien
    // changer à ce qui est dessiné.
    const prise = L.polyline(latlngs, { color: '#000000', weight: LARGEUR_PRISE_LEG, opacity: 0 }).addTo(routeLayer);
    dessinerEtiquetteLeg(points[i], disp[i], points[i + 1], disp[i + 1]);
    const segIndex = i;
    prise.on('mouseover', () => { if (!_routeDragging) { seg.setStyle({ weight: 4 }); map.getContainer().style.cursor = 'crosshair'; } });
    prise.on('mouseout', () => { if (!_routeDragging) { seg.setStyle({ weight: 3 }); map.getContainer().style.cursor = ''; } });
    prise.on('mousedown', (e) => {
      if (e.originalEvent && e.originalEvent.button !== 0) return;   // clic gauche seulement
      // Une mesure ou un flanquement attend ce clic : on laisse passer, sinon le
      // geste insérerait un point tournant au lieu de désigner la cible.
      if (saisiePointEnCours()) return;
      L.DomEvent.stopPropagation(e);
      L.DomEvent.preventDefault(e);
      // Le point est inséré à segIndex ; il occupe l'index segIndex+1 dans la suite.
      dragPointTournant(
        (ll) => {   // temps réel : aperçu avec le point inséré sous le curseur
          const w = routeWaypoints.slice();
          w.splice(segIndex, 0, { lat: ll.lat, lon: wrapLon(ll.lng) });
          dessinerRoute({ wps: w, activeIdx: segIndex + 1 });
        },
        (ll) => {   // relâcher : enregistre le point tournant
          routeWaypoints.splice(segIndex, 0, { lat: ll.lat, lon: wrapLon(ll.lng) });
          dessinerRoute();
          rafraichirDeclinaison();
          verifierProximitePointTournant(segIndex);   // aimantation aéroport/navaid proche
        }
      );
    });
  }

  // Marqueurs des points tournants (déplaçables par clic-glisser).
  const noms = nomsPointsTournants(wps);
  for (let k = 0; k < wps.length; k++) {
    const ptIdx = k + 1;
    const actif = ptIdx === activeIdx;
    const m = L.circleMarker([wps[k].lat, disp[ptIdx]], {
      radius: actif ? 7 : 6, color: '#ffffff', weight: 2,
      fillColor: '#ff7043', fillOpacity: 0.95, opacity: 1,
    }).addTo(routeLayer);
    const idx = k;
    m.on('mouseover', () => { if (!_routeDragging) map.getContainer().style.cursor = 'grab'; });
    m.on('mouseout', () => { if (!_routeDragging) map.getContainer().style.cursor = ''; });
    m.on('mousedown', (e) => {
      if (e.originalEvent && e.originalEvent.button !== 0) return;   // clic gauche → déplacement
      if (saisiePointEnCours()) return;   // le clic est destiné à une mesure / un flanquement
      L.DomEvent.stopPropagation(e);
      L.DomEvent.preventDefault(e);
      demarrerDeplacementPoint(idx);
    });
    m.on('contextmenu', (e) => {   // clic droit → suppression du point tournant
      if (e.originalEvent) e.originalEvent.preventDefault();
      L.DomEvent.stopPropagation(e);
      const p = ctxPageXY(e);
      ouvrirMenuContextuel(p.x, p.y, [
        { label: t('ctxDeleteWp'), action: () => supprimerPointTournant(idx) },
      ]);
    });
  }

  // Points d'extrémité hors-aéroport (ZZZY départ / ZZZZ arrivée) : point rouge.
  const depCode = nettoyerIcao($('icao-dep').value);
  const arrCode = nettoyerIcao($('icao-arr').value);
  if (depCode === 'ZZZY') dessinerPointExtremite(dep.lat, disp[0]);
  if (arrCode === 'ZZZZ') dessinerPointExtremite(arr.lat, disp[points.length - 1]);

  dessinerLabelsPoints(points, disp, wps, noms);   // noms rouges à côté des points (si place nette)

  // Aperçu de drag → ni reconstruction, ni mémorisation : le profil décrit
  // encore l'ancien plan, dont les index de leg ne correspondraient plus.
  if (!opts) {
    _routeGeom = { points, disp };
    brancherSurvolProfil();
    rafraichirTableauLegs();
    mettreAJourProfilVertical();
  }
}
