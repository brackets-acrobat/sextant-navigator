/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// vent-plan.js — vent prévu, vitesse propre, et temps par branche.
//
// Paramètres de NAVIGATION du plan, à ne pas confondre avec vent.js qui, lui,
// n'affiche que l'indicateur de vent LIVE : ici, une vitesse propre (Vp) et un
// vent uniques pour tout le plan, saisis dans le bandeau du panneau « Plan de
// vol ». De là se déduit, branche par branche, le triangle des vitesses —
// dérive, cap à suivre, vitesse sol — et donc la durée.
//
// C'EST LE VENT PRÉVU, ET LUI SEUL. Le simulateur n'y touche pas, et c'est la
// pièce maîtresse du jeu.
//
// L'application lisait autrefois `AMBIENT WIND` et le versait dans ces cases
// toutes les 30 secondes, verrouillées, badge « MSFS » — habitude héritée de
// Clear Sky VFR, où savoir le vent qu'il fait est utile. Ici c'était fatal :
// une estime nourrie du vent RÉEL connaît la dérive exacte, ne dérive donc
// jamais, et il ne reste plus rien à trouver. Les intercepts seraient nuls et
// la visée cérémonielle.
//
// Le navigateur saisit donc le vent qu'il CROIT — celui du bulletin, celui de
// la veille, celui qu'il a estimé au double dérive. Le simulateur en applique
// un autre. **L'écart entre les deux est précisément ce que la droite de
// hauteur révèle**, et c'était le travail du navigateur : trouver sa position,
// et par elle, le vent qu'il subissait vraiment.
//
// LE VENT EST EN VRAI, comme dans le log de nav de NavXpressVFR et comme la
// colonne « Route » — même référentiel qu'un METAR écrit. (L'indicateur de vent
// de la carte, lui, reste affiché en magnétique — c'est ce que l'ATIS annonce.)
//
// Le passage en magnétique se fait une seule fois, au bout de la chaîne :
// la colonne « Cap » retranche la déclinaison LOCALE de la branche.
// ============================================================

let _planVp = null;        // vitesse propre (kt) — null = non renseignée
let _planVentDir = null;   // direction D'OÙ VIENT le vent (°, VRAIS) — null = non renseignée
let _planVentKt = null;    // force du vent (kt) — null = non renseignée

const VP_MAX = 500;        // garde-fous de saisie
const VENT_KT_MAX = 200;

// Triangle des vitesses d'une branche, tout en VRAI. Vent absent ou nul → air
// calme, la vitesse sol vaut la vitesse propre.
// Renvoie null quand le problème n'a pas de solution :
//   • pas de vitesse propre renseignée ;
//   • composante de travers du vent supérieure à la Vp (aucune dérive ne
//     rattrape la route) ;
//   • vitesse sol nulle ou négative (vent debout plus fort que la Vp).
function triangleVitesses(routeVraie) {
  if (!(_planVp > 0)) return null;
  const w = (Number.isFinite(_planVentKt) && _planVentKt > 0) ? _planVentKt : 0;
  const dir = (w > 0 && Number.isFinite(_planVentDir)) ? _planVentDir : 0;
  const RAD = Math.PI / 180;
  const beta = (dir - routeVraie) * RAD;         // écart entre le lit du vent et la route
  const sinDerive = (w / _planVp) * Math.sin(beta);
  if (Math.abs(sinDerive) > 1) return null;      // travers plus fort que la Vp
  const derive = Math.asin(sinDerive);           // > 0 = correction vers la droite
  const vs = _planVp * Math.cos(derive) - w * Math.cos(beta);
  if (!(vs > 0)) return null;                    // sur place, ou repoussé en arrière
  return {
    vs,                                          // vitesse sol (kt)
    derive: derive / RAD,                        // angle de dérive signé (°)
    capVrai: ((routeVraie + derive / RAD) % 360 + 360) % 360,   // cap VRAI à suivre
  };
}

// Triangle + durée de la branche, en secondes. null si le triangle est insoluble.
function brancheAvecTemps(routeVraie, distNm) {
  const tri = triangleVitesses(routeVraie);
  if (!tri) return null;
  return { ...tri, secondes: (distNm / tri.vs) * 3600 };
}

// Durée en h:mm:ss dès l'heure atteinte, mm:ss en deçà : compact, monospacé, et
// sans unité à deviner.
function formatDuree(s) {
  if (!Number.isFinite(s) || s < 0) return '—';
  const tot = Math.round(s);
  const h = Math.floor(tot / 3600);
  const mm = String(Math.floor((tot % 3600) / 60)).padStart(2, '0');
  const ss = String(tot % 60).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Raison pour laquelle une branche n'a ni vitesse sol ni durée.
function indiceSansTemps() {
  return _planVp > 0 ? t('legsTimeImpossible') : t('legsTimeNoVp');
}

// --- Saisie des paramètres ---------------------------------------------------

// Entier positif borné, saisie nettoyée en place. Chaîne vide → null.
function lireEntierChamp(el, max) {
  const v = el.value.replace(/[^\d]/g, '');
  if (el.value !== v) el.value = v;
  if (v === '') return null;
  return Math.min(max, parseInt(v, 10));
}

function relireParamsNav() {
  _planVp = lireEntierChamp($('nav-vp'), VP_MAX);
  const dir = lireEntierChamp($('nav-vent-dir'), 360);
  _planVentDir = dir == null ? null : dir % 360;   // 360 saisi = 000
  _planVentKt = lireEntierChamp($('nav-vent-kt'), VENT_KT_MAX);
  rafraichirTableauLegs();   // calcul local et instantané : pas de redessin de carte
  // L'estime avance avec CE vent-là. Elle vit dans le process principal, qui
  // n'a aucun autre moyen de le connaître — c'est une saisie, pas une SimVar.
  // Gardé : ce fichier est chargé bien avant estime.js, et un plan rouvert au
  // démarrage passerait ici avant que la fonction n'existe.
  if (typeof pousserVentPrevu === 'function') pousserVentPrevu();
}

['nav-vp', 'nav-vent-dir', 'nav-vent-kt'].forEach((id) => {
  $(id).addEventListener('input', relireParamsNav);
  // Les champs vivent dans le panneau : Entrée n'a rien à valider, mais elle ne
  // doit pas remonter non plus.
  $(id).addEventListener('keydown', (e) => e.stopPropagation());
});

// Applique des paramètres venus d'un plan chargé. Le vent prévu appartient au
// plan comme la vitesse propre : il se sauvegarde et se recharge avec lui.
function appliquerParamsNav({ vp, ventDir, ventKt } = {}) {
  $('nav-vp').value = Number.isFinite(vp) ? String(vp) : '';
  $('nav-vent-dir').value = Number.isFinite(ventDir) ? String(ventDir) : '';
  $('nav-vent-kt').value = Number.isFinite(ventKt) ? String(ventKt) : '';
  relireParamsNav();
}

/**
 * Ce que le navigateur CROIT du vent.
 *
 * Rendu tel quel à l'estime, qui avancera avec — et se trompera d'autant.
 * `null` tant que rien n'est saisi : air calme, pas de dérive.
 */
function ventPrevu() {
  return {
    dir: Number.isFinite(_planVentDir) ? _planVentDir : null,
    kt: Number.isFinite(_planVentKt) ? _planVentKt : null,
    vp: Number.isFinite(_planVp) ? _planVp : null,
  };
}
