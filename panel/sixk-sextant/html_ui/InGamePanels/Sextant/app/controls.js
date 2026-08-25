/**
 * Les deux commandes de la plaque : le selecteur de grossissement et le
 * bouton de visee.
 *
 * Elles etaient en HTML — un `<button>` et une bascule stylee en CSS — et
 * elles juraient a cote du champ et des tambours, qui sont peints. Meme
 * vocabulaire ici que dans `drum.js` : une lumiere clé en haut a gauche, un
 * rebond froid en bas a droite, une arete claire et une arete sombre pour le
 * relief, et une gravure a deux traits. Rien d'autre ne fait « metal ».
 *
 * Pas de coins arrondis : `roundRect` n'existe pas dans le moteur de 2017, et
 * une plaque d'instrument de 1944 a des aretes vives de toute facon.
 *
 * Meme discipline que les tambours : on MESURE au redimensionnement, jamais au
 * dessin, et on ne peint que sur demande — jamais dans un ecouteur d'entree.
 */

/** L'ambre du panneau : la lampe, et elle seule. */
const LAMPE = '216,162,74';

/** Base commune : mesure gardee en cache, dessin a la demande. */
class Plaque {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cssW = 0;
    this.cssH = 0;
  }

  measure() {
    const r = this.canvas.getBoundingClientRect();
    this.cssW = Math.max(24, Math.round(r.width));
    this.cssH = Math.max(16, Math.round(r.height));
  }

  /** Prepare le contexte et rend `{ctx, w, h}` en pixels CSS. */
  prepare() {
    if (!this.cssW) this.measure();
    const { canvas, ctx } = this;
    const w = this.cssW;
    const h = this.cssH;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  /**
   * Le corps de la plaque.
   *
   * Enfonce, la lumiere s'inverse : le degrade repart du bas, les aretes
   * echangent leurs roles, et l'ensemble s'assombrit. C'est ce basculement qui
   * fait sentir la course du bouton — une simple teinte plus foncee ne suffit
   * pas, elle se lit comme un survol.
   */
  corps(ctx, x, y, w, h, { pressed = false, chaud = 0 } = {}) {
    const g = ctx.createLinearGradient(x, y, x, y + h);
    if (pressed) {
      g.addColorStop(0, '#1a1d20');
      g.addColorStop(0.45, '#2b3035');
      g.addColorStop(1, '#3c4349');
    } else {
      g.addColorStop(0, '#5e666e');
      g.addColorStop(0.42, '#464d54');
      g.addColorStop(0.58, '#3a4046');
      g.addColorStop(1, '#22262a');
    }
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);

    // La chauffe ambre : la lampe derriere la plaque, pas une couleur de fond.
    if (chaud > 0) {
      const c = ctx.createLinearGradient(x, y, x, y + h);
      c.addColorStop(0, `rgba(${LAMPE},${(0.30 * chaud).toFixed(3)})`);
      c.addColorStop(1, `rgba(${LAMPE},${(0.08 * chaud).toFixed(3)})`);
      ctx.fillStyle = c;
      ctx.fillRect(x, y, w, h);
    }

    ctx.lineWidth = 1;
    ctx.strokeStyle = pressed ? 'rgba(0,0,0,0.75)' : 'rgba(226,233,240,0.34)';
    ctx.beginPath();
    ctx.moveTo(x + 0.5, y + h - 0.5);
    ctx.lineTo(x + 0.5, y + 0.5);
    ctx.lineTo(x + w - 0.5, y + 0.5);
    ctx.stroke();
    ctx.strokeStyle = pressed ? 'rgba(226,233,240,0.22)' : 'rgba(0,0,0,0.62)';
    ctx.beginPath();
    ctx.moveTo(x + w - 0.5, y + 0.5);
    ctx.lineTo(x + w - 0.5, y + h - 0.5);
    ctx.lineTo(x + 0.5, y + h - 0.5);
    ctx.stroke();
  }

  /** Gravure : un trait sombre, et sa levre claire decalee d'un demi-pixel. */
  graver(ctx, txt, x, y, taille, teinte, poids) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${poids} ${taille.toFixed(1)}px "SextantSans", "Segoe UI", Arial, sans-serif`;
    ctx.fillStyle = 'rgba(0,0,0,0.70)';
    ctx.fillText(txt, x + 0.7, y + 0.7);
    ctx.fillStyle = teinte;
    ctx.fillText(txt, x, y);
  }
}

/**
 * Le bouton de visee.
 *
 * Un poussoir, pas un lien : legende gravee, course visible a l'enfoncement, et
 * un temoin ambre a gauche qui s'allume pendant l'integration. C'est le seul
 * organe du panneau qui declenche quelque chose, il a droit a sa lampe.
 */
export class BoutonVisee extends Plaque {
  draw({ label, pressed = false, actif = false }) {
    const { ctx, w, h } = this.prepare();
    this.corps(ctx, 0, 0, w, h, { pressed, chaud: actif ? 1 : 0 });

    // Le temoin : un rond de verre, eteint ou allume, jamais absent — un
    // voyant qui disparait laisse un trou dans la plaque.
    const r = Math.min(6, h * 0.22);
    const cx = Math.max(14, w * 0.085);
    const cy = h / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.arc(cx, cy, r + 1.5, 0, Math.PI * 2);
    ctx.fill();
    const lampe = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
    if (actif) {
      lampe.addColorStop(0, 'rgba(255,226,170,0.95)');
      lampe.addColorStop(1, `rgba(${LAMPE},0.55)`);
    } else {
      lampe.addColorStop(0, 'rgba(120,116,108,0.55)');
      lampe.addColorStop(1, 'rgba(40,40,40,0.75)');
    }
    ctx.fillStyle = lampe;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    const dy = pressed ? 0.8 : 0;
    this.graver(
      ctx, label, w / 2 + r * 0.5, h / 2 + dy,
      Math.min(15, h * 0.42),
      actif ? 'rgba(255,236,200,0.96)' : 'rgba(224,230,236,0.90)',
      '700',
    );
  }
}

/**
 * Le selecteur de grossissement.
 *
 * Deux positions gravees cote a cote, celle en service eclairee — la meme
 * grammaire que la roue de filtres, pour qu'un coup d'oeil suffise a savoir
 * dans quel regime on est. Un bouton bascule ne disait pas ou l'on etait sans
 * le lire.
 */
export class Selecteur extends Plaque {
  draw({ options, index }) {
    const { ctx, w, h } = this.prepare();
    const n = options.length;
    const cell = w / n;
    for (let i = 0; i < n; i += 1) {
      const x = Math.round(i * cell);
      const cw = Math.round((i + 1) * cell) - x;
      const on = i === index;
      this.corps(ctx, x, 0, cw, h, { pressed: on, chaud: on ? 1 : 0 });
      this.graver(
        ctx, options[i], x + cw / 2, h / 2,
        Math.min(14, h * 0.46),
        on ? 'rgba(255,240,210,0.98)' : 'rgba(186,193,200,0.80)',
        on ? '700' : '600',
      );
    }
  }
}
