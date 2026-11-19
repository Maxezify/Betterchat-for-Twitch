# Audit de BetterTwitchChat v15.26.0

| | |
|---|---|
| Fichier audité | [`BetterTwitchChat.user.js`](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js) au commit `7850530` (branche `dev`) |
| Taille | 4 227 lignes, 219 170 octets, fins de ligne CRLF (deux fois la v15.25.0) |
| Empreinte | sha256 `66b48515be8ab025f7c8795594884880c4a4847169d5a7a3bf81192e4de7f195` |
| Date | 19 novembre 2026 |
| Périmètre | Tout le fichier. L'accent est mis sur ce que la v15.26 ajoute : les crochets dans le cœur (L288-L306, L2399-L2433, L2535-L2580) et le module des fonctions (L2638-L4097). Les points restés ouverts après l'audit de la v15.24.0 ([`AUDIT.md`](AUDIT.md)) sont réévalués au §11. |
| Reproduction | [`tests/reproduction-15.26.js`](tests/reproduction-15.26.js) : `node tests/reproduction-15.26.js` |

Les numéros de ligne (`L1008`) renvoient à cette version et chaque lien ouvre la ligne sur GitHub.
Les identifiants (B1, P1…) sont propres à cet audit : ils ne désignent pas les points de
l'audit précédent.

---

## 0. Suivi des corrections — v15.26.1 et v15.26.2 (branche `dev`)

| Statut | Points |
|---|---|
| Corrigé | 28 — B1, B3-B9, R1, R3-R5, P1, P3, P5, M1-M3, M5, Q1, Q2, Q4-Q6, S1, T1-T3 |
| Sans objet | 6 — B2, P2, R2, S2, S3, M4 : ils portaient sur l'historique long, retiré en v15.26.2 après avoir été corrigés en v15.26.1 |
| Partiel | 3 — P4 (mentions compilées une fois, sans cache de lecture : gain nul), A1 (panneau en `region` ; fil toujours à la souris), T4 (horloge simulée dans le banc ; F3b encore en temps réel) |
| Conservé | 4 — R7 (stabilisation nécessaire aux reconnexions), R8 (bouton surveillé), M6 (outils de test documentés), S4 (`@noframes`, à trancher) |
| Reporté | 1 — Q3 (assemblage depuis plusieurs fichiers : restructuration à mener seule) |
| À vérifier | 1 — R6 (sur le DOM réel de Twitch) |
| Positif | 1 — S5 |

Le détail point par point est dans [`tests/suivi-15.26.json`](tests/suivi-15.26.json).
`npm run audit:reproduction` ne reproduit plus aucun des 11 défauts sur la v15.26.1, et les
reproduit tous sur la v15.26.0. La v15.26.1 a ajouté 19 cas au banc (préfixe `26`) ; sur la
v15.26.0, 18 d'entre eux échouent. Le dernier, 26T3, couvre un manque du banc (T3), pas un
défaut du script.

**v15.26.2.** L'historique long est retiré du projet, ainsi que le pouls de la pastille du chat.
Les cas 26B2, 26P2 et 26S3 quittent le banc avec la fonction, et B2 et P2 sont « sans objet »
dans la reproduction. Deux cas les remplacent : N1 vérifie que l'ancienne base est effacée au
démarrage, N2 que le bouton du panneau est aligné sur l'engrenage de Twitch. Celui-ci était
plus haut de 6,6 px, un défaut que l'audit n'avait pas relevé.

**Deux rectificatifs de diagnostic**, établis en corrigeant :

- **P2.** Le coût de la recherche ne venait pas de la normalisation des textes. Un parcours
  IndexedDB nu des 20 000 messages coûte déjà 277 ms, contre 1 ms pour filtrer les mêmes données
  en mémoire. Normaliser à l'écriture n'a rien gagné (350 ms avant, 385 ms après). La correction
  retenue est un index léger en mémoire. La première recherche coûte toujours le parcours, environ
  320 ms. Chaque frappe suivante prend ensuite 2 à 3 ms.
- **M1.** `quantite` était bien morte, mais pas le genre `gift-multiple`. Sans lui, l'annonce
  d'un gift multiple, qui parle d'abonnements, serait comptée comme un abonnement dans « Pendant
  ton absence ». Il est gardé et commenté.

---

## 1. En bref

Le cœur du script, corrigé en v15.25, reste sain : aucune régression n'est apparue à la relecture,
et ESLint ne relève aucun avertissement. Le module ajouté en v15.26 respecte les mêmes règles :
- aucun `innerHTML` ;
- une interface isolée dans un shadow DOM ;
- des index et des tampons bornés ;
- des crochets qui isolent les fonctions entre elles et du cœur ;
- des réglages enregistrés validés et bornés à la lecture.

L'audit relève **44 points** (§3) : 1 élevé, 6 moyens, 21 faibles, 15 remarques et
1 point fort. **11 défauts sont reproduits** dans Chromium par
`tests/reproduction-15.26.js` (11 sur 11 reproduits sur `7850530`). Les plus importants :

