/**
 * L'instrument.
 *
 * Deux chaines de calcul, et il ne faut jamais les melanger :
 *
 * Il ne fait plus qu'une chose, et c'est voulu : il PRESENTE l'instrument.
 *
 * `simulateSight()` part de la position REELLE que le simulateur connait et
 * rend ce que le tambour doit afficher — le joueur ne le voit jamais. L'autre
 * chaine, celle du navigateur (`sight()`, l'intercept, le point, le carnet),
 * est partie a la table du navigateur : l'application Electron.
 *
 * Le panneau ne dit jamais ou l'on est. Tout l'interet du jeu tient a cette
 * separation, et la coupure la rend structurelle au lieu de disciplinaire.
 */

import { simulateSight, visibleBodies, formatAngle } from './core/index.js';
import { Sim } from './sim.js';
import { Viewport, FIELD_SEARCH, MAGNIFICATIONS, FILTERS } from './viewport.js';
import { Drum } from './drum.js';
import { BoutonVisee, Selecteur } from './controls.js';
import { Pont } from './pont.js';
import { ouSinon } from './compat.js';

const SHOT_MAX_S = 120;
const SHOT_MIN_S = 30;

const sim = new Sim();
const $ = (id) => document.getElementById(id);

/**
 * Le panneau EST l'instrument, et rien d'autre.
 *
 * Le choix de l'astre, l'etalonnage, l'estime, le carnet, le point et le
 * debriefing sont partis a la table du navigateur — l'application Electron.
 * C'est la division historique : le sextant sous l'astrodome, la planchette a
 * la station de nav.
 *
 * Ce qui reste ici se compte : une horloge, un champ, deux compteurs, cinq
 * molettes, une roue de filtres, un selecteur de grossissement, un poussoir.
 */
const ui = {
  canvas: $('field'),
  drumKnob: $('drumKnob'),
  fineKnob: $('fineKnob'),
  bearingKnob: $('bearingKnob'),
  bearingFine: $('bearingFine'),
  bubbleKnob: $('bubbleKnob'),
  magButton: $('magButton'),
  filterWheel: $('filterWheel'),
  filterRead: $('filterRead'),
  drumRead: $('drumRead'),
  bearingRead: $('bearingRead'),
  bearingRel: $('bearingRel'),
  shoot: $('shoot'),
  shotTime: $('shotTime'),
  shotState: $('shotState'),
  clock: $('clock'),
  link: $('link'),
  consigneVal: $('consigneVal'),
};

const viewport = new Viewport(ui.canvas);

const state = {
  bodyName: null,
  /**
   * La consigne recue de la table : l'astre a viser, et les indications du
   * navigateur pour le trouver. `null` tant que personne n'a rien demande.
   */
  consigne: null,
  /** Le pont a-t-il deja parle une fois depuis le demarrage du panneau ? */
  tableVue: false,
  /** Le menage de la file a-t-il deja ete annonce ? Une fois suffit. */
  rebutsDits: false,
  /** Position du tambour, en degres — c'est la seule chose que le joueur regle. */
  drumDeg: 45,
  /*
   * Couronne d'azimut, en azimut VRAI — et non plus en gisement relatif.
   *
   * En gisement relatif, la couronne etait solidaire de l'appareil : le
   * moindre lacet balayait l'astre en travers du champ, et a x5 le champ ne
   * fait que 3°. Suivre un astre demandait de rattraper la couronne a la
   * souris a chaque degre de lacet, ce qui est intenable.
   *
   * Cale en azimut vrai, l'instrument garde sa ligne de visee pendant que
   * l'appareil laceye sous lui — c'est ce que fait le navigateur qui suit son
   * astre dans l'astrodome, et c'est deja le repere de l'echelle gravee en bas
   * du champ, qui montrait `Zn = cap + gisement`. Elle montre maintenant la
   * couronne elle-meme.
   */
  bearingDeg: 0,
  filter: 0,
  /** Grossissement de l'oculaire : 1 pour chercher, 5 pour collimater. */
  magnification: 1,
  bubbleSizeDeg: 0.8,
  /**
   * L'erreur d'index REELLE de l'exemplaire, en minutes d'arc. Le joueur ne la
   * voit jamais : c'est ce que l'etalonnage sert a decouvrir. Elle est tiree
   * une fois puis conservee — un sextant donne a une erreur donnee, on la
   * mesure une bonne fois et elle ne bouge plus.
   */
  instrumentError: null,
  bubble: { x: 0, y: 0, vx: 0, vy: 0 },
  shot: null,
  /** Les visees faites, en attendant que le pont les emporte a la table. */
  shots: [],
  /** Poussoir enfonce : c'est un etat d'affichage, pas de jeu. */
  shootPressed: false,
  lastFrame: performance.now(),
  bodiesRefreshedAt: 0,
};

// --- Persistance -----------------------------------------------------------

const STORE = 'sextant.v1';

/**
 * Ou vivent le carnet, l'etalonnage et l'erreur de l'exemplaire.
 *
 * Le `localStorage` d'un panneau MSFS **ne survit pas a la session** : verifie
 * en vol, une serie d'etalonnage de dix visees s'est perdue au redemarrage. Le
 * simulateur a sa propre API de stockage, mais elle n'existe que dans la page
 * hote — l'iframe la joint par messages, comme pour les SimVars.
 *
 * On ecrit donc AUX DEUX ENDROITS : le localStorage sert au navigateur de
 * developpement et de tampon dans la session ; l'hote sert a la persistance
 * reelle. Et on lit l'hote en premier au demarrage, quand il repond.
 */
