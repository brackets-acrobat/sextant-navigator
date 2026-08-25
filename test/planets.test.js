/**
 * Les quatre planètes, contre le Jet Propulsion Laboratory.
 *
 * Il n'y a pas de meilleure référence : Horizons est l'éphéméride qui sert à
 * naviguer les sondes. `reference/planets.csv` en contient 192 positions
 * apparentes, réparties de 1900 à 2100 — les bornes du domaine garanti — et
 * versionnées pour que ce test tourne HORS LIGNE.
 *
 * Les instants sont en UTC, délibérément : notre chaîne fait elle-même la
 * conversion en Temps Terrestre. Ce test met donc aussi ΔT à l'épreuve, ce
 * qu'une comparaison en TT aurait escamoté.
 *
 * S'y ajoute l'exemple 33.a de Meeus, qui a l'avantage de publier ses étapes
 * intermédiaires : quand un écart apparaît, il dit à quel endroit de la chaîne
 * regarder — temps-lumière, FK5, aberration ou nutation.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { bodyPosition, PLANET_NAMES } from '../src/index.js';
import { planetApparent } from '../src/planets.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Tolérance, en secondes d'arc.
 *
 * Le sextant à bulle donne 1 à 2 minutes d'arc — 60 à 120 secondes. Nos séries
 * tronquées introduisent au plus 1,3″, l'aberration et la nutation sont
 * complètes, et ΔT pèse quelques dixièmes. On se donne 5″ : cinq fois la marge
 * connue, et vingt fois moins que ce que la main sait viser. Au-delà, ce
 * n'est plus de la troncature mais une faute.
 */
const TOLERANCE = 5;

function chargeReference() {
  const raw = readFileSync(join(HERE, '..', 'reference', 'planets.csv'), 'utf8');
  const lignes = [];
  for (const l of raw.split(/\r?\n/)) {
    if (!l || l.startsWith('#') || l.startsWith('body;')) continue;
    const [body, utc, ra, dec] = l.split(';');
    lignes.push({ body, utc, ra: Number(ra), dec: Number(dec) });
  }
  return lignes;
}

/** Écart angulaire vrai entre deux directions, en secondes d'arc. */
function ecartArcsec(ra1, dec1, ra2, dec2) {
  const D = Math.PI / 180;
  const cos = Math.sin(dec1 * D) * Math.sin(dec2 * D)
    + Math.cos(dec1 * D) * Math.cos(dec2 * D) * Math.cos((ra1 - ra2) * D);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) / D) * 3600;
}

const REFERENCE = chargeReference();

test('référence — les quatre planètes y sont, de 1900 à 2100', () => {
  assert.ok(REFERENCE.length >= 190, `${REFERENCE.length} lignes seulement`);
  for (const n of PLANET_NAMES) {
    const n_ = REFERENCE.filter((r) => r.body === n).length;
    assert.ok(n_ >= 40, `${n} : ${n_} positions de référence`);
  }
  const annees = new Set(REFERENCE.map((r) => r.utc.slice(0, 4)));
  assert.ok(annees.has('1900') && annees.has('2100'), 'le domaine n’est pas couvert');
});

test('planètes — accord avec JPL Horizons, de 1900 à 2050', () => {
  const pires = new Map();

  for (const r of REFERENCE) {
    if (Number(r.utc.slice(0, 4)) > 2050) continue;
    const p = bodyPosition(r.body, new Date(r.utc));
    const ecart = ecartArcsec(p.ra, p.dec, r.ra, r.dec);
    const pire = pires.get(r.body);
    if (!pire || ecart > pire.ecart) pires.set(r.body, { ecart, utc: r.utc });

    assert.ok(
      ecart < TOLERANCE,
      `${r.body} le ${r.utc} : ${ecart.toFixed(2)}″ de Horizons`,
    );
  }
  assert.equal(pires.size, 4, 'les quatre planètes doivent être éprouvées');
});

/**
 * 2100 : ce que la comparaison mesure alors, c'est ΔT.
 *
 * À la fin du domaine, notre écart à Horizons monte à 7″ sur Vénus, 4″ sur
 * Mars, 1,8″ sur Jupiter, 0,9″ sur Saturne. L'ordre n'est pas fortuit : c'est
 * celui de leurs vitesses propres. Une erreur de position n'a aucune raison de
 * suivre la vitesse de l'astre ; un décalage de TEMPS, si — il déplace chaque
 * planète le long de sa trajectoire, d'autant plus qu'elle va vite.
 *
 * Or ΔT, l'écart entre le temps des horloges et celui de la rotation de la
 * Terre, n'est pas calculable un siècle à l'avance : il se mesure. Notre table
 * l'extrapole par les branches d'Espenak, Horizons par les siennes, et les deux
 * divergent de quelques minutes en 2100. Ce n'est pas une faute de l'un ou de
 * l'autre, c'est de la physique inconnue.
 *
 * Ce test le DÉMONTRE au lieu de l'affirmer : il cherche, pour chaque date, le
 * décalage de temps unique qui réconcilie les quatre planètes à la fois. Si un
 * seul nombre y suffit — et que le résidu retombe au niveau de 1950 — alors la
 * théorie planétaire est juste et le désaccord est bien horaire.
 */
