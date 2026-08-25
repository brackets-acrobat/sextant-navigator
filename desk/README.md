# Sextant Navigator

La table du navigateur. Le panneau dans le simulateur **est l'instrument** —
champ, molettes, compteurs, poussoir, et rien d'autre. Tout le travail du
navigateur se fait ici : choisir l'astre, tenir le carnet de visées, reporter les
droites de hauteur, faire le point.

C'est la division historique : le sextant sous l'astrodôme, la planchette à la
station de nav.

## D'où vient ce code

**Dérivé de Clear Sky VFR**, sur décision du 20 août 2026 — « ça suffit, il a
tout ce qu'il faut ». Projet autonome, pas un fork : aucun dépôt hérité, comme
Clear Sky VFR l'était lui-même de Cap CAVVA.

Ce qu'il apporte déjà, et qu'il n'y avait donc pas à écrire :

| | |
|---|---|
| `simconnect.js` | client node-simconnect qui tourne |
| Leaflet + Phosphor vendorisés | la carte, sans réseau ni clé d'API |
| `compas.js`, `declinaison.js` | rose et déclinaison magnétique (WMM) |
| `elevation.js`, `profil-vertical` | relief GLOBE |
| `i18n.js` | français et anglais, 206 clés chacun |
| electron-builder, updater, icônes | la chaîne de publication |

Plus 27 modules de fonctionnalités déjà découpés, un pont preload, et les
imports de bases MSFS 2024.

## Ce qui a été retiré

**Le hangar virtuel et le carnet de vol.** Le premier accumulait des profils de
performance d'appareils au fil des vols ; le second tenait les vols, appareil
par appareil, avec analyse du toucher. Ni l'un ni l'autre n'a de rapport avec un
point astronomique.

Ce n'étaient pas des feuilles : le carnet rangeait ses vols sous le profil du
hangar, et **SimConnect avait un second groupe de données entier** qui n'existait
que pour eux — identité de l'appareil, constantes du modèle de vol, grandeurs de
performance, lu à 1 Hz. L'événement `frame`, émis à chaque image, n'avait lui
non plus pas d'autre consommateur. Tout est tombé ensemble :

- `src/main/hangar.js`, `src/main/carnet.js`, `src/renderer/js/features/hangar.js`,
  `src/renderer/js/features/carnet.js` — supprimés ;
- le second groupe SimConnect, ses deux méthodes et son événement ;
- l'émission de `frame` ;
- 5 fonctions du pont preload, 2 handlers IPC, 3 abonnements du renderer ;
- 3 modales et un bouton de barre dans le HTML ;
- 148 lignes de feuille de style, 144 clés de traduction.

Environ **1 900 lignes** en moins.

**L'affichage du toucher** (`toucher-flash`) est parti avec : il n'était rempli
que par le carnet, et rien ne l'aurait plus jamais rempli.

### Une chose délibérément laissée

Le groupe de données de vol lit encore `VERTICAL SPEED` et `G FORCE` à la cadence
image, alors que plus personne ne les consomme. Ce groupe **se lit
séquentiellement** : retirer deux variables oblige à retirer les deux lectures
aux mêmes rangs, et s'y tromper décale silencieusement tout ce qui suit — la
position comprise — sans rien afficher d'anormal. À nettoyer en même temps que
la cadence du groupe, qui peut descendre sous `SIM_FRAME` maintenant que seule
l'interface le lit.

## Conventions propres à l'application

Chaque application dérivée porte ses propres noms, sinon deux d'entre elles se
disputent le même dossier de travail et le même client SimConnect. Celles-ci
sont définitives.

| | |
|---|---|
| paquet npm | `sextant-navigator` |
| nom du produit | `Sextant Navigator` |
| appId d'installation | `me.sixk.sextantnavigator` |
| client SimConnect | `SextantNavigator` |
| dossier de travail | `Documents/Sextant Navigator` |
| pont exposé au renderer | `window.sextant` |
| clés de stockage local | préfixe `sextant-` |
| plans de vol | `.snfp` |
| dépôt visé par l'updater | `brackets-acrobat/sextant-navigator` |

