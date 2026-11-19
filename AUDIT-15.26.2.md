# Audit de BetterTwitchChat v15.26.2

| | |
|---|---|
| Fichier audité | [`BetterTwitchChat.user.js`](https://github.com/Maxezify/Betterchat-for-Twitch/blob/68f31d5/BetterTwitchChat.user.js) au commit `68f31d5` (branche `dev`) |
| Taille | 4 133 lignes, 210 949 octets, fins de ligne CRLF |
| Empreinte | sha256 `ca567e2caada9abe6b36ad1d25051c845c6773d5723472016f9903914ec9c8f6` |
| Date | 19 novembre 2026 |
| Périmètre | Tout le fichier, relu en entier. Les ajouts des v15.26.1 et v15.26.2 sont examinés de près : réglages réversibles, synchronisation entre onglets, crochet `chaine`, journal du pouls, bouton calqué sur l'engrenage, raccourcis, effacement de l'ancien historique. Les zones du cœur inchangées depuis la v15.25.0, déjà auditées deux fois, ont été relues pour leurs interactions avec ces ajouts. Les points ouverts de l'audit précédent sont réévalués au §9. |
| Reproduction | [`tests/reproduction-15.26.2.js`](tests/reproduction-15.26.2.js) : `npm run audit:reproduction` |

Les numéros de ligne (`L3997`) renvoient à cette version ; chaque lien ouvre la ligne sur
GitHub. Les identifiants sont propres à cet audit.

---

## 1. En bref

Les corrections de la v15.26.1 et les changements de la v15.26.2 tiennent : à la relecture,
aucune régression du cœur. Les 11 défauts de l'audit précédent restent corrigés ou sans objet,
ESLint ne relève aucun avertissement, et le banc passe (83 cas sur la source, 82 sur la version
optimisée, 1 et 2 non concernés).

L'audit relève **24 points** : 3 moyens, 9 faibles, 11 remarques et 1 point fort. Il n'y a ni défaut élevé, ni
problème de performance mesurable. **7 défauts sont reproduits** dans Chromium par
`tests/reproduction-15.26.2.js` (7 sur 7 sur `68f31d5`). Les corrections proposées pour les
quatre plus simples ont été vérifiées sur une copie (§2).

| # | Constat | Conséquence |
|---|---|---|
| B1 | La correction R4 de la v15.26.1 ignore Alt+Maj+B dans **tout** champ de saisie | Sous Windows et Linux, le raccourci ne fait plus rien quand le curseur est dans la zone de saisie du chat. C'est pourtant là qu'il est le plus souvent. |
| B3 | Le pouls repart de zéro à chaque changement de chaîne | Un aller-retour d'une minute sur une autre chaîne (clic distrait, raid) efface la mesure et les moments forts accumulés depuis des heures. |
| B6 | La pastille de rafale et la carte d'absence se posent en haut du chat | Elles recouvrent les bandeaux que Twitch affiche à cet endroit (moment fort de la communauté, prédiction, annonce), comme sur ta capture avec l'ancienne pastille du pouls. |

---

## 2. Méthode

1. **Lecture intégrale** du fichier, ligne à ligne. Un `git diff` contre la v15.25.0 a servi à
   repérer chaque zone modifiée depuis le dernier audit complet du cœur.
2. **Analyse statique** : ESLint, configuration du dépôt, 0 avertissement. Chaque sélecteur
   CSS, option et global déclaré a été recherché dans le code, pour repérer ce qui n'est plus
   utilisé.
3. **Reproduction** dans Chromium 157 avec Playwright, sur la page imitée du banc. Pour B1, la
   reproduction ajoute un éditeur `contenteditable`, comme la vraie zone de saisie de Twitch :
   la page imitée n'a qu'un `textarea` (voir T2).
4. **Contre-épreuve** : les corrections proposées pour B1, B2, B5 et B7 ont été appliquées à une
   copie. Les quatre cas passent à « non reproduit » : panneau ouvert depuis la saisie, focus
   rendu à la saisie, région `aria-live` réécrite 0 fois en 3 s, clic arrêté au bouton.

**Limite.** Je n'ai toujours pas accès au DOM réel de Twitch ni de 7TV. B7 et R1 dépendent de
ce que Twitch attache à ses conteneurs : ils sont marqués *à vérifier*.

---

## 3. Tableau de synthèse

| ID | Sévérité | Catégorie | Constat | Preuve |
|---|---|---|---|---|
| B1 | Moyen | Bug | Alt+Maj+B sans effet dans la zone de saisie du chat (Windows, Linux) | reproduction B1, contre-épreuve |
| B2 | Faible | Bug / accessibilité | Échap rend le focus au bouton du panneau, pas à la saisie | reproduction B2, contre-épreuve |
| B3 | Moyen | Bug | Pouls remis à zéro au moindre passage sur une autre chaîne | reproduction B3 |
| B4 | Faible | Bug | Résumé d'absence qui mélange deux chaînes | reproduction B4 |
| B5 | Faible | Accessibilité | Compteur du pouls en `aria-live` réécrit chaque seconde | reproduction B5, contre-épreuve |
| B6 | Moyen | Ergonomie | Pastille de rafale et carte d'absence sur les bandeaux de Twitch | reproduction B6, capture |
| B7 | Faible (à vérifier) | Robustesse | Le clic sur le bouton remonte aux conteneurs de Twitch | reproduction B7, contre-épreuve |
| B8 | Info | Texte | « 1 messages sur la dernière minute » | lecture |
| R1 | Faible (à vérifier) | Robustesse | La copie de l'engrenage hérite de ses attributs d'état (`disabled`, `tabindex`…) | lecture |
| R2 | Info | Robustesse | Copie reconstruite à chaque changement de classes de l'engrenage | lecture |
| R3 | Info | Maintenance | Effacement de l'ancien historique lancé à chaque chargement, sans échéance | lecture |
| P1 | Info | Performance | Vue du pouls reconstruite chaque seconde même inchangée | lecture |
| M1 | Info | Code mort | Règle `input[type="search"]` du panneau | grep |
| M2 | Info | Code mort | Option `marquer` de `dessinerPouls`, toujours vraie | grep |
| M3 | Info | Code mort | Global `IDBKeyRange` déclaré dans ESLint | grep |
| M4 | Info | Code mort | Mise en page de la pastille et de la carte pensée pour l'ancienne pastille | lecture |
| M5 | Info | Code mort | `confirmerEnDeuxTemps` n'a plus qu'un usage | grep |
| D1 | Faible | Documentation | README : Alt+Maj+B présenté sans réserve | lecture |
| T1 | Faible | Tests | Le cas 26R4 impose le comportement fautif de B1 | lecture |
| T2 | Faible | Tests | Page imitée avec un `textarea` au lieu de l'éditeur de Twitch | lecture |
| T3 | Faible | Tests | Aucun cas pour B2 à B7 | lecture |
| T4 | Info | Tests | N2 ne vaut que pour la maquette des boutons de Twitch | lecture |
| A1 | Info | Accessibilité | Panneau : liste des moments reconstruite sous les yeux du lecteur d'écran | lecture |
| S1 | Positif | Sécurité | Aucun `innerHTML`, pas de jeton lu, pas de réseau | lecture |

---

## 4. Bugs

### B1 — Alt+Maj+B sans effet dans la zone de saisie du chat · Moyen

**Où** : [L3985-L4005](https://github.com/Maxezify/Betterchat-for-Twitch/blob/68f31d5/BetterTwitchChat.user.js#L3985-L4005).

**Constat.** La correction R4 de la v15.26.1 laisse passer Alt+Maj+B dès que la cible est un
champ de saisie, pour ne pas voler le caractère que la combinaison tape sous macOS (« ı »).
Mais la zone de saisie du chat est justement un champ : un éditeur `contenteditable`, d'après le
code que tu m'as transmis. Sous Windows et Linux, la combinaison ne tape rien (`e.key` vaut
« B ») et le panneau ne s'ouvre plus, alors que le curseur y est la plupart du temps.

**Preuve.** Reproduction B1 : avec un éditeur `contenteditable` qui a le focus et `key` à « B »,
le panneau reste fermé.

**Correction** (contre-épreuve faite : le panneau s'ouvre) : ne laisser passer que si la
combinaison produit un autre caractère, comme l'Option de macOS.
```js
if (dansUnChamp(e) && e.key.toLowerCase() !== 'b') return;
```
Le cas 26R4 du banc doit changer en même temps (T1).

### B2 — Échap rend le focus au bouton du panneau, pas à la saisie · Faible

**Où** : [L3207-L3211](https://github.com/Maxezify/Betterchat-for-Twitch/blob/68f31d5/BetterTwitchChat.user.js#L3207-L3211),
[L3301-L3307](https://github.com/Maxezify/Betterchat-for-Twitch/blob/68f31d5/BetterTwitchChat.user.js#L3301-L3307).

**Constat.** À la fermeture, le focus va toujours au bouton du panneau. Si le panneau a été
ouvert depuis la saisie du chat (raccourci, une fois B1 corrigé), Échap ne rend pas la main à la
saisie : il faut recliquer dedans pour continuer à écrire.

**Preuve.** Reproduction B2 : focus sur la saisie, panneau ouvert, Échap → focus sur le bouton.

**Correction** (contre-épreuve faite) : retenir `document.activeElement` à l'ouverture et le
rendre à la fermeture s'il est encore dans la page ; sinon le bouton.

### B3 — Pouls remis à zéro au moindre passage sur une autre chaîne · Moyen

**Où** : [L3787-L3795](https://github.com/Maxezify/Betterchat-for-Twitch/blob/68f31d5/BetterTwitchChat.user.js#L3787-L3795),
[L2605-L2610](https://github.com/Maxezify/Betterchat-for-Twitch/blob/68f31d5/BetterTwitchChat.user.js#L2605-L2610).

**Constat.** La correction B4 de la v15.26.1 remet le pouls à zéro au changement de chaîne. Mais
elle ne garde rien de la chaîne quittée. Un clic distrait sur une autre chaîne, ou un raid
suivi d'un retour, efface les tranches et le journal des moments forts accumulés depuis le
début de la session. Or ce journal est fait pour préparer des clips après coup.

**Preuve.** Reproduction B3 : 12 messages mesurés sur `testchannel`, aller-retour sur une autre
chaîne, 0 au retour.

**Correction.** Garder en mémoire une session de pouls par chaîne (tranches, journal, dernier
seau jugé, début du live) le temps de la page, dans une `Map` bornée, par exemple aux 5 dernières
chaînes. Changer de chaîne range la session courante et reprend la sienne. Le coût mémoire
reste négligeable : au plus 720 tranches et 200 moments par chaîne.

### B4 — Résumé d'absence qui mélange deux chaînes · Faible

**Où** : [L3473-L3501](https://github.com/Maxezify/Betterchat-for-Twitch/blob/68f31d5/BetterTwitchChat.user.js#L3473-L3501),
[L3587-L3588](https://github.com/Maxezify/Betterchat-for-Twitch/blob/68f31d5/BetterTwitchChat.user.js#L3587-L3588).

**Constat.** Le crochet `chaine` ferme la carte, mais pas le décompte en cours. Si la chaîne
change pendant l'absence, le résumé additionne les deux. Le cas le plus courant : un raid, où
Twitch emmène les spectateurs sur la chaîne qui reçoit. Les « mentions » renvoient alors à des
lignes d'un chat qui n'est plus affiché.

**Preuve.** Reproduction B4 : 5 messages sur la chaîne A, navigation vers B onglet masqué,
4 messages sur B ; au retour, le résumé annonce 9 messages.

**Correction.** Au crochet `chaine`, si un décompte est en cours, le recommencer pour la
nouvelle chaîne. On peut garder une ligne « Tu as été emmené sur <chaîne> » pour expliquer le
changement.

### B5 — Compteur du pouls en `aria-live` réécrit chaque seconde · Faible (accessibilité)

**Où** : [L3844](https://github.com/Maxezify/Betterchat-for-Twitch/blob/68f31d5/BetterTwitchChat.user.js#L3844),
[L3866-L3890](https://github.com/Maxezify/Betterchat-for-Twitch/blob/68f31d5/BetterTwitchChat.user.js#L3866-L3890).

**Constat.** Onglet Pouls ouvert, le tic réécrit chaque seconde le texte du compteur, une région
`aria-live="polite"`, même quand il n'a pas changé. Un lecteur d'écran peut l'annoncer en
boucle.

**Preuve.** Reproduction B5 : 3 réécritures en 3 s, texte identique.

**Correction** (contre-épreuve faite : 0 réécriture) : n'écrire que si le texte change. Mieux
encore : retirer `aria-live` de ce compteur, qui change toutes les secondes dès que le chat
vit, et laisser le lecteur d'écran le lire à la demande.

### B6 — Pastille de rafale et carte d'absence sur les bandeaux de Twitch · Moyen (ergonomie)

**Où** : [L1195-L1212](https://github.com/Maxezify/Betterchat-for-Twitch/blob/68f31d5/BetterTwitchChat.user.js#L1195-L1212),
[L1216-L1226](https://github.com/Maxezify/Betterchat-for-Twitch/blob/68f31d5/BetterTwitchChat.user.js#L1216-L1226),
[L3898-L3915](https://github.com/Maxezify/Betterchat-for-Twitch/blob/68f31d5/BetterTwitchChat.user.js#L3898-L3915).

**Constat.** La v15.26.2 a retiré le pouls de la pastille parce qu'il recouvrait une
notification, mais la pastille de rafale est restée exactement au même endroit, de 6 à 29 px
sous le haut du chat. Twitch place là ses bandeaux : moments forts de la communauté,
prédictions, sondages, annonces épinglées. Pendant une rafale, c'est-à-dire au moment où ces
bandeaux apparaissent le plus (hype train, gift bomb), la pastille les recouvre. La carte
« Pendant ton absence » occupe la même zone pendant une minute.

**Preuve.** Reproduction B6 pour la position ; ta capture montre le recouvrement avec
l'ancienne pastille, posée au même endroit.

**Correction.** Ne plus rien poser sur le chat :
- signaler la rafale sur le bouton du panneau, à côté de l'engrenage, par une pastille de
  couleur sur l'icône, avec le débit en infobulle ;
- ancrer la carte d'absence en bas du chat, au-dessus de la saisie, là où Twitch ne met rien
  quand le chat défile.

### B7 — Le clic sur le bouton remonte aux conteneurs de Twitch · Faible (à vérifier)

**Où** : [L3968](https://github.com/Maxezify/Betterchat-for-Twitch/blob/68f31d5/BetterTwitchChat.user.js#L3968).

**Constat.** Le gestionnaire de clic appelle `preventDefault()` mais pas `stopPropagation()`. Le
clic remonte donc aux conteneurs de la barre de saisie, et React le redistribue aux
gestionnaires qu'il y a posés. Selon ce que Twitch y attache (focus de la saisie, fermeture d'un
menu), un clic sur le bouton du panneau peut produire un effet de Twitch en plus.

**Preuve.** Reproduction B7 : un écouteur posé sur un conteneur parent reçoit le clic.

**Correction** (contre-épreuve faite) : `e.stopPropagation()` dans le gestionnaire.

### B8 — « 1 messages sur la dernière minute » · Info

**Où** : [L3877](https://github.com/Maxezify/Betterchat-for-Twitch/blob/68f31d5/BetterTwitchChat.user.js#L3877).

Le pluriel est écrit en dur. L'outil `pluriel()` existe déjà et règle le cas de 0 et de 1.

---

## 5. Robustesse

- **R1 · Faible (à vérifier) — attributs d'état copiés.**
  [L3949-L3970](https://github.com/Maxezify/Betterchat-for-Twitch/blob/68f31d5/BetterTwitchChat.user.js#L3949-L3970).
  La copie retire les `data-*`, `aria-*` et `id`, mais garde tout le reste : `disabled`,
  `tabindex`, `style`. Si Twitch désactive l'engrenage à un moment (chat en chargement, chat
  caché), la copie naît désactivée et le reste jusqu'au prochain changement de classes. Retirer
  aussi `disabled` et `tabindex`.
- **R2 · Info — reconstruction de la copie.**
  [L3972-L3983](https://github.com/Maxezify/Betterchat-for-Twitch/blob/68f31d5/BetterTwitchChat.user.js#L3972-L3983).
  La copie est refaite dès que `className` change. Si Twitch ajoutait une classe d'état à
  l'engrenage, par exemple quand son menu est ouvert, le bouton serait recréé à chaque tic, et
  le focus perdu s'il l'avait. Rien de tel n'est visible dans le code de la barre que tu as
  transmis. Pour le vérifier : journal activé, compter les reconstructions.
- **R3 · Info — code temporaire sans échéance.**
  [L3446-L3465](https://github.com/Maxezify/Betterchat-for-Twitch/blob/68f31d5/BetterTwitchChat.user.js#L3446-L3465),
  [L4020](https://github.com/Maxezify/Betterchat-for-Twitch/blob/68f31d5/BetterTwitchChat.user.js#L4020).
  L'effacement de l'ancien historique appelle `indexedDB.databases()` à chaque chargement de
  page, chez tout le monde et pour toujours. Le coût est négligeable, mais le code n'a plus de
  raison d'être une fois la v15.26.x passée chez les testeurs. Indiquer dans le commentaire la
  version où il sera retiré, par exemple la 15.28.

---

## 6. Performance

Rien de mesurable : tic à 0,1 ms panneau fermé, survol d'une réponse sous 10 ms sur une page
lourde (cas 26P1). Le banc passe en 49 s par variante.

- **P1 · Info.** [L3866-L3890](https://github.com/Maxezify/Betterchat-for-Twitch/blob/68f31d5/BetterTwitchChat.user.js#L3866-L3890).
  Onglet Pouls ouvert, la liste des moments (200 au plus) est reconstruite chaque seconde, même
  sans nouveau moment. C'est sans coût sensible, mais ça rejoint B5 et A1 : ne reconstruire que
  si le journal a changé.

---

## 7. Code mort

| ID | Où | Élément | Constat |
|---|---|---|---|
| M1 | [L1164](https://github.com/Maxezify/Betterchat-for-Twitch/blob/68f31d5/BetterTwitchChat.user.js#L1164) | `input[type="search"]` | Ne servait qu'à la recherche de l'historique, retirée. |
| M2 | [L3814](https://github.com/Maxezify/Betterchat-for-Twitch/blob/68f31d5/BetterTwitchChat.user.js#L3814), [L3833](https://github.com/Maxezify/Betterchat-for-Twitch/blob/68f31d5/BetterTwitchChat.user.js#L3833) | option `marquer` de `dessinerPouls` | Un seul appel, avec la valeur par défaut ; elle servait à la mini-courbe de la pastille. |
| M3 | [`eslint.config.js` L9](eslint.config.js) | global `IDBKeyRange` | Plus utilisé depuis le retrait de l'historique. |
| M4 | [L1196-L1210](https://github.com/Maxezify/Betterchat-for-Twitch/blob/68f31d5/BetterTwitchChat.user.js#L1196-L1210), [L1218](https://github.com/Maxezify/Betterchat-for-Twitch/blob/68f31d5/BetterTwitchChat.user.js#L1218) | `gap` de la pastille, `top: 34px` de la carte | Pensés pour la pastille à trois éléments et pour poser la carte sous elle. À revoir avec B6. |
| M5 | [L3161-L3180](https://github.com/Maxezify/Betterchat-for-Twitch/blob/68f31d5/BetterTwitchChat.user.js#L3161-L3180) | `confirmerEnDeuxTemps` | Un seul usage (« Rétablir ») depuis le retrait des effacements de l'historique. À garder si d'autres actions à confirmer sont prévues, sinon à remettre en ligne. |

---

## 8. Documentation, tests, accessibilité, sécurité

- **D1 · Faible.** Le README (L32) présente Alt+Maj+B sans réserve. Il ne marche plus depuis la
  saisie du chat (B1), et ne marchera pas, par construction, dans un champ sous macOS.
- **T1 · Faible.** Le cas [26R4](tests/cas.js) envoie `key: 'B'` dans un champ et exige que le
  panneau reste fermé : il impose le comportement fautif de B1. Il faut le scinder : « B » (Windows,
  Linux) ouvre le panneau, « ı » (macOS) laisse passer le caractère.
- **T2 · Faible.** La page imitée ([`tests/page.js` L43](tests/page.js)) a un `textarea` comme zone
  de saisie, alors que Twitch utilise un éditeur `contenteditable` (Slate). B1 est passé
  inaperçu pour cette raison. Remplacer le `textarea` par la structure réelle.
- **T3 · Faible.** Aucun cas ne couvre B2 à B7 ; `tests/reproduction-15.26.2.js` les reproduit
  aujourd'hui, et ses cas rejoindront le banc une fois corrigés.
- **T4 · Info.** Le cas N2 mesure l'alignement sur une maquette des boutons de Twitch. Il prouve
  que la copie a la taille et la position de l'engrenage, quelle que soit la mise en page, mais
  pas le rendu exact de Twitch, que seul un essai réel confirme.
- **A1 · Info.** Le lecteur d'écran perd sa place dans la liste des moments, reconstruite chaque
  seconde (P1).
- **S1 · Positif.** Toujours aucun `innerHTML`. Le jeton de session n'est plus lu (cookie
  `login` d'abord). Aucune requête réseau. La copie de l'engrenage ne garde ni ses `data-*` ni ses
  `aria-*` : aucun code ne peut la prendre pour l'original.

---

## 9. Points ouverts des audits précédents

| Point | Statut | Réévaluation |
|---|---|---|
| R6 (15.26) — arrivées reconnues par identité de nœud | À vérifier | Inchangé : à mesurer sur Twitch, journal activé. |
| R7 (15.26) — 2 s ignorées à chaque reconnexion | Conservé | Toujours justifié : Twitch peut remplir le nouveau conteneur après l'avoir créé. |
| R8 (15.26) — bouton dans une barre gérée par React | Conservé | Le bouton est désormais une copie (v15.26.2) ; voir R1, R2 et B7. |
| M6 (15.26) — outils de test livrés | Conservé | `__BTC.historique.ajouter` a disparu avec l'historique ; reste `__BTC.interne`. |
| S4 (15.26) — `@noframes` | À trancher | Inchangé. |
| Q3 (15.26) — fichier unique | Reporté | 4 133 lignes, en baisse depuis le retrait de l'historique ; toujours pertinent. |
| P4, A1, T4 (15.26) | Partiels | Inchangés. T4 : l'horloge simulée sert aux cas 26B3 et 26R5. |
| R5, P4 (15.24) | Reportés | Inchangés. |

---

## 10. Plan d'action proposé

À mener sur `dev`, banc au vert à chaque étape. Chaque cas de `tests/reproduction-15.26.2.js`
doit passer à « non reproduit », puis rejoindre `tests/cas.js`.

1. **Correctifs immédiats**, quelques lignes chacun, contre-épreuve déjà faite : B1 avec T1, B2,
   B5, B7, puis B8 et R1.
2. **Ergonomie** : B6. La rafale se signale sur le bouton du panneau, la carte d'absence passe en
   bas du chat. M4 suit.
3. **Pouls et absence** : B3 (une session par chaîne), B4 (décompte recommencé au changement de
   chaîne).
4. **Banc et documents** : T2 (éditeur `contenteditable` dans la page imitée), T3, D1, nettoyage
   M1 à M3, échéance de R3.
