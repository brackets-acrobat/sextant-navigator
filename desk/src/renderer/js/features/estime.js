/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// estime.js — où l'on croit être, sur la carte et dans le carnet.
//
// L'estime elle-même est tenue par le process principal (main/estime.js), et
// c'est délibéré : là-bas, elle ne reçoit que quatre nombres — le cap, le
// badin, le vent PRÉVU et l'heure — et la vitesse sol du simulateur ne peut
// pas l'atteindre. Ce fichier n'en montre que le résultat.
//
// Le VENT PRÉVU part d'ici : il est saisi dans le bandeau du plan de vol, et
// c'est la seule chose que l'interface envoie à l'estime. Voir vent-plan.js,
// qui explique pourquoi le vent du simulateur n'y entre plus.
// ============================================================

let _estimeEtat = null;
let _estimeMarker = null;
let _estimeTrace = null;

// Points de la trace en COORDONNÉES DE STOCKAGE, à côté de la polyligne qui les
// affiche. La carte défilant à l'infini, la longitude d'affichage d'un point
// dépend de la copie du monde regardée (cf. ancrerSurVue) : sans la donnée
// d'origine, une trace posée avant de franchir la ligne de changement de date
// serait irrécupérable.
let _estimeTracePts = [];
// Traces des estimes précédentes, abandonnées par un calage sur point observé.
// Elles restent sur la carte — c'est tout l'intérêt, voir recalerEstimeSur —
// donc elles doivent, elles aussi, pouvoir suivre la vue. { couche, pts }
let _estimeTracesAnciennes = [];

/**
 * Où l'on croit être, ou `null` si l'estime n'est pas calée.
 *
 * C'EST LA SEULE POSITION QUE LE RENDERER CONNAISSE DÉSORMAIS. Le suivi de la
 * carte s'y recentre, le catalogue d'astres y précalcule, et la position vraie
 * n'est plus affichée nulle part — voir avion.js, qui a perdu le marqueur
 * d'avion, la vitesse sol, le vent et les coordonnées du bandeau.
 */
function positionEstimee() {
  const e = _estimeEtat;
  return e && e.calee && Number.isFinite(e.lat) && Number.isFinite(e.lon)
    ? { lat: e.lat, lon: e.lon } : null;
}

// Trace de l'estime : on garde un point tous les quarts de mille, sinon la
// polyligne enfle de deux points par seconde pour un trait qui ne change pas.
const ESTIME_PAS_NM = 0.25;
let _estimeDernierPoint = null;

