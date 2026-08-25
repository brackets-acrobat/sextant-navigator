/**
 * Domaine de validité : les branches de ΔT et le garde-fou 1900-2100.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { deltaT } from '../src/time.js';
import {
  checkEpoch,
  setEpochPolicy,
  getEpochPolicy,
  resetEpochWarnings,
  EPOCH_MIN_YEAR,
  EPOCH_MAX_YEAR,
} from '../src/epoch.js';
import { timeContext, almanacPage, sight, simulateSight, visibleBodies } from '../src/index.js';

// ---------------------------------------------------------------------------
// ΔT
// ---------------------------------------------------------------------------

/**
 * Valeurs observées (Espenak / IERS), au milieu de l'année.
 * Les branches doivent coller à mieux qu'une seconde sur tout le domaine
 * garanti — soit moins de 0,01′ sur la Lune, invisible au sextant.
 */
const DELTA_T_REFERENCE = {
  1900: -2.7,
  1910: 10.4,
  1920: 21.2,
  1930: 24.0,
  1943: 25.4,
  1950: 29.1,
  1960: 33.2,
  1970: 40.2,
  1980: 50.5,
  1990: 56.9,
  2000: 63.8,
  2010: 66.1,
  2050: 93.4,
};

test('ΔT — les branches couvrent 1900-2050 à mieux qu’une seconde', () => {
  for (const [year, ref] of Object.entries(DELTA_T_REFERENCE)) {
    const mine = deltaT(Number(year), 7);
    const err = Math.abs(mine - ref);
    assert.ok(
      err < 1.5,
      `${year} : ΔT = ${mine.toFixed(2)} s au lieu de ${ref} s (écart ${err.toFixed(2)} s)`,
    );
  }
});

test('ΔT — l’époque des warbirds est désormais juste', () => {
  // C'était le trou : avant l'ajout des branches 1900-1961, la formule
  // séculaire générique se trompait de 10 s en 1960, soit 0,09′ sur la Lune.
  for (const year of [1920, 1943, 1960]) {
    const err = Math.abs(deltaT(year, 7) - DELTA_T_REFERENCE[year]);
    assert.ok(err < 1.0, `${year} : écart de ${err.toFixed(2)} s`);
  }
});

test('ΔT — continuité aux raccords de branches', () => {
  // Un saut à la frontière trahirait une faute de recopie du polynôme.
  for (const boundary of [1920, 1941, 1961, 1986, 2005, 2050]) {
    const avant = deltaT(boundary - 0.001, 6.5);
    const apres = deltaT(boundary + 0.001, 6.5);
    assert.ok(
      Math.abs(avant - apres) < 0.6,
      `saut de ${(apres - avant).toFixed(2)} s au raccord de ${boundary}`,
    );
  }
});

test('ΔT — croissance monotone sur le domaine garanti', () => {
  let precedent = -Infinity;
  for (let y = 1900; y <= 2100; y += 1) {
    const v = deltaT(y, 7);
    assert.ok(Number.isFinite(v), `ΔT non fini en ${y}`);
    // La rotation terrestre ralentit : ΔT ne redescend pas sur cette période.
    assert.ok(v > precedent - 0.5, `ΔT recule en ${y} : ${v} après ${precedent}`);
    precedent = v;
  }
});

// ---------------------------------------------------------------------------
// Garde-fou
// ---------------------------------------------------------------------------

test('domaine — les bornes annoncées', () => {
  assert.equal(EPOCH_MIN_YEAR, 1900);
  assert.equal(EPOCH_MAX_YEAR, 2100);
});

test('domaine — une date valide ne produit aucun avertissement', () => {
  const precedente = setEpochPolicy('throw');
  try {
    for (const iso of ['1900-01-01T00:00:00Z', '2026-08-19T12:00:00Z', '2100-12-31T23:59:59Z']) {
      assert.equal(checkEpoch(new Date(iso)), null, iso);
      assert.equal(timeContext(iso).epochWarning, null, iso);
    }
  } finally {
    setEpochPolicy(precedente);
  }
});