Ce dépôt GitHub **n'existe pas encore** : à créer avant le premier `npm run dist`.

## Le catalogue d'astres

Fait. Bouton lune-et-étoiles de la barre, panneau sur la bande **gauche** de la
carte — à gauche pour qu'il puisse rester ouvert en même temps que le plan de
vol, qui occupe la droite.

Il répond à la question du départ : *que peut-on viser d'ici, maintenant, et
lesquels prendre ?* Le tableau donne, par astre, la hauteur, l'azimut vrai, le
**gisement** — l'azimut compté depuis le nez, le seul chiffre qui serve à
trouver l'astre dans le champ — la magnitude, et l'**angle de coupe**.

**La coupe est ce que ce catalogue apporte et qu'aucun almanach n'affiche.**
Trois visées parfaites sur trois astres mal répartis donnent un point flou, et
le chapeau ne le dira pas : il sera même petit. La colonne a deux visages, et
son en-tête le dit — sans sélection, avec quel autre astre celui-ci coupe le
mieux ; dès qu'on coche, comment il coupe avec ce qui est déjà pris, la plus
mauvaise paire étant celle qui est donnée.

En plus de la coupe, deux chiffres :

- l'**erreur du point**, `×1,16` par exemple : le facteur par lequel la
  géométrie multiplie l'erreur d'une seule visée. Une minute d'arc de bulle,
  soit un mille, devient 1,16 mille sur la carte à trois astres bien ouverts —
  et huit milles sur deux astres à 10° de coupe ;
- le **meilleur trio** que ce ciel permette, cherché exhaustivement plutôt que
  proposé à l'œil, avec un bouton pour le prendre. Le critère est la géométrie ;
  à géométrie égale à 1 % près, l'astre le plus brillant gagne, parce qu'un
  astre qu'on met deux minutes à trouver est un astre qu'on vise mal.

Instant et position viennent du simulateur, cases verrouillées, recalcul toutes
les dix secondes — c'est le flux SimConnect lui-même qui donne la cadence, il
n'y a pas de minuterie. Le bouton `MSFS` / `Libre` libère les cases pour
préparer un crépuscule à venir depuis n'importe où, simulateur éteint.

### Ce que ça a demandé

**L'heure zulu.** Le flux ne lisait que l'heure LOCALE du simulateur, et
l'éphéméride ne travaille qu'en UTC. Le décalage ne se déduit pas de la
position — fuseau, heure d'été — donc `ZULU TIME/YEAR/MONTH/DAY` ont été
ajoutées **en queue** du groupe de données : il se lit séquentiellement, insérer
au milieu décalerait tous les rangs suivants, position comprise, sans que rien
n'ait l'air anormal.

**L'angle de coupe est allé au noyau**, pas dans l'interface : c'est de la
navigation, pas de l'affichage. `src/quality.js`, 16 tests, vérifié contre les
formes fermées — la dilution à deux astres vaut exactement √2 / sin(coupe). Le
panneau pourra s'en servir le jour venu, et les seuils de couleur du tableau
tombent sur les mêmes valeurs que les bornes du verdict, 60° et 30°.

**La frontière de modules**, telle qu'elle était annoncée : noyau en modules ES,
process principal en CommonJS. `require()` échoue, seul l'import dynamique
passe, et sous Windows il lui faut une URL de fichier — `import('C:\\…')` prend
le `C:` pour un protocole. Voir `src/main/astres.js`.

**L'empaquetage.** Le noyau vit HORS de ce dossier, donc `files` de
electron-builder ne peut pas l'atteindre : il part en `extraResources` vers
`resources/noyau/`, avec un `package.json` minimal qui lui rend son
`"type": "module"` — sans lui, le catalogue marcherait en développement et
tomberait une fois l'application installée.

## Le pont

Fait. Serveur WebSocket sur `127.0.0.1:8787`, ouvert avec l'application et tenu
tant qu'elle vit. Le panneau appelle — c'est le seul sens possible, un panneau
MSFS peut ouvrir une connexion mais pas en recevoir une.

