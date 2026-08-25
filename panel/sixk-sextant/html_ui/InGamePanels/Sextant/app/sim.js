/**
 * Lien avec le simulateur — et son remplacant quand il n'y en a pas.
 *
 * La page hote pousse un etat toutes les 100 ms par `postMessage`. Si rien
 * n'arrive, on bascule sur un avion fictif : c'est ce qui permet de developper
 * et de tester l'instrument entier dans un navigateur, sans lancer MSFS.
 */

const MOCK_AFTER_MS = 1500;

/** Avion fictif : un DC-3 en croisiere de nuit au large de la Californie. */
const MOCK_START = {
  lat: 34.5,
  lon: -122.0,
  altitudeFt: 9000,
  headingTrue: 285,
  trackTrue: 285,
  groundSpeedKt: 150,
  // Une nuit d'hiver claire : le Soleil est bien sous l'horizon, les etoiles
  // de navigation sont hautes.
  utc: Date.UTC(2026, 0, 15, 4, 30, 0),
};

export class Sim {
  constructor() {
    this.state = null;
    this.lastMessage = 0;
    this.mock = Object.assign({}, MOCK_START, { t0: performance.now() });
    this.timeScale = 1;

    window.addEventListener('message', (ev) => {
      const d = ev.data;
      if (!d || d.type !== 'sim-state') return;
      this.lastMessage = performance.now();
      this.state = d.state;
    });
  }

  /** Vrai tant que le simulateur n'a pas donne signe de vie. */
  get isMock() {
    return performance.now() - this.lastMessage > MOCK_AFTER_MS;
  }

  /**
   * Etat courant, normalise. `utc` est toujours un Date, quelle que soit la
   * source — c'est la seule chose dont le noyau a besoin.
   */
  read() {
    if (!this.isMock && this.state) return Sim.fromSim(this.state);
    return this.readMock();
  }

  static fromSim(s) {
    // Le sim donne l'annee, le quantieme et les secondes zulu separement.
    const utc = new Date(
      Date.UTC(s.year || 2026, 0, 1, 0, 0, 0) +
        Math.max(0, (s.dayOfYear || 1) - 1) * 86400000 +
        (s.secondsZulu || 0) * 1000,
    );
    return {
      inSim: true,
      utc,
      lat: s.lat,
      lon: s.lon,
      altitudeFt: s.altitudeFt,
      headingTrue: s.headingTrue,
      trackTrue: s.trackTrue || s.headingTrue,
      groundSpeedKt: s.groundSpeedKt,
      accelX: s.accelX || 0,
      bank: s.bank || 0,
      inCloud: !!s.inCloud,
      onGround: !!s.onGround,
      pressureHpa: s.pressureHpa,
      tempC: s.tempC,
    };
  }

  /**
   * Avion fictif : vol rectiligne, plus une petite turbulence deterministe.
   * Deterministe parce qu'un bug qui ne se reproduit pas ne se corrige pas.
   */
  readMock() {
    const elapsedS = ((performance.now() - this.mock.t0) / 1000) * this.timeScale;
    const utc = new Date(this.mock.utc + elapsedS * 1000);

    // Route au 285°, 150 kt : on avance vraiment, donc la hauteur des astres
    // change vraiment pendant la visee.
    const nm = (this.mock.groundSpeedKt * elapsedS) / 3600;
    const brg = (this.mock.trackTrue * Math.PI) / 180;
    const lat = this.mock.lat + (nm * Math.cos(brg)) / 60;
    const lon =
      this.mock.lon +
      (nm * Math.sin(brg)) / 60 / Math.cos((lat * Math.PI) / 180);

    // Turbulence : trois sinusoides incommensurables, ca ne se repete jamais
    // a l'oeil et ca reste reproductible.
    const t = elapsedS;
    const turb =
      0.6 * Math.sin(t * 0.83) + 0.35 * Math.sin(t * 1.97) + 0.2 * Math.sin(t * 3.61);

    return {
      inSim: false,
      utc,
      lat,
      lon,
      altitudeFt: this.mock.altitudeFt,
      headingTrue: this.mock.headingTrue,
      trackTrue: this.mock.trackTrue,
      groundSpeedKt: this.mock.groundSpeedKt,
      accelX: turb * 1.8,
      bank: turb * 1.2,
      inCloud: false,
      onGround: false,
      pressureHpa: undefined,
      tempC: undefined,
    };
  }
}