function serialise() {
  return JSON.stringify({
    bubbleSizeDeg: state.bubbleSizeDeg,
    filter: state.filter,
    magnification: state.magnification,
    // L'erreur de l'exemplaire est la SEULE donnee de jeu que le panneau
    // conserve encore : elle appartient a l'instrument, pas au navigateur, et
    // elle doit survivre a tout. Le carnet et l'etalonnage vivront cote
    // application.
    instrumentError: state.instrumentError,
    // Les visees restent en memoire jusqu'a ce que le pont les emporte.
    shots: state.shots,
  });
}

/**
 * `save()` differe, pour les reglages qu'on modifie en tournant.
 *
 * Un tour de molette produit des dizaines d'evenements ; chacun n'a aucune
 * raison d'atteindre le disque. On garde le dernier etat et on l'ecrit une
 * demi-seconde apres que la main s'est arretee. Le reste — une visee rangee,
 * une file videe — continue d'appeler `save()` directement : ce sont des
 * evenements rares et il ne faut pas les perdre.
 */
let _saveTimer = null;
function saveBientot() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => { _saveTimer = null; save(); }, 500);
}

function save() {
  const brut = serialise();
  try {
    localStorage.setItem(STORE, brut);
  } catch (e) {
    /* le carnet n'est pas critique */
  }
  try {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: 'store-set', key: STORE, value: brut }, '*');
    }
  } catch (e) {
    /* pas d'hote : le localStorage suffira */
  }
}

/**
 * Demande a l'hote ce qu'il a garde. Rend `null` s'il n'y a pas d'hote, ou s'il
 * ne repond pas dans le delai — un navigateur ordinaire, typiquement.
 */
function lisStockageHote(delaiMs) {
  return new Promise((resolve) => {
    let fini = false;
    const ecoute = (ev) => {
      const d = ev.data;
      if (!d || d.type !== 'store-data' || d.key !== STORE) return;
      fini = true;
      window.removeEventListener('message', ecoute);
      resolve(d.value || null);
    };
    try {
      window.addEventListener('message', ecoute);
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'store-get', key: STORE }, '*');
      }
    } catch (e) {
      resolve(null);
      return;
    }
    setTimeout(() => {
      if (fini) return;
      window.removeEventListener('message', ecoute);
      resolve(null);
    }, delaiMs);
  });
}

function applique(d) {
  try {
    if (typeof d.bubbleSizeDeg === 'number') state.bubbleSizeDeg = d.bubbleSizeDeg;
    if (typeof d.filter === 'number') state.filter = d.filter;
    if (MAGNIFICATIONS.includes(d.magnification)) state.magnification = d.magnification;
    if (typeof d.instrumentError === 'number') state.instrumentError = d.instrumentError;
    if (Array.isArray(d.shots)) state.shots = d.shots;
    return true;
  } catch (e) {
    return false; /* carnet illisible : on repart a zero */
  }
}

/** Le localStorage, puis l'hote s'il a mieux. */
async function restore() {
  try {
    const brut = localStorage.getItem(STORE);
    if (brut) applique(JSON.parse(brut));
  } catch (e) {
    /* rien de local : ce n'est pas grave */
  }

  const distant = await lisStockageHote(1200);
  if (!distant) return;
  try {
    // L'hote fait foi : dans le simulateur, le localStorage repart vide a
    // chaque session, donc ce qu'il garde est toujours plus complet.
    applique(JSON.parse(distant));
  } catch (e) {
    /* donnee de l'hote illisible : on garde ce qu'on a */
  }
}

// --- Etalonnage ------------------------------------------------------------

/** Erreur d'index d'un exemplaire neuf : quelques minutes, dans un sens ou l'autre. */
function drawInstrumentError() {
  return Math.round((Math.random() * 12 - 6) * 10) / 10;
}

// --- Le pont ---------------------------------------------------------------

/**
 * Le lien avec la table du navigateur.
 *
 * Il n'est JAMAIS obligatoire : le sextant marche seul, les visees s'empilent,
 * et elles partiront a la premiere ouverture de l'application. Voir pont.js —
 * c'est lui qui tient la file et l'accuse de reception.
 */
const pont = new Pont({
  surConsigne: (c) => {
    state.consigne = c;
    // L'astre a viser vient desormais de la table. C'etait le sens de la
    // coupure : le panneau ne choisit plus, il execute.
    state.bodyName = c ? c.body : null;
    state.bodiesRefreshedAt = 0;   // magnitudes a recalculer pour le nouvel astre
    renderConsigne();
  },
  surEtat: (e) => {
    // `lien`, pas `connecte` : une socket ouverte sur une application morte
    // n'est pas une table vue. C'est ce qui autorise le panneau a cesser de
    // choisir l'astre tout seul — on ne cede la main qu'a quelqu'un qui repond.
    if (e.lien) state.tableVue = true;
    renderLien(e);
    direRebuts(e);
  },
  // Les visees que la table a confirme detenir quittent la file : le panneau
  // n'en garde plus trace, c'est elle qui les tient maintenant.
  surVidage: (file) => { state.shots = file; save(); },
});

/*
 * L'ETAT DU LIEN, ET POURQUOI IL EST REVENU.
 *
 * Il avait ete retire : « TABLE » en permanence n'apprenait rien, puisque la
 * presence de la table se lit dans l'application elle-meme. Le raisonnement
 * avait un trou, et il a coute une apres-midi entiere le 25 aout 2026 : quand
 * on est A L'OCULAIRE, l'application est DERRIERE le simulateur. On ne la voit
 * pas. Le seul endroit ou l'on peut apprendre que la table a disparu, c'est
 * ici — et le compteur de visees en attente ne le disait pas : « 3 PENDING »
 * voulait dire aussi bien « elle les etudie » que « il n'y a personne ».
 *
 * Deux choses distinctes s'affichent donc, et elles ne se confondent pas :
 *
 *   NO TABLE   la liaison est morte. Toujours visible, meme sans rien en file :
 *              c'est une nouvelle, et elle vaut avant de viser, pas apres.
 *   n PENDING  des visees faites que la table n'a pas encore confirmees.
 *
 * `lien` — et non `connecte` — parce qu'une socket ouverte ne prouve rien : une
 * application fermee laisse la sienne agoniser un moment, et c'est justement
 * pendant ce moment qu'on croit parler a quelqu'un.
 */
