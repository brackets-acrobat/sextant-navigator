/**
 * Le catalogue contre sa source.
 *
 * Le catalogue est saisi à la main, et c'est le seul endroit du noyau où une
 * coquille ne se voit pas : rien n'est incohérent, la droite est simplement
 * fausse. Une seconde de temps en ascension droite déplace le point de 0,2 NM,
 * une minute le déplace de 15.
 *
 * Ces tests comparent chaque ligne à `reference/nav-stars.csv`, récupéré de
 * SIMBAD par `tools/fetch-star-reference.mjs` et versionné pour que le contrôle
 * reste HORS LIGNE. Ils ne valident pas l'astronomie — les exemples de Meeus
 * s'en chargent — mais la saisie.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { STARS } from '../src/catalog.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Tolérance de position, en secondes d'arc. Au dernier recoupement, l'écart
 * maximal était de 0,08″ — le simple arrondi de la saisie en sexagésimal. On se
 * donne une marge d'un ordre de grandeur, ce qui laisse passer un arrondi et
 * arrête une coquille : la plus petite faute de frappe plausible, 0,1 s de temps
 * en ascension droite, vaut déjà 1,5″.
 */
const TOL_ARCSEC = 0.5;

/**
 * Tolérance sur les mouvements propres, en mas/an. Le catalogue porte ceux du
 * Hipparcos d'origine, la référence ceux de la réduction de 2007 : ils diffèrent
 * de quelques mas/an. Sur les 26 ans qui séparent J2000 d'aujourd'hui, 5 mas/an
 * font 130 mas, soit 0,002′ — deux ordres de grandeur sous la lecture du
 * tambour. Ce test garde donc le SIGNE et l'ORDRE DE GRANDEUR, ce qui est ce qui
 * peut réellement se tromper à la saisie.
 */
const TOL_PM = 6;

function loadReference() {
  const raw = readFileSync(join(HERE, '..', 'reference', 'nav-stars.csv'), 'utf8');
  const rows = new Map();
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.startsWith('#') || line.startsWith('name;')) continue;
    const [name, bayer, hip, mainId, ra, dec, pmRa, pmDec, bib] = line.split(';');
    rows.set(name, {
      name, bayer, hip, mainId, bib,
      ra: Number(ra),
      dec: Number(dec),
      pmRa: pmRa === '' ? null : Number(pmRa),
      pmDec: pmDec === '' ? null : Number(pmDec),
    });
  }
  return rows;
}

const REF = loadReference();

test('référence — les 58 étoiles du catalogue y sont, avec la même désignation', () => {
  assert.equal(REF.size, STARS.length, 'la référence et le catalogue n’ont pas la même taille');
  for (const s of STARS) {
    const r = REF.get(s.name);
    assert.ok(r, `${s.name} est absente de reference/nav-stars.csv`);
    // La désignation de Bayer est la clé d'interrogation : si elle bougeait sans
    // que la référence soit régénérée, on comparerait à la mauvaise étoile.
    assert.equal(r.bayer, s.bayer, `${s.name} : désignation divergente`);
  }
});

test('catalogue — chaque position tombe sur sa source à mieux de 0,5″', () => {
  const ecarts = [];
  for (const s of STARS) {
    const r = REF.get(s.name);
    const cosDec = Math.cos((r.dec * Math.PI) / 180);
    // L'écart en ascension droite est ramené au grand cercle : c'est lui qui
    // déplace la droite de hauteur, pas l'écart en angle horaire.
    const dRa = (s.raHours * 15 - r.ra) * 3600 * cosDec;
    const dDec = (s.decDeg - r.dec) * 3600;
    const total = Math.hypot(dRa, dDec);
    ecarts.push({ name: s.name, hip: r.hip, dRa, dDec, total });
    // α Cen n'a pas de numéro HIP : ce sont ses composantes qui en portent un.
    const repere = r.hip ? `HIP ${r.hip}` : r.mainId;
    assert.ok(
      total < TOL_ARCSEC,
      `${s.name} (${repere}) : ${total.toFixed(2)}″ de sa source — ` +
        `ΔAR ${(dRa / 15 / cosDec).toFixed(3)} s de temps, Δδ ${dDec.toFixed(2)}″`,
    );
  }
  // Une régression d'ensemble se verrait sur la moyenne avant de faire sortir
  // une étoile en particulier.
  const moyen = ecarts.reduce((a, e) => a + e.total, 0) / ecarts.length;
  assert.ok(moyen < 0.15, `écart moyen ${moyen.toFixed(3)}″`);
});

test('catalogue — les mouvements propres gardent leur signe et leur ordre', () => {
  for (const s of STARS) {
    const r = REF.get(s.name);
    if (r.pmRa === null || r.pmDec === null) continue;
    assert.ok(
      Math.abs(s.pmRA - r.pmRa) < TOL_PM,
      `${s.name} : µα* ${s.pmRA} contre ${r.pmRa} mas/an`,
    );
    assert.ok(
      Math.abs(s.pmDec - r.pmDec) < TOL_PM,
      `${s.name} : µδ ${s.pmDec} contre ${r.pmDec} mas/an`,
    );
  }
});

/*
 * Le nombre d'étoiles, l'unicité des noms et la vraisemblance des coordonnées
 * sont déjà tenus par `reduce.test.js` ; on ne les redouble pas ici. Restent
 * deux invariants propres à la relecture.
 */
test('catalogue — désignations uniques et ascension droite croissante', () => {
  // La désignation de Bayer est la clé d'interrogation de la référence : deux
  // lignes qui la partageraient seraient comparées à la même étoile, et l'une
  // des deux pourrait être fausse sans que rien ne le montre.
  assert.equal(new Set(STARS.map((s) => s.bayer)).size, 58, 'désignations en double');

  // L'ordre n'est pas décoratif : c'est lui qui rend une insertion relisible,
  // et une ligne collée au mauvais endroit se voit immédiatement.
  for (let i = 1; i < STARS.length; i += 1) {
    assert.ok(
      STARS[i].raHours >= STARS[i - 1].raHours,
      `${STARS[i].name} rompt l’ordre en ascension droite`,
    );
  }
});

test('catalogue — la coquille de Suhail ne peut pas revenir', () => {
  // Elle a vécu dans le dépôt et valait 0,89 s de temps, soit 0,18 NM. Deux
  // sources indépendantes l'ont montrée avant qu'elle soit corrigée : ce test
  // est là pour qu'on ne la ressaisisse pas.
  const suhail = STARS.find((s) => s.name === 'Suhail');
  const attendu = 9 + 7 / 60 + 59.758 / 3600;
  assert.ok(
    Math.abs(suhail.raHours - attendu) * 3600 < 0.05,
    `Suhail : AR ${suhail.raHours} h, attendu ${attendu} h (HIP 44816)`,
  );
});
