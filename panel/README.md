# Le panneau — phase 1

Un sextant à bulle qui vit dans le cockpit de MSFS 2024. Pas d'exécutable, pas
de MobiFlight, pas de pont : un dossier à déposer dans `Community`.

## La coupure : le panneau EST l'instrument

Décidé et fait le 20 août 2026. Tout ce qui était sous le bouton de visée est
parti à la table du navigateur — l'application Electron. C'est la division
historique : le sextant sous l'astrodôme, la planchette à la station de nav.

| Reste dans le panneau | Part à l'application |
|---|---|
| horloge, champ, compteurs | choix de l'astre |
| cinq molettes, roue de filtres | étalonnage |
| grossissement, poussoir | estime et erreur d'index |
| l'erreur cachée de l'exemplaire | carnet, point, débriefing |

Bilan : **1 469 → 822 lignes** dans `app.js`, 291 lignes de feuille de style en
moins, et 24 identifiants disparus du HTML. Aucune référence morte, aucune
classe sans style, aucun identifiant orphelin.

**Ce que le panneau garde du jeu, et rien d'autre** : l'erreur d'index réelle de
l'exemplaire. Elle appartient à l'instrument, pas au navigateur, et elle doit
survivre à tout. Les visées faites restent en mémoire en attendant que le pont
les emporte.

### Le pont — posé

`app/pont.js`. Le panneau ouvre une WebSocket sur `ws://127.0.0.1:8787`, tenue
par l'application. C'est le seul sens possible : un panneau MSFS peut ouvrir une
connexion, il ne peut pas en recevoir une.

Deux choses passent, et rien d'autre :

| | |
|---|---|
| table → sextant | la **consigne** — quel astre viser, et les indications pour le trouver |
| table → sextant | le **carnet** — les identifiants des visées que la table détient |
| sextant → table | la **file** — les visées qu'elle ne détient pas encore |

Ce qui NE passe pas est aussi important : l'application ne demande au panneau ni
la position, ni l'heure. Elle les lit elle-même par SimConnect. Le panneau reste
donc le seul à toucher au simulateur pour ce qui est de l'instrument, et les
deux moitiés ne se marchent jamais dessus.

**La consigne est affichée telle quelle, et elle vieillit.** C'est le papier que
le navigateur passe à l'observateur : `VEGA · Gt 170° · h 38°`. Elle n'est pas
rafraîchie avec la vérité du simulateur — ce serait donner la réponse, alors que
le travail de l'observateur est justement de trouver l'astre à partir d'une
indication qui date. Quand l'appareil a tourné, c'est au navigateur d'en
repasser une.

**Trois choses que `pont.js` tient, et qui ne sont pas des détails :**

1. **L'application peut ne pas être là.** On vole, on vise, on range : le
   sextant marche seul.
2. **Une visée n'est oubliée que contre la preuve qu'elle est ÉCRITE**, côté
   application. La table annonce les identifiants qu'elle détient — pas un
   accusé par visée, mais son carnet, répété à chaque rangement, à chaque
   branchement et toutes les cinq secondes tant que la file n'est pas vide. Deux
   minutes de collimation ne se perdent pas parce qu'une fenêtre s'est fermée,
   ni parce qu'un disque était plein, ni — depuis le 25 août 2026 — parce qu'un
   message unique s'est perdu en route : c'était un accusé de réception, il
   n'avait qu'une chance, et une visée bloquée l'était définitivement.

   L'annonce est **idempotente** : la rejouer ne coûte rien, donc rien n'a
   besoin d'arriver à coup sûr. C'est ce qui remplace la fiabilité qu'on ne peut
   pas avoir.
3. **On ne martèle pas.** Le délai de reconnexion double à chaque échec, de 1 à
   10 secondes : un panneau qui réessaie dix fois par seconde pendant tout un
   vol coûte des images au simulateur pour rien.

Le port est **en dur des deux côtés** — un panneau MSFS ne lit aucun fichier de
réglages. Le changer oblige à le changer ici *et* dans `config.json` de
l'application ; c'est écrit en face du réglage, là-bas.

**Le provisoire est retiré.** `refreshBodies()` ne choisit plus l'astre : il ne
sert plus qu'à fournir les magnitudes au dessin du champ. Une seule exception,
bornée : tant que la table ne s'est **jamais** manifestée depuis le démarrage du
panneau, un astre est retenu d'office — sinon le sextant lancé seul n'aurait
rien à montrer dans son champ. La plaque de consigne affiche alors « table non
connectée », donc personne ne peut le prendre pour une consigne. Dès que la
table parle une fois, elle commande seule, y compris pour dire « aucun astre ».

