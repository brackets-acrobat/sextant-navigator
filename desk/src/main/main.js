/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// main.js — process principal Electron.
//
// Ce fichier ne fait que trois choses : ouvrir les fenêtres, relayer le flux
// SimConnect vers le renderer, et câbler les canaux IPC. Tout le métier vit
// dans les modules voisins — un par fonctionnalité :
//
//   config.js       réglages et dossier de travail
//   simconnect.js   connexion au simulateur, lecture des SimVars
//   msfs-import.js  import des aéroports et navaids depuis MSFS 2024
//   airports-data.js  lecture des bases extraites, requêtes par bbox
//   addons-scan.js  quels terrains de la base viennent d'un paquet add-on
//   elevation.js    relief GLOBE et profil vertical
//   declinaison.js  déclinaison magnétique (WMM)
//   astres.js       catalogue d'astres et qualité du point (noyau d'éphémérides)
//   pont.js         serveur WebSocket local : consigne au sextant, visées en retour
//   visees.js       carnet des visées reçues, sur le disque
//   estime.js       où l'on CROIT être — cap, badin, vent PRÉVU, et le plot air
//   reduction.js    du carnet au point observé, et le débriefing
//   etalonnage.js   ce que vaut son exemplaire : une série depuis un point connu
//   noyau.js        le chargeur du noyau d'éphémérides (frontière ESM/CJS)
//   plan-io.js      sauvegarde et ouverture d'un plan de vol
//   updater.js      mise à jour automatique
//
// Si un handler ci-dessous dépasse trois lignes, c'est qu'il appartient à un
// module.
// ============================================================

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const { chargerConfig, dossierBase } = require('./config');
const { SimConnectClient } = require('./simconnect');
const msfsImport = require('./msfs-import');
const airportsData = require('./airports-data');
const addonsScan = require('./addons-scan');
const elevation = require('./elevation');
const declinaison = require('./declinaison');
const astres = require('./astres');
const { Pont } = require('./pont');
const { Estime } = require('./estime');
const reduction = require('./reduction');
const etalonnage = require('./etalonnage');
const noyau = require('./noyau');
const visees = require('./visees');
const planIo = require('./plan-io');
const { setupAutoUpdater, quitAndInstall } = require('./updater');

const TITRE = 'Sextant Navigator';
const FOND = '#12151a';
const SPLASH_MS = 4000;

// Port du pont avec le panneau. Réglable par `pontPort` dans la configuration :
// un port en dur finit toujours par tomber sur autre chose, et le panneau doit
// pouvoir suivre (voir PONT_PORT dans app/pont.js, côté panneau).
const PONT_PORT_DEFAUT = 8787;

// Centralise les données d'Electron (cache, localStorage, session…) dans un
// sous-dossier du dossier de travail au lieu d'AppData → tout au même endroit
// que data/ et settings.json. À faire AVANT que l'app soit « ready ».
try {
  const userData = path.join(dossierBase(), 'app-data');
  fs.mkdirSync(userData, { recursive: true });
  app.setPath('userData', userData);
} catch (_) { /* repli silencieux sur l'emplacement par défaut */ }

// Une seule instance à la fois. Deux fenêtres partageraient le même dossier de
// travail : elles se disputeraient le cache de Chromium (« Unable to move the
// cache »), et surtout elles écriraient toutes les deux dans settings.json — la
// dernière à fermer écraserait les réglages de l'autre.
//
// Demandé APRÈS setPath('userData') : le verrou d'Electron est justement posé
// sur ce dossier, il doit donc être connu avant.
const instanceUnique = app.requestSingleInstanceLock();
if (!instanceUnique) app.quit();

let fenetre = null;
const config = chargerConfig();
const sim = new SimConnectClient();
const pont = new Pont();
const estime = new Estime();

// Un second lancement ne fait rien de neuf : il ramène la fenêtre existante au
// premier plan, ce que l'utilisateur cherchait probablement en double-cliquant.
app.on('second-instance', () => {
  if (!fenetre || fenetre.isDestroyed()) return;
  if (fenetre.isMinimized()) fenetre.restore();
  fenetre.show();
  fenetre.focus();
});

function diffuser(canal, charge) {
  BrowserWindow.getAllWindows().forEach((w) => {
    try { w.webContents.send(canal, charge); } catch (_) {}
  });
}

