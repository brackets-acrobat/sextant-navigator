/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// profil-vertical.js — profil du relief le long de la route.
// ============================================================

// ============================================================
// Profil vertical — relief GLOBE + altitudes prévues le long du plan.
// Adapté de NavXpressVFR : échantillonnage relief côté main (window.sextant.profilVertical),
// dessin SVG côté renderer (aire relief + altitude prévue en escalier + altitude
// de sécurité par leg + survol). Se rafraîchit avec le plan et les altitudes.
// ============================================================
let _vpLast = null;   // dernier résultat (re-rendu au resize / basculement legs)
let _vpRender = null; // géométrie du dernier rendu (pour le survol)
let _vpSig = null;    // signature plan+altitudes (anti-recalcul)

function vpPanelVisible() {
  const p = $('vp-panel');
  return p && !p.hidden;
}

// Waypoints (dép. + points tournants + arr.) avec leurs noms, pour l'échantillonnage.
function vpWaypoints() {
  if (!_routeDep || !_routeArr) return [];
  const noms = nomsPointsTournants(routeWaypoints);
  const depName = nettoyerIcao($('icao-dep').value) || '';
  const arrName = nettoyerIcao($('icao-arr').value) || '';
  const pts = [_routeDep, ...routeWaypoints, _routeArr];
  return pts.map((p, i) => ({
    lat: p.lat, lon: p.lon,
    name: i === 0 ? depName : (i === pts.length - 1 ? arrName : noms[i - 1]),
  }));
}

// Altitudes au format du handler : legAlt[i] = altitude du leg wp[i-1] → wp[i].
// (backcountry : getLegAlt est 0-indexé par leg → décalage de 1.)
// On envoie les altitudes SAISIES, null compris : c'est main qui comble un leg
// sans altitude par son plancher de sécurité, seul endroit où le relief est lu.
function vpLegAltitudes(nWps) {
  const arr = [null];
  for (let i = 1; i < nWps; i++) arr.push(getLegAltBrut(i - 1));
  return arr;
}

// Plancher de sécurité du leg `i` (0-indexé), tel que le dernier calcul l'a
// établi — ou null tant qu'il n'y en a pas eu. Sert de valeur par défaut à
// l'altitude du leg dans le tableau de navigation et à l'export.
function altitudeSecuriteLeg(i) {
  const legs = _vpLast && _vpLast.legs;
  if (!Array.isArray(legs) || i < 0 || i >= legs.length) return null;
  const lg = legs[i];
  return lg && Number.isFinite(lg.safeAltFt) ? lg.safeAltFt : null;
}

// Le profil est calculé MÊME panneau fermé : c'est lui qui fournit les planchers
// de sécurité, dont le tableau de navigation a besoin en permanence. Seul
// l'affichage dépend de l'ouverture du panneau.
async function mettreAJourProfilVertical() {
  const host = $('vertical-profile-graph');
  if (!host) return;
  const visible = vpPanelVisible();
  const afficher = (html) => { if (visible) { host.innerHTML = html; _vpMajHauteur(); } };

  const wps = vpWaypoints();
  if (wps.length < 2) {
    _vpLast = null; _vpSig = null;
    afficher(`<div class="vp-empty">${escapeHtml(t('vertProfileEmpty'))}</div>`);
    rafraichirTableauLegs();
    return;
  }
  const legAlt = vpLegAltitudes(wps.length);

  // Anti-recalcul : re-rend depuis le cache tant que plan + altitudes inchangés.
  const sig = JSON.stringify({ w: wps.map((p) => [p.lat, p.lon, p.name]), a: legAlt });
  if (sig === _vpSig && _vpLast) { if (visible) _renderProfilInto(host, _vpLast); return; }

  // Une erreur du process principal doit S'AFFICHER. Un `catch` muet ici a déjà
  // caché une faute d'une seule ligne pendant tout un jalon : le panneau restait
  // vide sans rien dire, et le relief était accusé à tort.
  let res;
  try {
    res = await window.sextant.profilVertical({ waypoints: wps, legAltitudes: legAlt });
  } catch (err) {
    _vpLast = null; _vpSig = null;
    afficher(`<div class="vp-empty">${escapeHtml(
      t('vertProfileError').replace('{err}', (err && err.message) || String(err)))}</div>`);
    rafraichirTableauLegs();
    return;
  }

  if (!res || !res.ok || !Array.isArray(res.dist) || res.dist.length < 2) {
    _vpLast = null; _vpSig = null;
    afficher(`<div class="vp-empty">${escapeHtml(t('vertProfileNoData'))}</div>`);
    rafraichirTableauLegs();
    return;
  }
  _vpLast = res; _vpSig = sig;
  if (visible) _renderProfilInto(host, res);
  // Les legs sans altitude saisie viennent de recevoir leur plancher : le
  // tableau de navigation les affichait encore avec le repli.
  rafraichirTableauLegs();
}

