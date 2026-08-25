/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// plan-io.js — nommage des points, sauvegarde et ouverture du plan.
// ============================================================

// --- Nommage des points tournants ---
// Nom d'un point tournant : nom personnalisé (renommé dans le tableau) en
// priorité, sinon code aimanté (ICAO/ident), sinon « WPn » numéroté
// séquentiellement — n ne s'incrémente que sur les points NON nommés.
function nomsPointsTournants(wps) {
  let n = 0;
  return wps.map((p) => {
    if (p.nom) return p.nom;
    if (p.code) return p.code;
    n += 1;
    return 'WP' + n;
  });
}

// --- Inversion du plan de vol ---
// L'arrivée devient le départ, et les points tournants sont parcourus du dernier
// au premier.
//
// Aucun renommage à écrire : « WPn » n'est PAS stocké. nomsPointsTournants le
// fabrique à la volée en numérotant les points non nommés dans l'ordre du
// tableau, et appliquerPlan écarte à la lecture tout nom de cette forme.
// Retourner le tableau suffit donc à ce que le dernier point devienne WP1,
// l'avant-dernier WP2, et ainsi de suite. Les points VRAIMENT nommés (renommés
// au tableau) et les points aimantés sur un code gardent le leur — les
// renuméroter effacerait une intention du pilote.
function inverserPlan() {
  const dep = nettoyerIcao($('icao-dep').value);
  const arr = nettoyerIcao($('icao-arr').value);
  if (!dep && !arr && routeWaypoints.length === 0) return;   // rien à inverser

  // Altitudes de leg : elles sont ancrées sur le point SOURCE du leg, qui change
  // en sens inverse. Un leg parcouru à l'envers reste pourtant le MÊME tronçon
  // de terrain et doit garder son altitude : on retourne la suite des altitudes
  // en même temps que celle des points, puis on la ré-ancre. Relevé avant
  // l'inversion, et en BRUT — seules les altitudes réellement saisies se
  // transportent, les planchers de sécurité se recalculent d'eux-mêmes.
  const nbLeg = routeWaypoints.length + 1;
  const alts = [];
  for (let i = 0; i < nbLeg; i++) alts.push(getLegAltBrut(i));
  alts.reverse();

  routeWaypoints = routeWaypoints.slice().reverse();

  // ZZZY (départ cliqué) et ZZZZ (arrivée cliquée) marquent une PLACE dans le
  // plan, pas l'identité d'un lieu : on déplace les coordonnées derrière elles
  // et on réécrit le code selon la nouvelle place. Sans quoi le champ « départ »
  // afficherait ZZZZ, et resoudrePointIcao irait chercher le mauvais point dès
  // qu'un second lieu serait cliqué.
  const ancienDep = _lieuDepartLatLng, ancienArr = _lieuArriveeLatLng;
  const estClique = (code) => code === 'ZZZY' || code === 'ZZZZ';
  const lieuDe = (code) => (code === 'ZZZY' ? ancienDep : code === 'ZZZZ' ? ancienArr : null);
  _lieuDepartLatLng  = lieuDe(arr);   // l'ancienne arrivée prend la place du départ
  _lieuArriveeLatLng = lieuDe(dep);
  $('icao-dep').value = estClique(arr) ? 'ZZZY' : arr;
  $('icao-arr').value = estClique(dep) ? 'ZZZZ' : dep;

  for (let i = 0; i < nbLeg; i++) setLegAlt(i, alts[i]);

  _legActif = 0;   // la route change de sens : le séquencement repart du premier leg
  majBoutonsPlan();
  // Pas de recadrage : le tracé couvre exactement le même terrain qu'avant, un
  // fitBounds ne ferait que bousculer la vue du pilote.
  majLigneRoute();
}

$('btn-inverser').addEventListener('click', inverserPlan);