| # | Constat | Conséquence |
|---|---|---|
| P1 | La règle qui estompe le chat pendant le fil teste `:has()` sur **chaque élément de la page** | Survoler une réponse coûte **117 à 134 ms** sur une page de 9 554 éléments : un à-coup de 7 à 8 images à chaque survol. Une règle équivalente sans `:has()` coûte **4,7 ms**. |
| B1 | Le contour du repère « Aller au message » est déclaré `!important` | Une déclaration `!important` passe devant une animation CSS : le repère reste transparent. La fonction « Aller au message » fait défiler le chat sans montrer le message. |
| B3 | Le pouls ne garde que 720 tranches de 10 s et recalcule les moments forts sur cette fenêtre | Les moments forts de plus de deux heures **disparaissent** de la liste et de la copie, alors que l'interface parle de « la session ». |
| B4 | Le changement de chaîne sans remplacement du conteneur ne remet pas le pouls à zéro | Les messages de la chaîne précédente restent comptés, sous le nom de la nouvelle chaîne. |
| B5 | Plusieurs réglages ne s'appliquent qu'aux nouveaux messages, ou ne reviennent pas en arrière | « Compacter les notices » réactivé laisse les notices affichées telles quelles ; « Retirer Répond à » décoché ne remet pas le préfixe. Le README promet pourtant une application immédiate. |
| P2 | La recherche dans l'historique relit tous les messages à chaque recherche (diagnostic rectifié au §0) | 300 à 360 ms par recherche sur 20 000 messages ; environ 1,6 s au réglage maximal (100 000). |

Échelle de sévérité (inchangée) :

- **Élevé** : comportement faux et visible, plantage, ou fuite mémoire dans un usage courant.
- **Moyen** : défaut visible dans un cas précis, ou coût de performance notable.
- **Faible** : cas marginal, ou dette qui rend le code fragile.
- **Info** : remarque sans défaut. **Positif** : point fort à conserver.

*À vérifier* signale un risque que seul le DOM réel de Twitch ou de 7TV peut confirmer.

---

## 2. Méthode

1. **Lecture intégrale** du fichier, ligne à ligne : JS, CSS généré (feuille du chat et feuille
   du shadow DOM), commentaires, textes de l'interface.
2. **Analyse statique** : ESLint 10 avec la configuration du dépôt (0 avertissement), puis une
   recherche de chaque propriété et de chaque champ pour repérer ce qui est écrit sans jamais
   être lu. ESLint ne voit pas ce cas-là.
3. **Reproduction dynamique** dans Chromium 157 avec Playwright, sur la page qui imite le
   chat Twitch (`tests/page.js`). Le temps est simulé avec l'horloge de Playwright pour les
   phénomènes longs : deux heures de pouls en 2 min 30.
4. **Mesures** : coûts mesurés avec `performance.now()` et style forcé, médiane de 15 à 40
   essais. Pour les coûts de rendu, la page est alourdie à 9 554 éléments, l'ordre de grandeur
   d'une page de chaîne Twitch.
5. **Contre-épreuve** : la correction proposée pour B1 a été appliquée à une copie. Le cas
   passe alors à « non reproduit », avec un contour violet à 200 ms. La règle de remplacement
   proposée pour P1 a été mesurée sur la même page lourde.

**Limite.** Je n'ai pas eu accès au DOM réel de Twitch ni de 7TV. Les risques qui en dépendent
sont marqués *à vérifier* (R1, R6).

---

## 3. Tableau de synthèse

| ID | Sévérité | Catégorie | Constat | Preuve |
|---|---|---|---|---|
| B1 | Moyen | Bug | Repère « Aller au message » invisible (`!important` contre animation) | reproduction B1, contre-épreuve |
| B2 | Faible | Bug | Pagination de l'historique : messages perdus quand les horodatages sont égaux | reproduction B2 |
| B3 | Moyen | Bug | Moments forts effacés au bout de deux heures | reproduction B3 |
| B4 | Moyen | Bug | Pouls non remis à zéro au changement de chaîne | reproduction B4 |
| B5 | Moyen | Bug | Réglages appliqués aux seuls nouveaux messages, ou sans retour arrière | reproduction B5 |
| B6 | Faible | Bug | Deux onglets : les réglages de l'un écrasent ceux de l'autre | reproduction B6 |
| B7 | Faible | Bug | Fausses mentions quand le pseudo est un mot courant | reproduction B7 |
| B8 | Faible | Bug | Message représentatif d'un moment fort sans accents ni majuscules | reproduction B8 |
| B9 | Faible | Bug | Chat lent par paquets : chaque paquet devient un moment fort | reproduction B9 |
| R1 | Moyen (à vérifier) | Robustesse | Emotes 7TV non comptées si 7TV les pose après notre lecture | lecture |
| R2 | Faible | Robustesse | Connexion IndexedDB jamais rouverte, promesse de purge non gérée | lecture |
| R3 | Faible | Robustesse | Pastille et cartes recalées une fois par seconde seulement | lecture |
| R4 | Faible | Robustesse | Alt+Maj+B intercepté jusque dans les champs de saisie ; Échap non retenu | lecture |
| R5 | Faible | Robustesse / ergonomie | Pastille sur la ligne la plus ancienne, carte d'absence sans fermeture automatique | captures |
| R6 | Info (à vérifier) | Robustesse | Arrivées reconnues par identité de nœud | lecture |
| R7 | Info | Robustesse | 2 s de messages ignorées à chaque reconnexion | lecture |
| R8 | Faible | Robustesse | Bouton inséré dans une barre gérée par React | lecture |
| P1 | Élevé | Performance | `:has()` évalué sur toute la page à chaque survol de réponse | reproduction P1, mesure |
| P2 | Moyen | Performance | Recherche : normalisation de chaque message à chaque recherche | reproduction P2 |
| P3 | Faible | Performance | Tic : lecture de mise en page et redessin de la pastille chaque seconde | mesure |
| P4 | Info | Performance | Fil : relecture des 150 lignes et `RegExp` compilée par message | mesure |
| P5 | Info | Performance | CSS du fil émis et transition posée même fil désactivé | lecture |
| M1 | Faible | Code mort | `quantite` et le genre `gift-multiple` | grep |
| M2 | Info | Code mort | Propriété `notice` de `lireEntree` | grep |
| M3 | Info | Code mort | `ui.hote`, `ui.style` | grep |
| M4 | Faible | Code mort | Champs `genre`, `parent`, `mention` enregistrés, jamais relus | grep |
| M5 | Info | Code mort | Champs vides de `lectureLegere` | lecture |
| M6 | Info | Code mort | Crochets de test livrés en production | grep |
| Q1 | Faible | Maintenabilité | Deux implémentations de la confirmation en deux temps | lecture |
| Q2 | Faible | Maintenabilité | Caractères combinants invisibles dans `sansAccents` | lecture |
| Q3 | Faible | Maintenabilité | Fichier unique de 4 227 lignes | lecture |
| Q4 | Info | Maintenabilité | Commentaire « Spécificité renforcée » déplacé | lecture |
| Q5 | Info | Maintenabilité | Libellés du panneau inexacts (seuil de sortie, badges gardés) | lecture |
| Q6 | Info | Maintenabilité | Réglages de `CONFIG` absents du panneau, non documentés | lecture |
| S1 | Faible | Sécurité | Lecture de `twilight-user`, qui contient le jeton de session | lecture |
| S2 | Info | Vie privée | Historique dans le stockage de l'origine twitch.tv, interrogeable par `__BTC` | lecture |
| S3 | Faible | Vie privée | Durée de conservation non appliquée quand l'historique est coupé | lecture |
| S4 | Info | Distribution | `@noframes` : enjeu accru avec l'interface et IndexedDB | lecture |
| S5 | Positif | Sécurité | Aucun `innerHTML`, shadow DOM, presse-papiers sur clic | lecture |
| A1 | Faible | Accessibilité | Fil réservé à la souris ; panneau `dialog` sans comportement de dialogue | lecture |
| T1 | Faible | Tests | Le banc vérifie des classes, pas le rendu : F7c passe malgré B1 | reproduction B1 |
| T2 | Faible | Tests | Aucun cas pour B2 à B9, P1 et P2 | lecture |
| T3 | Info | Tests | Page imitée sans variables de thème Twitch | captures |
| T4 | Info | Tests | Attentes réelles là où l'horloge simulée suffirait | lecture |