// Envoie la progression à la fenêtre qui a lancé l'opération (et pas aux
// autres) : c'est elle qui affiche la barre.
function versEmetteur(event, canal) {
  const wc = event.sender;
  return (p) => { if (wc && !wc.isDestroyed()) wc.send(canal, p); };
}

// --- Relais SimConnect -------------------------------------------------------
// 'scan' est déjà limité à ~2 Hz par simconnect.js : suffisant pour l'affichage
// de la position, et l'IPC ne se noie pas. 'frame' (chaque image) n'est pas
// relayé — personne ne le consomme tant que la validation du toucher n'est pas
// au programme.
sim.on('status', (s) => diffuser('sc-status', s));
sim.on('scan', (trame) => {
  diffuser('sc-scan', trame);

  // L'ESTIME NE REÇOIT PAS LA TRAME. Elle reçoit quatre nombres, extraits ici
  // un par un, et ce geste est le garde-fou : `trame.groundSpeedKt` et
  // `trame.trackTrue` sont juste là, ils contiennent le vent VRAI, et les
  // brancher ferait une estime qui ne dérive plus. Rien ne se casserait — les
  // points deviendraient simplement excellents. Voir estime.js.
  //
  // La position ne passe QU'AU SOL : on sait où est le terrain d'où l'on
  // décolle, et ce canal se referme dès que les roues quittent le sol.
  // L'HEURE EST CELLE DU SIMULATEUR, pas celle du PC : le carnet de visées
  // porte l'heure zulu simulée, et c'est avec elle qu'on interroge l'estime.
  // Voir l'en-tête d'estime.js — le mélange des deux horloges faisait travailler
  // le transport des droites avec la route du début du vol.
  estime.avancer({
    t: trame.t,
    tSim: trame.simUtc ? Date.parse(trame.simUtc) : undefined,
    headingTrue: trame.headingTrue,
    tasKt: trame.tasKt,
    onGround: trame.onGround,
    latSol: trame.onGround ? trame.lat : undefined,
    lonSol: trame.onGround ? trame.lon : undefined,
  });
  diffuser('estime-etat', estime.etat());
});
// Le hangar virtuel et le carnet de vol de Sextant Navigator sont retirés : ils
// profilaient les appareils et tenaient les vols, ce qui n'a rien à voir avec
// un point astronomique. Avec eux tombent le second groupe SimConnect, qui
// n'existait que pour eux, et l'événement 'frame' qu'ils étaient seuls à
// écouter.

// --- Relais du pont ----------------------------------------------------------
// L'état part vers l'interface (bandeau « sextant connecté »), et chaque visée
// est rangée AVANT d'être annoncée : ce qui s'affiche est alors ce qui est
// écrit, jamais l'inverse. Le renvoi d'une visée déjà connue est silencieux —
// c'est le fonctionnement normal du protocole, pas un événement.
pont.on('etat', (e) => diffuser('pont-etat', e));

// LE CARNET EST LA SEULE RÉPONSE DU PONT, et il ne dit qu'une chose : voici ce
// qui est ÉCRIT. Le panneau vide sa file de ce qui y figure, et garde le reste.
//
// Il est réannoncé après chaque rangement, à chaque branchement d'un sextant,
// et chaque fois que le carnet change de contenu — car un carnet vidé à la
// main est un carnet dont le sextant doit pouvoir reproposer les visées.
//
// Le renvoi en boucle d'une visée qu'on n'arrive pas à écrire est voulu : tant
// que le disque refuse, elle reste chez celui des deux qui l'a encore. Et une
// visée illisible n'entrera jamais au carnet, donc le sextant la reproposera
// sans fin — c'est sans conséquence, c'est quelques octets toutes les cinq
// secondes, et cela ne vient que d'un bug ou d'un client qui n'est pas le nôtre.
function annoncerCarnet() { pont.annoncerCarnet(visees.ids()); }

// Le sextant réclame le carnet en se branchant, puis au pas de son battement.
// Cette réponse est aussi ce qui lui prouve que la table est vivante : sans
// elle, il annoncerait une panne dès que sa file est vide — le cas normal.
pont.on('demande-carnet', annoncerCarnet);
pont.on('visee', (v) => {
  const res = visees.ajouter(v);
  annoncerCarnet();
  if (!res.ok || !res.nouvelle) return;
  diffuser('pont-visee', { visee: res.visee, ecrit: res.ecrit });
});

