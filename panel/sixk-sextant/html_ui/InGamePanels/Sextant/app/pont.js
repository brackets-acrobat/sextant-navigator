/**
 * Le pont, cote instrument.
 *
 * L'application ecoute sur la boucle locale, le panneau appelle. C'est le seul
 * sens possible : un panneau MSFS est une page dans un moteur embarque, il peut
 * ouvrir une WebSocket, il ne peut pas en recevoir une.
 *
 * Ce que le pont porte, et rien d'autre :
 *
 *   table  -> sextant : la CONSIGNE — quel astre viser.
 *                       le CARNET   — les visees que la table detient.
 *   sextant -> table  : la FILE     — les visees qu'elle ne detient pas encore.
 *
 *
 * ── POURQUOI IL N'Y A PLUS D'ACCUSE DE RECEPTION ────────────────────────────
 *
 * La version precedente marchait par accuse : la table repondait « recu, id X »
 * et le panneau retirait X de sa file. Un seul message, une seule chance. S'il
 * se perdait — connexion qui meurt entre le rangement et la reponse, table
 * fermee dans la seconde, moteur du simulateur qui laisse tomber une trame —
 * la visee restait en file POUR TOUJOURS. Rien ne la relancait : le renvoi
 * n'avait qu'un declencheur, l'ouverture d'une connexion. Sur une liaison qui
 * ne retombait jamais, le compteur restait bloque sans que rien ne l'explique,
 * et c'est exactement ce qui est arrive le 25 aout 2026.
 *
 * Le remplacant ne s'appuie sur AUCUN message en particulier :
 *
 *   1. le panneau annonce sa file entiere — a la connexion, puis toutes les
 *      RELANCE_MS tant qu'elle n'est pas vide ;
 *   2. la table repond avec les identifiants qu'elle DETIENT, ecrits sur son
 *      disque, apres chaque rangement et a chaque connexion ;
 *   3. le panneau retire de sa file ce que la table detient.
 *
 * Un message perdu ne coute donc plus une visee : il coute quelques secondes,
 * le suivant fait le meme travail. C'est une reconciliation, pas un protocole
 * a etats — elle est idempotente, insensible a l'ordre, et se repare seule.
 *
 * La garantie d'origine est intacte, et pour la meme raison qu'avant : une
 * visee n'est retiree que contre la preuve POSITIVE que la table l'a ecrite.
 * Le renvoi en double n'est pas un incident, c'est le fonctionnement normal —
 * la table dedoublonne par identifiant.
 *
 *
 * ── ET POURQUOI IL Y A DESORMAIS UN TEMOIN DE LIAISON ───────────────────────
 *
 * Le panneau ne disait pas si la table etait la. La plaque de consigne ne
 * compte pas : elle affiche le dernier papier recu et ne se rafraichit jamais,
 * donc elle reste lisible des heures apres que la table a ferme. Le compteur de
 * visees en attente ne le disait pas non plus — « 3 PENDING » signifiait aussi
 * bien « la table les etudie » que « il n'y a personne au bout ».
 *
 * `etat()` porte donc `lien`, qui vaut ce que la liaison vaut VRAIMENT : la
 * socket est ouverte ET la table s'est manifestee depuis moins de SILENCE_MS.
 * Une socket ouverte sur une application morte ne suffit pas — c'est le cas que
 * le battement du serveur met du temps a decouvrir.
 */

/**
 * Le port. Il est en dur des deux cotes — ici et dans la configuration de
 * l'application — parce qu'un panneau MSFS n'a aucun moyen de lire un fichier
 * de reglages. Le changer oblige donc a le changer aux DEUX endroits ; c'est
 * ecrit dans config.example.json de l'application, en face du reglage.
 */
export const PONT_PORT = 8787;

const RETARD_MIN_MS = 1000;
const RETARD_MAX_MS = 10000;

/**
 * Le pas de la reconciliation. Assez court pour qu'une visee bloquee se
 * debloque avant qu'on ait le temps de s'en inquieter, assez long pour ne rien
 * couter : c'est un tableau d'identifiants, quelques dizaines d'octets.
 */
const RELANCE_MS = 5000;

/**
 * Au-dela de ce silence, la table est declaree absente meme si la socket tient.
 * Le serveur bat toutes les quelques secondes et repond a nos annonces : trois
 * fois la relance laisse la marge qu'il faut sans mentir longtemps.
 */
const SILENCE_MS = 15000;

