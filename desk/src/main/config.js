/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// config.js — chargement de la configuration locale.
//
// Priorité de lecture : settings.json (inscriptible) > config.json (racine,
// gitignoré) > config.example.json > défauts. settings.json est le SEUL fichier
// écrit ici ; il est centralisé dans le dossier de travail « Documents/Clear
// Sky VFR », aux côtés de data/ (bases MSFS extraites) — et non dans
// l'arborescence du code, pour fonctionner aussi en app packagée où l'asar est
// en lecture seule.
//
// L'application n'a ni compte, ni clé, ni serveur : la configuration ne porte
// donc que l'emplacement du dossier de travail.
// ============================================================

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const ROOT = path.join(__dirname, '..', '..');

// Dossier de travail commun (data/, settings.json).
// Déterminé par dossierTravail (config.json/example) sinon « Documents/Clear
// Sky VFR ». NB : on ignore ici settings.json (qui s'y trouve) pour éviter
// toute dépendance circulaire — l'emplacement du dossier ne s'auto-déplace pas.
function dossierBase() {
  const exemple = lireFichier(path.join(ROOT, 'config.example.json'));
  const local = lireFichier(path.join(ROOT, 'config.json'));
  const choisi = ((local && local.dossierTravail) || (exemple && exemple.dossierTravail) || '').trim();
  return choisi || path.join(app.getPath('documents'), 'Sextant Navigator');
}

// Sous-dossier de travail, créé à la demande.
function dossierDonnees() { return path.join(dossierBase(), 'data'); }

// Réglages inscriptibles, dans le dossier de travail.
function cheminSettings() {
  return path.join(dossierBase(), 'settings.json');
}

const DEFAULTS = {
  dossierTravail: '',
  // Port du pont avec le panneau du sextant (127.0.0.1 seulement). Le panneau
  // porte la même valeur en dur : changer l'un oblige à changer l'autre.
  pontPort: 8787,
};

function lireFichier(p) {
  try {
    const brut = fs.readFileSync(p, 'utf-8');
    const obj = JSON.parse(brut);
    // On ignore les clés de commentaire (préfixe _).
    return Object.fromEntries(Object.entries(obj).filter(([k]) => !k.startsWith('_')));
  } catch (_) {
    return null;
  }
}

// Charge la config effective.
function chargerConfig() {
  const exemple = lireFichier(path.join(ROOT, 'config.example.json'));
  const local = lireFichier(path.join(ROOT, 'config.json'));
  const reglages = lireFichier(cheminSettings());
  const cfg = { ...DEFAULTS, ...(exemple || {}), ...(local || {}), ...(reglages || {}) };

  const source = reglages ? 'paramètres'
    : (local ? 'config.json' : (exemple ? 'config.example.json' : 'défauts'));

  return { ...cfg, _source: source };
}

module.exports = {
  chargerConfig,
  dossierBase, dossierDonnees,
  DEFAULTS,
};
