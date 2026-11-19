# Journal des versions

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
