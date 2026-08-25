/**
 * Domaine de validité du noyau.
 *
 * Rien ici n'est perpétuel. Les polynômes de précession (IAU 1976) sont
 * cubiques en T et Meeus met explicitement en garde contre leur usage au-delà
 * de quelques siècles ; les séries du Soleil et de la Lune sont tronquées ; le
 * mouvement propre est linéaire, ce qui trahit les étoiles rapides sur la
 * longue durée.
 *
 * Hors de 1900-2100, le calcul continue de produire des nombres — c'est
 * précisément le danger. Ce module existe pour qu'un chiffre faux ne sorte
 * jamais en silence.
 */

export const EPOCH_MIN_YEAR = 1900;
export const EPOCH_MAX_YEAR = 2100;

/** @typedef {'warn'|'throw'|'silent'} EpochPolicy */

/** @type {EpochPolicy} */
let policy = 'warn';

/** Années déjà signalées, pour ne pas inonder la console à 30 images/seconde. */
const alreadyWarned = new Set();

/**
 * Choisit la conduite à tenir hors domaine.
 *
 *   'warn'   (défaut) — un avertissement console une fois par année fautive,
 *                       et un champ `epochWarning` dans les résultats.
 *   'throw'  — lève une RangeError. À utiliser dans les tests et les outils
 *              hors ligne, jamais dans un panneau : le simulateur laisse régler
 *              n'importe quelle date, et planter l'affichage serait pire que
 *              d'afficher un chiffre marqué comme douteux.
 *   'silent' — n'avertit pas, mais renseigne quand même `epochWarning`.
 *
 * @param {EpochPolicy} next
 * @returns {EpochPolicy} la politique précédente, pour pouvoir la restaurer
 */
export function setEpochPolicy(next) {
  if (!['warn', 'throw', 'silent'].includes(next)) {
    throw new TypeError(`Politique d'époque inconnue : « ${next} »`);
  }
  const previous = policy;
  policy = next;
  return previous;
}

export function getEpochPolicy() {
  return policy;
}

/** Remet à zéro la mémoire des avertissements déjà émis. */
export function resetEpochWarnings() {
  alreadyWarned.clear();
}

/**
 * @typedef {object} EpochWarning
 * @property {number} year        année demandée
 * @property {number} minYear
 * @property {number} maxYear
 * @property {number} yearsOutside distance au bord du domaine, en années
 * @property {string} message
 */

/**
 * Vérifie qu'une date tombe dans le domaine garanti.
 *
 * @param {Date} date
 * @returns {EpochWarning|null} null si tout va bien
 */
export function checkEpoch(date) {
  const year = date.getUTCFullYear();
  if (year >= EPOCH_MIN_YEAR && year <= EPOCH_MAX_YEAR) return null;

  const yearsOutside =
    year < EPOCH_MIN_YEAR ? EPOCH_MIN_YEAR - year : year - EPOCH_MAX_YEAR;

  const message =
    `Date hors du domaine garanti : ${year} (le noyau est validé de ` +
    `${EPOCH_MIN_YEAR} à ${EPOCH_MAX_YEAR}, soit ${yearsOutside} an` +
    `${yearsOutside > 1 ? 's' : ''} au-delà). ` +
    'Les positions restent physiquement cohérentes mais la précision annoncée ' +
    'ne tient plus : la précession dérive la première, puis la Lune.';

  /** @type {EpochWarning} */
  const warning = { year, minYear: EPOCH_MIN_YEAR, maxYear: EPOCH_MAX_YEAR, yearsOutside, message };

  if (policy === 'throw') throw new RangeError(message);
  if (policy === 'warn' && !alreadyWarned.has(year)) {
    alreadyWarned.add(year);
    console.warn(`[sextant] ${message}`);
  }

  return warning;
}