function renderLien(e) {
  if (!ui.link) return;

  if (!e.lien) {
    ui.link.hidden = false;
    ui.link.textContent = e.enAttente ? `NO TABLE · ${e.enAttente}` : 'NO TABLE';
    ui.link.className = 'src horsligne';
    ui.link.title = e.enAttente
      ? `The plotting table is not answering. ${e.enAttente} sight(s) are held here `
        + 'and will go out by themselves when it comes back — keep shooting.'
      : 'The plotting table is not answering. Sights taken now are held here until it does.';
    return;
  }

  if (!e.enAttente) {
    ui.link.hidden = true;
    return;
  }
  ui.link.hidden = false;
  ui.link.textContent = `${e.enAttente} PENDING`;
  ui.link.className = 'src pending';
  ui.link.title = `${e.enAttente} sight(s) offered to the plotting table, `
    + 'not yet confirmed as filed. They are re-offered every few seconds.';

}

/*
 * Les entrees ecartees se disent UNE FOIS, au demarrage.
 *
 * Elles ne se disent pas en boucle : ce n'est pas une panne en cours, c'est un
 * menage fait. Mais elles se disent, parce que le silence sur ce point a coute
 * une journee entiere — trois entrees illisibles bloquaient la file, et rien,
 * nulle part, ne pouvait l'apprendre au joueur.
 */
function direRebuts(e) {
  if (!ui.shotState || !e.rebuts || state.rebutsDits) return;
  state.rebutsDits = true;
  ui.shotState.textContent =
    `${e.rebuts} unusable queued entr${e.rebuts > 1 ? 'ies' : 'y'} discarded `
    + '— they were not sights and no plotting table could ever have filed them.';
}

function renderConsigne() {
  const c = state.consigne;
  if (!c) {
    ui.consigneVal.textContent = state.tableVue
      ? 'none — the plotting table gave no body'
      : 'none — plotting table not connected';
    ui.consigneVal.className = 'consigne-val vide';
    return;
  }
  // Ce que le navigateur a envoye, tel quel. On ne le rafraichit pas avec la
  // verite du simulateur : ce serait donner la reponse, et le travail de
  // l'observateur est justement de trouver l'astre a partir d'une indication
  // qui vieillit.
  const bouts = [String(c.body).toUpperCase()];
  if (typeof c.gisement === 'number') {
    bouts.push(`RB ${String(Math.round(c.gisement) % 360).padStart(3, '0')}°`);
  }
  if (typeof c.hc === 'number') bouts.push(`Hc ${c.hc.toFixed(0)}°`);
  ui.consigneVal.textContent = bouts.join('  ·  ');
  ui.consigneVal.className = 'consigne-val';
}

// --- Astres ----------------------------------------------------------------

function refreshBodies(s) {
  // La liste depend de l'heure et de la position : on ne la recalcule qu'une
  // fois par minute, c'est 58 etoiles a chaque passage.
  const list = visibleBodies({
    utc: s.utc,
    position: { lat: s.lat, lon: s.lon },
  });

  state.magnitudes = new Map();
  const entries = list.bodies.map((b) => {
    state.magnitudes.set(b.name, ouSinon(b.magnitude, 1));
    // On affiche le gisement relatif, pas l'azimut vrai : c'est ce qu'on
    // affiche sur la couronne pour trouver l'astre.
    const rel = ((b.zn - s.headingTrue) % 360 + 360) % 360;
    return {
      name: b.name,
      bearing: `Gt ${rel.toFixed(0).padStart(3, '0')}°`,
      height: `h ${b.hc.toFixed(0)}°`,
    };
  });

  // LE PONT EST POSE : `state.bodyName` vient de la table, plus d'ici.
  //
  // Cette fonction ne sert donc plus qu'a fournir les magnitudes au dessin du
  // champ. Le choix de l'astre appartient au navigateur, qui a le catalogue,
  // les angles de coupe et le precalcul — c'etait tout le sens de la coupure.
  //
  // UNE SEULE EXCEPTION, ET ELLE EST BORNEE : tant que la table ne s'est JAMAIS
  // manifestee depuis le demarrage du panneau, on retient un astre d'office.
  // Sans quoi le sextant lance seul — le cas de la mise au point, et celui du
  // joueur qui veut juste tripoter l'instrument — n'aurait rien a montrer dans
  // son champ. La plaque de consigne dit alors « table non connectee », donc
  // personne ne peut prendre cet astre pour une consigne. Des que la table
  // parle une fois, elle commande seule, y compris pour dire « aucun astre ».
  if (state.tableVue) return;
  if (!state.bodyName || !entries.some((e) => e.name === state.bodyName)) {
    state.bodyName = entries.length ? entries[0].name : null;
  }
}

// --- Bulle -----------------------------------------------------------------

/**
 * La bulle est un pendule tres amorti : elle suit l'acceleration mais avec du
 * retard, et elle depasse. C'est exactement l'erreur que l'integrateur de deux
 * minutes existe pour moyenner.
 */
/*
 * LA BULLE MARQUE LA VERTICALE APPARENTE, PAS L'ACCELERATION BRUTE.
 *
 * `ACCELERATION BODY X` n'est jamais nulle en croisiere : il reste toujours un
 * peu de derapage, et l'avion vole legerement en crabe. Ce biais est CONSTANT,
 * donc la bulle s'installait a cote du centre et n'en bougeait plus — c'est ce
 * qu'on voyait aux deux grossissements, et d'autant plus a x5 ou le champ ne
 * fait que 3°.
 *
 * Un vrai niveau a bulle ne fait pas ca : le liquide trouve son equilibre sur
 * la verticale apparente MOYENNE, et la bulle ne s'en ecarte que sur ce qui
 * change — turbulence, virage, ressource. C'est exactement une moyenne lente
 * retranchee de la mesure, avec une constante de temps de l'ordre de la demi-
 * minute : assez lent pour laisser passer les cahots, assez vif pour que le
 * niveau se soit recentre au bout d'un palier.
 */