// --- Fenêtres ----------------------------------------------------------------

// Icône des fenêtres. Une fois l'application empaquetée, c'est build/icon.ico
// qui habille l'exe — mais ce dossier est le buildResources d'electron-builder,
// donc il n'est pas embarqué et rien ne peut le lire à l'exécution. On pointe
// donc la source, qui, elle, est livrée avec src/. Sans ça, la fenêtre porte
// l'icône d'Electron en développement.
const ICONE = path.join(__dirname, '..', 'img', 'icone-app.png');

// Splash : fenêtre sans cadre à la taille de l'image, affichée pendant que la
// fenêtre principale se charge en arrière-plan. La version est injectée par
// executeJavaScript (pas de script inline : la CSP est stricte).
function creerSplash() {
  const splash = new BrowserWindow({
    // Taille exacte de src/img/splash_sextant.png : le splash est en
    // object-fit: cover, donc toute fenêtre d'un autre RAPPORT rognerait
    // l'image — et ici il y a du texte incrusté contre les quatre bords.
    // L'image a change de format en meme temps que de sujet (800×533 au lieu
    // de 798×435) : ces deux nombres se changent ENSEMBLE, jamais l'un seul.
    width: 800,
    height: 533,
    frame: false,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    backgroundColor: FOND,
    title: TITRE,
    icon: ICONE,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  splash.removeMenu();
  splash.loadFile(path.join(__dirname, '..', 'renderer', 'splash.html'));
  splash.webContents.on('did-finish-load', () => {
    const v = JSON.stringify('v' + app.getVersion());
    splash.webContents.executeJavaScript(
      `document.getElementById('splash-version').textContent = ${v};`
    ).catch(() => {});
  });
  return splash;
}

function creerFenetre() {
  fenetre = new BrowserWindow({
    width: 1100,
    height: 720,
    backgroundColor: FOND,
    title: TITRE,
    icon: ICONE,
    show: false,   // révélée à la fin du splash (voir whenReady)
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  fenetre.removeMenu();
  fenetre.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Liens externes : navigateur par défaut, jamais une fenêtre Electron.
  fenetre.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // removeMenu() supprime Ctrl+R / F12 → on les rebranche à la main.
  fenetre.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const touche = (input.key || '').toLowerCase();
    if ((input.control && touche === 'r') || touche === 'f5') {
      fenetre.webContents.reload();
      event.preventDefault();
    }
    if ((input.control && input.shift && touche === 'i') || touche === 'f12') {
      fenetre.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
}

// --- IPC ---------------------------------------------------------------------

ipcMain.handle('app-config', async () => ({
  source: config._source,
  version: app.getVersion(),
}));

// Simulateur
ipcMain.handle('sc-connect', async () => sim.connecter());
ipcMain.handle('sc-disconnect', async () => { await sim.deconnecter(); return { ok: true }; });

// Import MSFS 2024
ipcMain.handle('msfs-verifier-lancement', async () => msfsImport.verifierLancement());
ipcMain.handle('extraire-aeroports-msfs', async (e, options) =>
  msfsImport.extraireAeroports(options || {}, versEmetteur(e, 'msfs-extract-progress')));
ipcMain.handle('extraire-navaids-msfs', async (e) =>
  msfsImport.extraireNavaids(versEmetteur(e, 'msfs-navaids-progress')));

// Terrains add-on : analyse d'une racine de paquets (lecture disque, sans le sim)
ipcMain.handle('addons-etat', async () => addonsScan.etat());
ipcMain.handle('addons-choisir-dossier', async () => addonsScan.choisirDossier(fenetre));
ipcMain.handle('addons-scanner', async (_e, { racine } = {}) => {
  const res = addonsScan.scanner({ racine, aeroports: airportsData.chargerAeroports() });
  if (res.ok) airportsData.rechargerAddons();   // le marquage prend effet au prochain rafraîchissement
  return res;
});

// Relief
ipcMain.handle('elevation-existe', async () => elevation.tuilesPresentes());
ipcMain.handle('importer-elevation', async (e) =>
  elevation.importer(versEmetteur(e, 'elevation-progress')));
ipcMain.handle('profil-vertical', async (_e, charge) => elevation.profil(charge));

// Données carte
// Les aéroports sortent tels quels. Ils portaient jusqu'ici un code BASULM
// ajouté au passage, pour l'entrée « fiche ULM » du menu contextuel — parti
// avec les documents de terrain le 2026-08-25.
ipcMain.handle('aeroports-bbox', async (_e, bbox) => airportsData.aeroportsDansBbox(bbox));
ipcMain.handle('navaids-bbox', async (_e, bbox) => airportsData.navaidsDansBbox(bbox));
ipcMain.handle('aeroport-par-code', async (_e, code) => airportsData.aeroportParCode(code));
// Recherche par code OACI ou par nom, restreinte à la France (cf. airports-data).
ipcMain.handle('rechercher-lieux', async (_e, requete) => airportsData.rechercherLieux(requete));
// Aimantation d'un point tournant sur l'aéroport ou le navaid le plus proche
// des bases extraites de MSFS 2024.
ipcMain.handle('feature-proche', async (_e, { lat, lon, rayonNm } = {}) =>
  airportsData.featureProche(lat, lon, rayonNm));

// Astres — catalogue du ciel exploitable, et qualité géométrique d'une sélection
ipcMain.handle('astres-catalogue', async (_e, charge) => astres.catalogue(charge || {}));
ipcMain.handle('astres-qualite', async (_e, charge) => astres.qualite(charge || {}));

// Estime — où l'on CROIT être. Le vent vient du navigateur, jamais du sim.
ipcMain.handle('estime-etat', async () => estime.etat());
ipcMain.handle('estime-vent', async (_e, charge) => estime.setVent(charge || {}));
ipcMain.handle('estime-caler', async (_e, charge) => estime.caler(charge || {}));
ipcMain.handle('estime-oublier', async () => estime.oublier());
// LE VENT CALCULÉ. Ce n'est pas le vent du simulateur — celui-là est sous
// scellés et le restera. C'est celui que le navigateur DÉDUIT de son point : la
// position air comparée au point observé, divisée par le temps écoulé. Il n'est
// pas donné, il est trouvé, et c'était l'autre métier du poste.
ipcMain.handle('estime-vent-calcule', async (_e, charge) => estime.ventCalcule(charge || {}));

// Réduction du carnet, point observé, et débriefing
ipcMain.handle('reduire', async (_e, charge) => {
  const c = charge || {};
  const liste = visees.liste().visees.filter((v) => !c.ids || c.ids.includes(v.id));
  const e = estime.etat();
  const assumed = c.assumed || (e.calee ? { lat: e.lat, lon: e.lon } : null);
  // Route et vitesse CRUES au moment de chaque visée : c'est l'estime qui les
  // fournit, jamais le carnet — voir reduction.js et visees.js.
  const crues = liste.map((v) => estime.cruesA(new Date(v.utc).getTime()));
  return reduction.reduire({ visees: liste, assumed, indexError: c.indexError || 0, crues });
});

// Le débriefing ouvre les scellés. Il ne s'appelle qu'APRÈS un point rendu :
// la vérité ne sort d'ici que pour dire ce que le travail valait.
ipcMain.handle('debriefer', async (_e, charge) => {
  const c = charge || {};
  const avec = visees.listeAvecVerite().filter((v) => v.truth && (!c.ids || c.ids.includes(v.id)));
  if (!avec.length) return { ok: false, error: 'sans-verite' };
  // La vérité à l'instant commun, c'est-à-dire celle de la dernière visée.
  avec.sort((a, b) => new Date(a.utc) - new Date(b.utc));
  return reduction.debriefer({ point: c.point, estime: c.estime, verite: avec[avec.length - 1].truth });
});

// Étalonnage — la seule procédure qui ait le droit de savoir où l'on est.
//
// La position connue vient de l'estime QUAND ELLE EST AU SOL : là, et là
// seulement, elle vaut la position vraie, parce qu'on sait de quel terrain on
// décolle. C'est le même canal légitime que le calage au sol, et il se referme
// au décollage — d'où le `auSol` passé au module, qui refuse en vol.
ipcMain.handle('etalonnage-etat', async () => etalonnage.lire());
ipcMain.handle('etalonnage-demarrer', async (_e, charge) => {
  const c = charge || {};
  const e = estime.etat();
  const auSol = e.calee ? e.auSol : null;
  if (c.origine === 'sol') {
    if (!e.calee || !e.auSol) return { ok: false, error: 'pas-au-sol' };
    return etalonnage.demarrer({ lat: e.lat, lon: e.lon, origine: 'sol', auSol });
  }
  return etalonnage.demarrer({ lat: c.lat, lon: c.lon, origine: 'manuelle', auSol });
});
ipcMain.handle('etalonnage-arreter', async () => etalonnage.arreter());
ipcMain.handle('etalonnage-basculer', async (_e, id) => etalonnage.basculer(id));
ipcMain.handle('etalonnage-mesurer', async () => etalonnage.mesurer({ visees: visees.liste().visees }));
ipcMain.handle('etalonnage-adopter', async (_e, charge) => etalonnage.adopter(charge || {}));
ipcMain.handle('etalonnage-oublier', async () => etalonnage.oublier());

// Pont avec le sextant, et carnet des visées reçues
ipcMain.handle('pont-etat', async () => pont.etat());
ipcMain.handle('pont-consigne', async (_e, charge) => pont.envoyerConsigne(charge || { body: null }));
ipcMain.handle('visees-liste', async () => visees.liste());
// Réannoncé après ces deux-là pour que les deux moitiés ne divergent jamais.
// Une visée déjà confirmée a quitté la file du sextant : la supprimer ici la
// supprime pour de bon. Un sextant qui était HORS LIGNE au moment de la
// suppression, lui, la tient encore et la reproposera en se rebranchant — elle
// rentrera donc au carnet. C'est le prix de « rien ne se perd », et c'est le
// bon sens de l'échange.
ipcMain.handle('visees-supprimer', async (_e, id) => {
  const res = visees.supprimer(id);
  annoncerCarnet();
  return res;
});
ipcMain.handle('visees-vider', async () => {
  const res = visees.vider();
  annoncerCarnet();
  return res;
});

// Navigation
ipcMain.handle('declinaison', async (_e, { lat, lon } = {}) => declinaison.en(lat, lon));
ipcMain.handle('sauver-plan', async (_e, charge) => planIo.sauver(fenetre, charge));
ipcMain.handle('ouvrir-plan', async (_e, charge) => planIo.ouvrir(fenetre, charge));

// Mise à jour
ipcMain.handle('update-install', async () => { quitAndInstall(); return { ok: true }; });

// --- Cycle de vie ------------------------------------------------------------

app.whenReady().then(() => {
  // Instance surnuméraire : app.quit() est déjà demandé, on ne crée rien.
  if (!instanceUnique) return;

  const splash = creerSplash();
  creerFenetre();   // fenêtre principale masquée, chargée pendant le splash
  setTimeout(() => {
    if (splash && !splash.isDestroyed()) splash.close();
    if (fenetre && !fenetre.isDestroyed()) { fenetre.maximize(); fenetre.show(); fenetre.focus(); }
  }, SPLASH_MS);

  // Le pont s'ouvre avec l'application et reste ouvert : le panneau peut être
  // lancé avant, après, ou plusieurs fois, il se rebranche tout seul. Un port
  // occupé n'empêche rien — l'état part à l'interface, qui le dira.
  pont.demarrer(Number(config.pontPort) || PONT_PORT_DEFAUT);

  // Le noyau est chargé dès le démarrage, sans attendre qu'on ouvre le
  // catalogue : l'estime en a besoin à la PREMIÈRE trame, et une estime qui
  // reste immobile le temps d'un import dynamique aurait déjà pris du retard.
  noyau.charger().catch(() => { /* l'interface le dira quand on s'en servira */ });

  // Auto-update seulement en app packagée : en dev, electron-updater n'a pas de
  // dev-app-update.yml et lèverait une erreur inutile.
  if (app.isPackaged) setupAutoUpdater(diffuser, fenetre);
});

app.on('window-all-closed', () => {
  pont.arreter();
  sim.deconnecter().finally(() => {
    if (process.platform !== 'darwin') app.quit();
  });
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    creerFenetre();                 // recréée masquée (show:false)…
    fenetre.once('ready-to-show', () => { fenetre.maximize(); fenetre.show(); });   // …puis révélée
  }
});
