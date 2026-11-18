# Audit de BetterTwitchChat v15.24.0

| | |
|---|---|
| Fichier audité | [`BetterTwitchChat.js`](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js) au commit `d054262` (branche `prod`) |
| Taille | 2 064 lignes, 103 825 octets, fins de ligne CRLF |
| Empreinte | sha256 `d7c21400a69982b9b3e8e39495db574b024b9f9aaad6c33a5db86e60aaefd0d8` |
| Date | 18 novembre 2026 |
| Périmètre | Audit de la v15.24.0. Les corrections sont suivies au §0. |

Les numéros de ligne (`L1184`) renvoient à cette version. Chaque lien ouvre la ligne sur GitHub.

---

## 0. Suivi des corrections — v15.25.0 (branche `dev`)

| Statut | Points |
|---|---|
| Corrigé | 41 — tous les bugs (B1-B9), R1-R4, R6-R10, P1-P3, P5, M1-M10, Q1-Q3, Q5, D1-D4, S2 |
| Partiel | 3 — P6, Q4, Q6 |
| Reporté | 2 — R5 (mode d'insertion dans le DOM), P4 (boucle unique lecture/écriture) |
| Conservé | 4 — Q7, S4, S5, S6 |
| Action de ta part | 1 — S3 (protection de la branche `prod`) |
| Positif | 1 — S1 |

Le détail point par point (statut, justification, tests associés) est dans
[`tests/suivi.json`](tests/suivi.json). La suite `tests/` (46 cas, `npm test`) remplace le banc
de reproduction du §10 : la v15.24.0 échoue aux 46 cas, la v15.25.0 les passe tous.
Elle tourne automatiquement avant chaque commit qui touche au script (hook `pre-commit`) et
sur GitHub à chaque push vers `dev` ou `prod`.

La recette manuelle à faire sur Twitch avant le passage en `prod` est dans
[`tests/recette.json`](tests/recette.json).

---

## 1. En bref

Le script est soigné. Les commentaires expliquent le *pourquoi* : rapports de spécificité
CSS, choix de rendu, pannes déjà rencontrées. Le code ne s'appuie jamais sur les classes
hachées de Twitch, les index sont bornés, aucune donnée du chat ne passe par `innerHTML`, et
l'animation dépend du temps écoulé, pas de la fréquence de l'écran. Le concept
d'auto-diagnostic est une bonne idée.

L'audit relève toutefois **52 points** (§3). **13 comportements fautifs sont reproduits** sur le
script tel quel par un banc automatisé (voir §10). Les plus importants :

| # | Constat | Conséquence |
|---|---|---|
| B1 | `log()` évalue `key.slice()` même hors debug | Une citation sans `title` fait planter le démarrage : `window.__BTC` n'existe plus et le premier passage s'arrête net. |
| B2 | Deux lignes collées dans la mauvaise fonction (`tintNotice` au lieu de `start`) | Tout le tampon d'affichage progressif est relâché d'un coup (61 lignes au lieu de 2), et le nettoyage prévu au changement de chaîne n'a jamais lieu. |
| B3 | Les gifts déjà regroupés restent dans la fenêtre de rattrapage | Un second gift multiple du même donateur affiche les destinataires du premier, et ses vrais destinataires restent visibles en vrac. |
| B4 | Onglet en arrière-plan : `requestAnimationFrame` est suspendu, l'observateur non | Rétention sans limite des lignes du chat (2 000 sur 2 000 dans le test, dont 1 850 déjà retirées du DOM), puis 30 lignes visibles jamais traitées au retour. |
| B6 | Le masquage d'un gift individuel n'est pas borné à la ligne | Pour peu qu'une notice soit un niveau moins imbriquée, c'est tout le chat qui passe en `display: none`. |
| R2 | Remplacement du conteneur du chat non détecté hors changement d'URL | Le script devient inerte en silence, et l'auto-diagnostic répond « tout va bien ». |

Échelle de sévérité :

- **Élevé** : comportement faux et visible, plantage, ou fuite mémoire dans un usage courant.
- **Moyen** : défaut visible dans un cas précis, ou coût de performance notable.
- **Faible** : cas marginal, ou dette qui rend le code fragile.
- **Info** : remarque sans défaut.

La mention *conditionnel* signale un défaut certain dans le code, mais qui ne se déclenche que
pour une forme de DOM que Twitch n'a peut-être pas aujourd'hui.

---

## 2. Méthode

1. **Lecture intégrale** du fichier, ligne à ligne : JS, CSS généré, commentaires.
2. **Analyse statique** avec ESLint 10 (`no-unused-vars`, `no-use-before-define`,
   `no-shadow`, `prefer-const`) et une recherche de chaque symbole pour repérer le code mort.
3. **Reproduction dynamique** dans Chromium 157 avec Playwright. Le script d'origine est
   chargé sans modification sur une page qui imite le DOM du chat, construite à partir des
   ancres que le script documente lui-même (L29-L38). Aucun accès réseau.
4. **Contre-épreuve** : chaque test a aussi été lancé sur une copie corrigée, non publiée,
   pour vérifier qu'il passe au vert quand le défaut est réparé. Le banc distingue donc bien
   un code fautif d'un code correct ; ce n'est pas un test toujours rouge.

**Limite.** Je n'ai pas eu accès au DOM réel de Twitch ni de 7TV. Les tests prouvent la
*logique* du script. Quand la gravité dépend de la forme exacte du DOM, c'est indiqué.

---

## 3. Tableau de synthèse

| ID | Sévérité | Catégorie | Constat | Preuve |
|---|---|---|---|---|
| B1 | Élevé | Bug | `log()` plante sur une citation sans `title` | banc B1, B1b |
| B2 | Élevé | Bug | `arreterGlissement(); relacherTout();` mal placés | banc B2 |
| B3 | Élevé | Bug | Gifts successifs du même donateur mal regroupés | banc B3 |
| B4 | Élevé | Bug / mémoire | Onglet masqué : tampon sans limite et lignes perdues | banc B4 |
| B5 | Moyen | Bug | Traduction et détection appliquées au texte écrit par l'abonné | banc B5 |
| B6 | Élevé (conditionnel) | Bug | Le masquage d'un gift peut viser la racine du chat | banc B6 |
| B7 | Faible (conditionnel) | Bug CSS | `:not(:has())` n'exclut pas le message joint | banc B7 |
| B8 | Faible | Bug | `messageBatchMs` > 1 image : le rattrapage ralentit | lecture |
| B9 | Faible | Bug | `vitesseContenu` jamais remis à zéro | lecture |
| R1 | Moyen | Robustesse | Tout changement d'URL détruit l'état, même sans changer de chat | banc R1 |
| R2 | Élevé | Robustesse | Conteneur remplacé sans changement d'URL non détecté | banc R2 |
| R3 | Faible | Robustesse | Attribut d'étiquette 7TV non observé | banc R3 |
| R4 | Moyen | Robustesse | Couleurs blanches en dur : thème clair illisible | lecture |
| R5 | Faible | Robustesse | Nœuds gérés par React ou Vue modifiés en place | lecture |
| R6 | Faible | Robustesse | Analyse des couleurs limitée à `rgb()` / `rgba()` | Chromium |
| R7 | Faible | Robustesse | Index des pseudos : clés incohérentes, couleur figée | lecture |
| R8 | Faible | Robustesse | Repli structurel du scroller jamais réévalué | lecture |
| R9 | Moyen | Robustesse | File plafonnée à 120 avec abandon silencieux | lecture + banc B4 |
| R10 | Faible | Robustesse | Aucune garde contre une double instance | lecture |
| P1 | Moyen | Performance | Nos propres `classList.add` relancent `getComputedStyle` | banc P1 |
| P2 | Moyen | Performance | Liste des destinataires reconstruite en O(n²) | banc P2 |
| P3 | Moyen | Performance | Pipeline complet pour chaque nœud ajouté, y compris les nôtres | banc P2 |
| P4 | Faible | Performance | Lectures et écritures DOM entrelacées, deux boucles rAF | lecture |
| P5 | Faible | Performance | Index d'emotes et de pseudos en FIFO, pas en LRU | lecture |
| P6 | Info | Performance | Micro-optimisations | lecture |
| M1 à M10 | Faible / Info | Code mort | 10 groupes d'éléments jamais lus ou inatteignables | ESLint, grep |
| Q1 à Q7 | Faible / Info | Maintenabilité | Commentaires déplacés, usages avant définition, doublons | ESLint, lecture |
| D1 à D4 | Faible | Outils de debug | Auto-diagnostic et outils console incomplets | lecture |
| S1 à S6 | Info à Moyen | Sécurité / distribution | Canal de mise à jour, protection de `prod`, exposition | lecture |

---

## 4. Bugs

### B1 — `log()` plante sur une citation sans `title` · Élevé

**Où** : [L1184](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L1184),
[L1168-L1175](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L1168-L1175),
[L977](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L977),
[L222](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L222).

**Constat.** `processReply` gère explicitement le cas où la citation n'a pas d'attribut
`title` (`key === null`, L1172-L1174), puis termine par `log('réponse traitée', key.slice(0, 60))`.
Les arguments d'une fonction sont évalués *avant* l'appel. `key.slice` est donc exécuté même
quand `CONFIG.debug` vaut `false`, et lève `TypeError: Cannot read properties of null`.
Le seul chemin de code prévu pour ce cas plante donc à coup sûr.

**Preuve** (banc B1, B1b) : avec une ligne de ce type déjà présente au chargement,
`window.__BTC` vaut `undefined` et la réponse suivante n'est pas traitée. Après le
démarrage, chaque ligne de ce type produit `[BTC] échec du traitement TypeError…`.

**Impact.** Au démarrage, l'exception remonte de `processLine(root)` à `start()`, puis à
`connect()`, puis au corps de l'IIFE :

- le passage initial s'arrête : les lignes suivantes ne sont jamais traitées ;
- `scheduleSelfCheck()` n'est jamais appelé ;
- `window.__BTC` n'est jamais défini, et le bandeau de version n'est pas affiché.

Le déclencheur est aussi plus large qu'il n'y paraît. `findReplyParts` (L977) accepte *n'importe
quel* `<p>` dans le premier enfant non vide du conteneur. Le jour où Twitch place là un autre
bloc contenant un `<p>` (bandeau de premier message, épinglage…), la ligne sera prise pour une
réponse, teintée comme telle, et plantera.

**Correction.**
```js
log('réponse traitée', (key || '').slice(0, 60));   // ou : if (CONFIG.debug) log(…)
const quote = slot.querySelector('p[title]');         // L977 : une citation a toujours son title
```
Entourer aussi le `processLine(root)` de `start()` d'un `try/catch`, comme `flush()` le fait
déjà.

### B2 — Deux lignes collées dans la mauvaise fonction · Élevé

**Où** : [L1306-L1309](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L1306-L1309)
(dans `tintNotice`) et [L1898](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L1898)
(dans `start`).

**Constat.** `arreterGlissement(); relacherTout();` se trouvent dans `tintNotice`, à l'intérieur
du bloc qui applique enfin la couleur de chaîne aux notices restées grises. Ces deux appels
n'ont rien à voir avec la teinte des notices. Plusieurs indices montrent qu'ils étaient destinés
à `start()` :

- leur indentation (8 espaces) est celle du corps de `start()`, pas celle du bloc où ils se
  trouvent (16 espaces) ;
- ils suivent `cartesNeutres.clear();`, ligne qui existe aux deux endroits (L1306 et L1898).
  Une insertion « après `cartesNeutres.clear();` » a manifestement atterri sur la première
  occurrence ;
- `relacherTout` n'a **aucun autre appelant** dans tout le fichier.

**Preuve** (banc B2). On insère 60 messages et une notice colorée. Dans l'image qui suit, le
témoin relâche **2** lignes. Si une notice grise est passée avant (série de visionnage),
**61** lignes surgissent d'un coup.

**Impact.**
1. *Ce qui arrive* : dès qu'une notice neutre précède la première notice colorée (fréquent
   en début de session), l'affichage progressif lâche tout son tampon d'un coup. C'est
   exactement le paquet que la fonction doit éviter. La mesure de vitesse du glissement est
   aussi remise à zéro.