---

## 4. Bugs

### B1 — Repère « Aller au message » invisible · Moyen

**Où** : [L1004-L1018](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L1004-L1018),
[L3024-L3032](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L3024-L3032).

**Constat.** `.btc-repere` déclare `outline: 2px solid transparent !important` et anime
`outline-color` de la couleur du fil vers le transparent. Or, dans la cascade, une déclaration
`!important` de l'auteur passe **devant** les animations. L'animation tourne
(`getAnimations()` la donne en cours), mais la couleur calculée reste `rgba(0, 0, 0, 0)`.

**Preuve.** Reproduction B1 : couleur du contour à 200 ms = `rgba(0, 0, 0, 0)`. Avec
`prefers-reduced-motion: reduce`, la règle de repli (couleur fixe, sans animation) s'applique
et le repère est visible : seuls les utilisateurs *sans* réglage de mouvement réduit sont
touchés, c'est-à-dire presque tous.

**Correction** (contre-épreuve faite : contour `rgba(169, 112, 255, 0.867)` à 200 ms) :
```css
.btc-repere {
    outline: 2px solid transparent;   /* sans !important : l'animation doit pouvoir le changer */
    outline-offset: -2px;
    animation: btc-repere 2.4s ease-out;
}
```

### B2 — Pagination de l'historique : messages perdus · Faible

**Où** : [L3380](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L3380),
[L3428-L3447](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L3428-L3447),
[L3598](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L3598),
[L2479](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L2479).

**Constat.** « Plus anciens » relance la recherche avec `avant = ts du dernier résultat`, borne
**exclue**. Tous les messages qui partagent cet horodatage sont donc sautés, y compris ceux qui
n'avaient pas tenu dans la page. Ce cas est courant : l'horodatage est pris à la réception
d'un lot de mutations (`horodatages.set(node, Date.now())`), et Twitch insère ses messages
par lots. Tout un lot porte donc la même milliseconde.

**Preuve.** Reproduction B2 : 150 messages par lots de 7, deux pages de 100 → 149 retrouvés.

**Correction.** Paginer sur le couple (horodatage, clé primaire). L'index `chaine_ts` rend la
clé primaire dans `cursor.primaryKey`. Il suffit de retenir `{ ts, id }` du dernier résultat,
puis de rouvrir le curseur borne **incluse** en sautant les `id >= dernier.id` de même `ts`.
On peut aussi borner à `ts + 1` exclu et filtrer les identifiants déjà affichés.

### B3 — Moments forts effacés au bout de deux heures · Moyen

**Où** : [L3789](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L3789),
[L3808](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L3808),
[L3867-L3892](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L3867-L3892).

**Constat.** `seaux` est une fenêtre glissante de 720 tranches (2 h). `analyserPouls`
**recalcule** `moments` à partir de cette seule fenêtre à chaque tranche close. Un moment sorti de
la fenêtre disparaît de la liste du panneau, de la copie « Copier la liste » et du graphe.
L'interface annonce pourtant « Mesure de la session en cours », et le README les moments forts
« de la session ». Sur un live de 6 h, seuls ceux des deux dernières heures restent.

Effet de bord : quand la fenêtre glisse, les 6 premières tranches (`historiqueMin`) et la base
des 30 suivantes changent. Un moment ancien peut donc changer de valeur ou de bornes avant de
disparaître.

**Preuve.** Reproduction B3 (horloge simulée) : un pic de 360 msg/min à 20:10 est détecté,
puis la liste est vide 2 h 15 plus tard.