Deux choses passent :

| | |
|---|---|
| table → sextant | la **consigne** : bouton en bout de ligne dans le catalogue d'astres |
| sextant → table | la **visée** : elle atterrit dans le panneau « Visées reçues » |

Ce qui NE passe pas compte autant : l'application ne demande au panneau ni la
position ni l'heure, elle les lit elle-même par SimConnect.

### Ce qui a demandé le plus de soin

**L'accusé de réception ne part qu'une fois la visée écrite sur le disque.** Il
autorise le panneau à l'oublier ; le donner à la réception voudrait dire « je
l'ai » alors qu'on ne l'a que dans une variable. Un disque plein ne coûte donc
pas deux minutes de collimation, il coûte un renvoi. Le corollaire est que la
même visée arrive plusieurs fois — c'est le protocole, pas un incident — d'où le
dédoublonnage par identifiant dans `visees.js`.

**On peut viser sans la table, et la table peut consigner sans le panneau.** Les
visées s'empilent dans le panneau et partent à la première ouverture de
l'application ; la consigne est mémorisée par le pont et rejouée au panneau qui
arrive après. C'est le cas normal des deux côtés : on prépare le crépuscule à la
table, puis on va sous l'astrodôme.

**La vérité est sous scellés.** Chaque visée transporte la position RÉELLE de
l'appareil à la mi-temps — le débriefing en aura besoin. Elle est écrite dans
`visees.json` et **`liste()` ne la rend pas** : le renderer ne l'a jamais entre
les mains, donc aucune évolution de l'interface ne pourra la laisser fuir par
distraction. C'est le seul niveau de garantie qui vaille quand tout le jeu tient
à cette ignorance. Un test le vérifie, y compris par recherche textuelle dans ce
qui sort.

**Le serveur WebSocket est écrit à la main**, sans la dépendance `ws` : le projet
n'a aucune dépendance native et le noyau n'en a aucune. Un protocole qu'on n'a
pas écrit est un protocole qu'on ne sait pas déboguer le jour où le simulateur
se comporte autrement que le navigateur. Il est éprouvé contre le client
WebSocket **natif de Node** — une implémentation indépendante, la seule façon de
ne pas se donner raison tout seul — puis contre le vrai client du panneau.

Le port est **en dur côté panneau** (aucun panneau MSFS ne lit de fichier de
réglages) et réglable ici par `pontPort`. Changer l'un oblige à changer l'autre.
Le serveur n'écoute que sur la boucle locale : sans ça, tout appareil du réseau
lirait la position réelle de l'avion ou pousserait de fausses visées.

### Les tests

`npm test` — 31 épreuves, sans dépendance, sans Electron, sans MSFS :

