/**
 * Le transport de droite.
 *
 * Sans lui, trois visées prises à trois minutes d'intervalle sont réduites
 * comme si l'avion n'avait pas bougé. Le point est alors faux d'un ordre de
 * grandeur proche de la course parcourue — et, plus traître, le chapeau reste
 * petit : les droites restent concourantes tout en désignant le mauvais endroit.
 *
 * Ces tests vérifient les deux choses qui comptent : que le transport ramène le
 * point sur la vérité, et qu'il le fait mieux que son absence.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { simulateSight, fixFromSights, advancePosition } from '../src/index.js';

const T0 = Date.UTC(2026, 0, 15, 4, 30, 0);
const START = { lat: 34.5, lon: -122.0 };
const FLIGHT = { altitudeFt: 9000, groundSpeedKt: 150, trackDeg: 285 };

/** Position vraie de l'appareil, en vol rectiligne uniforme. */
function truthAt(seconds) {
  return advancePosition(START, (FLIGHT.groundSpeedKt * seconds) / 3600, FLIGHT.trackDeg);
}

/** Trois visées parfaites, bien réparties en azimut, à trois instants. */
function logbook(bodies = ['Kochab', 'Procyon', 'Diphda'], offsets = [0, 150, 300]) {
  return bodies.map((body, i) => {
    const when = new Date(T0 + offsets[i] * 1000);
    return {
      utc: when.toISOString(),
      body,
      hs: simulateSight({ utc: when, body, actual: truthAt(offsets[i]), ...FLIGHT }).hs,
      ...FLIGHT,
    };
  });
}

function errorNm(fix, truth) {
  return Math.hypot(
    (fix.lat - truth.lat) * 60,
    (fix.lon - truth.lon) * 60 * Math.cos((truth.lat * Math.PI) / 180),
  );
}

test('transport — le point retombe sur la position de l’instant commun', () => {
  const sights = logbook();
  // L'estime du joueur, fausse de ~25 NM, rapportée à l'instant commun.
  const truthCommon = truthAt(300);
  const assumed = { lat: truthCommon.lat + 0.3, lon: truthCommon.lon + 0.3 };

  const fix = fixFromSights({ assumed, sights });

  assert.equal(fix.commonUtc, new Date(T0 + 300 * 1000).toISOString());
  const err = errorNm(fix, truthCommon);
  assert.ok(err < 0.15, `point à ${err.toFixed(2)} NM de la vérité, transport compris`);
  assert.ok(fix.rmsNm < 0.15, `chapeau ${fix.rmsNm.toFixed(2)} NM sur des visées parfaites`);
});

test('transport — sans lui, le point est faux de l’ordre de la course parcourue', () => {
  const sights = logbook();
  const truthCommon = truthAt(300);
  const assumed = { lat: truthCommon.lat + 0.3, lon: truthCommon.lon + 0.3 };

  const avec = fixFromSights({ assumed, sights });
  const sans = fixFromSights({ assumed, sights, transport: false });

  const errAvec = errorNm(avec, truthCommon);
  const errSans = errorNm(sans, truthCommon);

  // 300 s à 150 kt : 12,5 NM de course. L'erreur sans transport doit être de
  // cet ordre, et le transport doit la faire disparaître.
  assert.ok(errSans > 3, `sans transport, erreur attendue notable (obtenu ${errSans.toFixed(2)} NM)`);
  assert.ok(
    errAvec < errSans / 10,
    `le transport doit diviser l'erreur par bien plus que 10 : ${errAvec.toFixed(2)} contre ${errSans.toFixed(2)}`,
  );
});

test('transport — le chapeau ne trahit PAS son absence', () => {
  const sights = logbook();
  const truthCommon = truthAt(300);
  const assumed = { lat: truthCommon.lat + 0.3, lon: truthCommon.lon + 0.3 };
  const sans = fixFromSights({ assumed, sights, transport: false });

  // C'est tout l'intérêt du test : le point est faux de plusieurs milles et le
  // chapeau reste petit. Un navigateur qui ne se fie qu'au chapeau se fait
  // avoir, et c'est la raison d'être du transport.
  const err = errorNm(sans, truthCommon);
  assert.ok(err > 3, `le point doit être faux (obtenu ${err.toFixed(2)} NM)`);
  assert.ok(
    sans.rmsNm < err / 2,
    `chapeau ${sans.rmsNm.toFixed(2)} NM contre ${err.toFixed(2)} NM d'erreur : ` +
      'le chapeau doit rester petit malgré un point faux',
  );
});

test('transport — l’instant commun peut être choisi', () => {
  const sights = logbook();
  const truthFirst = truthAt(0);
  const assumed = { lat: truthFirst.lat + 0.2, lon: truthFirst.lon - 0.2 };

  const fix = fixFromSights({
    assumed,
    sights,
    commonUtc: new Date(T0).toISOString(),
  });

  const err = errorNm(fix, truthFirst);
  assert.ok(err < 0.15, `ramené à la première visée, erreur ${err.toFixed(2)} NM`);
  assert.ok(fix.runSpanNm > 10, 'la course rapportée doit couvrir la fenêtre');
});

test('advancePosition — une heure au 090 déplace de 60 milles vers l’est', () => {
  const p = advancePosition({ lat: 0, lon: 0 }, 60, 90);
  assert.ok(Math.abs(p.lat) < 1e-9, 'pas de déplacement en latitude');
  assert.ok(Math.abs(p.lon - 1) < 1e-6, `longitude ${p.lon}`);

  const q = advancePosition({ lat: 45, lon: 0 }, 60, 0);
  assert.ok(Math.abs(q.lat - 46) < 1e-9, 'plein nord : un degré par 60 milles');
});
