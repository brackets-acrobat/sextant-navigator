/**
 * Les molettes de l'instrument — un vrai cylindre, pas une bande de rayures.
 *
 * Chaque graduation vit a un angle sur le tambour ; ce qu'on voit a l'ecran
 * est sa PROJECTION, `R·sin θ` pour la position et `cos θ` pour l'eclat. D'ou,
 * sans rien coder de plus : les traits se resserrent vers les bords, ils s'y
 * eteignent, et le tambour tourne vraiment sous le doigt — a la bonne vitesse,
 * ce que le defilement de texture au pixel ne faisait pas.
 *
 * ET LE PAS CESSE D'ETRE UNE CONSTANTE CHOISIE AU JUGE.
 *
 * Rouler un cylindre de rayon R d'un arc de `p` pixels le tourne de `p/R`
 * radians, donc de `perTurn · p / (2πR)` unites. Le pas tombe alors de deux
 * specifications de l'instrument — son diametre a l'ecran et ses unites par
 * tour — et il n'y a plus de reglage a defendre. C'est aussi ce qui a rendu
 * inutile l'idee de coupler le pas au grossissement : au rayon retenu, le
 * tambour fin donne 0,37′ par pixel de doigt, sous les 0,40′ que vaut un pixel
 * de champ a ×5. La molette n'est donc jamais le facteur limitant.
 *
 * CONSEQUENCE DE MISE EN PAGE, a ne pas perdre de vue : la taille a l'ecran
 * EST le rayon. Un tambour vertical roule sur sa hauteur, une couronne
 * horizontale sur sa largeur, et ces dimensions sont donc figees dans la
 * feuille de style — les elargir ralentirait la commande.
 *
 * Rien ici ne sort du moteur de 2017 : ni `ctx.filter`, ni `getImageData`,
 * ni degrade conique.
 */

/** L'ambre du panneau, pour le seul trait qu'on lit vraiment. */
const REPERE = 'rgba(216,162,74,0.92)';