- le codage des trames (TCP livre des octets, pas des trames ; une trame de
  contrôle peut passer au milieu d'un message fragmenté) ;
- le serveur contre le client natif de Node ;
- **les deux moitiés du projet face à face** — le vrai client du panneau branché
  sur le vrai serveur de l'application. Le fichier traverse la frontière des deux
  projets, et c'est voulu : un pont n'appartient à aucune des deux rives ;
- le carnet : dédoublonnage, mise sous scellés, refus de ce qui n'est pas une
  visée, ordre du ciel plutôt qu'ordre du réseau.

## L'estime et le carnet

Fait. C'est la pièce dont tout dépendait : une droite de hauteur ne donne pas
une position, elle donne un **écart** à une position supposée. Sans estime, il
n'y a rien à corriger et le point n'a pas de sens.

### Ce que l'estime a le droit de savoir

La liste est courte, et c'est tout le jeu :

| | |
|---|---|
| le **cap vrai** | il se lit au compas |
| la **vitesse propre** | elle se lit au badin (`AIRSPEED TRUE`, ajoutée au groupe) |
| le **vent PRÉVU** | le navigateur le déclare — c'est une supposition |
| l'heure | elle se lit à la montre |

Et ce qu'elle ne reçoit **jamais** : la vitesse sol et la route sol du
simulateur. Elles sont dans la même trame, à une ligne de distance, et elles
contiennent le vent VRAI. Les brancher ferait une estime qui ne dérive plus — et
**rien ne se casserait** : les points deviendraient simplement excellents, et
personne ne verrait pourquoi.

D'où la signature de `estime.avancer()` : elle ne prend pas la trame, elle prend
quatre nombres. Le geste de les extraire un par un, dans `main.js`, **est** le
garde-fou.

Une seule exception, bornée : **au sol, l'estime se recale sur la position
vraie**. Ce n'est pas une fuite, c'est la réalité — on sait où est le terrain
d'où l'on décolle. Le canal se referme dès que les roues quittent le sol.

### Ce qui est passé sous scellés

`visees.js` retenait déjà la position réelle. Il retient maintenant aussi la
**vitesse sol** et la **route sol** que le panneau envoie avec chaque visée.
Moins évident, tout aussi décisif : servies au transport des droites, elles
donneraient un point juste à tous les coups. L'altitude, elle, passe — c'est une
lecture d'altimètre, et la réfraction en a besoin. La règle : *ce qui se lit
dans le cockpit est permis, ce qui contient le vent ne l'est pas.*

### La boucle

Le carnet donne l'erreur d'index qu'on **croit** avoir, réduit chaque visée
contre l'estime, transporte les droites à la route **crue**, croise, et rend le
point avec son écart à l'estime, son chapeau et sa qualité géométrique. Un
bouton recale l'estime dessus — c'est la boucle du navigateur. Un autre ouvre
les scellés : *le point était faux de 1,5 NM, l'estime de 39,9 — gain 38,4.*

**Le chapeau ne prouve rien**, et l'interface le dit là où il se lit : il mesure
la concordance des droites, pas la justesse du point. Une erreur commune à
toutes les visées le resserre tout en déplaçant le point.

## L'étalonnage

La procédure d'avant-vol, et la seule du jeu où l'on ait le droit de dire au
navigateur où il est — parce qu'au parking il le sait vraiment. Le canal se
referme au décollage, comme celui de l'estime : **en vol, l'application
refuse**, et pas par prudence. Contre une estime qui a dérivé de cinq milles, on
mesurerait la dérive au lieu de l'instrument.

**La règle qui gouverne tout : on étalonne sur des astres LENTS.** Une série
depuis un point connu ne mesure pas seulement le sextant, elle mesure aussi le
**retard de manivelle** — l'intégrateur moyenne la position du tambour, pas la
vérité du ciel. Le vol du 21 août l'a tranché : ce qu'on avait pris pour « +6′
d'erreur d'index » n'était que le retard sur Arcturus, à 10,9′/min, tandis
qu'Altair, lent, tombait juste les deux fois. Le détail du calcul est au noyau
(`src/calibration.js`, section « L'étalonnage » du README racine).

**La session est une fenêtre de temps, pas une sélection.** On déclare « je
commence », on vise, on mesure : tout ce qui est arrivé du pont entre-temps fait
partie de la série. Le filtre porte sur l'heure d'**arrivée**, jamais sur
l'heure de visée — le carnet porte l'heure zulu du simulateur, qui peut être une
nuit de 1943, alors que la session se déroule ce soir. Confondre les deux
viderait la série sans que rien ne l'explique.

**Le filtre parle.** Une visée trop rapide n'est pas cachée : elle reste au
tableau, grisée, avec sa vitesse en toutes lettres — et elle sert encore, car
c'est elle qui donne le bras de levier pour mesurer le retard lui-même. Une
visée ratée s'écarte à la main d'un clic, et se remet du même geste.

Le panneau annonce la correction avec **la méthode qui l'a produite**, sa
dispersion, le retard mesuré quand la série le permet, et ce qu'il reste de
biais résiduel dans les visées retenues. `Adopter` la met en service : elle
tombe dans la case d'erreur d'index du carnet, s'écrit dans
`etalonnage.json` et revient au démarrage suivant. Un sextant étalonné hier
l'est encore.

### Les tests

`npm test` — 55 épreuves. La plus importante, `estime-reduction.test.js`, joue
**la boucle entière sans Electron ni simulateur** : un vol de quarante minutes,
un vent réel de 30 kt qui n'est pas celui qu'on a prévu, trois visées produites
par le calcul du simulateur, et le point qui doit rattraper la dérive. Elle
mesure au passage trois choses qui ne se devinent pas :

- **à vent bien prévu, la chaîne est exacte** — le point retombe à 0,3 NM ; tout
  ce qui dépasse, dans les autres cas, vient du vent et de rien d'autre ;
- **le transport hérite de l'erreur de vent**, puisqu'il recule les droites le
  long de la route qu'on *croit* avoir suivie ;
- donc **une tournée de visées étalée coûte cher** : à vingt minutes
  d'étalement, le point est nettement plus mauvais qu'à deux. C'est la raison
  pour laquelle un navigateur enchaîne ses trois visées.

## La coupure : l'application ne sait plus où l'on est

C'est le point de bascule du projet, et il a demandé plus que les trois retraits
demandés — parce que la vérité fuyait par sept endroits, pas par trois.

**Ce qui est parti :**

| | pourquoi |
|---|---|
| le marqueur d'avion et son tracé magenta | la position, en clair sur la carte |
| la latitude et la longitude du bandeau | la même chose, à cinq décimales |
| la vitesse sol | elle contient la dérive, donc le vent |
| l'indicateur de vent réel | il suffisait de le recopier dans la case du vent prévu |
| le suivi de carte centré sur l'appareil | le milieu de l'écran ÉTAIT la réponse |
| la route sol de la rose des vents | son écart au cap donnait la dérive d'un coup d'œil |
| le relèvement du point tournant, calculé depuis la position vraie | une droite de position exacte, sans viser |

Ce dernier était le plus discret : il ne ressemblait pas du tout à une position.

**Ce qui reste visible, et pourquoi :** l'**altitude** (lecture d'altimètre, et
la réfraction en a besoin), le **cap** (lecture de compas), l'**heure zulu**
(lecture de montre). La règle est la même que pour le carnet : *ce qui se lit
dans le cockpit est permis, ce qui contient le vent ne l'est pas.*

**Ce qui a pris leur place :** l'**estime**, en cercle pointillé bleu avec sa
trace. Le suivi de carte s'y recentre, la rose des vents s'y centre, et **le
catalogue d'astres y précalcule** — si bien que l'astre n'est plus tout à fait
là où on l'attend, et qu'il faut le chercher. Trente milles d'erreur d'estime le
déplacent d'un demi-degré en gisement et d'une demi-minute d'arc en hauteur :
assez pour chercher, jamais assez pour le perdre dans le champ.

L'angle de crabe de la rose travaille maintenant au **vent prévu** : le
navigateur lit le cap que sa supposition commande, et se trompera d'autant.

La position vraie n'existe plus que dans `visees.json`, sous scellés, et ne sort
que par le **débriefing**.

## Ce qui reste à faire

1. **Éprouver le tout dans le simulateur** — une vraie série d'étalonnage au
   parking, un vrai carnet tracé, un vrai vent trouvé. Rien de tout cela n'a
   encore volé.

## Le point porté sur la carte

Le partage historique du travail : on **construit** sur la feuille de position
— azimuts, intercepts, chapeau — et on **reporte** le résultat sur la carte. La
planchette reçoit la géométrie, la carte ne reçoit que le point, daté.

C'est légitime au regard de la coupure. Ce qui est interdit, c'est de montrer où
l'appareil **est** ; un point observé est ce que le navigateur a **conclu**,
sans que la vérité soit jamais entrée dans le calcul. S'il tombe juste, la carte
montre bien sa position — mais il l'a gagnée.

**Deux formes, deux natures** : le rond plein vert à ce qu'on a mesuré, le
cercle pointillé bleu de l'estime à ce qu'on suppose. Le vert n'est pas un choix
d'humeur — sur la carte, la chose dont il faut distinguer le point est justement
l'estime, et deux bleus voisins ne se distinguent pas. (Sur la planchette il est
encre bleue : là-bas le voisin est un trait de crayon gris.)

