/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// etalonnage.js — mesurer ce que vaut SON exemplaire.
//
// La procédure d'avant-vol : une série de visées depuis une position CONNUE,
// et la différence entre ce qu'on lit et ce qui est calculé. L'AFM refuse de
// séparer l'erreur d'index de l'erreur personnelle — on ne mesure que leur
// somme, et c'est très bien ainsi : un navigateur qui collimate toujours un peu
// haut voit son biais absorbé par son étalon, ce qui est exactement ce que
// faisait un vrai navigateur.
//
// CE QUE CE PANNEAU EXISTE POUR DIRE, et qu'un vol réel a appris : le critère
// d'un bon astre d'étalonnage est sa VITESSE, pas sa hauteur. Un astre qui
// descend à 10′/min avec un tambour qui traîne d'une demi-minute fait lire cinq
// minutes d'arc trop haut, et l'on met ça sur le compte du sextant. La colonne
// « ′/min » est donc ici la colonne qui décide, et le tableau dit visée par
// visée laquelle compte pour la moyenne.
//
// LE FILTRE PARLE. Une visée trop rapide n'est pas cachée : elle reste au
// tableau, grisée, avec sa vitesse en toutes lettres — et elle sert encore, car
// c'est elle qui donne le bras de levier pour mesurer le retard lui-même.
//
// Tout le calcul est au process principal (main/etalonnage.js) et au noyau
// (calibration.js) : ce fichier affiche et branche des boutons.
// ============================================================

let _etalEtat = null;        // { session, adoptee }
let _etalMesure = null;      // dernière mesure obtenue du noyau

function etalVisible() {
  const p = $('etal');
  return p && !p.hidden;
}

// --- Formatage ---------------------------------------------------------------

// Une correction s'écrit toujours signée : c'est un nombre qu'on ajoute à une
// lecture, et le signe est la moitié de l'information. Le moins est un vrai
// signe moins, pas un trait d'union — ces nombres se lisent en colonne.
function minutes1(v) {
  if (!Number.isFinite(v)) return '—';
  return `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}′`;
}

function etalHeure(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(11, 19);
}

function etalDate(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toISOString().slice(0, 10);
}

// --- Ouverture du panneau ----------------------------------------------------

async function rafraichirEtal() {
  _etalEtat = await window.sextant.etalonnageEtat();
  if (_etalEtat && _etalEtat.session) await mesurerEtal();
  else { _etalMesure = null; dessinerEtal(); }
}

function ouvrirFermerEtal(ouvrir) {
  $('etal').hidden = !ouvrir;
  $('btn-etalonner').classList.toggle('is-active', ouvrir);
  if (ouvrir) {
    // La position du terrain pré-remplit les cases : dans neuf cas sur dix
    // c'est celle qu'on veut, et la retaper à la main serait une corvée pour
    // rien. Elle reste modifiable — un parking n'est pas le point de référence
    // de l'aérodrome.
    const p = typeof positionEstimee === 'function' ? positionEstimee() : null;
    if (p && !$('etal-lat').value) {
      $('etal-lat').value = p.lat.toFixed(4);
      $('etal-lon').value = p.lon.toFixed(4);
    }
    rafraichirEtal();
  }
}

// --- La série ----------------------------------------------------------------

async function mesurerEtal() {
  _etalMesure = await window.sextant.etalonnageMesurer();
  dessinerEtal();
}

function etalAlerte(cle) {
  const el = $('etal-alerte');
  if (!cle) { el.hidden = true; return; }
  el.hidden = false;
  el.textContent = t(cle);
}

