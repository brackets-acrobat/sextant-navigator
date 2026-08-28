/*
 * Sextant Navigator
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// i18n.js — système de traductions bilingue FR / EN.
// Repris du mécanisme de NavXpressVFR : dictionnaire TRANSLATIONS,
// langue persistée (localStorage), application via attributs data-i18n
// (textContent), data-i18n-html (innerHTML), data-i18n-placeholder, data-i18n-title.
//
// CONVENTION : toute nouvelle chaîne d'UI ajoute sa clé dans fr ET en
// (jamais de texte en dur dans le HTML — sauf noms propres).
// ============================================================

const TRANSLATIONS = {
  fr: {
    statusConnected: 'Connecté',
    statusConnecting: 'Connexion…',
    statusDisconnected: 'MSFS Déconnecté',
    btnConnect: 'Connecter MSFS2024',
    btnDisconnect: 'Déconnecter MSFS2024',
    toggleTitle: 'Changer de langue / Switch language',

    // Second bandeau de données live
    lblIcaoDep: 'ICAO départ',
    lblIcaoArr: 'ICAO arrivée',
    savePlanTooltip: 'Sauvegarder le plan de vol',
    savePlanTitle: 'Sauvegarder le plan de vol',
    savePlanErr: 'Échec de la sauvegarde : {err}',
    newPlanTooltip: 'Nouveau plan de vol',
    newPlanTitle: 'Nouveau plan de vol',
    newPlanText: 'Le plan de vol en cours sera abandonné. Continuer ?',
    newPlanConfirm: 'Nouveau plan',
    openPlanTooltip: 'Ouvrir un plan de vol',
    openPlanTitle: 'Ouvrir un plan de vol',
    openPlanErr: 'Échec de l\'ouverture : {err}',
    lblAmsl: 'Altitude MSL',

    // Menu contextuel (clic droit sur la carte)
    ctxSetDep: 'Définir comme aéroport de départ',
    ctxSetArr: 'Définir comme aéroport d\'arrivée',
    ctxCalerEstime: 'Caler l\'estime ici',
    ctxSetDepPoint: 'Définir comme lieu de départ',
    ctxSetArrPoint: 'Définir comme lieu d\'arrivée',
    ctxDeleteWp: 'Supprimer ce point tournant',
    ctxSetActiveLeg: 'Rendre ce leg actif',
    ctxRangeCircle: 'Cercle de portée',
    ctxRangeCircleNavaid: 'Cercle de portée du navaid',
    ctxRangeDeleteOne: 'Supprimer ce cercle de portée',
    ctxRangeClear: 'Effacer les cercles de portée',
    ctxMesure: 'Distance à partir de ce point',
    ctxMesureEffacer: 'Effacer la mesure',
    ctxFlanquement: 'Flanquement VOR',
    ctxFlanquementDeleteOne: 'Effacer ce flanquement',
    ctxFlanquementClear: 'Effacer les flanquements',
    flanqTitre: 'Flanquement VOR',
    flanqStation: 'Station',
    flanqCible: 'Point de la route à flanquer',
    flanqAucuneCible: 'Aucun point de route : renseignez un départ et une arrivée.',
    flanqChoixRequis: 'Choisissez un point.',
    flanqTracer: 'Tracer',
    flanqDepart: 'Départ',
    flanqArrivee: 'Arrivée',
    flanqPointCarte: 'Un point de la carte…',
    flanqDesignerPoint: 'Cliquez le point à flanquer — Échap pour annuler.',
    rangeTitle: 'Cercle de portée',
    rangeLabel: 'Rayon (NM)',
    rangeDraw: 'Tracer',
    rangeInvalid: 'Rayon invalide.',

    // Modale d'aimantation d'un point tournant sur un aéroport / navaid proche
    snapTitle: 'Point tournant à proximité',
    snapText: 'Un {kind} est à {dist} NM : {feature}. Placer le point tournant dessus ?',
    snapAirport: 'aéroport',
    snapNavaid: 'navaid',
    snapKeep: 'Garder la position',
    snapPlace: 'Placer dessus',

    // Libellés communs aux modales
    btnClose: 'Fermer',
    btnCancel: 'Annuler',

    // Chronomètre et temps de vol (barre du haut). Mêmes clés que NavXpressVFR,
    // dont ces compteurs viennent — chronoStart/chronoStop servent aux deux.
    chronoLabel: 'Chronomètre',
    timerLabel: 'Temps de vol',
    chronoStart: 'Démarrer',
    chronoStop: 'Arrêter',
    chronoReset: 'Remise à zéro',

    // Recherche d'un aérodrome ou d'un navaid (code OACI ou nom).
    // Le bouton de la barre n'a que sa loupe : searchTitle lui sert d'infobulle
    // ET de titre de modale — le même libellé, qui dit la même chose.
    searchTitle: 'Rechercher un aérodrome ou un navaid',
    searchIntro: 'Code OACI ou nom, deux caractères au moins. Tous les aérodromes et navaids du monde, tels que la base MSFS 2024 les décrit.',
    searchPlaceholder: 'LFMD, Mandelieu, MTL…',
    searchTooShort: 'Tapez au moins deux caractères.',
    searchNone: 'Aucun résultat.',
    searchCount: '{n} résultat(s).',
    searchCountTruncated: 'Les {n} premiers résultats sur {total} — précisez la recherche.',
    searchNoData: 'Base MSFS 2024 absente : importez les aéroports et les navaids (menu Importer).',
    searchError: 'La recherche a échoué.',
    searchRunway: 'Piste',

    // {url} est remplacé par l'URL de l'API.

    // Import des aéroports MSFS 2024
    menuImportAirports: 'Aéroports MSFS2024',
    msfsImportTitle: 'Importer les aéroports MSFS 2024',
    msfsImportIntro: 'Extrait toute la base d\'aéroports de MSFS 2024 via SimConnect (pistes, fréquences, hélipads). MSFS 2024 doit être lancé avec un vol en cours. L\'opération peut durer plusieurs minutes.',
    btnImport: 'Importer',
    msfsCheckChecking: 'Vérification de MSFS 2024…',
    msfsCheckRunning: 'MSFS 2024 détecté ({app}).',
    msfsCheckNotRunning: 'MSFS 2024 ne répond pas. Lancez le simulateur avec un vol en cours, puis réessayez.',
    msfsProgressTitle: 'Extraction des aéroports MSFS 2024',
    msfsPhaseConnecting: 'Connexion au simulateur…',
    msfsPhaseEnumerate: 'Énumération des aéroports… ({n})',
    msfsPhaseDetail: 'Extraction des détails (pistes, fréquences, hélipads)…',
    msfsPhaseRetry: 'Reprise des aéroports en échec…',
    msfsProgressStats: '{rate}/s · temps restant estimé {eta} · {ok} OK · {failed} échec(s)',
    msfsExtractDone: 'Extraction terminée : {n} aéroports enregistrés.',
    msfsExtractEmpty: 'Aucun aéroport extrait. Vérifiez que MSFS 2024 tourne avec un vol en cours.',
    msfsExtractError: 'Extraction échouée : {msg}',

    // Import des navaids MSFS 2024 (réutilise msfsCheck*/msfsPhaseConnecting/btnImport)
    menuImportNavaids: 'Navaids MSFS2024',
    navaidsImportTitle: 'Importer les navaids MSFS 2024',
    navaidsImportIntro: 'Reconstruit la base mondiale de navaids (VOR/NDB) de MSFS 2024 par traversance du réseau d\'airways. MSFS 2024 doit être lancé avec un vol en cours. L\'opération peut durer plusieurs minutes.',
    navaidsProgressTitle: 'Extraction des navaids MSFS 2024',
    navaidsPhaseEnumerate: 'Énumération des aéroports… ({n})',
    navaidsPhaseSeed: 'Lecture des procédures (amorçage)…',
    navaidsPhaseBfs: 'Parcours du réseau d\'airways…',
    navaidsPhaseVor: 'Détail des VOR/DME/TACAN…',
    navaidsPhaseNdb: 'Détail des NDB…',
    navaidsPhaseDisco: 'Navaids isolés (complément)…',
    navaidsProgressStats: '{nav} navaids · {wpt} waypoints parcourus',
    navaidsExtractDone: 'Extraction terminée : {n} navaids enregistrés.',
    navaidsExtractEmpty: 'Aucun navaid extrait. Vérifiez que MSFS 2024 tourne avec un vol en cours.',
    navaidsExtractError: 'Extraction échouée : {msg}',

    // Import des données d'élévation (GLOBE all10g.zip)
    menuImportElevation: 'Données d\'élévation',
    elevConfirmTitle: 'Re-télécharger les données ?',
    elevConfirmMsg: 'Les données d\'élévation semblent déjà installées (~1,8 Go). Re-télécharger l\'archive (~307 Mo) et remplacer les fichiers existants ?',
    elevConfirmBtn: 'Re-télécharger',
    elevProgressTitle: 'Import des données d\'élévation',
    elevPhaseStarting: 'Préparation…',
    elevPhaseDownloading: 'Téléchargement de all10g.zip…',
    elevPhaseExtracting: 'Extraction des tuiles (~1,8 Go)…',
    elevPhaseFlattening: 'Organisation des fichiers…',
    elevProgressDone: 'Données d\'élévation installées.',
    elevProgressDoneDir: 'Dossier : {dir}',
    elevProgressError: 'Échec de l\'import',


    // Fin de vol : question posée à chaque immobilisation complète


    // Détection des terrains add-on (lecture des paquets sur le disque)
    menuDetectAddons: 'Détecter les add-ons',
    addonsTitle: 'Détecter les terrains add-on',
    addonsIntro: 'Le simulateur ne dit pas d\'où vient un terrain : la détection lit les paquets sur le disque et rapproche leurs positions de la base MSFS 2024. Choisissez le dossier qui contient vos paquets.',
    addonsRootLabel: 'Dossier des paquets',
    addonsBrowse: 'Choisir…',
    addonsRun: 'Analyser',
    addonsScanning: 'Analyse des paquets…',
    addonsLastScan: 'Dernière analyse : {n} terrains marqués, le {date}.',
    addonsDone: '{n} terrains marqués — {rattaches} paquets rattachés sur {paquets}.',
    addonsErrRoot: 'Dossier introuvable.',
    addonsErrNoBase: 'Base MSFS 2024 absente : importez d\'abord les aéroports.',
    addonsErr: 'L\'analyse a échoué.',

    // Couches de la carte et choix du fond
    layersTitle: 'Couches',
    layerAirports: 'Aéroports',
    layerHeliports: 'Héliports',
    layerSeaplanes: 'Hydrobases',
    layerNavaids: 'Navaids',
    layerZoomNote: 'Ces couches apparaissent à partir du zoom 8.',
    basemapTitle: 'Fond de carte',
    followTitle: 'Garder l\'estime au centre',

    // Clé API CARTO (fonds Dark Matter et Positron)
    cartoKeyBtn: 'Clé API CARTO…',
    cartoNoteSet: 'Clé CARTO enregistrée : Dark Matter et Positron sont sans filigrane.',
    cartoNoteMissing: 'Sans clé CARTO, Dark Matter et Positron sont filigranés.',
    cartoTitle: 'Clé API CARTO',
    cartoText: 'Dark Matter et Positron viennent de CARTO, qui exige désormais une clé pour servir ses tuiles sans filigrane. Elle est gratuite, mais nominative : chacun saisit la sienne. Elle reste sur cet ordinateur et n\'est envoyée qu\'à CARTO, avec les tuiles.',
    cartoLink: 'Demandez la vôtre sur <a href="https://carto.com/basemaps/apikey/" target="_blank" rel="noopener">carto.com/basemaps/apikey</a> : elle arrive par courriel, sans file d\'attente ni compte à créer.',
    cartoLabel: 'Votre clé',
    cartoPlaceholder: 'Collez ici la clé reçue',
    cartoEmpty: 'Saisissez la clé reçue de CARTO.',
    cartoInvalid: 'Cette clé contient un espace ou un caractère inattendu : vérifiez le copier-coller.',
    cartoSave: 'Enregistrer',
    cartoForget: 'Oublier la clé',

    // Panneau « Plan de vol » (tableau des legs)
    legsToggle: 'Afficher plan de vol',
    copyWpTitle: 'Copier les points tournants',
    legsClose: 'Masquer le plan de vol',
    legsTitle: 'Plan de vol',
    legsTotal: 'Distance totale',
    legsColNum: 'N°',
    legsColFrom: 'Départ',
    legsColTo: 'Arrivée',
    legsColAlt: 'Alt (ft)',
    legsColDist: 'Dist (nm)',
    legsColRoute: 'Route (°)',
    legsColHdg: 'Cap (°)',
    legsColGs: 'GS (kt)',
    legsColTime: 'Durée',
    legsTotalTime: 'Durée totale',
    legsEmpty: 'Aucun plan de vol.',
    legsRouteHint: 'Route vraie de la branche (la carte est nord-vrai)',
    legsCapHint: 'Cap magnétique à suivre = route vraie {r} + dérive {v}° − déclinaison {d}°',
    legsTimeNoVp: 'Renseignez la vitesse propre pour obtenir la vitesse sol et la durée.',
    legsTimeImpossible: 'Route intenable : le vent est trop fort pour cette vitesse propre.',

    // Paramètres de navigation du plan (bandeau du panneau « Plan de vol »)
    navVp: 'Vp',
    navVent: 'Vent prévu',
    navVpTitle: 'Vitesse propre (TAS), en nœuds',
    navVentDirTitle: 'Direction d\'où vient le vent PRÉVU, en degrés VRAIS (comme MSFS et les METAR écrits). C\'est le vent que VOUS croyez : le simulateur ne le remplit pas, et il en applique un autre. L\'écart entre les deux est ce que la droite de hauteur révélera.',
    navVentKtTitle: 'Force du vent PRÉVU, en nœuds. Le simulateur ne la remplit pas : c\'est votre estimation, et l\'estime dérivera de son erreur.',

    // Inversion du plan de vol
    reversePlan: 'Inverser le plan de vol',

    // Compas magnétique autour de l'appareil
    compassToggle: 'Afficher compas magnétique autour de l\'appareil',

    // Profil vertical (relief GLOBE le long du plan de vol)
    vertProfileToggle: 'Afficher le profil vertical',
    vertProfileClose: 'Masquer le profil vertical',
    vertProfileTitle: 'Profil vertical',
    vertProfileEmpty: 'Créez un plan de vol (départ + arrivée) pour afficher le profil vertical.',
    vertProfileNoData: 'Relief indisponible. Importez d\'abord les données d\'élévation (menu Importer → Données d\'élévation).',
    vertProfileError: 'Profil indisponible : {err}',
    vertProfileTerrain: 'Relief',
    vertProfilePlanned: 'Alt. prévue',
    vertProfileGround: 'Sol',
    vertProfilePlannedFull: 'Altitude prévue',
    vertProfileSafe: 'Alt. sécu',
    vertProfileSafeFull: 'Altitude de sécurité',
    vertProfileSummit: 'Sommet route',
    vertProfileMinMargin: 'Marge mini',

    // Popup d'un lieu d'atterrissage (couche « Lieux d'atterrissage »)

    // Catalogue d'astres
    astresToggle: 'Catalogue d\'astres',
    astresTitle: 'Catalogue d\'astres',
    astresRefresh: 'Recalculer',
    // « Bord » plutôt que « MSFS » : le bouton dit d'où viennent l'heure et la
    // position, pas quel logiciel tourne. Que le simulateur soit connecté se
    // lit sur le bouton de connexion, et nulle part ailleurs.
    astresSrcSim: 'Bord',
    astresSrcSimTitle: 'Instant et position pris au simulateur — cliquer pour saisir à la main',
    astresSrcFree: 'Libre',
    astresSrcFreeTitle: 'Instant et position saisis à la main — cliquer pour reprendre le simulateur',
    astresUtc: 'UTC',
    astresUtcTitle: 'Instant du calcul, en temps universel',
    astresLat: 'Lat',
    astresLon: 'Lon',
    astresCap: 'Cap',
    astresCapTitle: 'Cap VRAI de l\'appareil : c\'est lui qui donne le gisement',
    astresHauteur: 'Hauteur',
    astresHminTitle: 'Sous cette hauteur, la réfraction devient incertaine et la correction douteuse',
    astresHmaxTitle: 'Au-dessus, l\'azimut varie trop vite pour que la droite de hauteur garde un sens',
    astresMagLimite: 'Mag ≤',
    astresMagTitle: 'Limite de magnitude des étoiles retenues (plus le nombre est haut, plus le catalogue est large)',

    astresCielLigne: 'Soleil {soleil} · {phase} · {etoiles}',
    astresCielJour: 'plein jour',
    astresCielCivil: 'crépuscule civil',
    astresCielNautique: 'crépuscule nautique',
    astresCielAstro: 'crépuscule astronomique',
    astresCielNuit: 'nuit noire',
    astresEtoilesOui: 'étoiles utilisables',
    astresEtoilesNon: 'étoiles pas encore visibles',

    astresBestTrio: 'Meilleur trio :',
    astresBestPaire: 'Meilleure paire :',
    astresBestAucun: 'Pas assez d\'astres dans le domaine pour faire un point.',
    astresChoisir: 'Choisir',
    astresCoupe: 'coupe',
    astresErreurPoint: 'erreur du point',
    astresIdeal: '(au mieux)',
    astresSelN: '{n} astres :',
    astresSelUn: '{astre} seul : une droite de hauteur, pas un point.',
    astresParalleles: 'Ces astres donnent des droites parallèles : il n\'y a pas de point.',
    astresVerdictExcellent: 'excellent',
    astresVerdictBon: 'bon',
    astresVerdictMediocre: 'médiocre',
    astresVerdictMauvais: 'à éviter',

    // Noms d'astres. Les ÉTOILES n'y figurent pas : Vega, Altair, Betelgeuse
    // sont des noms propres, identiques dans toutes les tables du monde.
    astresBodySun: 'Soleil',
    astresBodyMoon: 'Lune',
    astresBodyVenus: 'Vénus',
    astresBodyMars: 'Mars',
    astresBodyJupiter: 'Jupiter',
    astresBodySaturn: 'Saturne',

    astresCount: 'Astres',
    astresEcartes: '{n} astre(s) levé(s) mais hors du domaine {min}–{max} : {liste}. Élargissez les bornes pour les voir.',

    // Estime, r\u00e9duction et point
    estimeAbsente: "Estime non cal\u00e9e \u2014 elle se cale toute seule au sol, puis court au cap, au badin et au vent PR\u00c9VU.",
    estimeAuSol: "au sol",
    estimeDerive: "d\u00e9rive",
    estimeAge: "tenue depuis {age}",
    estimeOrigineEstime: "estime",
    estimeOriginePoint: "depuis le dernier point",

    viseesIe: "Erreur d'index",
    viseesIeTitle: "Correction d'index que VOUS appliquez, en minutes d'arc. Vous ne connaissez pas celle de votre exemplaire : c'est l'\u00e9talonnage qui la r\u00e9v\u00e8le, et sur des astres LENTS \u2014 sinon on mesure le retard de manivelle au lieu de l'instrument.",
    viseesPointBtn: "Faire le point",
    viseesPointTitle: "R\u00e9duire les vis\u00e9es contre l'estime et croiser les droites",
    viseesPointTitre: "Point observ\u00e9",
    viseesEcartEstime: "\u00e9cart \u00e0 l'estime",
    viseesChapeau: "chapeau",
    viseesChapeauMent: "Le chapeau mesure la CONCORDANCE des droites, pas la justesse du point : une erreur commune \u00e0 toutes les vis\u00e9es le resserre tout en d\u00e9pla\u00e7ant le point.",
    viseesUneDroite: "Une seule vis\u00e9e : cela fait une droite de hauteur, pas une position. Il en faut deux, et mieux vaut trois.",
    viseesRecaler: "Recaler l'estime ici",
    viseesDebrief: "D\u00e9briefing",
    viseesDebriefLigne: "V\u00e9rit\u00e9 : le point \u00e9tait faux de {point} NM, l'estime de {estime} NM \u2014 gain {gain} NM.",
    viseesDebriefImpossible: "Pas de v\u00e9rit\u00e9 enregistr\u00e9e pour ces vis\u00e9es : rien \u00e0 d\u00e9briefer.",
    viseesVentCalcule: "Vent calculé",
    viseesVentCru: "vous supposiez",
    viseesVentAdopter: "Adopter ce vent",
    viseesVentCalme: "Vent calculé : calme — l'écart entre la position air et le point est trop faible pour lui donner une direction.",
    viseesVentTropCourt: "Vent non calculé : moins de cinq minutes depuis le dernier calage. Sur une course aussi courte, une minute d'arc d'erreur sur le point invente plusieurs nœuds de vent.",
    viseesVentImpossible: "Vent non calculé : il faut un plot air, donc un vol commencé depuis un point connu.",
    viseesVers: "vers",
    viseesLoin: "oppos\u00e9",
    viseesColHo: "Ho",
    viseesColZn: "Zn",
    viseesColIntercept: "Intercept",
    viseesHintHo: "Hauteur observ\u00e9e : le Hs corrig\u00e9 de l'erreur d'index que vous d\u00e9clarez, de la r\u00e9fraction et de la parallaxe.",
    viseesHintZnRed: "Azimut vrai de l'astre, calcul\u00e9 depuis l'estime. C'est la perpendiculaire de la droite de hauteur.",
    viseesHintIntercept: "De combien porter la droite, et dans quel sens : VERS l'astre si l'on a mesur\u00e9 plus haut que calcul\u00e9, \u00e0 l'OPPOS\u00c9 sinon.",
    viseesErrEstime: "Pas d'estime : elle se cale au sol d\u00e8s que le simulateur est connect\u00e9, ou sur un point observ\u00e9.",
    viseesErrVide: "Aucune vis\u00e9e \u00e0 r\u00e9duire.",
    viseesErrNoyau: "Le noyau d'\u00e9ph\u00e9m\u00e9rides n'a pas pu \u00eatre charg\u00e9.",
    viseesErrCalcul: "La r\u00e9duction a \u00e9chou\u00e9.",

    // \u00c9talonnage \u2014 mesurer ce que vaut SON exemplaire
    etalTitre: "\u00c9talonnage",
    etalToggle: "\u00c9talonner le sextant : une s\u00e9rie de vis\u00e9es depuis une position connue",
    etalRegle: "Visez des astres LENTS, pr\u00e8s du m\u00e9ridien. Sur un astre rapide, un tambour qui tra\u00eene d'une demi-minute fait lire plusieurs minutes d'arc trop haut : on mesure alors sa main au lieu de son sextant.",
    etalSol: "Depuis le terrain",
    etalSolTitle: "Prendre la position de l'appareil au sol. C'est le seul moment o\u00f9 l'on sait vraiment o\u00f9 l'on est : le canal se referme au d\u00e9collage.",
    etalLat: "Lat",
    etalLon: "Lon",
    etalManuel: "Ouvrir ici",
    etalMesurer: "Mesurer",
    etalArreter: "Abandonner",
    etalVide: "Aucune vis\u00e9e depuis l'ouverture de la s\u00e9rie. Visez : elles arriveront ici.",
    etalCompte: "{n} vis\u00e9e(s), dont {lentes} lente(s)",
    etalColEcart: "Ho\u2212Hc",
    etalHintEcart: "L'erreur du sextant sur cette vis\u00e9e : hauteur observ\u00e9e moins hauteur calcul\u00e9e depuis la position connue. La correction est son oppos\u00e9.",
    etalHintVitesse: "Vitesse verticale de l'astre. Au-del\u00e0 du seuil, la vis\u00e9e ne compte plus pour la moyenne \u2014 mais elle sert encore \u00e0 mesurer le retard de manivelle.",
    etalRapide: "Plus de {seuil}\u2032/min : trop rapide pour la moyenne. Elle sert au calcul du retard.",
    etalRefuser: "\u00c9carter cette vis\u00e9e de la s\u00e9rie",
    etalRemettre: "Remettre cette vis\u00e9e dans la s\u00e9rie",
    etalCorrection: "Correction",
    etalDispersion: "dispersion",
    etalAdopter: "Adopter",
    etalOublier: "Oublier",
    etalManqueLentes: "Il manque {n} vis\u00e9e(s) sur astres lents \u2014 moins de {seuil}\u2032/min \u2014 pour se prononcer.",
    etalManquePente: "Et la s\u00e9rie est trop uniforme pour mesurer le retard de manivelle : il y faudrait un astre rapide.",
    etalMethodeLents: "{n} astres lents",
    etalMethodeRetard: "s\u00e9rie redress\u00e9e",
    etalMethodeBrut: "moyenne brute",
    etalMethodeCourtLents: "astres lents",
    etalMethodeCourtRetard: "s\u00e9rie redress\u00e9e",
    etalMethodeCourtBrut: "moyenne brute",
    etalRetardLigne: "Retard de manivelle mesur\u00e9 : {retard} \u00b1 {se} s. C'est votre geste, pas l'instrument \u2014 et il se corrige d\u00e8s la vis\u00e9e suivante.",
    etalBiaisResiduel: "Il reste au plus {biais}\u2032 de retard dans les vis\u00e9es retenues : visez plus pr\u00e8s du m\u00e9ridien pour le r\u00e9duire.",
    etalVitesseRetenue: "Astres retenus : jusqu'\u00e0 {v}\u2032/min. La s\u00e9rie est trop uniforme pour mesurer votre retard de manivelle, mais chaque seconde de retard y laisse {x}\u2032.",
    etalAvertBrut: "Cette s\u00e9rie ne contient pas assez d'astres lents et reste trop uniforme pour s\u00e9parer les deux effets : la correction propos\u00e9e contient votre retard de manivelle.",
    etalAvertRetard: "Faute d'astres lents, la correction ne vient pas de la moyenne mais de la pente de la s\u00e9rie. C'est bon, mais moins s\u00fbr : visez pr\u00e8s du m\u00e9ridien la prochaine fois.",
    etalAdopteeLigne: "\u00c9talon en service : {corr}, {methode}, {n} vis\u00e9es, le {date}.",
    etalAucunEtalon: "Aucun \u00e9talonnage : vos r\u00e9ductions se font sans correction, et le point porte l'erreur de l'instrument.",
    etalEnVol: "En vol, l'\u00e9talonnage n'a pas de sens : on mesurerait la d\u00e9rive de l'estime au lieu de l'instrument.",
    etalPasAuSol: "L'appareil n'est pas au sol, ou l'estime n'est pas cal\u00e9e : la position du terrain n'est pas offerte.",
    etalPositionInvalide: "Position illisible.",

    // La planchette de report — la feuille de position
    planchetteTitre: "Planchette",
    planchetteToggle: "Tracer les droites de hauteur sur la feuille de position",
    planchetteEstime: "estime",
    planchettePoint: "point",
    planchetteResume: "Le point est à {nm} NM de l'estime, au {rel}°",
    planchetteVide: "Rien à tracer : il faut une estime calée et au moins deux visées au carnet.",
    planchetteUneDroite: "Une seule visée : cela fait une droite de hauteur, pas un point. Il en faut deux, et mieux vaut trois.",

    astresColAstre: 'Astre',
    astresColHc: 'Hc',
    astresColZn: 'Zn',
    astresColGis: 'Gt',
    astresColVitesse: "′/min",
    astresHintVitesse: "Vitesse verticale de l’astre, en minutes d’arc par minute de temps. C’est ce qu’il faudra suivre à la molette pendant l’intégration : l’intégrateur moyenne la position du TAMBOUR, pas la vérité. Nulle au méridien, maximale au plein est et au plein ouest.",
    astresColMag: 'Mag',
    astresColCoupe: 'Coupe',
    astresColCoupeSel: 'Coupe / sél.',
    astresHintHc: 'Hauteur calculée — c\'est ce qui s\'affiche au TAMBOUR du sextant',
    astresHintZn: 'Azimut vrai, compté depuis le nord. Il sert au tracé et à l\'angle de coupe, PAS à trouver l\'astre : la couronne du sextant est solidaire de la cellule et ne connaît pas le nord.',
    astresHintGis: 'Gisement : azimut compté depuis le nez de l\'appareil. C\'est ce qui s\'affiche sur la COURONNE du sextant — le seul chiffre qui serve à trouver l\'astre.',
    astresHintMag: 'Magnitude visuelle : plus le nombre est bas, plus l\'astre est brillant et facile à trouver',
    astresHintCoupe: 'Meilleur angle de croisement disponible avec un autre astre du catalogue',
    astresHintCoupeSel: 'Angle de croisement avec la sélection — c\'est la plus mauvaise paire qui est donnée',
    astresCoupeAvec: 'Coupe le mieux avec {astre}',
    astresCoupeAvecSel: 'Coupe le plus mal avec {astre}',
    astresLunePct: 'Lune éclairée à {p} %',
    astresVide: 'Aucun astre dans le domaine de visée.',
    astresErrSaisie: 'Instant ou position illisible : attendu AAAA-MM-JJ HH:MM:SS et des degrés décimaux.',
    astresErrNoyau: 'Le noyau d\'éphémérides n\'a pas pu être chargé.',
    astresErrPosition: 'Position manquante ou hors domaine.',
    astresErrHeure: 'Heure invalide.',
    astresErrCalcul: 'Le calcul des éphémérides a échoué.',
    astresConsigneEnvoyer: 'Consigner cet astre au sextant',
    astresConsigneAnnuler: 'Annuler la consigne — le champ du sextant se videra',

    // Pont avec le panneau du sextant
    // Le numéro de port a disparu de ces trois lignes : c'est un détail
    // d'informatique, et le navigateur n'a qu'une question — le sextant
    // entend-il, ou non ? L'erreur reste affichée quand la liaison échoue,
    // parce que là, il y a quelque chose à réparer.
    pontConnecte: 'Sextant relié.',
    pontAttente: 'Le sextant ne s\'est pas encore présenté. La consigne l\'attendra.',
    pontFerme: 'Liaison impossible : {err}. Aucune consigne ne partira, aucune visée n\'arrivera.',
    pontConsigneEnCours: 'consigne : {astre}',

    // Carnet des visées reçues
    viseesToggle: 'Visées reçues du sextant',
    viseesTitle: 'Visées reçues',
    viseesCount: 'Visées',
    viseesViderTitle: 'Vider le carnet — les visées seront perdues',
    viseesSupprimer: 'Supprimer cette visée',
    viseesNote: 'Hauteurs telles que le tambour les a données : ni erreur d\'index, ni réfraction, ni parallaxe. La réduction viendra avec le carnet.',
    viseesNonEcrite: 'Visée reçue mais NON écrite sur le disque : elle ne survivra pas à la fermeture.',
    viseesColDate: 'Date',
    viseesColHeure: 'Mi-temps',
    viseesColAstre: 'Astre',
    viseesColHs: 'Hs',
    viseesColDuree: 'Durée',
    viseesColAlt: 'Alt',
    viseesHintHeure: 'Heure de mi-temps de l\'intégration — c\'est l\'instant de la visée, ni son début ni sa fin',
    viseesHintHs: 'Hauteur lue au tambour, non corrigée. Ce n\'est pas encore une hauteur observée.',
    viseesHintDuree: 'Durée d\'intégration : c\'est elle qui dit ce que vaut la moyenne de la bulle',
    viseesHintAlt: 'Altitude au moment de la visée — elle commande la réfraction',
    viseesVide: 'Aucune visée reçue. Elles arriveront du sextant par le pont.',

    // Bannière de mise à jour (electron-updater)
    updateDownloading: 'Téléchargement de la mise à jour… {percent} %',
    updateReady: 'Mise à jour {version} prête à être installée.',
    updateRestart: 'Redémarrer et installer',

    // Modale « À propos » (bouton « ? » du header)
    btnAboutTooltip: 'À propos',
    aboutTitle: 'À propos',
    // Présentation refaite le 2026-08-25 : elle décrivait encore Clear Sky VFR,
    // dont cette application est dérivée. L'ordre compte — l'astronomie
    // d'abord, parce que c'est le sujet ; les outils VFR ensuite, parce qu'ils
    // servent le même vol sans en être la raison.
    aboutTagline: 'La table du navigateur astronomique, pour le sextant à bulle de Microsoft Flight Simulator 2024.',
    aboutIntro: 'Le sextant vit dans le simulateur, la table est ici, et les deux ne se disent que le strict nécessaire : la table désigne l\'astre à viser, le sextant renvoie ses hauteurs. Elle ne sait jamais où vous êtes — c\'est tout l\'objet du jeu. Le catalogue dit quels astres le ciel offre à cet instant, avec leur gisement et leur hauteur ; le carnet reçoit les visées, les réduit contre votre estime, transporte les droites à un instant commun et rend le point, son chapeau et le vent qui s\'en déduit ; la planchette les trace comme sur une vraie feuille de position. Et l\'étalonnage vous fait découvrir, au parking, l\'erreur d\'index de votre propre exemplaire.',
    aboutIntroVfr: 'Autour, ce qu\'il faut pour porter le vol sur la carte : des aérodromes et des radionavaids qui viennent du simulateur lui-même — les vôtres, terrains add-on compris — le plan de vol et son log de navigation, le profil du relief avec altitude minimale par branche, la recherche mondiale, la rose des vents magnétique et les chronomètres.',
    aboutLicense: 'Ce logiciel est distribué sous licence GPL-3.0 ou ultérieure.',
    aboutSource: 'Le code source de cette application est disponible sur <a href="https://github.com/brackets-acrobat/sextant-navigator" target="_blank" rel="noopener">GitHub</a>.',
    aboutCopyright: 'Copyright 2026 Cyril MILANI.',
    aboutCreditsMethod: 'L\'extraction des navaids depuis MSFS 2024 (<code>extract-navaids-msfs.js</code>) s\'inspire directement de la méthode du projet atools / Little Navmap d\'Alexander Barthel.',
  },

  en: {
    statusConnected: 'Connected',
    statusConnecting: 'Connecting…',
    statusDisconnected: 'MSFS Disconnected',
    btnConnect: 'Connect MSFS2024',
    btnDisconnect: 'Disconnect MSFS2024',
    toggleTitle: 'Changer de langue / Switch language',

    // Second live-data bar
    lblIcaoDep: 'Departure ICAO',
    lblIcaoArr: 'Arrival ICAO',
    savePlanTooltip: 'Save flight plan',
    savePlanTitle: 'Save flight plan',
    savePlanErr: 'Save failed: {err}',
    newPlanTooltip: 'New flight plan',
    newPlanTitle: 'New flight plan',
    newPlanText: 'The current flight plan will be discarded. Continue?',
    newPlanConfirm: 'New plan',
    openPlanTooltip: 'Open a flight plan',
    openPlanTitle: 'Open a flight plan',
    openPlanErr: 'Open failed: {err}',
    lblAmsl: 'Altitude MSL',

    // Map context menu (right-click)
    ctxSetDep: 'Set as departure airport',
    ctxSetArr: 'Set as arrival airport',
    ctxCalerEstime: 'Set the DR position here',
    ctxSetDepPoint: 'Set as departure point',
    ctxSetArrPoint: 'Set as arrival point',
    ctxDeleteWp: 'Delete this turning point',
    ctxSetActiveLeg: 'Set this leg as active',
    ctxRangeCircle: 'Range ring',
    ctxRangeCircleNavaid: 'Navaid range ring',
    ctxRangeDeleteOne: 'Delete this range ring',
    ctxRangeClear: 'Clear range rings',
    ctxMesure: 'Distance from this point',
    ctxMesureEffacer: 'Clear measurement',
    ctxFlanquement: 'VOR cross-bearing',
    ctxFlanquementDeleteOne: 'Clear this cross-bearing',
    ctxFlanquementClear: 'Clear cross-bearings',
    flanqTitre: 'VOR cross-bearing',
    flanqStation: 'Station',
    flanqCible: 'Route point to cross-bear',
    flanqAucuneCible: 'No route point: set a departure and an arrival.',
    flanqChoixRequis: 'Select a point.',
    flanqTracer: 'Draw',
    flanqDepart: 'Departure',
    flanqArrivee: 'Arrival',
    flanqPointCarte: 'A point on the map…',
    flanqDesignerPoint: 'Click the point to cross-bear — Esc to cancel.',
    rangeTitle: 'Range ring',
    rangeLabel: 'Radius (NM)',
    rangeDraw: 'Draw',
    rangeInvalid: 'Invalid radius.',

    // Snap a turning point onto a nearby airport / navaid
    snapTitle: 'Turning point nearby',
    snapText: 'A {kind} is {dist} NM away: {feature}. Snap the turning point onto it?',
    snapAirport: 'airport',
    snapNavaid: 'navaid',
    snapKeep: 'Keep position',
    snapPlace: 'Snap onto it',

    // Labels shared by the modals
    btnClose: 'Close',
    btnCancel: 'Cancel',

    // Stopwatch and flight time (topbar). Same keys as NavXpressVFR, where these
    // counters come from — chronoStart/chronoStop serve both.
    chronoLabel: 'Stopwatch',
    timerLabel: 'Flight time',
    chronoStart: 'Start',
    chronoStop: 'Stop',
    chronoReset: 'Reset',

    // Airport / navaid search (ICAO code or name). The topbar button is the
    // magnifier alone: searchTitle serves as both its tooltip and the modal title.
    searchTitle: 'Search for an airport or a navaid',
    searchIntro: 'ICAO code or name, at least two characters. Every airport and navaid worldwide, as the MSFS 2024 database describes them.',
    searchPlaceholder: 'LFMD, Mandelieu, MTL…',
    searchTooShort: 'Type at least two characters.',
    searchNone: 'No result.',
    searchCount: '{n} result(s).',
    searchCountTruncated: 'First {n} results out of {total} — narrow the search.',
    searchNoData: 'MSFS 2024 database missing: import airports and navaids (Import menu).',
    searchError: 'The search failed.',
    searchRunway: 'Runway',

    // MSFS 2024 airports import
    menuImportAirports: 'MSFS2024 airports',
    msfsImportTitle: 'Import MSFS 2024 airports',
    msfsImportIntro: 'Extracts the whole MSFS 2024 airport database via SimConnect (runways, frequencies, helipads). MSFS 2024 must be running with a flight loaded. This can take several minutes.',
    btnImport: 'Import',
    msfsCheckChecking: 'Checking MSFS 2024…',
    msfsCheckRunning: 'MSFS 2024 detected ({app}).',
    msfsCheckNotRunning: 'MSFS 2024 is not responding. Launch the simulator with a flight loaded, then try again.',
    msfsProgressTitle: 'MSFS 2024 airports extraction',
    msfsPhaseConnecting: 'Connecting to the simulator…',
    msfsPhaseEnumerate: 'Enumerating airports… ({n})',
    msfsPhaseDetail: 'Extracting details (runways, frequencies, helipads)…',
    msfsPhaseRetry: 'Retrying failed airports…',
    msfsProgressStats: '{rate}/s · est. time remaining {eta} · {ok} OK · {failed} failed',
    msfsExtractDone: 'Extraction complete: {n} airports saved.',
    msfsExtractEmpty: 'No airport extracted. Make sure MSFS 2024 is running with a flight loaded.',
    msfsExtractError: 'Extraction failed: {msg}',

    // MSFS 2024 navaids import (reuses msfsCheck*/msfsPhaseConnecting/btnImport)
    menuImportNavaids: 'MSFS2024 navaids',
    navaidsImportTitle: 'Import MSFS 2024 navaids',
    navaidsImportIntro: 'Rebuilds the worldwide MSFS 2024 navaid database (VOR/NDB) by traversing the airway network. MSFS 2024 must be running with a flight loaded. This can take several minutes.',
    navaidsProgressTitle: 'MSFS 2024 navaids extraction',
    navaidsPhaseEnumerate: 'Enumerating airports… ({n})',
    navaidsPhaseSeed: 'Reading procedures (seeding)…',
    navaidsPhaseBfs: 'Traversing the airway network…',
    navaidsPhaseVor: 'VOR/DME/TACAN details…',
    navaidsPhaseNdb: 'NDB details…',
    navaidsPhaseDisco: 'Isolated navaids (extra)…',
    navaidsProgressStats: '{nav} navaids · {wpt} waypoints visited',
    navaidsExtractDone: 'Extraction complete: {n} navaids saved.',
    navaidsExtractEmpty: 'No navaid extracted. Make sure MSFS 2024 is running with a flight loaded.',
    navaidsExtractError: 'Extraction failed: {msg}',

    // Elevation data import (GLOBE all10g.zip)
    menuImportElevation: 'Elevation data',
    elevConfirmTitle: 'Re-download the data?',
    elevConfirmMsg: 'Elevation data appears to be already installed (~1.8 GB). Re-download the archive (~307 MB) and replace the existing files?',
    elevConfirmBtn: 'Re-download',
    elevProgressTitle: 'Elevation data import',
    elevPhaseStarting: 'Preparing…',
    elevPhaseDownloading: 'Downloading all10g.zip…',
    elevPhaseExtracting: 'Extracting tiles (~1.8 GB)…',
    elevPhaseFlattening: 'Organizing files…',
    elevProgressDone: 'Elevation data installed.',
    elevProgressDoneDir: 'Folder: {dir}',
    elevProgressError: 'Import failed',


    // End of flight: asked at every full stop


    // Add-on airport detection (reads the packages on disk)
    menuDetectAddons: 'Detect add-ons',
    addonsTitle: 'Detect add-on airports',
    addonsIntro: 'The simulator never says where an airport comes from: detection reads the packages on disk and matches their positions against the MSFS 2024 database. Pick the folder holding your packages.',
    addonsRootLabel: 'Package folder',
    addonsBrowse: 'Browse…',
    addonsRun: 'Scan',
    addonsScanning: 'Scanning packages…',
    addonsLastScan: 'Last scan: {n} airports marked, on {date}.',
    addonsDone: '{n} airports marked — {rattaches} of {paquets} packages matched.',
    addonsErrRoot: 'Folder not found.',
    addonsErrNoBase: 'MSFS 2024 database missing: import the airports first.',
    addonsErr: 'The scan failed.',

    // Map layers and basemap picker
    layersTitle: 'Layers',
    layerAirports: 'Airports',
    layerHeliports: 'Heliports',
    layerSeaplanes: 'Seaplane bases',
    layerNavaids: 'Navaids',
    layerZoomNote: 'These layers appear from zoom 8 onwards.',
    basemapTitle: 'Base map',
    followTitle: 'Keep the DR position centred',

    // CARTO API key (Dark Matter and Positron basemaps)
    cartoKeyBtn: 'CARTO API key…',
    cartoNoteSet: 'CARTO key saved: Dark Matter and Positron come through unwatermarked.',
    cartoNoteMissing: 'Without a CARTO key, Dark Matter and Positron are watermarked.',
    cartoTitle: 'CARTO API key',
    cartoText: 'Dark Matter and Positron come from CARTO, which now requires a key to serve its tiles without a watermark. The key is free but personal: everyone enters their own. It stays on this computer and is only ever sent to CARTO, along with the tile requests.',
    cartoLink: 'Request yours at <a href="https://carto.com/basemaps/apikey/" target="_blank" rel="noopener">carto.com/basemaps/apikey</a> — it arrives by email, with no approval queue and no account to create.',
    cartoLabel: 'Your key',
    cartoPlaceholder: 'Paste the key you received',
    cartoEmpty: 'Enter the key you received from CARTO.',
    cartoInvalid: 'This key contains a space or an unexpected character — check the copy-paste.',
    cartoSave: 'Save',
    cartoForget: 'Forget the key',

    // Landing-spot popup ("Landing spots" layer)
    // Flight plan panel (legs table)

    legsToggle: 'Show flight plan',
    copyWpTitle: 'Copy the waypoints',
    legsClose: 'Hide flight plan',
    legsTitle: 'Flight plan',
    legsTotal: 'Total distance',
    legsColNum: 'No.',
    legsColFrom: 'From',
    legsColTo: 'To',
    legsColAlt: 'Alt (ft)',
    legsColDist: 'Dist (nm)',
    legsColRoute: 'Track (°)',
    legsColHdg: 'Hdg (°)',
    legsColGs: 'GS (kt)',
    legsColTime: 'Time',
    legsTotalTime: 'Total time',
    legsEmpty: 'No flight plan.',
    legsRouteHint: 'True track of the leg (the map is true-north)',
    legsCapHint: 'Magnetic heading to fly = true track {r} + drift {v}° − declination {d}°',
    legsTimeNoVp: 'Enter the true airspeed to get the ground speed and the time.',
    legsTimeImpossible: 'Track unattainable: the wind is too strong for this airspeed.',

    // Flight plan navigation parameters (flight plan panel bar)
    navVp: 'TAS',
    navVent: 'Forecast wind',
    navVpTitle: 'True airspeed, in knots',
    navVentDirTitle: 'Direction the FORECAST wind is coming FROM, in TRUE degrees (as MSFS and written METARs give it). This is the wind YOU believe in: the simulator does not fill it, and applies another one. The gap between the two is what the line of position will reveal.',
    navVentKtTitle: 'FORECAST wind speed, in knots. The simulator does not fill it: it is your estimate, and the dead reckoning will drift by its error.',

    // Flight plan reversal
    reversePlan: 'Reverse the flight plan',

    // Magnetic compass around the aircraft
    compassToggle: 'Show magnetic compass around the aircraft',

    // Vertical profile (GLOBE terrain along the flight plan)
    vertProfileToggle: 'Show vertical profile',
    vertProfileClose: 'Hide vertical profile',
    vertProfileTitle: 'Vertical profile',
    vertProfileEmpty: 'Create a flight plan (departure + arrival) to display the vertical profile.',
    vertProfileNoData: 'Terrain unavailable. Import the elevation data first (Import menu → Elevation data).',
    vertProfileError: 'Profile unavailable: {err}',
    vertProfileTerrain: 'Terrain',
    vertProfilePlanned: 'Planned alt.',
    vertProfileGround: 'Ground',
    vertProfilePlannedFull: 'Planned altitude',
    vertProfileSafe: 'Safe alt.',
    vertProfileSafeFull: 'Safe altitude',
    vertProfileSummit: 'Route summit',
    vertProfileMinMargin: 'Min. clearance',

    // Star catalogue
    astresToggle: 'Star catalogue',
    astresTitle: 'Star catalogue',
    astresRefresh: 'Recompute',
    astresSrcSim: 'Live',
    astresSrcSimTitle: 'Time and position taken from the simulator — click to enter them by hand',
    astresSrcFree: 'Manual',
    astresSrcFreeTitle: 'Time and position entered by hand — click to follow the simulator again',
    astresUtc: 'UTC',
    astresUtcTitle: 'Time of the computation, in universal time',
    astresLat: 'Lat',
    astresLon: 'Lon',
    astresCap: 'Hdg',
    astresCapTitle: 'TRUE heading of the aircraft: this is what turns azimuth into relative bearing',
    astresHauteur: 'Altitude',
    astresHminTitle: 'Below this altitude refraction becomes uncertain and its correction doubtful',
    astresHmaxTitle: 'Above it, azimuth changes too fast for a line of position to mean anything',
    astresMagLimite: 'Mag ≤',
    astresMagTitle: 'Magnitude limit for the stars listed (the higher the number, the wider the catalogue)',

    astresCielLigne: 'Sun {soleil} · {phase} · {etoiles}',
    astresCielJour: 'broad daylight',
    astresCielCivil: 'civil twilight',
    astresCielNautique: 'nautical twilight',
    astresCielAstro: 'astronomical twilight',
    astresCielNuit: 'full night',
    astresEtoilesOui: 'stars usable',
    astresEtoilesNon: 'stars not out yet',

    astresBestTrio: 'Best three:',
    astresBestPaire: 'Best pair:',
    astresBestAucun: 'Not enough bodies in range to get a fix.',
    astresChoisir: 'Take these',
    astresCoupe: 'cut',
    astresErreurPoint: 'fix error',
    astresIdeal: '(best possible)',
    astresSelN: '{n} bodies:',
    astresSelUn: '{astre} alone: one line of position, not a fix.',
    astresParalleles: 'These bodies give parallel lines of position: there is no fix.',
    astresVerdictExcellent: 'excellent',
    astresVerdictBon: 'good',
    astresVerdictMediocre: 'poor',
    astresVerdictMauvais: 'avoid',

    // Body names. Stars are absent on purpose: Vega, Altair and Betelgeuse are
    // proper names, the same in every almanac ever printed.
    astresBodySun: 'Sun',
    astresBodyMoon: 'Moon',
    astresBodyVenus: 'Venus',
    astresBodyMars: 'Mars',
    astresBodyJupiter: 'Jupiter',
    astresBodySaturn: 'Saturn',

    astresCount: 'Bodies',
    astresEcartes: '{n} body(ies) above the horizon outside the {min}–{max} range: {liste}. Widen the bounds to see them.',

    // Dead reckoning, reduction and fix
    estimeAbsente: "Dead reckoning not set \u2014 it sets itself on the ground, then runs on heading, airspeed and the FORECAST wind.",
    estimeAuSol: "on the ground",
    estimeDerive: "drift",
    estimeAge: "held for {age}",
    estimeOrigineEstime: "dead reckoning",
    estimeOriginePoint: "from the last fix",

    viseesIe: "Index error",
    viseesIeTitle: "The index correction YOU apply, in arcminutes. You do not know your instrument's own: calibration reveals it, and it must be done on SLOW bodies \u2014 otherwise you measure knob lag instead of the sextant.",
    viseesPointBtn: "Work the fix",
    viseesPointTitle: "Reduce the sights against the dead reckoning and cross the lines",
    viseesPointTitre: "Observed fix",
    viseesEcartEstime: "shift from DR",
    viseesChapeau: "cocked hat",
    viseesChapeauMent: "The cocked hat measures how well the lines AGREE, not how right the fix is: an error common to every sight tightens it while displacing the fix.",
    viseesUneDroite: "One sight only: that makes a line of position, not a fix. Two are needed, three are better.",
    viseesRecaler: "Reset DR here",
    viseesDebrief: "Debrief",
    viseesDebriefLigne: "Truth: the fix was {point} NM off, the dead reckoning {estime} NM \u2014 gain {gain} NM.",
    viseesDebriefImpossible: "No truth recorded for these sights: nothing to debrief.",
    viseesVentCalcule: "Computed wind",
    viseesVentCru: "you assumed",
    viseesVentAdopter: "Adopt this wind",
    viseesVentCalme: "Computed wind: calm — the gap between the air position and the fix is too small to give it a direction.",
    viseesVentTropCourt: "Wind not computed: less than five minutes since the last reset. Over so short a run, one arcminute of error in the fix invents several knots of wind.",
    viseesVentImpossible: "Wind not computed: it takes an air plot, so a flight begun from a known position.",
    viseesVers: "toward",
    viseesLoin: "away",
    viseesColHo: "Ho",
    viseesColZn: "Zn",
    viseesColIntercept: "Intercept",
    viseesHintHo: "Observed altitude: Hs corrected for the index error you declare, for refraction and for parallax.",
    viseesHintZnRed: "True azimuth of the body, computed from the dead reckoning. The line of position is perpendicular to it.",
    viseesHintIntercept: "How far to shift the line, and which way: TOWARD the body if you measured higher than computed, AWAY otherwise.",
    viseesErrEstime: "No dead reckoning: it sets itself on the ground as soon as the simulator is connected, or on an observed fix.",
    viseesErrVide: "No sight to reduce.",
    viseesErrNoyau: "The ephemeris core could not be loaded.",
    viseesErrCalcul: "The reduction failed.",

    // Calibration — finding out what YOUR instrument is worth
    etalTitre: "Calibration",
    etalToggle: "Calibrate the sextant: a run of sights from a known position",
    etalRegle: "Shoot SLOW bodies, near the meridian. On a fast body, a drum lagging half a minute reads several arcminutes too high: you then measure your hand instead of your sextant.",
    etalSol: "From the airfield",
    etalSolTitle: "Take the aircraft's position while on the ground. It is the only time you truly know where you are: the channel closes at takeoff.",
    etalLat: "Lat",
    etalLon: "Lon",
    etalManuel: "Open here",
    etalMesurer: "Measure",
    etalArreter: "Abandon",
    etalVide: "No sight since the run was opened. Shoot: they will arrive here.",
    etalCompte: "{n} sight(s), {lentes} slow",
    etalColEcart: "Ho−Hc",
    etalHintEcart: "The sextant's error on this sight: observed altitude minus the altitude computed from the known position. The correction is its opposite.",
    etalHintVitesse: "The body's vertical rate. Past the threshold the sight no longer counts towards the mean — but it still serves to measure the knob lag.",
    etalRapide: "Over {seuil}′/min: too fast for the mean. It serves the lag computation.",
    etalRefuser: "Drop this sight from the run",
    etalRemettre: "Put this sight back into the run",
    etalCorrection: "Correction",
    etalDispersion: "spread",
    etalAdopter: "Adopt",
    etalOublier: "Forget",
    etalManqueLentes: "{n} more sight(s) on slow bodies — under {seuil}′/min — are needed to conclude.",
    etalManquePente: "And the run is too uniform to measure the knob lag: that would take a fast body.",
    etalMethodeLents: "{n} slow bodies",
    etalMethodeRetard: "run straightened",
    etalMethodeBrut: "raw mean",
    etalMethodeCourtLents: "slow bodies",
    etalMethodeCourtRetard: "run straightened",
    etalMethodeCourtBrut: "raw mean",
    etalRetardLigne: "Measured knob lag: {retard} ± {se} s. That is your hand, not the instrument — and it can be fixed on the very next sight.",
    etalBiaisResiduel: "At most {biais}′ of lag remains in the sights kept: shoot closer to the meridian to reduce it.",
    etalVitesseRetenue: "Bodies kept: up to {v}′/min. The run is too uniform to measure your knob lag, but every second of lag leaves {x}′ in it.",
    etalAvertBrut: "This run holds too few slow bodies and is too uniform to separate the two effects: the correction offered contains your knob lag.",
    etalAvertRetard: "For want of slow bodies, the correction comes from the run's slope rather than its mean. Sound, but less certain: shoot near the meridian next time.",
    etalAdopteeLigne: "Standard in service: {corr}, {methode}, {n} sights, on {date}.",
    etalAucunEtalon: "No calibration: your reductions carry no correction, and the fix carries the instrument's error.",
    etalEnVol: "Airborne, calibration is meaningless: you would measure the drift of your dead reckoning instead of the instrument.",
    etalPasAuSol: "The aircraft is not on the ground, or the dead reckoning is not set: the airfield position is not on offer.",
    etalPositionInvalide: "Unreadable position.",

    // The plotting sheet
    planchetteTitre: "Plotting sheet",
    planchetteToggle: "Plot the lines of position on the plotting sheet",
    planchetteEstime: "DR",
    planchettePoint: "fix",
    planchetteResume: "The fix lies {nm} NM from the DR, bearing {rel}°",
    planchetteVide: "Nothing to plot: it takes a set dead reckoning and at least two sights in the book.",
    planchetteUneDroite: "One sight only: that makes a line of position, not a fix. Two are needed, three are better.",

    astresColAstre: 'Body',
    astresColHc: 'Hc',
    astresColZn: 'Zn',
    astresColGis: 'RB',
    astresColVitesse: "′/min",
    astresHintVitesse: "The body’s vertical rate, in arcminutes per minute of time. This is what you will have to follow on the knob during the integration: the integrator averages the DRUM, not the truth. Nil on the meridian, greatest due east and due west.",
    astresColMag: 'Mag',
    astresColCoupe: 'Cut',
    astresColCoupeSel: 'Cut / sel.',
    astresHintHc: 'Computed altitude — this is what you set on the sextant DRUM',
    astresHintZn: 'True azimuth, measured from north. It serves plotting and the cut angle, NOT finding the body: the sextant collar is bolted to the airframe and knows nothing of north.',
    astresHintGis: 'Relative bearing: azimuth measured from the aircraft nose. This is what you set on the sextant COLLAR — the only figure that helps you find the body.',
    astresHintMag: 'Visual magnitude: the lower the number, the brighter and easier to find',
    astresHintCoupe: 'Best crossing angle available with another body of the catalogue',
    astresHintCoupeSel: 'Crossing angle against the selection — the worst pair is the one shown',
    astresCoupeAvec: 'Cuts best with {astre}',
    astresCoupeAvecSel: 'Cuts worst with {astre}',
    astresLunePct: 'Moon {p} % lit',
    astresVide: 'No body within the sighting range.',
    astresErrSaisie: 'Time or position unreadable: expected YYYY-MM-DD HH:MM:SS and decimal degrees.',
    astresErrNoyau: 'The ephemeris core could not be loaded.',
    astresErrPosition: 'Position missing or out of range.',
    astresErrHeure: 'Invalid time.',
    astresErrCalcul: 'The ephemeris computation failed.',
    astresConsigneEnvoyer: 'Send this body to the sextant',
    astresConsigneAnnuler: 'Cancel the order — the sextant field will go empty',

    // Bridge to the sextant panel
    pontConnecte: 'Sextant connected.',
    pontAttente: 'The sextant has not reported in yet. The order will wait for it.',
    pontFerme: 'No link: {err}. No order can be sent, no sight received.',
    pontConsigneEnCours: 'order: {astre}',

    // Received sights
    viseesToggle: 'Sights received from the sextant',
    viseesTitle: 'Sights received',
    viseesCount: 'Sights',
    viseesViderTitle: 'Clear the book — the sights will be lost',
    viseesSupprimer: 'Delete this sight',
    viseesNote: 'Altitudes exactly as the drum gave them: no index error, no refraction, no parallax. Reduction comes with the sight book.',
    viseesNonEcrite: 'Sight received but NOT written to disk: it will not survive closing.',
    viseesColDate: 'Date',
    viseesColHeure: 'Mid-time',
    viseesColAstre: 'Body',
    viseesColHs: 'Hs',
    viseesColDuree: 'Length',
    viseesColAlt: 'Alt',
    viseesHintHeure: 'Mid-time of the integration — that is the instant of the sight, neither its start nor its end',
    viseesHintHs: 'Altitude read on the drum, uncorrected. Not an observed altitude yet.',
    viseesHintDuree: 'Integration length: it is what tells you how much the bubble average is worth',
    viseesHintAlt: 'Altitude at the time of the sight — it drives refraction',
    viseesVide: 'No sight received. They will come from the sextant across the bridge.',

    // Update banner (electron-updater)
    updateDownloading: 'Downloading update… {percent}%',
    updateReady: 'Update {version} ready to install.',
    updateRestart: 'Restart and install',

    // "About" modal (header "?" button)
    btnAboutTooltip: 'About',
    aboutTitle: 'About',
    aboutTagline: 'The celestial navigator\'s table, for the bubble sextant of Microsoft Flight Simulator 2024.',
    aboutIntro: 'The sextant lives in the simulator, the table lives here, and the two tell each other only what they must: the table names the body to shoot, the sextant sends back its altitudes. The table never knows where you are — that is the whole point of the game. The catalogue shows which bodies the sky offers at this instant, with their relative bearing and altitude; the sight book takes the sights in, reduces them against your dead reckoning, carries the lines forward to a common instant and works out the fix, its cocked hat and the wind that follows from it; the plotting sheet draws them as on a real position sheet. And calibration lets you discover, on the ground, the index error of your own instrument.',
    aboutIntroVfr: 'Around that, what it takes to lay the flight out on the chart: airports and navaids that come from the simulator itself — yours, add-on airfields included — the flight plan and its navigation log, the terrain profile with a minimum altitude per leg, worldwide search, the magnetic compass rose and the timers.',
    aboutLicense: 'This software is distributed under the GPL-3.0 license or later.',
    aboutSource: 'The source code of this application is available on <a href="https://github.com/brackets-acrobat/sextant-navigator" target="_blank" rel="noopener">GitHub</a>.',
    aboutCopyright: 'Copyright 2026 Cyril MILANI.',
    aboutCreditsMethod: 'The navaid extraction from MSFS 2024 (<code>extract-navaids-msfs.js</code>) draws directly on the method of Alexander Barthel\'s atools / Little Navmap project.',
  },
};