### Les deux commandes peintes

Le sélecteur de grossissement et le poussoir étaient en HTML et juraient à côté
du champ et des tambours, qui sont peints. Ils sont maintenant dans
`app/controls.js`, avec le même vocabulaire que `drum.js` : lumière clé en haut
à gauche, rebond froid en bas à droite, arête claire et arête sombre, gravure à
deux traits. Pas de coins arrondis — `roundRect` n'existe pas dans le moteur de
2017, et une plaque de 1944 a des arêtes vives.

Le poussoir a une course visible à l'enfoncement et un témoin ambre qui reste
allumé tant que l'intégration court ; sa légende passe de VISER à ARRÊTER. Le
sélecteur montre ses deux positions gravées côte à côte, celle en service
éclairée — une bascule obligeait à lire le texte pour savoir où l'on était.

Même discipline que les molettes : mesure au redimensionnement seulement, et
redessin uniquement quand l'état change, jamais depuis un écouteur d'entrée.

## Ce que faisait la phase 1

Viser un astre, intégrer de 30 s à 2 min, sortir une hauteur moyenne datée de sa
mi-temps, la réduire contre une estime saisie à la main, et faire le point à
partir de deux visées ou plus — **droites transportées** à l'instant commun.
L'exemplaire a une erreur d'index qui lui est propre, tirée une fois et jamais
montrée : on l'**étalonne** au sol contre une position connue. Rien d'autre —
pas de carte, pas d'application compagnon.

L'instrument lui-même : molettes qu'on roule, compteur à fenêtre avec les
dixièmes qui défilent, oculaire ×1 pour chercher / ×5 pour collimater, roue de
filtres à huit crans reprise du MA-2, couronne de gisement, champ de visée
procédural qui suit la hauteur du Soleil du plein jour à la nuit noire.

Les quatre planètes de navigation sont là, elles aussi — Vénus, Mars, Jupiter,
Saturne — et Vénus est proposée même de jour, comme l'enseigne l'AFM à qui sait
où regarder.

Et une Lune qui porte sa vraie phase, **orientée** : le croissant tourne avec
l'angle parallactique, donc le même quartier ne se présente pas sous le même
angle au lever et au coucher. C'est précisément ce qu'une vignette figée ne
sait pas faire — et ce qui compte pour viser, puisque c'est le limbe éclairé
qu'on pose sur la bulle.

**Le panneau ne dit jamais où l'on est.** Deux chaînes de calcul cohabitent et
ne doivent jamais se mélanger :

| | part de | rend | qui la voit |
|---|---|---|---|
| `simulateSight()` | la position **réelle** du simulateur | ce que le tambour affiche | personne |
| `sight()` | l'**estime** saisie par le joueur | l'intercept et le Zn | le joueur |

`test/panel-chain.test.js` vérifie que ces deux chaînes sont exactement
inverses : un joueur qui connaîtrait sa position exacte obtient un intercept nul
à moins de 0,01 NM.

## Le transport

Le carnet ne réduit plus chaque visée dans son coin. Toutes sont ramenées à
l'heure de la dernière : pour chacune, on recule l'estime le long de la route
parcourue depuis *son* heure, et on réduit depuis ce point-là. Le panneau
affiche la course couverte sous le point (« transport sur *n* NM »).

Route et vitesse employées sont celles que le **simulateur** rapporte au début
de chaque visée — et c'est un écart avec l'intention du noyau, qui prévoit celles
que le navigateur *croit* avoir. Aujourd'hui le transport bénéficie donc d'une
route et d'une vitesse exactes, que le navigateur de 1944 n'aurait pas eues. Cela
isole le transport des erreurs d'estime, ce qui était souhaitable pour le
valider ; c'est un interrupteur tout trouvé pour le gradient de difficulté —
*route et vitesse : lues au GPS / estimées à la main*.

## L'étalonnage

Le sextant tire son erreur d'index une fois pour toutes, à la première ouverture,
et ne la dit jamais. Le bouton « Étalonner » ouvre un second carnet :

1. **au sol**, à une position connue qu'on saisit soi-même ;
2. une série de visées — chacune donne Ho − Hc, l'erreur du sextant au sens de
   l'AFM 51-40 ;
3. « Adopter » retient la moyenne, changée de signe, comme correction.

