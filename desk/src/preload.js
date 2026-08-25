/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// preload.js — pont sécurisé renderer ↔ main (contextIsolation).
//
// Tout ce que le renderer peut demander au process principal passe par ici, et
// rien d'autre. Chaque abonnement renvoie sa fonction de désabonnement.
//
// Rappel hérité de NavXpressVFR : NE JAMAIS require() un fichier local ici
// sous sandbox — seuls les modules d'Electron sont disponibles.
// ============================================================

const { contextBridge, ipcRenderer } = require('electron');

function abonner(canal, cb) {
  const h = (_e, p) => cb(p);
  ipcRenderer.on(canal, h);
  return () => ipcRenderer.removeListener(canal, h);
}

contextBridge.exposeInMainWorld('sextant', {
  // Configuration
  getConfig: () => ipcRenderer.invoke('app-config'),

  // Simulateur
  connect: () => ipcRenderer.invoke('sc-connect'),
  disconnect: () => ipcRenderer.invoke('sc-disconnect'),

  // Import des aéroports et navaids MSFS 2024
  msfsVerifierLancement: () => ipcRenderer.invoke('msfs-verifier-lancement'),
  msfsExtraireAeroports: (options) => ipcRenderer.invoke('extraire-aeroports-msfs', options),
  msfsExtraireNavaids: () => ipcRenderer.invoke('extraire-navaids-msfs'),
  onMsfsExtractProgress: (cb) => abonner('msfs-extract-progress', cb),
  onMsfsNavaidsProgress: (cb) => abonner('msfs-navaids-progress', cb),

  // Terrains add-on (analyse des paquets sur le disque)
  addonsEtat: () => ipcRenderer.invoke('addons-etat'),
  addonsChoisirDossier: () => ipcRenderer.invoke('addons-choisir-dossier'),
  addonsScanner: (racine) => ipcRenderer.invoke('addons-scanner', { racine }),

  // Relief (jeu de données GLOBE) et profil vertical
  elevationExiste: () => ipcRenderer.invoke('elevation-existe'),
  importerElevation: () => ipcRenderer.invoke('importer-elevation'),
  onElevationProgress: (cb) => abonner('elevation-progress', cb),
  profilVertical: (charge) => ipcRenderer.invoke('profil-vertical', charge),

  // Données carte
  aeroportsDansBbox: (bbox) => ipcRenderer.invoke('aeroports-bbox', bbox),
  navaidsDansBbox: (bbox) => ipcRenderer.invoke('navaids-bbox', bbox),
  aeroportParCode: (code) => ipcRenderer.invoke('aeroport-par-code', code),
  rechercherLieux: (requete) => ipcRenderer.invoke('rechercher-lieux', requete),
  featureProche: (lat, lon, rayonNm) => ipcRenderer.invoke('feature-proche', { lat, lon, rayonNm }),

  // Astres (noyau d'éphémérides)
  astresCatalogue: (charge) => ipcRenderer.invoke('astres-catalogue', charge),
  astresQualite: (azimuths) => ipcRenderer.invoke('astres-qualite', { azimuths }),

  // Estime, réduction, point et débriefing
  estimeEtat: () => ipcRenderer.invoke('estime-etat'),
  estimeVent: (dir, kt) => ipcRenderer.invoke('estime-vent', { dir, kt }),
  estimeCaler: (charge) => ipcRenderer.invoke('estime-caler', charge),
  estimeOublier: () => ipcRenderer.invoke('estime-oublier'),
  estimeVentCalcule: (charge) => ipcRenderer.invoke('estime-vent-calcule', charge),
  reduire: (charge) => ipcRenderer.invoke('reduire', charge),
  debriefer: (charge) => ipcRenderer.invoke('debriefer', charge),

  // Étalonnage : une série de visées depuis une position CONNUE
  etalonnageEtat: () => ipcRenderer.invoke('etalonnage-etat'),
  etalonnageDemarrer: (charge) => ipcRenderer.invoke('etalonnage-demarrer', charge),
  etalonnageArreter: () => ipcRenderer.invoke('etalonnage-arreter'),
  etalonnageBasculer: (id) => ipcRenderer.invoke('etalonnage-basculer', id),
  etalonnageMesurer: () => ipcRenderer.invoke('etalonnage-mesurer'),
  etalonnageAdopter: (charge) => ipcRenderer.invoke('etalonnage-adopter', charge),
  etalonnageOublier: () => ipcRenderer.invoke('etalonnage-oublier'),

  // Pont avec le sextant, et carnet des visées reçues
  pontEtat: () => ipcRenderer.invoke('pont-etat'),
  pontConsigne: (charge) => ipcRenderer.invoke('pont-consigne', charge),
  viseesListe: () => ipcRenderer.invoke('visees-liste'),
  viseesSupprimer: (id) => ipcRenderer.invoke('visees-supprimer', id),
  viseesVider: () => ipcRenderer.invoke('visees-vider'),

  // Navigation
  declinaison: (lat, lon) => ipcRenderer.invoke('declinaison', { lat, lon }),
  sauverPlan: (charge) => ipcRenderer.invoke('sauver-plan', charge),
  ouvrirPlan: (charge) => ipcRenderer.invoke('ouvrir-plan', charge),

  // Mise à jour automatique
  installUpdate: () => ipcRenderer.invoke('update-install'),
  getUpdateState: () => ipcRenderer.invoke('update-get-state'),   // rejeu (course au démarrage)

  // Abonnements (main → renderer)
  onConfig: (cb) => abonner('app-config', cb),
  onStatus: (cb) => abonner('sc-status', cb),
  onScan: (cb) => abonner('sc-scan', cb),
  onPontEtat: (cb) => abonner('pont-etat', cb),
  onPontVisee: (cb) => abonner('pont-visee', cb),
  onEstime: (cb) => abonner('estime-etat', cb),
  onUpdateStatus: (cb) => abonner('update-status', cb),
});