function dessinerEtal() {
  if (!etalVisible()) return;

  const session = _etalEtat && _etalEtat.session;
  $('etal-ouvrir').hidden = !!session;
  $('etal-session').hidden = !session;
  $('etal-scroll').hidden = !session;

  dessinerEtalAdoptee();

  if (!session) {
    $('etal-resultat').hidden = true;
    return;
  }

  $('etal-pos').textContent = `${formatLatCourt(session.position.lat)} ${formatLonCourt(session.position.lon)}`;

  const m = _etalMesure && _etalMesure.ok ? _etalMesure : null;
  const lignes = m ? m.lignes : [];
  const refusees = m ? m.refusees : [];
  const lentes = lignes.filter((l) => l.lente).length;

  $('etal-compte').textContent = t('etalCompte')
    .replace('{n}', String(lignes.length + refusees.length))
    .replace('{lentes}', String(lentes));
  $('etal-vide').hidden = lignes.length + refusees.length > 0;

  const seuil = m ? m.seuil : 3;
  $('etal-tbody').innerHTML = lignes.map((l) => {
    // Trois états, et chacun se voit : retenue, trop rapide, refusée à la main.
    const cls = l.lente ? '' : ' etal-hors';
    const titre = l.lente ? '' : ` title="${escapeHtml(t('etalRapide').replace('{seuil}', String(seuil)))}"`;
    return `<tr data-etal="${escapeHtml(l.id || '')}"${titre} class="${cls.trim()}">`
      + `<td class="legs-num">${escapeHtml(etalHeure(l.utc))}</td>`
      + `<td class="astres-nom">${escapeHtml(nomAstre(l.body))}</td>`
      + `<td class="legs-num">${escapeHtml(hsLisible(l.hs))}</td>`
      + `<td class="legs-num">${escapeHtml(hsLisible(l.hc))}</td>`
      + `<td class="legs-num etal-ecart">${escapeHtml(minutes1(l.errorMin))}</td>`
      + `<td class="legs-num astres-vitesse ${l.lente ? 'vitesse-lente' : 'vitesse-rapide'}">`
        + `${escapeHtml(minutes1(l.rateMinPerMin).replace('′', ''))}</td>`
      + `<td class="visees-sup"><button type="button" class="visees-sup-btn" data-etal-bascule="${escapeHtml(l.id || '')}"`
      + ` title="${escapeHtml(t('etalRefuser'))}"><i class="ph-light ph-prohibit"></i></button></td>`
      + '</tr>';
  }).concat(refusees.map((r) => (
    `<tr class="etal-refusee">`
    + `<td class="legs-num">${escapeHtml(etalHeure(r.utc))}</td>`
    + `<td class="astres-nom">${escapeHtml(nomAstre(r.body))}</td>`
    + `<td class="legs-num">${escapeHtml(hsLisible(r.hs))}</td>`
    + '<td class="legs-num">—</td><td class="legs-num">—</td><td class="legs-num">—</td>'
    + `<td class="visees-sup"><button type="button" class="visees-sup-btn" data-etal-bascule="${escapeHtml(r.id || '')}"`
    + ` title="${escapeHtml(t('etalRemettre'))}"><i class="ph-light ph-arrow-counter-clockwise"></i></button></td>`
    + '</tr>'
  ))).join('');

  dessinerEtalResultat();
}