**Correction.** Séparer le *graphe* (fenêtre de 2 h, inchangée) du *journal des moments* :
n'analyser que les tranches nouvellement closes et ajouter les moments trouvés à une liste qui ne
fait que croître. Pour borner la mémoire, plafonner cette liste, par exemple aux 200 derniers
moments.

### B4 — Pouls non remis à zéro au changement de chaîne · Moyen

**Où** : [L2593-L2598](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L2593-L2598),
[L3902-L3912](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L3902-L3912).

**Constat.** Le pouls ne repart de zéro que sur le crochet `connexion`. Or le cœur gère aussi
le changement de chaîne *dans le même conteneur* (`surveillerRacine`, cas couvert par R1b de
l'audit précédent). Il appelle alors `oublierChaine()` sans déclencher aucun crochet. Les tranches,
les moments et `debutLive` de la chaîne précédente restent en place. Les nouveaux messages
s'ajoutent aux anciens, la liste copiée porte le nom de la nouvelle chaîne, et l'heure
« +h:mm:ss » est calculée sur le début du live précédent jusqu'à la relecture suivante, au plus
60 s plus tard.

**Preuve.** Reproduction B4 : 12 messages sur la chaîne A, `pushState('/autrechaine')`. Après le
tic, les 12 messages sont encore comptés, et la liste s'intitule « Moments forts —
autrechaine ».

**Correction.** Ajouter un crochet `chaine (ancienne, nouvelle)` déclenché par `start` et par
`surveillerRacine` dès que `cleDeChaine()` change, et y brancher la remise à zéro du pouls, à la
place du test fait dans `connexion`. Fermer aussi la carte d'absence et le fil.

### B5 — Réglages sans effet sur les messages affichés, ou sans retour arrière · Moyen

**Où** : [L1961-L1971](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L1961-L1971),
[L1977-L1995](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L1977-L1995),
[L1540-L1550](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L1540-L1550),
[L1478-L1537](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L1478-L1537),
[L1441](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L1441),
[L2804-L2812](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L2804-L2812).

**Constat.** Le panneau applique chaque changement par `recharger()`. Celle-ci relance le
traitement de toutes les lignes, mais plusieurs traitements sont **à sens unique** :

| Réglage | Sens | Effet sur ce qui est affiché |
|---|---|---|
| `compact.enabled` | coupé → activé | aucun : `processNotice` sort tout de suite (`data-btc-notice="1"`), et `rafraichirNotices` ne voit que les notices déjà compactées |
| `compact.aggregateGifts` | les deux | aucun : seuls les gifts suivants sont regroupés ou non, ceux déjà masqués le restent |
| `reply.hidePrefix` | activé → coupé | aucun : le texte « Répond à » a été supprimé du nœud |
| `reply.renderEmotes` | activé → coupé | aucun : les images insérées restent |
| `reply.colorQuotedName` | activé → coupé | aucun : la couleur posée en style inline reste |
| `hideHighlightLabel` | activé → coupé | aucun : l'attribut retiré ne revient pas |

Le README annonce : « Un réglage changé s'applique tout de suite au chat, sans recharger la
page ». L'utilisateur qui teste un réglage dans un sens puis dans l'autre ne voit souvent rien
changer.

**Preuve.** Reproduction B5 : après réactivation, la notice n'est toujours pas compactée ; après
« Retirer Répond à » décoché, la citation reste « @bob : texte ».

**Correction.** Pour `compact.enabled`, retraiter les notices non compactées : effacer
`data-btc-notice` sur celles qui n'ont pas `.btc-notice-line`, puis relancer `processNotice`.
Pour les traitements irréversibles, le plus simple est d'afficher dans le panneau la mention
« s'applique aux nouveaux messages » à côté du réglage, et de corriger le README. Une
réversibilité complète demanderait de garder l'original : préfixe en `data-btc-prefixe`, texte
d'origine de la citation.

### B6 — Deux onglets : les réglages de l'un écrasent ceux de l'autre · Faible

**Où** : [L2783-L2801](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L2783-L2801).

**Constat.** Chaque onglet lit les réglages une fois, au démarrage. Quand l'un d'eux enregistre,
il écrit **tous** ses écarts aux valeurs par défaut, tels qu'il les connaît. Avec deux chaînes
ouvertes, un changement fait dans l'onglet A est donc effacé au premier changement fait dans
l'onglet B.

**Preuve.** Reproduction B6 : A choisit `reply.style = card`, puis B change `rafale.entree`.
Il ne reste que `{"rafale":{"entree":12}}`.

**Correction.** Écouter l'événement `storage` : relire les réglages et les réappliquer
(`chargerReglages()`, puis `appliquerReglages()` et `synchroniserReglages()`). Les deux onglets
restent ainsi alignés, et le panneau ouvert affiche les valeurs du moment.

### B7 — Fausses mentions quand le pseudo est un mot courant · Faible

**Où** : [L2894-L2900](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L2894-L2900).

**Constat.** La mention est reconnue avec ou sans `@` (`@?`). Pour un pseudo qui est aussi un
mot courant (« chat », « max », « lol », « gg »…), presque chaque message devient une mention.
La carte « Pendant ton absence » en liste alors jusqu'à 20, et l'historique les marque.

**Preuve.** Reproduction B7 : pseudo « chat », message « le chat est calme ce soir », mention
reconnue.

**Correction.** Ne retenir que `@pseudo` et les réponses qui te sont adressées. Le pseudo sans
`@` peut rester en option, ou n'être retenu qu'à partir d'une certaine longueur. Au passage,
compiler l'expression une fois, quand l'identité est connue, plutôt qu'à chaque message (P4).

### B8 — Message représentatif sans accents ni majuscules · Faible

**Où** : [L3819-L3820](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L3819-L3820),
[L3879-L3887](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L3879-L3887).

**Constat.** Les textes d'une tranche sont comptés sous leur forme normalisée (`sansAccents`,
minuscules). C'est bien pour regrouper les variantes, mais c'est cette clé qui est affichée et
copiée.