2. *Ce qui n'arrive pas* : `start()` ne nettoie ni les lignes en attente ni le glissement du
   chat précédent lors d'une navigation SPA.

**Correction** : déplacer les deux lignes dans `start()`, juste après `cartesNeutres.clear();`
(L1898).

### B3 — Deux gifts multiples successifs du même donateur · Élevé

**Où** : [L1377-L1381](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L1377-L1381),
[L1386-L1394](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L1386-L1394),
[L1457-L1465](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L1457-L1465).

**Constat.** Chaque gift individuel est poussé dans `gifts.recent` *avant* d'être absorbé, et
n'en ressort jamais : seule l'ancienneté (15 s) l'en retire. Quand `open()` s'exécute pour un
second gift multiple du même donateur, il ré-absorbe donc les destinataires du premier.

**Preuve** (banc B3). « xavier offre 2 abonnements » arrive, puis alice et bob. Un second
« xavier offre 2 abonnements » arrive ensuite. Sa liste affiche immédiatement **alice, bob**
et se déclare complète, si bien que carol et dave, ses vrais destinataires, restent visibles en
notices séparées (2 sur 2).

**Impact** : information fausse affichée. Le scénario est courant : les gros donateurs
enchaînent souvent plusieurs gifts multiples en quelques secondes.

