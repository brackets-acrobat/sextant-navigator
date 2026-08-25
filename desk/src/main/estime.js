/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// estime.js — où l'on CROIT être.
//
// C'est la pièce dont tout le reste dépend. La droite de hauteur ne donne pas
// une position, elle donne un ÉCART à une position supposée : sans estime, il
// n'y a rien à corriger, et le point n'a pas de sens.
//
// CE QUE CE MODULE A LE DROIT DE SAVOIR, et pourquoi la liste est si courte :
//
//   le CAP VRAI          — il se lit au compas. Un équipage l'a.
//   la VITESSE PROPRE    — elle se lit au badin. Un équipage l'a.
//   le VENT PRÉVU        — le navigateur le déclare. C'est une supposition.
//   l'heure              — elle se lit à la montre.
//
// CE QU'IL NE DOIT JAMAIS RECEVOIR :
//
//   la VITESSE SOL et la ROUTE SOL du simulateur. Elles sont dans la même
//   trame, à une ligne d'ici, et elles contiennent le vent VRAI. Les brancher
//   ferait une estime qui ne dérive plus — et RIEN NE SE CASSERAIT : les points
//   deviendraient simplement excellents, et personne ne verrait pourquoi.
//
// D'où la signature de `avancer()` : elle ne prend pas la trame, elle prend
// quatre nombres. L'appelant doit les extraire un par un, et ce geste est le
// garde-fou. Voir main.js, où il est fait et commenté.
//
// LA SEULE EXCEPTION, et elle est bornée : au SOL, l'estime se recale
// continûment sur la position vraie. Ce n'est pas une fuite, c'est la réalité —
// on sait où est le terrain d'où l'on décolle. Au décollage, ce canal se ferme,
// et l'estime part vivre sa vie.
//
// L'HORLOGE EST CELLE DU SIMULATEUR. Elle l'est depuis le 2026-08-22 ; elle
// était celle du PC, et c'était faux de deux façons. D'abord le carnet de visées
// porte l'heure zulu du simulateur — une nuit de 1943, peut-être — si bien que
// `cruesA()`, interrogée avec l'heure d'une visée, tombait toujours à des
// décennies du plus proche échantillon et rendait invariablement le premier de
// la liste : le transport des droites travaillait avec la route du DÉBUT du vol,
// quels que soient les virages. Ensuite l'avion parcourt une distance qui dépend
// du temps SIMULÉ, pas du temps écoulé au poignet : à deux fois la vitesse du
// temps, l'estime n'avançait que de moitié. Faute d'heure simulateur — flux
// coupé, application seule — on retombe sur celle du PC.
//
// LE PLOT AIR, et pourquoi il double l'estime. L'estime intègre le vent SUPPOSÉ ;
// le plot air n'intègre que le cap et le badin, deux lectures de cockpit, et
// ignore le vent par construction. Au moment du point, l'écart entre la position
// air et le point observé EST le déplacement dû au vent réel : divisé par le
// temps écoulé, il donne le vent qu'on a subi. C'est l'autre métier du
// navigateur, et c'est ce qui referme la boucle — le vent trouvé nourrit
// l'estime jusqu'au point suivant.
// ============================================================

const noyau = require('./noyau');

// L'historique des valeurs CRUES : route et vitesse sol telles que le
// navigateur les déduit de son cap, de son badin et du vent qu'il suppose.
//
// Il sert au TRANSPORT des droites de hauteur. Une visée d'il y a dix minutes
// doit être ramenée à l'instant commun, et le noyau demande pour cela la route
// et la vitesse — celles que le navigateur CROIT avoir, jamais les vraies.
// Sans cet historique, il faudrait les lui donner constantes, ce qui serait
// faux dès le premier virage.
//
// Un échantillon toutes les cinq secondes, deux heures de mémoire : le vol
// entier tient, et cela reste douze cents entrées.
const PAS_HISTORIQUE_MS = 5000;
const MEMOIRE_MS = 2 * 3600 * 1000;

