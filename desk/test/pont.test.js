/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

/**
 * Le pont, éprouvé contre un client qui n'est pas le mien.
 *
 * Le serveur WebSocket de `src/main/pont.js` est écrit à la main. Le tester
 * avec un client écrit à la main lui aussi ne prouverait rien : deux erreurs
 * symétriques se valident l'une l'autre, et le protocole ne se plaindrait qu'en
 * vol, dans un moteur embarqué sans console. On l'éprouve donc contre le client
 * `WebSocket` NATIF de Node — implémentation indépendante, écrite par d'autres,
 * qui refuse ce qui n'est pas conforme.
 *
 *   node --test        (depuis desk/)
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { Pont, encoder, Decodeur, accepterCle } = require('../src/main/pont.js');

// Le client natif est arrivé avec Node 22. En dessous, ces tests ne prouvent
// plus rien : mieux vaut le dire que passer en silence.
const CLIENT_NATIF = typeof WebSocket === 'function';

/** Un port libre par test : deux tests en parallèle ne se disputent rien. */
let prochainPort = 8900;
const portLibre = () => prochainPort++;

function ouvrir(pont) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${pont.port}/`);
    const recus = [];
    ws.addEventListener('message', (ev) => recus.push(JSON.parse(ev.data)));
    ws.addEventListener('open', () => resolve({ ws, recus }));
    ws.addEventListener('error', () => reject(new Error('connexion refusee')));
  });
}

/** Attend qu'une condition devienne vraie, ou rend la main au bout du délai. */
async function jusqua(cond, ms = 2000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (cond()) return true;
    await new Promise((r) => setTimeout(r, 10));
  }
  return false;
}

// ---------------------------------------------------------------------------
// Le codage, sans réseau.

test('poignee de main — la cle de reference de la RFC 6455', () => {
  // L'exemple de la RFC §1.3. S'il tombe juste, le hachage et l'encodage
  // base64 sont bons, et la poignée de main sera acceptée par tout client.
  assert.equal(accepterCle('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
});

test('trames — le serveur ne masque jamais, et sait les trois tailles', () => {
  const court = encoder(0x1, 'ok');
  assert.equal(court[0], 0x81);          // FIN + texte
  assert.equal(court[1] & 0x80, 0);      // masque interdit au serveur
  assert.equal(court[1] & 0x7f, 2);

  const moyen = encoder(0x1, 'x'.repeat(200));
  assert.equal(moyen[1] & 0x7f, 126);
  assert.equal(moyen.readUInt16BE(2), 200);

  const long = encoder(0x1, 'x'.repeat(70000));
  assert.equal(long[1] & 0x7f, 127);
  assert.equal(long.readUInt32BE(2), 0);
  assert.equal(long.readUInt32BE(6), 70000);
});

// Le décodeur ne voit que des trames CLIENT, donc masquées : on en fabrique.
function trameClient(opcode, texte, { fin = true } = {}) {
  const data = Buffer.from(texte, 'utf8');
  const cle = Buffer.from([0x12, 0x34, 0x56, 0x78]);
  const n = data.length;
  let entete;
  if (n < 126) { entete = Buffer.alloc(2); entete[1] = 0x80 | n; }
  else { entete = Buffer.alloc(4); entete[1] = 0x80 | 126; entete.writeUInt16BE(n, 2); }
  entete[0] = (fin ? 0x80 : 0) | opcode;
  const masquee = Buffer.allocUnsafe(n);
  for (let k = 0; k < n; k += 1) masquee[k] = data[k] ^ cle[k & 3];
  return Buffer.concat([entete, cle, masquee]);
}

test('decodeur — TCP livre des octets, pas des trames', () => {
  // Le vrai piège : une trame coupée en trois morceaux arbitraires. Un
  // décodeur qui suppose « un paquet = une trame » passe ici et casse en vol.
  const d = new Decodeur();
  const trame = trameClient(0x1, 'bonjour le pont');
  assert.equal(d.avaler(trame.subarray(0, 1)).length, 0);
  assert.equal(d.avaler(trame.subarray(1, 5)).length, 0);
  const out = d.avaler(trame.subarray(5));
  assert.equal(out.length, 1);
  assert.equal(out[0].data.toString(), 'bonjour le pont');
});

test('decodeur — trois trames dans un seul paquet', () => {
  const d = new Decodeur();
  const paquet = Buffer.concat([trameClient(0x1, 'un'), trameClient(0x1, 'deux'), trameClient(0x1, 'trois')]);
  const out = d.avaler(paquet);
  assert.deepEqual(out.map((m) => m.data.toString()), ['un', 'deux', 'trois']);
});

test('decodeur — un message fragmente se recolle', () => {
  const d = new Decodeur();
  const out = [
    ...d.avaler(trameClient(0x1, 'Ve', { fin: false })),
    ...d.avaler(trameClient(0x0, 'ga', { fin: true })),
  ];
  assert.equal(out.length, 1);
  assert.equal(out[0].data.toString(), 'Vega');
  assert.equal(out[0].op, 0x1);
});

test('decodeur — une trame de controle passe AU MILIEU d’un message fragmente', () => {
  // C'est permis par la RFC, et un décodeur naïf recolle le ping dans le
  // message : la visée arriverait corrompue sans que rien ne le signale.
  const d = new Decodeur();
  const out = [
    ...d.avaler(trameClient(0x1, 'Ve', { fin: false })),
    ...d.avaler(trameClient(0x9, '')),
    ...d.avaler(trameClient(0x0, 'ga', { fin: true })),
  ];
  assert.deepEqual(out.map((m) => m.op), [0x9, 0x1]);
  assert.equal(out[1].data.toString(), 'Vega');
});

test('decodeur — une trame non masquee est refusee', () => {
  // Un client DOIT masquer. Une trame nue vient d'autre chose qu'un client
  // WebSocket : on ferme plutôt que d'interpréter.
  const d = new Decodeur();
  const nue = Buffer.from([0x81, 0x02, 0x6f, 0x6b]);
  assert.throws(() => d.avaler(nue), /non masquee/);
});

test('decodeur — une trame qui annonce deux gigaoctets est refusee', () => {
  const d = new Decodeur();
  const enorme = Buffer.alloc(10);
  enorme[0] = 0x81;
  enorme[1] = 0x80 | 127;
  enorme.writeUInt32BE(0, 2);
  enorme.writeUInt32BE(0x7fffffff, 6);
  assert.throws(() => d.avaler(enorme), /trop longue/);
});

// ---------------------------------------------------------------------------
// Le pont, avec un vrai client au bout.

test('pont — le client natif de Node accepte la poignee de main', { skip: !CLIENT_NATIF }, async () => {
  const pont = new Pont();
  await pont.demarrer(portLibre());
  assert.ok(pont.etat().ecoute, `le pont n'ecoute pas : ${pont.etat().error}`);
  try {
    const { ws, recus } = await ouvrir(pont);
    assert.ok(await jusqua(() => recus.length >= 1), 'pas de bienvenue');
    assert.equal(recus[0].type, 'bienvenue');
    assert.equal(pont.etat().clients, 1);
    ws.close();
    assert.ok(await jusqua(() => pont.etat().clients === 0), 'client toujours compte apres fermeture');
  } finally {
    pont.arreter();
  }
});

