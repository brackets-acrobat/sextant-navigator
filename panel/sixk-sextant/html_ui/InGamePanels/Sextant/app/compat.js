/**
 * Le plancher de langage du panneau.
 *
 * Coherent GT, le moteur qui affiche les panneaux de MSFS, est un WebKit 604 —
 * l'equivalent de Safari 11. Mesure, pas suppose : `tools/coherent-probe`
 * charge une sonde dans le vrai moteur et rend le releve.
 *
 * Ce qui MANQUE et qu'on ecrit sans y penser :
 *
 *   a ?? b          coalescence des nuls      -> ouSinon(a, b)
 *   a?.b            chainage optionnel        -> a && a.b
 *   { ...a, b }     decomposition d'objet     -> Object.assign({}, a, { b })
 *   class { #x }    champ prive               -> convention de nommage
 *   catch { }       catch sans parametre      -> catch (e)
 *
 * Ce qui PASSE : les modules ES, async/await, les generateurs, les classes et
 * leurs accesseurs, `**`, la decomposition de TABLEAU, le reste en
 * destructuration, Object.assign/entries/values, padStart, includes.
 *
 * Un seul de ces jetons fait echouer l'analyse du module entier — et `npm test`
 * ne le verra jamais, puisque Node les accepte tous.
 */

/**
 * `valeur ?? defaut`, ecrit a la main.
 *
 * NE PAS remplacer par `||` : une magnitude de 0, une bulle centree a 0° ou une
 * inclinaison nulle sont des VALEURS, pas des absences, et `||` les ecraserait
 * par le defaut sans rien dire.
 */
export function ouSinon(valeur, defaut) {
  return valeur === undefined || valeur === null ? defaut : valeur;
}
