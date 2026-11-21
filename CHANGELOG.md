# Journal des versions

## 15.26.4 — 21 novembre 2026

Corrections issues de l'audit selon Modern Web Guidance ([`AUDIT-MWG.md`](AUDIT-MWG.md), suivi
au §0). Aucune nouvelle fonction ; le résumé d'absence se revoit depuis le panneau.

### Accessibilité
- Carte « Pendant ton absence » :
  - fermée au clavier, elle rend le focus là où il était, le plus souvent la saisie du chat (G6) ;
  - elle ne se ferme plus seule tant que le focus est dedans (G7) ;
  - son résumé est annoncé par `ariaNotify()`, ou par une région live présente dès le
    chargement, sans le nom de ses boutons (G15) ;
  - elle a de vrais titres, `h2` et `h3` (G20) ;
  - « Revoir le dernier résumé », dans la section « Pendant ton absence » du panneau, la
    réaffiche (G16).
- Panneau :
  - un `<dialog>` non modal titré par un `h2`, au lieu d'une région (G14 ; revient sur le point
    A1 de l'audit de la v15.26) ;
  - flèches, Début et Fin entre les onglets, sans réagir à Alt (G12) ;
  - les aides sont reliées à leur champ (G11) ;
  - après « Activer le pouls du chat », le focus passe au compteur (G8).
- Bouton du panneau : état ouvert ou fermé (`aria-expanded`), raccourci (`aria-keyshortcuts`),
  nom fixe, rafale en description (G10).
- L'interface, le bouton et les notices traduites sont marqués `lang="fr"` : ils sont lus en
  français même sur un Twitch en anglais (G9).
- La copie des moments forts est annoncée ; un second clic relance l'attente (G21).
- En rafale, le message joint d'une notice réapparaît aussi au focus clavier (G22). Le fil de
  conversation suit aussi le focus clavier (G23).
- Les listes sans puces gardent leur rôle de liste dans Safari (`role="list"`, G19).

### Thème et contrastes
- Le panneau et la carte suivent le thème de Twitch pour les contrôles natifs : flèches des
  champs, listes ouvertes, barres de défilement (`color-scheme`, G1).
- Texte cité et notices discrètes : gris tiré des couleurs du thème, 6:1 de contraste en thème
  clair (3,2:1 avant), rendu inchangé en sombre (G2).
- Alerte du panneau plus sombre en thème clair : 5,1:1 (G3).
- Contrastes forcés (Windows) : seul l'onglet actif est souligné, et le point de rafale reste
  visible (G4, G5).

### Mouvement
- Si le système demande de réduire les animations, le chat ne glisse plus vers le bas : il y
  saute, comme sur Twitch (G13). Le repère de « Aller au message » n'est animé que sans cette
  demande (G28).

### Nettoyage
- `toSorted()` et `toReversed()` (G18), `aria-controls` des onglets retiré (G25), `100dvh`
  (G24), zone de copie redimensionnable en hauteur seulement (G27), transition de carte sans
  effet retirée (G28).

### Outillage
- Banc : 20 cas ajoutés (MW1 à MW23, MWM, MWC), 114 au total. 26A1 vérifie désormais un
  dialogue non modal ; 6 cas lisent l'état ouvert d'un `<dialog>` ; 26M ne cherche plus
  `ui = { hote`, l'hôte servant désormais au thème.
- `npm run audit:mwg` ne reproduit plus que G17 (tailles en px, à vérifier sur Twitch).

## 15.26.3 — 21 novembre 2026

Corrections issues de l'audit de la v15.26.2 ([`AUDIT-15.26.2.md`](AUDIT-15.26.2.md), suivi
au §0). Aucune nouvelle fonction.

### Corrigé
- Alt+Maj+B ouvre de nouveau le panneau depuis la zone de saisie du chat (Windows, Linux).
  Seul le caractère qu'Option+Maj+B tape sous macOS est laissé au champ. (B1)
- Échap, ou la fermeture du panneau, rend le focus là où il était, par exemple à la saisie du
  chat. (B2)
- Pouls : une session par chaîne, gardée le temps de la page pour les 5 dernières. Un
  aller-retour sur une autre chaîne (clic, raid) ne perd plus les moments forts. (B3)