test('domaine — hors bornes, l’avertissement est renseigné et chiffré', () => {
  const precedente = setEpochPolicy('silent');
  try {
    const avant = checkEpoch(new Date('1850-06-01T00:00:00Z'));
    assert.ok(avant, 'aucun avertissement pour 1850');
    assert.equal(avant.year, 1850);
    assert.equal(avant.yearsOutside, 50);
    assert.match(avant.message, /1900/);

    const apres = checkEpoch(new Date('2400-06-01T00:00:00Z'));
    assert.equal(apres.yearsOutside, 300);
  } finally {
    setEpochPolicy(precedente);
  }
});

test('domaine — la politique « throw » refuse de calculer', () => {
  const precedente = setEpochPolicy('throw');
  try {
    assert.throws(() => timeContext('1850-06-01T00:00:00Z'), RangeError);
    assert.throws(() => almanacPage('2400-06-01T00:00:00Z'), /hors du domaine garanti/);
  } finally {
    setEpochPolicy(precedente);
  }
});

test('domaine — la politique « warn » n’avertit qu’une fois par année', () => {
  const precedente = setEpochPolicy('warn');
  resetEpochWarnings();
  const vrai = console.warn;
  const messages = [];
  console.warn = (m) => messages.push(m);
  try {
    for (let i = 0; i < 5; i += 1) timeContext('1850-06-01T00:00:00Z');
    timeContext('1851-06-01T00:00:00Z');
    assert.equal(messages.length, 2, `messages émis : ${messages.length}`);
    assert.match(messages[0], /\[sextant\]/);
  } finally {
    console.warn = vrai;
    setEpochPolicy(precedente);
    resetEpochWarnings();
  }
});

test('domaine — l’avertissement remonte dans tous les résultats publics', () => {
  const precedente = setEpochPolicy('silent');
  try {
    const utc = '1850-06-01T22:00:00Z';
    const assumed = { lat: 48, lon: -20 };

    assert.ok(almanacPage(utc).epochWarning);
    assert.ok(sight({ utc, body: 'Vega', assumed }).epochWarning);
    assert.ok(sight({ utc, body: 'Vega', assumed, hs: 40 }).epochWarning);
    assert.ok(simulateSight({ utc, body: 'Vega', actual: assumed }).epochWarning);
    assert.ok(visibleBodies({ utc, position: assumed }).epochWarning);

    // Et il vaut null quand tout va bien — le champ est toujours présent, donc
    // exploitable sans test d'existence côté panneau.
    const ok = '2026-08-19T22:00:00Z';
    assert.equal(almanacPage(ok).epochWarning, null);
    assert.equal(sight({ utc: ok, body: 'Vega', assumed }).epochWarning, null);
  } finally {
    setEpochPolicy(precedente);
  }
});

test('domaine — hors bornes, on calcule quand même (mode dégradé assumé)', () => {
  const precedente = setEpochPolicy('silent');
  try {
    const page = almanacPage('1750-06-21T12:00:00Z');
    assert.ok(Number.isFinite(page.sun.dec));
    assert.ok(Math.abs(page.sun.dec) < 23.6, 'la physique reste juste');
    assert.ok(page.ghaAries >= 0 && page.ghaAries < 360);
  } finally {
    setEpochPolicy(precedente);
  }
});

test('domaine — une politique inconnue est refusée', () => {
  assert.throws(() => setEpochPolicy('peut-être'), TypeError);
  assert.equal(getEpochPolicy(), 'warn', 'la politique par défaut a été abîmée');
});

test('domaine — une date invalide est rejetée tout de suite', () => {
  assert.throws(() => timeContext('pas une date'), TypeError);
  assert.throws(() => timeContext(NaN), TypeError);
});