export class Pont {
  /**
   * @param {object} rappels
   * @param {(consigne: object|null) => void} rappels.surConsigne
   * @param {(etat: object) => void} rappels.surEtat
   * @param {(file: object[]) => void} [rappels.surVidage] la file a change et
   *   merite d'etre reecrite sur le disque du panneau.
   * @param {{ port?: number, relanceMs?: number }} [options] Le panneau n'en
   *   passe JAMAIS : il ne sait pas lire de reglages, son port est celui de la
   *   constante. C'est un parametre legitime d'un client reseau, dont les
   *   epreuves se servent pour ne pas se disputer un port fixe entre elles, et
   *   pour ne pas attendre cinq secondes a chaque verification.
   */
  constructor(rappels, options) {
    this.rappels = rappels || {};
    this.port = (options && options.port) || PONT_PORT;
    this.relanceMs = (options && options.relanceMs) || RELANCE_MS;
    this.silenceMs = (options && options.silenceMs) || SILENCE_MS;
    this.ws = null;
    this.retard = RETARD_MIN_MS;
    this.connecte = false;
    /** Visees que la table n'a pas encore confirme detenir. */
    this.file = [];
    this.consigne = null;
    /** Date du dernier message venu de la table. 0 = elle ne s'est jamais dite. */
    this.vueA = 0;
    /** Ce que le dernier carnet recu annoncait. Null tant qu'il n'en est venu aucun. */
    this.dernierCarnet = null;
    /** Le dernier message recu, quel qu'il soit, decrit brutalement. */
    this.dernierMessage = null;
    /** Entrees ecartees parce qu'aucune table ne pourra jamais les ranger. */
    this.rebuts = 0;
    this._minuterie = null;
    this._relance = null;
    this._ferme = false;
  }

  /**
   * La liaison telle qu'elle est, pas telle qu'on l'espere.
   *
   * `connecte` dit que la socket est ouverte ; `lien` dit que quelqu'un repond
   * au bout. Les deux different precisement dans le cas qui nous a coute une
   * apres-midi : l'application fermee alors que la socket n'est pas encore
   * tombee, ou un moteur qui garde une socket zombie.
   */
  etat() {
    return {
      connecte: this.connecte,
      lien: this.connecte && this.vueA > 0 && (Date.now() - this.vueA) < this.silenceMs,
      enAttente: this.file.length,
      consigne: this.consigne,
      // De quoi confronter les deux listes sans console : ce que le dernier
      // carnet annoncait, et ce que la file tient. Si ces deux identifiants
      // sont identiques et que rien n'est retire, la comparaison est en cause ;
      // s'ils different, c'est que les deux moities ne parlent pas des memes
      // visees, et il faut chercher ailleurs.
      dernierCarnet: this.dernierCarnet,
      dernierMessage: this.dernierMessage,
      premiereEnFile: this.file.length ? String(this.file[0] && this.file[0].id) : '—',
      rebuts: this.rebuts,
    };
  }

  _direEtat() {
    if (this.rappels.surEtat) this.rappels.surEtat(this.etat());
  }

  /**
   * Ouvre, et se rouvre tout seul. A appeler une fois au demarrage : tout le
   * reste est automatique.
   */
  demarrer() {
    this._ferme = false;
    this._connecter();
    this._armerRelance();
  }

  arreter() {
    this._ferme = true;
    if (this._minuterie) { clearTimeout(this._minuterie); this._minuterie = null; }
    if (this._relance) { clearInterval(this._relance); this._relance = null; }
    if (this.ws) { try { this.ws.close(); } catch (e) { /* deja partie */ } }
    this.ws = null;
    this.connecte = false;
    this._direEtat();
  }

  /**
   * Le battement : la reconciliation, et la question qui tient le temoin.
   *
   * Il envoie TOUJOURS quelque chose quand la socket est ouverte — la file s'il
   * y a quelque chose a proposer, un simple appel sinon. C'est ce qui fait du
   * temoin de liaison une mesure et non une impression : la table repond au
   * carnet, donc `lien` veut dire « elle m'a repondu », pas « il s'est passe
   * quelque chose recemment ».
   *
   * Sans cet appel a vide, un sextant a jour et une table vivante restaient
   * quinze secondes sans echanger un mot des que la file etait vide — ce qui
   * est le cas NORMAL — et le panneau annoncait « NO TABLE » a tort. Une
   * fausse alarme permanente est pire qu'aucune alarme : elle rend les vraies
   * illisibles.
   */
  _armerRelance() {
    if (this._relance) return;
    this._relance = setInterval(() => {
      if (this._ferme) return;
      if (this.connecte) {
        if (this.file.length) this._annoncerFile();
        else this._envoyer({ type: 'appel' });
      }
      this._direEtat();   // le temoin vieillit tout seul
    }, this.relanceMs);
  }