**Preuve.** Reproduction B8 : « ÉNORME le but » répété au pic s'affiche « enorme le but ».

**Correction.** Garder la clé normalisée pour compter, et retenir pour chaque clé la première
forme d'origine rencontrée : `Map(clé → { n, texte })`.

### B9 — Chat lent par paquets : chaque paquet devient un moment fort · Faible

**Où** : [L3824-L3840](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L3824-L3840).

**Constat.** La normale d'une tranche est la **médiane** des 30 précédentes. Dès que plus de la
moitié des tranches sont vides, ce qui est courant sur un petit chat, la médiane vaut 0 et seul
le plancher de 8 messages fait office de seuil. Toute rafale de 8 messages en 10 s devient alors
un moment fort.

**Preuve.** Reproduction B9 : deux heures à 18 messages par minute, arrivés en un paquet par
minute → **119 moments forts**. À la même cadence répartie régulièrement, aucun.

**Correction.** Prendre pour normale `max(médiane, moyenne)` des 30 tranches, ou un quantile
haut. Le plancher peut aussi être relatif au débit moyen, par exemple 3 fois la moyenne
par tranche et au moins 8. Le cas synthétique B9 sert de test de non-régression.

---

## 5. Robustesse

### R1 — Emotes 7TV non comptées si 7TV les pose après notre lecture · Moyen (à vérifier)

**Où** : [L2882-L2884](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L2882-L2884),
[L2433](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L2433),
[L2568](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L2568).

**Constat.** Les emotes d'un message sont lues **une seule fois**, à son arrivée, et seulement
parmi les `<img>`. 7TV décore le chat natif après l'insertion : le cœur observe même
`data-seventv-processed` pour ce motif. Si 7TV n'a pas encore remplacé le texte par ses images au
moment de notre lecture, les emotes 7TV, BTTV et FFZ manquent aux « Emotes phares » de l'absence,
à « l'emote du moment » de la pastille et aux moments forts. Le texte, lui, contient bien le nom
de l'emote.

**Correction** (robuste dans les deux cas) : compter aussi les mots du texte qui sont des noms
d'emotes connues (`emoteIndex.has(mot)`), en dédoublonnant avec les images. `texteBrut` donne
déjà le nom d'une image par son `alt`, il suffit donc de découper `texte`.

### R2 — Connexion IndexedDB jamais rouverte, purge sans gestion d'erreur · Faible

**Où** : [L3335-L3360](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L3335-L3360),
[L3484-L3487](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L3484-L3487).

**Constat.** `basePromesse` est gardée à vie. Si le navigateur ferme la connexion (pression sur
le stockage, données du site effacées), chaque transaction lève `InvalidStateError`.
`viderTampon` l'attrape et écrit un avertissement **chaque seconde**, et l'historique cesse
d'enregistrer en silence. Aucun gestionnaire `onversionchange` ni `onclose` n'est posé.
`purgerHistorique()` est lancée par le tic sans `.catch` : un échec devient une promesse
rejetée non gérée.

**Correction.** Sur `db.onclose` et `db.onversionchange`, fermer la connexion et remettre
`basePromesse` à `null`. Appeler `purgerHistorique().catch(…)`. Limiter l'avertissement à un
par minute.

### R3 — Pastille et cartes recalées une fois par seconde · Faible

**Où** : [L3012-L3021](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L3012-L3021),
[L4092-L4096](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L4092-L4096).

**Constat.** La couche est calée sur le scroller au tic et au `resize` de la fenêtre. Quand la
colonne du chat change de taille ou de place sans redimensionner la fenêtre (mode cinéma,
colonne repliée, lecteur agrandi), la pastille et la carte d'absence restent décalées jusqu'à
une seconde. Le recalage force en outre une lecture de mise en page chaque seconde, même quand
rien n'est affiché.

**Correction.** Un `ResizeObserver` sur le scroller, posé au crochet `connexion`, plus le
`resize` existant. Le tic ne recale plus que si la couche est visible.

### R4 — Raccourcis clavier · Faible

**Où** : [L4083-L4090](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L4083-L4090).

**Constat.** Alt+Maj+B est intercepté en phase de capture sur toute la page, y compris dans la
zone de saisie du chat. Sur macOS, Option+Maj+B produit un caractère sur la plupart des
dispositions de clavier (« ı » en QWERTY américain), qu'on ne peut alors plus taper. Échap ferme le panneau, mais l'événement continue jusqu'à Twitch, qui peut le
traiter à son tour.

**Correction.** Ignorer le raccourci quand la cible est un champ éditable, ou le garder et le
documenter. Pour Échap, appeler `stopPropagation()` quand le panneau était ouvert.

### R5 — Pastille et carte d'absence par-dessus le chat · Faible

**Où** : [L1201-L1236](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L1201-L1236),
[L3755-L3761](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L3755-L3761).

**Constat.** La pastille, en haut à droite, masque la fin de la ligne la plus ancienne. La
carte d'absence couvre le haut du chat jusqu'à ce qu'on la ferme : elle ne disparaît ni au
défilement, ni après un délai, ni au prochain message envoyé.

**Correction.** Rendre la pastille semi-transparente au repos, ou la placer dans la marge du
haut du chat. Fermer la carte d'absence au premier défilement vers le haut, ou au bout d'une
minute sans survol.

