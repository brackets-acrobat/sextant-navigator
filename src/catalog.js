/**
 * Les 57 étoiles de navigation de l'almanach nautique, plus Polaris.
 *
 * Coordonnées à l'équinoxe J2000.0, mouvements propres en mas/an
 * (µα* inclut déjà cos δ, convention Hipparcos).
 *
 * Ce catalogue est saisi à la main, et c'est le seul endroit du noyau où une
 * faute ne se voit pas : rien ne devient incohérent, la droite de hauteur est
 * simplement fausse. Une seconde de temps en ascension droite déplace le point
 * de 0,2 NM, une minute le déplace de 15.
 *
 * RECOUPÉ, le 19 août 2026, ligne à ligne contre `reference/nav-stars.csv` —
 * positions Hipparcos servies par SIMBAD, interrogées par désignation de Bayer.
 * Les 58 étoiles tombent sur leur source à mieux de 0,1″, écart moyen 0,04″,
 * ce qui n'est que l'arrondi de la saisie en sexagésimal. `test/catalog.test.js`
 * refait la comparaison hors ligne à chaque `npm test`, et
 * `tools/fetch-star-reference.mjs` régénère la référence.
 *
 * La relecture a trouvé une faute, une seule : l'ascension droite de Suhail,
 * fausse de 0,89 s de temps. Voir son commentaire, plus bas.
 *
 * Les mouvements propres sont ceux du Hipparcos d'origine ; la référence sert
 * ceux de la réduction de 2007, qui en diffèrent de quelques mas/an. Sur les
 * 26 ans écoulés depuis J2000, l'écart pèse 0,002′ : on garde les valeurs
 * saisies, le test ne contrôle que le signe et l'ordre de grandeur.
 */

/**
 * @typedef {object} Star
 * @property {string} name       nom usuel, tel qu'il figure à l'almanach
 * @property {string} bayer      désignation de Bayer
 * @property {number} raHours    ascension droite J2000, en heures décimales
 * @property {number} decDeg     déclinaison J2000, en degrés décimaux
 * @property {number} pmRA       µα* en mas/an
 * @property {number} pmDec      µδ en mas/an
 * @property {number} magnitude  magnitude visuelle
 */

/** h m s → heures décimales */
const hms = (h, m, s) => h + m / 60 + s / 3600;
/** ° ′ ″ → degrés décimaux (le signe porte sur le tout) */
const dms = (sign, d, m, s) => sign * (d + m / 60 + s / 3600);