**Le vecteur est l'essentiel.** Le trait qui va de l'estime au point est ce que
les visées ont corrigé, donc ce que le vent avait fait dériver. Et la trace de
l'estime n'est plus effacée au recalage : sur un vol entier, la carte finit par
raconter l'histoire — l'estime dérive, un point la rattrape, elle repart. La
direction constante des rattrapages **est** le vent qu'on avait mal prévu.

La marque est clavetée sur l'**instant commun** du point : refaire le point sur
le même carnet — après avoir changé l'erreur d'index — remplace la marque au
lieu d'en empiler une seconde au même endroit. Vider le carnet efface les points
qui en venaient.

## Le vent calculé

La droite de hauteur ne rend pas seulement une position : elle rend le **vent**,
et c'était l'autre métier du poste. Depuis le 2026-08-22, chaque point observé
en donne un.

**Par le plot air, pas par « estime moins point ».** L'estime intègre le vent
supposé ; le plot air n'intègre que le cap et le badin — deux lectures de
cockpit — et ignore le vent par construction, y compris celui qu'on croyait. Au
moment du point, l'écart entre la position air et le point observé EST le
déplacement dû au vent réel ; divisé par le temps écoulé, il donne sa force, et
retourné de 180°, la direction d'où il souffle. Un test le vérifie en faisant
deux fois le même vol avec deux suppositions opposées : le vent trouvé est le
même au centième près.