// Au-delà, on considère que le flux a été coupé — pause du simulateur, fenêtre
// masquée, chargement — et l'on ne fait pas avancer l'estime de tout ce temps.
// Une pause de dix minutes ne doit pas déplacer l'avion de vingt-cinq milles.
const TROU_MAX_MS = 5000;

class Estime {
  constructor() {
    /** Position CRUE, et l'instant auquel elle vaut. `null` = pas encore calée. */
    this.pos = null;
    this.t = 0;
    /** Ce que le navigateur suppose du vent. */
    this.vent = { dir: null, kt: null };
    /** Dernière route et vitesse sol crues, pour l'affichage. */
    this.route = null;
    this.gs = null;
    this.derive = null;
    /** Vrai tant que l'appareil est au sol : l'estime y colle à la vérité. */
    this.auSol = true;
    /**
     * LE PLOT AIR : où l'on serait s'il n'y avait pas de vent. Construit avec
     * le cap et le badin seuls — il ne sait rien du vent, pas même celui qu'on
     * suppose. C'est ce qui permet, au point suivant, de mesurer le vent RÉEL.
     */
    this.air = null;
    /** Instant d'ancrage du plot air, sur l'horloge du simulateur. */
    this.airT = 0;
    /** D'où le plot air est parti — pour le dire au navigateur. */
    this.airAncre = null;
    /** Comment la position courante a été obtenue. */
    this.origine = 'aucune';   // 'aucune' | 'sol' | 'estime' | 'point' | 'manuelle'
    /** Instant du dernier calage franc — l'estime vieillit depuis. */
    this.caleeA = 0;
    this.historique = [];
  }

  etat() {
    return {
      calee: !!this.pos,
      lat: this.pos ? this.pos.lat : null,
      lon: this.pos ? this.pos.lon : null,
      t: this.t || null,
      route: this.route,
      gs: this.gs,
      derive: this.derive,
      auSol: this.auSol,
      origine: this.origine,
      // Âge de l'estime, en secondes : c'est la seule mesure honnête de ce
      // qu'elle vaut. Une estime de trois minutes est bonne, une estime d'une
      // heure ne l'est plus.
      ageS: this.caleeA ? Math.max(0, (this.t - this.caleeA) / 1000) : null,
      vent: { dir: this.vent.dir, kt: this.vent.kt },
    };
  }

  /** Le vent que le navigateur déclare. Rien d'autre ne doit l'écrire. */
  setVent({ dir, kt } = {}) {
    this.vent = {
      dir: Number.isFinite(dir) ? ((dir % 360) + 360) % 360 : null,
      kt: Number.isFinite(kt) && kt >= 0 ? kt : null,
    };
    return this.etat();
  }

  /**
   * Calage franc : on sait où l'on est. Décollage, ou point observé.
   *
   * L'instant par défaut est celui de l'ESTIME, pas `Date.now()` : l'horloge de
   * cette classe est celle du simulateur, et y injecter l'heure du PC ferait un
   * saut de plusieurs décennies quand on vole une nuit de 1943. L'appelant qui
   * connaît l'heure simulateur la passe ; celui qui ne la connaît pas se tait,
   * et l'estime garde la sienne.
   */
  caler({ lat, lon, t, origine = 'manuelle' } = {}) {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return this.etat();
    this.pos = { lat, lon };
    this.t = Number.isFinite(t) ? t : (this.t || Date.now());
    this.origine = origine;
    this.caleeA = this.t;
    // Un calage franc RÉANCRE LE PLOT AIR : le vent qu'on mesurera ensuite est
    // celui subi depuis ce point-ci, pas depuis le décollage. C'est ce qui rend
    // la mesure vivante — chaque point donne le vent du tronçon qui vient de
    // s'écouler, et non une moyenne diluée sur tout le vol.
    this._ancrerAir();
    return this.etat();
  }