const BUBBLE_SETTLE_S = 30;

function updateBubble(s, dt) {
  const b = state.bubble;
  const ax = ouSinon(s.accelX, 0);
  const bk = ouSinon(s.bank, 0);
  // Moyenne glissante des deux entrees : c'est le zero de l'instrument.
  const w = Math.min(1, dt / BUBBLE_SETTLE_S);
  b.zeroX = ouSinon(b.zeroX, ax) + (ax - ouSinon(b.zeroX, ax)) * w;
  b.zeroY = ouSinon(b.zeroY, bk) + (bk - ouSinon(b.zeroY, bk)) * w;

  const targetX = (ax - b.zeroX) * 0.09;
  const targetY = (bk - b.zeroY) * 0.012;
  const k = 9;
  const damping = 3.4;
  b.vx += (targetX - b.x) * k * dt - b.vx * damping * dt;
  b.vy += (targetY - b.y) * k * dt - b.vy * damping * dt;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
}

// --- Visee -----------------------------------------------------------------

function startShot(nowUtc) {
  const s = sim.read();
  state.shot = {
    startUtc: nowUtc.getTime(),
    seconds: 0,
    integral: 0,
    body: state.bodyName,
    // Les conditions de vol appartiennent a la visee, pas a l'instant ou on
    // la depouille : c'est avec elles que le simulateur a produit la lecture,
    // c'est avec elles qu'il faut la reduire. Sans quoi la correction de
    // Coriolis est introduite et jamais retiree.
    flight: {
      altitudeFt: s.altitudeFt,
      groundSpeedKt: s.groundSpeedKt,
      trackDeg: s.trackTrue,
    },
    // La position vraie au depart. Elle n'est JAMAIS montree pendant la
    // navigation : elle sert au debriefing, une fois le point rendu.
    truthStart: { lat: s.lat, lon: s.lon },
  };
  ui.shoot.textContent = 'STOP';
  ui.shoot.classList.add('running');
}

function stopShot() {
  const shot = state.shot;
  state.shot = null;
  ui.shoot.textContent = 'SHOOT';
  ui.shoot.classList.remove('running');
  if (!shot) return;

  if (shot.seconds < SHOT_MIN_S) {
    ui.shotState.textContent = `Sight of ${shot.seconds.toFixed(0)} s rejected — 30 s is the minimum.`;
    return;
  }

  const hs = shot.integral / shot.seconds;
  // L'integrateur rend une moyenne : son instant est le MILIEU de la visee,
  // pas son debut ni sa fin. C'est le cadran de mi-temps de l'instrument reel.
  const midUtc = new Date(shot.startUtc + (shot.seconds / 2) * 1000);

  // La verite a la MI-TEMPS : moyenne du depart et de l'arrivee. Sur une a deux
  // minutes de vol rectiligne, l'ecart a la vraie position mediane est de
  // quelques metres — sans commune mesure avec ce qu'on cherche a mesurer.
  const fin = sim.read();
  const depart = shot.truthStart;
  const record = {
    // L'identifiant est ce qui permet a la table de reconnaitre une visee
    // qu'elle a deja rangee. Le panneau renvoie tout a chaque reconnexion —
    // c'est ainsi qu'une visee prise application fermee n'est pas perdue — donc
    // la meme arrivera plusieurs fois, et il faut qu'elle soit reconnaissable.
    // L'instant de mi-temps y suffirait presque ; le suffixe aleatoire ecarte
    // le cas de deux panneaux ouverts a la fois.
    id: `${midUtc.toISOString()}-${Math.random().toString(36).slice(2, 6)}`,
    body: shot.body,
    utc: midUtc.toISOString(),
    hs,
    seconds: shot.seconds,
    flight: shot.flight,
    truth: depart
      ? { lat: (depart.lat + fin.lat) / 2, lon: (depart.lon + fin.lon) / 2 }
      : null,
  };

  // La visee part au pont, qui la garde jusqu'a ce que la table confirme la
  // detenir. C'est LUI qui tient la file desormais ; `state.shots` n'en est
  // plus que la copie persistee, pour qu'elle survive a la fermeture du panneau.
  pont.deposer(record);
  state.shots = pont.file;

  const etat = pont.etat();
  ui.shotState.textContent =
    `${shot.seconds.toFixed(0)} s sight — Hs ${formatAngle(hs)}, `
    + `mid-time ${midUtc.toISOString().slice(11, 19)} Z`
    // « offered », pas « sent » : elle est partie, la table ne l'a pas encore
    // dite rangee. La difference est tout le sujet de ce pont.
    + (etat.lien ? ' — offered to the table' : ' — held: no table');
  save();
}

/** Le bouton ne s'active qu'une fois la copie rendue. */

// --- Les deux commandes peintes --------------------------------------------

/**
 * Le selecteur de grossissement et le poussoir.
 *
 * Ils etaient en HTML et juraient a cote du champ et des tambours, qui sont
 * peints. Meme discipline que les molettes : on ne repeint que sur changement,
 * et jamais depuis un ecouteur d'entree — d'ou la cle comparee ci-dessous.
 */
const selMag = new Selecteur(ui.magButton);
const btVisee = new BoutonVisee(ui.shoot);
let cleMag = '';
let cleVisee = '';

function renderMagnification() {
  const i = Math.max(0, MAGNIFICATIONS.indexOf(state.magnification));
  const cle = String(i);
  if (cle === cleMag) return;
  cleMag = cle;
  selMag.draw({ options: MAGNIFICATIONS.map((m) => '×' + m), index: i });
}