// --- Sauvegarde du plan de vol (.snfp) ---
// Construit l'objet plan à partir de l'état courant (ICAO + points tournants).
function construirePlan() {
  const dep = nettoyerIcao($('icao-dep').value);
  const arr = nettoyerIcao($('icao-arr').value);
  const noms = nomsPointsTournants(routeWaypoints);
  return {
    format: 'snfp',
    version: 1,
    depart: dep || null,
    arrivee: arr || null,
    // Départ / arrivée hors-aéroport (ZZZY / ZZZZ) : on conserve les coordonnées.
    departPoint: (dep === 'ZZZY' && _lieuDepartLatLng)
      ? { lat: _lieuDepartLatLng.lat, lon: wrapLon(_lieuDepartLatLng.lng) } : null,
    arriveePoint: (arr === 'ZZZZ' && _lieuArriveeLatLng)
      ? { lat: _lieuArriveeLatLng.lat, lon: wrapLon(_lieuArriveeLatLng.lng) } : null,
    // Altitude planifiée du premier leg (au départ) ; celles des autres legs
    // sont portées par les points tournants ci-dessous.
    departAlt: Number.isFinite(_legAltDep) ? _legAltDep : null,
    // code = ICAO/ident si aimanté (sinon null) ; nom = code ou « WPn » ; alt = altitude du leg partant de ce point.
    pointsTournants: routeWaypoints.map((p, i) => ({
      lat: p.lat, lon: p.lon, code: p.code || null, nom: noms[i],
      alt: Number.isFinite(p.alt) ? p.alt : null,
    })),
    // Flanquements VOR : identité de la station et positions seulement. Radial
    // et distance sont recalculés à la lecture, la déclinaison ayant pu changer.
    flanquements: flanquementsEnregistrables(),
    // Paramètres de navigation : vitesse propre et vent prévu (direction
    // MAGNÉTIQUE d'où vient le vent). Les temps par branche en découlent — ils
    // ne sont pas stockés, ils se recalculent.
    vitessePropre: Number.isFinite(_planVp) ? _planVp : null,
    ventDir: Number.isFinite(_planVentDir) ? _planVentDir : null,
    ventKt: Number.isFinite(_planVentKt) ? _planVentKt : null,
    cree: new Date().toISOString(),
  };
}

// Le plan n'est enregistrable que s'il a au moins un ICAO départ ET arrivée.
function planEnregistrable() {
  return !!nettoyerIcao($('icao-dep').value) && !!nettoyerIcao($('icao-arr').value);
}
function majBoutonsPlan() {
  const pret = planEnregistrable();
  $('btn-save-plan').disabled = !pret;
}

$('btn-save-plan').addEventListener('click', async () => {
  if (!planEnregistrable()) return;   // garde-fou (le bouton est aussi désactivé)
  const dep = nettoyerIcao($('icao-dep').value);
  const arr = nettoyerIcao($('icao-arr').value);
  let res;
  try {
    res = await window.sextant.sauverPlan({ nomSuggere: `${dep} - ${arr}`, titre: t('savePlanTitle'), plan: construirePlan() });
  } catch (err) {
    res = { ok: false, error: (err && err.message) || String(err) };
  }
  if (res && !res.ok && !res.canceled) {
    console.error(t('savePlanErr').replace('{err}', res.error || '?'));
  }
});