**Correction** : retirer de `recent` un gift dès qu'il est absorbé.
```js
// dans absorb(), après line.classList.add('btc-hidden')
this.recent = this.recent.filter((g) => g.line !== line);
```

### B4 — Onglet en arrière-plan : tampon sans limite, lignes jamais traitées · Élevé

**Où** : [L1834-L1846](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L1834-L1846)
(`differerAffichage`), [L1865-L1872](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L1865-L1872)
(`enqueue`), [L1589](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L1589).

**Constat.** Dans un onglet masqué, Chrome n'appelle plus les callbacks de
`requestAnimationFrame`, alors que le `MutationObserver` continue de recevoir chaque message :

- `enAttenteAffichage` grossit sans plafond. Chaque ligne y reste avec tout son sous-arbre,
  même après que Twitch l'a retirée de son tampon ;
- `flush()` ne s'exécute jamais, et `queue` ne garde que les 120 derniers nœuds
  (`queue.shift()`). Les autres ne seront jamais traités.

**Preuve** (banc B4, avec `document.hidden` et rAF suspendus). Après 2 000 réponses reçues,
`lignesEnAttente` vaut **2 000**, dont environ 1 850 déjà retirées du DOM. Au retour au premier
plan, **30 des 150 réponses visibles** ne sont jamais mises en forme.

**Impact** : l'usage visé est très courant (écouter un stream dans un onglet en arrière-plan).
La mémoire croît linéairement avec l'activité du chat tant que l'onglet reste masqué, et une
partie de l'historique visible reste brute au retour.

**Correction.**
- Ne rien différer quand `document.hidden`.
- Planifier `flush` par `setTimeout` quand l'onglet est masqué.
- Sur `visibilitychange` → masqué : appeler `relacherTout()`.
- Garder en plus un plafond dur sur `enAttenteAffichage` : au-delà, tout relâcher.

### B5 — Traduction et détection appliquées au texte écrit par l'abonné · Moyen

**Où** : [L1191-L1205](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L1191-L1205)
(`translateNotice`), [L1477-L1478](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L1477-L1478).

**Constat.** Le `TreeWalker` parcourt *tous* les nœuds texte de la notice, y compris le message
personnel imbriqué (`.chat-line__message`, `resubCustom`). Les 13 règles de `NOTICE_FR` et le
nettoyage de ponctuation s'appliquent donc à ce que la personne a écrit. De même,
`processGiftNotice` teste ses expressions sur `notice.textContent`, message compris.

**Preuve** (banc B5) : `I redeemed my points in Dave's channel !` devient
**`I a utilisé my points!`**.

**Impact** : des propos sont altérés sans le moindre signe. Le nettoyage `\s+([.,!?])` retire en
plus l'espace avant `!` et `?`, contrairement à la typographie française. Côté gifts, une phrase
comme « gifted a sub to » dans un message de réabonnement suffit à entrer dans le chemin
« gift individuel ». Seule l'absence d'un second pseudo empêche alors l'erreur.

