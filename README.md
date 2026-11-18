# Betterchat for Twitch

Userscript (Tampermonkey, Violentmonkey) qui améliore le chat natif de Twitch et reste
compatible avec la nouvelle extension 7TV :

- réponses lisibles en entier, emotes comprises, avec la couleur de grade du message ;
- notices d'abonnement, de Prime, de gift et de raid compactées et traduites en français ;
- regroupement d'un gift multiple et de ses destinataires dans une seule notice ;
- affichage progressif des messages et défilement fluide ;
- alignement des emotes et des badges.

Version actuelle : **15.24.0**.

## Installation

1. Installer [Tampermonkey](https://www.tampermonkey.net/) ou [Violentmonkey](https://violentmonkey.github.io/).
2. Ouvrir [`BetterTwitchChat.js` sur la branche `prod`](https://github.com/Maxezify/Betterchat-for-Twitch/blob/prod/BetterTwitchChat.js),
   créer un nouveau script dans le gestionnaire et y coller le contenu.
   Le fichier se termine par `.js` et non `.user.js`, donc le gestionnaire ne propose pas
   l'installation tout seul.

> Les mises à jour automatiques (`@updateURL` / `@downloadURL`) pointent encore sur l'ancien
> dépôt `BetterTwitchChat-with-7tv`. Voir le point **S2** de l'audit avant de les basculer ici.

## Branches

| Branche | Rôle |
|---|---|
| `prod` | Version distribuée aux utilisateurs. Ne reçoit que des fusions depuis `dev`, une fois testées. |
| `dev`  | Développement. Corrections et évolutions arrivent ici d'abord. |

## Réglages et diagnostic

Les réglages sont regroupés dans l'objet `CONFIG` en tête du script. Depuis la console du
navigateur, sur une page de chaîne :

```js
__BTC.check()        // version, réglages actifs, état du rendu progressif
__BTC.selfCheck()    // vérifie que les ancres du DOM Twitch/7TV répondent encore
__BTC.whyFontSize()  // liste les règles CSS qui fixent la taille des citations
__BTC.config.reply.style = 'card'; __BTC.reload()   // tester un réglage à chaud
```

## Audit

L'audit complet de la version 15.24.0 (bugs, performance, code mort, robustesse, sécurité)
se trouve dans [`AUDIT.md` sur la branche `dev`](https://github.com/Maxezify/Betterchat-for-Twitch/blob/dev/AUDIT.md),
avec un banc de reproduction dans `audit/repro.js`.
