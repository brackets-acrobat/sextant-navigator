/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// visees.js — le carnet du navigateur.
//
// Ce que le sextant a envoyé, ce que ça donne une fois réduit, et le point.
// C'est la feuille de travail : les visées brutes, l'estime en bandeau, et en
// bas ce qu'on en tire.
//
// LE Hs RESTE BRUT dans le tableau. Un Hs n'est pas un Ho — il porte l'erreur
// d'index, la réfraction et la parallaxe — et l'afficher comme s'il l'était
// mentirait d'une bonne dizaine de minutes d'arc. La réduction ajoute ses
// colonnes à côté, elle ne réécrit pas la lecture.
//
// LA POSITION RÉELLE NE PARVIENT JAMAIS ICI, ni la vitesse sol, ni la route
// sol : le process principal les retient (voir main/visees.js). Ce fichier ne
// pourrait pas les divulguer même par accident, ce qui est le seul niveau de
// garantie qui vaille quand tout le jeu tient sur cette ignorance. Le
// débriefing est la seule porte, et elle ne s'ouvre qu'après un point rendu.
// ============================================================

let _viseesData = [];
let _reduction = null;    // dernière réduction obtenue du noyau
let _debriefing = null;   // les scellés, une fois ouverts
// Le vent DÉDUIT du point — pas celui du simulateur, qui reste sous scellés.
// Position air contre point observé, divisé par le temps écoulé.
let _ventCalcule = null;

function viseesPanelVisible() {
  const p = $('visees-panel');
  return p && !p.hidden;
}

// Hs brut : degrés et minutes, comme le compteur du sextant. C'est la lecture,
// pas une hauteur observée — d'où l'en-tête « Hs » et pas « Ho ».
function hsLisible(deg) {
  if (!Number.isFinite(deg)) return '—';
  const signe = deg < 0 ? '-' : '';
  const a = Math.abs(deg);
  const d = Math.floor(a);
  const m = (a - d) * 60;
  return `${signe}${d}° ${m.toFixed(1).padStart(4, '0')}′`;
}

function heureLisible(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(11, 19) + ' Z';
}

function dateLisible(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}

async function rafraichirVisees() {
  const res = await window.sextant.viseesListe();
  _viseesData = res && res.ok ? res.visees : [];
  dessinerVisees();
}

function dessinerVisees() {
  if (!viseesPanelVisible()) return;
  const tbody = $('visees-tbody');
  $('visees-empty').hidden = _viseesData.length > 0;
  $('visees-total').textContent = String(_viseesData.length);

  tbody.innerHTML = _viseesData.map((v) => {
    const duree = Number.isFinite(v.seconds) ? `${Math.round(v.seconds)} s` : '—';
    // La durée d'intégration n'est pas décorative : c'est elle qui dit ce que
    // vaut la moyenne de la bulle. Sous une minute, la visée est nerveuse.
    const dureeCls = Number.isFinite(v.seconds) && v.seconds < 60 ? ' visees-court' : '';
    const alt = Number.isFinite(v.flight.altitudeFt) ? Math.round(v.flight.altitudeFt) : '—';

    // La réduction, si elle a été faite : la hauteur observée, l'azimut, et
    // l'intercept avec son sens. C'est ce que le navigateur porte sur sa
    // feuille — et tant qu'il n'a pas fait le point, ces trois cases sont vides.
    const r = _reduction && _reduction.ok
      ? _reduction.lignes.find((l) => l.id === v.id) : null;
    const inter = r
      ? `${Math.abs(r.interceptNm).toFixed(1)} ${r.toward ? t('viseesVers') : t('viseesLoin')}`
      : '—';

    return `<tr data-visee="${escapeHtml(v.id)}">`
      + `<td class="visees-date">${escapeHtml(dateLisible(v.utc))}</td>`
      + `<td class="legs-num">${escapeHtml(heureLisible(v.utc))}</td>`
      + `<td class="astres-nom">${escapeHtml(nomAstre(v.body))}</td>`
      + `<td class="legs-num">${escapeHtml(hsLisible(v.hs))}</td>`
      + `<td class="legs-num visees-reduit">${r ? escapeHtml(hsLisible(r.ho)) : '—'}</td>`
      + `<td class="legs-num visees-reduit">${r ? String(Math.round(r.zn) % 360).padStart(3, '0') + '°' : '—'}</td>`
      + `<td class="legs-num visees-reduit visees-intercept">${escapeHtml(inter)}</td>`
      + `<td class="legs-num${dureeCls}">${escapeHtml(duree)}</td>`
      + `<td class="legs-num">${alt}</td>`
      + `<td class="visees-sup"><button type="button" class="visees-sup-btn" data-sup="${escapeHtml(v.id)}"`
      + ` title="${escapeHtml(t('viseesSupprimer'))}"><i class="ph-light ph-trash"></i></button></td>`
      + '</tr>';
  }).join('');
}