Le plot air se **réancre à chaque calage franc**, donc chaque point mesure le
vent du tronçon qui vient de s'écouler, et non une moyenne diluée sur tout le
vol. Sous cinq minutes de course, on refuse : une minute d'arc d'erreur sur le
point inventerait plusieurs nœuds.

Le résultat s'affiche **là où il naît** — dans le bandeau du point, avec le vent
supposé à côté et un bouton pour l'adopter. L'écart entre les deux est la leçon
du tronçon, et il ne se lit qu'en les voyant ensemble ; c'est pourquoi
l'indicateur de vent n'est PAS revenu sur la carte.

### L'horloge, réparée au passage

L'estime tournait sur l'heure du PC. Le carnet de visées, lui, porte l'heure
zulu du **simulateur** — une nuit de 1943, peut-être. Deux conséquences, aucune
visible :

- `cruesA()`, interrogée avec l'heure d'une visée, tombait à des décennies du
  plus proche échantillon et rendait invariablement le premier de la liste : le
  transport des droites travaillait avec la route du **début du vol**, quels que
  soient les virages depuis ;
- l'avion parcourt une distance qui dépend du temps simulé, pas du temps écoulé
  au poignet : à deux fois la vitesse du temps, l'estime n'avançait que de
  moitié.

Elle tourne désormais sur l'heure du simulateur, avec repli sur celle du PC
quand le flux est coupé.

## La planchette de report

La feuille de position : une feuille blanche centrée sur l'estime, graduée en
milles. Le navigateur ne trace pas sur sa carte — au-dessus de l'océan elle n'a
rien à montrer, et son échelle n'est pas la bonne : un intercept fait quelques
milles, une carte en couvre mille. Le point trouvé se reporte ensuite sur la
carte ; c'est le partage historique du travail.