**Correction** : un filtre `acceptNode` qui rejette les nœuds situés sous
`${SEL.nestedMessage},${SEL.resubCustom}`, et un texte d'analyse calculé sans le message joint.

### B6 — Le masquage d'un gift individuel peut viser la racine du chat · Élevé (conditionnel)

**Où** : [L1453-L1455](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L1453-L1455),
à comparer à la garde de [L1329](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L1329).

**Constat.** La ligne à masquer est
`notice.closest('.btc-notice-card')?.parentElement || notice.parentElement`, sans aucune garde.
`compactNotice` se protège explicitement contre une notice enfant directe de la racine
(L1329 : « jamais la racine du chat »). `processGiftNotice` ne le fait pas : dans ce cas précis,
ou si la carte est elle-même enfant direct de la racine, `.btc-hidden` atterrit sur le conteneur
du chat.

**Preuve** (banc B6) : dans les deux configurations, la racine du chat passe à
`display: none` au premier gift absorbé.

**Impact** : tout le chat disparaît pendant un gift multiple. Cela dépend de la profondeur
d'imbrication de Twitch : aujourd'hui elle convient sans doute, puisque l'auteur l'a observée,
mais il suffirait d'un niveau d'enveloppe en moins. Comportement incohérent aussi quand
`compact.enabled` vaut `false` : c'est alors la carte qui est masquée, pas l'enveloppe.

**Correction** : remonter jusqu'à l'enfant direct de `chatRoot`, jamais au-delà.
```js
let line = notice;
while (line.parentElement && line.parentElement !== chatRoot) line = line.parentElement;
if (line.parentElement !== chatRoot) return;
```

### B7 — `:not(:has())` n'exclut pas le message joint · Faible (conditionnel)

**Où** : [L617-L621](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L617-L621).

**Constat.** `div:not(:has(.chat-line__message))` exclut les *ancêtres* du message joint, mais
pas le message lui-même (un `div`), ni ses `div` intérieurs. Les variantes
`p:not(.chat-line__message)` et `span:not(…)` n'exemptent que la racine du message, pas ce
qu'elle contient. Les commentaires se contredisent d'ailleurs :
[L517-L524](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L517-L524)
affirment que le message « vit hors du bloc de texte », alors que L613-L616 justifient une
exception pour lui.

**Preuve** (banc B7) : message joint placé dans le bloc texte → `display: inline`.
Placé hors du bloc → `block`.

**Correction** : `:not(X):not(X *)` sur les trois sélecteurs. Ou supprimer l'exception si le
message est garanti hors du bloc, et aligner les commentaires.

### B8 — `messageBatchMs` supérieur à une image : rattrapage ralenti · Faible

**Où** : [L1819-L1828](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L1819-L1828).

`parImage` est calculé avec `dt`, la durée d'*une image*, et non avec le temps écoulé depuis le
dernier relâchement. Avec `messageBatchMs = 100`, on relâche toutes les 6 images environ, mais
en quantité calculée pour une seule : la résorption est environ 6 fois plus lente que les
400 ms annoncées. La valeur par défaut (1) n'est pas touchée.
**Correction** : `const ecoule = maintenant - dernierRelache` avant la mise à jour, puis utiliser
`ecoule` à la place de `dt`.

### B9 — `vitesseContenu` jamais remis à zéro · Faible

**Où** : [L1635](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L1635),
[L1638-L1641](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L1638-L1641).

`arreterGlissement` remet `hauteurPrecedente` à zéro, mais pas la vitesse lissée. Un glissement
qui démarre longtemps après une rafale hérite donc d'une vitesse obsolète, et ses premières
images sont trop rapides. Même chose d'une chaîne à l'autre.
**Correction** : remettre `vitesseContenu = 0` dans `arreterGlissement` ou dans `start`.

---

## 5. Robustesse

### R1 — Tout changement d'URL détruit l'état · Moyen

**Où** : [L1947-L1972](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L1947-L1972),
[L1421-L1425](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L1421-L1425).

`onChange` compare `location.href` en entier. Une simple query string, un `#`, ou le passage à
« À propos » ou « Vidéos » sur la *même* chaîne déclenchent `teardown()` :

- `gifts.reset()` vide les gifts en cours sans les fermer. La liste reste figée en style
  « en attente » (italique, opacité 0,6) pour toujours, et les gifts suivants ne sont plus
  regroupés ;
- l'index d'emotes est vidé ;
- l'observateur est coupé pendant 600 ms ou plus.

**Preuve** (banc R1) : après `replaceState('?ref=test')`, la liste reste en attente, aucun gift
n'est suivi, et le gift suivant reste visible.
**Correction** : ne réinitialiser que si la chaîne change (premier segment du chemin) ou si le
conteneur du chat a changé (voir R2). Dans `reset()`, appeler `close()` sur chaque entrée.

### R2 — Conteneur du chat remplacé sans changement d'URL · Élevé

**Où** : [L1893-L1942](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L1893-L1942),
[L1530-L1570](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L1530-L1570).

Le script ne se reconnecte que sur un changement d'URL. Si React remonte le composant du chat
(repli puis réouverture de la colonne, mode cinéma, reconnexion), l'observateur reste branché
sur un arbre détaché : plus rien n'est traité, sans aucun message. Deux aggravants :

