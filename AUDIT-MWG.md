# Audit de BetterTwitchChat v15.26.3 selon Modern Web Guidance

| | |
|---|---|
| Fichier audité | [`BetterTwitchChat.user.js`](https://github.com/Maxezify/Betterchat-for-Twitch/blob/116d3a7/BetterTwitchChat.user.js) au commit `116d3a7` (branche `dev`) |
| Taille | 4 190 lignes, 215 257 octets, fins de ligne CRLF |
| Empreinte | sha256 `51f1577a8f5f2684b38899c744641b2ab6a49a4e0efaed99cd2750401c9d3205` |
| Référentiel | [Modern Web Guidance](https://github.com/GoogleChrome/modern-web-guidance-src) : outil `modern-web-guidance` 1.0.1 (npm), dépôt source au commit `634d0f8` du 20 novembre 2026 |
| Date | 21 novembre 2026 |
| Reproduction | [`tests/reproduction-mwg.js`](tests/reproduction-mwg.js) : `npm run audit:mwg` |

Les numéros de ligne (`L2728`) renvoient à cette version ; chaque lien ouvre la ligne sur
GitHub. Les identifiants (G1, G2…) sont propres à cet audit. Les règles citées le sont dans
la langue du guide, entre guillemets.

---

## 1. En bref

Le script est à jour sur le **JavaScript moderne** et sur l'essentiel de la plateforme :
`structuredClone`, `replaceChildren`, aucun `innerHTML`, `TreeWalker`, shadow DOM ouvert,
`ResizeObserver`, écouteurs passifs, `:focus-visible`, `accent-color`, `color-mix()`,
`:has()`, préférences de mouvement respectées dans le CSS, emotes en `loading="lazy"` avec
`aspect-ratio`, presse-papiers asynchrone avec repli. L'outil `legacy-scan` du guide ne
relève que **2 lignes** (copies de tableaux avant `sort()`/`reverse()`). Aucune tâche
longue : changer un réglage sur un chat de 500 entrées prend 14 ms (médiane), loin des 50 ms
du guide.

Les écarts se concentrent sur **l'accessibilité et les thèmes**, que `legacy-scan` ne couvre
pas. L'audit relève **28 points** : 10 moyens, 12 faibles, 6 remarques. S'y ajoutent
7 recommandations du guide jugées non transposables à un userscript (§6) et une liste de
points conformes (§7). **17 écarts sont reproduits** dans Chromium par
`tests/reproduction-mwg.js` (17 cas sur 18 ; le dernier, P1, cherche une tâche longue et n'en trouve pas).
Les corrections des deux écarts en contrastes forcés ont été vérifiées sur une copie.

| # | Constat | Conséquence |
|---|---|---|
| G2 | Le texte cité et les notices discrètes sont en `#8f8f9a` fixe | En thème clair de Twitch : 3,20:1 sur blanc et 2,71:1 sur le fond d'une réponse, pour un texte de 10,7 px. Le minimum est 4,5:1. |
| G6, G7 | La carte « Pendant ton absence » disparaît sous le focus | Fermée au clavier, ou fermée seule au bout d'une minute pendant qu'on y navigue, elle laisse le focus sur `<body>` : la navigation au clavier repart du haut de la page. |
| G4, G5 | Le mode contrastes forcés (Windows) efface deux états | Tous les onglets du panneau paraissent sélectionnés, et le point de rafale du bouton disparaît. |
| G13 | Le glissement du chat ignore « réduire les animations » | Le chat défile en douceur, image par image, même quand le système demande moins de mouvement. |
| G15 | La carte d'absence est une région live créée avec son contenu | Les lecteurs d'écran annoncent mal, ou pas du tout, une région qui apparaît déjà remplie ; et ils liraient avec le texte le nom de ses boutons. |

---

## 2. Méthode

1. **Recherche dans le catalogue.** Le script a été découpé en fonctions web (panneau non
   modal, onglets, raccourci clavier, carte de notification, thème sombre, contrastes forcés,
   presse-papiers, graphe en canevas, champs de réglage, navigation SPA, défilement, tâches
   longues, shadow DOM…). Chacune a fait l'objet d'une recherche `search` : **38 recherches**.
2. **Lecture intégrale des guides retenus** avec `retrieve` : **44 guides**, dont les guides de
   discipline `html`, `css`, `js`, `accessibility`, `forms`, `color`, `typography`, `motion`,
   `performance`, `privacy`, `security`, `web-components`, et les guides d'usage `dialog`,
   `tabs`, `persistent-toast-notifications`, `dark-mode`, `browser-ui-theming`,
   `interest-triggered-tooltips`, `copy-button`, `spatial-navigation`, `natural-interactions`…
   La référence « content scripts » du guide des extensions Chrome a aussi été lue : un
   userscript `@grant none` y ressemble beaucoup. Un guide n'a pas été lu :
   `expose-canvas-content-to-browser-features` porte sur une fonction « volatile », que l'outil
   refuse de servir sans un accord explicite du projet. Elle n'aurait de toute façon pas servi
   ici : le graphe du pouls a déjà une alternative textuelle.
3. **`legacy-scan`** sur tout le dépôt : 2 constats (G18). L'outil prévient qu'il ne couvre
   qu'environ 20 % du catalogue.
4. **Confrontation ligne à ligne** des parties concernées du script (CSS injecté, couche
   d'interface, panneau, carte d'absence, pouls, bouton, boucle de défilement).
5. **Vérification expérimentale** dans Chromium (Playwright), sur la page de test du banc :
   `tests/reproduction-mwg.js` (18 cas). Thème clair et sombre, contrastes forcés et
   mouvement réduit sont émulés. Les contrastes sont calculés selon la formule WCAG sur les
   couleurs réellement rendues.
6. **Contre-épreuves** des corrections proposées pour G4 et G5, sur une copie du script : le
   défaut disparaît en contrastes forcés, et le rendu normal reste identique (46 pixels
   d'anticrénelage diffèrent autour du point de rafale, sur une capture de 1 520 × 1 120).

**Limites.** Twitch n'est pas joignable depuis l'environnement de l'audit : trois points
dépendent de ce que fait la vraie page et sont à vérifier (§8). Aucun lecteur d'écran n'a été
lancé ; G15 et G19 reposent sur les règles du guide, pas sur une écoute. Safari n'a pas été
testé.

**Contexte pris en compte.** Le guide s'adresse à qui écrit son propre site. Un userscript
injecté dans Twitch ne choisit ni la page, ni ses en-têtes, ni sa feuille de style, et ne
peut pas charger de code externe (pas de polyfill depuis un CDN). Une recommandation qui ne
vaut que pour un site, ou qui exige un polyfill, est classée en §6 avec sa raison.

---

## 3. Tableau de synthèse

| # | Sévérité | Catégorie | Constat | Guide | Preuve |
|---|---|---|---|---|---|
| G1 | Moyen | Thème | Pas de `color-scheme` : contrôles natifs clairs sur le thème sombre | `dark-mode`, `color`, `browser-ui-theming` | cas G1, capture |
| G2 | Moyen | Contraste | Texte cité et notices discrètes à 3,20:1 en thème clair | `color` | cas G2 |
| G3 | Faible | Contraste | Alerte du panneau à 3,87:1 en thème clair | `color` | cas G3 |
| G4 | Moyen | Contrastes forcés | Tous les onglets paraissent sélectionnés | `tabs`, `color` | cas G4, capture, contre-épreuve |
| G5 | Moyen | Contrastes forcés | Point de rafale invisible | `tabs`, `color` | cas G5, capture, contre-épreuve |
| G6 | Moyen | Focus | Carte d'absence fermée au clavier : focus sur `<body>` | `html`, `persistent-toast-notifications` | cas G6 |
| G7 | Moyen | Focus | Carte d'absence fermée seule pendant qu'on y navigue | `persistent-toast-notifications` | cas G7 |
| G8 | Faible | Focus | « Activer le pouls du chat » retiré sous le focus | `html` | cas G8 |
| G9 | Moyen | Langue | Interface française sans `lang="fr"` | `accessibility`, `html` | cas G9 |
| G10 | Faible | Sémantique | Bouton du panneau sans `aria-expanded` ; raccourci seulement en infobulle | `accessibility`, `html` | cas G10 |
| G11 | Faible | Formulaires | 7 aides de réglage non reliées à leur champ | `accessibility`, `forms` | cas G11 |
| G12 | Faible | Clavier | Flèches des onglets actives avec Alt, sans `preventDefault` | `spatial-navigation` | cas G12 |
| G13 | Moyen | Mouvement | Glissement du chat malgré « réduire les animations » | `motion` | cas G13 |
| G14 | Faible | Sémantique | Panneau en `role="region"` titré par un `<strong>` | `dialog`, `accessibility` | cas G14 |
| G15 | Moyen | Annonces | Carte d'absence : région live créée avec son contenu | `persistent-toast-notifications` | cas G15 |
| G16 | Moyen | Notifications | Résumé d'absence introuvable une fois la carte fermée | `persistent-toast-notifications` | cas G16 |
| G17 | Faible | Typographie | Interface en `px` : ne suit pas la taille de police de la page | `typography` | cas G17, à vérifier |
| G18 | Faible | JavaScript | `[...a].sort()` et `[...a].reverse()` au lieu de `toSorted()`/`toReversed()` | `js` | `legacy-scan` |
| G19 | Faible | Sémantique | Listes `list-style: none` + grille sans `role="list"` (Safari) | `accessibility` | lecture |
| G20 | Faible | Sémantique | Faux titres dans la carte d'absence | `accessibility` | lecture |
| G21 | Faible | Annonces | Retour « Copiée » non annoncé ; minuterie non annulée | `copy-button` | lecture |
| G22 | Faible | Clavier | Rafale : message joint révélé au survol seulement | `natural-interactions` | lecture |
| G23 | Info | Clavier | Fil de conversation au survol seulement | `natural-interactions` | lecture |
| G24 | Info | Mise en page | `100vh` au lieu de `100dvh` | `responsive-design` | lecture |
| G25 | Info | Sémantique | `aria-controls` sur les onglets, inutile | `tabs` | lecture |
| G26 | Info | Typographie | Légendes en capitales de 11 px | `typography` | lecture |
| G27 | Info | Formulaires | Zone de copie redimensionnable en largeur | `browser-ui-theming` | lecture |
| G28 | Info | Mouvement | `.btc-repere` : animation annulée par `animation: none` ; transition de carte sans effet | `motion` | lecture |
| P1 | Positif | Performance | Aucune tâche longue au changement d'un réglage | `performance` | cas P1 (non reproduit) |

Le compte de 28 points exclut P1, qui est un point fort.

---

## 4. Écarts

### G1 — Pas de `color-scheme` : contrôles natifs clairs sur le thème sombre · Moyen

**Règle.** `color` : « pair it with the `color-scheme` CSS property so form controls,
scrollbars, and other UA-rendered surfaces match ». `brand-consistent-forms` : « combine
`accent-color` with `color-scheme` ».

**Constat.** La couche d'interface reprend les couleurs de Twitch par ses variables
([L1096-L1110](https://github.com/Maxezify/Betterchat-for-Twitch/blob/116d3a7/BetterTwitchChat.user.js#L1096-L1110)),
mais ne déclare jamais `color-scheme`. Ce que le navigateur dessine lui-même reste donc en
clair : flèches du champ nombre, liste ouverte d'un `<select>`, barres de défilement du
panneau et de la carte.

**Preuve.** Cas G1 : `color-scheme` calculé `normal` sur la liste déroulante et la zone
défilante, page en thème sombre. La capture compare le panneau tel quel et le même avec
`color-scheme: dark` : les flèches du champ « Seuil d'entrée » passent de blanches à
sombres.

**Correction proposée.** Poser `color-scheme` sur `.panneau` et `.carte` (éléments qui ont
leur propre fond, comme l'exige `component-specific-light-dark-theme`), d'après le thème de
Twitch et non d'après le système : la luminance de `--color-background-base`, déjà lisible
par `lireCouleur`, dit si le fond est sombre. À relire au changement de thème (classe de
`<html>`). `color-scheme` est largement disponible selon le guide (Baseline depuis février
2022) : aucun repli.

**À vérifier** : si Twitch déclare déjà `color-scheme: dark` sur `<html>`, la propriété est
héritée et le défaut ne se voit pas sur la vraie page (§8). La déclarer reste plus sûr.

### G2 — Texte cité et notices discrètes à 3,20:1 en thème clair · Moyen

**Règle.** `color` : « Maintain 4.5:1 for normal text ».

**Constat.** `CONFIG.reply.color` vaut `#8f8f9a`
([L89](https://github.com/Maxezify/Betterchat-for-Twitch/blob/116d3a7/BetterTwitchChat.user.js#L89)),
quel que soit le thème. Ce gris colore la citation des réponses et, en apparence
« discrète », le texte des notices. Il a été choisi pour le thème sombre.

**Preuve.** Cas G2, page en thème clair : citation `rgb(143, 143, 154)` sur blanc, **3,20:1**,
texte de 10,7 px. Sur le fond teinté d'une réponse, 2,71:1. En thème sombre, 5,54:1 et
4,53:1 : conforme.

**Correction proposée.** Dériver le gris des couleurs du thème :
`color-mix(in oklab, var(--color-text-base, #efeff1) 60%, var(--color-background-base, #18181b))`.
Mesuré : 5,57:1 et 4,56:1 en sombre (le rendu actuel, à un niveau de gris près), 6,00:1 et
5,08:1 en clair. `color-mix()` est déjà utilisé par le script. Le guide recommande
`in oklab` pour mélanger avec un neutre.

### G3 — Alerte du panneau à 3,87:1 en thème clair · Faible

**Règle.** Même règle que G2.

**Constat.** `--alerte: #f5333f`
([L1106](https://github.com/Maxezify/Betterchat-for-Twitch/blob/116d3a7/BetterTwitchChat.user.js#L1106))
colore en 12 px le message « Réglage appliqué mais non enregistré » et le bouton armé de
« Rétablir ».

**Preuve.** Cas G3 : 3,87:1 sur le fond blanc du panneau. En sombre : 4,58:1, conforme.

**Correction proposée.** Un rouge plus sombre en thème clair, par exemple `#d6232f`
(5,07:1). Le plus simple est de le poser avec la détection de thème de G1.

### G4 — Contrastes forcés : tous les onglets paraissent sélectionnés · Moyen

**Règle.** `tabs` : « Draw the underline with a border on a pseudo-element. DO NOT use
`box-shadow` or a background: forced colors mode removes both, leaving no indicator. » Et :
« Do not apply any styling that changes the dimensions of the tab ».

**Constat.** Chaque onglet porte `border-bottom: 2px solid transparent`, et l'onglet
sélectionné colore ce trait
([L1153-L1163](https://github.com/Maxezify/Betterchat-for-Twitch/blob/116d3a7/BetterTwitchChat.user.js#L1153-L1163)).
En contrastes forcés, le navigateur remplace la couleur de toutes les bordures, `transparent`
compris : chaque onglet reçoit un trait noir. La couleur du texte, seule autre différence,
est forcée elle aussi.

**Preuve.** Cas G4 : en contrastes forcés, l'onglet non sélectionné a un trait `rgb(0, 0, 0)` et
le même texte que l'onglet sélectionné. Capture : « Pouls du chat » est souligné alors que
« Réglages » est l'onglet actif.

**Correction proposée** (contre-épreuve faite). Retirer la bordure transparente, garder la
hauteur par `padding-bottom: 10px`, et tracer le trait de l'onglet sélectionné seul sur un
`::after` en `border-bottom`. En contrastes forcés, seul l'onglet actif est souligné ; en
rendu normal, rien ne change.

### G5 — Contrastes forcés : point de rafale invisible · Moyen

**Règle.** Même règle que G4 : un fond disparaît en contrastes forcés.

**Constat.** Le point est un `::after` dessiné par `background: #f5333f`
([L1064-L1075](https://github.com/Maxezify/Betterchat-for-Twitch/blob/116d3a7/BetterTwitchChat.user.js#L1064-L1075)).
En contrastes forcés, ce fond prend la couleur du fond de page : le point disparaît. L'état
reste dans l'infobulle et le nom accessible, mais plus à l'écran.

**Preuve.** Cas G5 : rafale signalée, point `rgb(255, 255, 255)` sur une page
`rgb(255, 255, 255)`. Capture : aucun point sur le bouton.

**Correction proposée** (contre-épreuve faite). Dessiner le point par sa bordure :
`width: 0; height: 0; border: 4px solid #f5333f; border-radius: 50%`. En contrastes forcés,
la bordure prend la couleur du texte : le point reste visible, en noir. En rendu normal, les
deux versions sont identiques à l'œil (46 pixels d'anticrénelage).

### G6 — Carte d'absence fermée au clavier : focus sur `<body>` · Moyen

**Règle.** `html` : « DO maintain focus—moving it to a logical adjacent element or
returning it to the trigger control—when the currently focused element is hidden or
removed. » `persistent-toast-notifications` : « DO manage focus when a user manually
dismisses a currently focused toast ».

**Constat.** `fermerAbsence` retire la carte
([L3534-L3536](https://github.com/Maxezify/Betterchat-for-Twitch/blob/116d3a7/BetterTwitchChat.user.js#L3534-L3536))
sans s'occuper du focus. Si le bouton « × » l'avait, il part avec la carte.

**Preuve.** Cas G6 : focus sur « Fermer » avant le clic, sur `<body>` après.

**Correction proposée.** Retenir l'élément qui avait le focus à l'apparition de la carte. À la
fermeture, si le focus était dans la carte, le lui rendre ; à défaut, le donner à la saisie
du chat. Le même mécanisme sert à G7.

### G7 — Carte d'absence fermée seule pendant qu'on y navigue · Moyen

**Règle.** `persistent-toast-notifications` : « If the user is focused on a control inside
the toast, pause dismissal until focus has left the toast. »

**Constat.** La minuterie d'une minute ne se met en pause qu'au survol de la souris
([L3582-L3587](https://github.com/Maxezify/Betterchat-for-Twitch/blob/116d3a7/BetterTwitchChat.user.js#L3582-L3587)).
Au clavier, la carte peut disparaître pendant qu'on lit une mention ou qu'on s'apprête à
cliquer « Aller au message ».

**Preuve.** Cas G7, minuterie ramenée de 60 s à 600 ms (et rien d'autre) : la carte se ferme
alors que son bouton a le focus, qui tombe sur `<body>`.

**Correction proposée.** Suspendre la minuterie sur `focusin` dans la carte et la relancer
sur `focusout` quand le focus en sort, comme pour la souris.

### G8 — « Activer le pouls du chat » retiré sous le focus · Faible

**Règle.** Même règle que G6.

**Constat.** Le bouton vit dans `c.etat`, vidé par `montrer()` dès que le pouls est activé
([L3910-L3915](https://github.com/Maxezify/Betterchat-for-Twitch/blob/116d3a7/BetterTwitchChat.user.js#L3910-L3915)).

**Preuve.** Cas G8 : après le clic, le bouton n'est plus dans la page et le focus est sur
`<body>`.

**Correction proposée.** Donner le focus à l'onglet « Pouls du chat » (ou au compteur rendu
focalisable par `tabindex="-1"`) avant de vider la zone.

### G9 — Interface française sans `lang="fr"` · Moyen

**Règle.** `accessibility` : « Do declare changes in the page's human language » (WCAG 3.1.2,
niveau AA). `html` : « DO set the `lang` attribute … on any element that uses a language
that differs from the primary language ».

**Constat.** Le panneau, la carte et le bouton sont en français. Ils héritent de la langue de
la page : sur un Twitch réglé en anglais, `<html lang="en">`, un lecteur d'écran lit
« Réglages », « Pendant ton absence » ou « Rétablir » avec une voix anglaise.

**Preuve.** Cas G9 : page en `lang="en"`, le panneau et le bouton ne répondent pas à `:lang(fr)`.

**Correction proposée.** `lang="fr"` sur l'hôte `#btc-ui`
([L3098-L3100](https://github.com/Maxezify/Betterchat-for-Twitch/blob/116d3a7/BetterTwitchChat.user.js#L3098-L3100))
et sur le bouton créé par `creerBouton`. Une ligne chacun.

### G10 — Bouton du panneau sans `aria-expanded` ; raccourci seulement en infobulle · Faible

**Règle.** `accessibility` : « Utilize `aria-expanded` and `aria-pressed` to communicate
toggle states for custom controls » ; `declarative-dialog-popover-control` rappelle que le
navigateur pose lui-même `aria-expanded` sur le bouton qui ouvre un popover. `html` : « DON'T use the `title` attribute to create tooltip effects, as
these cannot be accessed using a keyboard ». `accessibility`, sur les descriptions : « Don't
pack descriptions, error messages, or instructions into the label ».

**Constat.** Le bouton ouvre et ferme le panneau sans exposer l'état ouvert. Le raccourci
Alt+Maj+B n'est écrit que dans `title`
([L3951](https://github.com/Maxezify/Betterchat-for-Twitch/blob/116d3a7/BetterTwitchChat.user.js#L3951)),
invisible au clavier et au toucher. Pendant une rafale, le débit est ajouté au nom
accessible lui-même ([L3958](https://github.com/Maxezify/Betterchat-for-Twitch/blob/116d3a7/BetterTwitchChat.user.js#L3958)) :
le nom change au fil du débit.

**Preuve.** Cas G10 : panneau ouvert, `aria-expanded` et `aria-keyshortcuts` absents.

**Correction proposée.** `aria-expanded` tenu à jour à l'ouverture et à la fermeture ;
`aria-keyshortcuts="Alt+Shift+B"` ; nom fixe « Réglages de BetterTwitchChat » et état de
rafale dans `aria-description`. `aria-controls` ne peut pas viser le panneau : il vit dans un
autre arbre (shadow DOM), ce que `web-components` rappelle.

### G11 — Aides de réglage non reliées à leur champ · Faible

**Règle.** `accessibility` : « Link hints to inputs via `aria-describedby` ». `forms` : « DO
use `aria-describedby` to link inputs with help text ».

**Constat.** Les aides (« Relative au texte du chat. », « 0 : saut direct en bas. »…) sont
des `<small>` posés à côté du champ
([L3243](https://github.com/Maxezify/Betterchat-for-Twitch/blob/116d3a7/BetterTwitchChat.user.js#L3243)).
Un lecteur d'écran ne les lit pas quand le champ prend le focus.

**Preuve.** Cas G11 : 7 réglages ont une aide visible, aucun ne la relie.

**Correction proposée.** Un `id` sur chaque aide et `aria-describedby` sur le champ.
L'aide d'une section (sous la légende) peut décrire le `<fieldset>` de la même façon.

### G12 — Flèches des onglets actives avec Alt, sans `preventDefault` · Faible

**Règle.** `spatial-navigation` : « Do not intercept the event when a modifier key is
held » ; « When a candidate is found, call `preventDefault()` ».

**Constat.** Le gestionnaire des flèches
([L3282-L3288](https://github.com/Maxezify/Betterchat-for-Twitch/blob/116d3a7/BetterTwitchChat.user.js#L3282-L3288))
ne regarde pas les modificateurs : Alt+Flèche gauche, qui est aussi « page précédente » dans
le navigateur, change d'onglet. Il n'empêche pas non plus l'action par défaut de la flèche.

**Preuve.** Cas G12 : Alt+Flèche droite change d'onglet ; Flèche gauche n'est pas bloquée.

**Correction proposée.** Ignorer la frappe si Alt, Ctrl, Meta ou Maj est enfoncé ; appeler
`preventDefault()` quand l'onglet change. Début et Fin, attendus d'une liste d'onglets,
peuvent s'ajouter au même endroit.

### G13 — Glissement du chat malgré « réduire les animations » · Moyen

**Règle.** `motion` : « Always respect reduced motion preferences. »

**Constat.** Le script respecte la préférence pour ses effets CSS et pour « Aller au
message » (`mouvementReduit`,
[L2751](https://github.com/Maxezify/Betterchat-for-Twitch/blob/116d3a7/BetterTwitchChat.user.js#L2751)),
mais pas pour le glissement qu'il ajoute au chat : `recollerEnBas` ne consulte que
`smoothScrollMs`
([L2332](https://github.com/Maxezify/Betterchat-for-Twitch/blob/116d3a7/BetterTwitchChat.user.js#L2332)).
Twitch, lui, saute en bas sans animation.

**Preuve.** Cas G13, `prefers-reduced-motion: reduce` émulé : après 6 nouveaux messages, l'écart
au bas décroît image par image (77, 107, 127, 137, 140, 116, 100, 89… px) au lieu de tomber
à zéro.

**Correction proposée.** Traiter `smoothScrollMs` comme 0 quand `mouvementReduit()` est
vrai : le chat saute en bas, comme sur Twitch. Le réglage du panneau peut le dire dans son
aide.

### G14 — Panneau en `role="region"` titré par un `<strong>` · Faible

**Règle.** `dialog`, règle 2 : « The user keeps working in the page while the panel is
open » : un panneau de ce type reste un dialogue, `<dialog>` ouvert par `show()` ou
`<dialog popover>`. `accessibility` : « `region` should be a last resort » ; « DO name every
dialog with `aria-labelledby` pointing at its heading ».

**Constat.** Le panneau est une `div role="region"` nommée par `aria-label`
([L3290](https://github.com/Maxezify/Betterchat-for-Twitch/blob/116d3a7/BetterTwitchChat.user.js#L3290)).
Son titre visible est un `<strong>` ; le premier vrai titre du panneau est le `<h3>`
« Moments forts », sans niveau au-dessus.

**Preuve.** Cas G14 : `<div role="region">`, titre visible en `<strong>`, premier titre `<h3>`.

**Correction proposée.** Un `<dialog>` non modal, ouvert par `show()` et fermé par
`close()`, avec un `<h2>` visible et `aria-labelledby` vers lui ; « Moments forts » passe en
`<h3>` sous ce `<h2>`. `<dialog>` est Baseline largement disponible. Le comportement ne
change pas : Échap, retour du focus et absence de blocage restent ceux du script. Le passer
en couche supérieure (`popover="manual"`) est possible mais facultatif : Popover n'est que
nouvellement disponible et le guide exige alors un repli, ce que le fonctionnement actuel
fournit.

### G15 — Carte d'absence : région live créée avec son contenu · Moyen

**Règle.** `persistent-toast-notifications` : « DO use `ariaNotify()` to announce the
content » et, en repli : « Use an ARIA live region, ensuring that the container is present
in the page on load, and then add the messages to the live region container ». Aussi :
« DO ensure that only the toast's visible text is announced … and not the names of any
controls. If actions are available … append "Actions available" ».

**Constat.** La carte est elle-même `role="status"` et `aria-live="polite"`, et elle est
insérée déjà remplie
([L3573-L3579](https://github.com/Maxezify/Betterchat-for-Twitch/blob/116d3a7/BetterTwitchChat.user.js#L3573-L3579)).
Les lecteurs d'écran surveillent les régions live existantes : une région qui apparaît avec
son texte est souvent passée sous silence. Si elle est lue, ses boutons (« Fermer le
résumé », « Aller au message ») le sont avec.

**Preuve.** Cas G15 : aucune région live dans l'interface avant la carte ; la carte est la région
et contient ses boutons. L'effet sur un lecteur d'écran n'a pas été écouté (§2).

**Correction proposée.** Une seule région `aria-live="polite"`, vide, créée avec la couche
d'interface ; à l'affichage de la carte, y écrire le texte du résumé seul, suivi de
« Actions disponibles » s'il y a des mentions. Utiliser `document.ariaNotify()` là où il
existe (détecté par `'ariaNotify' in document`) : le guide le donne nouvellement disponible
depuis septembre 2026, d'où le repli. La carte elle-même perd `role` et `aria-live`, et
devient une région nommée (« Notifications de BetterTwitchChat »).

### G16 — Résumé d'absence introuvable une fois la carte fermée · Moyen

**Règle.** `persistent-toast-notifications` : « MANDATORY: Ensure that the information in the
toast can be identified by other means, so that if it is part of a pattern that disappears
after a short period of time, people can still identify the information without the toast
being present. »

**Constat.** Fermée, ou partie seule au bout d'une minute, la carte ne laisse rien derrière
elle : le résumé n'est nulle part ailleurs.

**Preuve.** Cas G16 : le texte « 4 messages · 4/min en moyenne · pic à 24/min » n'est retrouvé ni
dans le panneau ni dans `__BTC` après fermeture.

**Correction proposée.** Garder le dernier résumé et l'afficher dans le panneau, par exemple
en tête de l'onglet « Pouls du chat » (« Dernière absence : … »), jusqu'à la suivante.

### G17 — Interface en `px` : ne suit pas la taille de police de la page · Faible (à vérifier)

**Règle.** `typography` : « DON'T use `px` for font-size. Prefer `rem` to honor the user's
browser font-size preferences ».

**Constat.** Toutes les tailles de la couche d'interface sont en pixels : 13 px pour le
corps, 11 à 20 px ailleurs
([L1109](https://github.com/Maxezify/Betterchat-for-Twitch/blob/116d3a7/BetterTwitchChat.user.js#L1109)).
Le zoom du navigateur les agrandit, mais pas la taille de police choisie dans ses réglages.

**Preuve.** Cas G17 : avec une racine passée de 16 à 20 px, le texte du panneau reste à 13 px.

**Correction proposée.** Passer en `rem` (13 px = 0,8125 rem) **si** la racine de Twitch
suit la préférence de l'utilisateur (§8). Sinon, l'écart n'a pas d'effet réel et peut être
conservé.

### G18 — Copies de tableaux avant `sort()` et `reverse()` · Faible

**Règle.** `js` : « DO use `array.toSorted(compareFn)` instead of `[...array].sort(compareFn)` » ;
« DO use `array.toReversed()` instead of `[...array].reverse()` ».

**Constat.** `legacy-scan` relève deux lignes :
[L2728](https://github.com/Maxezify/Betterchat-for-Twitch/blob/116d3a7/BetterTwitchChat.user.js#L2728)
(`mediane`) et
[L3933](https://github.com/Maxezify/Betterchat-for-Twitch/blob/116d3a7/BetterTwitchChat.user.js#L3933)
(liste des moments). Les deux portent sur de vrais tableaux denses : aucun critère d'exclusion
de l'outil ne s'applique. `premiers()` (`[...map.entries()].sort`) est à juste titre laissé
de côté : il part d'un itérateur.

**Correction proposée.** `valeurs.toSorted((a, b) => a - b)` et `moments.toReversed()`. Les
méthodes de copie (Chrome 110, Firefox 115, Safari 16) sont Baseline depuis juillet 2023.

### G19 — Listes sans puces en grille, sans `role="list"` · Faible

**Règle.** `accessibility` : « Safari removes list semantics from `<ul>`/`<ol>` outside
`<nav>` when `list-style: none` or `display: flex`/`grid` is applied. In that case
`role="list"` is required ».

**Constat.** `ol.moments` et `ul.mentions` sont dans ce cas
([L1208](https://github.com/Maxezify/Betterchat-for-Twitch/blob/116d3a7/BetterTwitchChat.user.js#L1208),
[L1232](https://github.com/Maxezify/Betterchat-for-Twitch/blob/116d3a7/BetterTwitchChat.user.js#L1232)).
Avec VoiceOver, le nombre de moments ou de mentions n'est plus annoncé. Non vérifié ici
(Safari non testé).

**Correction proposée.** `role: 'list'` à leur création.

### G20 — Faux titres dans la carte d'absence · Faible

**Règle.** `accessibility` : « Mandatory - Don't use "fake" headings ».

**Constat.** Le titre de la carte, « Pendant ton absence », est un `<strong>`, et « N
mentions de toi » un `<p class="titre-bloc">` en gras
([L3557](https://github.com/Maxezify/Betterchat-for-Twitch/blob/116d3a7/BetterTwitchChat.user.js#L3557)).

**Correction proposée.** Un `<h2>` pour le titre de la carte, un `<h3>` pour « mentions de
toi », sans changer leur apparence. Avec G15, la carte devient une région nommée par ce `<h2>`.

### G21 — Retour « Copiée » non annoncé ; minuterie non annulée · Faible

**Règle.** `copy-button` : le même élément porte le retour visuel et l'annonce (« One element
for sighted and screen reader users ») ; « Repeat clicks: clear the pending timeout ».

**Constat.** Le bouton change son texte en « Copiée »
([L3895-L3896](https://github.com/Maxezify/Betterchat-for-Twitch/blob/116d3a7/BetterTwitchChat.user.js#L3895-L3896)).
Un lecteur d'écran n'annonce pas, en général, le nouveau nom du bouton qui a déjà le focus.
Deux clics rapprochés lancent deux minuteries : la première remet « Copier la liste » trop
tôt.

**Correction proposée.** Écrire « Liste copiée » dans la région live de G15 ;
`clearTimeout` avant de relancer.

### G22 — Rafale : message joint révélé au survol seulement · Faible

**Règle.** `natural-interactions` : « Controls or details revealed in place on hover, such as
card actions, must also appear on keyboard focus ».

**Constat.** En rafale, le message joint à une notice se cache sauf au survol
(`:not(:hover)`,
[L953-L956](https://github.com/Maxezify/Betterchat-for-Twitch/blob/116d3a7/BetterTwitchChat.user.js#L953-L956)).

**Correction proposée.** `:not(:hover):not(:focus-within)` : le message réapparaît aussi
quand le focus clavier entre dans la notice (pseudo, badges).

---

## 5. Remarques

- **G23 — Fil de conversation au survol seulement.** Le fil est une aide visuelle : la
  citation dit déjà à qui l'on répond. Le déclencher aussi sur `focusin` dans une ligne le
  rendrait accessible au clavier, comme le recommande `natural-interactions`. À décider.
- **G24 — `100vh`.** `max-height: calc(100vh - 96px)`
  ([L1126](https://github.com/Maxezify/Betterchat-for-Twitch/blob/116d3a7/BetterTwitchChat.user.js#L1126)) :
  `responsive-design` préfère `dvh`. Sans effet sur ordinateur, où le script s'exécute.
- **G25 — `aria-controls` sur les onglets**
  ([L3279](https://github.com/Maxezify/Betterchat-for-Twitch/blob/116d3a7/BetterTwitchChat.user.js#L3279)) :
  `tabs` : « Do not add `aria-controls` to the tabs: no screen reader uses it. » Inoffensif.
- **G26 — Légendes en capitales de 11 px**
  ([L1167-L1175](https://github.com/Maxezify/Betterchat-for-Twitch/blob/116d3a7/BetterTwitchChat.user.js#L1167-L1175)).
  `typography` déconseille les capitales comme moyen d'insistance ; 11 px est petit. Choix de
  style, à garder ou non.
- **G27 — Zone de copie redimensionnable en largeur.** `browser-ui-theming` : `resize:
  vertical` pour un `<textarea>` : la largeur est déjà de 100 %.
- **G28 — Animations.** `.btc-repere` déclare son animation pour tous puis l'annule par
  `animation: none` en mouvement réduit ; `motion` préfère l'inverse (activer dans
  `no-preference`). Le résultat est le même. Hors guide, trouvé en passant :
  `.carte { transition: opacity }`
  ([L1237-L1239](https://github.com/Maxezify/Betterchat-for-Twitch/blob/116d3a7/BetterTwitchChat.user.js#L1237-L1239))
  ne joue jamais, rien ne change l'opacité d'une carte.

---

## 6. Recommandations du guide non transposées

| # | Recommandation | Pourquoi elle n'est pas retenue |
|---|---|---|
| N1 | Couches `@layer` et `:where()` plutôt que des classes doublées et `!important` (`css`) | Le script surcharge les feuilles de Twitch et de 7TV, qui ne sont pas en couche. Une règle normale en couche perd toujours contre une règle hors couche ; seul un `!important` en couche gagne. Passer en couches changerait le résultat de chaque règle sans `!important` : refonte risquée, sans gain pour l'utilisateur. |
| N2 | Propriétés logiques (`margin-inline-start`…) (`css`) | Twitch en français ou en anglais, écrit de gauche à droite : rien ne s'inverserait. |
| N3 | `focusgroup`, `interestfor`/`popover="hint"`, positionnement par ancre, promesses de défilement, `Temporal` | Disponibilité limitée : le guide impose alors un polyfill chargé à la demande, depuis npm ou un CDN. Un userscript `@grant none` ne charge pas de code externe dans Twitch. Le script fait déjà, en natif, ce que ces fonctions apporteraient. |
| N4 | `Intl.DurationFormat` pour `dureeLisible` et `horloge` (`calculate-event-differentials`) | Nouvellement disponible : il faudrait garder le code actuel en repli, pour un affichage identique. |
| N5 | Infobulle accessible au lieu de `title` sur le bouton (`interest-triggered-tooltips`) | Le mécanisme du guide (`interestfor`) n'est disponible que dans Chrome et Edge. Le `title` reste pour la souris, comme sur les boutons de Twitch ; G10 rend le raccourci et l'état accessibles autrement. |
| N6 | Pas de fenêtre surgissante non demandée (`content-first-noise-reduction`) | La carte d'absence est une fonction que tu as activée, non modale, et que tu as voulue en bas du chat. |
| N7 | Exposer le contenu du canevas (`expose-canvas-content-to-browser-features`) | Fonction volatile, servie seulement sur accord explicite ; inutile ici, le graphe a son alternative textuelle (compteur et liste des moments). |

---

## 7. Points conformes

Relevés pour ce qu'ils valent : ils évitent de défaire ce qui est juste.

- **JavaScript** : `structuredClone` pour les valeurs par défaut, `replaceChildren` pour
  vider et remplir, constructeur d'éléments sans `innerHTML`, `TreeWalker` pour lire le
  texte, `Set`/`Map`/`WeakSet` à leur place (`js`, `security`).
- **Extension de page** : `MutationObserver` et traitement groupé par image, classes
  préfixées `btc-`, interface dans un shadow DOM ouvert, `@run-at document-idle` (référence
  « content scripts »).
- **Shadow DOM** : `font: inherit` sur les contrôles, thème transmis par les variables CSS de
  Twitch, références ARIA restées dans le même arbre (`styling-web-components`,
  `web-components`).
- **Formulaires** : `<fieldset>`/`<legend>`, `<label for>` avant les champs et après les
  cases, `type="button"` partout, `inputmode`, bornes `min`/`max`/`step` (`forms`).
- **Onglets** : `tablist`/`tab`/`tabpanel`, `aria-selected`, tabindex itinérant, sélection qui
  suit le focus, état initial rendu avant tout script (`tabs`).
- **Focus** : `:focus-visible` avec décalage, retour du focus à la fermeture du panneau, Échap
  qui ne ferme que le panneau, boutons de fermeture visibles (`accessibility`, `dialog`).
- **Médias** : SVG décoratifs en `aria-hidden`, canevas en `role="img"` nommé avec une
  alternative textuelle, emotes avec `alt`, `loading="lazy"` et `aspect-ratio` connu
  (`accessibility`, `html`).
- **Mouvement** : transitions CSS dans `prefers-reduced-motion: no-preference`, « Aller au
  message » sans défilement animé en mouvement réduit (`motion`) — sauf G13.
- **Couleur** : `accent-color` sur les cases, `color-mix()` pour les teintes qui suivent le
  thème (`dark-mode`, `color`) — sauf G1 à G3.
- **Performance** : aucune tâche longue (P1) ; écouteurs `scroll` et `resize` passifs,
  `ResizeObserver` plutôt qu'une boucle, canevas redessiné seulement quand ses données
  changent (`performance`).
- **Presse-papiers** : `navigator.clipboard.writeText`, Baseline, avec repli dans un champ
  sélectionné (`copy-button`).
- **Vie privée** : rien ne quitte la page ; seul le pseudo est lu dans le profil Twitch ; la
  base de l'ancien historique est effacée (`privacy`).

---

## 8. À vérifier sur Twitch

Trois constats dépendent de la vraie page. Dans la console d'une page de chaîne :

```js
[getComputedStyle(document.documentElement).colorScheme, document.documentElement.lang, getComputedStyle(document.documentElement).fontSize]
```

| Valeur | Si… | Alors… |
|---|---|---|
| `colorScheme` | `dark` en thème sombre | G1 ne se voit pas aujourd'hui (la propriété est héritée) ; la déclarer reste une protection. |
| `lang` | `en` (Twitch en anglais) | G9 touche les personnes qui utilisent Twitch en anglais. |
| `fontSize` | change quand on agrandit la police dans les réglages du navigateur | G17 a un effet réel : le panneau reste à 13 px pendant que Twitch grandit. |

---

## 9. Politique de compatibilité proposée

Le guide conseille d'écrire la politique de compatibilité du projet, faute de quoi il
applique la sienne (fonctions « largement disponibles » sans repli, les autres avec). Pour un
userscript qui ne peut pas charger de polyfill, je propose, dans le README :

> **Navigateurs.** Fonctions Baseline largement disponibles, sans repli. Une fonction plus
> récente seulement si son absence laisse le script fonctionner (détection, puis
> comportement actuel). Aucun code externe.

C'est ce que le script fait déjà ; l'écrire évite de rouvrir la question. À toi de décider.

---

## 10. Plan d'action proposé

1. **Focus et notifications** (G6, G7, G8, G15, G16, G20, G21) : un même chantier sur la
   carte d'absence et la couche d'interface.
2. **Thème et contrastes** (G1, G2, G3, G4, G5) : une détection du thème de Twitch, puis des
   couleurs qui en dépendent ; G4 et G5 sont déjà validés sur copie.
3. **Mouvement réduit** (G13) : une condition.
4. **Sémantique** (G9, G10, G11, G12, G14, G19) : attributs et éléments, sans changement
   visible.
5. **Petites modernisations** (G18, G22, G24 à G28) : au fil de l'eau.
6. **Après vérification sur Twitch** (§8) : G17.

Chaque correction viendra avec son cas au banc, comme pour les audits précédents :
`npm run audit:mwg` ne devra plus rien reproduire.
