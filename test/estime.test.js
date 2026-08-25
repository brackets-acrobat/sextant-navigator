/**
 * Le triangle des vitesses direct, et ce que l'estime en fait.
 *
 * C'est le calcul le plus simple du projet et celui dont l'erreur serait la
 * plus difficile à voir : une convention de vent inversée donne une estime
 * plausible, qui dérive du bon ordre de grandeur, dans la mauvaise direction.
 * Rien ne s'écroule ; le point est juste faux, toujours du même côté.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { groundVector, advancePosition } from '../src/index.js';

const proche = (a, b, tol, quoi) =>
  assert.ok(Math.abs(a - b) < tol, `${quoi} : ${a} attendu ${b} (± ${tol})`);

// ---------------------------------------------------------------------------

test('triangle — sans vent, la route vaut le cap et la vitesse sol la vitesse propre', () => {
  const g = groundVector({ headingTrue: 285, tasKt: 150 });
  proche(g.trackDeg, 285, 1e-9, 'route');
  proche(g.groundSpeedKt, 150, 1e-9, 'vitesse sol');
  proche(g.driftDeg, 0, 1e-9, 'dérive');
});

test('triangle — vent debout : on ralentit sans dévier', () => {
  // Cap au nord, vent du nord : il vient de face.
  const g = groundVector({ headingTrue: 0, tasKt: 150, windFromDeg: 0, windKt: 30 });
  proche(g.trackDeg, 0, 1e-9, 'route');
  proche(g.groundSpeedKt, 120, 1e-9, 'vitesse sol');
});

test('triangle — vent arrière : on accélère', () => {
  // LE PIÈGE DE LA CONVENTION. Cap au nord, vent DU SUD : il pousse. Une
  // convention inversée donnerait 120 kt au lieu de 180, et l'estime dériverait
  // exactement à l'envers.
  const g = groundVector({ headingTrue: 0, tasKt: 150, windFromDeg: 180, windKt: 30 });
  proche(g.trackDeg, 0, 1e-9, 'route');
  proche(g.groundSpeedKt, 180, 1e-9, 'vitesse sol');
});

test('triangle — vent de travers : la dérive part du bon côté', () => {
  // Cap au nord, vent d'OUEST (il vient de 270) : il pousse vers l'est, donc la
  // route dérive à DROITE du cap.
  const g = groundVector({ headingTrue: 0, tasKt: 100, windFromDeg: 270, windKt: 20 });
  assert.ok(g.driftDeg > 0, `dérive ${g.driftDeg}° — le vent d'ouest doit pousser à droite`);
  proche(g.trackDeg, Math.atan2(20, 100) * 180 / Math.PI, 1e-9, 'route');
  proche(g.groundSpeedKt, Math.hypot(100, 20), 1e-9, 'vitesse sol');

  // Et symétriquement pour un vent d'est.
  const h = groundVector({ headingTrue: 0, tasKt: 100, windFromDeg: 90, windKt: 20 });
  proche(h.driftDeg, -g.driftDeg, 1e-9, 'dérive symétrique');
});

test('triangle — la dérive se replie sur ±180 au passage du nord', () => {
  // Cap au 355, poussé vers la droite : la route passe au-delà de 360 et la
  // dérive doit rester une petite valeur positive, pas 350.
  const g = groundVector({ headingTrue: 355, tasKt: 100, windFromDeg: 265, windKt: 20 });
  assert.ok(g.driftDeg > 0 && g.driftDeg < 20, `dérive ${g.driftDeg}°`);
  assert.ok(g.trackDeg >= 0 && g.trackDeg < 360, `route ${g.trackDeg}°`);
});

test('triangle — vent debout exactement égal à la vitesse propre : on fait du surplace', () => {
  const g = groundVector({ headingTrue: 90, tasKt: 60, windFromDeg: 90, windKt: 60 });
  proche(g.groundSpeedKt, 0, 1e-9, 'vitesse sol');
  // La route n'existe pas : on rend le cap plutôt qu'un NaN, et rien ne bouge.
  proche(g.trackDeg, 90, 1e-9, 'route de repli');
  const p = advancePosition({ lat: 45, lon: 5 }, g.groundSpeedKt * 0.5, g.trackDeg);
  proche(p.lat, 45, 1e-12, 'latitude inchangée');
  proche(p.lon, 5, 1e-12, 'longitude inchangée');
});

test('triangle — vent plus fort que l’avion : on recule, et le calcul tient', () => {
  // Un cas que le triangle INVERSE (celui de la préparation) déclare insoluble,
  // et que celui-ci doit pourtant traiter : en vol, l'avion va bien quelque
  // part, même à reculons.
  const g = groundVector({ headingTrue: 0, tasKt: 40, windFromDeg: 0, windKt: 100 });
  proche(g.groundSpeedKt, 60, 1e-9, 'vitesse sol');
  proche(g.trackDeg, 180, 1e-9, 'route — on recule plein sud');
});

test('triangle — avion arrêté, vent nul : rien ne se passe', () => {
  const g = groundVector({ headingTrue: 27, tasKt: 0 });
  proche(g.groundSpeedKt, 0, 1e-9, 'vitesse sol');
});

test('triangle — avion arrêté sous le vent : le calcul dit ce qu’il voit', () => {
  // À l'arrêt, l'addition vectorielle donne le vecteur vent seul : l'avion
  // « dérive » à la vitesse du vent. C'est mathématiquement exact et
  // physiquement faux — un avion au parking ne bouge pas. C'est à l'appelant
  // de ne pas faire avancer l'estime au sol, et c'est ce qu'il fait.
  const g = groundVector({ headingTrue: 0, tasKt: 0, windFromDeg: 270, windKt: 15 });
  proche(g.groundSpeedKt, 15, 1e-9, 'vitesse sol');
  proche(g.trackDeg, 90, 1e-9, 'route — poussé vers l’est');
});

// ---------------------------------------------------------------------------

test('estime — une heure au cap 090 avec vent nul fait 60 milles vers l’est', () => {
  const g = groundVector({ headingTrue: 90, tasKt: 60 });
  const p = advancePosition({ lat: 0, lon: 0 }, g.groundSpeedKt * 1, g.trackDeg);
  proche(p.lat, 0, 1e-9, 'latitude');
  proche(p.lon, 1, 1e-9, 'longitude — un degré à l’équateur');
});

test('estime — CE QUE COÛTE UN VENT MAL PRÉVU', () => {
  // Le cœur du jeu, chiffré. Deux heures de vol au cap 090 à 150 kt. Le
  // navigateur a prévu 20 kt de nord ; il en souffle 20 de sud. Son estime et
  // sa position vraie divergent, et c'est cet écart que la droite de hauteur
  // doit retrouver.
  const DEPART = { lat: 45, lon: 0 };
  const HEURES = 2;
  const cru = groundVector({ headingTrue: 90, tasKt: 150, windFromDeg: 0, windKt: 20 });
  const vrai = groundVector({ headingTrue: 90, tasKt: 150, windFromDeg: 180, windKt: 20 });

  const estime = advancePosition(DEPART, cru.groundSpeedKt * HEURES, cru.trackDeg);
  const reelle = advancePosition(DEPART, vrai.groundSpeedKt * HEURES, vrai.trackDeg);

  const ecartNm = Math.hypot(
    (reelle.lat - estime.lat) * 60,
    (reelle.lon - estime.lon) * 60 * Math.cos((DEPART.lat * Math.PI) / 180),
  );
  // 40 kt d'erreur latérale pendant deux heures : 80 milles, et l'erreur est
  // PERPENDICULAIRE à la route, donc entièrement en travers.
  proche(ecartNm, 80, 1.5, 'écart estime / vérité après deux heures');
  // Le vent prévu poussait vers le sud, le vrai pousse vers le nord :
  // la position réelle est au NORD de l'estime.
  assert.ok(reelle.lat > estime.lat, 'la vérité doit être au nord de l’estime');
});
