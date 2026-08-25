/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// catalogue-astres.js — quels astres sont visables, et lesquels prendre.
//
// C'est la première chose que le navigateur fait, avant de toucher au sextant :
// regarder ce que le ciel offre et choisir. L'almanach donne les positions ;
// il ne dit ni où pointer depuis l'appareil, ni surtout quels astres vont
// ensemble. Ce panneau ajoute donc les trois colonnes qui manquent partout :
//
//   le GISEMENT — l'azimut compté depuis le nez, ce qui se lit sur la couronne
//                 du sextant. C'est le seul chiffre qui serve à TROUVER l'astre.
//   la HAUTEUR  — déjà filtrée au domaine visable (15° à 75° par défaut).
//   la COUPE    — l'angle sous lequel les droites se croiseront. Personne ne
//                 l'affiche, et c'est pourtant lui qui décide de la valeur du
//                 point : trois visées parfaites sur trois astres mal répartis
//                 donnent un point flou, et rien dans le chapeau ne le dira.
//
// Tout le calcul est au noyau d'éphémérides (via astres.js côté main) : ce
// fichier n'a aucune formule d'astronomie ni de géométrie. Il affiche.
// ============================================================

// Rafraîchissement en mode simulateur. Le flux arrive à 2 Hz, on n'en retient
// qu'une trame sur vingt : en dix secondes, l'astre le plus rapide monte de
// 0,04° et le gisement bouge de ce que le cap a bougé. Recalculer plus souvent
// ne montrerait rien de neuf et ferait tourner l'éphéméride pour rien.
const ASTRES_REFRESH_MS = 10000;

// Seuils de lecture de la colonne « coupe », en degrés. Ce sont ceux de
// l'école : sous 30° on ne croise pas, on effleure — la doctrine dit de ne pas
// y toucher. Au-dessus de 60° le croisement est franc.
const COUPE_BONNE = 60;
const COUPE_MAUVAISE = 30;

// Seuils de la colonne « ′/min », la vitesse verticale de l'astre.
//
// Ce ne sont pas des seuils de qualité — un astre rapide n'est pas un mauvais
// astre, c'est un astre qui demande du travail. L'intégrateur moyenne la
// position du TAMBOUR : si l'astre descend de dix minutes d'arc pendant qu'on
// vise et que la molette ne suit pas, la moyenne est trop haute d'autant. Sous
// 3′/min on peut poser et laisser courir ; au-delà de 8, il faut maniveller
// sans arrêt, ou raccourcir l'intégration.
//
// La vitesse ne dépasse jamais 15,04 × cos(latitude) — 10,9′/min à Aix — et
// elle est maximale au plein est et au plein ouest, nulle au méridien.
const VITESSE_LENTE = 3;
const VITESSE_RAPIDE = 8;
function classeVitesse(v) {
  if (!Number.isFinite(v)) return '';
  const a = Math.abs(v);
  if (a >= VITESSE_RAPIDE) return 'vitesse-rapide';
  return a <= VITESSE_LENTE ? 'vitesse-lente' : '';
}

let _catData = null;        // dernière réponse du noyau
let _catSel = new Set();    // astres cochés, par NOM (les rangs changent, pas les noms)
let _catLastRefresh = 0;
let _catLibre = false;      // true = instant et lieu saisis à la main, figés
let _catQualiteSeq = 0;     // garde-fou : deux clics rapides, une seule réponse retenue

function cataloguePanelVisible() {
  const p = $('astres-panel');
  return p && !p.hidden;
}

// La source automatique est-elle disponible ? Il faut une heure zulu ET une
// estime calée. LA POSITION NE VIENT PLUS DE LA TRAME : le navigateur
// précalcule depuis là où il CROIT être, jamais depuis là où il est.
function catalogueSimDispo() {
  return !!(derniereTrame && derniereTrame.simUtc
    && typeof positionEstimee === 'function' && positionEstimee());
}

// --- Formatage ---------------------------------------------------------------

const deg3 = (v) => (Number.isFinite(v) ? String(Math.round(v) % 360).padStart(3, '0') + '°' : '—');
const deg1 = (v) => (Number.isFinite(v) ? v.toFixed(1) + '°' : '—');
const mag1 = (v) => (Number.isFinite(v) ? (v > 0 ? '+' : '') + v.toFixed(1) : '—');
const vitesse1 = (v) => (Number.isFinite(v) ? (v > 0 ? '+' : (v < 0 ? '−' : '')) + Math.abs(v).toFixed(1) : '—');
const mult2 = (v) => (Number.isFinite(v) ? '×' + v.toFixed(2) : '—');