// L'estime n'est pas l'avion : le marqueur doit se lire comme une SUPPOSITION.
// Cercle en pointillés, croix au centre, aucune orientation — on ne prétend
// pas savoir dans quel sens on est, seulement où l'on croit être.
const ICONE_ESTIME = L.divIcon({
  className: 'estime-icone',
  html: '<div class="estime-rond"><span class="estime-croix"></span></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

function distanceNmSimple(a, b) {
  return Math.hypot(
    (a.lat - b.lat) * 60,
    (a.lon - b.lon) * 60 * Math.cos((b.lat * Math.PI) / 180),
  );
}

// Latitudes/longitudes d'affichage d'une trace : longitudes déroulées à partir
// de la copie du monde regardée, comme pour le tracé de route.
function _estimeLatLngs(pts) {
  const disp = deroulerLons(pts);
  return pts.map((p, i) => [p.lat, disp[i]]);
}

function dessinerEstimeCarte(e) {
  if (!map) return;
  if (!e.calee) {
    if (_estimeMarker) { map.removeLayer(_estimeMarker); _estimeMarker = null; }
    if (_estimeTrace) { map.removeLayer(_estimeTrace); _estimeTrace = null; }
    _estimeTracePts = [];
    _estimeDernierPoint = null;
    return;
  }
  // Position d'AFFICHAGE : la carte peut se trouver dans une autre copie du
  // monde que celle où la longitude est stockée. Sans ce recalage, l'estime
  // disparaît de l'écran dès qu'on a franchi la ligne de changement de date —
  // et c'est le seul repère de position que la carte porte encore.
  const ll = [e.lat, ancrerSurVue(e.lon)];
  if (!_estimeMarker) {
    _estimeMarker = L.marker(ll, { icon: ICONE_ESTIME, interactive: false }).addTo(map);
    // Première estime : on cadre dessus. C'est le seul repère de position que
    // la carte porte encore, et sans ce cadrage elle resterait sur la France
    // pendant qu'on vole au large de la Californie.
    map.setView(ll, 11);
    map.panTo(centreVisiblePour(ll), { animate: false });
  } else {
    _estimeMarker.setLatLng(ll);
    // Le suivi suit l'estime — c'est ce qu'il suit désormais, voir carte.js.
    if (suiviActif && !suiviPause) map.panTo(centreVisiblePour(ll));
  }

  // Trace en pointillés, dans le bleu de l'application : elle se distingue au
  // premier regard du tracé plein magenta de l'appareil.
  if (!_estimeTrace) {
    _estimeTracePts = [{ lat: e.lat, lon: e.lon }];
    _estimeTrace = L.polyline(_estimeLatLngs(_estimeTracePts), { color: '#2563eb', weight: 2, dashArray: '5 5', interactive: false }).addTo(map);
    _estimeDernierPoint = { lat: e.lat, lon: e.lon };
    return;
  }
  if (!_estimeDernierPoint || distanceNmSimple({ lat: e.lat, lon: e.lon }, _estimeDernierPoint) >= ESTIME_PAS_NM) {
    _estimeTracePts.push({ lat: e.lat, lon: e.lon });
    // Déroulé par rapport au point précédent AFFICHÉ : un pas de trace fait un
    // quart de mille, jamais un demi-tour du monde.
    _estimeTrace.setLatLngs(_estimeLatLngs(_estimeTracePts));
    _estimeDernierPoint = { lat: e.lat, lon: e.lon };
  }
}

// Ramène le marqueur et les traces dans la copie du monde regardée. Les traces
// abandonnées en font partie : elles racontent ce que le vent avait fait, et
// n'auraient aucune raison de s'effacer parce qu'on a franchi l'antiméridien.
function reposerEstimeSiCopieChangee() {
  if (!map) return;
  if (_estimeMarker && _estimeEtat && _estimeEtat.calee
      && copieMondeObsolete(_estimeEtat.lon, _estimeMarker.getLatLng().lng)) {
    _estimeMarker.setLatLng([_estimeEtat.lat, ancrerSurVue(_estimeEtat.lon)]);
  }
  const replacerTrace = (couche, pts) => {
    if (!couche || !pts.length) return;
    const dessinees = couche.getLatLngs();
    if (!dessinees.length || !copieMondeObsolete(pts[0].lon, dessinees[0].lng)) return;
    couche.setLatLngs(_estimeLatLngs(pts));
  };
  replacerTrace(_estimeTrace, _estimeTracePts);
  _estimeTracesAnciennes.forEach((t) => replacerTrace(t.couche, t.pts));
}

// --- Le bandeau du carnet ----------------------------------------------------

const dureeCourte = (s) => {
  if (!Number.isFinite(s)) return '—';
  const m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}` : `${m} min`;
};

function renderEstime() {
  const el = $('estime-bandeau');
  if (!el) return;
  const e = _estimeEtat;

  if (!e || !e.calee) {
    el.className = 'estime-bandeau estime-absente';
    el.textContent = t('estimeAbsente');
    return;
  }

  // L'ÂGE EST LA MESURE HONNÊTE de ce que vaut une estime. Trois minutes après
  // un point, elle est bonne ; une heure après, elle ne vaut plus grand-chose,
  // et c'est le moment de reprendre des visées.
  const vieille = Number.isFinite(e.ageS) && e.ageS > 1800;
  el.className = 'estime-bandeau' + (vieille ? ' estime-vieille' : '');

  const bouts = [
    `<span class="estime-pos">${escapeHtml(formatLatCourt(e.lat))} ${escapeHtml(formatLonCourt(e.lon))}</span>`,
  ];
  if (e.auSol) {
    bouts.push(`<span class="estime-origine">${escapeHtml(t('estimeAuSol'))}</span>`);
  } else {
    if (Number.isFinite(e.route)) {
      bouts.push(`<span class="estime-nav">Rt ${String(Math.round(e.route) % 360).padStart(3, '0')}°`
        + ` · ${Math.round(e.gs)} kt`
        + (Number.isFinite(e.derive) ? ` · ${t('estimeDerive')} ${e.derive >= 0 ? '+' : '−'}${Math.abs(e.derive).toFixed(0)}°` : '')
        + '</span>');
    }
    bouts.push(`<span class="estime-age">${escapeHtml(t('estimeAge').replace('{age}', dureeCourte(e.ageS)))}</span>`);
    bouts.push(`<span class="estime-origine">${escapeHtml(t('estimeOrigine' + (e.origine === 'point' ? 'Point' : 'Estime')))}</span>`);
  }
  el.innerHTML = bouts.join(' ');
}

// Latitude et longitude en degrés et minutes, format court — c'est ce qu'on
// recopie sur un carnet, pas des degrés décimaux à cinq chiffres.
function formatLatCourt(v) {
  if (!Number.isFinite(v)) return '—';
  const d = Math.floor(Math.abs(v));
  const m = (Math.abs(v) - d) * 60;
  return `${v >= 0 ? 'N' : 'S'} ${d}° ${m.toFixed(1).padStart(4, '0')}′`;
}
function formatLonCourt(v) {
  if (!Number.isFinite(v)) return '—';
  const d = Math.floor(Math.abs(v));
  const m = (Math.abs(v) - d) * 60;
  return `${v >= 0 ? 'E' : 'W'} ${String(d).padStart(3, '0')}° ${m.toFixed(1).padStart(4, '0')}′`;
}

// --- Le vent prévu, poussé vers l'estime -------------------------------------

// Envoyé au changement, pas en continu : c'est une saisie, pas un flux. Le
// dernier envoi est mémorisé pour ne pas traverser l'IPC à chaque frappe qui
// ne change rien.
let _dernierVentEnvoye = '';
function pousserVentPrevu() {
  const v = ventPrevu();
  const cle = `${v.dir}/${v.kt}`;
  if (cle === _dernierVentEnvoye) return;
  _dernierVentEnvoye = cle;
  window.sextant.estimeVent(v.dir, v.kt).then((e) => { _estimeEtat = e; renderEstime(); });
}

// --- Branchements ------------------------------------------------------------

window.sextant.onEstime((e) => {
  _estimeEtat = e;
  dessinerEstimeCarte(e);
  renderEstime();
});

// Recale l'estime sur un point observé. C'est la boucle du navigateur : on
// vise, on fait le point, on repart de là.
/**
 * @param {number} lat
 * @param {number} lon
 * @param {string} [utc]  l'INSTANT COMMUN du point, en heure simulateur.
 *
 * L'HEURE N'EST PAS CELLE DU PC. Elle l'était jusqu'au 2026-08-22, et c'est
 * devenu faux le jour où l'estime est passée à l'horloge du simulateur : un
 * `Date.now()` injecté là ferait sauter son horloge de plusieurs décennies
 * quand on vole une nuit de 1943, et le plot air compterait un temps écoulé
 * absurde au point suivant. Sans heure, l'estime garde la sienne.
 */
async function recalerEstimeSur(lat, lon, utc, origine = 'point') {
  // À défaut d'instant donné, celui du SIMULATEUR — jamais celui du PC. Un
  // calage manuel en vol historique inscrirait sinon 2026 dans une estime qui
  // compte en 1943, et le transport des droites irait chercher ses routes à
  // des décennies de là.
  const brut = utc || (typeof derniereTrame !== 'undefined' && derniereTrame
    ? derniereTrame.simUtc : null);
  const t = brut ? Date.parse(brut) : NaN;
  const e = await window.sextant.estimeCaler({
    lat, lon, origine, t: Number.isNaN(t) ? undefined : t,
  });
  _estimeEtat = e;
  dessinerEstimeCarte(e);
  renderEstime();

  // LA TRACE PRÉCÉDENTE RESTE SUR LA CARTE, et l'estime repart du point.
  //
  // Elle était effacée jusqu'au 2026-08-22, et c'était dommage : le moment le
  // plus instructif de toute la boucle — l'estime était là, le point dit ici,
  // l'écart est ce que le vent a fait — durait zéro image, effacé par le geste
  // même qui l'appliquait. On lâche simplement la référence : la polyligne
  // reste sur la carte, et personne n'a plus à la connaître. La continuité
  // n'est pas perdue pour autant — le vecteur de correction relie les deux.
  //
  // « Personne » à un détail près : on garde de quoi la REPLACER quand la carte
  // change de copie du monde. Sans ses points d'origine, une trace abandonnée
  // avant de franchir la ligne de changement de date resterait dans l'ancienne
  // copie, hors écran et sans moyen d'en revenir.
  if (_estimeTrace && _estimeTracePts.length) {
    _estimeTracesAnciennes.push({ couche: _estimeTrace, pts: _estimeTracePts });
  }
  _estimeTrace = null;
  _estimeTracePts = [];
  _estimeDernierPoint = null;
  return e;
}
