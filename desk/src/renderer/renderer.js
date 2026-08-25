/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// renderer.js — orchestrateur du renderer.
//
// Ce fichier ne contient aucune fonctionnalité : il branche le bouton de
// connexion, écoute le flux du simulateur, et lance l'initialisation. Tout le
// reste vit dans js/features/, un fichier par fonctionnalité, chargés AVANT
// celui-ci (voir l'ordre des <script> dans index.html).
//
// Les scripts partagent la portée globale — pas de modules ES. C'est la
// convention de NavXpressVFR : l'ordre de chargement fait la dépendance.
// ============================================================

// --- Connexion au simulateur -------------------------------------------------

$('btn-connect').addEventListener('click', async () => {
  if (connecte) {
    await window.sextant.disconnect();
  } else {
    setStatus('connecting');
    const res = await window.sextant.connect();
    if (!res.ok && res.error) setStatus('disconnected', res.error);
  }
});

window.sextant.onStatus((s) => {
  if (s.state) setStatus(s.state, s.app || s.error || s.warn);
});

window.sextant.onScan((f) => majScan(f));

// Config rafraîchie par le main (version, source des réglages).
window.sextant.onConfig((cfg) => { lastConfig = cfg; });

// --- Initialisation ----------------------------------------------------------

function demarrerApplication() {
  initMap();
  setStatus('disconnected');
  majBoutonsPlan();   // « sauvegarder » désactivé tant que départ et arrivée manquent

  window.sextant.getConfig().then((cfg) => { lastConfig = cfg; });

  // Le pont s'ouvre avec le process principal, donc AVANT que cette fenêtre
  // existe : son premier événement d'état est déjà passé. On le demande une
  // fois plutôt que d'attendre le suivant, sinon les bandeaux resteraient à
  // « — » jusqu'à ce qu'un panneau se connecte.
  window.sextant.pontEtat().then(majPontEtat);
}

// Les traductions d'abord : les libellés statiques sont posés avant que la
// carte n'existe, sinon la première peinture se ferait dans la langue du HTML.
initI18n();
demarrerApplication();