  /** Repart le plot air de la position courante, à l'instant courant. */
  _ancrerAir() {
    this.air = this.pos ? { lat: this.pos.lat, lon: this.pos.lon } : null;
    this.airAncre = this.air ? { lat: this.air.lat, lon: this.air.lon } : null;
    this.airT = this.t;
  }

  /**
   * Fait avancer l'estime d'une trame à l'autre.
   *
   * QUATRE NOMBRES, ET PAS LA TRAME. Voir l'en-tête du fichier : c'est ici
   * qu'une distraction ferait entrer la vérité.
   *
   * @param {object} o
   * @param {number} o.t            horodatage PC de la trame, en ms — secours
   * @param {number} [o.tSim]       heure ZULU DU SIMULATEUR, en ms. C'est
   *        l'horloge de référence : voir l'en-tête du fichier.
   * @param {number} o.headingTrue  cap VRAI lu au compas
   * @param {number} o.tasKt        vitesse propre lue au badin
   * @param {boolean} o.onGround    au sol : l'estime ne court pas
   * @param {number} [o.latSol]     position vraie, UTILISÉE AU SOL SEULEMENT
   * @param {number} [o.lonSol]     idem — on sait où est son terrain
   */
  avancer({ t, tSim, headingTrue, tasKt, onGround, latSol, lonSol } = {}) {
    const n = noyau.dejaCharge();
    if (!n) return;                         // noyau pas encore chargé
    // L'heure du simulateur si elle est là, celle du PC sinon.
    const horloge = Number.isFinite(tSim) ? tSim : t;
    if (!Number.isFinite(horloge)) return;
    const dtMs = this.t ? horloge - this.t : 0;

    this.auSol = !!onGround;

    if (onGround) {
      // Au sol : l'estime EST la position, et l'horloge du vieillissement
      // reste à zéro. Le canal se referme au décollage.
      if (Number.isFinite(latSol) && Number.isFinite(lonSol)) {
        this.pos = { lat: latSol, lon: lonSol };
        this.origine = 'sol';
        this.caleeA = horloge;
      }
      this.t = horloge;
      this.route = null;
      this.gs = null;
      this.derive = null;
      // Au sol, le plot air suit le terrain : il n'y a pas de vent à mesurer
      // tant qu'on ne vole pas, et il doit partir du point de décollage.
      this._ancrerAir();
      return;
    }

    if (!this.pos) { this.t = horloge; return; }   // en vol sans calage : rien à avancer

    const g = n.groundVector({
      headingTrue,
      tasKt,
      windFromDeg: this.vent.dir === null ? 0 : this.vent.dir,
      windKt: this.vent.kt === null ? 0 : this.vent.kt,
    });
    this.route = g.trackDeg;
    this.gs = g.groundSpeedKt;
    this.derive = g.driftDeg;

    // Trou dans le flux : on note l'instant sans déplacer l'avion. Mieux vaut
    // une estime en retard qu'une estime lancée à travers la carte.
    if (dtMs > 0 && dtMs <= TROU_MAX_MS) {
      const nm = (g.groundSpeedKt * dtMs) / 3600000;
      this.pos = n.advancePosition(this.pos, nm, g.trackDeg);
      if (this.origine === 'sol') this.origine = 'estime';

      // LE PLOT AIR AVANCE AU CAP ET AU BADIN, sans le vent. C'est la seule
      // ligne qui sépare les deux tracés, et c'est tout le calcul du vent :
      // l'un porte le vent supposé, l'autre n'en porte aucun.
      if (this.air && Number.isFinite(headingTrue) && Number.isFinite(tasKt)) {
        const nmAir = (tasKt * dtMs) / 3600000;
        this.air = n.advancePosition(this.air, nmAir, headingTrue);
      }

      this._noter(horloge, g);
    }
    this.t = horloge;
  }

