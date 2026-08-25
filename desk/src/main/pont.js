/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// pont.js — le pont entre l'instrument et la table.
//
// Le panneau est sous l'astrodôme, l'application est à la station de nav, et
// entre les deux il n'y a qu'une chose à faire passer :
//
//   table  → sextant : la CONSIGNE — quel astre viser, et où le chercher.
//   sextant → table  : la VISÉE — ce que le tambour a donné.
//
// C'est tout. La position, l'heure, le vent, l'application les lit elle-même
// par SimConnect : elle n'a pas besoin du panneau pour savoir où l'on est, et
// le panneau n'a jamais à le lui dire.
//
// POURQUOI UN SERVEUR ÉCRIT À LA MAIN. Un panneau MSFS est une page dans un
// moteur embarqué : il peut ouvrir une WebSocket, il ne peut pas en recevoir
// une. C'est donc l'application qui écoute. Restait à choisir entre ajouter la
// dépendance `ws` et écrire les cent cinquante lignes du protocole. Elles sont
// écrites : le projet n'a aucune dépendance native, le noyau n'a aucune
// dépendance du tout, et un protocole qu'on n'a pas écrit est un protocole
// qu'on ne sait pas déboguer le jour où le simulateur se comporte autrement
// que le navigateur. Elles sont éprouvées contre le client WebSocket NATIF de
// Node — une implémentation indépendante de la mienne, ce qui est la seule
// façon de ne pas se donner raison tout seul (voir test/pont.test.js).
//
// SÉCURITÉ. Le serveur n'écoute que sur 127.0.0.1. Ce n'est pas une précaution
// de principe : sans elle, tout appareil du réseau local pourrait pousser des
// visées dans le carnet ou lire la position réelle de l'appareil.
// ============================================================

const http = require('http');
const crypto = require('crypto');
const EventEmitter = require('events');

/** La constante magique du protocole, RFC 6455 §1.3. Elle ne bouge jamais. */
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

const OP_CONT = 0x0;
const OP_TEXT = 0x1;
const OP_BIN = 0x2;
const OP_CLOSE = 0x8;
const OP_PING = 0x9;
const OP_PONG = 0xa;

// Une visée pèse trois cents octets. Ce plafond n'est pas un réglage de
// performance : c'est un garde-fou contre une trame annonçant deux gigaoctets
// de charge utile, que l'on accumulerait sagement jusqu'à tomber.
const MAX_MESSAGE = 1 << 20;   // 1 Mio

const PING_MS = 25000;

/** Réponse d'ouverture : la clé du client, hachée avec la constante. */
function accepterCle(cle) {
  return crypto.createHash('sha1').update(cle + GUID).digest('base64');
}

/**
 * Compose une trame SERVEUR. Elle n'est jamais masquée — c'est le client qui
 * masque, jamais l'inverse (RFC 6455 §5.1), et un serveur qui masque ses
 * trames se fait fermer la connexion au nez par un navigateur.
 */
function encoder(opcode, charge) {
  const data = Buffer.isBuffer(charge) ? charge : Buffer.from(String(charge), 'utf8');
  const n = data.length;
  let entete;
  if (n < 126) {
    entete = Buffer.alloc(2);
    entete[1] = n;
  } else if (n < 65536) {
    entete = Buffer.alloc(4);
    entete[1] = 126;
    entete.writeUInt16BE(n, 2);
  } else {
    entete = Buffer.alloc(10);
    entete[1] = 127;
    // Les 32 bits de poids fort restent nuls : on ne dépasse pas 4 Gio, et
    // writeUInt32BE évite d'exiger les BigInt du moteur.
    entete.writeUInt32BE(0, 2);
    entete.writeUInt32BE(n, 6);
  }
  entete[0] = 0x80 | opcode;   // FIN = 1, une trame par message
  return Buffer.concat([entete, data]);
}

/**
 * Le décodeur : un automate qui avale des octets et rend des messages.
 *
 * Il est écrit comme une classe parce qu'il a de la mémoire : TCP ne livre pas
 * des trames, il livre des octets. Une trame peut arriver en trois morceaux, et
 * trois trames peuvent arriver dans un seul morceau. Tout code qui suppose
 * « un paquet = une trame » marche sur la table de développement et casse le
 * jour où le message est un peu plus long.
 */
class Decodeur {
  constructor() {
    this.tampon = Buffer.alloc(0);
    // Fragmentation : un message peut être découpé en une trame de tête et des
    // trames de continuation. Nos messages sont courts et aucun navigateur ne
    // les fragmente, mais rien n'INTERDIT de le faire — et un décodeur qui
    // l'ignore rend un message tronqué sans le dire, ce qui est pire que de
    // tomber.
    this.morceaux = [];
    this.opcodeMessage = null;
  }