Le manuel refuse de séparer erreur d'index et erreur personnelle : ce qu'on
mesure est leur **somme**, et c'est bien la somme que la chaîne restitue — un
joueur qui pose systématiquement l'astre trop haut voit son biais entrer dans le
chiffre. « Nouvel exemplaire » tire une autre erreur et remet tout à zéro.

## Ce que les essais ont appris

Quatre séances de vol simulé, en mesurant à chaque fois ce qui revient au code
et ce qui revient au geste du joueur :

| | erreur du point | dont code | dont geste |
|---|---|---|---|
| première série | 9,0 NM | 4,6 | 6,8 |
| après le ×5 | 6,9 NM | 4,8 | 3,5 |
| **après le transport** | **3,0 NM** | **0,00** | 3,0 |

Chaque séance a trouvé quelque chose :

- **Le `<select>` natif bloquait le volet du panneau.** Remplacé par une liste
  `role="listbox"` — à retenir pour tout contrôle ajouté par la suite.
- **La précision de 2′ était physiquement inatteignable.** À l'échelle
  d'affichage d'alors, elle valait 0,9 pixel. D'où l'oculaire ×5, qui n'est pas
  un ornement mais la condition pour que la main puisse viser ce que
  l'instrument sait mesurer.
- **Le carnet appliquait Coriolis sans jamais le retirer.** Corrigé.
- **Le transport a fermé la boucle** : visées parfaites, erreur du code nulle.

**Puis la première séance dans le simulateur lui-même, au parking de LFMA.** Le
pont SimVar est passé du premier coup : badge `MSFS`, horloge à l'heure Zulu,
position relevée au sol exacte au mètre. Deux défauts d'affichage, en revanche,
qu'aucun essai hors du simulateur ne pouvait montrer :

- **L'instrument n'occupait que le haut de la fenêtre.** Le gabarit `ingame-ui`
  empile plusieurs conteneurs sans hauteur définie : notre `height: 100%` ne se
  résolvait contre rien et s'effondrait sur le `min-height: 40vh`. Il faut
  forcer une chaîne flex continue du `body` jusqu'à l'iframe — c'est ce que font
  les panneaux à iframe qui fonctionnent, et `Sextant.css` le fait désormais.
- **`45°00,0′` s'affichait avec des carrés vides.** Le moteur n'expose pas les
  polices de Windows dans le simulateur — la sonde montre qu'il les résout
  pourtant hors de lui — et sa police de repli n'a ni degré, ni prime, ni
  apostrophe courbe. Sur un instrument dont toute la lecture est en degrés et en
  minutes, c'est rédhibitoire. DejaVu Sans est donc **embarquée**, réduite aux
  106 caractères que le panneau emploie : 20 ko par graisse au lieu de 700.

Puis la première série d'étalonnage réelle, au sol : **erreur moyenne −0,09′ sur
dix visées, dispersion 2,04′**. Deux enseignements, et une erreur de ma part.

- **Le `localStorage` d'un panneau ne survit pas à la session.** La série s'est
  perdue au redémarrage, alors que j'avais affirmé le contraire. MSFS a sa
  propre API — `SetStoredData` / `GetStoredData` — mais elle n'existe que dans
  la page hôte : l'iframe la joint désormais par messages, comme pour les
  SimVars. On écrit aux deux endroits, on lit l'hôte en premier. **Vérifié dans
  le simulateur** : la correction adoptée survit au redémarrage.
- **Le résultat disparaissait avec le bloc replié.** Un rappel d'une ligne reste
  maintenant sous le titre, et un bouton copie la série entière.
- **La dispersion de 2′ n'est pas un défaut, c'est l'instrument.** J'avais prédit
  quelques dixièmes au sol, en pensant au vagabondage de la bulle — qui est bien
  nul sans accélérations. J'oubliais le terme dominant : on centre l'astre à
  l'œil dans une bulle de 0,8°, soit 48′ de diamètre. Viser à 2′ près, c'est
  4 % du diamètre. C'est la physique du sextant à bulle, celle qui a valu 5 à
  10 NM aux navigateurs de 1944.

Puis une seconde série, sur un exemplaire neuf, qui a réglé la question de fond :
**+3,68′ d'erreur, incertitude 0,45′** — huit écarts-types au-dessus de zéro. Le
mécanisme de l'erreur cachée mord bel et bien ; le quasi-zéro de la veille était
un tirage chanceux, pas un défaut. Le panneau et une réduction indépendante,
faite hors du simulateur à partir des seules valeurs affichées, tombent d'accord
à **0,01′**.

