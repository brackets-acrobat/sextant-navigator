/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// maj.js — bannière de mise à jour automatique.
// ============================================================

// ============================================================
// Bannière de mise à jour automatique (electron-updater).
// On ne dérange l'utilisateur que pour le téléchargement en cours et la MAJ
// prête (les états checking/available/none/error restent silencieux).
// ============================================================
let updateState = null;   // dernier état reçu du main (pour re-rendu à la bascule de langue)

function renderUpdateBanner() {
  const banner = $('update-banner');
  const text = $('update-banner-text');
  const action = $('update-banner-action');
  const st = updateState && updateState.state;

  if (st === 'downloading') {
    text.textContent = t('updateDownloading').replace('{percent}', updateState.percent ?? 0);
    action.hidden = true;
    banner.hidden = false;
  } else if (st === 'ready') {
    text.textContent = t('updateReady').replace('{version}', updateState.version || '');
    action.innerHTML = '<i class="ph-light ph-arrow-clockwise"></i> ' + t('updateRestart');
    action.hidden = false;
    banner.hidden = false;
  } else {
    banner.hidden = true;
  }
}

$('update-banner-action').addEventListener('click', () => window.sextant.installUpdate());
window.sextant.onUpdateStatus((p) => { updateState = p; renderUpdateBanner(); });
// Rejeu : rattrape un état de MAJ émis avant que l'écouteur ci-dessus soit posé
// (course au démarrage / rechargement de la fenêtre).
if (typeof window.sextant.getUpdateState === 'function') {
  Promise.resolve(window.sextant.getUpdateState())
    .then((s) => { if (s) { updateState = s; renderUpdateBanner(); } })
    .catch(() => {});
}