  /** @returns {Array<{op: number, data: Buffer}>} messages complets */
  avaler(chunk) {
    this.tampon = this.tampon.length ? Buffer.concat([this.tampon, chunk]) : chunk;
    const sortie = [];

    for (;;) {
      const t = this.tampon;
      if (t.length < 2) break;

      const fin = (t[0] & 0x80) !== 0;
      const opcode = t[0] & 0x0f;
      const masque = (t[1] & 0x80) !== 0;
      let n = t[1] & 0x7f;
      let i = 2;

      if (n === 126) {
        if (t.length < i + 2) break;
        n = t.readUInt16BE(i);
        i += 2;
      } else if (n === 127) {
        if (t.length < i + 8) break;
        const haut = t.readUInt32BE(i);
        n = t.readUInt32BE(i + 4);
        i += 8;
        if (haut !== 0) throw new Error('trame trop longue');
      }
      if (n > MAX_MESSAGE) throw new Error('trame trop longue');

      // Une trame venant du client DOIT être masquée. Une trame non masquée est
      // soit une erreur de protocole, soit quelqu'un qui n'est pas un client
      // WebSocket : dans les deux cas on ferme.
      if (!masque) throw new Error('trame client non masquee');
      if (t.length < i + 4) break;
      const cle = t.subarray(i, i + 4);
      i += 4;

      if (t.length < i + n) break;   // charge incomplète : on attend la suite
      const data = Buffer.allocUnsafe(n);
      for (let k = 0; k < n; k += 1) data[k] = t[i + k] ^ cle[k & 3];
      this.tampon = t.subarray(i + n);

      // Les trames de contrôle (fermeture, ping, pong) ne sont jamais
      // fragmentées et peuvent s'intercaler AU MILIEU d'un message fragmenté :
      // elles se traitent tout de suite, sans toucher aux morceaux en cours.
      if (opcode >= 0x8) {
        sortie.push({ op: opcode, data });
        continue;
      }

      if (opcode === OP_CONT) {
        if (this.opcodeMessage === null) throw new Error('continuation sans debut');
        this.morceaux.push(data);
      } else {
        if (this.opcodeMessage !== null) throw new Error('nouveau message sans fin du precedent');
        this.opcodeMessage = opcode;
        this.morceaux = [data];
      }

      if (!fin) continue;
      sortie.push({ op: this.opcodeMessage, data: Buffer.concat(this.morceaux) });
      this.morceaux = [];
      this.opcodeMessage = null;
    }

    return sortie;
  }
}

/**
 * Le pont.
 *
 * Événements :
 *   'etat'  { ecoute, port, clients, error }  — pour le bandeau de l'interface
 *   'visee' { … }                             — une visée arrive du sextant
 *
 * Plusieurs clients sont admis. Ce n'est pas de la générosité : pendant le
 * développement, le panneau tourne dans un navigateur ET dans le simulateur, et
 * un pont qui refuse le second est un pont qu'on ne peut pas mettre au point.
 */
class Pont extends EventEmitter {
  constructor() {
    super();
    this.serveur = null;
    this.clients = new Set();
    this.port = null;
    this.erreur = null;
    /** Dernière consigne émise : un client qui arrive la reçoit aussitôt. */
    this.consigne = null;
    this._battement = null;
  }

  etat() {
    return {
      ecoute: !!this.serveur && this.serveur.listening,
      port: this.port,
      clients: this.clients.size,
      error: this.erreur,
      consigne: this.consigne,
    };
  }

  _diffuserEtat() { this.emit('etat', this.etat()); }

  demarrer(port) {
    if (this.serveur) return Promise.resolve(this.etat());
    this.port = port;
    this.erreur = null;

    return new Promise((resolve) => {
      const serveur = http.createServer((req, res) => {
        // Le pont ne sert pas de pages. Répondre quelque chose de lisible plutôt
        // que de laisser pendre : si quelqu'un ouvre le port dans un navigateur,
        // autant qu'il sache sur quoi il est tombé.
        res.writeHead(426, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Sextant Navigator — pont WebSocket. Ce port ne sert pas de pages.\n');
      });

      serveur.on('upgrade', (req, socket) => this._accueillir(req, socket));

      serveur.on('error', (err) => {
        // Le cas courant : EADDRINUSE, une autre instance ou un autre logiciel
        // sur le même port. Ce n'est pas fatal — l'application marche sans le
        // pont — mais il faut le DIRE, sinon le panneau reste muet sans raison
        // visible.
        this.erreur = err && err.code === 'EADDRINUSE'
          ? `port ${port} deja pris` : (err && err.message) || String(err);
        this.serveur = null;
        this._diffuserEtat();
        resolve(this.etat());
      });

      serveur.listen(port, '127.0.0.1', () => {
        this.serveur = serveur;
        this._battement = setInterval(() => this._battre(), PING_MS);
        this._diffuserEtat();
        resolve(this.etat());
      });
    });
  }

  arreter() {
    if (this._battement) { clearInterval(this._battement); this._battement = null; }
    for (const c of this.clients) { try { c.socket.destroy(); } catch (_) {} }
    this.clients.clear();
    if (this.serveur) {
      try { this.serveur.close(); } catch (_) {}
      this.serveur = null;
    }
    this._diffuserEtat();
  }

  _accueillir(req, socket) {
    const cle = req.headers['sec-websocket-key'];
    if ((req.headers.upgrade || '').toLowerCase() !== 'websocket' || !cle) {
      socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
      return;
    }

    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n'
      + 'Upgrade: websocket\r\n'
      + 'Connection: Upgrade\r\n'
      + `Sec-WebSocket-Accept: ${accepterCle(cle)}\r\n\r\n`,
    );

    // Nagle décale l'envoi pour grouper les petits paquets. Nos messages SONT
    // petits et rares : le groupement n'économise rien et ajoute son délai à la
    // consigne.
    socket.setNoDelay(true);

    const client = { socket, decodeur: new Decodeur(), vivant: true };
    this.clients.add(client);

    socket.on('data', (chunk) => {
      client.vivant = true;
      let messages;
      try {
        messages = client.decodeur.avaler(chunk);
      } catch (err) {
        this._fermer(client, 1002, (err && err.message) || 'protocole');
        return;
      }
      for (const m of messages) this._recevoir(client, m);
    });

    const partir = () => {
      this.clients.delete(client);
      this._diffuserEtat();
    };
    socket.on('close', partir);
    socket.on('end', partir);
    socket.on('error', partir);

    this._envoyer(client, { type: 'bienvenue', app: 'Sextant Navigator', version: 1 });
    // Un panneau qui arrive en cours de vol doit savoir tout de suite quel
    // astre viser : sans ce rappel, il attendrait que le navigateur re-clique.
    if (this.consigne) this._envoyer(client, this.consigne);
    this._diffuserEtat();
  }