Cette série-là a été prise en cinq astres à deux visées chacun, et cette
structure vaut d'être gardée : elle sépare ce qu'une série ordinaire mélange.

| | |
|---|---|
| écart **à l'intérieur** d'une paire | 0,68′ — le bruit de pointage pur, 1,4 % du diamètre de la bulle |
| dispersion **totale** | 1,42′ — il reste donc ~1,2′ de systématique propre à chaque astre |

Ce systématique n'est pas la réfraction : la corrélation avec la hauteur est
nulle (r = −0,20). En revanche Polaris s'en détache — écart le plus faible, et
deux visées identiques à 0,11′ près — et c'est la seule étoile immobile du lot,
0,16′/min contre 4 à 11′/min pour les autres. Le suivi d'un astre mobile est
donc le suspect, mais avec cinq étoiles c'est Polaris seule qui porte la
conclusion : une série entière sur elle trancherait.

Une intuition fausse mérite d'être notée, parce qu'elle se reproduira :
*« intégrer plus longtemps réduira l'erreur »*. Non. Le vagabondage de la bulle
s'efface à la moyenne, mais la quantification par le pixel est **statique** et
la traverse intacte. Allonger la visée ne rattrape jamais un affichage trop
petit.

## Développer sans lancer le simulateur

L'application n'a aucune dépendance à MSFS. Si aucun état ne lui parvient, elle
bascule sur un avion fictif — un DC-3 à 150 kt au large de la Californie, une
nuit de janvier, avec une turbulence déterministe.

```bash
npm run panel:dev
```

puis ouvrir `http://127.0.0.1:8123/`. Le badge en haut à droite indique la
source : `avion fictif` ou `MSFS`.

## Assembler le paquet

```bash
npm run panel:build
```

Le script recopie `src/` dans `app/core/` — le paquet est autonome une fois
déposé — et régénère `layout.json`.

## Compiler le descripteur `.spb`

MSFS n'enregistre le bouton de barre d'outils que depuis un `.spb` compilé.

```bash
npm run panel:spb
```

À refaire **uniquement** après modification de
`Build/PackageSources/InGamePanel_Sextant.xml` : tout le reste du paquet — HTML,
JS, icône — est lu tel quel par le simulateur, sans recompilation.

Deux choses à savoir. D'abord `fspackagetool` **lance
`FlightSimulator2024.exe`** en mode empaquetage pour faire le travail : la
commande prend une minute et fait tourner le moteur du jeu, sans ouvrir de vol.
Ensuite, contrairement à ce que ce fichier a longtemps prétendu, l'option
`-nomirroring` **n'existe pas** — c'est `-mirroring` qui force l'effacement des
fichiers non déclarés, et ne pas la passer est déjà le bon comportement.

Le script vérifie `_RPTErrors.xml`, recopie le `.spb` dans
`sixk-sextant/InGamePanels/` et régénère `layout.json` — un fichier absent du
layout est invisible pour le simulateur, `.spb` compris.

## Installer

```bash
npm run panel:install            # pose la jonction dans Community
npm run panel:install -- --etat  # dit ce qui est en place
npm run panel:install -- --oter  # la retire
```

Une **jonction**, pas une copie : le simulateur lit alors directement
`panel/sixk-sextant`, donc un `npm run panel:build` suffit à mettre à jour ce
qu'il verra au prochain démarrage. Le dossier Community est lu dans
`UserCfg.opt` — il y en a plusieurs sur cette machine et c'est le simulateur qui
tranche ; `MSFS_COMMUNITY` permet d'en imposer un autre.

Le contenu de Community est lu **au lancement** : redémarrer le simulateur après
la pose, et après toute modification.

## Structure

```
Build/                              sources du .spb (SDK)
sixk-sextant/                      le paquet à déposer dans Community
  manifest.json  layout.json        déclaration du paquet (layout généré)
  InGamePanels/*.spb                descripteur compilé (généré par panel:spb)
  html_ui/icons/toolbar/*.svg       icône de la barre
  html_ui/InGamePanels/Sextant/
    Sextant.html/.css/.js           hôte MSFS : la fenêtre + le pont SimVar
    app/                            l'instrument, page web ordinaire
      index.html  app.css
      app.js                        logique de l'instrument
      compat.js                     le plancher ES2017 du moteur
      viewport.js                   le champ de visée (canvas)
      sim.js                        état du sim, ou avion fictif
      pont.js                       lien avec la table : consigne, visées, file d'attente
      core/                         copie de src/ (générée)
```