function renderShoot() {
  const actif = !!state.shot;
  const cle = (state.shootPressed ? 'E' : '-') + (actif ? 'A' : '-');
  if (cle === cleVisee) return;
  cleVisee = cle;
  btVisee.draw({ label: actif ? 'STOP' : 'SHOOT', pressed: state.shootPressed, actif });
}

function remeasureControls() {
  selMag.measure();
  btVisee.measure();
  cleMag = '';
  cleVisee = '';
  renderMagnification();
  renderShoot();
}

// --- Boucle ----------------------------------------------------------------

/**
 * Cadence de redessin, en images par seconde.
 *
 * Un sextant n'a pas besoin de 60 : la bulle est un pendule tres amorti et le
 * tambour se lit au dixieme de minute d'arc. Dessiner en continu coute des
 * images au simulateur et, dans un navigateur embarque, affame la gestion des
 * clics au point de rendre les commandes inutilisables.
 *
 * L'integration de la visee, elle, reste exacte : elle travaille sur `dt`, pas
 * sur le nombre d'images.
 */
const FPS = 20;
const FRAME_MS = 1000 / FPS;

function frame() {
  requestAnimationFrame(frame);
  try {
    tick();
  } catch (err) {
    // Une erreur par image inonderait tout : on la montre une fois et on
    // laisse la boucle vivre, sinon le panneau se fige sans explication.
    if (!state.errorShown) {
      state.errorShown = true;
      showError('Loop', err);
    }
  }
}

function tick() {
  const now = performance.now();
  if (now - state.lastFrame < FRAME_MS) return;
  // Onglet ou panneau masque : rien a dessiner, et le sim recupere ses images.
  if (document.hidden) {
    state.lastFrame = now;
    return;
  }
  const dt = Math.min(0.25, (now - state.lastFrame) / 1000);
  state.lastFrame = now;

  // LES COMMANDES SONT PEINTES EN PREMIER, avant tout ce qui peut echouer.
  //
  // Elles etaient en fin de `tick()`, apres le calcul d'ephemeride et le dessin
  // du champ : la moindre exception la-dedans les privait de leur repeinture,
  // et `state.errorShown` faisait que l'erreur n'etait montree qu'UNE SEULE
  // fois. Le symptome etait exactement celui qu'on cherchait — toutes les
  // molettes figees quelques secondes, au hasard, sans rien dans le panneau
  // pour le dire, et sans que la charge ni les images n'y soient pour rien.
  //
  // Une commande d'instrument ne depend pas de l'astronomie. Elle passe donc
  // devant, et rien de ce qui suit ne peut plus la retenir.
  // Les touches maintenues font tourner les tambours ICI, dans la boucle : leur
  // vitesse ne depend donc d'aucun evenement du simulateur. C'est la commande
  // de secours quand la souris n'est plus livree — voir drum.js.
  tenirDrums(dt);
  redrawDrums();
  renderShoot();


  const s = sim.read();
  renderGisement(s.headingTrue);
  ui.clock.textContent = `${s.utc.toISOString().slice(11, 19)} Z`;

  if (now - state.bodiesRefreshedAt > 60000 || !state.bodyName) {
    state.bodiesRefreshedAt = now;
    refreshBodies(s);
  }

  updateBubble(s, dt);

  let view = {
    fieldDeg: FIELD_SEARCH / state.magnification,
    sunAltitude: -20,
    offsetXDeg: 99,
    offsetYDeg: 99,
    kind: 'star',
    magnitude: 1,
    semiDiameter: 0.26,
    bubbleXDeg: state.bubble.x,
    bubbleYDeg: state.bubble.y,
    bubbleSizeDeg: state.bubbleSizeDeg,
    filter: state.filter,
    shutter: false,
    inCloud: s.inCloud,
    // Pour l'echelle gravee en bas du champ. Elle montre l'azimut VRAI de la
    // ligne de visee, donc il lui faut les deux : le cap de l'appareil et le
    // gisement affiche sur la couronne. `Zn = cap + gisement`.
    headingTrue: s.headingTrue,
    bearingDeg: state.bearingDeg,
  };

  // Le calcul d'ephemeride est ISOLE : s'il echoue — astre inconnu, heure
  // aberrante venue d'une SimVar pas encore prete — le champ reste sur son
  // etat precedent et le reste du panneau continue. C'est un affichage, pas
  // une fonction vitale.
  try {
  if (state.bodyName) {
    // Le calcul du simulateur : ou est vraiment l'astre, et donc ce que le
    // tambour doit afficher une fois l'astre pose sur la bulle.
    const truth = simulateSight({
      utc: s.utc,
      body: state.bodyName,
      actual: { lat: s.lat, lon: s.lon },
      headingTrue: s.headingTrue,
      // L'erreur REELLE de l'exemplaire, pas celle que le joueur croit. C'est
      // toute la difference entre un instrument qu'on etalonne et un instrument
      // qui se corrige tout seul.
      indexError: ouSinon(state.instrumentError, 0),
      altitudeFt: s.altitudeFt,
      pressureHpa: s.pressureHpa,
      tempC: s.tempC,
      groundSpeedKt: s.groundSpeedKt,
      trackDeg: s.trackTrue,
    });

    // Ecart apparent dans le champ. La bulle est deplacee par l'acceleration :
    // en collimatant l'astre sur la bulle, le joueur encaisse ce deplacement.
    // C'est la source d'erreur que la moyenne sur deux minutes efface.
    const dy = truth.hs - state.drumDeg - state.bubble.y;
    // `relativeBearing` est compte depuis le nez de l'appareil ; la couronne,
    // elle, est calee en azimut vrai. On ramene donc l'astre dans le repere de
    // la couronne AVANT de comparer, sinon le lacet reviendrait par la bande.
    const bodyZn = truth.relativeBearing + ouSinon(s.headingTrue, 0);
    let dx = bodyZn - state.bearingDeg;
    dx = ((dx + 180) % 360 + 360) % 360 - 180;
    dx -= state.bubble.x;

    const sun = simulateSight({
      utc: s.utc,
      body: 'Sun',
      actual: { lat: s.lat, lon: s.lon },
    });

    view = Object.assign({}, view, {
      sunAltitude: sun.trueAltitude,
      offsetXDeg: dx,
      offsetYDeg: dy,
      kind: truth.kind,
      semiDiameter: truth.semiDiameter,
      // La phase de la Lune et l'orientation de son croissant, deja ramenee
      // dans le repere de l'oculaire par le noyau.
      illuminated: truth.illuminated,
      limbAngle: truth.limbAngle,
      magnitude: state.magnitudes ? ouSinon(state.magnitudes.get(state.bodyName), 1) : 1,
    });
  }
  } catch (err) {
    /* le champ reste sur son etat precedent ; le reste du panneau continue */
  }

  // Integration : l'averager accumule la position du TAMBOUR, pas la verite.
  //
  // Hors du bloc ci-dessus, et c'est important : depuis que la consigne vient
  // de la table, l'astre peut disparaitre en pleine visee — le navigateur
  // change d'avis, ou le pont tombe. L'integrateur, lui, ne mesure que la
  // molette : il n'a aucune raison de s'arreter parce que le champ s'est vide,
  // et la visee garde l'astre avec lequel elle a commence.
  if (state.shot) {
    state.shot.seconds += dt;
    state.shot.integral += state.drumDeg * dt;
    ui.shotTime.textContent = `${state.shot.seconds.toFixed(0)} s`;
    if (state.shot.seconds >= SHOT_MAX_S) {
      view.shutter = true;
      stopShot();
    }
  }

  viewport.draw(view);
}