// Ce que la série conclut. C'est le seul endroit de l'application où l'on
// annonce un nombre que le navigateur va garder : il vient donc avec la méthode
// qui l'a produit, sa dispersion, et ce qu'il reste d'incertain.
function dessinerEtalResultat() {
  const el = $('etal-resultat');
  const m = _etalMesure;
  if (!m) { el.hidden = true; return; }

  if (!m.ok) {
    // Pas de série ouverte : ce n'est pas une panne, c'est l'état normal entre
    // deux étalonnages. Annoncer un échec de calcul serait mentir.
    if (m.error === 'pas-de-session') { el.hidden = true; return; }
    el.hidden = false;
    el.className = 'etal-resultat astres-alerte';
    el.textContent = t(m.error === 'noyau' ? 'viseesErrNoyau' : 'viseesErrCalcul');
    return;
  }

  const r = m.resume;
  el.hidden = false;
  el.className = 'etal-resultat';

  // Rien à conclure : dire ce qui manque, et combien. « Pas assez de visées »
  // sans le compte oblige à deviner.
  if (!r.methode) {
    const bouts = [];
    if (r.manque.lentes > 0) {
      bouts.push(t('etalManqueLentes')
        .replace('{n}', String(r.manque.lentes))
        .replace('{seuil}', String(m.seuil)));
    }
    if (r.manque.pourLaPente > 0 && r.count > 0) bouts.push(t('etalManquePente'));
    el.innerHTML = `<span class="etal-manque">${escapeHtml(bouts.join(' '))}</span>`;
    return;
  }

  const verdict = r.methode === 'lents'
    ? (r.serieComplete ? 'verdict-excellent' : 'verdict-bon')
    : (r.methode === 'retard' ? 'verdict-mediocre' : 'verdict-mauvais');
  const methode = {
    lents: t('etalMethodeLents').replace('{n}', String(r.lents.n)),
    retard: t('etalMethodeRetard'),
    brut: t('etalMethodeBrut'),
  }[r.methode];

  const bouts = [
    `<span class="visees-point-lbl">${escapeHtml(t('etalCorrection'))}</span>`,
    `<strong class="etal-valeur">${escapeHtml(minutes1(r.correctionMin))}</strong>`,
  ];
  if (Number.isFinite(r.incertitudeMin)) {
    bouts.push(`<span class="astres-best-chiffres">± ${r.incertitudeMin.toFixed(1)}′</span>`);
  }
  bouts.push(`<span class="astres-verdict ${verdict}">${escapeHtml(methode)}</span>`);
  if (Number.isFinite(r.brut.sdMin)) {
    bouts.push(`<span class="astres-best-chiffres">${escapeHtml(t('etalDispersion'))} ±${r.brut.sdMin.toFixed(1)}′</span>`);
  }
  bouts.push(`<button id="etal-adopter" class="astres-mini-btn" type="button">${escapeHtml(t('etalAdopter'))}</button>`);

  // LE RETARD DE MANIVELLE, quand la série a de quoi le mesurer. Ce n'est pas
  // un diagnostic de l'instrument mais du GESTE, et c'est la chose la plus
  // utile que ce panneau puisse apprendre à quelqu'un : elle se corrige à la
  // main dès la visée suivante.
  if (r.retardConnu) {
    bouts.push(`<span class="etal-retard">${escapeHtml(t('etalRetardLigne')
      .replace('{retard}', r.retard.retardS.toFixed(0))
      .replace('{se}', r.retard.seRetardS.toFixed(0)))}</span>`);
  }
  if (Number.isFinite(r.biaisResiduelMin) && r.biaisResiduelMin >= 0.5) {
    bouts.push(`<span class="visees-avertissement">${escapeHtml(t('etalBiaisResiduel')
      .replace('{biais}', r.biaisResiduelMin.toFixed(1)))}</span>`);
  } else if (r.methode === 'lents' && Number.isFinite(r.lents.maxAbsRate)) {
    // Une bonne série n'a pas d'astre rapide, donc pas de bras de levier, donc
    // pas de retard mesurable : c'est le cas le plus fréquent, et c'est
    // justement là qu'on ne peut rien affirmer. On rend alors le seul fait
    // disponible — la vitesse la plus forte retenue — et ce qu'une seconde de
    // retard y coûterait. Le navigateur multiplie par ce qu'il croit valoir.
    bouts.push(`<span class="visees-avertissement">${escapeHtml(t('etalVitesseRetenue')
      .replace('{v}', r.lents.maxAbsRate.toFixed(1))
      .replace('{x}', (r.lents.maxAbsRate / 60).toFixed(2)))}</span>`);
  }
  if (r.methode === 'brut') {
    bouts.push(`<span class="visees-avertissement">${escapeHtml(t('etalAvertBrut'))}</span>`);
  }
  if (r.methode === 'retard') {
    bouts.push(`<span class="visees-avertissement">${escapeHtml(t('etalAvertRetard'))}</span>`);
  }

  el.innerHTML = bouts.join(' ');

  $('etal-adopter').addEventListener('click', async () => {
    const res = await window.sextant.etalonnageAdopter({
      correctionMin: r.correctionMin,
      incertitudeMin: r.incertitudeMin,
      methode: r.methode,
      n: r.methode === 'lents' ? r.lents.n : r.count,
      retardS: r.retardConnu ? r.retard.retardS : null,
      position: m.session.position,
    });
    if (!res || !res.ok) return;
    _etalEtat = { session: res.session, adoptee: res.adoptee };
    _etalMesure = null;
    appliquerEtalon(res.adoptee);
    dessinerEtal();
  });
}