### R6 — Arrivées reconnues par identité de nœud · Info (à vérifier)

**Où** : [L2400-L2408](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L2400-L2408),
[L1633-L1640](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L1633-L1640).

**Constat.** Une entrée n'est signalée qu'une fois par nœud (`entreesVues`). Le cœur constate
lui-même que React « recycle » parfois une ligne pour un autre message : le `title` d'une
citation change sur le même nœud. Si ce recyclage touche aussi les entrées de premier niveau,
le message qui réutilise un nœud n'est jamais compté. À vérifier sur Twitch : compter les
`arrivee` contre les messages reçus sur une chaîne rapide, `debug` activé.

### R7 — Deux secondes ignorées à chaque reconnexion · Info

**Où** : [L2574-L2576](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L2574-L2576).

**Constat.** La période de stabilisation écarte de vrais messages en direct à **chaque**
reconnexion, pas seulement à l'ouverture du chat. Le passage en mode cinéma en est une. Ce
choix est voulu et documenté dans `CONFIG`. Il pourrait être resserré : à la reconnexion sur la
même chaîne, seuls les nœuds présents comptent comme déjà vus, et la stabilisation n'est plus
nécessaire.

### R8 — Bouton inséré dans une barre gérée par React · Faible

**Où** : [L4071-L4081](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L4071-L4081).

**Constat.** Le bouton du panneau est inséré entre des nœuds que React possède. C'est le
risque R5 de l'audit précédent (reporté), étendu : React tolère d'ordinaire un nœud étranger
entre ses enfants, et BTTV ou FFZ font de même. Mais une réconciliation qui déplace
l'engrenage peut lever une erreur `insertBefore` côté Twitch. Le tic réinsère le bouton s'il
disparaît, ce qui est bien. Pour le surveiller : erreurs React dans la console après une
ouverture ou une fermeture des réglages du chat.

---

## 6. Performance

### P1 — `:has()` évalué sur toute la page à chaque survol de réponse · Élevé

**Où** : [L994-L996](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L994-L996),
[L3271](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L3271).

**Constat.** L'estompage du reste du chat repose sur :
```css
.btc-fil :is(<racine du chat>) > :not(:has(.btc-fil-actif, .btc-fil-parent, .btc-fil-enfant)):not(…)
```
avec la classe `btc-fil` posée sur `<html>`. Le moteur de style lit un sélecteur de droite à
gauche. Le composant le plus à droite contient un `:has()` sans classe, il s'applique donc à
**tout élément de la page**, et le filtre d'ancêtres ne l'écarte plus dès que `<html>` porte
`btc-fil`. Chaque bascule invalide toute la page et évalue `:has()` (un parcours des
descendants) sur chacun de ses éléments. Un survol en fait deux : à l'entrée et à la sortie.

**Mesures** (page de 9 554 éléments, 150 lignes) :

| Opération | Médiane |
|---|---|
| Survol d'une réponse, de l'événement au style calculé | 117 à 134 ms |
| Bascule de `btc-fil` sur `<html>` seule | 111 ms |
| Bascule d'une classe sur la racine du chat, règle `.racine > :not(.garde)` | 4,7 ms |
| Pour comparaison : bascule de `btc-rafale` sur `<html>` | 1,5 ms |

La relecture des 150 lignes par `montrerFil` ne pèse que 0,6 ms : tout le coût vient de la
règle CSS.

**Correction.** Marquer directement les **entrées** du chat (enfants de la racine, via
`ligneDuChat`) qui contiennent une ligne du fil, avec une classe `btc-fil-garde`. Poser la
classe d'estompage sur la racine du chat, pas sur `<html>`, puis :
```css
.btc-fil-racine > :not(.btc-fil-garde) { opacity: 0.35 !important; }
```
Plus aucun `:has()`, et l'invalidation reste limitée au chat.

### P2 — Recherche : normalisation de chaque message à chaque recherche · Moyen

> **Rectificatif (v15.26.1).** La mesure faite en corrigeant contredit l'analyse ci-dessous. Le
> coût est le parcours IndexedDB lui-même (277 ms pour 20 000 messages), la normalisation ne
> pèse presque rien. Correction retenue : un index léger en mémoire. Voir §0.

**Où** : [L3428-L3447](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L3428-L3447),
[L3480-L3481](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L3480-L3481).

**Constat.** Une recherche par texte parcourt toute la chaîne et applique
`normalize('NFD')`, un retrait des accents et un passage en minuscules à chaque message, à
chaque fois. Le filtre « pseudo » fait de même sur `login` et `nom`. La saisie relance une
recherche 250 ms après la dernière frappe.

**Mesure.** Reproduction P2 : 300 à 360 ms sans résultat sur 20 000 messages, la valeur par
défaut. Au maximum réglable (100 000), on peut extrapoler à environ 1,6 à 1,8 s par recherche.

**Correction.** Enregistrer à l'écriture une forme normalisée, `texteN` et `loginN` (une
normalisation par message, une seule fois), et ne comparer que celle-ci. Si cela ne suffit pas,
un index `multiEntry` sur les mots permettrait des recherches par mot entier.

### P3 — Tic : lecture de mise en page et redessin chaque seconde · Faible

**Où** : [L3012-L3020](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L3012-L3020),
[L3936-L3957](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L3936-L3957),
[L4017-L4046](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L4017-L4046).

**Constat.** Chaque seconde, `placerCouche` lit `getBoundingClientRect()`. `majPastille`
redimensionne le canevas de la pastille (ce qui le réalloue), relit son style calculé et
redessine 30 barres, alors que les tranches ne changent que toutes les 10 s.