  _connecter() {
    if (this._ferme) return;
    let ws;
    try {
      ws = new WebSocket(`ws://127.0.0.1:${this.port}/`);
    } catch (e) {
      // Certains moteurs embarques jettent au CONSTRUCTEUR quand rien n'ecoute,
      // au lieu de declencher 'error' plus tard. Sans ce filet, le demarrage du
      // panneau entier echouerait parce que l'application n'est pas lancee.
      this._replanifier();
      return;
    }
    this.ws = ws;

    ws.onopen = () => {
      this.connecte = true;
      this.retard = RETARD_MIN_MS;   // une connexion reussie remet le compteur
      this._envoyer({ type: 'bonjour', role: 'sextant', version: 2 });
      this._annoncerFile();
      this._direEtat();
    };

    ws.onmessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(ev.data);
      } catch (e) {
        return;   // un message illisible se jette, il ne casse pas le pont
      }
      if (!msg || typeof msg !== 'object') return;
      // TOUT message prouve que la table est vivante, y compris un que nous ne
      // savons pas lire : c'est la seule chose qu'on puisse en deduire a coup
      // sur, et c'est exactement ce que le temoin de liaison mesure.
      this.vueA = Date.now();

      // RELEVE BRUT, pris AVANT tout traitement et sans condition.
      //
      // Il est ici, et pas dans la branche du carnet, parce qu'une branche qui
      // ne s'execute pas ne peut rien raconter : si le type n'est pas celui
      // qu'on croit, ou si le tableau n'en est pas un, c'est precisement ce
      // qu'il faut voir. Le panneau n'a ni console ni deboguer, et les
      // infobulles `title` n'existent pas dans ce moteur — la seule facon
      // d'apprendre quelque chose est de l'ECRIRE a l'ecran.
      this.dernierMessage = {
        type: String(msg.type),
        aIds: (typeof msg.ids !== 'undefined'),
        estTableau: Array.isArray(msg.ids),
        nIds: Array.isArray(msg.ids) ? msg.ids.length : -1,
      };