// Langue active (depuis localStorage si dispo, sinon FR).
let currentLang = (typeof localStorage !== 'undefined' && localStorage.getItem('cap-lang')) || 'fr';

// Traduction d'une clé pour la langue active (repli FR, puis clé brute).
function t(key) {
  return TRANSLATIONS[currentLang][key] ?? TRANSLATIONS.fr[key] ?? key;
}

// Change la langue, persiste, et ré-applique tout le DOM statique.
function setLanguage(lang) {
  if (!TRANSLATIONS[lang]) return;
  currentLang = lang;
  if (typeof localStorage !== 'undefined') localStorage.setItem('cap-lang', lang);
  applyTranslations();
  updateToggleButton();
}

// Applique les traductions aux éléments porteurs d'un attribut data-i18n*.
function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.getAttribute('data-i18n-html'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.getAttribute('data-i18n-title'));
  });
}

// Met à jour l'état visuel du toggle FR | EN.
function updateToggleButton() {
  const btn = document.getElementById('btn-lang-toggle');
  if (!btn) return;
  btn.setAttribute('data-active-lang', currentLang);
  const fr = btn.querySelector('.lang-fr');
  const en = btn.querySelector('.lang-en');
  if (fr) fr.classList.toggle('lang-active', currentLang === 'fr');
  if (en) en.classList.toggle('lang-active', currentLang === 'en');
}

// Initialise au chargement : applique la langue courante.
function initI18n() {
  applyTranslations();
  updateToggleButton();
}