- `runSelfCheck` interroge `chatRoot` sans vérifier `isConnected`. Sur l'arbre détaché, toutes
  les ancres répondent encore, et il conclut `ok: true` ;
- `connect()` est lancé 600 ms après le changement d'URL. Si l'ancienne racine est encore dans
  le DOM à ce moment-là, sur une machine ou un réseau lent, c'est elle qui est retenue.

**Preuve** (banc R2) : réponse dans le nouveau conteneur jamais traitée, et `selfCheck().ok`
vaut `true`.
**Correction** : vérifier `chatRoot.isConnected`, par exemple chaque seconde ou à chaque
`flush`, puis reconnecter. Ajouter la même vérification à l'auto-diagnostic.
**Confiance** : le défaut est certain dans le code. Sa fréquence réelle (quelles actions de
Twitch remontent le chat) reste à observer.

### R3 — Étiquette 7TV non observée · Faible

**Où** : [L1904](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L1904).

`attributeFilter` ne contient pas `data-seventv-custom-highlight-label`. L'étiquette n'est retirée
que si 7TV modifie `class` ou `data-seventv-processed` dans la même passe.
**Preuve** (banc R3) : l'attribut posé seul reste en place.
**Correction** : ajouter `HIGHLIGHT_LABEL_ATTR` au filtre. Le retrait est déjà idempotent
(commentaire L1089-L1093), donc aucun risque de boucle.

### R4 — Couleurs blanches en dur : thème clair illisible · Moyen

**Où** : [L711-L720](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L711-L720),
[L97](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L97),
L66, L68, L732.

Plusieurs couleurs sont fixées en blanc semi-transparent :

- liste des destinataires d'un gift : `hsla(0,0%,100%,.72)` ;
- virgules entre destinataires : `.45` ;
- filet de repli des réponses : `.4` ;
- teintes des réponses et des cartes, séparateurs.

Sur le thème clair de Twitch, la liste des destinataires devient quasi invisible (blanc sur
blanc) et le filet disparaît. Le script utilise pourtant déjà les variables de thème de Twitch
ailleurs (`--color-text-base`, L696).
**Correction** : `currentColor` avec une opacité, ou les variables de thème Twitch. À défaut,
des variantes claires sous le sélecteur de thème de Twitch, dont le nom est à vérifier.

### R5 — Nœuds gérés par React ou Vue modifiés en place · Faible

**Où** : [L1049](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L1049),
[L1214](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L1214),
L1059, L1203.

`tokenizeQuote` remplace des nœuds texte rendus par React (`replaceChild`).
`translateSystemNotice` écrase le contenu d'un élément rendu par 7TV (`textContent`), ce qui
détruit au passage un éventuel pseudo coloré. Si l'un de ces frameworks met à jour la ligne
*en place*, il travaille sur des nœuds détachés (mise à jour perdue) ou lève `NotFoundError`
au `removeChild`, ce qui peut casser son rendu. Le risque est faible aujourd'hui, car les lignes
sont surtout démontées d'un bloc, mais c'est une classe de bug connue des userscripts.
**Piste** : envelopper plutôt que remplacer, ou masquer l'original et insérer un clone à côté.

### R6 — Analyse des couleurs limitée à `rgb()` / `rgba()` · Faible

**Où** : [L1073-L1074](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L1073-L1074),
[L1128-L1135](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L1128-L1135),
L1273.

Vérifié dans Chromium 157 : une couleur `color-mix(…)` est calculée en `color(srgb … / 0.3)`, et
une couleur `oklch(…)` reste en `oklch(…)`. La regex `rgba?\(` ne les reconnaît pas, donc ni
accent ni teinte. Par ailleurs, `isTransparent` ne reconnaît que `rgba(0, 0, 0, 0)` :
`rgba(255, 0, 0, 0)` est jugé opaque. La branche « fond » de `applyGradeAccent` ne teste pas
l'alpha, et fabriquerait donc un filet rouge à 0,85 à partir d'une couleur invisible.
**Correction** : une fonction de lecture de couleur unique, qui renvoie `[r, g, b, a]` et traite
alpha = 0 comme transparent, quel que soit le format.

### R7 — Index des pseudos : clés incohérentes, couleur figée · Faible

**Où** : [L873-L883](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L873-L883),
[L920-L929](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L920-L929).

- L'index est rempli par *login* (`data-a-user`) mais consulté, pour les notices, par *nom
  affiché* en minuscules. Les pseudos internationaux ne se rejoignent jamais, et l'attente
  dans `pendingNoticeNames` n'est jamais servie. C'est connu (commentaire L917-L919), mais un
  double index login + nom affiché suffirait.
- La première couleur vue est conservée (`if (nameColors.has(login)) continue`) : un changement
  de couleur en cours de session est ignoré.