function _renderProfilInto(host, res) {
  host.innerHTML = renderProfileSummary(res) + renderProfileSVG(res);
  _attachProfileHover(host);
  _vpMajHauteur();
}

// Publie la hauteur réelle du panneau profil dans --vp-h (sur <main>), pour que
// les contrôles Leaflet du bas (barre d'échelle) soient remontés juste au-dessus.
// La bande s'ouvre à peu près vide et grandit quand le relief arrive : le
// milieu de la carte visible bouge donc APRÈS l'ouverture, d'où le recentrage
// ici aussi — sinon un simulateur en pause laisserait l'avion décalé.
let _vpHauteurPubliee = -1;
function _vpMajHauteur() {
  const panel = $('vp-panel');
  if (!panel) return;
  const h = panel.offsetHeight;
  if (h === _vpHauteurPubliee) return;   // rien n'a bougé → aucun recentrage gratuit
  _vpHauteurPubliee = h;
  document.querySelector('main').style.setProperty('--vp-h', h + 'px');
  if (suiviActif && !suiviPause) recentrerAvion();
}

// Bandeau texte : point culminant de la route + marge mini réelle ; alerte si un
// leg passe sous son altitude de sécurité.
function renderProfileSummary(res) {
  const s = res && res.summary;
  if (!s) return '';
  let txt = `${t('vertProfileSummit')} ${s.summitFt} ft`;
  if (s.minMargin) txt += ` · ${t('vertProfileMinMargin')} ${s.minMargin.clearanceFt} ft`;
  const cls = s.anyBreach ? 'vp-summary vp-summary-warn' : 'vp-summary';
  return `<div class="${cls}">${escapeHtml(txt)}${s.anyBreach ? ' <i class="ph-light ph-warning" aria-hidden="true"></i>' : ''}</div>`;
}