**Mesure.** 0,1 ms par tic panneau fermé, 0,8 ms panneau ouvert sur l'onglet Pouls avec 720
tranches. Le coût est faible, c'est surtout du travail inutile.

**Correction.** Ne redessiner que si la dernière tranche ou l'état de rafale a changé ; ne
dimensionner le canevas qu'à sa création ; voir R3 pour le recalage.

### P4 — Fil : relecture des 150 lignes, `RegExp` compilée par message · Info

**Où** : [L3245-L3250](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L3245-L3250),
[L2894-L2900](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L2894-L2900).

**Constat.** Chaque survol relit les 150 lignes avec `lireMessage`. Celle-ci calcule au
passage la détection de mention, inutile pour le fil, et compile une `RegExp` par message.
Mesuré à 0,6 ms pour 150 lignes et 8 µs par entrée : aucun impact aujourd'hui.

**Correction**, si le chat grandit : mettre en cache `lireMessage` par élément (`WeakMap`) et
compiler l'expression des mentions une fois.

### P5 — CSS du fil émis et transition posée même fil désactivé · Info

**Où** : [L976-L1001](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L976-L1001).

**Constat.** Les règles du fil, dont la transition d'opacité sur **toutes** les entrées du chat,
sont émises quel que soit `CONFIG.fil.enabled`. C'est sans coût mesurable, mais les autres
blocs (rafale, séparateurs) sont conditionnés. Mieux vaut faire de même ici.

---

## 7. Code mort