L'hôte ne fait presque rien : il lit les SimVars et les pousse dans l'iframe
toutes les 100 ms. Tout le reste est une page web, donc testable au navigateur.

## Le moteur, et sa frontière

Mesuré le 19 août 2026 dans le vrai moteur, sans lancer le simulateur : le SDK
livre un débogueur qui embarque les mêmes DLL et accepte un `-url`.
`node tools/coherent-probe/run.mjs` en fait une copie jetable, y charge une
sonde et le noyau, et rapporte. Le détail est dans
[tools/coherent-probe/README.md](../tools/coherent-probe/README.md).

**Les modules ES fonctionnent**, entièrement : `<script type="module">` en ligne
et par `src`, imports relatifs résolus sur `coui://`, `import()` dynamique.
L'architecture du paquet — une iframe, une page web ordinaire, neuf modules —
tient donc telle quelle. Le repli prévu (« concaténer en un seul script
classique ») n'aurait rien réglé : le problème n'est pas le chargement.

Le problème était le **niveau de langage**. Coherent GT est un WebKit 604, soit
Safari 11 : `async`/`await`, générateurs, classes et modules passent, mais `??`,
`?.`, la décomposition d'objet `{ ...x }`, les champs privés, `catch {}`,
`Array.at`, `Array.flat`, `String.replaceAll`, `structuredClone`, `Intl` et
`canvas.getImageData` sont absents. **La frontière est ES2017.**

Le code a été repris en conséquence — 21 sites de `??`/`?.` et 12 décompositions
d'objet, remplacés par `ouSinon()` et `Object.assign()`. Le garde et la liste
des pièges sont dans [app/compat.js](sixk-sextant/html_ui/InGamePanels/Sextant/app/compat.js),
et son jumeau en tête de `src/index.js` pour le noyau.

Vérifié dans le vrai moteur, pas seulement à l'analyseur : la seconde phase du
banc démarre **l'instrument entier**, et il vit — l'horloge avance, le champ de
visée est dessiné à chaque image, dix-neuf astres sont proposés, aucune erreur
n'est remontée. Le noyau, lui, rend les mêmes chiffres qu'en Node, au bit près.

C'est désormais une contrainte permanente, pas un chantier : tout code ajouté
doit s'y tenir, et la sonde est là pour le dire avant qu'on s'en aperçoive dans
le cockpit.

## Le débriefing

Le panneau connaît la position vraie depuis toujours — c'est avec elle qu'il
fabrique ce que le tambour affiche — et il ne la montre **jamais** pendant la
navigation. Mais une fois le point rendu, la cacher encore n'apprend plus rien :
sans corrigé, on ne mesure ses progrès qu'à l'estime d'une estime. C'est ce qui
est arrivé au premier vol, où la vérité a dû être relevée à l'œil sur une carte
tierce, avec deux milles d'incertitude sur une mesure qui en vaut deux.

Le bouton **Débriefer**, inactif tant qu'aucun point n'existe, rend trois choses
dans cet ordre :

1. **de combien le point se trompe**, en milles et en gisement ;
2. **la position vraie** à l'instant commun ;
3. **l'erreur de chaque droite** — la visée réduite depuis la position vraie de
   son propre instant.

C'est la troisième ligne qui instruit. Des signes mélangés, c'est du pointage ;
un signe commun aux trois, c'est un biais de hauteur. Et il faut savoir qu'à
trois astres écartés de 120°, un biais commun est **indétectable dans le
chapeau** : la géométrie force les trois résidus à être égaux quoi qu'il arrive.
Le débriefing est le seul endroit où il se voit.

La position vraie retenue est celle de la **mi-temps** de chaque visée, moyenne
du départ et de l'arrivée — sur une à deux minutes de vol rectiligne, l'écart à
la vraie médiane se compte en mètres.

## La bulle, et ce qui la fait bouger — pour plus tard

Aujourd'hui la bulle n'a que deux entrées : `ACCELERATION BODY X` et
`PLANE BANK DEGREES`, tirées vers leur cible par un ressort amorti. L'appareil
compte donc **indirectement** — un ULM et un DC-3 dans la même turbulence ne
rendent pas les mêmes accélérations — mais deux appareils pilotés pareil dans le
même air donnent exactement la même bulle. `accelZ` et `pitch` sont transmis par
l'hôte et inutilisés.

Trois axes manquent, par ordre d'honnêteté :