export class Drum {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {object} o
   * @param {'x'|'y'} o.axis      sens du roulement
   * @param {number} o.perTurn    unites pour un tour complet
   * @param {number} o.tick       pas de graduation — et donc pas d'un cran
   * @param {number} o.number     intervalle entre deux graduations chiffrees
   * @param {(v:number)=>string} o.label
   * @param {number} o.value
   */
  constructor(canvas, o) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.o = o;
    this.value = o.value;
    // Le nombre de crans entre deux chiffres. On indexe les graduations par
    // entiers : additionner `tick` en boucle accumule une derive qui finit par
    // faire manquer les traits chiffres.
    this.ratio = Math.max(1, Math.round(o.number / o.tick));
    // Taille MEMORISEE. `getBoundingClientRect()` force un calcul de mise en
    // page synchrone ; l'appeler a chaque dessin, entre deux ecritures dans le
    // DOM, produit le va-et-vient lecture/ecriture qui fait saccader.
    this.cssW = 0;
    this.cssH = 0;
    this.dirty = true;
  }

  /** A rappeler au redimensionnement seulement : c'est la seule mesure. */
  measure() {
    const r = this.canvas.getBoundingClientRect();
    this.cssW = Math.max(16, Math.round(r.width));
    this.cssH = Math.max(16, Math.round(r.height));
    this.dirty = true;
  }

  /** Le rayon visible, en pixels CSS : la face du cylindre occupe 2R. */
  radius() {
    if (!this.cssW) this.measure();
    return Math.max(8, (this.o.axis === 'y' ? this.cssH : this.cssW) / 2);
  }

  /** Unites par pixel de glissement — la formule du roulement, rien d'autre. */
  perPixel() {
    return this.o.perTurn / (2 * Math.PI * this.radius());
  }

  /**
   * Note la valeur, ne peint rien.
   *
   * Le dessin est fait par la boucle, a sa cadence. Peindre dans l'ecouteur
   * lie le travail au DEBIT D'EVENEMENTS de la souris, qui n'a aucune raison
   * d'etre celui de l'affichage — et une souris rapide finissait par emettre
   * plus de mouvements que le moteur ne pouvait en peindre.
   */
  setValue(v) {
    if (v === this.value) return;
    this.value = v;
    this.dirty = true;
  }

  /** Appelee par la boucle : ne repeint que ce qui a bouge. */
  redraw() {
    if (!this.dirty) return;
    this.dirty = false;
    this.draw();
  }

  draw() {
    const { canvas, ctx, o } = this;
    if (!this.cssW) this.measure();
    const w = this.cssW;
    const h = this.cssH;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const vertical = o.axis === 'y';
    const R = (vertical ? h : w) / 2; // le long du roulement
    const across = vertical ? w : h; // la longueur des traits
    const cv = across / 2;
    // Position ecran d'un point situe a `u` du centre, sur la ligne `v`.
    const put = (u, v) => (vertical ? [v, R + u] : [R + u, v]);

    // 1. Le corps. L'eclat suit la courbure — plein au centre, eteint aux
    //    bords. Un degrade lineaire ordinaire ne le fait pas : il faut la loi.
    const g = vertical
      ? ctx.createLinearGradient(0, 0, 0, h)
      : ctx.createLinearGradient(0, 0, w, 0);
    for (let i = 0; i <= 12; i += 1) {
      const t = i / 12;
      const u = t * 2 - 1; // -1 au bord, 0 au centre
      const lambert = Math.sqrt(Math.max(0, 1 - u * u));
      // Le speculaire est DECALE vers la lumiere, en haut a gauche. C'est ce
      // decalage qui fait « cylindre eclaire » plutot que « tube symetrique ».
      const spec = Math.pow(Math.max(0, 1 - Math.abs(u + 0.34) * 2.1), 3);
      const lum = 22 + lambert * 108 + spec * 74;
      g.addColorStop(
        t,
        `rgb(${Math.round(lum)},${Math.round(lum * 1.03)},${Math.round(lum * 1.08)})`,
      );
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // 2. Les graduations, projetees.
    const TAU = Math.PI * 2;
    const i0 = Math.floor((this.value - o.perTurn / 2) / o.tick);
    const i1 = Math.ceil((this.value + o.perTurn / 2) / o.tick);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let ii = i0; ii <= i1; ii += 1) {
      const val = ii * o.tick;
      let th = ((val - this.value) / o.perTurn) * TAU;
      th = Math.atan2(Math.sin(th), Math.cos(th)); // ramene dans (-π, π]
      const c = Math.cos(th);
      if (c <= 0.10) continue; // face arriere
      const u = R * Math.sin(th);
      const chiffre = ((ii % this.ratio) + this.ratio) % this.ratio === 0;
      const len = (chiffre ? 0.40 : 0.22) * across;
      const a = Math.pow(c, 1.3);

      const p1 = put(u, cv - len / 2);
      const p2 = put(u, cv + len / 2);
      // Grave : un bord clair contre un bord sombre, comme le reticule.
      ctx.strokeStyle = `rgba(255,255,255,${(a * 0.30).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p1[0] + (vertical ? 0 : 0.8), p1[1] + (vertical ? 0.8 : 0));
      ctx.lineTo(p2[0] + (vertical ? 0 : 0.8), p2[1] + (vertical ? 0.8 : 0));
      ctx.stroke();
      ctx.strokeStyle = `rgba(10,10,12,${(a * 0.80).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(p1[0], p1[1]);
      ctx.lineTo(p2[0], p2[1]);
      ctx.stroke();

      if (chiffre && c > 0.55 && across > 30) {
        const pc = put(u, cv);
        ctx.save();
        ctx.translate(pc[0], pc[1]);
        if (!vertical) ctx.rotate(-Math.PI / 2);
        // Police embarquee : le repli du moteur n'a pas les glyphes de
        // l'instrument (voir le @font-face d'app.css).
        ctx.font = '600 10px "SextantSans", "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = `rgba(12,12,14,${(a * 0.92).toFixed(3)})`;
        ctx.fillText(o.label(val), 0, 0);
        ctx.restore();
      }
    }

    // 3. Les joues : le tambour est LOGE dans une fente, il n'est pas pose.
    const edge = vertical
      ? ctx.createLinearGradient(0, 0, 0, h)
      : ctx.createLinearGradient(0, 0, w, 0);
    edge.addColorStop(0, 'rgba(0,0,0,0.85)');
    edge.addColorStop(0.09, 'rgba(0,0,0,0)');
    edge.addColorStop(0.91, 'rgba(0,0,0,0)');
    edge.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = edge;
    ctx.fillRect(0, 0, w, h);

    // 4. Le trait de repere : c'est LUI qu'on lit, il est le seul en ambre.
    const q1 = put(0, 0);
    const q2 = put(0, across);
    ctx.strokeStyle = REPERE;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(q1[0], q1[1]);
    ctx.lineTo(q2[0], q2[1]);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  }

  /**
   * Glisser, molette de souris, fleches au clavier.
   *
   * Les ecouteurs de deplacement sont poses sur la fenetre le temps du
   * glisser seulement : un ecouteur permanent par molette repond a tous les
   * mouvements de souris du panneau, pour rien.
   *
   * De la molette de souris on ne lit que le SENS : l'amplitude de `deltaY`
   * depend de la souris et du systeme, et donnerait une sensibilite
   * differente d'une machine a l'autre. Un cran vaut donc une graduation —
   * un cran qui ne deplace pas le trait suivant n'existe pas.
   */
  attach(onChange) {
    const vertical = this.o.axis === 'y';
    const el = this.canvas;
    let last = 0;

    const move = (ev) => {
      const p = vertical ? ev.clientY : ev.clientX;
      // Vers le haut fait monter la valeur : c'est le sens d'un tambour gradue.
      onChange((p - last) * this.perPixel() * (vertical ? -1 : 1));
      last = p;
      ev.preventDefault();
    };
    const up = () => {
      el.classList.remove('turning');
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    el.addEventListener('mousedown', (ev) => {
      last = vertical ? ev.clientY : ev.clientX;
      el.classList.add('turning');
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
      ev.preventDefault();
    });
    el.addEventListener('wheel', (ev) => {
      onChange(ev.deltaY < 0 ? this.o.tick : -this.o.tick);
      ev.preventDefault();
    }, { passive: false });
    /*
     * LA TOUCHE MAINTENUE FAIT TOURNER LE TAMBOUR, ET C'EST LA SEULE COMMANDE
     * QUI NE DEPENDE PAS DE LA SOURIS.
     *
     * Mesure du 22 aout, en vol : le simulateur cesse de livrer les evenements
     * de souris au panneau pendant jusqu'a 1,8 seconde d'affilee, et la molette
     * n'en fait passer que sept par seconde. Notre chaine, elle, repond en
     * 65 ms — le defaut est dans la livraison, pas chez nous, et rien de ce
     * qu'on ecrira ici ne la reparera.
     *
     * D'ou une commande qui ne recoit qu'UN evenement, celui de l'appui : la
     * rotation est ensuite produite par notre propre boucle, a cadence
     * reguliere, jusqu'au relachement. C'est aussi le geste d'un vrai tambour,
     * qu'on lance et qu'on laisse courir.
     */
    this.onChange = onChange;
    this.held = 0;
    this.heldSince = 0;

    const sens = (k) => {
      if (k === 'ArrowUp' || k === 'ArrowRight') return 1;
      if (k === 'ArrowDown' || k === 'ArrowLeft') return -1;
      return 0;
    };
    el.addEventListener('keydown', (ev) => {
      const d = sens(ev.key);
      if (!d) return;
      ev.preventDefault();
      if (this.held === d) return;      // repetition automatique : on l'ignore
      this.held = d;
      this.heldSince = performance.now();
      // Un cran tout de suite : une pression breve doit valoir un cran net,
      // comme un doigt qui pousse le tambour d'une graduation.
      onChange(d * this.o.tick);
    });
    const lacher = () => { this.held = 0; };
    el.addEventListener('keyup', lacher);
    el.addEventListener('blur', lacher);
  }

  /**
   * Applique la rotation d'une touche maintenue. Appelee par la BOUCLE, avec
   * son pas de temps — la vitesse ne depend donc ni de la cadence de repetition
   * du clavier ni de rien qui vienne du simulateur.
   *
   * Deux regimes : lent au depart pour poser une valeur au cran pres, puis
   * rapide au bout d'une demi-seconde pour traverser le tambour sans attendre.
   * C'est ce que fait la main sur un vrai tambour — on pousse, puis on lance.
   */
  tenir(dt) {
    if (!this.held || !this.onChange) return;
    const tenu = (performance.now() - this.heldSince) / 1000;
    if (tenu < 0.25) return;            // le cran de l'appui suffit d'abord

    // LA VITESSE SE COMPTE EN TOURS DE TAMBOUR, PAS EN CRANS.
    //
    // Un cran ne veut pas la meme chose d'une commande a l'autre : il vaut une
    // minute d'arc sur le tambour fin et cinq degres sur la couronne. A cadence
    // de crans egale, la couronne ferait plus d'un tour par seconde. Rapportee
    // au tour, la loi devient la meme pour les cinq — un demi-tour par seconde
    // lancee, un quinzieme au depart — et chaque commande garde la sensibilite
    // que son diametre et ses unites par tour lui donnent deja a la souris.
    const LENT = 0.06;                  // tours par seconde
    const VITE = 0.5;
    const t = Math.min(1, (tenu - 0.25) / 0.75);
    const tours = (LENT + (VITE - LENT) * t * t) * dt;
    this.onChange(this.held * this.o.perTurn * tours);
  }
}
