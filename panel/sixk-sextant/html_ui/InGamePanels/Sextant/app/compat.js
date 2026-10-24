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

/**
 * FORCER LA PRESENTATION D'UN CANVAS.
 *
 * Mesure du 24 octobre 2026, apres la Sim Update 7 : le moteur ne porte plus a
 * l'ecran ce qu'on peint dans un canvas tant que la FENETRE du panneau n'a pas
 * ete remuee — redimensionnee, reduite, fermee et rouverte. Le texte du DOM,
 * lui, continue de s'afficher : l'horloge zulu avance normalement pendant que
 * l'oculaire, les cinq molettes et les commandes peintes restent sur leur
 * derniere image.
 *
 * C'est ce partage qui a donne le diagnostic. Tout ce qui se met a jour seul
 * est du texte ; tout ce qui attend une reouverture est un canvas. Sans
 * exception. Vu du joueur l'instrument est mort, alors qu'il calcule et
 * dessine vingt fois par seconde — le compteur de repeintures le prouvait.
 *
 * Le remede : toucher une propriete de style de l'element a chaque repeinture
 * REELLE, pour que le moteur reprenne sa couche. L'opacite alterne entre 1 et
 * 0,999 — invisible a l'oeil sur une couche deja opaque, et c'est le
 * changement qui compte, pas la valeur.
 *
 * A APPELER DEPUIS LE DESSIN, donc depuis le rappel d'animation du moteur.
 * JAMAIS depuis une minuterie : le meme jour, un `setInterval` qui peignait
 * hors de l'image du moteur a fait tomber `CoherentGTCore.dll` sur une
 * violation d'acces, et le simulateur avec. Ce qui peint appartient a l'image.
 */
export function presenter(canvas) {
  if (!canvas || !canvas.style) return;
  canvas.style.opacity = canvas.style.opacity === '0.999' ? '1' : '0.999';
}
