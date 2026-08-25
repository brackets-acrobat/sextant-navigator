/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// noyau.js — le seul endroit qui sache où vit le noyau d'éphémérides.
//
// Trois modules du process principal en ont besoin — le catalogue d'astres,
// l'estime, la réduction — et chacun s'était mis à porter sa propre copie du
// chargeur. Trois copies d'un chemin, c'est trois chances de n'en corriger que
// deux le jour où l'empaquetage change.
//
// LA FRONTIÈRE DE MODULES. Le noyau est en modules ES ("type": "module" dans
// sextant/package.json), ce process est en CommonJS. `require()` échoue net sur
// cette frontière — c'est le message ERR_REQUIRE_ESM. Seul l'import DYNAMIQUE
// la traverse, et il faut lui donner une URL de fichier : sous Windows,
// `import('C:\\…')` prend le C: pour un protocole. D'où pathToFileURL.
//
// Le noyau n'est PAS recopié dans l'application : elle calcule avec exactement
// le code que les tests de sextant/test/ éprouvent. Une correction
// d'éphéméride profite au panneau et à l'application le même jour.
// ============================================================

const path = require('path');
const { pathToFileURL } = require('url');

// En développement le noyau est à côté, dans le dépôt ; une fois l'application
// empaquetée, electron-builder l'a déposé dans les ressources (voir
// « extraResources » dans package.json) — hors du répertoire de l'application,
// donc hors de l'archive asar, et son chemin n'a rien à voir avec __dirname.
function chemin() {
  const { app } = require('electron');
  if (app && app.isPackaged) return path.join(process.resourcesPath, 'noyau', 'index.js');
  return path.join(__dirname, '..', '..', '..', 'src', 'index.js');
}

// Chargé à la première demande, et une seule fois. L'import dynamique est
// asynchrone, et rien ne justifie de retarder l'ouverture de la fenêtre pour un
// module dont on ne se sert qu'une fois le catalogue ouvert.
let _noyau = null;
let _chargement = null;

function charger() {
  if (_noyau) return Promise.resolve(_noyau);
  if (!_chargement) {
    _chargement = import(pathToFileURL(chemin()).href)
      .then((m) => { _noyau = m; return m; })
      .catch((err) => { _chargement = null; throw err; });
  }
  return _chargement;
}

/** Le noyau s'il est déjà là, `null` sinon. Pour le code qui ne peut pas attendre. */
function dejaCharge() { return _noyau; }

module.exports = { charger, dejaCharge, chemin };
