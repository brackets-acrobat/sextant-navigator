/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// simconnect.js — connexion SimConnect + lecture des SimVars de brousse.
//
// Porté de la connexion éprouvée de NavXpressVFR (protocole FSX_SP2, pattern
// open() / addToDataDefinition / requestDataOnSimObject / 'simObjectData').
//
// Cadence : groupe lu à SIM_FRAME (chaque image) pour permettre à la FSM
// d'échantillonner le poser à 0,5 s avec des données FRAÎCHES. On en déduit :
//   (l'événement 'frame', émis à chaque image, est tombé avec le carnet de vol
//    qui en était le seul consommateur)
//   - 'scan'  : émis au plus 1×/seconde (throttle) pour rafraîchir l'UI sans
//               inonder l'IPC
//   - 'status': état de connexion
//
// SimVars (cf. note de conception) :
//   GROUND ALTITUDE        → relief sous l'avion (donnée centrale)
//   SURFACE TYPE / COND    → sol, fiables au contact
//   PLANE ALT ABOVE GROUND → hauteur-sol (détection vol / poser)
//   SIM ON GROUND / GROUND VELOCITY / BRAKE PARKING → FSM du poser
//   LOCAL TIME/YEAR/MONTH/DAY → date+heure LOCALE du simulateur (horodatage)
//   ZULU TIME/YEAR/MONTH/DAY  → le même instant en UTC, seule heure que
//                               l'éphéméride accepte (catalogue d'astres)
//   AIRSPEED TRUE          → vitesse propre, lecture de bord dont l'estime a
//                            le droit de se servir (cf. main/estime.js)
// ============================================================

const EventEmitter = require('events');
const {
  open: scOpen,
  Protocol: SCProtocol,
  SimConnectDataType: SCDataType,
  SimConnectPeriod: SCPeriod,
  SimConnectConstants: SCConst,
} = require('node-simconnect');

const SC_SCAN_DEF_ID = 1;
const SC_SCAN_REQ_ID = 1;
const UI_THROTTLE_MS = 500; // cadence d'émission vers le renderer (UI)

// Enum MSFS SURFACE TYPE → libellé. « Mud » n'existe pas (assimilé à Dirt).
const SURFACE_TYPES = [
  'Concrete', 'Grass', 'Water', 'Grass bumpy', 'Asphalt', 'Short grass',
  'Long grass', 'Hard turf', 'Snow', 'Ice', 'Urban', 'Forest', 'Dirt',
  'Coral', 'Gravel', 'Oil treated', 'Steel mats', 'Bituminus', 'Brick',
  'Macadam', 'Planks', 'Sand', 'Shale', 'Tarmac', 'Wright flyer track',
];
const SURFACE_CONDITIONS = ['Normal', 'Wet', 'Icy', 'Snow'];

function libelleSurface(v) { return SURFACE_TYPES[v] ?? `Inconnu (${v})`; }
function libelleCondition(v) { return SURFACE_CONDITIONS[v] ?? `Inconnu (${v})`; }

// Construit l'horodatage LOCAL du simulateur « AAAA-MM-JJ HH:MM:SS »
// (format attendu par l'API : Y-m-d H:i:s).
function buildSimLocal(year, month, day, secondsSinceMidnight) {
  const p2 = (n) => String(n).padStart(2, '0');
  const hh = Math.floor(secondsSinceMidnight / 3600) % 24;
  const mm = Math.floor(secondsSinceMidnight / 60) % 60;
  const ss = Math.floor(secondsSinceMidnight) % 60;
  if (!year || !month || !day) return null;
  return `${year}-${p2(month)}-${p2(day)} ${p2(hh)}:${p2(mm)}:${p2(ss)}`;
}