1. **La monture**, et c'est le vrai axe lié à l'appareil. MA-2 tenu à la main
   sous l'astrodôme d'un DC-3 : l'observateur couple l'instrument à tout ce qui
   bouge, respiration comprise. Périscopique MIL-S-5807A boulonné dans la coque
   d'un 707 : l'avion le porte. Un interrupteur, documenté, qui a sa place dans
   le gradient de difficulté — pas une table de vibration par type d'appareil,
   invérifiable.
2. **La vibration moteur** — piston à hélice contre turbine. Trop rapide pour
   déplacer la bulle, que l'amortissement du liquide filtre : son effet est de
   la rendre **floue**, donc de dégrader le centrage. C'est le bruit de
   pointage qu'elle abîme, pas la moyenne.
3. **L'erreur d'accélération en virage coordonné**, et c'est la plus
   intéressante. La bulle y reste **parfaitement centrée** — la force spécifique
   reste alignée sur l'axe vertical de l'avion — pendant que la verticale vraie
   s'incline. L'instrument ment sans rien montrer, et c'est pour cela que l'AFM
   interdit de viser en virage. Notre `bank * 0.012` fait l'inverse : il déplace
   la bulle, donc le joueur voit et corrige. Le mensonge invisible n'est pas
   simulé. Il appartient au noyau, pas à l'instrument.

## L'habillage du champ

Fait le 20 août 2026, dans `app/viewport.js`. **Deux couches, et c'est tout le
budget.** Ce qui change d'une image à l'autre — ciel, astre, filtre, bulle,
réticule — est redessiné à chaque fois, une dizaine d'appels. Ce qui ne change
jamais — bague, poussières, voile, grain, vignettage — est peint **une seule
fois** hors écran et recollé d'un `drawImage`. Le champ a beaucoup gagné en
matière sans que le coût par image bouge.

**Aucune image, tout est dessiné.** Une texture se fige à une taille alors que
le panneau se redimensionne, et elle pèserait à elle seule plus lourd que le
paquet entier.

Ce qu'il y a désormais :

- **La bague.** Peinte en 200 secteurs, parce que sur un anneau la lumière
  dépend de l'angle et pas de la position — un dégradé linéaire ne peut pas
  l'éclairer, et c'est pourquoi la première version restait plate. Moletage à
  168 dents, lèvre de caoutchouc entre le verre et le métal, gravure sur l'arc.
- **L'usure pilote, elle ne se pose pas par-dessus.** Trois zones tirées du
  germe, et dans ces zones les dents s'**émoussent** au lieu de s'éclaircir, le
  métal poli devient plus spéculaire, l'anodisation part sur les arêtes.
  Première version : un badigeon clair à 11 % sur un anneau dont la luminance
  varie de 30 à 148 — invisible, **et le procédé était faux**.
- **Le réticule gravé**, à deux bords, gradué, éclairé en rouge sous −6° de
  hauteur du Soleil, et **ouvert au croisement**.
- **L'échelle d'azimut vrai** en bas du champ, lue contre le réticule vertical.
  Voir plus bas — elle a d'abord été fausse.
- **La bulle** avec ménisque, reflet spéculaire et ombre portée ; **les mers de
  la Lune** découpées dans la seule part éclairée ; **les fantômes de
  l'objectif**, qui n'apparaissent que hors d'axe.

**Le germe de l'exemplaire est FIXE — 991.** On avait envisagé de le tirer de
`instrumentError`, pour que chaque joueur ait sa constellation de grains comme
il a son erreur d'index. Mais en comparant trois tirages on a constaté qu'ils ne
se valent pas : un germe au hasard livrerait à chacun une allure que personne
n'a regardée.

**Retiré après essai** : les aigrettes de diffraction sur les étoiles — elles
faisaient dessin plutôt que lumière.

### Les poussières sont mortes, et c'est définitif

Il y en a eu : grains flous, voile de chiffon, fibres, grain d'ensemble. Deux
essais dans le simulateur, deux rejets, code supprimé — pas un interrupteur.

La raison vaut mieux que tous les dosages proposés pour les sauver : **dans un
instrument dont le travail est de trouver un point lumineux, tout ce qui
ressemble à un point lumineux est un défaut.** On les prenait pour des étoiles.
Le problème n'était pas l'intensité mais la **forme**, donc aucun réglage ne
pouvait le réparer. Trois passes ont été perdues à ajuster le compte, puis le
contraste, puis la loi de défocalisation — la leçon générale : *quand un rejet
esthétique se répète, se demander si l'élément est légitime avant de le doser
encore.*

