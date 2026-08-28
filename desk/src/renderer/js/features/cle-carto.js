/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// cle-carto.js — modale de saisie de la clé API CARTO.
//
// CARTO a rendu la clé obligatoire sur ses fonds raster : sans elle, Dark
// Matter et Positron arrivent filigranés. La clé étant nominative et comptée
// sur un quota, elle ne peut pas être livrée avec l'application — celle de
// l'auteur ne serait plus la sienne au premier téléchargement. Chacun demande
// donc la sienne (gratuite, immédiate) et la range ici.
//
// Elle ne quitte pas la machine : localStorage, puis paramètre d'URL des
// requêtes de tuiles — c'est-à-dire vers CARTO et personne d'autre. Le stockage
// et sa lecture sont dans carte.js (CLE_CARTO_STOCKAGE, cleCarto, urlFond).
// ============================================================

function ouvrirModaleCarto() {
  $('carto-key').value = cleCarto();
  $('carto-error').textContent = '';
  majNoteCarto();   // « Oublier la clé » n'apparaît que s'il y en a une
  $('carto-overlay').hidden = false;
  setTimeout(() => { try { $('carto-key').focus(); $('carto-key').select(); } catch (_) {} }, 50);
}

function fermerModaleCarto() { $('carto-overlay').hidden = true; }

// Ce qu'on colle n'est pas toujours la clé nue : la page de CARTO donne
// l'exemple d'URL complet, et c'est lui qu'on a sous la souris. On en extrait
// le paramètre plutôt que d'enregistrer une URL entière comme clé.
function extraireCleCarto(saisie) {
  const brut = String(saisie || '').trim();
  const m = brut.match(/[?&]key=([^&\s]+)/);
  return m ? decodeURIComponent(m[1]) : brut;
}

function validerCleCarto() {
  const cle = extraireCleCarto($('carto-key').value);
  if (!cle) { $('carto-error').textContent = t('cartoEmpty'); return; }
  // Une clé qui traîne un espace ou un guillemet vient d'un copier-coller
  // malheureux ; encodeURIComponent la ferait passer, et les tuiles
  // reviendraient filigranées sans qu'on sache pourquoi.
  if (/[\s"'<>]/.test(cle)) { $('carto-error').textContent = t('cartoInvalid'); return; }
  localStorage.setItem(CLE_CARTO_STOCKAGE, cle);
  rafraichirFondCarto();
  majNoteCarto();
  fermerModaleCarto();
}

function oublierCleCarto() {
  localStorage.removeItem(CLE_CARTO_STOCKAGE);
  rafraichirFondCarto();
  majNoteCarto();
  fermerModaleCarto();
}

$('btn-carto-ok').addEventListener('click', validerCleCarto);
$('btn-carto-cancel').addEventListener('click', fermerModaleCarto);
$('btn-carto-clear').addEventListener('click', oublierCleCarto);
$('carto-overlay').addEventListener('click', (e) => {
  if (e.target === $('carto-overlay')) fermerModaleCarto();   // clic sur le fond
});
$('carto-key').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); validerCleCarto(); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('carto-overlay').hidden) fermerModaleCarto();
});