- `couleurJointe` (couleur de l'auteur du message joint) est appliquée à *tous* les pseudos de
  la notice, pas seulement au sien.

### R8 — Repli structurel du scroller jamais réévalué · Faible

**Où** : [L1736-L1753](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L1736-L1753).

`trouverScroller` renvoie l'élément nommé même s'il ne défile pas encore (chat pas assez
rempli), et `getScroller` le garde tant qu'il est connecté. Or `start()` l'appelle tout de
suite, chat quasi vide : le repli « premier ancêtre qui défile » n'est donc pratiquement jamais
atteignable.

### R9 — File plafonnée à 120 avec abandon silencieux · Moyen

**Où** : [L1865-L1867](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L1865-L1867).

Au-delà de 120 nœuds dans une même image, le plus ancien est jeté sans être traité, quel qu'il
soit. Or la file reçoit aussi nos propres nœuds (P3) : un gift de 100 en produit des milliers
(P2). Une vraie ligne, ou une notice de gift, peut donc être évincée par nos propres spans. Elle
ne sera alors ni mise en forme ni regroupée. Le cas « onglet masqué » est mesuré en B4.
**Correction** : filtrer nos nœuds (P3), dédoublonner, et remplacer le plafond par un
`processLine(chatRoot)` de rattrapage s'il est atteint.

### R10 — Aucune garde contre une double instance · Faible

Si le script tourne deux fois (deux gestionnaires, ou deux installations après un changement de
`@name` ou `@namespace` lors de la migration, voir S2), les marqueurs posés dans le DOM évitent
la plupart des doubles traitements. Il reste cependant :

- deux observateurs et deux boucles d'animation ;
- deux enveloppes sur `history.pushState` ;
- surtout, chaque boucle tient son propre `dernierEcrit` : les écritures de défilement de
  l'autre passent pour des gestes de lecture et interrompent son glissement.

**Correction** : `if (window.__BTC) return;` en tête de l'IIFE.

---

## 6. Performance

### P1 — Nos propres `classList.add` relancent `applyGradeAccent` · Moyen

**Où** : [L1159](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L1159),
[L1882-L1889](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L1882-L1889).

`processReply` appelle `applyGradeAccent` (`getComputedStyle`, donc un recalcul de style
forcé), puis ajoute `btc-reply`. Cet ajout est vu par notre propre observateur d'attributs, qui
rappelle `applyGradeAccent`. De plus, `classList.add` d'une classe **déjà présente** émet quand
même un enregistrement de mutation (vérifié : 1 enregistrement), donc chaque retraitement
relance le cycle.
**Preuve** (banc P1) : **200** appels à `getComputedStyle` pour 100 réponses, contre 100
nécessaires.
**Correction** : `attributeOldValue: true`, puis ne recalculer que si `btc-reply` figurait déjà
dans l'ancienne valeur, ce qui signifie que c'est 7TV qui a changé la classe. Ou poser un drapeau
pendant nos propres écritures.

### P2 — Liste des destinataires reconstruite en O(n²) · Moyen

**Où** : [L1396-L1410](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L1396-L1410).

`render()` vide la liste puis recrée tous les `<span>` à chaque destinataire. Chaque span ajouté
repasse ensuite par tout le pipeline de l'observateur.
**Preuve** (banc P2), pour un gift de 100 : **5 050** spans créés au lieu de 100, et **2 750**
`querySelectorAll` lancés sur nos propres spans. Cela arrive au pire moment, quand le chat est
déjà en rafale.
**Correction** : n'ajouter que les nouveaux destinataires
(`recipients.slice(listEl.childElementCount)`), et voir P3.

### P3 — Pipeline complet pour chaque nœud ajouté · Moyen

**Où** : [L1484-L1512](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L1484-L1512),
[L1874-L1881](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L1874-L1881).

Tout élément ajouté n'importe où sous la racine passe par `processLine`, soit 5
`querySelectorAll` et 3 `matches`. C'est le cas des décorations de 7TV, mais aussi de nos
propres insertions (emotes et mentions de citation, liste des gifts). Aucun dédoublonnage : une
ligne et ses descendants ajoutés dans la même image sont parcourus plusieurs fois.
**Correction** :
1. ignorer nos propres nœuds (classe `btc-*`, ou un `WeakSet` des éléments créés) ;
2. ignorer un nœud dont un ancêtre est déjà dans le lot ;
3. remplacer les cinq requêtes par une seule, sur un sélecteur combiné, et répartir les
   résultats avec `matches`.

### P4 — Lectures et écritures DOM entrelacées, deux boucles rAF · Faible

`flush` lit la géométrie (`mesurerCollage`), puis, pour chaque ligne, écrit des classes et lit le
style calculé (`applyGradeAccent`, `tintNotice`). Chaque lecture après une écriture force un
recalcul : N recalculs pour N lignes. Dans la même image, `avancerBoucle`, un second callback
rAF, relit la géométrie.
**Piste** : une seule boucle rAF qui fait d'abord toutes les lectures (style, géométrie), puis
toutes les écritures, puis le défilement.

### P5 — Index en FIFO plutôt qu'en LRU · Faible

**Où** : [L841-L848](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L841-L848),
[L879-L882](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L879-L882).

`Map.set` sur une clé existante ne la déplace pas. Les emotes les plus fréquentes de la chaîne,
vues en premier, sont donc les *premières* évincées quand l'index atteint 600 entrées.
**Correction** : `delete` puis `set` à chaque consultation réussie.

### P6 — Micro-optimisations · Info

Gains négligeables pris un par un, listés pour être complet :

- L1199-L1202 : `re.test()` puis `replace()` balayent deux fois. Un `replace()` seul suffit,
  et les remises à zéro de `lastIndex` disparaissent avec.
- L1363 : `[...this.pending.keys()][0]` peut devenir `this.pending.keys().next().value`.
- L1294, L1302, L1311 : `accentChaine` est stocké en chaîne puis réanalysé à chaque usage.
  Mieux vaut stocker le tableau.
- L1499 : la fermeture `isTwitchNotice` est recréée à chaque appel de `processLine`.
- L1126 : le test de bordure recalcule ce que `barreNative` contient déjà (L1108).
- L1013 et L1021 : `part.trim()` sur des morceaux qui ne contiennent déjà aucun espace.

---

## 7. Code mort

| ID | Où | Élément | Détail |
|---|---|---|---|
| M1 | [L242-L244](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L242-L244) | `RE.totalGifts`, `RE.subscribed`, `RE.raid` | Jamais utilisées. |
| M2 | [L354](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L354) | `const L` | Déclarée dans `buildCSS`, jamais utilisée (ESLint). |
| M3 | L1443, L1371-L1372 | `tier`, `entry.tier`, `entry.ts` | Calculés et stockés, jamais lus. `RE.tier` ne sert donc à rien. |
| M4 | [L1409](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L1409) | `if (!recipients.length) listEl.textContent = ''` | La liste vient déjà d'être vidée (L1400). |
| M5 | [L1523, L1574-L1577](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L1572-L1580) | `selfCheckDone` | Ne peut jamais valoir `true` au moment du test : `clearTimeout` et la remise à `false` précèdent chaque planification. |
| M6 | L225, L1548 | `diag.verifieA` | Écrit, jamais lu (seulement recopié dans l'objet retourné). |
| M7 | [L193](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L193) | `.seventv-chat-list` | Classe disparue d'après l'en-tête (L22-L27). Si elle correspondait encore, le reste du script, qui vise le DOM natif, ne fonctionnerait pas. |
| M8 | [L219](https://github.com/Maxezify/Betterchat-for-Twitch/blob/d054262/BetterTwitchChat.js#L219) | `.scrollable-area[data-a-target="chat-scroller"]` | Englobé par la seconde alternative. Une liste de sélecteurs n'exprime aucune priorité : `querySelector` rend le premier élément *dans l'ordre du document*. |
| M9 | L855, L872, L1886, L1491, L1888 | `try/catch` autour de `querySelectorAll` à sélecteur constant ; `nodeType` testé sur une cible d'attribut ; `?.` sur des `Element` garantis | Ne peuvent pas échouer. La valeur de retour de `stripReplyPrefix` n'est jamais lue non plus. |
| M10 | L386, L410, L439, L440, L468 | Repli `var(--btc-reply-font-scale, X)` | `:root` définit toujours la variable : le repli n'est jamais utilisé, et duplique la valeur. |

`CONFIG.separators` (désactivé par défaut) n'est **pas** du code mort : c'est une option.

---

## 8. Maintenabilité

- **Q1 — Commentaires déplacés ou périmés.**
  - L130-L132 : le commentaire de `separators` est séparé de l'option (L166) par deux blocs
    insérés depuis.
  - L1067-L1072 : la documentation de `applyGradeAccent` est posée au-dessus de
    `isTransparent`.
  - L517-L524 et L613-L616 se contredisent (voir B7).
  - L18-L20 : la consigne sur la branche de `@updateURL` ne vaut plus avec ce dépôt.
  - L1557 : le message d'auto-diagnostic renvoie à `tools/7tv-dom-recorder.user.js`, absent de
    ce dépôt.
- **Q2 — Utilisations avant définition** (10 relevées par ESLint) : `pendingNoticeNames`,
  `applyNoticeNameColor`, `onEmoteChargee`, `chatRoot`, `arreterGlissement`, `relacherTout`,
  `avancerBoucle`, `getScroller`, `relacherEnAttente`. Cela fonctionne parce que les appels
  surviennent plus tard. Un seul appel au chargement provoquerait une `ReferenceError` (zone
  morte temporelle). Regrouper l'état mutable en tête de fichier.
- **Q3 — Divers ESLint** : `el` masqué dans une boucle imbriquée (L873/L888) ; `let text`
  jamais réassigné (L1196).
- **Q4 — CSS dupliqué et nombres magiques.**
  - Deux blocs pour `.btc-notice-icon` (L486, L585) et pour la ligne imbriquée (L530, L552).
  - Le retrait de 32 px des destinataires (L711) vaut 26 px d'image plus 6 px de marge
    (L561-L564), sans que rien ne les relie.
  - `14px` et `1.5` en dur quand `quoteLook` est désactivé (L532-L533).
  - Seuil `childElementCount > 3` (L1330).
- **Q5 — Version dupliquée** (L4 et L49). Lire `GM_info.script.version`, en gardant la constante
  comme repli, ou vérifier l'accord des deux avant chaque publication.
- **Q6 — Organisation.** Un seul fichier de 2 064 lignes, dont environ un tiers de commentaires, avec une
  part d'historique (« mesuré à 1823 px », « il l'a fait »). Un `CHANGELOG.md` allégerait le
  code. Les identifiants mêlent français et anglais (`relacherTout`, `processLine`).
- **Q7 — Fins de ligne CRLF.** Elles sont conservées et protégées par `.gitattributes` dans ce
  dépôt. À garder en tête pour les éditeurs et les diffs.

---

## 9. Outils de debug, sécurité et distribution

### Outils de debug
- **D1 — `log()`.** Arguments évalués même hors debug : voir B1. Il n'existe en tout que 3
  points de journalisation. Une forme paresseuse (`log(() => […])`) éviterait le coût et le
  risque.
- **D2 — Auto-diagnostic.**
  - Un seul passage, 20 s après le démarrage, aveugle au détachement (R2).
  - Ses compteurs comptent des *appels*, pas des lignes : `diag.lignes` et `diag.reponses` sont
    incrémentés avant le contrôle d'idempotence (L1156, L1507, L1510), et gonflent à chaque
    nouveau passage ou `reload()`.
  - Son message renvoie à un outil absent (Q1).
- **D3 — `whyFontSize()`.** Ne parcourt que les règles de premier niveau. Celles placées dans
  `@media`, `@supports`, `@layer` ou `@container` sont ignorées, alors que l'une d'elles peut
  être la règle gagnante.
- **D4 — `reload()`.** Ne retraite que les citations. Les réglages JS des notices
  (`tintOpacity`, `colorNames`, `translate`) ne s'appliquent pas aux notices déjà affichées,
  marquées `data-btc-notice`.

### Sécurité et distribution
- **S1 — Positif.** Aucun `innerHTML` : tout le contenu est inséré via `textContent` et
  `createElement`. Les URL d'emotes proviennent d'images déjà présentes. Le CSS n'est construit
  qu'à partir de constantes.
- **S2 — Canal de mise à jour · Moyen.** `@updateURL` et `@downloadURL` (L11-L12) pointent sur
  l'ancien dépôt, et sur une branche de travail (`claude/twitch-chat-7tv-userscript-1hh5y8`) :
  - les copies installées ne se mettront pas à jour depuis ce dépôt ;
  - si cette branche est supprimée, les mises à jour s'arrêtent en silence.

  Au moment de basculer :
  - pointer sur `https://raw.githubusercontent.com/Maxezify/Betterchat-for-Twitch/prod/BetterTwitchChat.user.js` ;
  - renommer le fichier en `.user.js`, pour que le gestionnaire propose l'installation en un
    clic ;
  - **garder `@name` et `@namespace` inchangés**, faute de quoi le gestionnaire installe un
    second script (voir R10) ;
  - éventuellement, publier un `.meta.js` léger pour la vérification des mises à jour.
- **S3 — Protéger `prod`.** Avec `@grant none`, le script s'exécute dans le contexte de
  twitch.tv : il a accès à tout ce qu'un script de la page peut lire. Tout commit sur la branche
  de mise à jour est distribué automatiquement à toutes les installations. Il faut donc une
  règle de protection sur `prod` : pas de force-push, fusion par pull request depuis `dev`.
- **S4 — `window.__BTC`.** Expose `CONFIG` et l'état interne à tout script de la page.
  Acceptable pour un outil de diagnostic ; on peut le réserver au mode debug.
- **S5 — `@noframes` absent.** Le script tourne aussi dans les iframes `www.twitch.tv`, comme le
  chat intégré, avec une instance par cadre. À trancher selon l'usage voulu.
- **S6 — `@icon`.** L'icône est servie par le service de favicons de Google, que le gestionnaire
  interroge. Remarque mineure de confidentialité.

---

## 10. Banc de reproduction

> Historique. Ce banc, `audit/repro.js`, a servi à l'audit. Il est remplacé par la suite
> `tests/` (voir §0) : `npm install`, puis `npm test` pour la copie de travail, ou
> `npm run test:prod` pour la branche `prod`.

Le banc chargeait `BetterTwitchChat.js` sans modification dans Chromium, sur un DOM
simulé, et affichait pour chaque constat `BUG PRÉSENT` ou `OK`.

Résultat sur la v15.24.0 :

```
BUG PRÉSENT  B1   window.__BTC=undefined, réponse suivante traitée=false
BUG PRÉSENT  B1b  [BTC] échec du traitement TypeError: Cannot read properties of null (reading 'slice')
BUG PRÉSENT  B2   lignes relâchées dans l'image : témoin=2, après une notice grise=61
BUG PRÉSENT  B3   liste du 2e gift="alice, bob", gifts du 2e lot restés visibles=2/2
BUG PRÉSENT  B4   lignes retenues en arrière-plan=2000 (~1850 hors DOM), réponses jamais traitées=30/150
BUG PRÉSENT  B5   message de l'abonné devenu : "I a utilisé my points!"
BUG PRÉSENT  B6   display de la racine du chat : none / none
BUG PRÉSENT  B7   display du message joint : dans le bloc texte=inline, hors du bloc=block
BUG PRÉSENT  P1   getComputedStyle pour 100 réponses = 200
BUG PRÉSENT  P2   spans créés pour 100 destinataires=5050 ; querySelectorAll sur nos spans=2750
BUG PRÉSENT  R1   liste toujours « en attente », gifts suivis=0, gift suivant masqué=false
BUG PRÉSENT  R2   réponse dans le nouveau conteneur traitée=false, selfCheck().ok=true
BUG PRÉSENT  R3   attribut toujours présent=true

13/13 comportement(s) fautif(s) reproduit(s).
```

Une copie corrigée passait les 13 tests au vert. Ces cas sont repris, avec les mêmes
identifiants, dans `tests/cas.js`.

---

## 11. Plan d'action proposé

À mener sur `dev`. Chaque étape : banc au vert, essai manuel sur une vraie chaîne, puis fusion
dans `prod`.

1. **Correctifs immédiats**, quelques lignes chacun : B1, B2, B3, B6, R3, puis le nettoyage
   M1 à M10.
2. **Fiabilité** : B4 (onglet masqué), R2 et R1 (détection du conteneur et navigation), R9.
3. **Performance** : P1, P2, P3, puis P4 si le gain se mesure (onglet Performance de DevTools
   pendant un gift multiple).
4. **Rendu** : R4 (thème clair), B5, B7, R6.
5. **Distribution**, quand la v15.25 sera prête : S2 (bascule des URL de mise à jour et du nom de
   fichier) et S3 (protection de `prod`).