- « Pendant ton absence » : si la chaîne change pendant l'absence, le résumé ne porte que sur la
  nouvelle et le dit. (B4)
- Pouls : le compteur n'est plus réécrit chaque seconde ni annoncé en boucle par les lecteurs
  d'écran ; la liste et le graphe ne sont refaits que s'ils changent. (B5, P1, A1)
- Plus rien n'est posé en haut du chat, où Twitch affiche ses bandeaux : la rafale se signale
  par un point rouge sur le bouton du panneau, débit en infobulle. La carte d'absence s'affiche
  en bas du chat. (B6)
- Le clic sur le bouton du panneau ne remonte plus aux conteneurs de Twitch. (B7)
- « 1 message sur la dernière minute », au singulier. (B8)

### Robustesse
- Le bouton ne copie plus les états de l'engrenage (`disabled`, `tabindex`). (R1)
- Sa reconstruction est notée dans le journal de débogage. (R2)
- Le code qui efface l'ancien historique porte son échéance : à retirer en v15.28. (R3)

### Nettoyage
- Code mort retiré : règle `input[type="search"]`, option `marquer`, global `IDBKeyRange`,
  styles de l'ancienne pastille. (M1-M4)

### Outillage
- Banc : la page imitée a un éditeur `contenteditable` comme la vraie saisie de Twitch (T2).
  26R4 vérifie le cas macOS et ne fige plus le comportement fautif (T1). 12 cas ajoutés ou revus
  (62B1 à 62B8, 62R1, 62M, F3a, 26R4), 94 au total (T3).

## 15.26.2 — 19 novembre 2026

### Retiré
- **Historique long et recherche.** La fonction, son onglet du panneau, la carte au survol
  des pseudos et `__BTC.historique` sont retirés. La base que les v15.26.0 et v15.26.1 avaient
  pu créer dans le navigateur (IndexedDB `btc-historique`) est effacée au premier lancement.
- **Pouls dans le chat.** La pastille n'affiche plus la cadence ni l'emote du moment : le pouls
  se lit dans le panneau. Elle ne sert plus qu'à signaler une rafale en cours. Le réglage
  « Afficher le pouls dans le chat » disparaît.

### Corrigé
- Le bouton du panneau, à côté de l'engrenage des réglages du chat, était plus haut que lui
  d'environ 6 px : aligné sur la ligne de base du texte, et non centré comme les boutons de
  Twitch. C'est maintenant une copie de l'engrenage (mêmes classes, donc même taille,
  alignement, survol et thème) dont seule l'icône change. La copie ne porte pas
  `data-a-target` : rien ne peut la prendre pour l'engrenage.

### Outillage
- Banc : cas de l'historique retirés (F13a-F13e, 26B2, 26P2, 26S3), deux cas ajoutés (N1 :
  ancienne base effacée ; N2 : bouton aligné en ligne comme en flex), 84 au total. La page
  imitée reprend la structure réelle de l'engrenage de Twitch.

## 15.26.1 — 19 novembre 2026

Corrections issues de l'audit de la v15.26.0 ([`AUDIT-15.26.md`](AUDIT-15.26.md), suivi au §0).
Aucune nouvelle fonction.

### Corrigé
- « Aller au message » met de nouveau le message en évidence : le contour était déclaré
  `!important` et l'animation n'avait aucun effet. (B1)
- Historique : « Plus anciens » ne saute plus les messages arrivés dans la même milliseconde que
  le dernier résultat affiché. (B2)
- Pouls : les moments forts restent dans la liste toute la session, et plus seulement deux
  heures. (B3)
- Pouls et cadence repartent de zéro au changement de chaîne, même quand Twitch garde le même
  conteneur du chat. (B4)
- Réglages : compactage, traduction, préfixe « Répond à », emotes et couleur de la citation,
  étiquette 7TV et regroupement des gifts s'appliquent aux messages déjà affichés, dans les deux
  sens. (B5)
- Deux onglets ouverts ne s'écrasent plus leurs réglages : chacun reprend ceux de l'autre. (B6)
- Mentions : « @pseudo », « @nom affiché » ou réponse à l'un de tes messages, plus le pseudo
  nu. Un pseudo qui est un mot courant ne transforme plus chaque message en mention. (B7)
