/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// controles-carte.js — menus déroulants de la carte : couches MSFS et fond de
// carte.
//
// Ils s'ouvrent au SURVOL et se replient quand la souris s'en éloigne : sur une
// carte, un menu qui demande un clic pour s'ouvrir et un autre pour se fermer
// coûte deux gestes là où le regard suffit.
// ============================================================

// Contrôles déroulants (haut-droite) : couches MSFS + fond de carte, côte à côte.
function ajouterControlesCarte() {
  const ctl = L.control({ position: 'topright' });
  ctl.onAdd = function () {
    const div = L.DomUtil.create('div', 'map-controls');
    div.innerHTML =
      // Widget 1 — couches (cases à cocher)
      `<div class="map-dropdown" id="ctl-couches">` +
        `<button class="map-dd-btn" type="button" data-i18n-title="layersTitle" title="${t('layersTitle')}" aria-haspopup="true" aria-expanded="false"><i class="ph-light ph-stack"></i></button>` +
        `<div class="map-dd-panel" hidden>` +
          `<label><input type="checkbox" data-layer="airports"> <span data-i18n="layerAirports">${t('layerAirports')}</span></label>` +
          `<label><input type="checkbox" data-layer="heliports"> <span data-i18n="layerHeliports">${t('layerHeliports')}</span></label>` +
          `<label><input type="checkbox" data-layer="seaplanes"> <span data-i18n="layerSeaplanes">${t('layerSeaplanes')}</span></label>` +
          `<label><input type="checkbox" data-layer="navaids"> <span data-i18n="layerNavaids">${t('layerNavaids')}</span></label>` +
          `<p class="map-dd-note" data-i18n="layerZoomNote">${t('layerZoomNote')}</p>` +
        `</div>` +
      `</div>` +
      // Widget 2 — fond de carte (boutons radio)
      `<div class="map-dropdown" id="ctl-fond">` +
        `<button class="map-dd-btn" type="button" data-i18n-title="basemapTitle" title="${t('basemapTitle')}" aria-haspopup="true" aria-expanded="false"><i class="ph-light ph-map-trifold"></i></button>` +
        `<div class="map-dd-panel" hidden>` +
          `<label><input type="radio" name="basemap" data-base="opentopomap"> OpenTopoMap</label>` +
          `<label><input type="radio" name="basemap" data-base="openstreetmap"> OpenStreetMap</label>` +
          `<label><input type="radio" name="basemap" data-base="darkmatter"> Dark Matter</label>` +
          `<label><input type="radio" name="basemap" data-base="positron"> Positron</label>` +
          `<label><input type="radio" name="basemap" data-base="esriimagery"> Esri World Imagery</label>` +
          // Dark Matter et Positron sont filigranés tant que CARTO n'a pas sa
          // clé. La porte d'entrée est ici, sous les fonds concernés : c'est en
          // les choisissant qu'on découvre le filigrane.
          `<button class="map-dd-action" type="button" id="btn-carto-key" data-i18n="cartoKeyBtn">${t('cartoKeyBtn')}</button>` +
          `<p class="map-dd-note" id="carto-note"></p>` +
        `</div>` +
      `</div>`;
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);

    // ------------------------------------------------------------
    // Ouverture au SURVOL, repli quand on s'en éloigne. Un seul menu ouvert.
    //
    // Le repli est DIFFÉRÉ, et ce n'est pas du confort : le panneau est posé
    // 6 px sous son bouton (top: calc(100% + 6px)), et ces 6 px n'appartiennent
    // à aucun des deux. Sans délai, le simple fait de descendre vers le menu le
    // referait disparaître — et il ne se rouvrirait pas, puisqu'il n'y aurait
    // plus rien à survoler.
    //
    // Le repli tient aussi compte de l'élément qui a le focus : c'est ce qui
    // rend les menus atteignables au clavier, et ce qui les garde ouverts
    // pendant qu'on manipule une case à cocher au clavier.
    // ------------------------------------------------------------
    const DELAI_REPLI_MS = 220;
    const dropdowns = [...div.querySelectorAll('.map-dropdown')];
    let replier = null;

    function basculer(dd, ouvert) {
      dd.querySelector('.map-dd-panel').hidden = !ouvert;
      dd.querySelector('.map-dd-btn').setAttribute('aria-expanded', String(ouvert));
    }

    function ouvrir(dd) {
      clearTimeout(replier);
      replier = null;
      dropdowns.forEach((o) => basculer(o, o === dd));
    }

    function programmerRepli() {
      clearTimeout(replier);
      replier = setTimeout(() => {
        dropdowns.forEach((o) => {
          if (!o.contains(document.activeElement)) basculer(o, false);
        });
      }, DELAI_REPLI_MS);
    }

    dropdowns.forEach((dd) => {
      dd.addEventListener('mouseenter', () => ouvrir(dd));
      dd.addEventListener('mouseleave', programmerRepli);
      // Clavier : tabuler jusqu'au bouton ouvre le menu, en sortir le referme.
      // Un clic passe par là aussi, puisqu'il donne le focus au bouton.
      dd.addEventListener('focusin', () => ouvrir(dd));
      dd.addEventListener('focusout', programmerRepli);
    });

    // Couches
    div.querySelectorAll('input[data-layer]').forEach((cb) => {
      cb.checked = !!layerState[cb.dataset.layer];
      cb.addEventListener('change', () => {
        layerState[cb.dataset.layer] = cb.checked;
        localStorage.setItem('sextant-layer-' + cb.dataset.layer, cb.checked ? '1' : '0');
        rafraichirCouches();
      });
    });

    // Fond de carte
    const fondActuel = localStorage.getItem('sextant-basemap') || 'opentopomap';
    div.querySelectorAll('input[data-base]').forEach((rb) => {
      rb.checked = (rb.dataset.base === fondActuel);
      rb.addEventListener('change', () => { if (rb.checked) appliquerFond(rb.dataset.base); });
    });

    // Clé CARTO
    div.querySelector('#btn-carto-key').addEventListener('click', ouvrirModaleCarto);
    majNoteCarto();
    return div;
  };
  ctl.addTo(map);
}

// Note sous le choix des fonds : dit si la clé CARTO est en place. Son texte
// est calculé, pas statique — d'où la reprise à la bascule de langue (apropos.js).
function majNoteCarto() {
  const note = $('carto-note');
  if (note) note.textContent = cleCarto() ? t('cartoNoteSet') : t('cartoNoteMissing');
  const oublier = $('btn-carto-clear');
  if (oublier) oublier.hidden = !cleCarto();
}
