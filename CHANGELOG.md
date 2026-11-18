# Journal des versions

## 15.25.0 — en test sur `dev`

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