test('pont — des visees montent, le carnet redescend', { skip: !CLIENT_NATIF }, async () => {
  const pont = new Pont();
  await pont.demarrer(portLibre());
  const recues = [];
  // Le pont n'annonce rien de lui-même : c'est celui qui RANGE qui dit ce qu'il
  // détient, une fois la visée écrite. Ici, le rangement est ce tableau.
  pont.on('visee', (v) => { recues.push(v); pont.annoncerCarnet(recues.map((x) => x.id)); });
  try {
    const { ws, recus } = await ouvrir(pont);
    const visee = {
      id: '2026-01-15T19:30:00.000Z-a1b2',
      body: 'Vega', utc: '2026-01-15T19:30:00.000Z', hs: 43.21, seconds: 62,
      flight: { altitudeFt: 9000, groundSpeedKt: 150, trackDeg: 285 },
      truth: { lat: 34.5, lon: -122.0 },
    };
    // La forme du panneau d'aujourd'hui : la file entière, d'un coup.
    ws.send(JSON.stringify({ type: 'visees', visees: [visee] }));

    assert.ok(await jusqua(() => recues.length === 1), 'la visee n’est pas arrivee');
    assert.equal(recues[0].body, 'Vega');
    assert.equal(recues[0].hs, 43.21);
    // Le carnet doit nommer la visée : c'est lui qui autorise le panneau à
    // l'oublier, et un carnet sans identifiants n'autorise rien.
    const carnet = recus.find((m) => m.type === 'carnet');
    assert.ok(carnet, 'pas d’annonce de carnet');
    assert.deepEqual(carnet.ids, [visee.id]);
    ws.close();
  } finally {
    pont.arreter();
  }
});