test('planètes — en 2100, l’écart est un décalage de ΔT, pas une erreur de position', () => {
  const dates = [...new Set(REFERENCE.filter((r) => r.utc.startsWith('2100')).map((r) => r.utc))];
  assert.ok(dates.length >= 8, `${dates.length} dates en 2100`);

  const decalages = [];
  for (const utc of dates) {
    const lot = REFERENCE.filter((r) => r.utc === utc);
    assert.equal(lot.length, 4, `${utc} : ${lot.length} planètes`);

    /** Somme des carrés des écarts, pour un décalage de dt secondes. */
    const cout = (dt) => {
      let s = 0;
      for (const r of lot) {
        const p = bodyPosition(r.body, new Date(new Date(utc).getTime() + dt * 1000));
        s += ecartArcsec(p.ra, p.dec, r.ra, r.dec) ** 2;
      }
      return s;
    };

    // Balayage grossier puis affinage : le minimum est unique et bien creusé.
    let meilleur = 0;
    for (let dt = -600; dt <= 600; dt += 20) if (cout(dt) < cout(meilleur)) meilleur = dt;
    for (let dt = meilleur - 20; dt <= meilleur + 20; dt += 1) if (cout(dt) < cout(meilleur)) meilleur = dt;
    decalages.push(meilleur);

    // Le résidu APRÈS ce décalage unique : c'est lui qui juge la théorie.
    for (const r of lot) {
      const p = bodyPosition(r.body, new Date(new Date(utc).getTime() + meilleur * 1000));
      const residu = ecartArcsec(p.ra, p.dec, r.ra, r.dec);
      assert.ok(
        residu < 2,
        `${r.body} le ${utc} : ${residu.toFixed(2)}″ de résidu après ${meilleur} s`,
      );
    }
  }

  // Et le décalage doit être LE MÊME toute l'année : un désaccord sur ΔT est
  // une constante, pas un bruit. S'il variait de date en date, l'explication
  // serait fausse et il faudrait chercher ailleurs.
  const moyen = decalages.reduce((a, b) => a + b, 0) / decalages.length;
  const dispersion = Math.sqrt(
    decalages.reduce((a, b) => a + (b - moyen) ** 2, 0) / decalages.length,
  );
  assert.ok(Math.abs(moyen) < 400, `décalage moyen de ${moyen.toFixed(0)} s`);
  assert.ok(dispersion < 40, `décalage instable : ${dispersion.toFixed(0)} s d'écart-type`);
});

test('planètes — exemple 33.a de Meeus, Vénus le 20 décembre 1992', () => {
  // 1992 décembre 20.0 en Temps Terrestre, donc directement en jour julien TT.
  const v = planetApparent('Venus', 2448976.5);

  // Meeus : α = 21h04m41,454s, δ = −18°53′16,84″.
  const raMeeus = (21 + 4 / 60 + 41.454 / 3600) * 15;
  const decMeeus = -(18 + 53 / 60 + 16.84 / 3600);

  assert.ok(
    ecartArcsec(v.ra, v.dec, raMeeus, decMeeus) < 1,
    `écart de ${ecartArcsec(v.ra, v.dec, raMeeus, decMeeus).toFixed(2)}″ avec Meeus`,
  );
  // Les étapes intermédiaires, qui localisent une faute éventuelle.
  assert.ok(Math.abs(v.lambda - 313.08151) * 3600 < 1, `λ = ${v.lambda}`);
  assert.ok(Math.abs(v.beta + 2.08487) * 3600 < 1, `β = ${v.beta}`);
  assert.ok(Math.abs(v.distanceAU - 0.910947) < 1e-5, `Δ = ${v.distanceAU}`);
});

test('planètes — la parallaxe de Vénus n’est pas négligeable, celle de Saturne si', () => {
  // Vénus proche : la parallaxe horizontale approche la demi-minute d'arc, et
  // l'almanach nautique lui consacre une correction supplémentaire.
  let maxVenus = 0;
  let maxSaturne = 0;
  for (let j = 0; j < 365 * 2; j += 5) {
    const utc = new Date(Date.UTC(2026, 0, 1) + j * 86400000);
    maxVenus = Math.max(maxVenus, bodyPosition('Venus', utc).parallax * 60);
    maxSaturne = Math.max(maxSaturne, bodyPosition('Saturn', utc).parallax * 60);
  }
  assert.ok(maxVenus > 0.2, `Vénus plafonne à ${maxVenus.toFixed(2)}′ de parallaxe`);
  assert.ok(maxSaturne < 0.05, `Saturne monte à ${maxSaturne.toFixed(3)}′`);
});

test('planètes — un nom inconnu lève une erreur explicite', () => {
  assert.throws(() => bodyPosition('Pluton', new Date()), /Astre inconnu/);
  assert.throws(() => planetApparent('Neptune', 2451545), /Planète inconnue/);
});