// --- Réduction, point, débriefing --------------------------------------------

/** L'erreur d'index que le navigateur CROIT avoir. Zéro tant qu'il n'a rien étalonné. */
function erreurIndexCrue() {
  const v = parseFloat(String($('visees-ie').value || '').replace(',', '.'));
  return Number.isFinite(v) ? v : 0;
}

// Le point. L'estime, la route et la vitesse CRUES viennent du process
// principal : l'interface ne les tient pas, et ne peut donc pas les confondre
// avec celles du simulateur.
async function faireLePoint() {
  _debriefing = null;
  _reduction = await window.sextant.reduire({ indexError: erreurIndexCrue() });

  // LE VENT VIENT AVEC LE POINT, parce qu'il en découle : c'est le même travail.
  // On demande le vent à L'INSTANT COMMUN des visées, pas à maintenant — le
  // point décrit cet instant-là, et à 150 kt une minute d'écart vaut deux
  // milles et demi de vent imaginaire.
  _ventCalcule = null;
  if (_reduction && _reduction.ok && _reduction.point) {
    _ventCalcule = await window.sextant.estimeVentCalcule({
      lat: _reduction.point.lat,
      lon: _reduction.point.lon,
      t: Date.parse(_reduction.point.commonUtc),
    });

    // LE POINT VA SUR LA CARTE dès qu'il est fait, comme le navigateur le
    // reporte de sa planchette sur sa carte. Il y est daté, et le vecteur qui
    // le relie à l'estime montre ce que les visées ont corrigé. La clé est
    // l'instant commun : refaire le point sur le même carnet remplace la
    // marque au lieu d'en empiler une seconde au même endroit.
    if (typeof reporterPoint === 'function') {
      reporterPoint({
        utc: _reduction.point.commonUtc,
        lat: _reduction.point.lat,
        lon: _reduction.point.lon,
        depuis: _reduction.assumed,
      });
    }
  }

  dessinerVisees();
  dessinerPoint();
}

// Une visée de plus, une visée de moins, une estime recalée : le point d'avant
// ne décrit plus le carnet d'à présent. On l'efface plutôt que de le laisser
// mentir d'une ligne.
function perimerPoint() {
  _reduction = null;
  _debriefing = null;
  _ventCalcule = null;
}

