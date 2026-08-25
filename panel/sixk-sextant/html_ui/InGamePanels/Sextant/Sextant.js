/**
 * Hote du panneau : il ne fait presque rien, et c'est voulu.
 *
 * Le cadre MSFS gere la fenetre ; l'instrument vit dans l'iframe. Le seul role
 * de ce fichier est de pousser dans l'iframe ce que seule la page hote sait
 * lire — les SimVars — pour que l'application n'ait aucune dependance au
 * simulateur et reste testable dans un navigateur.
 */

class IngamePanelSextant extends TemplateElement {
  constructor() {
    super();
    this.frame = null;
    this.timer = null;
  }

  connectedCallback() {
    super.connectedCallback();
    this.frame = document.getElementById('SextantFrame');
    // 10 Hz suffit : la visee dure deux minutes, et l'assiette d'un avion en
    // croisiere ne change pas plus vite que ca.
    this.timer = setInterval(() => this.pushState(), 100);

    // L'iframe n'a pas acces aux fonctions du simulateur : c'est l'hote qui
    // relaie. Voir onStore.
    this.onMessage = (ev) => this.handleStore(ev);
    window.addEventListener('message', this.onMessage);
  }

  /**
   * Relais de persistance.
   *
   * Le `localStorage` d'un panneau NE SURVIT PAS a la session : constate en vol,
   * un carnet d'etalonnage de dix visees s'est perdu au redemarrage. MSFS a sa
   * propre API — `SetStoredData` / `GetStoredData`, chargee par
   * `/JS/dataStorage.js` — mais elle n'existe que dans la page hote, pas dans
   * l'iframe. L'hote fait donc le facteur, comme il le fait deja pour les
   * SimVars.
   *
   * Hors simulateur, ces fonctions n'existent pas : l'application retombe alors
   * sur son `localStorage`, ce qui suffit au navigateur de developpement.
   */
  handleStore(ev) {
    const d = ev.data;
    if (!d || !d.key) return;

    if (d.type === 'store-set') {
      try {
        SetStoredData(d.key, d.value);
      } catch (e) {
        /* pas de simulateur : l'application garde son localStorage */
      }
      return;
    }

    if (d.type === 'store-get') {
      let value = null;
      try {
        value = GetStoredData(d.key);
      } catch (e) {
        value = null;
      }
      if (this.frame && this.frame.contentWindow) {
        this.frame.contentWindow.postMessage(
          { type: 'store-data', key: d.key, value: value || null },
          '*',
        );
      }
    }
  }

  disconnectedCallback() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.onMessage) window.removeEventListener('message', this.onMessage);
    this.onMessage = null;
    super.disconnectedCallback();
  }

  /** Lit une SimVar en tolerant son absence : hors simulateur, tout vaut 0. */
  static read(name, unit) {
    try {
      const v = SimVar.GetSimVarValue(name, unit);
      return typeof v === 'number' && Number.isFinite(v) ? v : 0;
    } catch (e) {
      return 0;
    }
  }

  pushState() {
    if (!this.frame || !this.frame.contentWindow) return;
    const r = IngamePanelSextant.read;

    // L'heure du simulateur : jour absolu depuis le 1er janvier de l'annee, plus
    // les secondes zulu. C'est ce que le sim expose de plus fiable.
    const year = r('E:ZULU YEAR', 'number');
    const dayOfYear = r('E:ZULU DAY OF YEAR', 'number');
    const secondsZulu = r('E:ZULU TIME', 'seconds');

    const state = {
      t: Date.now(),
      lat: r('PLANE LATITUDE', 'degrees'),
      lon: r('PLANE LONGITUDE', 'degrees'),
      altitudeFt: r('PLANE ALTITUDE', 'feet'),
      headingTrue: r('PLANE HEADING DEGREES TRUE', 'degrees'),
      trackTrue: r('GPS GROUND TRUE TRACK', 'degrees'),
      groundSpeedKt: r('GROUND VELOCITY', 'knots'),
      bank: r('PLANE BANK DEGREES', 'degrees'),
      pitch: r('PLANE PITCH DEGREES', 'degrees'),
      // Acceleration laterale : c'est elle qui fait vagabonder la bulle.
      accelX: r('ACCELERATION BODY X', 'feet per second squared'),
      accelZ: r('ACCELERATION BODY Z', 'feet per second squared'),
      inCloud: r('AMBIENT IN CLOUD', 'bool') !== 0,
      // Au sol, le joueur sait legitimement ou il est : c'est la seule
      // situation ou le panneau accepte de lui donner sa position, pour
      // l'etalonnage.
      onGround: r('SIM ON GROUND', 'bool') !== 0,
      pressureHpa: r('AMBIENT PRESSURE', 'millibars') || undefined,
      tempC: r('AMBIENT TEMPERATURE', 'celsius'),
      year,
      dayOfYear,
      secondsZulu,
      inSim: true,
    };

    this.frame.contentWindow.postMessage({ type: 'sim-state', state }, '*');
  }
}

window.customElements.define('ingamepanel-sextant', IngamePanelSextant);
checkAutoload();