| ID | Où | Élément | Constat |
|---|---|---|---|
| M1 | [L2908](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L2908), [L2923-L2925](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L2923-L2925) | `quantite`, genre `gift-multiple` | `quantite` est calculée (avec un second `match`) et jamais lue ; le genre `gift-multiple` ne sert qu'à elle. L'absence compte les gifts individuels, à juste titre. |
| M2 | [L2924](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L2924) | `notice` dans le résultat de `lireEntree` | Jamais lue. |
| M3 | [L3007](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L3007) | `ui.hote`, `ui.style` | Gardés, jamais relus. |
| M4 | [L3480-L3481](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L3480-L3481) | `genre`, `parent`, `mention` des messages gardés | Écrits pour chaque message, jamais relus : ni filtre, ni affichage. Soit les exploiter (un filtre « mes mentions » serait utile), soit ne plus les écrire. |
| M5 | [L2940-L2944](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L2940-L2944) | `genre: ''`, `texte: ''` de `lectureLegere` | Les fonctions qui lisent ces champs demandent la lecture complète ; ceux-ci ne sont jamais lus. |
| M6 | [L4135-L4144](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L4135-L4144), [L3516](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L3516), [L3756](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L3756) | `__BTC.historique.ajouter`, `__BTC.interne`, `data-*` des cartes | Écrits pour le banc et livrés en production. Acceptable (voir S4 de l'audit précédent), mais `ajouter` permet d'injecter de faux messages dans l'historique depuis la console. Le réserver à la variante source, ou le documenter comme outil de test. |

---

## 8. Maintenabilité

- **Q1 · Faible.** Deux confirmations « en deux temps » écrites séparément : « Rétablir »
  ([L3105-L3124](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L3105-L3124))
  et `deuxTemps`
  ([L3609-L3625](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L3609-L3625)).
  Une seule fonction suffit.
- **Q2 · Faible.** `sansAccents`
  ([L2647](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L2647))
  contient les caractères combinants U+0300 à U+036F en clair. Ils sont invisibles dans un
  éditeur, et un copier-coller ou un reformatage peut les perdre. À écrire
  `/[̀-ͯ]/g`.
- **Q3 · Faible.** Le fichier fait 4 227 lignes dans une seule IIFE, le double de la v15.25.
  Le point Q6 de l'audit précédent (organisation) devient pressant. Le dépôt a maintenant une
  étape de construction (`scripts/build.js`) : elle pourrait **assembler** le userscript à
  partir de fichiers séparés (`src/coeur.js`, `src/fonctions/*.js`, `src/css/*.js`) sans rien
  changer au fichier livré.
- **Q4 · Info.** Le commentaire « Spécificité renforcée »
  ([L484-L491](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L484-L491))
  explique la classe doublée de `Q`
  ([L505](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L505)),
  mais il précède les constantes `NOTICE_GAP` et `GIFT_IMG`.
- **Q5 · Info.** Libellés du panneau : « Seuil de sortie — Ramené sous le seuil d'entrée s'il le
  dépasse »
  ([L2738](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L2738))
  alors que le code le ramène à 80 % du seuil d'entrée (L3202). « modo, VIP et diffuseur
  restent » omet staff et admin, gardés aussi (L942).
- **Q6 · Info.** `rafale.fenetreS`, `pouls.minimum` et `stabilisationMs` ne sont réglables que
  dans `CONFIG`, ce qui est cohérent. Mais un réglage écrit à la main dans `CONFIG` est écrasé
  à chaque mise à jour du script : le README devrait le dire pour les réglages absents du
  panneau.

---

## 9. Sécurité, vie privée, accessibilité

- **S1 · Faible — `twilight-user`.**
  [L2843-L2857](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L2843-L2857).
  Pour connaître ton pseudo, le script lit et analyse la clé `twilight-user` du stockage de
  Twitch. Elle contient aussi le **jeton de session** (`authToken`). Seuls `login` et
  `displayName` sont gardés et rien ne sort de la page, mais il n'y a aucune raison de
  manipuler un objet qui porte un jeton. Lire d'abord le cookie `login`, qui ne contient que le
  pseudo, et n'utiliser `twilight-user` qu'en repli, ou pas du tout.
- **S2 · Info — où vit l'historique.** IndexedDB est rangé par origine : la base
  `btc-historique` appartient à `https://www.twitch.tv`. Les scripts de Twitch, et tout autre
  userscript ou extension qui s'exécute dans la page, peuvent la lire. `__BTC.historique.chercher`
  la rend en outre interrogeable en une ligne. « Rien n'est envoyé ailleurs » reste vrai pour ce
  script. Le README pourrait préciser « dans le stockage du site twitch.tv, sur ce navigateur ».
- **S3 · Faible — conservation non appliquée historique coupé.**
  [L3486](https://github.com/Maxezify/Betterchat-for-Twitch/blob/7850530/BetterTwitchChat.user.js#L3486).
  La purge par âge ne tourne que si l'historique est activé. Une fois coupé, les messages déjà
  gardés restent **indéfiniment**, au-delà des « 7 jours » réglés. Le panneau le dit
  (« reste en place »), mais la durée affichée n'est alors plus tenue. Purger par âge même
  historique coupé, si la base existe, ou proposer « effacer aussi l'existant » à la
  désactivation.
- **S4 · Info — `@noframes`** (S5 de l'audit précédent, réévalué). Avec la v15.26, chaque cadre
  `www.twitch.tv` installe aussi un tic d'une seconde, un écouteur clavier et, historique
  activé, écrit dans IndexedDB. Dans un chat intégré, c'est plutôt souhaitable. À trancher
  toujours : `@noframes` si l'on ne veut le script que dans la page principale et le chat
  détaché.
- **S5 · Positif.** Aucune donnée n'est insérée par `innerHTML` : tout passe par `h()` et
  `textContent`. L'interface vit dans un shadow DOM, les styles ne fuient dans aucun sens. Le
  presse-papiers n'est utilisé que sur un clic. Les réglages enregistrés sont validés et
  bornés à la lecture : un stockage altéré ne peut pas injecter de valeur hors limites (cas F1c
  du banc).
- **A1 · Faible — accessibilité.** Le fil n'existe qu'au survol de la souris : rien au clavier.
  Le panneau est déclaré `role="dialog"` sans en avoir le comportement : pas d'`aria-modal`,
  le focus n'y est pas contenu. Il serait plus juste de le déclarer `role="region"` avec un
  titre, ou d'en faire un vrai dialogue. Les onglets, le retour du focus à la fermeture et les
  libellés des champs sont corrects.

---

## 10. Tests et outillage

- **T1 · Faible.** Le banc vérifie des **classes**, pas leur **rendu**. F7c conclut
  « message repéré » parce que `btc-repere` est posée, alors que le repère est invisible (B1).
  Pour les effets visuels, tester une valeur calculée : couleur de contour, opacité, `display`.
- **T2 · Faible.** Aucun cas ne couvre B2 à B9, P1 et P2. `tests/reproduction-15.26.js` les
  reproduit aujourd'hui. À chaque correction, le cas correspondant passe à « non reproduit »
  et rejoint `tests/cas.js`. Pour P1, un budget de temps sur page lourde (par exemple
  survol < 20 ms) éviterait le retour d'un sélecteur coûteux.
- **T3 · Info.** La page imitée ne définit pas les variables de thème de Twitch
  (`--color-background-base`…) : le panneau y prend toujours ses couleurs de repli sombres, et
  son thème clair n'est jamais testé.
- **T4 · Info.** F3b attend 3 s réelles. L'horloge simulée de Playwright (`page.clock`, utilisée
  par la reproduction B3) permettrait de tester rafale, absence et pouls sans attendre, et sur
  des durées réalistes.

---

## 11. Points ouverts de l'audit précédent

| Point | Statut en v15.25 | Réévaluation en v15.26 |
|---|---|---|
| R5 — nœuds React modifiés en place | Reporté | Toujours ouvert. La v15.26 ajoute un cas : le bouton du panneau (R8). |
| P4 — lectures et écritures entrelacées | Reporté | Inchangé. Les fonctions de la v15.26 lisent après le traitement du lot, dans la même image, sans écriture intercalée. |
| P6 — micro-optimisations | Partiel | Inchangé. |
| Q4 — CSS dupliqué | Partiel | Inchangé dans le cœur. Le nouveau CSS ne duplique rien de notable. |
| Q6 — organisation du fichier | Partiel | Plus pressant : voir Q3. |
| Q7 — CRLF | Conservé | Conservé ; la construction et le banc le gèrent. |
| S4 — `window.__BTC` exposé | Conservé | API élargie (réglages, historique, pouls, interne) : voir M6 et S2. |
| S5 — `@noframes` | Conservé | Enjeu accru : voir S4. |
| S6 — `@icon` via Google | Conservé | Inchangé. |

---

## 12. Plan d'action proposé

À mener sur `dev`, banc au vert à chaque étape. Chaque cas de `tests/reproduction-15.26.js`
doit passer à « non reproduit », puis rejoindre `tests/cas.js`.

1. **Correctifs immédiats**, quelques lignes chacun : B1 (une déclaration CSS), P1 (règle du fil
   sans `:has()`), B8, B7, R4.
2. **Pouls** : B3 (journal des moments séparé du graphe), B4 (crochet `chaine`), B9 (normale
   plus robuste), R1 (emotes reconnues dans le texte).
3. **Réglages** : B5 (retraitement des notices, mention « nouveaux messages »), B6 (événement
   `storage`), Q5.
4. **Historique** : B2 (pagination sur la clé primaire), P2 (formes normalisées à l'écriture),
   R2, S3, M4.
5. **Nettoyage** : M1 à M6, Q1, Q2, Q4, P3, P5.
6. **Plus tard** : Q3 (assemblage depuis plusieurs fichiers par `scripts/build.js`), A1, S1.