  _recevoir(client, m) {
    if (m.op === OP_CLOSE) { this._fermer(client, 1000, ''); return; }
    if (m.op === OP_PING) { this._brut(client, encoder(OP_PONG, m.data)); return; }
    if (m.op === OP_PONG) return;                 // la marque de vie suffit
    if (m.op === OP_BIN) return;                  // le pont ne parle que texte

    let msg;
    try {
      msg = JSON.parse(m.data.toString('utf8'));
    } catch (_) {
      return;   // un message illisible se jette : il ne fait pas tomber le pont
    }
    if (!msg || typeof msg !== 'object') return;

    if (msg.type === 'visee' && msg.visee) {
      // Le pont N'ACQUITTE PAS lui-même. L'accusé autorise le panneau à oublier
      // la visée : le donner à la réception voudrait dire « je l'ai », alors
      // qu'on ne l'a que dans une variable. Si le disque refuse juste après, le
      // travail du joueur n'existe plus nulle part.
      //
      // C'est donc celui qui RANGE qui acquitte (voir main.js), une fois la
      // visée écrite. Tant qu'il ne l'a pas fait, le panneau la garde et la
      // renverra à la prochaine reconnexion.
      this.emit('visee', msg.visee);
      return;
    }
    if (msg.type === 'bonjour') {
      this.emit('etat', Object.assign(this.etat(), { salut: msg }));
    }
  }

  /**
   * Accuse réception d'une visée : le panneau peut l'oublier.
   *
   * Diffusé à tous les clients plutôt qu'à celui qui a envoyé — le panneau
   * filtre sur l'identifiant, et un panneau rouvert entre-temps n'est plus la
   * même connexion que celui qui avait émis.
   */
  accuser(id) {
    for (const c of this.clients) this._envoyer(c, { type: 'recu', ids: [id] });
  }

  /** La consigne : quel astre viser. `body: null` l'annule. */
  envoyerConsigne(consigne) {
    this.consigne = Object.assign({ type: 'consigne' }, consigne);
    for (const c of this.clients) this._envoyer(c, this.consigne);
    this._diffuserEtat();
    return this.etat();
  }

  _envoyer(client, obj) {
    this._brut(client, encoder(OP_TEXT, JSON.stringify(obj)));
  }

  _brut(client, trame) {
    try {
      client.socket.write(trame);
    } catch (_) {
      this.clients.delete(client);
    }
  }

  _fermer(client, code, raison) {
    const charge = Buffer.alloc(2 + Buffer.byteLength(raison));
    charge.writeUInt16BE(code, 0);
    charge.write(raison, 2);
    try {
      client.socket.write(encoder(OP_CLOSE, charge));
      client.socket.end();
    } catch (_) {}
    this.clients.delete(client);
    this._diffuserEtat();
  }

  /**
   * Le battement.
   *
   * Un panneau MSFS ne se ferme pas, il DISPARAÎT : la fenêtre est détruite
   * sans que rien ne soit envoyé, et la connexion reste ouverte côté serveur
   * pendant des heures. Sans ce ping, l'interface annoncerait un sextant
   * connecté longtemps après qu'il ait cessé d'exister.
   */
  _battre() {
    for (const c of [...this.clients]) {
      if (!c.vivant) { this._fermer(c, 1001, 'silence'); continue; }
      c.vivant = false;                       // à charge pour lui de le prouver
      this._brut(c, encoder(OP_PING, Buffer.alloc(0)));
    }
  }
}

module.exports = { Pont, encoder, Decodeur, accepterCle, OP_TEXT, OP_CLOSE, OP_PING, OP_PONG };