**Cinq choses, et rien d'autre** : l'estime au centre (carré — ce qu'on
suppose), les droites de hauteur avec le nom de leur astre, le chapeau, le point
(rond — ce qu'on a mesuré), l'échelle. La course, le tracé sans transport et les
azimuts de construction ont été essayés puis retirés : la feuille doit se
comprendre en dix secondes, et à douze objets elle ne s'y comprenait pas.

**Deux défauts qui ne se voient qu'à l'écran**, et qui valent d'être retenus
parce qu'aucun test ne les aurait trouvés :

- le nom écrit près du croisement tombe sur les autres droites — c'est là
  qu'elles se rejoignent, par construction. Il va au BOUT de la droite, du côté
  qui s'écarte le plus des autres ;
- un nom centré et couché déborde de la feuille alors que son point d'ancrage
  est dedans. C'est la BOÎTE du texte qu'il faut tester, quatre coins compris.

Le calcul est au noyau (`src/plotting.js`), monté par `reduction.js` en même
temps que le point ; `renderer/js/features/planchette.js` ne fait que peindre.
La séparation est délibérée : le jour où l'on voudra tracer à la main, au
rapporteur, c'est la couche du noyau qu'on garde et celle du dessin qu'on refait.

**La feuille ne peut pas trahir la position vraie** — son origine est l'estime,
ses droites sortent des visées, et un test l'éprouve en cherchant la vérité dans
le JSON qu'elle rend.

## Démarrer

```
npm install
npm start
```

### Si Electron ne se lance pas

`npm install` **échoue silencieusement à extraire le binaire** d'Electron sous
Windows : le paquet s'installe, `node_modules/electron/package.json` annonce la
bonne version, mais `dist/electron.exe` et `path.txt` n'existent pas. C'est un
échec sans message et sans code d'erreur — d'où `force-electron.js`, hérité de
Clear Sky VFR :

```
npm run force-electron
```

Il retélécharge le zip officiel (ou le reprend au cache) et le ré-extrait.
Vérifier ensuite que `node_modules/electron/dist/electron.exe` existe et que
`path.txt` contient `electron.exe` — c'est le seul contrôle qui compte, la
version déclarée par le paquet ne prouve rien.

Aucun module natif n'est utilisé : `node-simconnect` parle le protocole en
JavaScript pur. Il n'y a donc jamais de recompilation d'ABI à faire quand la
version d'Electron change.

## L'installeur

```
npm run dist
```

Produit `dist/Sextant-Navigator-Setup-<version>.exe`, un installeur NSIS par
utilisateur (pas d'élévation), avec choix du dossier, raccourci bureau et menu
Démarrer. Modèle repris de NavXpressVFR.

Trois points de cette configuration ne se devinent pas, et le `package.json` ne
peut pas les porter : **le schéma d'electron-builder refuse toute clé qu'il ne
connaît pas**, y compris un `comment`. Deux `comment` traînaient d'ailleurs dans
`extraResources` et faisaient échouer la validation — la configuration n'avait
donc jamais produit d'installeur avant le 2026-08-25. Les explications vivent
ici désormais.

**`asarUnpack`.** `node-simconnect` lit le registre pour trouver le tuyau de
SimConnect, et passe pour cela par `regedit`, qui **exécute des scripts `.vbs`
et `.wsf` depuis le disque**. Rien ne s'exécute depuis une archive asar : ces
deux paquets doivent en sortir, sans quoi l'application installée ne trouve plus
le simulateur alors qu'elle marche parfaitement en développement. Et `regedit`
est hissé à la racine de `node_modules` par npm — le seul motif
`node-simconnect/**`, qui est celui de NavXpressVFR, ne l'atteindrait pas. À
vérifier après chaque construction :

```
ls dist/win-unpacked/resources/app.asar.unpacked/node_modules
```

Les deux doivent y être.

**`extraResources`.** Le noyau d'éphémérides vit hors de ce dossier
(`sextant/src`) et `files` ne peut pas l'atteindre. Il est déposé tel quel dans
`resources/noyau/`, d'où `src/main/astres.js` l'importe. Pas de copie dans le
dépôt : une seule source, celle que les tests éprouvent. Le second bloc lui rend
son `type: module`, que `sextant/package.json` portait et qui ne suit pas les
fichiers.

**`publish`.** La configuration pointe `brackets-acrobat/sextant-navigator`.
`npm run dist` n'y touche pas — il écrit seulement un `latest.yml` local. Le
dépôt doit exister avant le premier `npm run publish`.