test('pont — un sextant d’HIER depose encore ses visees', { skip: !CLIENT_NATIF }, async () => {
  // Le panneau se distribue à part de l'application : un joueur peut très bien
  // avoir mis à jour l'une sans l'autre. La forme d'avant — une visée à la
  // fois — reste donc acceptée, et elle vaut la peine d'être éprouvée : c'est
  // exactement le genre de compatibilité qu'on croit tenir et qui casse.
  const pont = new Pont();
  await pont.demarrer(portLibre());
  const recues = [];
  pont.on('visee', (v) => { recues.push(v); pont.annoncerCarnet(recues.map((x) => x.id)); });
  try {
    const { ws, recus } = await ouvrir(pont);
    const visee = {
      id: 'ancien-1', body: 'Altair', utc: '2026-01-15T19:30:00.000Z', hs: 12.5, seconds: 45,
    };
    ws.send(JSON.stringify({ type: 'visee', visee }));

    assert.ok(await jusqua(() => recues.length === 1), 'la visee d’un ancien panneau est ignoree');
    assert.equal(recues[0].id, 'ancien-1');
    assert.ok(await jusqua(() => recus.some((m) => m.type === 'carnet')), 'pas de carnet en retour');
    ws.close();
  } finally {
    pont.arreter();
  }
});

test('pont — la consigne descend, et attend le panneau qui arrive apres', { skip: !CLIENT_NATIF }, async () => {
  const pont = new Pont();
  await pont.demarrer(portLibre());
  try {
    // Le navigateur choisit AVANT que le panneau soit ouvert : c'est le cas
    // courant, on prépare le crépuscule puis on met le sextant en place.
    pont.envoyerConsigne({ body: 'Altair', hc: 41.2, zn: 205, gisement: 280 });

    const { ws, recus } = await ouvrir(pont);
    assert.ok(await jusqua(() => recus.some((m) => m.type === 'consigne')), 'consigne non rejouee');
    const c = recus.find((m) => m.type === 'consigne');
    assert.equal(c.body, 'Altair');
    assert.equal(c.gisement, 280);

    // Puis un changement d'astre en cours de route.
    pont.envoyerConsigne({ body: 'Vega', hc: 52.3, zn: 118, gisement: 193 });
    assert.ok(await jusqua(() => recus.filter((m) => m.type === 'consigne').length === 2), 'consigne non diffusee');
    assert.equal(recus.filter((m) => m.type === 'consigne')[1].body, 'Vega');
    ws.close();
  } finally {
    pont.arreter();
  }
});

test('pont — deux clients recoivent la meme consigne', { skip: !CLIENT_NATIF }, async () => {
  // Le panneau tourne dans le navigateur ET dans le simulateur pendant la mise
  // au point : un pont qui n'admet qu'un client ne se met pas au point.
  const pont = new Pont();
  await pont.demarrer(portLibre());
  try {
    const a = await ouvrir(pont);
    const b = await ouvrir(pont);
    assert.ok(await jusqua(() => pont.etat().clients === 2));
    pont.envoyerConsigne({ body: 'Sirius' });
    assert.ok(await jusqua(() => a.recus.some((m) => m.type === 'consigne')
      && b.recus.some((m) => m.type === 'consigne')), 'consigne non recue par les deux');
    a.ws.close();
    b.ws.close();
  } finally {
    pont.arreter();
  }
});

test('pont — un message illisible ne fait pas tomber la connexion', { skip: !CLIENT_NATIF }, async () => {
  const pont = new Pont();
  await pont.demarrer(portLibre());
  try {
    const { ws, recus } = await ouvrir(pont);
    ws.send('ceci n’est pas du JSON {{{');
    ws.send(JSON.stringify({ type: 'inconnu' }));
    // La connexion doit survivre, et la suite passer normalement.
    pont.envoyerConsigne({ body: 'Deneb' });
    assert.ok(await jusqua(() => recus.some((m) => m.type === 'consigne')), 'le pont est tombe');
    assert.equal(pont.etat().clients, 1);
    ws.close();
  } finally {
    pont.arreter();
  }
});

test('pont — un port deja pris se dit, il ne fait pas tomber l’application', async () => {
  const port = portLibre();
  const premier = new Pont();
  await premier.demarrer(port);
  const second = new Pont();
  const etat = await second.demarrer(port);
  try {
    assert.equal(etat.ecoute, false);
    assert.match(etat.error, /deja pris/);
  } finally {
    premier.arreter();
    second.arreter();
  }
});

test('pont — il n’ecoute que la boucle locale', async () => {
  // La position REELLE de l'appareil transite par ce port. Ouvert au réseau,
  // n'importe quelle machine du lieu la lirait, ou pousserait de fausses visées
  // dans le carnet.
  const pont = new Pont();
  await pont.demarrer(portLibre());
  try {
    assert.equal(pont.serveur.address().address, '127.0.0.1');
  } finally {
    pont.arreter();
  }
});