// --- Commandes -------------------------------------------------------------

/** Compose une fenetre de compteur : un chiffre par cellule, dixiemes qui roulent. */
function renderCounter(el, deg) {
  const sign = deg < 0 ? '-' : '';
  const a = Math.abs(deg);
  const d = Math.floor(a);
  const totalMin = (a - d) * 60;
  const m = Math.floor(totalMin);
  const frac = totalMin - m;
  const tenth = Math.floor(frac * 10);

  // LE COMPTEUR EST BATI UNE FOIS, PUIS ON N'ECRIT QUE LES CHIFFRES.
  //
  // Il etait autrefois recompose en chaine et repose par `innerHTML` des que
  // quelque chose changeait. On avait mis un cache — inutile : a la molette
  // fine, un pixel vaut 0,37 minute, donc le chiffre des dixiemes change a
  // CHAQUE mouvement de souris. Le cache ne retenait rien et le compteur etait
  // detruit puis reanalyse cent fois par seconde, en plein geste. C'etait la
  // premiere cause des a-coups.
  //
  // Desormais la structure ne bouge plus jamais : on compare six textes et on
  // n'ecrit que ceux qui different. Pas d'analyse, pas de creation d'element.
  if (!el.cells) {
    el.innerHTML =
      '<span class="sym"></span>' +
      '<span class="dgt"></span><span class="dgt"></span>' +
      '<span class="sym">°</span>' +
      '<span class="dgt"></span><span class="dgt"></span>' +
      // POINT DECIMAL, pas virgule : l'interface est en anglais, et le noyau
      // formate deja ses angles au point (`formatAngle`, src/reduce.js) — donc
      // l'application de bureau aussi. Deux separateurs pour la meme mesure
      // entre le sextant et le carnet seraient une faute de lecture.
      '<span class="sym">.</span>' +
      // Le tambour des dixiemes porte deux chiffres : celui qui sort par le
      // haut et celui qui entre par le bas. Avec un seul, il disparaissait.
      '<span class="roll"><span><em></em><em></em></span></span>' +
      '<span class="sym">′</span>';
    el.cells = {
      sign: el.children[0],
      d: [el.children[1], el.children[2]],
      m: [el.children[4], el.children[5]],
      roll: el.querySelector('.roll > span'),
      ems: el.querySelectorAll('.roll em'),
    };
  }

  const c = el.cells;
  const poser = (node, txt) => {
    if (node.textContent !== txt) node.textContent = txt;
  };
  const ds = String(d).padStart(2, '0');
  const ms = String(m).padStart(2, '0');
  poser(c.sign, sign);
  poser(c.d[0], ds[0]);
  poser(c.d[1], ds[1]);
  poser(c.m[0], ms[0]);
  poser(c.m[1], ms[1]);
  poser(c.ems[0], String(tenth));
  poser(c.ems[1], String((tenth + 1) % 10));

  // Le decalage du tambour, arrondi au millieme d'em : en dessous rien n'est
  // visible, et ca evite d'ecrire dans le style a chaque fraction de pixel.
  const css = `translateY(${(-(frac * 10 - tenth) * 1.15).toFixed(3)}em)`;
  if (el.rollCss !== css) {
    c.roll.style.transform = css;
    el.rollCss = css;
  }
}

function renderFilterWheel() {
  if (ui.filterWheel.children.length !== FILTERS.length) {
    ui.filterWheel.innerHTML = '';
    for (let i = 0; i < FILTERS.length; i += 1) {
      const cran = document.createElement('span');
      cran.dataset.index = String(i);
      ui.filterWheel.appendChild(cran);
    }
  }
  for (const cran of ui.filterWheel.children) {
    cran.classList.toggle('on', Number(cran.dataset.index) === state.filter);
  }
  ui.filterRead.textContent = FILTERS[state.filter].name;
}