function dessinerPoint() {
  const el = $('visees-point');
  if (!el) return;
  const r = _reduction;
  if (!r) { el.hidden = true; return; }
  el.hidden = false;

  if (!r.ok) {
    const cle = {
      estime: 'viseesErrEstime', 'carnet-vide': 'viseesErrVide',
      noyau: 'viseesErrNoyau', calcul: 'viseesErrCalcul',
    }[r.error] || 'viseesErrCalcul';
    el.className = 'visees-point astres-alerte';
    el.textContent = t(cle);
    return;
  }
  el.className = 'visees-point';

  if (!r.point) {
    // Une seule droite. Ce n'est pas un échec : une droite de hauteur vaut
    // quelque chose — simplement, ce n'est pas une position.
    el.innerHTML = `<span class="visees-point-lbl">${escapeHtml(t('viseesUneDroite'))}</span>`;
    return;
  }

  const p = r.point;
  const q = r.qualite;
  const bouts = [
    `<span class="visees-point-lbl">${escapeHtml(t('viseesPointTitre'))}</span>`,
    `<strong class="visees-point-pos">${escapeHtml(formatLatCourt(p.lat))} ${escapeHtml(formatLonCourt(p.lon))}</strong>`,
    `<span class="astres-best-chiffres">${escapeHtml(t('viseesEcartEstime'))} ${p.ecartEstimeNm.toFixed(1)} NM`
      + ` · ${escapeHtml(t('viseesChapeau'))} ${p.rmsNm.toFixed(2)} NM</span>`,
  ];
  if (Number.isFinite(q.cutMin)) {
    bouts.push(`<span class="astres-verdict ${classeVerdict(q.dilution, q.ideal)}">`
      + `${escapeHtml(t('astresCoupe'))} ${q.cutMin.toFixed(0)}° · ×${(q.dilution || 0).toFixed(2)}</span>`);
  }
  bouts.push(`<button id="visees-recaler" class="astres-mini-btn" type="button">${escapeHtml(t('viseesRecaler'))}</button>`);
  bouts.push(`<button id="visees-debrief" class="astres-mini-btn" type="button">${escapeHtml(t('viseesDebrief'))}</button>`);

  // LE VENT CALCULÉ. Il ne vient pas du simulateur : il se déduit de l'écart
  // entre la position air — cap et badin, sans vent — et le point observé. La
  // droite de hauteur ne rend donc pas seulement une position, elle rend aussi
  // le vent, et c'est lui qui tiendra l'estime jusqu'au point suivant.
  //
  // Quand il ne peut PAS être mesuré, on le dit. Un indicateur qui disparaît
  // sans explication se fait chercher — cette leçon a déjà coûté une Lune et
  // une liste d'astres.
  bouts.push(ligneVentCalcule());

  // LE CHAPEAU NE PROUVE RIEN, et c'est le piège que le navigateur doit
  // connaître : une erreur commune à toutes les visées le resserre tout en
  // déplaçant le point. On le dit là où il se lit.
  bouts.push(`<span class="visees-avertissement">${escapeHtml(t('viseesChapeauMent'))}</span>`);

  if (_debriefing && _debriefing.ok) {
    const d = _debriefing;
    bouts.push('<span class="visees-debrief">'
      + escapeHtml(t('viseesDebriefLigne')
        .replace('{point}', d.erreurPointNm.toFixed(1))
        .replace('{estime}', d.erreurEstimeNm === null ? '—' : d.erreurEstimeNm.toFixed(1))
        .replace('{gain}', d.gainNm === null ? '—' : (d.gainNm >= 0 ? '+' : '') + d.gainNm.toFixed(1)))
      + '</span>');
  } else if (_debriefing && !_debriefing.ok) {
    bouts.push(`<span class="visees-avertissement">${escapeHtml(t('viseesDebriefImpossible'))}</span>`);
  }

  el.innerHTML = bouts.join(' ');

  // Recaler l'estime sur le point : c'est la boucle du navigateur. On vise, on
  // fait le point, on repart de là.
  $('visees-recaler').addEventListener('click', async () => {
    // L'instant du point part avec lui : l'estime tourne à l'heure du
    // simulateur, et c'est cet instant-là que le point décrit.
    await recalerEstimeSur(p.lat, p.lon, p.commonUtc);
    perimerPoint();
    dessinerVisees();
    dessinerPoint();
  });

  // Adopter le vent trouvé : il devient le vent PRÉVU, celui avec lequel
  // l'estime va courir jusqu'au point suivant. C'est la boucle complète du
  // navigateur — on vise, on trouve où l'on est ET le vent qu'on subit, et l'on
  // repart avec les deux.
  const boutonVent = $('visees-vent-adopter');
  if (boutonVent) {
    boutonVent.addEventListener('click', () => {
      const v = _ventCalcule;
      if (!v || !v.ok || v.windFromDeg === null) return;
      const actuel = typeof ventPrevu === 'function' ? ventPrevu() : {};
      appliquerParamsNav({
        vp: actuel.vp,
        ventDir: Math.round(v.windFromDeg) % 360,
        ventKt: Math.round(v.windKt),
      });
      dessinerPoint();
    });
  }

  // Le débriefing ouvre les scellés — et pas avant.
  $('visees-debrief').addEventListener('click', async () => {
    _debriefing = await window.sextant.debriefer({
      point: { lat: p.lat, lon: p.lon },
      estime: r.assumed,
    });
    dessinerPoint();
  });
}

// Le vent déduit du point, en une ligne — ou la raison pour laquelle il n'y en
// a pas. Un vent en trois chiffres : direction D'OÙ il vient, et force.
function ventLisible(dir, kt) {
  return `${String(Math.round(dir) % 360).padStart(3, '0')}° / ${Math.round(kt)} kt`;
}

function ligneVentCalcule() {
  const v = _ventCalcule;
  if (!v) return '';
  if (!v.ok) {
    const cle = v.error === 'trop-court' ? 'viseesVentTropCourt' : 'viseesVentImpossible';
    return `<span class="visees-avertissement">${escapeHtml(t(cle))}</span>`;
  }
  // Sous le seuil, la force est honnête mais la direction n'existe pas : on ne
  // lui invente pas un azimut.
  if (v.windFromDeg === null) {
    return `<span class="visees-vent">${escapeHtml(t('viseesVentCalme'))}</span>`;
  }

  const bouts = [
    `<span class="visees-vent-lbl">${escapeHtml(t('viseesVentCalcule'))}</span>`,
    `<strong class="visees-vent-val">${escapeHtml(ventLisible(v.windFromDeg, v.windKt))}</strong>`,
  ];
  // Ce qu'il croyait, à côté : l'écart entre les deux EST la dérive de son
  // estime, et c'est la leçon du tronçon qui vient de s'écouler.
  if (Number.isFinite(v.ventCru.dir) && Number.isFinite(v.ventCru.kt)) {
    bouts.push(`<span class="astres-best-chiffres">${escapeHtml(t('viseesVentCru'))} `
      + `${escapeHtml(ventLisible(v.ventCru.dir, v.ventCru.kt))}</span>`);
  }
  bouts.push(`<button id="visees-vent-adopter" class="astres-mini-btn" type="button">`
    + `${escapeHtml(t('viseesVentAdopter'))}</button>`);
  return `<span class="visees-vent">${bouts.join(' ')}</span>`;
}