// Le même instant en TEMPS UNIVERSEL, en ISO. C'est la SEULE heure dont
// l'éphéméride ait besoin : le catalogue d'astres, la réduction et le point
// travaillent tous en UTC, et l'heure locale du simulateur n'y entre jamais.
// Le décalage n'est pas déductible de la position — il dépend du fuseau, de
// l'heure d'été, et le simulateur les tient lui-même — donc on le lit plutôt
// que de le calculer.
//
// Renvoie null tant que la date n'est pas plausible : au chargement d'un vol,
// le simulateur sert des zéros pendant quelques trames, et une date de l'an 0
// donnerait un catalogue faux plutôt qu'un catalogue absent.
function buildSimUtc(year, month, day, secondsSinceMidnight) {
  if (!year || !month || !day || year < 1900) return null;
  const ms = Date.UTC(year, month - 1, day) + Math.round(secondsSinceMidnight * 1000);
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

class SimConnectClient extends EventEmitter {
  constructor() {
    super();
    this._handle = null;
    this._connecting = false;
    this._lastUiEmit = 0;
  }

  estConnecte() { return !!this._handle; }

  async connecter() {
    if (this._handle) return { ok: true, alreadyConnected: true };
    if (this._connecting) return { ok: false, error: 'connect-in-progress' };

    this._connecting = true;
    this.emit('status', { state: 'connecting' });

    try {
      const { recvOpen, handle } = await scOpen('SextantNavigator', SCProtocol.FSX_SP2);
      this._handle = handle;
      this._connecting = false;
      this.emit('status', { state: 'connected', app: recvOpen.applicationName });
      this._definirScan(handle);
      this._brancherEvenements(handle);
      return { ok: true };
    } catch (err) {
      this._connecting = false;
      this.emit('status', { state: 'disconnected', error: err && err.message });
      return { ok: false, error: err && err.message };
    }
  }

  async deconnecter() {
    if (this._handle) {
      try { this._handle.close(); } catch (_) {}
      this._handle = null;
    }
    this.emit('status', { state: 'disconnected' });
  }

  // L'ORDRE des addToDataDefinition fixe l'ordre de lecture dans 'simObjectData'.
  _definirScan(handle) {
    handle.addToDataDefinition(SC_SCAN_DEF_ID, 'PLANE LATITUDE',             'degrees', SCDataType.FLOAT64);
    handle.addToDataDefinition(SC_SCAN_DEF_ID, 'PLANE LONGITUDE',            'degrees', SCDataType.FLOAT64);
    handle.addToDataDefinition(SC_SCAN_DEF_ID, 'PLANE ALTITUDE',            'feet',    SCDataType.FLOAT64); // MSL
    handle.addToDataDefinition(SC_SCAN_DEF_ID, 'PLANE ALT ABOVE GROUND',    'feet',    SCDataType.FLOAT64); // AGL
    handle.addToDataDefinition(SC_SCAN_DEF_ID, 'GROUND ALTITUDE',           'feet',    SCDataType.FLOAT64); // relief
    // Altitude au calage standard : c'est elle, et elle seule, qui se compare à
    // un niveau de vol. Le QNH n'a donc jamais à entrer dans le calcul.
    handle.addToDataDefinition(SC_SCAN_DEF_ID, 'PRESSURE ALTITUDE',         'feet',    SCDataType.FLOAT64); // FL
    handle.addToDataDefinition(SC_SCAN_DEF_ID, 'SURFACE TYPE',              'Enum',    SCDataType.INT32);
    handle.addToDataDefinition(SC_SCAN_DEF_ID, 'SURFACE CONDITION',         'Enum',    SCDataType.INT32);
    handle.addToDataDefinition(SC_SCAN_DEF_ID, 'GROUND VELOCITY',           'knots',   SCDataType.FLOAT64);
    // Vitesse verticale et facteur de charge. Ils étaient lus à la cadence
    // image pour le carnet de vol, qui est parti ; plus personne ne les
    // consomme. On les laisse plutôt que de retoucher l'ordre de lecture d'un
    // groupe qui se lit séquentiellement — s'y tromper décalerait tout ce qui
    // suit, position comprise, sans rien afficher d'anormal. À nettoyer en même
    // temps que la cadence du groupe, qui peut descendre sous SIM_FRAME
    // maintenant que l'interface est seule à lire.
    handle.addToDataDefinition(SC_SCAN_DEF_ID, 'VERTICAL SPEED',            'feet per minute', SCDataType.FLOAT64);
    handle.addToDataDefinition(SC_SCAN_DEF_ID, 'G FORCE',                   'GForce',  SCDataType.FLOAT64);
    handle.addToDataDefinition(SC_SCAN_DEF_ID, 'PLANE HEADING DEGREES TRUE', 'degrees', SCDataType.FLOAT64);
    handle.addToDataDefinition(SC_SCAN_DEF_ID, 'PLANE HEADING DEGREES MAGNETIC', 'degrees', SCDataType.FLOAT64);
    // Route SOL vraie : le cap ne suffit pas à la rose des vents, qui trace les
    // deux (trait plein = route, pointillés = cap) et lit la dérive dans leur écart.
    handle.addToDataDefinition(SC_SCAN_DEF_ID, 'GPS GROUND TRUE TRACK',      'degrees', SCDataType.FLOAT64);
    handle.addToDataDefinition(SC_SCAN_DEF_ID, 'AMBIENT WIND DIRECTION',    'degrees', SCDataType.FLOAT64); // d'où vient le vent (vrai)
    handle.addToDataDefinition(SC_SCAN_DEF_ID, 'AMBIENT WIND VELOCITY',     'knots',   SCDataType.FLOAT64);
    handle.addToDataDefinition(SC_SCAN_DEF_ID, 'SIM ON GROUND',             'Bool',    SCDataType.INT32);
    handle.addToDataDefinition(SC_SCAN_DEF_ID, 'BRAKE PARKING POSITION',    'Bool',    SCDataType.INT32);
    handle.addToDataDefinition(SC_SCAN_DEF_ID, 'GENERAL ENG COMBUSTION:1',  'Bool',    SCDataType.INT32);
    handle.addToDataDefinition(SC_SCAN_DEF_ID, 'GENERAL ENG COMBUSTION:2',  'Bool',    SCDataType.INT32);
    handle.addToDataDefinition(SC_SCAN_DEF_ID, 'LOCAL TIME',                'seconds', SCDataType.FLOAT64);
    handle.addToDataDefinition(SC_SCAN_DEF_ID, 'LOCAL YEAR',               'number',  SCDataType.FLOAT64);
    handle.addToDataDefinition(SC_SCAN_DEF_ID, 'LOCAL MONTH OF YEAR',      'number',  SCDataType.FLOAT64);
    handle.addToDataDefinition(SC_SCAN_DEF_ID, 'LOCAL DAY OF MONTH',       'number',  SCDataType.FLOAT64);
    handle.addToDataDefinition(SC_SCAN_DEF_ID, 'TITLE',                    null,      SCDataType.STRING256); // aéronef (constant)
    // Heure ZULU du simulateur — celle de l'éphéméride. AJOUTÉE EN QUEUE, et
    // c'est délibéré : ce groupe se lit séquentiellement, insérer au milieu
    // décalerait tous les rangs suivants sans que rien n'ait l'air anormal.
    // Toute variable nouvelle vient donc ici, à la fin, et nulle part ailleurs.
    handle.addToDataDefinition(SC_SCAN_DEF_ID, 'ZULU TIME',                'seconds', SCDataType.FLOAT64);
    handle.addToDataDefinition(SC_SCAN_DEF_ID, 'ZULU YEAR',                'number',  SCDataType.FLOAT64);
    handle.addToDataDefinition(SC_SCAN_DEF_ID, 'ZULU MONTH OF YEAR',       'number',  SCDataType.FLOAT64);
    handle.addToDataDefinition(SC_SCAN_DEF_ID, 'ZULU DAY OF MONTH',        'number',  SCDataType.FLOAT64);
    // Vitesse propre VRAIE. C'est une lecture de bord — badin corrigé de
    // l'altitude et de la température — donc le navigateur y a droit, au même
    // titre qu'au compas. La vitesse SOL et la route SOL, elles, sont dans ce
    // même groupe et lui sont interdites : elles contiennent le vent, et le
    // vent est ce qu'il doit deviner. Voir main/estime.js.
    handle.addToDataDefinition(SC_SCAN_DEF_ID, 'AIRSPEED TRUE',            'knots',   SCDataType.FLOAT64);

    handle.requestDataOnSimObject(
      SC_SCAN_REQ_ID, SC_SCAN_DEF_ID, SCConst.OBJECT_ID_USER,
      SCPeriod.SIM_FRAME, 0, 0, 0, 0
    );
  }

  _brancherEvenements(handle) {
    handle.on('simObjectData', (data) => {
      if (data.requestID !== SC_SCAN_REQ_ID) return;
      try {
        // Lecture dans l'ordre EXACT de la définition ci-dessus.
        const lat          = data.data.readFloat64();
        const lon          = data.data.readFloat64();
        const amslFt       = data.data.readFloat64();
        const aglFt        = data.data.readFloat64();
        const groundAltFt  = data.data.readFloat64();
        const stdFt        = data.data.readFloat64();
        const surfaceType  = data.data.readInt32();
        const surfaceCond  = data.data.readInt32();
        const groundSpeedKt = data.data.readFloat64();
        const vsFtMin      = data.data.readFloat64();
        const gForce       = data.data.readFloat64();
        const headingTrue  = data.data.readFloat64();
        const headingMag   = data.data.readFloat64();
        const trackTrue    = data.data.readFloat64();   // route sol vraie (GPS)
        const windDir      = data.data.readFloat64();   // d'où vient le vent (cap vrai)
        const windKt       = data.data.readFloat64();
        const onGround     = data.data.readInt32() !== 0;
        const parkingBrake = data.data.readInt32() !== 0;
        const eng1         = data.data.readInt32() !== 0;
        const eng2         = data.data.readInt32() !== 0;
        const localTime    = data.data.readFloat64();
        const localYear    = data.data.readFloat64();
        const localMonth   = data.data.readFloat64();
        const localDay     = data.data.readFloat64();
        const aircraftTitle = data.data.readString256();
        const zuluTime     = data.data.readFloat64();
        const zuluYear     = data.data.readFloat64();
        const zuluMonth    = data.data.readFloat64();
        const zuluDay      = data.data.readFloat64();
        const tasKt        = data.data.readFloat64();

        const frame = {
          lat, lon, amslFt, aglFt, groundAltFt, stdFt,
          surfaceType, surfaceTypeLabel: libelleSurface(surfaceType),
          surfaceCond, surfaceCondLabel: libelleCondition(surfaceCond),
          groundSpeedKt, vsFtMin, gForce,
          headingTrue, headingMag, trackTrue, windDir, windKt, onGround, parkingBrake,
          engineOn: eng1 || eng2,
          aircraftTitle,
          simLocal: buildSimLocal(localYear, localMonth, localDay, localTime),
          simUtc: buildSimUtc(zuluYear, zuluMonth, zuluDay, zuluTime),
          tasKt,
          t: Date.now(),
        };

        // Throttle pour l'UI (renderer).
        if (frame.t - this._lastUiEmit >= UI_THROTTLE_MS) {
          this._lastUiEmit = frame.t;
          this.emit('scan', frame);
        }
      } catch (err) {
        this.emit('status', { state: 'connected', warn: 'lecture KO: ' + (err && err.message) });
      }
    });

    handle.on('exception', (ex) => {
      this.emit('status', { state: 'connected', warn: 'exception SimConnect: ' + JSON.stringify(ex) });
    });

    const onPerte = () => { this._handle = null; this.emit('status', { state: 'disconnected' }); };
    handle.on('quit', onPerte);
    handle.on('close', onPerte);
  }
}

module.exports = { SimConnectClient, SURFACE_TYPES, SURFACE_CONDITIONS, libelleSurface, libelleCondition };
