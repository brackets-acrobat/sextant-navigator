/**
 * Qualité géométrique d'un point : angle de coupe, dilution, choix du jeu
 * d'astres. Ce sont les seuls calculs du noyau qui ne dépendent ni de l'heure
 * ni du lieu — ils ne parlent que d'azimuts — donc ils se vérifient contre des
 * valeurs fermées, à la main.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cutAngle,
  idealCut,
  idealDilution,
  fixQuality,
  bestFixSet,
  visibleBodies,
} from '../src/index.js';

const proche = (a, b, tol, quoi) =>
  assert.ok(Math.abs(a - b) < tol, `${quoi} : ${a} attendu ${b} (± ${tol})`);

// ---------------------------------------------------------------------------

test('coupe — deux astres perpendiculaires se coupent à 90°', () => {
  proche(cutAngle(0, 90), 90, 1e-9, 'coupe');
  proche(cutAngle(45, 315), 90, 1e-9, 'coupe à cheval sur le nord');
});

test('coupe — deux astres opposés donnent des droites PARALLÈLES', () => {
  // Le piège du débutant : 180° d'écart d'azimut, ça a l'air d'être le mieux
  // possible, et ça ne donne aucun point.
  proche(cutAngle(30, 210), 0, 1e-9, 'coupe');
  proche(cutAngle(0, 170), 10, 1e-9, 'coupe repliée');
  proche(cutAngle(350, 10), 20, 1e-9, 'coupe autour du nord');
});

test('coupe — un astre avec lui-même ne coupe rien', () => {
  proche(cutAngle(123.4, 123.4), 0, 1e-9, 'coupe');
});

test('dilution — deux droites à 90° multiplient l’erreur par √2', () => {
  const q = fixQuality([0, 90]);
  proche(q.cutMin, 90, 1e-9, 'coupe min');
  proche(q.dilution, Math.SQRT2, 1e-12, 'dilution');
  proche(q.dilution, idealDilution(2), 1e-12, 'dilution idéale à deux');
});

test('dilution — trois astres à 120° : le point classique', () => {
  const q = fixQuality([0, 120, 240]);
  proche(q.cutMin, 60, 1e-9, 'coupe min');
  proche(q.cutMin, idealCut(3), 1e-9, 'coupe idéale à trois');
  proche(q.dilution, 2 / Math.sqrt(3), 1e-12, 'dilution');
  // Trois astres valent mieux que deux, mais moins que le rapport des nombres :
  // 1,155 contre 1,414, soit 18 % de gagné, pas 33.
  assert.ok(q.dilution < fixQuality([0, 90]).dilution);
});

test('dilution — à deux astres, elle suit exactement √2 / sin(coupe)', () => {
  // C'est la forme fermée du cas à deux droites, et c'est elle qui justifie la
  // règle de ne jamais viser sous 30° de coupe.
  for (const coupe of [10, 20, 30, 45, 60, 75, 90]) {
    const q = fixQuality([0, coupe]);
    proche(q.cutMin, coupe, 1e-9, `coupe ${coupe}`);
    proche(q.dilution, Math.SQRT2 / Math.sin((coupe * Math.PI) / 180), 1e-10, `dilution à ${coupe}°`);
  }
  // Ce que coûte une mauvaise coupe, en clair : à 10°, un mille d'erreur de
  // visée en fait huit sur la carte.
  proche(fixQuality([0, 10]).dilution, 8.14, 0.01, 'dilution à 10°');
});

test('dilution — deux visées du même astre ne font pas un point', () => {
  const q = fixQuality([137, 137]);
  proche(q.cutMin, 0, 1e-9, 'coupe min');
  assert.equal(q.dilution, Infinity);
});

test('dilution — une seule droite n’est pas un point', () => {
  const q = fixQuality([45]);
  assert.equal(q.count, 1);
  assert.equal(q.cutMin, null);
  assert.equal(q.dilution, null);
});

test('dilution — un jeu également réparti atteint l’optimum, quel qu’en soit le nombre', () => {
  for (const n of [2, 3, 4, 5, 6]) {
    const az = Array.from({ length: n }, (_, i) => (i * 180) / n);
    const q = fixQuality(az);
    proche(q.cutMin, idealCut(n), 1e-9, `coupe idéale à ${n}`);
    proche(q.dilution, idealDilution(n), 1e-12, `dilution idéale à ${n}`);
  }
});

test('dilution — la rotation du jeu entier ne change rien', () => {
  // Le point ne sait pas où est le nord : seule la forme du bouquet compte.
  const a = fixQuality([0, 120, 240]);
  const b = fixQuality([37, 157, 277]);
  proche(a.dilution, b.dilution, 1e-12, 'dilution après rotation');
  proche(a.cutMin, b.cutMin, 1e-9, 'coupe après rotation');
});

// ---------------------------------------------------------------------------

test('choix du jeu — le trio bien ouvert l’emporte sur le paquet serré', () => {
  const astres = [
    { name: 'A', zn: 10, magnitude: 1 },
    { name: 'B', zn: 20, magnitude: 1 },
    { name: 'C', zn: 30, magnitude: 1 },   // A, B, C : trois astres collés
    { name: 'D', zn: 130, magnitude: 2 },
    { name: 'E', zn: 250, magnitude: 2 },
  ];
  const best = bestFixSet(astres, { size: 3 });
  assert.deepEqual(best.names.slice().sort(), ['A', 'D', 'E']);
  assert.ok(best.cutMin > 50, `coupe min = ${best.cutMin}`);
  // Et il est vraiment meilleur que le paquet, pas seulement classé devant.
  assert.ok(best.dilution < fixQuality([10, 20, 30]).dilution / 3);
});

test('choix du jeu — à géométrie égale, l’astre brillant l’emporte', () => {
  // Deux candidats pour la troisième place, au même azimut : le jeu ne peut se
  // départager que sur la magnitude.
  const astres = [
    { name: 'Vega', zn: 0, magnitude: 0.03 },
    { name: 'Altair', zn: 120, magnitude: 0.76 },
    { name: 'Brillante', zn: 240, magnitude: 1.2 },
    { name: 'Terne', zn: 240, magnitude: 2.9 },
  ];
  const best = bestFixSet(astres, { size: 3 });
  assert.ok(best.names.includes('Brillante'), `choisi : ${best.names.join(', ')}`);
  assert.ok(!best.names.includes('Terne'));
});

test('choix du jeu — la géométrie passe AVANT la brillance', () => {
  // L'astre le plus brillant du lot est mal placé : les trois autres forment un
  // jeu parfait à 60° de coupe, et TOUT trio qui prend le phare pince une paire
  // à 30°. Il doit être laissé de côté malgré ses quatre magnitudes d'avance.
  const astres = [
    { name: 'Phare', zn: 0, magnitude: -1.4 },
    { name: 'A', zn: 90, magnitude: 2.5 },
    { name: 'B', zn: 150, magnitude: 2.5 },
    { name: 'C', zn: 210, magnitude: 2.5 },
  ];
  const best = bestFixSet(astres, { size: 3 });
  assert.deepEqual(best.names.slice().sort(), ['A', 'B', 'C']);
  proche(best.cutMin, 60, 1e-9, 'coupe min du trio retenu');
});

test('choix du jeu — deux astres suffisent quand il n’y en a que deux', () => {
  const astres = [
    { name: 'A', zn: 15 },
    { name: 'B', zn: 100 },
  ];
  assert.equal(bestFixSet(astres, { size: 3 }), null);
  const paire = bestFixSet(astres, { size: 2 });
  assert.deepEqual(paire.names, ['A', 'B']);
  proche(paire.cutMin, 85, 1e-9, 'coupe de la paire');
});

test('choix du jeu — un azimut manquant est écarté sans faire tomber le calcul', () => {
  const astres = [
    { name: 'A', zn: 0 },
    { name: 'B', zn: 120 },
    { name: 'C', zn: 240 },
    { name: 'Sans azimut', zn: NaN },
  ];
  const best = bestFixSet(astres, { size: 3 });
  assert.deepEqual(best.names.slice().sort(), ['A', 'B', 'C']);
});

// ---------------------------------------------------------------------------

test('bout en bout — le ciel réel offre un trio exploitable', () => {
  // LFMA, une nuit d'hiver : les astres visibles passent au choix du jeu, et le
  // trio retenu doit valoir mieux que la moyenne des trios possibles.
  const vue = visibleBodies({
    utc: '2026-01-15T19:30:00Z',
    position: { lat: 43.5, lon: 5.37 },
  });
  assert.ok(vue.bodies.length >= 3, `${vue.bodies.length} astres exploitables`);

  const best = bestFixSet(vue.bodies, { size: 3 });
  assert.equal(best.names.length, 3);
  assert.ok(best.dilution >= idealDilution(3), 'aucun jeu ne bat l’optimum théorique');
  // Avec une dizaine d'astres au ciel, on trouve toujours mieux que 40° de
  // coupe : c'est ce qui rend le point de nuit facile, et le point de jour —
  // Soleil seul — impossible sans transport.
  assert.ok(best.cutMin > 40, `coupe min = ${best.cutMin}`);
});