**Le semis d'étoiles procédural est tombé avec**, pour la même raison en pire :
c'étaient de fausses étoiles, dans un instrument fait pour en viser une. Le champ
de nuit est donc plus vide. Son remplaçant légitime est le catalogue, dont les
58 étoiles ont déjà leurs positions à la seconde d'arc.

Ce qui reste de la couche optique — traitement de surface et vignettage — n'a
aucune structure ponctuelle : ce sont des dégradés doux.

### L'échelle du bas montre où l'on VISE, pas où l'on va

Première version fausse : elle était centrée sur le seul **cap vrai**. Elle ne
bougeait donc jamais quand on tournait la couronne d'azimut, et au sol elle était
parfaitement figée — deux captures dans le simulateur, l'azimut passant de 000,0°
à 122,8°, l'échelle immobile sur ~240°. Elle ne faisait que répéter le compas, ce
qui n'a aucun intérêt dans le champ d'un sextant.

Elle montre désormais l'**azimut vrai de la ligne de visée**, `Zn = cap + gisement`.
Elle suit donc la couronne, et l'appareil quand il tourne. Elle redevient une
pièce de la méthode : la couronne affiche le gisement RB, l'échelle affiche
l'azimut TB, et le `TH = TB − RB` de l'AFM se lit entre les deux. C'est aussi
**l'astrocompas** — collimater le Soleil et lire son azimut sous le réticule donne
le cap vrai sans aucun compas. Vérifié : collimaté, l'échelle lit exactement
l'azimut vrai de l'astre, y compris de part et d'autre du nord.

*Réserve honnête* : le repère sur lequel l'échelle du MIL-S-5807A est réellement
gravée n'a pas pu être vérifié. Si l'AFM dit le cap, il suffit de retirer le
gisement dans `drawAzimuthScale`.

### Le croisement du réticule est ouvert

Une croix pleine masque exactement ce qu'on essaie d'y poser. Mesuré à l'échelle
du panneau :

| | Halo de la lampe | Traits | Vide au centre |
|---|---|---|---|
| Avant | 3,70 px | 1,67 px | aucun |
| Après | 1,48 px | 0,97 px | **7,4 px** |

Polaris fait **4,1 pixels** de diamètre à cette échelle : le seul halo de la
lampe en couvrait 90 %. Les traits passent sous le pixel — le moteur les rend
alors en un pixel atténué, ce qui est l'effet cherché — et le vide central laisse
l'astre entier. La référence fine reste donnée par les premières graduations et
par l'anneau de la bulle. La largeur du vide est `RETICLE_GAP`, en tête de
`viewport.js`.

**Trois pièges, tous de la même famille.** L'usure invisible ci-dessus ; les
mers sous un seuil de 8 px alors que la Lune fait 7 px à ×1, peintes en plus sur
la lumière cendrée et tournant avec le terminateur ; les fantômes, physiquement
justes donc **invisibles par construction** tant que le Soleil est collimaté.
La leçon : **quand un effet ne se voit pas, chercher un seuil ou une condition
qui l'annule avant de toucher au dosage.**

Le semis d'étoiles de fond est délibérément faible — magnitudes 4,5 à 6,5 — pour
qu'aucune ne puisse être prise pour un astre de navigation. Le jour où le champ
recevra les vraies voisines du catalogue, déjà connues à la seconde d'arc, il
passera derrière elles au lieu de leur tenir lieu.

## Les molettes

Fait le 20 août 2026, dans `app/drum.js`. Un `<canvas>` par molette, et un vrai
cylindre : chaque graduation vit à un angle sur le tambour, et ce qu'on voit est
sa projection — `R·sin θ` pour la position, `cos θ` pour l'éclat. D'où, sans
rien coder de plus, les traits qui se resserrent vers les bords, qui s'y
éteignent, et le tambour qui tourne **à la bonne vitesse**. L'ancienne version
faisait défiler une texture CSS de `delta % 5` pixels au glisser : ça bougeait,
mais sans rapport avec la rotation réelle, et pas du tout à la molette de souris
ni au clavier.

**Le pas cesse d'être une constante choisie au jugé.** Rouler un cylindre de
rayon R d'un arc de *p* pixels le tourne de `p/R` radians, donc de
`perTurn · p / (2πR)` unités. Chaque molette n'a plus que deux réglages, et tous
deux sont des spécifications de l'instrument :

| Molette | Un tour | Graduation | Pas obtenu |
|---|---|---|---|
| Hauteur, tambour | 30° | 1° | 0,184 °/px |
| Hauteur, fin | 1° | 1′ | **0,367 ′/px** |
| Gisement, couronne | 360° | 5° | 1,273 °/px |
| Gisement, manivelle | 5° | 0,1° | **56,5 px/°** |
| Bulle | 1° | 0,05° | 0,007 °/px |