// « AAAA-MM-JJ HH:MM:SS » — l'heure du navigateur s'écrit en clair, pas en ISO
// avec son T et son Z : c'est ce qu'on recopie sur le carnet.
function utcLisible(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

// Le sens inverse, tolérant : espace ou T, secondes facultatives. Rend null si
// ça ne ressemble pas à une date — la case reprend alors la valeur précédente.
function utcDepuisSaisie(txt) {
  const s = String(txt || '').trim().replace(' ', 'T');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(s)) return null;
  const d = new Date(s + (s.length === 16 ? ':00' : '') + 'Z');
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function nombreSaisi(txt) {
  const v = parseFloat(String(txt || '').replace(',', '.'));
  return Number.isFinite(v) ? v : null;
}

// Le noyau nomme les astres en anglais, parce que c'est la langue de
// l'almanach. Les ÉTOILES gardent ce nom en toute langue — Vega, Altair et
// Betelgeuse sont des noms propres, et les traduire brouillerait la
// correspondance avec les tables. Le Soleil, la Lune et les planètes, eux, se
// nomment dans la langue du navigateur.
const NOMS_ASTRES = {
  Sun: 'astresBodySun', Moon: 'astresBodyMoon',
  Venus: 'astresBodyVenus', Mars: 'astresBodyMars',
  Jupiter: 'astresBodyJupiter', Saturn: 'astresBodySaturn',
};
function nomAstre(name) {
  return NOMS_ASTRES[name] ? t(NOMS_ASTRES[name]) : name;
}

// Icône par nature d'astre. Le Soleil et la Lune ne se visent pas comme une
// étoile — limbe contre point — donc ils se distinguent au premier coup d'œil.
function iconeAstre(kind) {
  if (kind === 'sun') return 'ph-sun';
  if (kind === 'moon') return 'ph-moon';
  if (kind === 'planet') return 'ph-planet';
  return 'ph-star-four';
}

// --- Source : le simulateur, ou la saisie ------------------------------------

// Remplit les cases depuis le simulateur et les verrouille. Même procédé que
// les cases de vent du plan (cf. vent-plan.js) : ce que le simulateur donne,
// on ne le tape pas.
function majSourceCatalogue() {
  const sim = catalogueSimDispo() && !_catLibre;
  const cases = ['astres-utc', 'astres-lat', 'astres-lon', 'astres-cap'];
  cases.forEach((id) => { $(id).readOnly = sim; });
  const btn = $('astres-src-toggle');
  btn.textContent = t(_catLibre ? 'astresSrcFree' : 'astresSrcSim');
  btn.title = t(_catLibre ? 'astresSrcFreeTitle' : 'astresSrcSimTitle');
  btn.disabled = !catalogueSimDispo();   // sans simulateur, il n'y a rien à basculer

  if (!sim) return;
  // L'HEURE et le CAP viennent du simulateur — montre et compas, deux lectures
  // de bord. La POSITION vient de l'ESTIME, et c'est ce qui rend la recherche
  // réelle : l'astre précalculé n'est pas tout à fait là où on l'attend. Trente
  // milles d'erreur d'estime le déplacent d'un demi-degré en gisement et d'une
  // demi-minute d'arc en hauteur — assez pour devoir chercher, jamais assez
  // pour le perdre dans le champ.
  const p = positionEstimee();
  $('astres-utc').value = utcLisible(derniereTrame.simUtc);
  $('astres-lat').value = p.lat.toFixed(4);
  $('astres-lon').value = p.lon.toFixed(4);
  $('astres-cap').value = Number.isFinite(derniereTrame.headingTrue)
    ? String(Math.round(derniereTrame.headingTrue) % 360) : '';
}

// Valeurs de départ quand il n'y a pas de simulateur : le centre de la carte et
// l'heure d'à présent. On peut ainsi préparer un crépuscule sans rien lancer.
function amorcerSourceCatalogue() {
  if (catalogueSimDispo()) return;
  if (!$('astres-utc').value) $('astres-utc').value = utcLisible(new Date().toISOString());
  if (!$('astres-lat').value && map) {
    const c = map.getCenter();
    $('astres-lat').value = c.lat.toFixed(4);
    $('astres-lon').value = ((c.lng + 540) % 360 - 180).toFixed(4);
  }
}

// --- Interrogation du noyau --------------------------------------------------

async function rafraichirCatalogue() {
  if (!cataloguePanelVisible()) return;
  majSourceCatalogue();

  const utc = utcDepuisSaisie($('astres-utc').value);
  const lat = nombreSaisi($('astres-lat').value);
  const lon = nombreSaisi($('astres-lon').value);
  const cap = nombreSaisi($('astres-cap').value);
  if (utc === null || lat === null || lon === null) {
    afficherErreurCatalogue(t('astresErrSaisie'));
    return;
  }

  _catLastRefresh = Date.now();
  const res = await window.sextant.astresCatalogue({
    utc, lat, lon,
    headingTrue: cap === null ? undefined : cap,
    minAltitude: nombreSaisi($('astres-hmin').value),
    maxAltitude: nombreSaisi($('astres-hmax').value),
    maxMagnitude: nombreSaisi($('astres-mag').value),
  });

  if (!res || !res.ok) {
    const cle = {
      noyau: 'astresErrNoyau', position: 'astresErrPosition',
      heure: 'astresErrHeure', calcul: 'astresErrCalcul',
    }[res && res.error] || 'astresErrCalcul';
    afficherErreurCatalogue(t(cle) + (res && res.detail ? ' — ' + res.detail : ''));
    return;
  }

  _catData = res;
  // Un astre coché qui est sorti du domaine depuis le dernier calcul cesse
  // d'exister : le garder ferait mentir la qualité de la sélection.
  const vivants = new Set(res.astres.map((a) => a.name));
  _catSel = new Set([..._catSel].filter((nom) => vivants.has(nom)));
  dessinerCatalogue();
}

// Appelée par le flux du simulateur (avion.js). C'est LE flux qui donne la
// cadence : pas de minuterie à démarrer, à arrêter, ni à oublier.
function majCatalogueDepuisSim() {
  if (!cataloguePanelVisible() || _catLibre) return;
  if (!catalogueSimDispo()) return;

  // L'heure et la position suivent le FLUX, pas le recalcul : ce ne sont que
  // des cases de texte. Sans ça l'horloge sautait de dix secondes en dix
  // secondes — elle disait la vérité, mais elle avait l'air en panne.
  majSourceCatalogue();
  majGisements();

  if (_catData && Date.now() - _catLastRefresh < ASTRES_REFRESH_MS) return;
  rafraichirCatalogue();
}

/**
 * Le gisement, réévalué à la cadence du flux.
 *
 * Ce n'est pas de la cosmétique comme l'horloge. Le gisement vaut `Zn − cap`,
 * et le cap est ce qui bouge le plus vite de tout le tableau : en virage à
 * 3°/s, dix secondes de retard le fausseraient de trente degrés — de quoi
 * chercher un astre là où il n'est pas. L'azimut, lui, peut attendre : il ne
 * varie pas d'un dixième de degré en dix secondes, donc l'éphéméride garde sa
 * cadence lente et seule la soustraction est refaite.
 */
function majGisements() {
  if (!_catData || !derniereTrame || !Number.isFinite(derniereTrame.headingTrue)) return;
  const cap = derniereTrame.headingTrue;
  document.querySelectorAll('#astres-tbody td.astres-gt').forEach((td) => {
    const a = _catData.astres[parseInt(td.dataset.rang, 10)];
    if (!a) return;
    // La valeur est réécrite DANS le catalogue, pas seulement dans la cellule :
    // une consigne envoyée juste après doit partir avec le gisement frais.
    a.gisement = ((a.zn - cap) % 360 + 360) % 360;
    td.textContent = deg3(a.gisement);
  });
}

function afficherErreurCatalogue(msg) {
  _catData = null;
  $('astres-ciel').textContent = msg;
  $('astres-ciel').className = 'astres-ciel astres-alerte';
  $('astres-best').innerHTML = '';
  $('astres-sel').hidden = true;
  $('astres-ecartes').hidden = true;
  $('astres-total').textContent = '—';
  $('astres-tbody').innerHTML = '';
  $('astres-empty').hidden = true;
}

// --- Rendu -------------------------------------------------------------------

// État du ciel, en clair. Le crépuscule n'est pas un détail d'ambiance : c'est
// lui qui décide si les étoiles sont là, et le crépuscule nautique est le
// moment du point — assez sombre pour les voir, assez clair pour l'horizon.
function phaseDuCiel(sunAlt) {
  if (sunAlt > 0) return 'astresCielJour';
  if (sunAlt > -6) return 'astresCielCivil';
  if (sunAlt > -12) return 'astresCielNautique';
  if (sunAlt > -18) return 'astresCielAstro';
  return 'astresCielNuit';
}

function dessinerCatalogue() {
  if (!_catData) return;
  const d = _catData;

  const ciel = $('astres-ciel');
  ciel.className = 'astres-ciel';
  ciel.textContent = t('astresCielLigne')
    .replace('{soleil}', deg1(d.sunAltitude))
    .replace('{phase}', t(phaseDuCiel(d.sunAltitude)))
    .replace('{etoiles}', t(d.starsUsable ? 'astresEtoilesOui' : 'astresEtoilesNon'));
  if (d.epochWarning) {
    ciel.className = 'astres-ciel astres-alerte';
    ciel.textContent += ' · ' + d.epochWarning;
  }

  $('astres-total').textContent = String(d.astres.length);
  dessinerMeilleurJeu();
  dessinerEcartes();
  dessinerLignesAstres();
  majCoupes();
}

// Les astres au-dessus de l'horizon que le domaine a écartés. Quatre au plus,
// les plus proches d'y rentrer : au-delà, c'est la liste de tout le ciel bas,
// qui n'apprend rien. C'est la réponse à « je vois la Lune et elle n'y est pas ».
const ECARTES_MAX = 4;
function dessinerEcartes() {
  const el = $('astres-ecartes');
  const liste = (_catData && _catData.ecartes) || [];
  if (!liste.length) { el.hidden = true; return; }
  const bouts = liste.slice(0, ECARTES_MAX).map((e) => {
    // Le signe du dépassement dit de quel côté il est sorti : trop bas pour que
    // la réfraction soit sûre, ou trop haut pour que l'azimut tienne.
    const sens = e.depassement < 0 ? '↓' : '↑';
    return `${nomAstre(e.name)} ${deg1(e.hc)} ${sens}`;
  });
  const reste = liste.length - bouts.length;
  el.textContent = t('astresEcartes')
    .replace('{n}', String(liste.length))
    .replace('{min}', deg1(_catData.bornes.minAltitude))
    .replace('{max}', deg1(_catData.bornes.maxAltitude))
    .replace('{liste}', bouts.join(' · ') + (reste > 0 ? ` … +${reste}` : ''));
  el.hidden = false;
}

// Le meilleur jeu que le ciel permette, calculé et non deviné. Cliquable :
// c'est le raccourci du navigateur pressé, et il vaut mieux que trois coches.
function dessinerMeilleurJeu() {
  const el = $('astres-best');
  const d = _catData;
  const jeu = d.meilleurTrio || d.meilleurePaire;
  if (!jeu) {
    el.innerHTML = `<span class="astres-best-vide">${escapeHtml(t('astresBestAucun'))}</span>`;
    return;
  }
  const libelle = d.meilleurTrio ? t('astresBestTrio') : t('astresBestPaire');
  const ideal = d.meilleurTrio ? d.ideal.trio : d.ideal.paire;
  el.innerHTML = `<span class="astres-best-lbl">${escapeHtml(libelle)}</span> `
    + `<strong class="astres-best-noms">${escapeHtml(jeu.names.map(nomAstre).join(' · '))}</strong> `
    + `<span class="astres-best-chiffres">${escapeHtml(t('astresCoupe'))} ${deg1(jeu.cutMin)}`
    + ` · ${escapeHtml(t('astresErreurPoint'))} ${mult2(jeu.dilution)}</span> `
    + `<span class="astres-verdict ${classeVerdict(jeu.dilution, ideal)}">${escapeHtml(t(cleVerdict(jeu.dilution, ideal)))}</span>`
    + `<button id="astres-best-take" class="astres-mini-btn" type="button">${escapeHtml(t('astresChoisir'))}</button>`;
  $('astres-best-take').addEventListener('click', () => {
    _catSel = new Set(jeu.names);
    dessinerLignesAstres();
    majCoupes();
  });
}

// Verdict : on ne juge PAS la dilution en absolu, on la compare à ce que le
// même nombre d'astres permettrait au mieux. Sinon un point à deux astres
// serait condamné d'avance (1,41 au mieux) et un point à cinq applaudi pour
// rien. C'est la géométrie du bouquet qu'on note, pas son effectif.
//
// Les bornes ne sont pas choisies au jugé : à deux astres, la dilution vaut
// exactement √2 / sin(coupe), donc le rapport à l'idéal vaut 1 / sin(coupe), et
// les trois bornes ci-dessous retombent sur 60,4°, 41,8° et 30° de coupe. Ce
// sont les seuils de la colonne « coupe » (COUPE_BONNE, COUPE_MAUVAISE) : la
// pastille et la couleur du chiffre disent donc la même chose, ce qui est la
// moindre des choses puisqu'elles se lisent d'un même regard.
const VERDICT_EXCELLENT = 1.15;   // coupe > 60° pour une paire
const VERDICT_BON = 1.5;          // coupe > 42°
const VERDICT_MEDIOCRE = 2.0;     // coupe > 30° — en dessous, la doctrine dit non
function ratioVerdict(dilution, ideal) {
  return Number.isFinite(dilution) && ideal ? dilution / ideal : Infinity;
}
function cleVerdict(dilution, ideal) {
  const r = ratioVerdict(dilution, ideal);
  if (r < VERDICT_EXCELLENT) return 'astresVerdictExcellent';
  if (r < VERDICT_BON) return 'astresVerdictBon';
  if (r < VERDICT_MEDIOCRE) return 'astresVerdictMediocre';
  return 'astresVerdictMauvais';
}
function classeVerdict(dilution, ideal) {
  const r = ratioVerdict(dilution, ideal);
  if (r < VERDICT_EXCELLENT) return 'verdict-excellent';
  if (r < VERDICT_BON) return 'verdict-bon';
  if (r < VERDICT_MEDIOCRE) return 'verdict-mediocre';
  return 'verdict-mauvais';
}

function dessinerLignesAstres() {
  const tbody = $('astres-tbody');
  const d = _catData;
  $('astres-empty').hidden = d.astres.length > 0;

  tbody.innerHTML = d.astres.map((a, i) => {
    const coche = _catSel.has(a.name) ? ' checked' : '';
    const nom = escapeHtml(nomAstre(a.name)) + (a.bayer ? ` <span class="astres-bayer">${escapeHtml(a.bayer)}</span>` : '');
    // La Lune porte sa phase en infobulle : un croissant ne se vise pas au
    // centre, et savoir qu'il est à 8 % change la façon de le poser sur la bulle.
    const titre = a.kind === 'moon' && Number.isFinite(a.illuminated)
      ? ` title="${escapeHtml(t('astresLunePct').replace('{p}', Math.round(a.illuminated * 100)))}"`
      : '';
    return `<tr data-astre="${escapeHtml(a.name)}"${_catSel.has(a.name) ? ' class="astres-row-sel"' : ''}>`
      + `<td class="astres-pick"><input type="checkbox" data-astre="${escapeHtml(a.name)}"${coche}></td>`
      + `<td class="astres-nom"${titre}><i class="ph-light ${iconeAstre(a.kind)} astres-ico"></i> ${nom}</td>`
      // Hc et Gt CÔTE À CÔTE, et dans cet ordre : ce sont les deux nombres
      // qu'on affiche sur l'instrument, l'un au tambour, l'autre à la couronne.
      // Zn vient après — il ne sert pas à viser mais à tracer, et c'est de lui
      // que sort l'angle de coupe. Les avoir mélangés a coûté une visée prise
      // au mauvais gisement : la couronne d'un sextant périscopique est
      // solidaire de la cellule, elle ne connaît donc pas l'azimut vrai.
      + `<td class="legs-num astres-instrument">${deg1(a.hc)}</td>`
      + `<td class="legs-num astres-instrument astres-gt" data-rang="${i}">${deg3(a.gisement)}</td>`
      + `<td class="legs-num">${deg3(a.zn)}</td>`
      + `<td class="legs-num astres-vitesse ${classeVitesse(a.vitesse)}">${vitesse1(a.vitesse)}</td>`
      + `<td class="legs-num astres-mag">${mag1(a.magnitude)}</td>`
      + `<td class="legs-num astres-coupe" data-rang="${i}">—</td>`
      // Le bouton de consigne : « celui-ci, vise-le ». C'est le seul ordre qui
      // descende au sextant, et il part même si le panneau n'est pas encore
      // ouvert — le pont le garde et le rejouera à l'arrivée.
      + `<td class="astres-envoi"><button type="button" class="astres-envoi-btn"`
      + ` data-envoi="${escapeHtml(a.name)}"><i class="ph-light ph-paper-plane-right"></i></button></td>`
      + '</tr>';
  }).join('');
  majBoutonsConsigne();
}

// Met en évidence l'astre actuellement sous consigne. Appelée aussi depuis
// pont.js, quand l'état du pont change sans que le tableau ait bougé.
function majBoutonsConsigne() {
  const courant = typeof consigneCourante === 'function' ? consigneCourante() : null;
  document.querySelectorAll('#astres-tbody .astres-envoi-btn').forEach((b) => {
    const actif = b.dataset.envoi === courant;
    b.classList.toggle('is-consigne', actif);
    b.title = t(actif ? 'astresConsigneAnnuler' : 'astresConsigneEnvoyer');
  });
}

// La colonne « coupe » a deux visages, et l'en-tête le dit :
//   - rien de coché : avec QUI cet astre coupe le mieux. C'est la question du
//     départ — « je prends Vega, et avec quoi ? »
//   - sélection en cours : comment il coupe avec ce qui est déjà pris. C'est la
//     question de la suite — « est-ce que celui-là ajoute quelque chose ? »
// Mise à jour cellule par cellule, jamais par reconstruction du tableau : on ne
// détruit pas la case qu'on vient de cocher sous le doigt qui la coche.
function majCoupes() {
  if (!_catData) return;
  const d = _catData;
  const rangs = new Map(d.astres.map((a, i) => [a.name, i]));
  const sel = [..._catSel].map((n) => rangs.get(n)).filter((i) => i !== undefined);

  $('astres-col-coupe').textContent = t(sel.length ? 'astresColCoupeSel' : 'astresColCoupe');
  $('astres-col-coupe').title = t(sel.length ? 'astresHintCoupeSel' : 'astresHintCoupe');

  document.querySelectorAll('#astres-tbody td.astres-coupe').forEach((td) => {
    const i = parseInt(td.dataset.rang, 10);
    let val = null;
    let avec = null;
    if (sel.length === 0) {
      // Le meilleur partenaire possible dans tout le catalogue.
      for (let j = 0; j < d.astres.length; j += 1) {
        if (j === i) continue;
        if (val === null || d.coupes[i][j] > val) { val = d.coupes[i][j]; avec = d.astres[j].name; }
      }
    } else {
      // La PLUS PETITE coupe contre la sélection : c'est la paire pincée qui
      // commande, pas la moyenne. Une bonne coupe ne rachète pas une mauvaise.
      for (const j of sel) {
        if (j === i) continue;
        if (val === null || d.coupes[i][j] < val) { val = d.coupes[i][j]; avec = d.astres[j].name; }
      }
    }
    td.textContent = val === null ? '—' : deg1(val);
    td.title = avec ? t(sel.length ? 'astresCoupeAvecSel' : 'astresCoupeAvec').replace('{astre}', nomAstre(avec)) : '';
    td.classList.remove('coupe-bonne', 'coupe-moyenne', 'coupe-mauvaise');
    if (val !== null) {
      td.classList.add(val >= COUPE_BONNE ? 'coupe-bonne'
        : (val < COUPE_MAUVAISE ? 'coupe-mauvaise' : 'coupe-moyenne'));
    }
  });

  majResumeSelection(sel.map((i) => d.astres[i]));
}

// Le bandeau de sélection. La coupe minimale s'affiche tout de suite — elle est
// dans la matrice déjà reçue — et la dilution arrive du noyau juste après : la
// formule des moindres carrés n'est écrite qu'à un seul endroit du projet, et
// ce n'est pas ici.
function majResumeSelection(astres) {
  const el = $('astres-sel');
  if (astres.length === 0) { el.hidden = true; return; }
  el.hidden = false;

  if (astres.length === 1) {
    el.className = 'astres-sel';
    el.innerHTML = `<span class="astres-sel-un">${escapeHtml(t('astresSelUn').replace('{astre}', nomAstre(astres[0].name)))}</span>`;
    return;
  }

  const seq = ++_catQualiteSeq;
  window.sextant.astresQualite(astres.map((a) => a.zn)).then((q) => {
    if (seq !== _catQualiteSeq || !q || !q.ok) return;   // une coche plus récente a pris la main
    if (q.parallele) {
      el.className = 'astres-sel astres-alerte';
      el.innerHTML = escapeHtml(t('astresParalleles'));
      return;
    }
    el.className = 'astres-sel';
    el.innerHTML = `<span class="astres-sel-n">${escapeHtml(t('astresSelN').replace('{n}', astres.length))}</span> `
      + `<span class="astres-sel-noms">${escapeHtml(astres.map((a) => nomAstre(a.name)).join(' · '))}</span> `
      + `<span class="astres-best-chiffres">${escapeHtml(t('astresCoupe'))} ${deg1(q.cutMin)}`
      + ` · ${escapeHtml(t('astresErreurPoint'))} ${mult2(q.dilution)}`
      + ` <span class="astres-sel-ideal">${escapeHtml(t('astresIdeal'))} ${mult2(q.ideal)}</span></span> `
      + `<span class="astres-verdict ${classeVerdict(q.dilution, q.ideal)}">${escapeHtml(t(cleVerdict(q.dilution, q.ideal)))}</span>`;
  });
}

// Ré-étiquetage à la bascule FR / EN : le tableau est fait de textes calculés,
// applyTranslations() ne les voit pas. Appelée depuis apropos.js.
function renderCatalogue() {
  if (!cataloguePanelVisible()) return;
  majSourceCatalogue();
  if (_catData) dessinerCatalogue();
}

// --- Branchements ------------------------------------------------------------

// Le bouton de consigne. Re-cliquer l'astre déjà sous consigne l'annule : c'est
// le geste attendu, et c'est le seul moyen de vider le champ du sextant sans
// avoir à lui désigner un autre astre.
$('astres-tbody').addEventListener('click', (e) => {
  const btn = e.target.closest('.astres-envoi-btn[data-envoi]');
  if (!btn || !_catData) return;
  const nom = btn.dataset.envoi;
  const dejaLa = typeof consigneCourante === 'function' && consigneCourante() === nom;
  envoyerConsigne(dejaLa ? null : _catData.astres.find((a) => a.name === nom) || null);
});

// Une coche ne redessine pas le tableau : elle met à jour la colonne des coupes
// et le bandeau. Rien d'autre n'a changé.
$('astres-tbody').addEventListener('change', (e) => {
  const box = e.target.closest('input[type="checkbox"][data-astre]');
  if (!box) return;
  const nom = box.dataset.astre;
  if (box.checked) _catSel.add(nom); else _catSel.delete(nom);
  const tr = box.closest('tr');
  if (tr) tr.classList.toggle('astres-row-sel', box.checked);
  majCoupes();
});

// Saisie manuelle : on recalcule sur « change » (Entrée ou sortie de case), pas
// sur « input ». Peindre à chaque frappe ferait tourner l'éphéméride sur des
// latitudes à moitié tapées.
['astres-utc', 'astres-lat', 'astres-lon', 'astres-cap', 'astres-hmin', 'astres-hmax', 'astres-mag']
  .forEach((id) => $(id).addEventListener('change', () => rafraichirCatalogue()));

// Bascule simulateur / saisie libre. Le simulateur donne l'instant présent ;
// préparer un crépuscule demande un autre instant, et c'est le même panneau.
$('astres-src-toggle').addEventListener('click', () => {
  _catLibre = !_catLibre;
  majSourceCatalogue();
  rafraichirCatalogue();
});

$('astres-refresh').addEventListener('click', () => rafraichirCatalogue());

const astresBtn = $('btn-astres');
function ouvrirFermerCatalogue(ouvrir) {
  $('astres-panel').hidden = !ouvrir;
  astresBtn.classList.toggle('is-active', ouvrir);
  astresBtn.setAttribute('aria-pressed', String(ouvrir));
  // Le panneau prend la gauche de la carte : les contrôles Leaflet (zoom,
  // échelle) passent à sa droite pour rester cliquables.
  document.querySelector('main').classList.toggle('astres-open', ouvrir);
  // La bande du profil vertical vient de perdre (ou de retrouver) la largeur du
  // panneau : elle doit ré-échantillonner, sinon le relief reste dessiné à
  // l'ancienne largeur. Même geste que le panneau du plan de vol.
  mettreAJourProfilVertical();
  if (!ouvrir) return;
  amorcerSourceCatalogue();
  rafraichirCatalogue();
}
astresBtn.addEventListener('click', () => ouvrirFermerCatalogue($('astres-panel').hidden));
$('astres-close').addEventListener('click', () => ouvrirFermerCatalogue(false));