// L'étalon en service, sous le tableau. Il survit à la fermeture de
// l'application : c'est une propriété de l'exemplaire, pas de la session.
function dessinerEtalAdoptee() {
  const el = $('etal-adoptee');
  const a = _etalEtat && _etalEtat.adoptee;
  if (!a) {
    el.className = 'etal-note etal-sans-etalon';
    el.textContent = t('etalAucunEtalon');
    return;
  }
  el.className = 'etal-note';
  el.innerHTML = escapeHtml(t('etalAdopteeLigne')
    .replace('{corr}', minutes1(a.correctionMin))
    .replace('{methode}', t({
      lents: 'etalMethodeCourtLents', retard: 'etalMethodeCourtRetard', brut: 'etalMethodeCourtBrut',
    }[a.methode] || 'etalMethodeCourtBrut'))
    .replace('{n}', a.n === null ? '—' : String(a.n))
    .replace('{date}', etalDate(a.faitLe)))
    + ` <button id="etal-oublier" class="astres-mini-btn" type="button">${escapeHtml(t('etalOublier'))}</button>`;

  $('etal-oublier').addEventListener('click', async () => {
    const res = await window.sextant.etalonnageOublier();
    if (!res || !res.ok) return;
    _etalEtat = { session: res.session, adoptee: res.adoptee };
    dessinerEtal();
  });
}

/**
 * L'étalon adopté entre en service : c'est la correction que la réduction
 * appliquera. Sans ce geste, l'étalonnage serait un exercice de style — on
 * mesurerait son sextant et l'on continuerait à réduire sans en tenir compte.
 */
function appliquerEtalon(adoptee) {
  const champ = $('visees-ie');
  if (!champ || !adoptee || !Number.isFinite(adoptee.correctionMin)) return;
  champ.value = adoptee.correctionMin.toFixed(1).replace('.', ',');
  // Le point affiché a été calculé avec l'ancienne correction : il ne décrit
  // plus rien. On le refait plutôt que de le laisser mentir d'une ligne.
  if (typeof perimerPoint === 'function') perimerPoint();
  if (typeof dessinerPoint === 'function') dessinerPoint();
}

// Ré-étiquetage à la bascule FR / EN (textes calculés).
function renderEtalonnage() {
  if (etalVisible()) dessinerEtal();
}

// --- Branchements ------------------------------------------------------------

$('btn-etalonner').addEventListener('click', () => ouvrirFermerEtal($('etal').hidden));

$('etal-sol').addEventListener('click', async () => {
  const res = await window.sextant.etalonnageDemarrer({ origine: 'sol' });
  if (!res.ok) { etalAlerte(res.error === 'en-vol' ? 'etalEnVol' : 'etalPasAuSol'); return; }
  etalAlerte(null);
  _etalEtat = { session: res.session, adoptee: res.adoptee };
  await mesurerEtal();
});

$('etal-manuel').addEventListener('click', async () => {
  const lat = nombreSaisi($('etal-lat').value);
  const lon = nombreSaisi($('etal-lon').value);
  const res = await window.sextant.etalonnageDemarrer({ lat, lon });
  if (!res.ok) {
    etalAlerte(res.error === 'en-vol' ? 'etalEnVol' : 'etalPositionInvalide');
    return;
  }
  etalAlerte(null);
  _etalEtat = { session: res.session, adoptee: res.adoptee };
  await mesurerEtal();
});

$('etal-mesurer').addEventListener('click', () => mesurerEtal());

$('etal-arreter').addEventListener('click', async () => {
  const res = await window.sextant.etalonnageArreter();
  if (!res || !res.ok) return;
  _etalEtat = { session: res.session, adoptee: res.adoptee };
  _etalMesure = null;
  dessinerEtal();
});

$('etal-tbody').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-etal-bascule]');
  if (!btn) return;
  const res = await window.sextant.etalonnageBasculer(btn.dataset.etalBascule);
  if (!res || !res.ok) return;
  _etalEtat = { session: res.session, adoptee: res.adoptee };
  await mesurerEtal();
});

// Les cases de saisie ne doivent pas déclencher les raccourcis de la carte.
$('etal-lat').addEventListener('keydown', (e) => e.stopPropagation());
$('etal-lon').addEventListener('keydown', (e) => e.stopPropagation());

// Une visée qui arrive pendant une série ouverte y entre aussitôt : le
// navigateur voit sa mesure se préciser visée après visée, ce qui est
// exactement ce qui fait tenir une procédure de dix visées.
window.sextant.onPontVisee(() => {
  if (etalVisible() && _etalEtat && _etalEtat.session) mesurerEtal();
});

// Au démarrage : l'étalon de l'exemplaire est chargé et mis en service, sans
// qu'il faille ouvrir le panneau. Un sextant étalonné hier l'est encore.
window.sextant.etalonnageEtat().then((etat) => {
  _etalEtat = etat;
  if (etat && etat.adoptee) appliquerEtalon(etat.adoptee);
});
