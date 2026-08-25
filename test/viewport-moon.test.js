/**
 * Le dessin de la Lune, éprouvé sans navigateur.
 *
 * La géométrie du terminateur se démontre : la figure est un demi-disque plus
 * une demi-ellipse de demi-axe r(2k−1), donc son aire vaut
 * πr²/2 + πr·r(2k−1)/2 = k·πr². Elle est juste par construction, à tous les
 * quartiers, et il n'y a rien à mesurer là.
 *
 * Ce qui peut casser, en revanche, c'est l'exécution : une méthode de canvas
 * absente du moteur de 2017, un `scale(0)` qui annule la matrice, une phase qui
 * sort de [0, 1]. On donne donc au dessin un contexte factice qui note tout ce
 * qu'on lui demande, et on regarde qu'il ne réclame rien d'exotique.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { Viewport } from '../panel/sixk-sextant/html_ui/InGamePanels/Sextant/app/viewport.js';

/** Contexte 2D factice : il enregistre les appels au lieu de peindre. */
function contexteFactice() {
  const appels = [];
  const note = (nom) => (...args) => { appels.push({ nom, args }); };
  return {
    appels,
    save: note('save'),
    restore: note('restore'),
    translate: note('translate'),
    rotate: note('rotate'),
    scale: note('scale'),
    beginPath: note('beginPath'),
    closePath: note('closePath'),
    arc: note('arc'),
    fill: note('fill'),
    stroke: note('stroke'),
    // Les mers sont découpées dans la seule part éclairée, et peintes en
    // dégradés radiaux : le flou est de la géométrie, faute de `ctx.filter`.
    clip: note('clip'),
    createRadialGradient(...args) {
      appels.push({ nom: 'createRadialGradient', args });
      return { addColorStop: note('addColorStop') };
    },
    set fillStyle(v) { appels.push({ nom: 'fillStyle', args: [v] }); },
    set strokeStyle(v) { appels.push({ nom: 'strokeStyle', args: [v] }); },
    set lineWidth(v) { appels.push({ nom: 'lineWidth', args: [v] }); },
  };
}

/**
 * Le moteur du panneau est un WebKit 604. `ellipse()` n'y est pas garanti et
 * `getImageData` y est absent : le dessin ne doit demander ni l'un ni l'autre.
 */
const INTERDITS = ['ellipse', 'getImageData', 'roundRect', 'filter', 'resetTransform'];

test('Lune — le dessin tient à tous les quartiers, sans API exotique', () => {
  for (const k of [0, 0.002, 0.13, 0.5, 0.5001, 0.87, 1]) {
    for (const limbAngle of [0, 37.6, 90, 180, 271.4, 359]) {
      const ctx = contexteFactice();
      const vue = new Viewport({ getContext: () => ctx });

      assert.doesNotThrow(
        () => vue.drawMoon(100, 100, 40, { illuminated: k, limbAngle }),
        `k=${k} angle=${limbAngle}`,
      );

      for (const appel of ctx.appels) {
        assert.ok(
          !INTERDITS.includes(appel.nom),
          `le dessin appelle ${appel.nom}(), absent du moteur du panneau`,
        );
        for (const a of appel.args) {
          assert.ok(
            typeof a !== 'number' || Number.isFinite(a),
            `${appel.nom} reçoit ${a} (k=${k}, angle=${limbAngle})`,
          );
        }
      }

      // Jamais de mise à l'échelle nulle : elle rendrait la matrice singulière
      // et tout ce qui suit invisible.
      for (const appel of ctx.appels) {
        if (appel.nom === 'scale') {
          assert.ok(appel.args[0] > 0, `scale(${appel.args[0]}) à k=${k}`);
          assert.ok(appel.args[1] > 0, `scale y nul à k=${k}`);
        }
      }

      // Sauvegardes et restaurations doivent s'équilibrer, sinon l'état du
      // canvas fuit d'une image à l'autre et le champ entier finit de travers.
      const saves = ctx.appels.filter((a) => a.nom === 'save').length;
      const restores = ctx.appels.filter((a) => a.nom === 'restore').length;
      assert.equal(saves, restores, `save/restore desequilibres a k=${k}`);
    }
  }
});

test('Lune — une phase absente ou aberrante ne casse pas le dessin', () => {
  const ctx = contexteFactice();
  const vue = new Viewport({ getContext: () => ctx });
  assert.doesNotThrow(() => vue.drawMoon(10, 10, 5, {}));
  assert.doesNotThrow(() => vue.drawMoon(10, 10, 5, { illuminated: -3, limbAngle: 1e6 }));
  assert.doesNotThrow(() => vue.drawMoon(10, 10, 5, { illuminated: 42, limbAngle: -720 }));
});