  _noter(t, g) {
    const dernier = this.historique[this.historique.length - 1];
    if (dernier && t - dernier.t < PAS_HISTORIQUE_MS) return;
    this.historique.push({
      t,
      trackDeg: g.trackDeg,
      gsKt: g.groundSpeedKt,
      // La position air est échantillonnée avec le reste : le point observé
      // porte l'heure de sa MI-TEMPS, souvent une minute avant qu'on le fasse,
      // et à 150 kt une minute vaut deux milles et demi de vent en trop.
      air: this.air ? { lat: this.air.lat, lon: this.air.lon } : null,
    });
    const limite = t - MEMOIRE_MS;
    while (this.historique.length && this.historique[0].t < limite) this.historique.shift();
  }

  /** L'échantillon le plus proche d'un instant. Null si l'historique est vide. */
  _echantillonA(t) {
    if (!this.historique.length) return null;
    let best = this.historique[0];
    let ecart = Math.abs(best.t - t);
    for (const h of this.historique) {
      const d = Math.abs(h.t - t);
      if (d < ecart) { ecart = d; best = h; }
    }
    return best;
  }

  /**
   * LE VENT QU'ON A SUBI, mesuré au point observé.
   *
   * On compare le point à la position AIR du même instant, et l'on divise par le
   * temps écoulé depuis l'ancrage. Le calcul est au noyau ; ce qui se joue ici
   * est de prendre la position air À LA BONNE HEURE — celle de la mi-temps des
   * visées, sur l'horloge du simulateur.
   *
   * @param {object} o
   * @param {number} o.lat  le point observé
   * @param {number} o.lon
   * @param {number} [o.t]  instant du point, horloge simulateur. Par défaut :
   *                        maintenant, ce qui est bon si le point vient d'être fait.
   */
  ventCalcule({ lat, lon, t } = {}) {
    const n = noyau.dejaCharge();
    if (!n) return { ok: false, error: 'noyau' };
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { ok: false, error: 'point' };
    if (!this.air || !this.airT) return { ok: false, error: 'pas-de-plot' };

    const instant = Number.isFinite(t) ? t : this.t;
    const hours = (instant - this.airT) / 3600000;
    // Sous cinq minutes, l'écart de position est trop court devant l'erreur du
    // point : une minute d'arc de faux sur dix milles de vol donne six nœuds de
    // vent imaginaire. Le manuel dit la même chose autrement — on cherche le
    // vent sur une branche, pas sur un virage.
    if (hours < 5 / 60) return { ok: false, error: 'trop-court', hours };

    const ech = this._echantillonA(instant);
    const air = ech && ech.air ? ech.air : this.air;
    const v = n.windFromAirPlot({ air, fix: { lat, lon }, hours });
    if (!v) return { ok: false, error: 'calcul' };

    return {
      ok: true,
      windFromDeg: v.windFromDeg,
      windKt: v.windKt,
      driftNm: v.driftNm,
      hours,
      // Ce que le navigateur croyait, pour qu'il voie l'écart. C'est cet écart
      // qui a produit toute la dérive de son estime.
      ventCru: { dir: this.vent.dir, kt: this.vent.kt },
      ancre: this.airAncre ? { lat: this.airAncre.lat, lon: this.airAncre.lon } : null,
    };
  }

  /**
   * Route et vitesse CRUES à un instant donné, pour le transport d'une droite.
   * L'échantillon le plus proche ; à défaut, les valeurs courantes ; à défaut,
   * rien du tout — et le transport se fera alors sans course, ce qui est
   * honnête quand on n'a rien tenu.
   */
  cruesA(t) {
    const best = this._echantillonA(t);
    if (!best) {
      return { trackDeg: this.route === null ? 0 : this.route, gsKt: this.gs === null ? 0 : this.gs };
    }
    return { trackDeg: best.trackDeg, gsKt: best.gsKt };
  }

  /** Repart de zéro : nouveau vol. */
  oublier() {
    this.pos = null;
    this.t = 0;
    this.route = null;
    this.gs = null;
    this.derive = null;
    this.origine = 'aucune';
    this.caleeA = 0;
    this.historique = [];
    this.air = null;
    this.airT = 0;
    this.airAncre = null;
    return this.etat();
  }
}

module.exports = { Estime };