// --- Chargement d'un plan de vol (.snfp) ---
// Restaure l'état (ICAO, point d'arrivée ZZZZ, points tournants avec leurs codes)
// puis redessine la route.
function appliquerPlan(plan) {
  if (!plan || typeof plan !== 'object') return;
  $('icao-dep').value = nettoyerIcao(plan.depart || '');
  $('icao-arr').value = nettoyerIcao(plan.arrivee || '');
  const dp = plan.departPoint, ap = plan.arriveePoint;
  _lieuDepartLatLng = (dp && Number.isFinite(dp.lat) && Number.isFinite(dp.lon))
    ? L.latLng(dp.lat, dp.lon) : null;
  _lieuArriveeLatLng = (ap && Number.isFinite(ap.lat) && Number.isFinite(ap.lon))
    ? L.latLng(ap.lat, ap.lon) : null;
  routeWaypoints = Array.isArray(plan.pointsTournants)
    ? plan.pointsTournants
        .filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon))
        .map((p) => {
          const wp = { lat: p.lat, lon: p.lon, code: p.code || null };
          // Nom vraiment personnalisé (ni WPn auto, ni simple recopie du code) → restauré.
          if (p.nom && p.nom !== (p.code || '') && !/^WP\d+$/.test(p.nom)) wp.nom = p.nom;
          if (Number.isFinite(p.alt)) wp.alt = p.alt;   // altitude du leg partant de ce point
          return wp;
        })
    : [];
  _legAltDep = Number.isFinite(plan.departAlt) ? plan.departAlt : null;
  _legActif = 0;   // nouveau plan chargé → leg actif = premier
  // Paramètres de navigation : un plan qui en porte impose les siens, fût-ce
  // des cases vides. Les plans antérieurs à leur introduction n'ont aucune de
  // ces clés — la saisie en cours est alors laissée intacte plutôt qu'effacée.
  if ('vitessePropre' in plan || 'ventDir' in plan || 'ventKt' in plan) {
    appliquerParamsNav({ vp: plan.vitessePropre, ventDir: plan.ventDir, ventKt: plan.ventKt });
  }
  majBoutonsPlan();
  majLigneRoute({ fit: true });   // re-résout les ICAO, redessine, recalcule la déclinaison, recadre sur le tracé
  chargerFlanquements(plan.flanquements);   // absent des plans antérieurs : la liste est alors vide
}

// Nouveau plan : réinitialise tout l'état (ICAO, points de dép./arr. cliqués,
// points tournants) et efface la route.
function reinitialiserPlan() {
  $('icao-dep').value = '';
  $('icao-arr').value = '';
  _lieuDepartLatLng = null;
  _lieuArriveeLatLng = null;
  routeWaypoints = [];
  _legAltDep = null;
  _legActif = 0;
  effacerCercles();   // comme NavXpressVFR : « Nouveau plan » efface aussi les cercles
  effacerTousFlanquements();   // les flanquements visent des points de CETTE route
  // Vitesse propre et vent : DÉLIBÉRÉMENT conservés. L'avion du jour et le vent
  // du jour ne changent pas parce qu'on retrace une route ; les ressaisir à
  // chaque essai serait une corvée. Un plan chargé, lui, impose les siens.
  majBoutonsPlan();
  majLigneRoute();   // dép./arr. vides → la route est effacée
}

// Y a-t-il un plan en cours (qui mérite une confirmation avant d'être abandonné) ?
function planEnCours() {
  return !!nettoyerIcao($('icao-dep').value) || !!nettoyerIcao($('icao-arr').value)
    || routeWaypoints.length > 0;
}

$('btn-new-plan').addEventListener('click', () => {
  if (!planEnCours()) { reinitialiserPlan(); return; }   // rien à perdre → pas de confirmation
  $('newplan-overlay').hidden = false;
});
$('btn-newplan-cancel').addEventListener('click', () => { $('newplan-overlay').hidden = true; });
$('btn-newplan-ok').addEventListener('click', () => {
  $('newplan-overlay').hidden = true;
  reinitialiserPlan();
});

$('btn-open-plan').addEventListener('click', async () => {
  let res;
  try { res = await window.sextant.ouvrirPlan({ titre: t('openPlanTitle') }); }
  catch (err) { res = { ok: false, error: (err && err.message) || String(err) }; }
  if (!res || res.canceled) return;
  if (!res.ok || !res.plan) { console.error(t('openPlanErr').replace('{err}', (res && res.error) || '?')); return; }
  appliquerPlan(res.plan);
});