/** @type {Star[]} */
export const STARS = [
  { name: 'Alpheratz',       bayer: 'α And',  raHours: hms(0, 8, 23.26),   decDeg: dms(+1, 29, 5, 25.6),  pmRA: 135.68,   pmDec: -162.95, magnitude: 2.06 },
  { name: 'Ankaa',           bayer: 'α Phe',  raHours: hms(0, 26, 17.05),  decDeg: dms(-1, 42, 18, 21.6), pmRA: 232.76,   pmDec: -353.64, magnitude: 2.39 },
  { name: 'Schedar',         bayer: 'α Cas',  raHours: hms(0, 40, 30.44),  decDeg: dms(+1, 56, 32, 14.4), pmRA: 50.36,    pmDec: -32.17,  magnitude: 2.23 },
  { name: 'Diphda',          bayer: 'β Cet',  raHours: hms(0, 43, 35.37),  decDeg: dms(-1, 17, 59, 11.8), pmRA: 232.79,   pmDec: 32.71,   magnitude: 2.04 },
  { name: 'Achernar',        bayer: 'α Eri',  raHours: hms(1, 37, 42.85),  decDeg: dms(-1, 57, 14, 12.3), pmRA: 87.00,    pmDec: -38.24,  magnitude: 0.45 },
  { name: 'Hamal',           bayer: 'α Ari',  raHours: hms(2, 7, 10.41),   decDeg: dms(+1, 23, 27, 44.7), pmRA: 190.73,   pmDec: -145.77, magnitude: 2.00 },
  { name: 'Polaris',         bayer: 'α UMi',  raHours: hms(2, 31, 49.09),  decDeg: dms(+1, 89, 15, 50.8), pmRA: 44.48,    pmDec: -11.85,  magnitude: 1.97 },
  { name: 'Acamar',          bayer: 'θ Eri',  raHours: hms(2, 58, 15.68),  decDeg: dms(-1, 40, 18, 16.9), pmRA: -52.89,   pmDec: 21.98,   magnitude: 2.88 },
  { name: 'Menkar',          bayer: 'α Cet',  raHours: hms(3, 2, 16.77),   decDeg: dms(+1, 4, 5, 23.1),   pmRA: -11.81,   pmDec: -78.76,  magnitude: 2.53 },
  { name: 'Mirfak',          bayer: 'α Per',  raHours: hms(3, 24, 19.37),  decDeg: dms(+1, 49, 51, 40.2), pmRA: 24.11,    pmDec: -26.01,  magnitude: 1.79 },
  { name: 'Aldebaran',       bayer: 'α Tau',  raHours: hms(4, 35, 55.24),  decDeg: dms(+1, 16, 30, 33.5), pmRA: 62.78,    pmDec: -189.36, magnitude: 0.87 },
  { name: 'Rigel',           bayer: 'β Ori',  raHours: hms(5, 14, 32.27),  decDeg: dms(-1, 8, 12, 5.9),   pmRA: 1.31,     pmDec: 0.50,    magnitude: 0.18 },
  { name: 'Capella',         bayer: 'α Aur',  raHours: hms(5, 16, 41.36),  decDeg: dms(+1, 45, 59, 52.8), pmRA: 75.52,    pmDec: -427.13, magnitude: 0.08 },
  { name: 'Bellatrix',       bayer: 'γ Ori',  raHours: hms(5, 25, 7.86),   decDeg: dms(+1, 6, 20, 58.9),  pmRA: -8.75,    pmDec: -13.28,  magnitude: 1.64 },
  { name: 'Elnath',          bayer: 'β Tau',  raHours: hms(5, 26, 17.51),  decDeg: dms(+1, 28, 36, 26.8), pmRA: 23.28,    pmDec: -174.22, magnitude: 1.65 },
  { name: 'Alnilam',         bayer: 'ε Ori',  raHours: hms(5, 36, 12.81),  decDeg: dms(-1, 1, 12, 6.9),   pmRA: 1.49,     pmDec: -1.06,   magnitude: 1.69 },
  { name: 'Betelgeuse',      bayer: 'α Ori',  raHours: hms(5, 55, 10.31),  decDeg: dms(+1, 7, 24, 25.4),  pmRA: 27.33,    pmDec: 10.86,   magnitude: 0.45 },
  { name: 'Canopus',         bayer: 'α Car',  raHours: hms(6, 23, 57.11),  decDeg: dms(-1, 52, 41, 44.4), pmRA: 19.93,    pmDec: 23.24,   magnitude: -0.62 },
  { name: 'Sirius',          bayer: 'α CMa',  raHours: hms(6, 45, 8.92),   decDeg: dms(-1, 16, 42, 58.0), pmRA: -546.01,  pmDec: -1223.07, magnitude: -1.44 },
  { name: 'Adhara',          bayer: 'ε CMa',  raHours: hms(6, 58, 37.55),  decDeg: dms(-1, 28, 58, 19.5), pmRA: 2.63,     pmDec: 2.29,    magnitude: 1.50 },
  { name: 'Procyon',         bayer: 'α CMi',  raHours: hms(7, 39, 18.12),  decDeg: dms(+1, 5, 13, 30.0),  pmRA: -714.59,  pmDec: -1036.80, magnitude: 0.40 },
  { name: 'Pollux',          bayer: 'β Gem',  raHours: hms(7, 45, 18.95),  decDeg: dms(+1, 28, 1, 34.3),  pmRA: -625.69,  pmDec: -45.95,  magnitude: 1.16 },
  { name: 'Avior',           bayer: 'ε Car',  raHours: hms(8, 22, 30.84),  decDeg: dms(-1, 59, 30, 34.1), pmRA: -25.34,   pmDec: 22.72,   magnitude: 1.86 },
  // AR corrigée le 19/08/2026 : 9h 08m 00,65s → 9h 07m 59,758s (HIP 44816).
  // La coquille valait 0,89 s de temps, soit 9,7″ et 0,18 NM sur la droite.
  { name: 'Suhail',          bayer: 'λ Vel',  raHours: hms(9, 7, 59.758),  decDeg: dms(-1, 43, 25, 57.3), pmRA: -23.21,   pmDec: 14.28,   magnitude: 2.23 },
  { name: 'Miaplacidus',     bayer: 'β Car',  raHours: hms(9, 13, 11.98),  decDeg: dms(-1, 69, 43, 1.9),  pmRA: -157.66,  pmDec: 108.91,  magnitude: 1.67 },
  { name: 'Alphard',         bayer: 'α Hya',  raHours: hms(9, 27, 35.24),  decDeg: dms(-1, 8, 39, 30.9),  pmRA: -14.49,   pmDec: 33.25,   magnitude: 1.99 },
  { name: 'Regulus',         bayer: 'α Leo',  raHours: hms(10, 8, 22.31),  decDeg: dms(+1, 11, 58, 1.9),  pmRA: -249.40,  pmDec: 4.91,    magnitude: 1.36 },
  { name: 'Dubhe',           bayer: 'α UMa',  raHours: hms(11, 3, 43.67),  decDeg: dms(+1, 61, 45, 3.7),  pmRA: -136.46,  pmDec: -35.25,  magnitude: 1.81 },
  { name: 'Denebola',        bayer: 'β Leo',  raHours: hms(11, 49, 3.58),  decDeg: dms(+1, 14, 34, 19.4), pmRA: -497.68,  pmDec: -114.67, magnitude: 2.14 },
  { name: 'Gienah',          bayer: 'γ Crv',  raHours: hms(12, 15, 48.37), decDeg: dms(-1, 17, 32, 30.9), pmRA: -159.58,  pmDec: 22.31,   magnitude: 2.59 },
  { name: 'Acrux',           bayer: 'α Cru',  raHours: hms(12, 26, 35.90), decDeg: dms(-1, 63, 5, 56.7),  pmRA: -35.83,   pmDec: -14.86,  magnitude: 0.77 },
  { name: 'Gacrux',          bayer: 'γ Cru',  raHours: hms(12, 31, 9.96),  decDeg: dms(-1, 57, 6, 47.6),  pmRA: 27.94,    pmDec: -264.33, magnitude: 1.59 },
  { name: 'Alioth',          bayer: 'ε UMa',  raHours: hms(12, 54, 1.75),  decDeg: dms(+1, 55, 57, 35.4), pmRA: 111.91,   pmDec: -8.24,   magnitude: 1.76 },
  { name: 'Spica',           bayer: 'α Vir',  raHours: hms(13, 25, 11.58), decDeg: dms(-1, 11, 9, 40.8),  pmRA: -42.50,   pmDec: -31.73,  magnitude: 0.98 },
  { name: 'Alkaid',          bayer: 'η UMa',  raHours: hms(13, 47, 32.44), decDeg: dms(+1, 49, 18, 47.8), pmRA: -121.23,  pmDec: -15.56,  magnitude: 1.85 },
  { name: 'Hadar',           bayer: 'β Cen',  raHours: hms(14, 3, 49.41),  decDeg: dms(-1, 60, 22, 22.9), pmRA: -33.96,   pmDec: -23.16,  magnitude: 0.61 },
  { name: 'Menkent',         bayer: 'θ Cen',  raHours: hms(14, 6, 40.95),  decDeg: dms(-1, 36, 22, 11.8), pmRA: -519.29,  pmDec: -517.87, magnitude: 2.06 },
  { name: 'Arcturus',        bayer: 'α Boo',  raHours: hms(14, 15, 39.67), decDeg: dms(+1, 19, 10, 56.7), pmRA: -1093.45, pmDec: -1999.40, magnitude: -0.05 },
  { name: 'Rigil Kentaurus', bayer: 'α Cen',  raHours: hms(14, 39, 36.49), decDeg: dms(-1, 60, 50, 2.3),  pmRA: -3608.08, pmDec: 686.55,  magnitude: -0.01 },
  { name: 'Kochab',          bayer: 'β UMi',  raHours: hms(14, 50, 42.33), decDeg: dms(+1, 74, 9, 19.8),  pmRA: -32.29,   pmDec: 11.91,   magnitude: 2.07 },
  { name: 'Zubenelgenubi',   bayer: 'α² Lib', raHours: hms(14, 50, 52.71), decDeg: dms(-1, 16, 2, 30.4),  pmRA: -105.68,  pmDec: -68.40,  magnitude: 2.75 },
  { name: 'Alphecca',        bayer: 'α CrB',  raHours: hms(15, 34, 41.27), decDeg: dms(+1, 26, 42, 52.9), pmRA: 120.38,   pmDec: -89.44,  magnitude: 2.22 },
  { name: 'Antares',         bayer: 'α Sco',  raHours: hms(16, 29, 24.46), decDeg: dms(-1, 26, 25, 55.2), pmRA: -10.16,   pmDec: -23.21,  magnitude: 1.06 },
  { name: 'Atria',           bayer: 'α TrA',  raHours: hms(16, 48, 39.90), decDeg: dms(-1, 69, 1, 39.8),  pmRA: 17.85,    pmDec: -32.92,  magnitude: 1.91 },
  { name: 'Sabik',           bayer: 'η Oph',  raHours: hms(17, 10, 22.69), decDeg: dms(-1, 15, 43, 29.7), pmRA: 41.16,    pmDec: 97.65,   magnitude: 2.43 },
  { name: 'Shaula',          bayer: 'λ Sco',  raHours: hms(17, 33, 36.52), decDeg: dms(-1, 37, 6, 13.8),  pmRA: -8.90,    pmDec: -29.95,  magnitude: 1.62 },
  { name: 'Rasalhague',      bayer: 'α Oph',  raHours: hms(17, 34, 56.07), decDeg: dms(+1, 12, 33, 36.1), pmRA: 110.08,   pmDec: -222.61, magnitude: 2.08 },
  { name: 'Eltanin',         bayer: 'γ Dra',  raHours: hms(17, 56, 36.37), decDeg: dms(+1, 51, 29, 20.0), pmRA: -8.48,    pmDec: -22.79,  magnitude: 2.23 },
  { name: 'Kaus Australis',  bayer: 'ε Sgr',  raHours: hms(18, 24, 10.32), decDeg: dms(-1, 34, 23, 4.6),  pmRA: -39.61,   pmDec: -124.05, magnitude: 1.79 },
  { name: 'Vega',            bayer: 'α Lyr',  raHours: hms(18, 36, 56.34), decDeg: dms(+1, 38, 47, 1.3),  pmRA: 200.94,   pmDec: 286.23,  magnitude: 0.03 },
  { name: 'Nunki',           bayer: 'σ Sgr',  raHours: hms(18, 55, 15.93), decDeg: dms(-1, 26, 17, 48.2), pmRA: 13.87,    pmDec: -52.65,  magnitude: 2.05 },
  { name: 'Altair',          bayer: 'α Aql',  raHours: hms(19, 50, 47.00), decDeg: dms(+1, 8, 52, 5.9),   pmRA: 536.82,   pmDec: 385.54,  magnitude: 0.76 },
  { name: 'Peacock',         bayer: 'α Pav',  raHours: hms(20, 25, 38.86), decDeg: dms(-1, 56, 44, 6.3),  pmRA: 7.71,     pmDec: -86.15,  magnitude: 1.94 },
  { name: 'Deneb',           bayer: 'α Cyg',  raHours: hms(20, 41, 25.92), decDeg: dms(+1, 45, 16, 49.2), pmRA: 1.99,     pmDec: 1.95,    magnitude: 1.25 },
  { name: 'Enif',            bayer: 'ε Peg',  raHours: hms(21, 44, 11.16), decDeg: dms(+1, 9, 52, 30.0),  pmRA: 30.02,    pmDec: 1.38,    magnitude: 2.38 },
  { name: "Al Na'ir",        bayer: 'α Gru',  raHours: hms(22, 8, 13.99),  decDeg: dms(-1, 46, 57, 39.5), pmRA: 127.60,   pmDec: -147.91, magnitude: 1.73 },
  { name: 'Fomalhaut',       bayer: 'α PsA',  raHours: hms(22, 57, 39.05), decDeg: dms(-1, 29, 37, 20.1), pmRA: 329.22,   pmDec: -164.22, magnitude: 1.17 },
  { name: 'Markab',          bayer: 'α Peg',  raHours: hms(23, 4, 45.65),  decDeg: dms(+1, 15, 12, 18.9), pmRA: 61.10,    pmDec: -42.56,  magnitude: 2.49 },
];

/** Index par nom, insensible à la casse et aux accents d'usage. */
const BY_NAME = new Map(STARS.map((s) => [s.name.toLowerCase(), s]));

/** @returns {Star|undefined} */
export function findStar(name) {
  return BY_NAME.get(String(name).toLowerCase());
}

export const STAR_NAMES = STARS.map((s) => s.name);