/*
 * Le gisement : la couronne vue depuis le nez de l'appareil.
 *
 * La couronne est calee en azimut vrai, pour que le lacet ne balaie plus
 * l'astre en travers du champ. Mais c'est bien un GISEMENT que le navigateur
 * lit dans ses tables pour savoir de quel cote chercher — l'« approximate
 * relative bearing » du MA-2 §3-21.a. Les deux sont donc affiches cote a cote,
 * et `Gis = Zn − cap` est la seule chose qui les separe.
 *
 * AU DEGRE ENTIER, et compare avant d'ecrire : le gisement bouge a chaque
 * lacet, donc a chaque image. C'est une valeur de recherche, on ne la lit pas
 * au dixieme, et rien ne justifie d'ecrire dans le DOM vingt fois par seconde.
 */
let _gisVu = '';
function renderGisement(headingTrue) {
  if (!ui.bearingRel) return;
  const cap = ouSinon(headingTrue, null);
  const txt = cap === null
    ? '---°'
    : `${String(Math.round(((state.bearingDeg - cap) % 360 + 360) % 360) % 360).padStart(3, '0')}°`;
  if (txt === _gisVu) return;
  _gisVu = txt;
  ui.bearingRel.textContent = txt;
}

function syncReadouts() {
  renderCounter(ui.drumRead, state.drumDeg);
  ui.bearingRead.textContent = `${state.bearingDeg.toFixed(1).padStart(5, '0')}°`;
  ui.shotTime.textContent = `${Math.round(state.shot ? state.shot.seconds : 0)} s`;
  // Les tambours PORTENT la valeur, ils ne se contentent pas de la modifier :
  // il faut donc les tenir a jour ici et pas seulement quand on les tourne,
  // sinon ils mentent des que la valeur change par un autre chemin.
  //
  // `setValue` ne PEINT PAS : il note. Le dessin est fait par la boucle, a sa
  // cadence, et seulement pour les tambours dont la valeur a bouge — tourner
  // le tambour de hauteur n'a aucune raison de repeindre les deux couronnes
  // d'azimut et la molette de bulle.
  if (drums.drum) {
    drums.drum.setValue(state.drumDeg);
    drums.fine.setValue(state.drumDeg);
    drums.bearing.setValue(state.bearingDeg);
    drums.bearingFine.setValue(state.bearingDeg);
    drums.bubble.setValue(state.bubbleSizeDeg);
  }
}

/** Repeint les tambours qui ont bouge. Appelee par la boucle, pas par un geste. */
/** Fait tourner les tambours dont une touche est maintenue. */
function tenirDrums(dt) {
  if (!drums.drum) return;
  Object.keys(drums).forEach((k) => drums[k].tenir(dt));
}

function redrawDrums() {
  if (!drums.drum) return;
  drums.drum.redraw();
  drums.fine.redraw();
  drums.bearing.redraw();
  drums.bearingFine.redraw();
  drums.bubble.redraw();
}

/** Le panneau a change de taille : c'est la seule occasion de re-mesurer. */
function remeasureDrums() {
  if (!drums.drum) return;
  Object.keys(drums).forEach((k) => drums[k].measure());
}

/**
 * Les cinq molettes.
 *
 * Chacune est definie par DEUX specifications, et le pas s'en deduit : combien
 * d'unites pour un tour, et quel pas de graduation. Voir `drum.js` — un pas
 * qu'on ne peut pas rattacher a une piece de l'instrument est un pas invente.
 */
const drums = {};

/** Les dizaines d'une rose de compas : 24 pour 240. */
const enDegres = (v) => String(((Math.round(v) % 360) + 360) % 360);
/** La minute a l'interieur du degre affiche par le tambour grossier. */
const enMinutes = (v) => String(Math.round((((v % 1) + 1) % 1) * 60));

