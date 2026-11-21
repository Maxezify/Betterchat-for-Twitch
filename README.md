# Betterchat for Twitch

Userscript (Tampermonkey, Violentmonkey) qui améliore le chat natif de Twitch et reste
compatible avec la nouvelle extension 7TV :

- réponses lisibles en entier, emotes comprises, avec la couleur de grade du message ;
- notices d'abonnement, de Prime, de gift et de raid compactées et traduites en français ;
- regroupement d'un gift multiple et de ses destinataires dans une seule notice ;
- affichage progressif des messages et défilement fluide ;
- alignement des emotes et des badges ;
- un panneau de réglages dans le chat, et quatre fonctions décrites plus bas : densité
  adaptative en rafale, fil de conversation au survol, résumé « Pendant ton absence »,
  pouls du chat et moments forts.

## Installation

1. Installer [Tampermonkey](https://www.tampermonkey.net/) ou [Violentmonkey](https://violentmonkey.github.io/).
2. Ouvrir le lien de la version voulue ; le gestionnaire propose l'installation.

| Version | Lien |
|---|---|
| Stable (`prod`) | https://raw.githubusercontent.com/Maxezify/Betterchat-for-Twitch/prod/BetterTwitchChat.user.js |
| En test (`dev`) | https://raw.githubusercontent.com/Maxezify/Betterchat-for-Twitch/dev/BetterTwitchChat.user.js |

Le script installé se met ensuite à jour tout seul depuis `prod`. Son nom et son espace de
noms n'ont pas changé : il remplace une installation faite depuis l'ancien dépôt
`BetterTwitchChat-with-7tv` au lieu de s'y ajouter.

## Panneau et fonctions

Le panneau s'ouvre avec le bouton ajouté à côté de l'engrenage des réglages du chat, ou avec
**Alt+Maj+B**, y compris depuis la zone de saisie du chat. Échap le ferme et rend la main là où
elle était. Sous macOS, Option+Maj+B tape un caractère dans un champ de saisie : il y est laissé,
le bouton ouvre alors le panneau. Le panneau a deux onglets : *Réglages* et *Pouls du chat*.
Un réglage changé s'applique tout de suite, sans recharger la page, messages déjà affichés
compris, et il revient en arrière aussi bien. Seule exception : le regroupement des gifts,
réactivé, ne vaut que pour les gifts suivants. Le réglage reste enregistré dans ce navigateur
(`localStorage`, clé `btc:reglages:v1` ; seuls les écarts aux valeurs par défaut y sont gardés)
et s'applique aussi aux autres onglets ouverts. « Rétablir les valeurs par défaut » demande une
confirmation.

| Fonction | Par défaut | Ce qu'elle fait |
|---|---|---|
| Densité adaptative | activée | Quand le chat dépasse 8 messages par seconde (mesurés sur 5 s), il se resserre : badges secondaires masqués (modo, VIP, diffuseur et staff restent), notices et citations sur une ligne, interligne réduit, point rouge sur le bouton du panneau (débit en infobulle). Il revient à la normale sous 5 messages par seconde, mesurés sur 10 s, et pas avant 10 s. Seuils et effets réglables un par un. |
| Fil de conversation | activée | Au survol d'une réponse, le message d'origine et les autres réponses au même message sont encadrés, le reste du chat s'estompe. |
| Pendant ton absence | activée | Au retour sur l'onglet après au moins 60 s : nombre de messages et pic de cadence, abonnements, gifts, raids, mentions (« @pseudo » ou réponse à l'un de tes messages, avec « Aller au message »), emotes les plus utilisées, personnes les plus actives. La carte s'affiche en bas du chat et se ferme seule au bout d'une minute. Si la chaîne a changé pendant l'absence (raid), elle le dit et ne résume que la nouvelle. |
| Pouls du chat | **coupée** | Cadence par tranche de 10 s, graphique des deux dernières heures et moments forts de toute la session (pics par rapport à la normale du chat), avec l'heure du live quand Twitch l'affiche, l'emote dominante et un message représentatif. La liste se copie pour préparer des clips. Tout se lit dans le panneau : rien ne s'affiche dans le chat. |

Les lignes que Twitch rejoue à l'ouverture du chat ne comptent pas comme des arrivées : la
cadence, le résumé et le pouls ne prennent en compte que le direct. Changer de chaîne remet la
cadence à zéro. Le pouls de chaque chaîne est gardé le temps de la page, pour les 5 dernières
chaînes : un aller-retour ne perd rien.

