# Sextant Navigator

**La table du navigateur astronomique, pour le sextant à bulle de Microsoft
Flight Simulator 2024.**

Le sextant vit dans le simulateur. La table est ici. Et les deux ne se disent
que le strict nécessaire : la table désigne l'astre à viser, le sextant renvoie
ses hauteurs.

**La table ne sait jamais où vous êtes.** Ce n'est pas une limite, c'est le
sujet : un navigateur astronomique ne connaît sa position que parce qu'il l'a
déduite de ses visées. Cette séparation est structurelle — l'application ne
parle pas au simulateur, elle n'a aucun moyen de tricher.

[Télécharger l'installeur](https://github.com/brackets-acrobat/sextant-navigator/releases/latest)
· Windows · GPL-3.0-or-later

## La boucle

**Le catalogue** dit quels astres le ciel offre à cet instant, avec leur
gisement et leur hauteur, et lequel donne le meilleur angle de coupe. On y
choisit l'astre, on l'envoie au sextant.

**Le carnet** reçoit les visées, les réduit contre l'estime, transporte les
droites à un instant commun, et rend le point, son chapeau et le vent qui s'en
déduit.

**La planchette** les trace comme sur une vraie feuille de position : les
droites, leur intersection, l'échelle en milles.

**L'étalonnage** vous fait découvrir, au parking, l'erreur d'index de votre
propre exemplaire — une série de visées depuis une position connue. Chaque
sextant a la sienne, et le jeu ne vous la dit pas.

Autour, ce qu'il faut pour porter le vol sur la carte : des aérodromes et des
radionavaids qui viennent du simulateur lui-même — les vôtres, terrains add-on
compris — le plan de vol et son log de navigation, le profil du relief avec
altitude minimale par branche, la recherche mondiale, la rose des vents
magnétique et les chronomètres.

## Ce que ce dépôt ne contient pas

**Le panneau du simulateur.** L'instrument lui-même — l'oculaire, les molettes,
la bulle, l'intégrateur — est un paquet Community de MSFS 2024, avec son propre
cycle de sortie. Il n'est pas ici.

L'application marche sans lui : le carnet, la réduction, la planchette et la
carte fonctionnent avec des visées saisies à la main. Le pont attend simplement
que quelqu'un se présente.

## Le noyau

`src/` calcule les positions célestes et réduit les visées. JavaScript ESM,
**aucune dépendance**, il tourne tel quel sous Node.

| | |
|---|---|
| **Soleil** | position apparente, demi-diamètre, parallaxe |
| **Lune** | série ELP tronquée, 60 + 60 termes, parallaxe, phase et orientation du croissant |
| **58 étoiles** | les 57 de l'almanach nautique, plus Polaris — recoupées sur Hipparcos |
| **4 planètes** | Vénus, Mars, Jupiter, Saturne — VSOP87 tronqué, recoupé sur JPL Horizons |
| **Repères** | GHA, SHA, déclinaison, GHA Aries — conventions almanach |
| **Réduction** | LHA, Hc, Zn, intercept de Marcq Saint-Hilaire |
| **Corrections** | réfraction avec l'altitude, parallaxe, erreur d'index, Coriolis |
| **Transport** | les droites ramenées à un instant commun, à la route et à la vitesse *estimées* |
| **Point** | moindres carrés sur *n* droites, itéré, avec chapeau et résidus |
| **Sens inverse** | hauteur vraie → lecture du tambour, pour alimenter l'instrument |
| **Qualité** | angle de coupe, dilution de l'erreur, meilleur trio d'astres |
| **Estime** | triangle des vitesses direct — le vent SUPPOSÉ, jamais le vent réel |
| **Vent trouvé** | le sens inverse : position air contre point observé → le vent subi |

### Les deux sens, et pourquoi il ne faut jamais les mélanger

`simulateSight()` part de la position **réelle** que le simulateur connaît et
rend ce que le tambour doit afficher. `sight()` part de ce que le joueur a **lu**
au tambour et rend un intercept contre son estime.

Les deux sont inverses l'un de l'autre, et un test le prouve : un joueur qui
connaîtrait sa position exacte obtient un intercept sous **0,01 NM**.

### Deux leçons que les tests portent

**Un chapeau serré ne prouve pas un point juste.** Trois droites concourantes à
0,02 NM autour d'un point faux de 6,9 NM : une erreur systématique déplace le
point sans ouvrir le triangle. C'est le transport des droites qui l'a corrigé.

**L'erreur d'index et l'erreur personnelle sont inséparables**, et l'AFM 51-40
refuse de les séparer. Un joueur qui collimate toujours un peu haut verra son
biais absorbé par l'étalonnage — exactement comme un vrai navigateur.

### Précision mesurée

| | |
|---|---|
| Chaîne de calcul seule, visées parfaites | **0,00 NM** |
| Au sol, visées réelles | **0,2 NM** |
| En vol, trois visées | **2 à 3 NM** |

L'astro aérienne historique tenait 5 à 10 NM en pratique. Les 0,2 NM du sol
valent 0,2′ d'erreur de hauteur — sous le demi-pixel de champ à ×5. Tout écart
supérieur vient du geste et des conditions, pas du calcul.

## Démarrer

```bash
npm install --prefix desk
npm start --prefix desk
```

Si Electron ne se lance pas, voir `desk/README.md` — `npm install` échoue
silencieusement à extraire son binaire sous Windows, et `npm run force-electron`
est là pour ça.

### Les tests

```bash
npm test
```

126 tests pour le noyau — éphémérides contre Meeus, catalogue contre Hipparcos,
planètes contre JPL Horizons, ΔT contre les valeurs observées, la géométrie de
la réduction, le transport, l'étalonnage et la mise en feuille.

```bash
npm test --prefix desk
```

66 tests pour l'application — le pont, le carnet, la réduction, le vent, la
planchette, l'étalonnage.

### La démonstration

```bash
node examples/vol-de-nuit.js
```

Une traversée de l'Atlantique nord en DC-3, de la lecture du ciel au point
final, sans rien installer.

### L'installeur

```bash
npm run dist --prefix desk
```

Voir `desk/README.md` pour ce que la configuration a de non évident — en
particulier `asarUnpack`, sans lequel l'application installée ne trouve plus le
simulateur alors qu'elle marche parfaitement en développement.

## Structure

```
desk/            l'application Electron — voir son propre README
src/             le noyau : éphémérides, réduction, point, estime
test/            les tests du noyau
reference/       positions Hipparcos et JPL Horizons, versionnées avec leur provenance
examples/        une traversée complète, exécutable
documentation/   « Du sextant au point » et sa version anglaise
```

`reference/` n'est pas décoratif : `catalog.test.js` et `planets.test.js` le
lisent. Sans lui, `npm test` échoue sur une lecture de fichier.

## Domaine de validité

**1900 à 2100.** Au-delà, les polynômes de précession dérivent, les séries sont
tronquées et le mouvement propre linéaire trahit les étoiles rapides.

Le danger n'est pas que le calcul s'arrête, c'est qu'il **continue** : hors
domaine, les formules rendent des nombres d'allure normale. Le noyau les marque
donc au lieu de les laisser passer en silence — un champ `epochWarning` dans les
résultats, et un avertissement console une fois par année fautive. Les tests et
les outils hors ligne peuvent demander une exception à la place ; un panneau de
simulateur, non — on y règle n'importe quelle date, et planter l'affichage
serait pire qu'afficher un chiffre signalé comme douteux.

Le catalogue d'étoiles porte le mouvement propre : à 1943, une position figée à
une époque récente serait fausse de près d'une minute d'arc.

## Licence

GPL-3.0-or-later. Copyright © 2026 Cyril MILANI.

L'extraction des navaids depuis MSFS 2024 s'inspire directement de la méthode du
projet [atools / Little Navmap](https://github.com/albar965/atools) d'Alexander
Barthel.