function makeDrums() {
  drums.drum = new Drum(ui.drumKnob, {
    axis: 'y', perTurn: 30, tick: 1, number: 5,
    label: (v) => String(Math.round(v)), value: state.drumDeg,
  });
  // Gradue a la MINUTE : c'est la precision que l'instrument revendique, et il
  // n'y a pas de raison qu'un cran de molette enjambe deux fois ca.
  drums.fine = new Drum(ui.fineKnob, {
    axis: 'y', perTurn: 1, tick: 1 / 60, number: 10 / 60,
    label: enMinutes, value: state.drumDeg,
  });
  drums.bearing = new Drum(ui.bearingKnob, {
    axis: 'x', perTurn: 360, tick: 5, number: 30,
    label: enDegres, value: state.bearingDeg,
  });
  // 1 tour = 5° : la demultiplication documentee de la monture D-1. C'est lent
  // et delibere, comme la vraie manivelle — la couronne a cote reste rapide
  // pour le pointage grossier. Et 0,1° est exactement un pas de son compteur,
  // donc un cran fait toujours bouger le dernier chiffre affiche.
  drums.bearingFine = new Drum(ui.bearingFine, {
    axis: 'x', perTurn: 5, tick: 0.1, number: 1,
    label: enDegres, value: state.bearingDeg,
  });
  drums.bubble = new Drum(ui.bubbleKnob, {
    axis: 'y', perTurn: 1, tick: 0.05, number: 0.25,
    label: (v) => v.toFixed(2), value: state.bubbleSizeDeg,
  });
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

function wire() {
  // Deux molettes sur le tambour, comme sur l'instrument : une grossiere pour
  // amener l'astre dans le champ, une fine pour collimater. La plage utile va
  // de -10° a +92°.
  const tournerTambour = (d) => {
    state.drumDeg = clamp(state.drumDeg + d, -10, 92);
    syncReadouts();
  };
  drums.drum.attach(tournerTambour);
  drums.fine.attach(tournerTambour);

  // La couronne se manivelle lateralement, et elle a elle aussi son reglage
  // fin : sans lui on ne peut pas amener l'astre sur le reticule vertical, et
  // juger sa hauteur contre une bulle decalee de plusieurs degres introduit
  // exactement le biais qu'on cherche a eviter.
  const tournerCouronne = (d) => {
    state.bearingDeg = ((state.bearingDeg + d) % 360 + 360) % 360;
    syncReadouts();
  };
  drums.bearing.attach(tournerCouronne);
  drums.bearingFine.attach(tournerCouronne);

  drums.bubble.attach((d) => {
    state.bubbleSizeDeg = clamp(state.bubbleSizeDeg + d, 0.35, 1.8);
    syncReadouts();
    // ON N'ECRIT PAS DANS UN ECOUTEUR D'ENTREE, pas plus qu'on n'y peint.
    // `save()` serialise tout l'etat, ecrit dans le localStorage — appel
    // SYNCHRONE — et poste un message a l'hote, qui appelle SetStoredData du
    // simulateur. Appele a chaque mouvement de souris, cela faisait une
    // centaine d'ecritures disque pour un seul tour de molette. Le geste note,
    // et l'ecriture part une demi-seconde apres le dernier mouvement.
    saveBientot();
  });

  // Le selecteur de grossissement : on clique la position voulue, ou n'importe
  // ou pour basculer. Deux positions gravees valent mieux qu'une bascule dont
  // il faut lire le texte pour savoir ou l'on est.
  const changeGrossissement = (ev) => {
    const r = ui.magButton.getBoundingClientRect();
    const i = ev && r.width
      ? Math.min(MAGNIFICATIONS.length - 1,
        Math.max(0, Math.floor(((ev.clientX - r.left) / r.width) * MAGNIFICATIONS.length)))
      : (MAGNIFICATIONS.indexOf(state.magnification) + 1) % MAGNIFICATIONS.length;
    state.magnification = MAGNIFICATIONS[i];
    renderMagnification();
    save();
  };
  ui.magButton.addEventListener('click', changeGrossissement);
  ui.magButton.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    changeGrossissement(null);
    ev.preventDefault();
  });

  // Roue de filtres : on clique un cran, comme on tourne la roue d'un cran.
  ui.filterWheel.addEventListener('click', (ev) => {
    const cran = ev.target.closest('span[data-index]');
    if (cran) state.filter = Number(cran.dataset.index);
    else state.filter = (state.filter + 1) % FILTERS.length;
    renderFilterWheel();
    save();
  });

  // Le poussoir. Il s'enfonce sous le doigt : sans course visible, un bouton
  // peint ne se distingue pas d'une etiquette.
  const basculerVisee = () => {
    if (state.shot) stopShot();
    else startShot(sim.read().utc);
    renderShoot();
  };
  ui.shoot.addEventListener('mousedown', () => { state.shootPressed = true; renderShoot(); });
  ui.shoot.addEventListener('mouseup', () => { state.shootPressed = false; renderShoot(); });
  ui.shoot.addEventListener('mouseleave', () => {
    if (!state.shootPressed) return;
    state.shootPressed = false;
    renderShoot();
  });
  ui.shoot.addEventListener('click', basculerVisee);
  ui.shoot.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    basculerVisee();
    ev.preventDefault();
  });
}

/**
 * Coherent GT n'offre pas de console : une erreur non rattrapee y disparait
 * en silence et le panneau reste fige sans rien dire. On l'affiche donc dans
 * le panneau lui-meme, et on ne la montre qu'une fois.
 */
function showError(where, err) {
  const msg = `${where} : ${err && err.message ? err.message : err}`;
  if (ui.shotState) {
    ui.shotState.textContent = msg;
    ui.shotState.style.color = '#e08b7a';
  }
  if (typeof console !== 'undefined' && console.error) console.error(where, err);
}


/*
 * Demarrage.
 *
 * Enveloppe dans une fonction async, et non en `await` de premier niveau : le
 * moteur du panneau est un WebKit 604, l'await de module lui est inconnu et
 * ferait echouer l'ANALYSE du fichier entier — donc rien ne s'afficherait.
 *
 * L'ordre compte : on attend la reponse de l'hote AVANT de tirer une erreur
 * d'index. Sinon un exemplaire deja etalonne s'en verrait attribuer une neuve a
 * chaque demarrage, et le carnet d'etalonnage ne servirait a rien.
 */
async function demarrer() {
  try {
    // Les commandes existent avant d'etre cablees : `wire()` leur accroche les
    // gestes, il ne les cree pas.
    makeDrums();
    // Une commande peinte ne se redessine qu'au changement, or son canvas doit
    // suivre la taille de la fenetre — sinon elle reste floue apres un
    // redimensionnement. C'est aussi la SEULE occasion ou l'on interroge la
    // mise en page.
    window.addEventListener('resize', () => {
      remeasureDrums();
      remeasureControls();
    });
    wire();
    renderFilterWheel();
    renderMagnification();
    renderShoot();
    renderConsigne();
    renderLien(pont.etat());
    syncReadouts();
    requestAnimationFrame(frame);

    await restore();

    // Premier lancement : l'exemplaire recoit son erreur d'index, une fois pour
    // toutes. Le joueur ne la connait pas — c'est le point de depart du jeu, et
    // c'est desormais la seule donnee de jeu que le panneau garde.
    if (typeof state.instrumentError !== 'number') {
      state.instrumentError = drawInstrumentError();
    }
    save();

    // Le pont s'ouvre APRES la restauration : les visees qui attendaient
    // depuis la session precedente lui sont rendues d'abord, sinon elles ne
    // repartiraient jamais et resteraient a dormir dans le stockage.
    pont.reprendre(state.shots);
    pont.demarrer();

    renderFilterWheel();
    renderMagnification();
    renderShoot();
    renderConsigne();
    syncReadouts();
  } catch (err) {
    showError('Startup', err);
  }
}

demarrer();