// Ré-étiquetage à la bascule FR / EN (textes calculés, invisibles pour
// applyTranslations). Appelée depuis apropos.js.
function renderVisees() {
  if (!viseesPanelVisible()) return;
  dessinerVisees();
  dessinerPoint();
  renderEstime();
  renderPontEtat();
  if (typeof renderEtalonnage === 'function') renderEtalonnage();
}

// --- Branchements ------------------------------------------------------------

// Une visée qui arrive s'insère sans recharger : le process principal l'a déjà
// rangée et nous envoie la version expurgée, exactement celle que la liste
// aurait rendue.
window.sextant.onPontVisee(({ visee, ecrit }) => {
  _viseesData.push(visee);
  _viseesData.sort((a, b) => new Date(a.utc) - new Date(b.utc));
  perimerPoint();
  dessinerVisees();
  dessinerPoint();
  // Le disque a refusé : la visée est en mémoire, elle ne survivra pas à la
  // fermeture. Ça se dit, sinon le joueur croit son carnet à l'abri.
  if (!ecrit) {
    $('visees-etat').textContent = t('viseesNonEcrite');
    $('visees-etat').hidden = false;
  }
  // Panneau fermé : le bouton de la barre porte la nouvelle.
  majPastilleVisees();
});

function majPastilleVisees() {
  const btn = $('btn-visees');
  const n = _viseesData.length;
  btn.classList.toggle('a-des-visees', n > 0 && $('visees-panel').hidden);
}

$('visees-tbody').addEventListener('click', async (e) => {
  const btn = e.target.closest('.visees-sup-btn[data-sup]');
  if (!btn) return;
  await window.sextant.viseesSupprimer(btn.dataset.sup);
  perimerPoint();
  await rafraichirVisees();
  dessinerPoint();
});

$('visees-point-btn').addEventListener('click', () => faireLePoint());
// L'erreur d'index change : le point d'avant a été calculé avec l'autre, donc
// il est refait sur-le-champ plutôt que laissé à l'écran.
$('visees-ie').addEventListener('change', () => { if (_reduction) faireLePoint(); });
$('visees-ie').addEventListener('keydown', (e) => e.stopPropagation());

$('btn-visees-vider').addEventListener('click', async () => {
  await window.sextant.viseesVider();
  perimerPoint();
  // Les points portés sur la carte venaient de ces visées-là : les laisser
  // après avoir vidé le carnet ferait des marques sans rien derrière.
  if (typeof effacerPointsObserves === 'function') effacerPointsObserves();
  await rafraichirVisees();
  dessinerPoint();
});

const viseesBtn = $('btn-visees');
function ouvrirFermerVisees(ouvrir) {
  $('visees-panel').hidden = !ouvrir;
  viseesBtn.classList.toggle('is-active', ouvrir);
  viseesBtn.setAttribute('aria-pressed', String(ouvrir));
  document.querySelector('main').classList.toggle('visees-open', ouvrir);
  // Le carnet et le plan de vol se disputent la bande droite : ouvrir l'un
  // referme l'autre. Deux panneaux superposés ne se lisent ni l'un ni l'autre.
  if (ouvrir && !$('legs-panel').hidden) ouvrirFermerLegs(false);
  if (ouvrir) {
    rafraichirVisees();
    renderPontEtat();
    renderEstime();
    dessinerPoint();
    // L'étalonnage peut être resté ouvert d'une session précédente : une série
    // en cours doit se retrouver telle qu'on l'a laissée, pas vide.
    if (typeof rafraichirEtal === 'function') rafraichirEtal();
  }
  majPastilleVisees();
  if (suiviActif && !suiviPause) recentrerAvion();
  mettreAJourProfilVertical();
}
viseesBtn.addEventListener('click', () => ouvrirFermerVisees($('visees-panel').hidden));
$('visees-close').addEventListener('click', () => ouvrirFermerVisees(false));

// Le compte au démarrage : le carnet peut contenir les visées d'une session
// précédente, et le bouton doit le dire sans qu'on ait à ouvrir le panneau.
window.sextant.viseesListe().then((res) => {
  if (res && res.ok) _viseesData = res.visees;
  majPastilleVisees();
});