- Pouls : le message représentatif garde ses accents et sa casse. (B8)
- Pouls : un petit chat dont les messages arrivent par paquets ne fait plus de faux moments
  forts. (B9)

### Robustesse
- Emotes comptées même quand 7TV ne les a pas encore dessinées. (R1)
- Historique : connexion IndexedDB rouverte si le navigateur la ferme, erreurs de purge gérées,
  avertissements limités à un par minute. (R2)
- La pastille et la carte d'absence suivent la colonne du chat quand elle change de taille. (R3)
- Alt+Maj+B laissé aux champs de saisie ; Échap ne remonte plus à Twitch quand il ferme le
  panneau. (R4)
- Pastille plus discrète au repos ; carte d'absence fermée seule au bout d'une minute. (R5)

### Performance
- Survoler une réponse coûte 6 à 10 ms au lieu de 117 à 134 ms sur une page de chaîne :
  l'estompage du fil n'utilise plus `:has()`. (P1)
- Recherche dans l'historique : 2 à 3 ms par frappe au lieu de 350 ms sur 20 000 messages,
  grâce à un index léger en mémoire. (P2)
- Pastille redessinée seulement quand les mesures changent. (P3)
- CSS du fil émis seulement si la fonction est active. (P5)

### Vie privée et sécurité
- Pseudo lu dans le cookie `login` d'abord ; le profil Twitch, qui contient le jeton de session,
  n'est plus qu'un repli. (S1)
- La durée de conservation de l'historique s'applique aussi historique coupé. (S3)

### Nettoyage
- Code mort retiré (M1-M5), confirmation en deux temps factorisée (Q1), caractères invisibles
  écrits en clair (Q2), commentaire déplacé (Q4), libellés du panneau précisés (Q5).
- Panneau déclaré comme région, et non comme dialogue. (A1)

### Outillage
- Banc : 19 cas de plus, préfixés `26` (90 au total). L'option `horloge` simule des heures de
  chat en quelques secondes, et plusieurs onglets peuvent s'ouvrir sur le même stockage. La page
  imitée porte les variables de thème de Twitch. F7c vérifie que le repère se voit.
- `npm run audit:reproduction` ne reproduit plus aucun des 11 défauts de l'audit.

## 15.26.0 — 19 novembre 2026

Six fonctions nouvelles, toutes réglables dans le panneau. L'historique et le pouls sont
coupés par défaut ; les autres sont actives.

### Ajouté
- **Panneau de réglages** dans le chat : bouton à côté de l'engrenage, raccourci Alt+Maj+B,
  onglets Réglages, Historique et Pouls du chat. Chaque réglage s'applique à chaud et
  reste enregistré dans le navigateur (seuls les écarts aux valeurs par défaut). Valeurs
  numériques bornées et arrondies au pas ; « Rétablir » en deux temps. Interface dans un
  shadow DOM, aux couleurs du thème de Twitch, navigable au clavier.
- **Densité adaptative en rafale** : au-delà de 8 messages par seconde, badges secondaires
  masqués, notices et citations sur une ligne, interligne réduit, pastille « Rafale ».
  Deux seuils, une fenêtre double à la sortie et une durée minimale évitent le clignotement.
- **Fil de conversation au survol** d'une réponse : message d'origine et réponses sœurs
  encadrés, reste du chat estompé.
- **« Pendant ton absence »** : résumé au retour sur l'onglet (messages et pic de cadence,
  abonnements, gifts, raids, mentions avec « Aller au message », emotes phares, personnes
  les plus actives).
- **Historique long et recherche** (IndexedDB, local uniquement) : 7 jours et 20 000 messages
  par chaîne au plus, purge automatique ; recherche par texte sans accents, pseudo, période
  et type, avec pagination ; derniers messages d'une personne au survol de son pseudo ;
  effacement d'une chaîne ou de tout l'historique.
- **Pouls du chat et moments forts** : cadence par tranche de 10 s, pics détectés par rapport
  à la médiane du chat, horodatés à l'heure du live, avec emote dominante et message
  représentatif ; liste copiable ; pastille de cadence en haut du chat.
- Console : `__BTC.reglages`, `__BTC.historique`, `__BTC.pouls`, `__BTC.rafale()` ;
  `__BTC.check()` donne aussi le débit et l'état de la rafale.

