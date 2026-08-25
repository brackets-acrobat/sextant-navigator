/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// pont.js — l'état du lien avec le sextant, et la consigne qu'on lui envoie.
//
// Le pont lui-même vit dans le process principal (src/main/pont.js) : c'est
// lui qui écoute sur la boucle locale. Ce fichier-ci n'en montre que l'état et
// lui passe les ordres.
//
// La CONSIGNE est le seul ordre qui descende : quel astre viser. Elle est
// mémorisée par le pont, si bien qu'on peut la donner avant même d'ouvrir le
// panneau dans le simulateur — c'est le cas normal, on prépare le crépuscule à
// la table puis on va sous l'astrodôme.
// ============================================================

let _pontEtat = { ecoute: false, port: null, clients: 0, error: null, consigne: null };

/** Le nom de l'astre sous consigne, ou null. */
function consigneCourante() {
  return _pontEtat.consigne && _pontEtat.consigne.body ? _pontEtat.consigne.body : null;
}

// Le bandeau d'état, présent dans plusieurs panneaux (le catalogue, d'où l'on
// envoie ; le carnet, où l'on reçoit). Une seule fonction les peint tous : deux
// bandeaux qui décriraient le même lien avec deux textes différents seraient
// pires que pas de bandeau du tout.
function renderPontEtat() {
  document.querySelectorAll('.pont-etat').forEach((el) => {
    let cle;
    let classe;
    if (!_pontEtat.ecoute) {
      cle = 'pontFerme';
      classe = 'pont-etat pont-ko';
    } else if (_pontEtat.clients > 0) {
      cle = 'pontConnecte';
      classe = 'pont-etat pont-ok';
    } else {
      cle = 'pontAttente';
      classe = 'pont-etat pont-attente';
    }
    const consigne = consigneCourante();
    // Plus de `{port}` : aucun des trois textes ne le porte, le navigateur n'a
    // pas à connaître le numéro de port du pont.
    let txt = t(cle).replace('{err}', _pontEtat.error || '');
    if (consigne) txt += ' · ' + t('pontConsigneEnCours').replace('{astre}', nomAstre(consigne));
    el.textContent = txt;
    el.className = classe;
  });
}

/**
 * Envoie l'astre à viser. `null` annule la consigne — le champ du sextant se
 * vide alors, plutôt que de garder un astre que le navigateur a abandonné.
 */
async function envoyerConsigne(astre) {
  const charge = astre === null ? { body: null } : {
    body: astre.name,
    // Les indications du navigateur, telles qu'il les voit à cet instant. Le
    // panneau les affiche sans les rafraîchir : c'est un papier qu'on passe,
    // et il vieillit pendant que l'appareil tourne. À charge pour le
    // navigateur d'en repasser un.
    hc: astre.hc,
    zn: astre.zn,
    gisement: astre.gisement,
    utc: _catData ? _catData.utc : null,
  };
  // La réponse porte l'état à jour : l'astre en surbrillance dans le catalogue
  // suit donc ce que le pont a VRAIMENT retenu, pas ce qu'on lui a demandé.
  majPontEtat(await window.sextant.pontConsigne(charge));
}

/** Reçoit un état neuf et repeint tout ce qui en dépend. */
function majPontEtat(e) {
  if (e) _pontEtat = e;
  renderPontEtat();
  majBoutonsConsigne();
}

window.sextant.onPontEtat(majPontEtat);
