/**
 * Le champ de visee, dessine au canvas.
 *
 * Rien n'est lu du ciel du simulateur : un panneau ne peut pas echantillonner
 * la scene 3D, et le ciel de MSFS est une texture sans planetes et incapable de
 * preceser. On dessine donc notre propre ciel depuis notre ephemeride — comme
 * le fait l'instrument reel, qui a sa propre optique et son propre champ.
 *
 * DEUX COUCHES, ET C'EST TOUT LE BUDGET.
 *
 * Ce qui change d'une image a l'autre — le ciel, l'astre, le filtre, la bulle,
 * le reticule — est redessine a chaque fois : une dizaine d'appels. Ce qui ne
 * change jamais — la bague, les poussieres, le voile, le grain, le vignettage —
 * est peint UNE SEULE FOIS dans un canvas hors ecran et recolle d'un
 * `drawImage`. Le champ a beaucoup gagne en matiere sans que le cout par image
 * bouge, ce qui compte dans un panneau pose sur un simulateur qui peine deja.
 *
 * CE QUE LE MOTEUR N'A PAS. Coherent GT s'arrete a WebKit de 2017 : ni
 * `ctx.filter`, ni `getImageData`, ni `ellipse()`, ni degrade conique. Le flou
 * des poussieres est donc de la GEOMETRIE — chaque grain est un degrade radial
 * — le moletage une suite de segments, et le terminateur de la Lune un arc mis
 * a l'echelle. Rien ici n'a besoin d'un post-traitement.
 *
 * Aucune image non plus : tout est dessine. Une texture se fige a une taille
 * alors que le panneau se redimensionne, et elle pesera plus lourd a elle seule
 * que le paquet entier.
 */

import { ouSinon } from './compat.js';

/**
 * Champ de recherche, en degres. C'est celui du periscopique : 15°.
 *
 * Mais 15° etales sur ~420 pixels font 2,1 minutes d'arc par pixel, alors que
 * l'instrument revendique 2 minutes de precision : collimater finement y est
 * physiquement impossible. D'ou un second regime, grossi, pour la collimation
 * — l'equivalent de la lunette deux fois grossissante que l'AFM decrit dans le
 * necessaire du A-10-A, en plus fort.
 */
export const FIELD_SEARCH = 15;

/** Grossissements disponibles et champ correspondant. */
export const MAGNIFICATIONS = [1, 5];

/**
 * Le germe de l'exemplaire : usure de la bague et semis de poussieres.
 *
 * Il est FIXE, et ce fut une decision. On avait envisage de le tirer de
 * `instrumentError`, pour que chaque joueur ait sa constellation de grains
 * comme il a son erreur d'index. Mais en comparant trois tirages on a constate
 * qu'ils ne se valent pas : un germe au hasard livrerait a chacun une allure
 * que personne n'a jamais regardee. Celui-ci a ete choisi a l'oeil.
 */
const INSTRUMENT_SEED = 991;

/**
 * L'etat d'entretien de l'optique.
 *
 * Le nombre de grains fait la MATIERE, leur opacite fait le JUGEMENT — et
 * c'est la seconde qu'on remarque. Soixante grains a 20 % se lisent comme du
 * verre ; quarante a 50 % se lisent comme de la salete. Retenu : 46 grains a
 * 60 %, l'etat d'un instrument servi et entretenu, pas d'un instrument neglige.
 */
/*
 * PAS DE POUSSIERES, ET C'EST DEFINITIF (2026-08-20).
 *
 * Il y en a eu : grains flous, voile de chiffon, fibres, grain d'ensemble. Deux
 * essais dans le simulateur, deux rejets. La raison est meilleure que toutes
 * celles que j'avais avancees pour les regler : DANS UN INSTRUMENT DONT LE
 * TRAVAIL EST DE TROUVER UN POINT LUMINEUX, TOUT CE QUI RESSEMBLE A UN POINT
 * LUMINEUX EST UN DEFAUT. On les prend pour des etoiles. Aucun dosage ne
 * repare ca, parce que le probleme n'est pas l'intensite mais la FORME.
 *
 * Le semis d'etoiles procedural est tombe avec, pour exactement la meme raison,
 * en pire : c'etaient de fausses etoiles qu'on aurait pu essayer de viser.
 *
 * Ne pas les remettre. Ce qui reste — traitement de surface et vignettage —
 * n'a aucune structure ponctuelle : ce sont des degrades doux, on ne peut pas
 * les confondre avec un astre.
 */

/**
 * En dessous de cette hauteur du Soleil, la lampe du reticule s'allume.
 *
 * Un reticule grave sombre se lit tres bien sur un ciel clair et disparait
 * completement sur un ciel noir : c'est pour ca que l'instrument porte un
 * eclairage sous 28 V, et l'AFM precise qu'il ne sert qu'a ca.
 */
const LAMP_SUN_ALTITUDE = -6;

/**
 * Le vide laisse au croisement du reticule, en pixels a l'echelle du champ.
 *
 * A monter si l'astre est encore serre au centre, a descendre si le point de
 * visee devient imprecis. A l'echelle du panneau (facteur 0,74) cinq unites
 * font un vide de sept pixels de large — Polaris en fait quatre.
 */
const RETICLE_GAP = 5;

/** Teintes du ciel par hauteur du Soleil, du plein jour a la nuit noire. */
const SKY_STOPS = [
  { alt: 15, top: [70, 125, 200], bottom: [140, 180, 225] },
  { alt: 0, top: [58, 82, 140], bottom: [225, 150, 95] },
  { alt: -6, top: [22, 34, 72], bottom: [120, 78, 80] },
  { alt: -12, top: [10, 15, 38], bottom: [30, 34, 62] },
  { alt: -18, top: [5, 7, 16], bottom: [8, 11, 24] },
];

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function skyColours(sunAltitude) {
  const a = Math.max(-18, Math.min(15, sunAltitude));
  for (let i = 0; i < SKY_STOPS.length - 1; i += 1) {
    const hi = SKY_STOPS[i];
    const lo = SKY_STOPS[i + 1];
    if (a <= hi.alt && a >= lo.alt) {
      const t = (hi.alt - a) / (hi.alt - lo.alt);
      const mix = (x, y) => Math.round(lerp(x, y, t));
      return {
        top: hi.top.map((c, k) => mix(c, lo.top[k])),
        bottom: hi.bottom.map((c, k) => mix(c, lo.bottom[k])),
      };
    }
  }
  const last = SKY_STOPS[SKY_STOPS.length - 1];
  return { top: last.top, bottom: last.bottom };
}