### Interne
- Les fonctions s'inscrivent à des crochets (arrivée, entrée lue, connexion, déconnexion,
  tic, réglages) ; une fonction qui échoue n'arrête ni les autres ni le cœur du script.
- Une arrivée n'est comptée qu'une fois, et pas pendant les 2 s qui suivent la connexion au
  chat, quand Twitch rejoue les derniers messages. Lecture complète d'une entrée seulement
  si une fonction active en a besoin.

### Outillage
- Banc : 24 cas de plus (F1, F3, F5, F7, F13, F14), soit 71 ; la page de test simule
  l'onglet masqué, le survol, les badges et la durée du live. Le cas BUILD compare aussi la
  feuille de style de l'interface. `npm run build` retire les commentaires de cette feuille.

## 15.25.0 — 18 novembre 2026

Corrections issues de l'audit (`AUDIT.md`). Aucune nouvelle fonctionnalité.

### Corrigé
- Plus de plantage au démarrage quand une citation n'a pas d'attribut `title`. Un bloc
  sans `title` n'est plus pris pour une citation, sauf si Twitch ou 7TV annoncent une
  réponse. (B1)
- La découverte de la couleur de chaîne ne vide plus d'un coup le tampon d'affichage
  progressif. (B2)
- Deux gifts multiples successifs du même donateur gardent chacun leurs destinataires. (B3)
- Onglet en arrière-plan : plus de rétention de lignes sans limite, et tout est traité au
  retour. (B4, R9)
- Le message écrit par l'abonné n'est plus traduit ni analysé comme du texte de Twitch. (B5)
- Le masquage d'un gift individuel ne peut plus atteindre le conteneur du chat. (B6)
- Le message joint reste un bloc à part dans la notice. (B7)
- `messageBatchMs` au-delà d'une image ne ralentit plus le rattrapage. (B8)
- La vitesse du défilement fluide repart de zéro après une pause. (B9)

### Robustesse
- Reconnexion automatique quand Twitch remplace le conteneur du chat (colonne repliée,
  mode cinéma…). Une navigation dans la même chaîne ne remet plus tout à zéro. (R1, R2)
- L'étiquette 7TV « Custom Highlights » est retirée même posée seule. (R3)
- Les couleurs suivent le thème : thème clair lisible. (R4)
- Lecture des couleurs `color-mix()`, `oklch()` ; une couleur transparente est reconnue
  comme telle, quelle que soit sa syntaxe. (R6)
- Couleur des pseudos : pseudos internationaux, changement de couleur en cours de session,
  couleur du message joint réservée à son auteur. (R7)
- Le scroller est réévalué tant que le chat ne défile pas encore. (R8)
- Une seule instance par page. (R10)

### Performance
- Une seule lecture du style calculé par réponse, au lieu de deux. (P1)
- Liste des destinataires construite en O(n) au lieu de O(n²). (P2)
- Nos propres éléments ne repassent plus dans le pipeline ; une seule requête DOM par
  sous-arbre ; lots dédoublonnés. (P3)
- Index des emotes et des pseudos en LRU. (P5)

### Nettoyage
- Code mort retiré (M1-M10), commentaires remis à leur place (Q1), ESLint sans
  avertissement (Q2, Q3), CSS dédoublonné (Q4), version lue via `GM_info` (Q5).
- Outils console : diagnostic qui détecte un conteneur détaché, compteurs exacts,
  `whyFontSize()` qui lit les règles `@media`, `reload()` qui retraite les notices. (D1-D4)

### Distribution
- Fichier renommé `BetterTwitchChat.user.js` (installation en un clic).
- `@updateURL` / `@downloadURL` pointent sur `prod` de ce dépôt ; `@name` et `@namespace`
  sont inchangés pour que l'installation existante soit mise à jour, pas doublée. (S2)

### Outillage
- Banc de test `tests/`, hook `pre-commit` qui le lance avant chaque commit du script,
  vérification GitHub Actions sur `dev` et `prod`.
- Version optimisée pour `prod` (`npm run build`) : commentaires et espaces retirés, en-tête
  et noms conservés ; testée par le même banc, feuille de style comparée à la source.

## 15.24.0

Version d'origine, importée telle quelle depuis `BetterTwitchChat-with-7tv`.
