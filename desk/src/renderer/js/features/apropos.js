/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// apropos.js — modale « À propos ».
// ============================================================

// ============================================================
// Modale « À propos » (bouton « ? » du header). Liens externes ouverts
// dans le navigateur par défaut via setWindowOpenHandler (main.js).
// ============================================================
$('btn-about').addEventListener('click', () => {
  const v = lastConfig && lastConfig.version;
  $('about-version').textContent = v ? 'v' + v : '';
  $('about-overlay').hidden = false;
});
$('btn-about-close').addEventListener('click', () => { $('about-overlay').hidden = true; });
$('about-overlay').addEventListener('click', (e) => {
  if (e.target === $('about-overlay')) $('about-overlay').hidden = true;   // clic sur le fond
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('about-overlay').hidden) $('about-overlay').hidden = true;
});

// Toggle FR / EN : change la langue puis ré-applique les textes dynamiques
// (les libellés statiques sont gérés par applyTranslations() dans setLanguage).
$('btn-lang-toggle').addEventListener('click', () => {
  setLanguage(currentLang === 'fr' ? 'en' : 'fr');
  renderStatus();
  renderUpdateBanner();
  renderCatalogue();   // tableau d'astres : ses textes sont calculés, pas statiques
  renderVisees();      // carnet des visées reçues, idem
  renderPontEtat();    // bandeau du pont : une phrase entière, pas un libellé
  renderPlanchette();  // la feuille de position : ses libellés sont peints dans le SVG
  majNoteCarto();      // note « clé CARTO » du menu des fonds : texte calculé
});