function renderProfileSVG(res) {
  const host = $('vertical-profile-graph');
  const W = Math.max(320, (host && host.clientWidth) || 600);
  const H = 168;
  const m = { l: 46, r: 12, t: 12, b: 28 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;

  const dist = res.dist, terr = res.terrain, plan = res.planned;
  const totalNM = res.totalNM || dist[dist.length - 1] || 1;

  let yMax = 0;
  for (const v of terr) if (v > yMax) yMax = v;
  for (const v of plan) if (v > yMax) yMax = v;
  if (Array.isArray(res.legs)) for (const lg of res.legs) if (lg.safeAltFt > yMax) yMax = lg.safeAltFt;
  yMax = Math.max(1000, yMax * 1.12);
  yMax = Math.ceil(yMax / 500) * 500;

  const X = (d) => m.l + (d / totalNM) * iw;
  const Y = (ft) => m.t + ih - (Math.max(0, ft) / yMax) * ih;

  _vpRender = { W, H, m, iw, ih, yMax, totalNM, dist, terr, legs: res.legs, wps: res.waypoints };

  let area = `M ${X(dist[0]).toFixed(1)} ${Y(0).toFixed(1)}`;
  for (let i = 0; i < dist.length; i++) area += ` L ${X(dist[i]).toFixed(1)} ${Y(terr[i]).toFixed(1)}`;
  area += ` L ${X(dist[dist.length - 1]).toFixed(1)} ${Y(0).toFixed(1)} Z`;

  let tline = '';
  for (let i = 0; i < dist.length; i++) tline += (i ? ' L ' : 'M ') + X(dist[i]).toFixed(1) + ' ' + Y(terr[i]).toFixed(1);

  let pline = '';
  for (let i = 0; i < dist.length; i++) pline += (i ? ' L ' : 'M ') + X(dist[i]).toFixed(1) + ' ' + Y(plan[i]).toFixed(1);

  let safeLines = '', breachBands = '';
  if (Array.isArray(res.legs)) {
    for (const lg of res.legs) {
      const x0 = X(lg.dStart), x1 = X(lg.dEnd), ys = Y(lg.safeAltFt);
      if (lg.breach) {
        const yp = Y(lg.plannedFt);
        breachBands += `<rect x="${x0.toFixed(1)}" y="${ys.toFixed(1)}" width="${(x1 - x0).toFixed(1)}" `
          + `height="${Math.max(0, yp - ys).toFixed(1)}" fill="#e11900" fill-opacity="0.13"/>`;
      }
      const col = lg.breach ? '#e11900' : '#b91500';
      safeLines += `<line x1="${x0.toFixed(1)}" y1="${ys.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${ys.toFixed(1)}" stroke="${col}" stroke-width="1.6"/>`;
    }
  }

  let grid = '', ylabels = '';
  for (const yt of [0, yMax / 2, yMax]) {
    const yy = Y(yt).toFixed(1);
    grid += `<line x1="${m.l}" y1="${yy}" x2="${W - m.r}" y2="${yy}" stroke="#e2e8f0" stroke-width="1"/>`;
    ylabels += `<text x="${m.l - 4}" y="${(Y(yt) + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#64748b">${Math.round(yt)}</text>`;
  }

  let wpLines = '', wpLabels = '';
  const wps = res.waypoints || [];
  for (let i = 0; i < wps.length; i++) {
    const x = X(wps[i].d).toFixed(1);
    wpLines += `<line x1="${x}" y1="${m.t}" x2="${x}" y2="${m.t + ih}" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="2,3"/>`;
    const anchor = i === 0 ? 'start' : (i === wps.length - 1 ? 'end' : 'middle');
    const name = (wps[i].name || '').slice(0, 8);
    wpLabels += `<text x="${x}" y="${H - 14}" text-anchor="${anchor}" font-size="9" fill="#64748b">${escapeHtml(name)}</text>`;
  }

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" xmlns="http://www.w3.org/2000/svg" `
    + `style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px">`
    + grid + breachBands
    + `<path d="${area}" fill="#d7e0cc" fill-opacity="0.9"/>`
    + `<path d="${tline}" fill="none" stroke="#6e8552" stroke-width="1.3"/>`
    + wpLines
    // Altitude prévue : magenta bordé de blanc, comme la route sur la carte.
    // Deux tracés superposés — le blanc dessous, 1 px plus large de chaque côté,
    // avec le MÊME pointillé pour que chaque tiret garde son liseré.
    + `<path d="${pline}" fill="none" stroke="#ffffff" stroke-width="4" stroke-dasharray="6,3"/>`
    + `<path d="${pline}" fill="none" stroke="#ff00ff" stroke-width="2" stroke-dasharray="6,3"/>`
    + safeLines
    + _vpLegend(W, m)
    + ylabels + wpLabels
    + `<text x="${m.l}" y="${m.t - 3}" font-size="9" fill="#64748b">ft</text>`
    + `</svg>`;
}

// Légende (relief / altitude prévue / altitude de sécurité) en haut à droite.
function _vpLegend(W, m) {
  const lx = W - m.r - 240, y = m.t + 6;
  const item = (dx, dessin, cle) =>
    dessin + `<text x="${lx + dx + 18}" y="${y + 3}" font-size="9" fill="#64748b">${escapeHtml(t(cle))}</text>`;

  return item(0, `<line x1="${lx}" y1="${y}" x2="${lx + 14}" y2="${y}" stroke="#6e8552" stroke-width="2"/>`, 'vertProfileTerrain')
    + item(70, `<line x1="${lx + 70}" y1="${y}" x2="${lx + 84}" y2="${y}" stroke="#ffffff" stroke-width="4" stroke-dasharray="5,3"/>`
             + `<line x1="${lx + 70}" y1="${y}" x2="${lx + 84}" y2="${y}" stroke="#ff00ff" stroke-width="2" stroke-dasharray="5,3"/>`, 'vertProfilePlanned')
    + item(150, `<line x1="${lx + 150}" y1="${y}" x2="${lx + 164}" y2="${y}" stroke="#e11900" stroke-width="2"/>`, 'vertProfileSafe');
}

function _terrainAtDist(d) {
  if (!_vpRender) return null;
  const { dist, terr } = _vpRender;
  if (!dist || !terr || dist.length === 0) return null;
  const n = dist.length;
  if (d <= dist[0]) return terr[0];
  if (d >= dist[n - 1]) return terr[n - 1];
  for (let i = 1; i < n; i++) {
    if (d <= dist[i]) {
      const span = (dist[i] - dist[i - 1]) || 1;
      return terr[i - 1] + (terr[i] - terr[i - 1]) * ((d - dist[i - 1]) / span);
    }
  }
  return terr[n - 1];
}

function _legAtDist(d) {
  if (!_vpRender || !Array.isArray(_vpRender.legs)) return null;
  const legs = _vpRender.legs;
  for (const lg of legs) if (d >= lg.dStart && d <= lg.dEnd) return lg;
  return legs.length ? legs[legs.length - 1] : null;
}

function _attachProfileHover(host) {
  if (!host || !_vpRender) return;
  const svg = host.querySelector('svg');
  if (!svg) return;
  host.style.position = 'relative';

  const tip = document.createElement('div');
  tip.className = 'vp-terrain-tooltip';
  tip.style.cssText = 'position:absolute;display:none;pointer-events:none;z-index:5;'
    + 'background:#fff;border:1px solid #cbd5e1;color:#1f2933;font-size:11px;line-height:1.35;'
    + 'padding:3px 7px;border-radius:4px;white-space:nowrap;transform:translate(-50%,-130%);'
    + 'box-shadow:0 2px 8px rgba(15,23,42,.18);';
  host.appendChild(tip);

  const { W, H, m, iw, ih, yMax, totalNM } = _vpRender;
  const Yof = (ft) => m.t + ih - (Math.max(0, ft) / yMax) * ih;

  function onMove(ev) {
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const sx = (ev.clientX - rect.left) * (W / rect.width);
    const sy = (ev.clientY - rect.top) * (H / rect.height);
    const bottomY = m.t + ih;
    if (sx < m.l || sx > W - m.r || sy < m.t || sy > bottomY + 1) { tip.style.display = 'none'; return; }

    let d = ((sx - m.l) / iw) * totalNM;
    if (d < 0) d = 0; else if (d > totalNM) d = totalNM;

    const lg = _legAtDist(d);
    let html = '';
    if (lg) html += `<span style="color:#b91500">${escapeHtml(t('vertProfileSafeFull'))} : ${lg.safeAltFt} ft</span>`;
    if (lg && Math.abs(sy - Yof(lg.plannedFt)) <= 4) {
      html += `${html ? '<br>' : ''}<span style="color:#b45309">${escapeHtml(t('vertProfilePlannedFull'))} : ${lg.plannedFt} ft</span>`;
    }
    const elev = _terrainAtDist(d);
    if (elev != null && sy >= Yof(elev) - 1) {
      html += `${html ? '<br>' : ''}<span style="color:#4a5c33">${escapeHtml(t('vertProfileGround'))} ${Math.round(elev)} ft</span>`;
    }

    if (!html) { tip.style.display = 'none'; return; }
    tip.innerHTML = html;
    tip.style.left = ((sx / W) * rect.width) + 'px';
    tip.style.top = ((sy / H) * rect.height) + 'px';
    tip.style.display = 'block';
  }
  svg.addEventListener('mousemove', onMove);
  svg.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
}

// ============================================================
// Curseur de survol — où tombe, sur le profil, le point de la route que la
// souris survole sur la carte. Piloté par dessin-route.js, qui seul sait sur
// quel leg et à quelle fraction se trouve le pointeur.
//
// Le repère est ajouté au SVG déjà rendu plutôt qu'intégré au tracé : le profil
// n'est re-rendu que quand le plan change, et il serait absurde de le
// reconstruire à chaque pixel parcouru par la souris.
// ============================================================
const VP_SVG_NS = 'http://www.w3.org/2000/svg';

// Distance cumulée (NM) du point situé à la fraction `frac` du leg `legIndex`.
// L'interpolation se fait sur les distances QUE LE PROFIL A REÇUES : les
// recalculer ici ferait dériver le repère par rapport à l'axe qu'il désigne.
function _vpDistanceSurLeg(legIndex, frac) {
  const wps = _vpRender && _vpRender.wps;
  if (!Array.isArray(wps) || !(legIndex >= 0) || legIndex + 1 >= wps.length) return null;
  const d0 = wps[legIndex].d, d1 = wps[legIndex + 1].d;
  if (!Number.isFinite(d0) || !Number.isFinite(d1)) return null;
  const f = Math.max(0, Math.min(1, Number.isFinite(frac) ? frac : 0));
  return d0 + f * (d1 - d0);
}

function vpEffacerCurseur() {
  const host = $('vertical-profile-graph');
  const g = host && host.querySelector('#vp-curseur');
  if (g && g.parentNode) g.parentNode.removeChild(g);
}

function vpCurseurSurLeg(legIndex, frac) {
  const host = $('vertical-profile-graph');
  const svg = host && host.querySelector('svg');
  if (!svg || !_vpRender || !vpPanelVisible()) return;
  const d = _vpDistanceSurLeg(legIndex, frac);
  if (d == null) { vpEffacerCurseur(); return; }

  const { m, iw, ih, yMax, totalNM } = _vpRender;
  const x = m.l + (Math.max(0, Math.min(totalNM, d)) / (totalNM || 1)) * iw;
  const sol = _terrainAtDist(d);
  const y = m.t + ih - (Math.max(0, sol == null ? 0 : sol) / yMax) * ih;

  let g = svg.querySelector('#vp-curseur');
  if (!g) {
    g = document.createElementNS(VP_SVG_NS, 'g');
    g.setAttribute('id', 'vp-curseur');
    g.setAttribute('pointer-events', 'none');   // ne vole pas le survol du profil lui-même

    const ligne = document.createElementNS(VP_SVG_NS, 'line');
    ligne.setAttribute('stroke', '#0f172a');
    ligne.setAttribute('stroke-width', '1');
    ligne.setAttribute('stroke-dasharray', '3,3');
    ligne.setAttribute('stroke-opacity', '0.55');

    // Point posé sur la courbe du relief, cerclé de blanc pour rester lisible
    // aussi bien sur l'aire verte que sur le fond clair au-dessus.
    const point = document.createElementNS(VP_SVG_NS, 'circle');
    point.setAttribute('r', '4');
    point.setAttribute('fill', '#ff7043');
    point.setAttribute('stroke', '#ffffff');
    point.setAttribute('stroke-width', '1.5');

    g.appendChild(ligne);
    g.appendChild(point);
    svg.appendChild(g);
  }

  const [ligne, point] = g.children;
  ligne.setAttribute('x1', x.toFixed(1));
  ligne.setAttribute('x2', x.toFixed(1));
  ligne.setAttribute('y1', String(m.t));
  ligne.setAttribute('y2', String(m.t + ih));
  point.setAttribute('cx', x.toFixed(1));
  point.setAttribute('cy', y.toFixed(1));
}

// Re-rendu (depuis le cache) au redimensionnement de la fenêtre.
let _vpResizeTO = null;
window.addEventListener('resize', () => {
  clearTimeout(_vpResizeTO);
  _vpResizeTO = setTimeout(() => {
    const host = $('vertical-profile-graph');
    if (host && vpPanelVisible() && _vpLast) _renderProfilInto(host, _vpLast);
  }, 200);
});

// Ouverture / fermeture du panneau du profil vertical.
const profilBtn = $('btn-profil');
function ouvrirFermerProfil(ouvrir) {
  const panel = $('vp-panel');
  panel.hidden = !ouvrir;
  profilBtn.classList.toggle('is-active', ouvrir);
  profilBtn.setAttribute('aria-pressed', String(ouvrir));
  // Remonte les contrôles Leaflet du bas (barre d'échelle) au-dessus de la bande profil.
  document.querySelector('main').classList.toggle('profil-open', ouvrir);
  // La bande vient de prendre (ou de rendre) le bas de la carte : en suivi,
  // l'avion doit revenir au milieu de ce qui reste visible, sans attendre la
  // trame suivante. Hors suivi, la carte est au pilote : on n'y touche pas.
  if (suiviActif && !suiviPause) recentrerAvion();
  if (ouvrir) mettreAJourProfilVertical();
}
profilBtn.addEventListener('click', () => ouvrirFermerProfil($('vp-panel').hidden));
$('vp-close').addEventListener('click', () => ouvrirFermerProfil(false));