const rgb = (c) => `rgb(${c[0]},${c[1]},${c[2]})`;

/**
 * Hasard reproductible. Le meme germe rend toujours la meme bague et le meme
 * semis, donc l'instrument est reconnaissable d'une session a l'autre sans
 * qu'on ait rien a conserver.
 */
function mulberry32(a) {
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Teintes des filtres, dans l'ordre de la roue a huit positions du MA-2. */
export const FILTERS = [
  { name: 'None', tint: null, opacity: 0 },
  { name: 'Green', tint: '#0d3a1c', opacity: 0.55 },
  { name: 'Red', tint: '#4a0f0a', opacity: 0.55 },
  { name: 'ND 1', tint: '#000000', opacity: 0.45 },
  { name: 'ND 2', tint: '#000000', opacity: 0.68 },
  { name: 'ND 3', tint: '#000000', opacity: 0.84 },
  { name: 'ND 2 + green', tint: '#062a14', opacity: 0.78 },
  { name: 'ND 3 + red', tint: '#2c0805', opacity: 0.9 },
];

/**
 * Les mers de la face visible, en rayons de disque lunaire, nord en haut.
 *
 * Un degrade seul donne une bouillie grise : chaque mer est donc un noyau
 * franc entoure d'une frange, et les taches se recouvrent.
 */
const MARIA = [
  [-0.34, -0.32, 0.30], // Imbrium
  [-0.55, 0.04, 0.28], // Procellarum
  [0.02, -0.31, 0.19], // Serenitatis
  [0.24, -0.13, 0.19], // Tranquillitatis
  [0.42, 0.07, 0.15], // Fecunditatis
  [-0.20, 0.33, 0.20], // Nubium
  [-0.46, 0.30, 0.13], // Humorum
  [0.53, -0.29, 0.10], // Crisium
];

export class Viewport {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    /** La couche optique figee, et la cle qui dit quand la refaire. */
    this.bake = null;
    this.bakeKey = '';
    /** Signature de la derniere image peinte : voir `signature`. */
    this.lastSig = null;
  }

  /**
   * @param {object} v
   * @param {number} v.sunAltitude   hauteur du Soleil, pour la couleur du ciel
   * @param {number} v.offsetXDeg    ecart en azimut entre l'astre et le reticule
   * @param {number} v.offsetYDeg    ecart en hauteur entre l'astre et le reticule
   * @param {string} v.kind          'sun' | 'moon' | 'star' | 'planet'
   * @param {number} v.magnitude
   * @param {number} v.semiDiameter  demi-diametre apparent, en degres
   * @param {number} v.bubbleXDeg    debattement de la bulle
   * @param {number} v.bubbleYDeg
   * @param {number} v.bubbleSizeDeg diametre de la bulle
   * @param {number} v.filter        index dans FILTERS
   * @param {number} v.bearingDeg    azimut VRAI affiche sur la couronne. C'est
   *                                 lui qui est grave en bas du champ : la
   *                                 couronne ne suit plus le nez de l'appareil,
   *                                 donc le cap n'entre plus dans le dessin.
   * @param {boolean} v.shutter      volet tombe : la visee est finie
   * @param {boolean} v.inCloud
   */
  /**
   * Signature de ce qui est VISIBLE, quantifiee au pixel.
   *
   * Deux images qui rendraient les memes pixels ont la meme signature, et la
   * seconde n'est pas peinte. C'est ce qui coute : le champ est le grand canvas
   * du panneau, et chaque repeinture est une texture que le simulateur doit
   * recharger. En vol l'astre derive, mais de fractions de pixel entre deux
   * images a 20 par seconde — on ne repeint que lorsque ca se verrait.
   *
   * Les valeurs continues sont arrondies EN PIXELS, pas en degres : c'est la
   * seule unite dans laquelle « ca ne se verrait pas » veut dire quelque chose,
   * et elle suit donc le grossissement sans qu'on ait a s'en occuper.
   */
  static signature(v, w, h, dpr, pxPerDeg) {
    const px = (deg) => Math.round((deg || 0) * pxPerDeg);
    return [
      w, h, Math.round(dpr * 100), Math.round((v.fieldDeg || 0) * 100),
      px(v.offsetXDeg), px(v.offsetYDeg),
      px(v.bubbleXDeg), px(v.bubbleYDeg), px(v.bubbleSizeDeg),
      px(v.semiDiameter),
      v.kind, v.filter, v.shutter ? 1 : 0, v.inCloud ? 1 : 0,
      Math.round((v.sunAltitude || 0) * 20),
      Math.round((v.magnitude || 0) * 10),
      Math.round((v.illuminated || 0) * 200),
      Math.round((v.limbAngle || 0) * 2),
      // Le cap ne figure plus ici : plus rien dans le champ n'en depend, et il
      // changeait a chaque degre de lacet — donc il forcait une repeinture
      // complete du grand canvas pour une image identique.
      Math.round((v.bearingDeg || 0) * 4),
    ].join(',');
  }

  draw(v) {
    const { canvas, ctx } = this;
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    // PLAFOND A 2, comme les molettes et les commandes peintes. Sans lui, un
    // ecran a forte densite quadruple le nombre de pixels du champ — donc la
    // texture que le simulateur recharge a chaque repeinture — pour un gain
    // invisible sur un dessin qui n'a ni texte fin ni trait sous le pixel.
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      this.lastSig = null;      // le canvas a ete efface par le redimensionnement
    }
    const m = metrics(w, h);
    /** Echelle : le diametre du champ vaut `fieldDeg` degres. */
    const fieldDeg = v.fieldDeg || FIELD_SEARCH;
    const pxPerDeg = (m.radius * 2) / fieldDeg;

    // RIEN N'A BOUGE D'UN PIXEL : on ne repeint pas. C'est la seule facon de
    // rendre le panneau bon marche pour le simulateur, qui doit recharger la
    // texture du champ a chaque repeinture — et cela se voyait jusque dans le
    // deplacement de la fenetre du panneau.
    const sig = Viewport.signature(v, w, h, dpr, pxPerDeg);
    if (sig === this.lastSig) return false;
    this.lastSig = sig;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    // Tout ce qui a une taille en pixels — grains, graduations, gravure — est
    // rapporte a cette echelle, pour que le panneau reste juste a n'importe
    // quelle taille de fenetre.
    const s = Math.max(0.45, w / 460);
    const lamp = v.sunAltitude < LAMP_SUN_ALTITUDE;

    ctx.save();
    ctx.beginPath();
    ctx.arc(m.cx, m.cy, m.radius, 0, Math.PI * 2);
    ctx.clip();

    this.drawSky(ctx, w, h, v.sunAltitude);
    if (v.inCloud) {
      this.drawCloud(ctx, w, h);
    } else {
      const inField = Math.hypot(v.offsetXDeg, v.offsetYDeg) < fieldDeg / 2;
      if (inField) this.drawBody(ctx, m, pxPerDeg, s, v);
      // Au grossissement fort le champ ne fait que 3° : sans reperage on
      // cherche l'astre a l'aveugle. On indique de quel cote il se trouve.
      else if (Math.abs(v.offsetXDeg) < 90) this.drawOffField(ctx, m, v);
    }
    this.drawFilter(ctx, w, h, v.filter);
    this.drawBubble(ctx, m, pxPerDeg, v);
    this.drawReticle(ctx, m, fieldDeg, s, lamp, v);
    if (v.shutter) this.drawShutter(ctx, w, h);
    ctx.restore();

    this.ensureBake(w, h, dpr, m, s);
    ctx.drawImage(this.bake, 0, 0, w, h);
    return true;
  }

  // ------------------------------------------------------------------ //
  // La couche qui change : ciel, astre, filtre, bulle, reticule.
  // ------------------------------------------------------------------ //

  drawSky(ctx, w, h, sunAltitude) {
    const c = skyColours(sunAltitude);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, rgb(c.top));
    g.addColorStop(1, rgb(c.bottom));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  drawCloud(ctx, w, h) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#8b9099');
    g.addColorStop(1, '#6f747c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  drawBody(ctx, m, pxPerDeg, s, v) {
    const x = m.cx + v.offsetXDeg * pxPerDeg;
    // L'ecran descend quand la hauteur monte.
    const y = m.cy - v.offsetYDeg * pxPerDeg;

    if (v.kind === 'star' || v.kind === 'planet') {
      // Ni une etoile ni une planete n'ont de diametre exploitable : la
      // premiere est une tache de diffraction, la seconde ne depasse pas la
      // minute d'arc. On les vise a l'eclat, pas au limbe — et c'est la
      // magnitude qui donne la taille du point. Venus, a -4, fait une belle
      // tache ; Saturne, a +0,7, un point discret.
      const r = Math.max(1.5, 5 - ouSinon(v.magnitude, 1) * 1.1) * s;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
      glow.addColorStop(0, 'rgba(255,255,255,0.95)');
      glow.addColorStop(0.25, 'rgba(255,255,255,0.35)');
      glow.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, r * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    // Soleil et Lune ont un vrai disque : on le dessine a son diametre reel,
    // ce qui donne l'echelle du champ et sert de reference a la taille de bulle.
    const r = Math.max(3, ouSinon(v.semiDiameter, 0.26) * pxPerDeg);
    if (v.kind === 'sun') {
      this.drawGhosts(ctx, m, x, y, r);
      const glow = ctx.createRadialGradient(x, y, r * 0.6, x, y, r * 5);
      glow.addColorStop(0, 'rgba(255,248,220,0.9)');
      glow.addColorStop(1, 'rgba(255,240,200,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, r * 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fffdf3';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      return;
    }

    this.drawMoon(x, y, r, v);
  }

  /**
   * Les fantomes de l'objectif.
   *
   * Ils naissent des reflexions entre les faces des lentilles, donc ils se
   * rangent sur la droite qui joint l'astre au CENTRE du champ, de l'autre
   * cote. Consequence a garder en tete avant de les croire absents : Soleil
   * collimate, ils s'empilent au centre sous le disque et n'existent pas.
   * Ils n'apparaissent qu'en recherche, hors d'axe — ce qui est exactement le
   * comportement d'un vrai objectif.
   */
  drawGhosts(ctx, m, x, y, r) {
    const dx = x - m.cx;
    const dy = y - m.cy;
    const off = Math.hypot(dx, dy) / m.radius;
    if (off < 0.06) return;
    const k = Math.min(1, off / 0.35);
    const ghosts = [
      { t: -0.55, size: 0.75, a: 0.20, c: '190,220,255' },
      { t: -0.95, size: 1.25, a: 0.15, c: '255,215,170' },
      { t: -1.45, size: 0.55, a: 0.18, c: '180,255,215' },
    ];
    for (let i = 0; i < ghosts.length; i += 1) {
      const g = ghosts[i];
      const gx = m.cx + dx * g.t;
      const gy = m.cy + dy * g.t;
      const gr = r * 3.4 * g.size;
      const a = (g.a * k).toFixed(3);
      const grad = ctx.createRadialGradient(gx, gy, gr * 0.42, gx, gy, gr);
      grad.addColorStop(0, `rgba(${g.c},${(g.a * k * 0.22).toFixed(3)})`);
      grad.addColorStop(0.80, `rgba(${g.c},${a})`);
      grad.addColorStop(0.94, `rgba(${g.c},${a})`);
      grad.addColorStop(1, `rgba(${g.c},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(gx, gy, gr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * La Lune, avec sa phase et son ORIENTATION.
   *
   * Le croissant ne suffit pas : il faut le tourner. Le meme quartier ne se
   * presente pas sous le meme angle au lever et au coucher, et c'est
   * exactement ce qu'une vignette figee ne peut pas rendre. L'angle vient du
   * noyau, deja ramene dans le repere de l'oculaire — angle de position du
   * limbe eclaire moins angle parallactique — et un test verifie qu'il pointe
   * bien vers le Soleil, ou qu'il soit sous l'horizon.
   *
   * `limbAngle` se compte depuis le HAUT du champ, vers la gauche. On tourne
   * donc le pinceau pour amener ce limbe vers la droite, ou le dessin est
   * simple : un demi-disque, puis le terminateur.
   *
   * Le terminateur est une DEMI-ELLIPSE, jamais un arc de cercle : c'est la
   * projection d'un grand cercle vu de biais. Son demi-axe vaut r(2k-1), donc
   * il se creuse d'un cote avant le premier quartier et de l'autre apres. On
   * l'obtient par un `scale` anisotrope plutot que par `ellipse()`, dont on ne
   * veut pas dependre dans un moteur de 2017.
   */
  drawMoon(x, y, r, v) {
    const ctx = this.ctx;
    const k = Math.max(0, Math.min(1, ouSinon(v.illuminated, 1)));
    const theta = (ouSinon(v.limbAngle, 0) * Math.PI) / 180;
    const rot = Math.atan2(-Math.cos(theta), -Math.sin(theta));

    ctx.save();
    ctx.translate(x, y);
    // Amener le limbe eclaire sur +X. Le vecteur du limbe vaut
    // (-sin, -cos) en coordonnees canvas, l'ordonnee y allant vers le bas.
    ctx.rotate(rot);

    // La part sombre reste visible : c'est la lumiere cendree, le clair de
    // Terre. Sans elle, un croissant flotte sans disque et l'oeil ne sait plus
    // ou est le centre — or c'est le centre qu'on colle sur la bulle.
    ctx.fillStyle = '#20222a';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    if (k > 0.002) {
      const demiAxe = Math.abs(r * (2 * k - 1));
      // Le contour de la part eclairee, redessine a l'identique pour servir
      // ensuite de fenetre aux mers : elles n'ont rien a faire sur la lumiere
      // cendree, ou elles ne feraient que salir un disque deja sombre.
      const lit = () => {
        ctx.beginPath();
        // Le demi-disque eclaire, du haut vers le bas en passant par la droite.
        ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);
        // Le terminateur, qui referme la figure du bas vers le haut.
        ctx.save();
        ctx.scale(Math.max(demiAxe, 0.001) / r, 1);
        ctx.arc(0, 0, r, Math.PI / 2, -Math.PI / 2, k < 0.5);
        ctx.restore();
        ctx.closePath();
      };
      ctx.fillStyle = '#e9e6dc';
      lit();
      ctx.fill();

      // Le seuil compte : a ×1 la Lune fait 0,5° dans un champ de 15°, donc
      // sept pixels. En dessous de quatre il n'y a plus rien a montrer, et
      // au-dessus de huit on avait failli tout rater pour un seuil trop haut.
      if (r > 4) {
        ctx.save();
        lit();
        ctx.clip();
        // Les mers appartiennent a la Lune, pas au terminateur : on annule la
        // rotation de phase, sinon la carte tournerait avec le croissant.
        ctx.rotate(-rot);
        for (let i = 0; i < MARIA.length; i += 1) {
          const mx = MARIA[i][0] * r;
          const my = MARIA[i][1] * r;
          const mr = MARIA[i][2] * r;
          const gm = ctx.createRadialGradient(mx, my, mr * 0.35, mx, my, mr);
          gm.addColorStop(0, 'rgba(118,120,128,0.72)');
          gm.addColorStop(0.55, 'rgba(118,120,128,0.52)');
          gm.addColorStop(1, 'rgba(118,120,128,0)');
          ctx.fillStyle = gm;
          ctx.beginPath();
          ctx.arc(mx, my, mr, 0, Math.PI * 2);
          ctx.fill();
        }
        // Assombrissement du limbe : le bord d'un disque eclaire de face
        // retombe toujours, et c'est lui qui fait « sphere » plutot que
        // « pastille ».
        const lb = ctx.createRadialGradient(0, 0, r * 0.62, 0, 0, r);
        lb.addColorStop(0, 'rgba(60,58,54,0)');
        lb.addColorStop(1, 'rgba(60,58,54,0.30)');
        ctx.fillStyle = lb;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    // Un lisere sombre sur tout le pourtour : le disque garde son bord meme
    // quand la part eclairee est mince.
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  /**
   * Astre hors champ : une fleche sur le bord, dans sa direction, dont la
   * taille dit s'il est loin. Ce n'est pas dans l'instrument reel — mais dans
   * l'instrument reel on tourne la tete, ce qu'un panneau ne permet pas.
   */
  drawOffField(ctx, m, v) {
    const ang = Math.atan2(-v.offsetYDeg, v.offsetXDeg);
    const r = m.radius * 0.9;
    const x = m.cx + Math.cos(ang) * r;
    const y = m.cy + Math.sin(ang) * r;
    const dist = Math.hypot(v.offsetXDeg, v.offsetYDeg);
    const size = Math.max(4, 11 - dist * 0.6);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.fillStyle = 'rgba(216,162,74,0.75)';
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.7, size * 0.6);
    ctx.lineTo(-size * 0.7, -size * 0.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawFilter(ctx, w, h, index) {
    const f = ouSinon(FILTERS[index], FILTERS[0]);
    if (!f.tint || !f.opacity) return;
    ctx.save();
    ctx.globalAlpha = f.opacity;
    ctx.fillStyle = f.tint;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  /**
   * La bulle.
   *
   * En ANNEAU : on collimate l'astre par son CENTRE, pas a cote. C'est ce que
   * dit l'AFM du periscopique, et ca change la gestuelle. Le reste — ombre
   * portee, menisque, reflet speculaire et rebond froid — n'est pas de
   * l'ornement : c'est ce qui la fait lire comme un volume dans un liquide
   * plutot que comme un cercle trace.
   */
  drawBubble(ctx, m, pxPerDeg, v) {
    const x = m.cx + ouSinon(v.bubbleXDeg, 0) * pxPerDeg;
    const y = m.cy - ouSinon(v.bubbleYDeg, 0) * pxPerDeg;
    const r = (ouSinon(v.bubbleSizeDeg, 0.8) / 2) * pxPerDeg;

    ctx.save();
    const sx = x + r * 0.18;
    const sy = y + r * 0.22;
    const sh = ctx.createRadialGradient(sx, sy, r * 0.6, sx, sy, r * 1.5);
    sh.addColorStop(0, 'rgba(0,0,0,0.28)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.arc(sx, sy, r * 1.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(16,20,26,0.80)';
    ctx.lineWidth = Math.max(1.5, r * 0.26);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(150,165,185,0.22)';
    ctx.lineWidth = Math.max(0.7, r * 0.07);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.86, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,255,255,0.72)';
    ctx.lineWidth = Math.max(0.9, r * 0.13);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.95, Math.PI * 1.10, Math.PI * 1.42);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(170,200,230,0.20)';
    ctx.lineWidth = Math.max(0.7, r * 0.09);
    ctx.beginPath();
    ctx.arc(x, y, r * 0.95, Math.PI * 0.22, Math.PI * 0.52);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Le reticule, grave dans le verre.
   *
   * Un trait gravé a DEUX bords, un clair et un sombre decales d'un demi-pixel.
   * C'est tout ce qui separe « entaille dans le verre » de « ligne noire », et
   * ca ne coute qu'un second passage.
   */
  drawReticle(ctx, m, fieldDeg, s, lamp, v) {
    const { cx, cy, radius: R } = m;
    const etched = lamp ? 'rgba(228,120,86,0.92)' : 'rgba(12,15,19,0.72)';
    const shine = lamp ? 'rgba(255,190,150,0.40)' : 'rgba(255,255,255,0.20)';

    ctx.save();

    /**
     * Le CROISEMENT EST OUVERT, et c'est ce qui compte.
     *
     * Une croix pleine masque exactement ce qu'on essaie d'y poser : a l'ecran
     * du panneau, Polaris fait quatre pixels de diametre et le trait en faisait
     * presque autant. Un reticule d'instrument laisse un vide au centre pour
     * cette raison precise — c'est la reference qui doit encadrer l'astre, pas
     * le recouvrir. La reference fine reste donnee par les premieres
     * graduations et par l'anneau de la bulle.
     */
    const gap = RETICLE_GAP * s;
    const croix = (color, dx, dy, lw) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.moveTo(cx - R, cy + dy);
      ctx.lineTo(cx - gap, cy + dy);
      ctx.moveTo(cx + gap, cy + dy);
      ctx.lineTo(cx + R, cy + dy);
      ctx.moveTo(cx + dx, cy - R);
      ctx.lineTo(cx + dx, cy - gap);
      ctx.moveTo(cx + dx, cy + gap);
      ctx.lineTo(cx + dx, cy + R);
      ctx.stroke();
    };

    if (lamp) {
      // Le halo de la lampe : 28 V, et l'AFM precise qu'elle n'eclaire que le
      // reticule. Un souffle rouge, pas un projecteur — et le rouge parce que
      // c'est lui qui preserve l'adaptation a l'obscurite. Il faisait 5 fois
      // l'echelle, soit pres de quatre pixels : c'etait LUI l'epaisseur qu'on
      // voyait, plus que les traits eux-memes.
      croix('rgba(200,70,45,0.10)', 0, 0, 2.0 * s);
    }

    // Traits fins, sous le pixel : le moteur les rend alors en un pixel
    // attenue, ce qui est exactement l'effet cherche. Le second trait, decale
    // d'un demi-pixel, donne le bord clair de la gravure sans elargir.
    croix(shine, 0.5 * s, 0.5 * s, Math.max(0.4, 0.45 * s));
    croix(etched, 0, 0, Math.max(0.6, 0.70 * s));

    // Graduations : le pas suit le champ, pour que l'oeil ait toujours la meme
    // densite de reperes qu'on cherche a 15° ou qu'on collimate a 3°.
    const pxPerDeg = (R * 2) / fieldDeg;
    const step = fieldDeg > 8 ? 1 : 0.25;
    const big = fieldDeg > 8 ? 5 : 1;
    ctx.strokeStyle = etched;
    ctx.lineWidth = Math.max(0.6, 0.75 * s);
    for (let d = step; d * pxPerDeg < R; d += step) {
      const isBig = Math.abs(d / big - Math.round(d / big)) < 1e-6;
      const L = (isBig ? 9 : 5) * s;
      const p = d * pxPerDeg;
      ctx.beginPath();
      ctx.moveTo(cx + p, cy - L);
      ctx.lineTo(cx + p, cy + L);
      ctx.moveTo(cx - p, cy - L);
      ctx.lineTo(cx - p, cy + L);
      ctx.moveTo(cx - L, cy + p);
      ctx.lineTo(cx + L, cy + p);
      ctx.moveTo(cx - L, cy - p);
      ctx.lineTo(cx + L, cy - p);
      ctx.stroke();
    }

    this.drawAzimuthScale(ctx, m, s, etched, shine, v);
    ctx.restore();
  }

  /**
   * L'echelle d'azimut vrai, en bas du champ.
   *
   * ELLE MONTRE OU L'ON VISE, PAS OU L'ON VA — l'azimut vrai de la ligne de
   * visee. Elle ne fait donc que suivre la couronne, qui est calee sur ce meme
   * repere depuis qu'elle a cesse de suivre le nez de l'appareil.
   *
   * Premiere version fausse : je l'avais centree sur le seul CAP VRAI. Elle ne
   * bougeait alors jamais quand on tournait la couronne, et au sol elle etait
   * parfaitement figee. Elle ne faisait que repeter le compas, ce qui n'a
   * aucun interet dans le champ d'un sextant.
   *
   * C'est aussi l'astrocompas : vise le Soleil, lis son azimut sous le
   * reticule, et tu as ton cap vrai sans aucun compas.
   *
   * Reserve honnete : je n'ai pas pu verifier sur quel repere l'echelle du
   * MIL-S-5807A est reellement gravee.
   */
  drawAzimuthScale(ctx, m, s, etched, shine, v) {
    // La couronne EST l'azimut vrai depuis qu'elle ne suit plus le nez de
    // l'appareil : l'echelle n'a plus rien a composer, et elle cesse par la
    // meme occasion de se repeindre a chaque degre de lacet.
    const heading = (((ouSinon(v.bearingDeg, 0)) % 360) + 360) % 360;
    const { cx, cy, radius: R } = m;
    const yBase = cy + R * 0.74;
    const halfW = R * 0.80;
    const degPerPx = 60 / (halfW * 2); // 60° etales sur la largeur utile

    ctx.save();
    // Le bandeau sur lequel l'echelle est gravee : un depoli tres leger, qui
    // detache les chiffres d'un ciel clair sans faire de bandeau opaque.
    const band = ctx.createLinearGradient(0, yBase - 15 * s, 0, yBase + 17 * s);
    band.addColorStop(0, 'rgba(10,12,16,0)');
    band.addColorStop(0.5, 'rgba(10,12,16,0.26)');
    band.addColorStop(1, 'rgba(10,12,16,0)');
    ctx.fillStyle = band;
    ctx.fillRect(cx - R, yBase - 15 * s, R * 2, 32 * s);

    ctx.strokeStyle = etched;
    ctx.fillStyle = etched;
    ctx.lineWidth = Math.max(1, 1.2 * s);
    ctx.textAlign = 'center';
    // Meme police embarquee que le reste du panneau : le repli du moteur n'a
    // pas les glyphes dont l'instrument se sert (voir le @font-face d'app.css).
    ctx.font = `600 ${(11 * s).toFixed(1)}px "SextantSans", "Segoe UI", Arial, sans-serif`;

    const first = Math.ceil((heading - 30) / 5) * 5;
    for (let a = first; a <= heading + 30; a += 5) {
      const x = cx + (a - heading) / degPerPx;
      if (Math.abs(x - cx) > halfW) continue;
      const isTen = ((a % 10) + 10) % 10 === 0;
      const L = (isTen ? 8 : 4.5) * s;
      ctx.beginPath();
      ctx.moveTo(x, yBase - L);
      ctx.lineTo(x, yBase + L);
      ctx.stroke();
      if (isTen) {
        // Comme une rose de compas : on grave les dizaines, 24 pour 240.
        const tens = (((a % 360) + 360) % 360) / 10;
        ctx.fillText((tens < 10 ? '0' : '') + tens, x, yBase + 19 * s);
      }
    }

    // Le repere fixe : c'est le reticule vertical qu'on lit, on le rappelle.
    ctx.strokeStyle = shine;
    ctx.lineWidth = Math.max(1, 1.6 * s);
    ctx.beginPath();
    ctx.moveTo(cx, yBase - 13 * s);
    ctx.lineTo(cx, yBase + 13 * s);
    ctx.stroke();
    ctx.restore();
  }

  drawShutter(ctx, w, h) {
    ctx.fillStyle = 'rgba(8,9,11,0.93)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(210,210,205,0.85)';
    ctx.font = '600 13px "SextantSans", "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('VOLET', w / 2, h / 2);
  }

  // ------------------------------------------------------------------ //
  // La couche figee : traitement, vignettage, poussieres, grain, bague.
  // ------------------------------------------------------------------ //

  /**
   * Peint la couche optique si elle manque ou si la fenetre a change de taille.
   * C'est le seul endroit ou le cout est eleve, et il n'est paye qu'au
   * redimensionnement.
   */
  ensureBake(w, h, dpr, m, s) {
    const key = `${Math.round(w)}x${Math.round(h)}@${dpr}`;
    if (this.bake && this.bakeKey === key) return;

    const c = document.createElement('canvas');
    c.width = Math.round(w * dpr);
    c.height = Math.round(h * dpr);
    const ctx = c.getContext('2d');
    // On peint dans les memes unites que le reste, la mise a l'echelle du
    // canvas etant faite par la transformation.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.save();
    ctx.beginPath();
    ctx.arc(m.cx, m.cy, m.radius, 0, Math.PI * 2);
    ctx.clip();
    this.paintCoating(ctx, m);
    this.paintVignette(ctx, m);
    ctx.restore();

    this.paintBezel(ctx, m, s);

    this.bake = c;
    this.bakeKey = key;
  }

  /**
   * Le traitement de surface : un souffle violine au bord, comme toute lentille
   * traitee vue de biais. Tres faible — au-dela on croit a un defaut d'affichage.
   */
  paintCoating(ctx, m) {
    const g = ctx.createRadialGradient(m.cx, m.cy, m.radius * 0.62, m.cx, m.cy, m.radius);
    g.addColorStop(0, 'rgba(96,120,210,0)');
    g.addColorStop(0.78, 'rgba(96,120,210,0.05)');
    g.addColorStop(1, 'rgba(150,110,190,0.10)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(m.cx, m.cy, m.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Le vignettage, en loi de puissance plutot qu'en rampe : l'assombrissement
   * reste nul longtemps puis tombe vite, ce que fait vraiment un objectif.
   */
  paintVignette(ctx, m) {
    const g = ctx.createRadialGradient(m.cx, m.cy, 0, m.cx, m.cy, m.radius);
    const stops = [0, 0.35, 0.55, 0.72, 0.85, 0.94, 1];
    for (let i = 0; i < stops.length; i += 1) {
      const t = stops[i];
      g.addColorStop(t, `rgba(0,0,0,${(Math.pow(t, 3.1) * 0.80).toFixed(3)})`);
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(m.cx, m.cy, m.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  /** Grain d'ensemble : de tres petits points, faute de `getImageData`. */
  /**
   * La bague d'oculaire.
   *
   * L'illusion de metal ne tient PAS a un degrade lineaire : sur un anneau, la
   * lumiere depend de l'angle et pas de la position, et c'est pourquoi une
   * bague peinte « a plat » ne ressemble a rien. Elle est donc peinte en
   * secteurs, avec une lumiere cle en haut a gauche et un rebond froid a
   * l'oppose — sans le second, l'anneau reste plat.
   *
   * L'USURE PILOTE, elle ne se pose pas par-dessus. Trois zones tirees du
   * germe, et dans ces zones les dents du moletage s'EMOUSSENT au lieu de
   * s'eclaircir. La premiere version peignait un badigeon clair a 11 % sur un
   * anneau dont la luminance varie deja de 30 a 148 : invisible, et faux.
   */
  paintBezel(ctx, m, s) {
    const { cx, cy, radius: R, outer: O } = m;
    const W = O - R;
    const LIGHT = Math.PI * 1.22; // haut-gauche
    const TAU = Math.PI * 2;

    ctx.save();

    // 1. La levre de caoutchouc, entre le verre et le metal. C'est elle qui
    //    donne la profondeur : le champ est AU FOND de quelque chose.
    const lipW = W * 0.34;
    const lip = ctx.createRadialGradient(cx, cy, R, cx, cy, R + lipW);
    lip.addColorStop(0, 'rgba(8,8,9,1)');
    lip.addColorStop(1, 'rgba(34,33,32,1)');
    ctx.strokeStyle = lip;
    ctx.lineWidth = lipW;
    ctx.beginPath();
    ctx.arc(cx, cy, R + lipW / 2, 0, TAU);
    ctx.stroke();

    const rIn = R + lipW;
    const rOut = O;
    const mid = (rIn + rOut) / 2;
    const bw = rOut - rIn;

    // 2. Les zones d'usure, tirees du germe de l'exemplaire.
    const wr = mulberry32(INSTRUMENT_SEED ^ 0x9e37);
    const zones = [];
    for (let z = 0; z < 3; z += 1) {
      zones.push({ c: wr() * TAU, half: 0.16 + wr() * 0.26, depth: 0.55 + wr() * 0.45 });
    }
    const delta = (a, b) => {
      let d = (a - b) % TAU;
      if (d > Math.PI) d -= TAU;
      if (d < -Math.PI) d += TAU;
      return d;
    };
    const wearAt = (a) => {
      let w = 0;
      for (let i = 0; i < zones.length; i += 1) {
        const dd = Math.abs(delta(a, zones[i].c));
        if (dd < zones[i].half) {
          w = Math.max(w, Math.pow(1 - dd / zones[i].half, 0.65) * zones[i].depth);
        }
      }
      return w;
    };

    // 3. Le corps metallique, en secteurs. Le poli d'usure rend le metal plus
    //    SPECULAIRE : son reflet monte plus haut, et il perd la pointe de bleu
    //    du satine neuf.
    const SEG = 200;
    for (let i = 0; i < SEG; i += 1) {
      const a0 = (i / SEG) * TAU;
      const a1 = ((i + 1.02) / SEG) * TAU;
      const ang = (a0 + a1) / 2;
      const d = Math.cos(ang - LIGHT); // 1 face a la lumiere, -1 a l'ombre
      const key = Math.pow(Math.max(0, d), 2.2);
      const bounce = Math.pow(Math.max(0, -d), 3.0);
      const wear = wearAt(ang);
      const lum = 30 + key * (118 + wear * 52) + bounce * 34 + wear * 8;
      const r = Math.min(255, Math.round(lum * 1.02));
      const g = Math.min(255, Math.round(lum * 1.04));
      const b = Math.min(255, Math.round(lum * (1.12 - wear * 0.11)));
      ctx.strokeStyle = `rgb(${r},${g},${b})`;
      ctx.lineWidth = bw;
      ctx.beginPath();
      ctx.arc(cx, cy, mid, a0, a1);
      ctx.stroke();
    }

    // 4. Le moletage : une facette claire, une sombre, et un contraste qui
    //    s'effondre la ou la bague est usee.
    const TEETH = 168;
    for (let t = 0; t < TEETH; t += 1) {
      const a = (t / TEETH) * TAU;
      const d2 = Math.cos(a - LIGHT);
      const amp = (0.16 + 0.5 * Math.max(0, d2) + 0.12 * Math.max(0, -d2)) * (1 - 0.80 * wearAt(a));
      const c0 = Math.cos(a);
      const s0 = Math.sin(a);
      const off = (TAU / TEETH) * 0.30;
      const ca = Math.cos(a + off);
      const sa = Math.sin(a + off);
      const r1 = rIn + bw * 0.14;
      const r2 = rOut - bw * 0.14;

      ctx.lineWidth = Math.max(0.7, bw * 0.10);
      ctx.strokeStyle = `rgba(255,252,246,${(amp * 0.55).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(cx + c0 * r1, cy + s0 * r1);
      ctx.lineTo(cx + c0 * r2, cy + s0 * r2);
      ctx.stroke();
      ctx.strokeStyle = `rgba(0,0,0,${(amp * 0.42 + 0.10).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(cx + ca * r1, cy + sa * r1);
      ctx.lineTo(cx + ca * r2, cy + sa * r2);
      ctx.stroke();
    }

    const br = mulberry32(INSTRUMENT_SEED ^ 0x2b1d);

    // 5. L'anodisation partie sur les aretes : l'aluminium nu perce, plus
    //    chaud et plus clair. Sur un instrument noir c'est le signe d'usure le
    //    plus lisible.
    for (let e = 0; e < 30; e += 1) {
      const ea = br() * TAU;
      const w5 = wearAt(ea);
      if (br() > 0.22 + w5 * 0.72) continue;
      const span = 0.02 + br() * 0.07;
      const r5 = br() < 0.55 ? rOut - bw * 0.10 : rIn + bw * 0.10;
      ctx.strokeStyle = `rgba(234,224,202,${(0.11 + w5 * 0.30).toFixed(3)})`;
      ctx.lineWidth = Math.max(1, bw * 0.13);
      ctx.beginPath();
      ctx.arc(cx, cy, r5, ea, ea + span);
      ctx.stroke();
    }

    // 6. Les rayures : claires si elles accrochent la lumiere, sombres sinon.
    //    Une rayure n'a pas de couleur propre, seulement une orientation —
    //    c'est ce qui la distingue d'un trait dessine.
    for (let k = 0; k < 16; k += 1) {
      const ka = br() * TAU;
      const kr = rIn + bw * (0.18 + br() * 0.64);
      const kspan = 0.03 + br() * 0.14;
      ctx.strokeStyle = Math.cos(ka - LIGHT) > 0 ? 'rgba(255,252,244,0.17)' : 'rgba(0,0,0,0.26)';
      ctx.lineWidth = Math.max(0.6, bw * 0.045);
      ctx.beginPath();
      ctx.arc(cx, cy, kr, ka, ka + kspan);
      ctx.stroke();
    }

    // 7. Les chocs : un creux sombre, et un croissant clair du cote OPPOSE a
    //    la lumiere, puisque c'est le fond du creux qui est eclaire. Sans ce
    //    croissant on lit une tache et pas un choc.
    for (let p = 0; p < 5; p += 1) {
      const pa = br() * TAU;
      const pr = rIn + bw * (0.22 + br() * 0.56);
      const px = cx + Math.cos(pa) * pr;
      const py = cy + Math.sin(pa) * pr;
      const psz = Math.max(1.1, bw * (0.07 + br() * 0.07));
      ctx.fillStyle = 'rgba(0,0,0,0.48)';
      ctx.beginPath();
      ctx.arc(px, py, psz, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,250,240,0.32)';
      ctx.beginPath();
      ctx.arc(px - Math.cos(LIGHT) * psz * 0.55, py - Math.sin(LIGHT) * psz * 0.55, psz * 0.48, 0, TAU);
      ctx.fill();
    }

    // 8. Le cambouis au fond des creux, en bas : la crasse tombe et s'y tient.
    //    Sans elle le bas est aussi propre que le haut, ce qui n'arrive sur
    //    aucun objet manipule.
    const gr = ctx.createLinearGradient(0, cy, 0, cy + rOut);
    gr.addColorStop(0, 'rgba(18,14,10,0)');
    gr.addColorStop(1, 'rgba(18,14,10,0.32)');
    ctx.strokeStyle = gr;
    ctx.lineWidth = bw;
    ctx.beginPath();
    ctx.arc(cx, cy, mid, 0.12 * Math.PI, 0.88 * Math.PI);
    ctx.stroke();

    // 9. Les aretes. Sans elles la bague flotte entre le champ et le fond.
    ctx.lineWidth = Math.max(1, 1.2 * s);
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    ctx.arc(cx, cy, rOut - ctx.lineWidth, Math.PI * 0.95, Math.PI * 1.60);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.beginPath();
    ctx.arc(cx, cy, rOut - ctx.lineWidth * 0.5, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.95)';
    ctx.beginPath();
    ctx.arc(cx, cy, R + 0.5, 0, TAU);
    ctx.stroke();

    // 10. La gravure. Elle coute deux lignes et c'est elle qui date l'objet.
    this.engrave(ctx, cx, cy, mid, 'KOLLSMAN', Math.PI * 1.5, 1, s, bw);
    this.engrave(ctx, cx, cy, mid, 'TYPE MA-2', Math.PI * 0.5, -1, s, bw);

    ctx.restore();
  }

  /**
   * Texte suivant l'arc, grave : un trait clair decale sous un trait sombre.
   * En dessous de quatre pixels de corps on n'ecrit rien — une gravure
   * illisible fait sale, pas ancien.
   */
  engrave(ctx, cx, cy, r, text, centre, dir, s, bw) {
    const size = Math.min(bw * 0.46, 13 * s);
    if (size < 4) return;
    ctx.save();
    ctx.font = `600 ${size.toFixed(1)}px "SextantSans", "Segoe UI", Arial, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const widths = [];
    let total = 0;
    for (let i = 0; i < text.length; i += 1) {
      const w = ctx.measureText(text[i]).width + size * 0.10;
      widths.push(w);
      total += w;
    }
    let a = centre - (dir * total) / (2 * r);
    for (let i = 0; i < text.length; i += 1) {
      const step = widths[i] / r;
      const ang = a + (dir * step) / 2;
      ctx.save();
      ctx.translate(cx + Math.cos(ang) * r, cy + Math.sin(ang) * r);
      ctx.rotate(ang + (dir > 0 ? Math.PI / 2 : -Math.PI / 2));
      ctx.fillStyle = 'rgba(0,0,0,0.72)';
      ctx.fillText(text[i], 0, 0);
      ctx.fillStyle = 'rgba(255,253,247,0.30)';
      ctx.fillText(text[i], -0.7 * s, -0.7 * s);
      ctx.restore();
      a += dir * step;
    }
    ctx.restore();
  }
}

/**
 * Geometrie du champ. La bague mange sa part sur le bord : le champ optique
 * est ce qui reste.
 */
function metrics(w, h) {
  const outer = Math.min(w, h) / 2 - 1;
  // Plus large qu'avant : une bague moletee a besoin de place pour que ses
  // dents et sa gravure soient autre chose qu'un lisere.
  const bezelW = Math.max(7, outer * 0.075);
  return { cx: w / 2, cy: h / 2, outer, bezelW, radius: outer - bezelW };
}