L'historique long des v15.26.0 et v15.26.1 a été retiré. La base qu'il avait pu créer dans le
navigateur (IndexedDB, `btc-historique`) est effacée au premier lancement de la v15.26.2.

## Branches et livraison

| Branche | Rôle |
|---|---|
| `dev`  | Développement. Corrections et évolutions arrivent ici d'abord. |
| `prod` | Version distribuée aux utilisateurs : la **version optimisée** (sans commentaires ni espaces), construite depuis `dev` par `npm run build`. Ne reçoit que des pull requests dont le banc de test passe. |

## Livraison en prod

La source commentée vit sur `dev`. `prod` reçoit le même code, sans commentaires ni espaces
(environ 94 Ko au lieu de 206 Ko en v15.26.3) : l'en-tête `==UserScript==` est gardé tel quel, les noms
ne sont pas raccourcis, le code n'est pas réécrit. Le banc vérifie que cette version passe les
mêmes cas que la source et produit exactement la même feuille de style.

1. Partir de `prod` : `git switch -c release/vX.Y.Z origin/prod`.
2. Reprendre l'arbre de `dev` : `git checkout origin/dev -- .`.
3. Construire et remplacer le script : `npm run build`, puis copier
   `dist/BetterTwitchChat.user.js` sur `BetterTwitchChat.user.js`.
4. Commiter (le hook teste la version optimisée), pousser, ouvrir une pull request vers `prod`.
   Elle se fusionne une fois la vérification `banc` au vert.

## Banc de test

```bash
npm install                     # dépendances + activation du hook pre-commit
npx playwright install chromium # navigateur de test, une fois
npm test                        # banc complet sur la source commentée
npm run test:build              # construit la version optimisée et la passe au banc
npm run test:prod               # même banc sur la branche prod, pour comparer
npm run lint                    # ESLint seul
```

Le banc charge le script dans Chromium, sur une imitation du DOM du chat Twitch, et vérifie
les cas reliés aux points de l'audit (`tests/cas.js`). Il produit un rapport JSON dans
`tests/resultats/`.

**Il tourne avant chaque commit** qui touche au script, au banc, à la construction ou à la
configuration ESLint : le hook `.githooks/pre-commit` teste la version indexée (celle qui
va être commitée), d'abord la source puis la version optimisée, et refuse le commit si un
cas échoue. GitHub Actions relance les deux à chaque push et à chaque pull request vers
`dev` ou `prod` (vérification `banc`).

## Réglages et diagnostic

Les valeurs par défaut sont regroupées dans l'objet `CONFIG` en tête du script ; celles
choisies dans le panneau s'y superposent. Depuis la console du navigateur, sur une page de
chaîne :

```js
__BTC.check()        // version, réglages actifs, rendu progressif, débit, rafale
__BTC.selfCheck()    // vérifie que les ancres du DOM Twitch/7TV répondent encore
__BTC.whyFontSize()  // liste les règles CSS qui fixent la taille des citations
__BTC.reglages.ouvrir('pouls')               // ouvrir le panneau sur un onglet
__BTC.reglages.changer('rafale.entree', 12)  // changer et enregistrer un réglage
__BTC.reglages.liste()                       // réglages, valeurs et valeurs par défaut
__BTC.pouls.moments()                        // moments forts de la session
__BTC.config.reply.style = 'card'; __BTC.reload()   // tester un réglage sans l'enregistrer
```

Les réglages absents du panneau (tailles, délais internes, `rafale.fenetreS`, `pouls.minimum`,
`stabilisationMs`…) se changent dans `CONFIG`, en tête du script. Une mise à jour du script
remplace le fichier et efface ces modifications ; ceux du panneau, enregistrés à part, sont
gardés.

`__BTC.interne` sert au banc de test et au diagnostic.

## Documents

- [`AUDIT.md`](AUDIT.md) : audit complet de la v15.24.0 et suivi des corrections (§0).
- [`AUDIT-15.26.md`](AUDIT-15.26.md) : audit complet de la v15.26.0 (cœur et nouvelles fonctions) et
  suivi des corrections ; reproduction : `npm run audit:reproduction:15.26`.
- [`AUDIT-15.26.2.md`](AUDIT-15.26.2.md) : audit complet de la v15.26.2 ; ses constats se
  reproduisent avec `npm run audit:reproduction`.
- [`CHANGELOG.md`](CHANGELOG.md) : journal des versions.
- [`tests/suivi.json`](tests/suivi.json) : statut de chaque point de l'audit.