**Conséquence de mise en page à ne pas perdre de vue : la taille à l'écran EST
le rayon.** Un tambour vertical roule sur sa hauteur, une couronne horizontale
sur sa largeur. Les deux couronnes ont donc une largeur **fixe** dans
`.ctl.wide` — en `1fr` elles changeraient de sensibilité quand on
redimensionne la fenêtre.

Deux valeurs méritent leur gras. Le **1 tour = 5°** de la manivelle est la
démultiplication documentée de la monture D-1 ; elle n'était pas encodée, la
couronne faisait 5° en dix pixels. C'est maintenant lent et délibéré, et la
couronne à côté reste rapide pour le pointage grossier. Et **0,367 ′/px** tombe
sous les 0,40 ′ que vaut un pixel de champ à ×5 : un pixel de doigt déplace
l'astre de moins d'un pixel, donc **la molette n'est jamais le facteur
limitant**. On avait envisagé de coupler le pas au grossissement pour y
arriver ; le modèle physique l'a rendu inutile.

Les graduations sont indexées par entiers, pas par additions successives de
`tick` : la dérive finissait par faire manquer les traits chiffrés.

### Les à-coups, et ce qui les causait

Premier essai dans le simulateur : les molettes tournaient par saccades — un
peu, un blocage, ça repart — au glisser **comme** à la molette de souris, au sol
à plus de 100 images par seconde. Ce n'était donc pas la charge du simulateur.
C'était le **travail par événement d'entrée**, qui n'a aucune raison d'être borné
par la cadence d'affichage : une souris émet plus de mouvements que le moteur ne
peut en peindre, et chacun déclenchait toute la chaîne.

Trois causes cumulées, sur un glisser de 120 mouvements :

| | Avant | Après |
|---|---|---|
| Compteur de hauteur | 120 reconstructions de `innerHTML` | 1 construction, puis 294 écritures de texte |
| Dessins de tambour | 600 | 38 |
| Mesures de mise en page | 600 | 0 |

1. **Le compteur était recomposé en chaîne et reposé par `innerHTML`.** Il avait
   un cache, et ce cache ne retenait rien : à la molette fine un pixel vaut
   0,37 minute, donc le chiffre des dixièmes change à *chaque* mouvement. Neuf
   éléments détruits et réanalysés, cent fois par seconde, en plein geste. La
   structure est maintenant bâtie une fois et on ne pose que les textes qui
   changent.
2. **Les cinq tambours étaient repeints à chaque événement**, alors que tourner
   la hauteur ne change rien aux deux couronnes ni à la bulle. `setValue` note
   désormais la valeur sans peindre ; la boucle repeint, à sa cadence, les seuls
   tambours dont la valeur a bougé.
3. **Chaque dessin appelait `getBoundingClientRect()`**, qui force un calcul de
   mise en page synchrone — intercalé entre les écritures DOM du compteur, c'est
   le va-et-vient lecture/écriture qui fait saccader. La taille est mesurée une
   fois, et re-mesurée au redimensionnement seulement.

**La règle à retenir : ne jamais peindre dans un écouteur d'entrée.** On note, et
la boucle peint. C'est la même discipline que le plafond à 20 im/s du champ.

## Ce qui n'est pas encore là

Le risque d'abord :

- **Un nom de SimVar fautif est MUET.** `read()` rend `0` sur exception, et 0
  est plausible partout — position au large du golfe de Guinée, heure à l'an 0.
  À surveiller : `GPS GROUND TRUE TRACK` et les `E:ZULU *`.
- **Le coût en images par seconde n'a jamais été mesuré.** Le panneau redessine
  un canvas en continu pendant que le simulateur peine déjà. À relever au
  premier vol un peu chargé.

Puis ce qui ajoute :

- **Les planches de 1944** pour l'aide. C'est l'autre moitié des « images », et
  un chantier de nature différente : de la mise en page de documents, pas du
  canvas.
- **Le gradient de difficulté.** Pas deux niveaux, mais une série
  d'interrupteurs — un par bloc du formulaire de précalcul. On automatise les
  tables, jamais le jugement. Rien n'est encore câblé.
- **Le gisement au Soleil comme astrocompas.** Toutes les données sont là —
  `relativeBearing` est déjà l'azimut vrai moins le cap, et l'échelle de cap est
  désormais gravée dans le champ. Il ne manque qu'un affichage.