      this._recevoir(msg);
    };

    // 'error' et 'close' arrivent souvent tous les deux : c'est `_replanifier`
    // qui garantit qu'une seule reconnexion sera armee.
    ws.onerror = () => { this._tombe(); };
    ws.onclose = () => { this._tombe(); };
  }

  _tombe() {
    if (this.ws) { this.ws.onopen = null; this.ws.onmessage = null; }
    this.ws = null;
    if (!this.connecte && this._minuterie) return;
    this.connecte = false;
    this.vueA = 0;
    this._direEtat();
    this._replanifier();
  }

  _replanifier() {
    if (this._ferme || this._minuterie) return;
    const delai = this.retard;
    this.retard = Math.min(RETARD_MAX_MS, this.retard * 2);
    this._minuterie = setTimeout(() => {
      this._minuterie = null;
      this._connecter();
    }, delai);
  }

  /** Toute la file, d'un coup. C'est la seule facon dont une visee monte. */
  _annoncerFile() {
    if (!this.file.length) return;
    this._envoyer({ type: 'visees', visees: this.file });
  }

  _recevoir(msg) {
    if (msg.type === 'consigne') {
      // `body: null` annule la consigne : le navigateur a change d'avis, ou
      // n'a plus rien a proposer.
      this.consigne = msg.body ? msg : null;
      if (this.rappels.surConsigne) this.rappels.surConsigne(this.consigne);
      this._direEtat();
      return;
    }

    // Le carnet de la table : ce qu'elle DETIENT, ecrit. Tout ce qui y figure
    // peut quitter notre file — et rien d'autre.
    //
    // LA COMPARAISON EST VOLONTAIREMENT PRIMITIVE. `new Set(...).has(...)` etait
    // plus court et plus joli ; il tournait juste sous Node et n'a pas libere
    // une seule visee dans le simulateur. On ne peut pas deboguer dans ce
    // moteur : on n'y met donc que ce qui ne peut pas surprendre — un tableau,
    // `String()` des deux cotes, et `indexOf`. Rien de tout cela ne depend
    // d'une subtilite d'implementation.
    // `Array.isArray` et non `instanceof Array` : le second ment des que le
    // tableau vient d'un autre contexte que celui ou l'on teste, et un panneau
    // MSFS est une iframe. Le premier ne s'y laisse jamais prendre.
    if (msg.type === 'carnet' && Array.isArray(msg.ids)) {
      const tenues = [];
      for (let i = 0; i < msg.ids.length; i += 1) tenues.push(String(msg.ids[i]));

      const restantes = [];
      let retires = 0;
      for (let i = 0; i < this.file.length; i += 1) {
        const v = this.file[i];
        const id = String(v && v.id);
        if (tenues.indexOf(id) >= 0) retires += 1; else restantes.push(v);
      }
      this.file = restantes;

      // Ce que la comparaison a vu, pour que le panneau puisse le dire. Sans
      // console ni deboguer, c'est la seule fenetre sur ce qui se passe ici.
      this.dernierCarnet = {
        n: tenues.length,
        retires,
        exemple: tenues.length ? tenues[0] : '—',
      };

      if (retires && this.rappels.surVidage) this.rappels.surVidage(this.file);
      this._direEtat();
    }
  }

  /**
   * Depose une visee. Elle part tout de suite si la table est la, et reste dans
   * la file dans tous les cas jusqu'a ce que la table confirme la detenir.
   */
  deposer(visee) {
    // Meme garde qu'a la reprise, et pour la meme raison : ce qui ne pourra
    // jamais etre range n'a rien a faire dans une file d'attente. Le cas ne
    // devrait pas se produire — `stopShot` construit la visee juste au-dessus —
    // mais c'est ici que la file se remplit, donc c'est ici que ca se garde.
    if (!Pont.utilisable(visee)) { this.rebuts += 1; this._direEtat(); return; }
    this.file.push(visee);
    if (this.connecte) this._annoncerFile();
    this._direEtat();
  }

  /**
   * Recharge la file au demarrage, depuis ce que le panneau avait garde.
   *
   * ET ELLE FILTRE, parce qu'une file peut contenir ce qui n'y a pas sa place.
   *
   * Le 25 aout 2026, trois entrees sans identifiant y dormaient. La table les
   * rejetait a chaque proposition — `normaliser()` exige un `id` — donc elles
   * n'entraient jamais au carnet, donc le carnet ne les nommait jamais, donc
   * elles ne sortaient jamais de la file. Le compteur affichait « 3 PENDING »
   * a vie, et aucune reconnexion, aucune relance, aucun redemarrage ne pouvait
   * y changer quoi que ce soit.
   *
   * La regle qui en sort : NE JAMAIS METTRE EN FILE CE QUE LE DESTINATAIRE NE
   * POURRA JAMAIS ACCEPTER. Une file d'attente promet « rien ne se perd » ;
   * elle ne tient cette promesse que si tout ce qu'elle contient peut, un jour,
   * partir. Le reste n'est pas du travail en attente, c'est une fausse alarme
   * permanente — et une fausse alarme permanente est pire qu'aucune alarme,
   * puisqu'elle rend les vraies illisibles.
   */
  reprendre(visees) {
    if (!Array.isArray(visees)) return;
    const bonnes = [];
    let rebuts = 0;
    for (let i = 0; i < visees.length; i += 1) {
      if (Pont.utilisable(visees[i])) bonnes.push(visees[i]); else rebuts += 1;
    }
    this.file = bonnes;
    this.rebuts = rebuts;
    this._direEtat();
  }

  /**
   * Une visee que la table pourra ranger.
   *
   * Le contrat est celui de `normaliser()` cote application, reduit a ce qui la
   * fait REFUSER. Les deux doivent rester d'accord : si l'un se durcit sans que
   * l'autre suive, on remet en file des visees qui ne partiront pas — c'est
   * exactement la panne qu'on repare ici.
   */
  static utilisable(v) {
    if (!v || typeof v !== 'object') return false;
    if (typeof v.id !== 'string' || !v.id) return false;
    if (typeof v.body !== 'string' || !v.body) return false;
    if (typeof v.hs !== 'number' || !isFinite(v.hs)) return false;
    return !isNaN(new Date(v.utc).getTime());
  }

  _envoyer(obj) {
    if (!this.ws) return;
    try {
      this.ws.send(JSON.stringify(obj));
    } catch (e) {
      this._tombe();
    }
  }
}
