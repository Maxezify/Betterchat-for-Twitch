// ==UserScript==
// @name         BetterTwitchChat (+ 7TV)
// @namespace    https://github.com/Maxezify/BetterTwitchChat-with-7tv
// @version      15.26.0
// @description  Réponses lisibles en entier (emotes incluses), notices sub/prime/gift compactées, regroupement des gifts multiples ; panneau de réglages, densité en rafale, fil de conversation, résumé d'absence, historique et pouls du chat. Compatible chat Twitch natif + nouvelle extension 7TV.
// @author       Maxezify
// @match        https://www.twitch.tv/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=twitch.tv
// @grant        none
// @run-at       document-idle
// @updateURL    https://raw.githubusercontent.com/Maxezify/Betterchat-for-Twitch/prod/BetterTwitchChat.user.js
// @downloadURL  https://raw.githubusercontent.com/Maxezify/Betterchat-for-Twitch/prod/BetterTwitchChat.user.js
// ==/UserScript==

/*
 * v15 — réécriture complète.
 *
 * Mise à jour automatique : @updateURL / @downloadURL pointent sur la branche `prod` du
 * dépôt Maxezify/Betterchat-for-Twitch. @name et @namespace gardent volontairement leurs
 * valeurs d'origine, ancien dépôt compris : le gestionnaire de scripts identifie un script
 * par ce couple, et le changer installerait une seconde copie au lieu de mettre à jour.
 *
 * La nouvelle extension 7TV (ID lppmekppnliemjclknbagdhoocikieoi) ne remplace plus le
 * moteur de rendu du chat : elle décore le chat natif de Twitch. Toutes les classes
 * `.seventv-chat-list`, `.seventv-message`, `.seventv-sub-message-container`… sur
 * lesquelles reposait la v14 ont disparu. Ce script cible désormais le DOM Twitch natif
 * et lit les marqueurs 7TV (`data-seventv-*`, `.seventv-emote`, classes de highlight)
 * là où ils existent.
 *
 * Ancres considérées comme stables :
 *   [data-a-target="chat-scroller"]                                 élément qui défile
 *   [data-test-selector="chat-scrollable-area__message-container"]  conteneur du chat
 *   .chat-line__message / [data-a-target="chat-line-message"]       ligne de message
 *   .chat-line__message-container                                   corps de la ligne
 *   [data-a-target="chat-line-message-body"] / .text-fragment       texte du message
 *   .chat-author__display-name                                      pseudo
 *   [data-test-selector="user-notice-line"]                         notice sub/gift/raid
 *   .mystery-gift-theme__*                                          gift multiple
 *   img[data-emote-name] / .seventv-emote / .chat-image             emotes
 *   img.chat-badge[alt] / .seventv-chat-badge                       badges (rafale)
 *   [data-a-target="chat-settings"]                                 engrenage, où se
 *                                                                   pose le bouton du panneau
 *   .live-time                                                      durée du live (pouls)
 *
 * Les classes en `Layout-sc-…`/`kBZhWz` sont des hachages styled-components : elles
 * changent à chaque build de Twitch et ne sont JAMAIS utilisées comme sélecteur ici.
 * Le bloc « réponse » n'a pas de classe stable ; il est identifié par sa position
 * (premier enfant non vide de .chat-line__message-container) et par son <p title>.
 */

(function () {
    'use strict';

    // Version lue dans l'en-tête quand le gestionnaire l'expose : une seule source à tenir
    // à jour. La valeur écrite ici ne sert que de repli et doit rester égale à @version
    // (le banc de test le vérifie).
    const VERSION = (typeof GM_info !== 'undefined' && GM_info.script && GM_info.script.version)
        || '15.26.0';

    // Une seule instance par page. Deux gestionnaires de scripts, ou deux installations
    // sous des noms différents, feraient tourner deux observateurs et deux boucles de
    // défilement, chacune prenant les écritures de l'autre pour un geste de lecture.
    if (window.__btcInstance) {
        console.warn(`[BetterTwitchChat] v${window.__btcInstance} déjà active : seconde instance ignorée.`);
        return;
    }
    window.__btcInstance = VERSION;

    // =========================================================================
    // CONFIGURATION — tout ce qui se règle sans toucher au reste du fichier
    // =========================================================================
    const CONFIG = {
        // --- Réponses ---
        reply: {
            // Présentation de la citation :
            //   'rail'   la citation fait corps avec le message, un filet vertical dans
            //            la couleur de grade court le long de l'ensemble
            //   'inline' la citation est juste la première ligne du message, sans filet
            //   'card'   la citation est un bloc détaché avec son propre fond
            style: 'rail',
            // Fond du message qui répond à quelqu'un. Volontairement exprimé comme une
            // fraction de la couleur du texte : il s'ajoute au fond existant, donc il reste
            // visible par-dessus les couleurs de highlight 7TV (modo, VIP, first-time…), et
            // il suit le thème — clair sur fond sombre, sombre sur fond clair.
            lineTint: 'color-mix(in srgb, currentColor 8%, transparent)',
            // Fond du bloc de citation lui-même (présentation 'card'), un cran plus discret.
            blockTint: 'color-mix(in srgb, currentColor 6%, transparent)',
            // Couleur du texte cité : gris, plus sombre que le texte des messages.
            color: '#8f8f9a',
            // Taille de la citation, relative au texte du chat.
            fontScale: 0.825,
            // Interligne de la citation. Sert aussi à caler verticalement la bulle.
            lineHeight: 1.4,
            // Espace entre le bas de la citation et le début du message.
            gap: '10px',
            // Retire « Répond à » / « Replying to » et garde « @pseudo : texte ».
            hidePrefix: true,
            // Garde la petite bulle SVG à gauche de la citation.
            showIcon: true,
            // Reconstruit les emotes dans la citation (Twitch n'y met que du texte brut).
            renderEmotes: true,
            // Souligne les pseudos cités : celui de la personne à qui l'on répond et
            // les mentions présentes dans le texte cité.
            underlineNames: true,
            // Recolore le « @pseudo » cité avec sa vraie couleur de chat. Désactivé :
            // la couleur attire trop l'œil sur une citation censée rester discrète.
            colorQuotedName: false,
            // Volontairement calé sous l'interligne : une emote plus haute ferait
            // grandir la première ligne et désalignerait la bulle.
            emoteHeight: '1.3em',
            // Épaisseur du filet posé sur les réponses que 7TV ne colore pas. Là où il
            // en trace un, le nôtre s'efface : les deux s'additionneraient. Le sien est
            // déclaré en `.25rem`, donc sa valeur en pixels dépend de la police racine ;
            // 2 px est le réglage retenu à l'œil, à ajuster si le sien paraît différent.
            accentWidth: '2px',
            // Filet des réponses que ni Twitch ni 7TV ne colorent : la couleur du texte,
            // atténuée, pour rester visible sur les deux thèmes.
            accentFallback: 'color-mix(in srgb, currentColor 40%, transparent)'
        },

        // --- Notices sub / prime / gift / raid ---
        compact: {
            enabled: true,
            // Donne aux notices la typographie du texte cité : même taille, même gris.
            // Elles deviennent une information secondaire qu'on parcourt sans s'y
            // arrêter. Le pseudo garde sa couleur. À false, c'est `fontSize` qui règle
            // la taille et les notices gardent la couleur du texte de Twitch.
            quoteLook: true,
            // Redonne au pseudo d'une notice sa couleur de chat. Twitch ne la met pas :
            // le pseudo sort dans la couleur du texte, donc en gris comme le reste une
            // fois la notice compactée, et on ne voit plus de qui il s'agit.
            colorNames: true,
            // Teinte le fond de la notice avec la couleur de sa barre, comme 7TV teinte
            // les messages qu'il relève. Twitch pose la couleur d'accent de la chaîne en
            // style inline sur cette barre. 0 pour ne pas teindre du tout.
            tintOpacity: 0.15,
            fontSize: '12.5px',
            lineHeight: '1.35',
            iconSize: '15px',
            // Espace entre la barre de couleur et le texte de la notice.
            textIndent: '8px',
            // Regroupe « X offre N abonnements » + les N « X a offert un abonnement à Y »
            // en une seule notice avec la liste des destinataires.
            aggregateGifts: true,
            // Délai d'attente des gifts individuels après l'annonce du gift multiple.
            giftWindowMs: 12000,
            // Fenêtre de rattrapage pour les gifts arrivés avant l'annonce.
            giftLookbehindMs: 15000
        },

        // --- Rendu progressif (équivalents des réglages 7TV du même nom) ---
        // Délai minimal entre deux messages affichés. Twitch insère par paquets : dans
        // un chat rapide, plusieurs lignes surgissent d'un coup et le regard décroche.
        // On les relâche une par une, à la cadence de l'écran. 1 revient à une ligne par
        // image — le plus rapide qui reste progressif. 0 désactive la fonction.
        messageBatchMs: 1,
        // Durée maximale du glissement vers le bas à l'arrivée d'un message, au lieu
        // d'un saut sec. 0 désactive.
        smoothScrollMs: 1500,
        // Retard maximal toléré, en fraction de la hauteur visible. Le glissement
        // accélère de lui-même quand le chat s'emballe : sans cela, un flot soutenu
        // creuse un retard qui grandit sans fin et le bas du chat n'est jamais rejoint.
        smoothScrollMaxLag: 0.25,
        // Déplacement maximal par image, en fraction de la hauteur visible. C'est ce qui
        // garantit la continuité : sans plafond, l'accélération ci-dessus finit par
        // produire des bonds de plusieurs écrans en une seule image — mesuré à 1823 px.
        // Au-delà de ce plafond, le retard grandit pendant la bourrasque et se résorbe
        // ensuite ; le mouvement, lui, ne saute jamais.
        smoothScrollMaxStep: 0.25,

        // Alignement vertical des emotes ET des badges. Une seule valeur pour les deux :
        // réglés séparément, ils avaient dérivé de 1,95 px l'un par rapport à l'autre et
        // l'emote flottait au-dessus des badges. 'baseline' pose le bas sur la ligne
        // d'écriture, comme BTTV et FrankerFaceZ ; la valeur retenue descend d'un poil
        // sous cette ligne, ce qui aligne exactement sur les badges de Twitch. Mettre
        // null pour ne toucher à rien.
        emoteAlign: '-0.15em',
        // Espace réservé au-dessus de l'emote. Valeur reprise telle quelle de
        // FrankerFaceZ, qui l'ajoute avec le même alignement pour éviter qu'une emote
        // haute vienne mordre la ligne précédente. Les emoji en sont exemptés, comme
        // chez eux. Mettre null pour ne pas en réserver.
        emotePaddingTop: '5px',

        // --- Fonctions de la v15.26 — réglables dans le panneau (Alt+Maj+B) ---
        // Densité adaptative : au-delà de `entree` messages par seconde, mesurés sur
        // `fenetreS` secondes, le chat se resserre ; il revient à la normale sous `sortie`,
        // mesuré sur une fenêtre double et pas avant cette même durée.
        rafale: {
            enabled: true, entree: 8, sortie: 5, fenetreS: 5,
            badges: true, notices: true, citations: true, espacement: true, indicateur: true
        },
        // Fil de conversation au survol d'une réponse.
        fil: { enabled: true, estomper: true, delaiMs: 150 },
        // Résumé au retour sur l'onglet, après au moins `minimumS` secondes d'absence.
        absence: { enabled: true, minimumS: 60 },
        // Historique long, gardé dans ce navigateur (IndexedDB). Coupé par défaut.
        historique: { enabled: false, maxParChaine: 20000, jours: 7, survol: true, survolMs: 700 },
        // Pouls du chat et moments forts. Coupé par défaut. `minimum` : nombre de messages
        // par tranche de 10 s sous lequel rien n'est un pic, quelle que soit la normale.
        pouls: { enabled: false, pastille: true, sensibilite: 2.5, minimum: 8 },
        // Délai après la connexion au chat pendant lequel les lignes ne comptent pas comme
        // des arrivées en direct : Twitch y rejoue les derniers messages.
        stabilisationMs: 2000,

        // --- Divers ---
        // Trait de séparation entre les messages. Désactivé : 7TV en pose déjà un
        // (classe seventv-chat-lines-separator-twitch sur <html>), le nôtre doublait.
        separators: false,
        // Retire l'étiquette que 7TV accroche aux messages relevés par une règle
        // « Custom Highlights » (l'emoji ou le texte donné à la règle). On enlève
        // l'attribut qui la porte plutôt que de masquer son rendu : la règle qui
        // l'affiche vit dans une feuille de style d'extension qu'on ne peut pas lire,
        // et masquer les pseudo-éléments de la ligne emporterait aussi le séparateur
        // que 7TV y dessine. La couleur de grade, elle, n'est pas touchée.
        hideHighlightLabel: true,
        // Espace au-dessus des messages relevés par une règle « Custom Highlights ».
        // 7TV y réserve 1.3rem pour son étiquette et n'en met que 0.75rem en dessous ;
        // l'étiquette partie, l'espace est vide. Mettre null pour laisser 7TV décider.
        highlightPaddingTop: '0.75rem',
        // Traduit en français les notices que Twitch laisse en anglais et les notices
        // système de 7TV (celles-ci sont toujours en anglais). Sans effet si ton
        // interface Twitch est déjà en français.
        translate: true,
        // Journalise dans la console ce que le script détecte.
        debug: false
    };

    // =========================================================================
    // SÉLECTEURS
    // =========================================================================
    const SEL = {
        chatRoot: [
            '[data-test-selector="chat-scrollable-area__message-container"]',
            '.chat-scrollable-area__message-container'
        ],
        line: '.chat-line__message,[data-a-target="chat-line-message"]',
        lineContainer: '.chat-line__message-container',
        body: '[data-a-target="chat-line-message-body"]',
        username: '.chat-author__display-name',
        chatterName: '.chatter-name',
        notice: '[data-test-selector="user-notice-line"]',
        systemNotice: '[data-seventv-system-notice],.seventv-system-notice-line',
        resubCustom: '[data-a-target="chat-resubscription-message__custom-message"]',
        // Message joint à une annonce. Twitch l'enveloppe dans un conteneur dont le
        // data-a-target varie selon le type d'annonce — un abonnement et une série de
        // visionnage n'ont pas le même. La ligne de chat imbriquée, elle, est toujours
        // la même : c'est elle qu'on vise.
        nestedMessage: '.chat-line__message',
        massGiftName: '.mystery-gift-theme__displayname',
        massGiftImage: '.mystery-gift-theme__image',
        massGiftOverlay: '.mystery-gift-theme__overlay',
        emote: 'img[data-emote-name],img.seventv-emote,img.chat-image,img.chat-line__message--emote',
        // Boîtes qui portent réellement l'emote dans le flux du texte. C'est l'enveloppe
        // la plus externe qui est alignée sur la ligne, pas l'image : régler l'image
        // seule ne déplace rien à l'écran.
        emoteBox: '.seventv-emote-anchor,.seventv-emote-container,.chat-image__container,'
            + '.chat-line__message--emote-button',
        // Élément qui porte réellement le défilement du chat. 7TV stylise lui-même sa
        // scrollbar sur ce sélecteur, c'est donc une ancre déclarée, pas devinée.
        scroller: '[data-a-target="chat-scroller"]'
    };

    // Les arguments d'une fonction sont évalués avant l'appel, même quand le journal est
    // coupé. Un argument coûteux ou fragile se passe donc sous forme de fonction : il n'est
    // évalué que si le journal est actif.
    const log = (...args) => {
        if (CONFIG.debug) console.log('[BTC]', ...args.map((a) => (typeof a === 'function' ? a() : a)));
    };

    // Compteurs alimentés par le traitement, lus par l'auto-diagnostic. Chaque élément n'est
    // compté qu'une fois : un second passage (reload, rattrapage) ne les gonfle pas.
    const diag = { lignes: 0, reponses: 0, reponsesRatees: 0, notices: 0 };
    let dejaComptes = { lignes: new WeakSet(), reponses: new WeakSet(), reponsesRatees: new WeakSet() };
    const compter = (cle, el) => {
        if (dejaComptes[cle].has(el)) return;
        dejaComptes[cle].add(el);
        diag[cle]++;
    };

    // =========================================================================
    // ÉTAT PARTAGÉ — déclaré avant les fonctions qui le lisent
    // =========================================================================
    let chatRoot = null;
    // Éléments créés par ce script. L'observateur les ignore : il n'y a rien à y chercher,
    // et les retraiter coûtait des milliers de requêtes pendant un gift multiple.
    const nosNoeuds = new WeakSet();

    // Crochets des fonctions ajoutées en v15.26. Le cœur du script les déclenche, chaque
    // fonction s'y inscrit ; une fonction qui échoue n'arrête ni les autres ni le cœur.
    //   arrivee     (entrée, horodatage)  une entrée arrive en direct dans le chat
    //   entree      (info, horodatage)    la même, lue : message, notice ou système
    //   connexion   (racine)              le script se branche sur un conteneur du chat
    //   deconnexion (racine)              il s'en détache
    //   tic         ()                    chaque seconde
    //   reglages    ()                    un réglage a changé
    const crochets = { arrivee: [], entree: [], connexion: [], deconnexion: [], tic: [], reglages: [] };
    const declencher = (nom, ...args) => {
        for (const f of crochets[nom]) {
            try { f(...args); } catch (e) { console.error(`[BTC] crochet ${nom}`, e); }
        }
    };
    // Entrées du chat déjà vues (présentes au démarrage ou déjà signalées), heure de leur
    // insertion, et instant à partir duquel une insertion compte comme une arrivée.
    let entreesVues = new WeakSet();
    const horodatages = new WeakMap();
    let arriveesDes = 0;

    // =========================================================================
    // TEXTES — reconnaissance FR + EN
    // =========================================================================
    const RE = {
        // « Répond à @user : texte » / « Replying to @user: text »
        replyPrefix: /^\s*(?:Répond\s+à|En\s+réponse\s+à|Replying\s+to)\s*/i,
        // Twitch annonce une réponse dans l'aria-label de la ligne : « Réponse à X, … ».
        // Sert à repérer une réponse que nous n'aurions PAS su découper — le signal de
        // casse le plus fiable, car positif plutôt que fondé sur une absence.
        replyAria: /^\s*(?:Réponse\s+à|Replying\s+to|En\s+réponse\s+à)/i,
        // « offre 50 abonnements de niveau 1 à la communauté » / « is gifting 50 Tier 1 Subs »
        massGift: /(?:offre|a\s+offert)\s+([\d\s .,]+?)\s*abonnements?\b|is\s+gifting\s+([\d,]+)\s*Tier/i,
        // « a offert un abonnement de niveau 1 à X » / « Gifted a Tier 1 Sub to X »
        singleGift: /a\s+offert\s+un\s+abonnement|gifted\s+a\s+.*\bsub\s+to\b/i
    };

    // 7TV laisse ses notices système en anglais quelle que soit la langue de Twitch.
    const SYSTEM_NOTICE_FR = [
        [/^(\S+)\s+was\s+timed\s+out\s+for\s+(\d+)\s+seconds?$/i, (m) => `${m[1]} a été exclu ${m[2]} s`],
        [/^(\S+)\s+was\s+permanently\s+banned$/i, (m) => `${m[1]} a été banni définitivement`],
        [/^(\S+)\s+was\s+unbanned$/i, (m) => `${m[1]} a été débanni`],
        [/^(\d+)\s+messages?\s+deleted$/i, (m) => `${m[1]} message(s) supprimé(s)`],
        [/^message\s+deleted$/i, () => 'message supprimé']
    ];

    // Repli si l'interface Twitch est en anglais.
    const NOTICE_FR = [
        [/\bsubscribed with Prime\b/gi, "s'est abonné avec Prime"],
        [/\bsubscribed at Tier (\d)\b/gi, "s'est abonné au niveau $1"],
        [/\bThey've subscribed for (\d+) months?\b/gi, 'abonné depuis $1 mois'],
        [/\bis gifting (\d+) Tier (\d) Subs to the community\b/gi, 'offre $1 abonnements de niveau $2 à la communauté'],
        [/\bGifted a Tier (\d) Sub to\b/gi, 'a offert un abonnement de niveau $1 à'],
        [/\bThey've gifted a total of (\d+) Subs in the channel\b/gi, 'a déjà offert $1 abonnements sur cette chaîne'],
        [/\bIt's their first Gift Sub in the channel\b/gi, 'premier abonnement offert sur cette chaîne'],
        [/\braided with a viewer count of (\d+)\b/gi, 'a lancé un raid avec $1 viewers'],
        // Défaut de la chaîne française de Twitch, pas du rendu : « sur une série de
        // 3visionnages ». L'espace manque entre le nombre et le mot.
        [/(\d)(visionnages?)\b/gi, '$1 $2'],
        [/\bWatch Streak Reached!?:?\s*/gi, ''],
        [/\bis currently on a (\d+)-?stream streak\b/gi, 'est sur une série de $1 streams'],
        [/\s*!?\s*in\s+\S+'s channel\b/gi, ''],
        [/\bredeemed\b/gi, 'a utilisé']
    ];

    const normalizeSpaces = (s) => s.replace(/[\u00a0\u202f]/g, ' ').replace(/\s+/g, ' ').trim();
    const parseCount = (raw) => {
        if (!raw) return 0;
        const n = parseInt(raw.replace(/[\s .,]/g, ''), 10);
        return Number.isFinite(n) ? n : 0;
    };

    /**
     * N'écrit la classe que si elle manque. classList.add d'une classe déjà présente émet
     * quand même un enregistrement de mutation, que notre propre observateur recevait.
     */
    const ajouterClasse = (el, nom) => {
        if (!el.classList.contains(nom)) el.classList.add(nom);
    };

    /** Crée un élément et le déclare comme nôtre (voir nosNoeuds). */
    const creer = (tag, className) => {
        const el = document.createElement(tag);
        el.className = className;
        nosNoeuds.add(el);
        return el;
    };

    /** Exécute un traitement sans qu'une exception arrête ceux qui suivent. */
    const protege = (fn, el) => {
        try { fn(el); } catch (e) { console.error('[BTC] échec du traitement', e, el); }
    };

    // Lecture de couleur. getComputedStyle rend les couleurs « classiques » en rgb()/rgba(),
    // mais garde leur syntaxe aux autres : color(srgb …) pour un color-mix(), oklch(…)…
    // Celles-là passent par un canevas d'un pixel, qui ramène tout en sRGB 8 bits.
    const RGB = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)\s*(?:[,/]\s*([\d.]+)(%?)\s*)?\)$/i;
    const couleursLues = new Map();
    let pinceau = null;

    /** Couleur CSS → [r, g, b, a] (composantes 0-255, alpha 0-1), ou null si illisible. */
    const lireCouleur = (valeur) => {
        const v = (valeur || '').trim();
        if (!v) return null;
        if (v === 'transparent') return [0, 0, 0, 0];
        const m = v.match(RGB);
        if (m) {
            const alpha = m[4] === undefined ? 1 : parseFloat(m[4]) / (m[5] ? 100 : 1);
            return [+m[1], +m[2], +m[3], alpha];
        }
        if (couleursLues.has(v)) return couleursLues.get(v);
        let res = null;
        try {
            if (!pinceau) {
                const canevas = document.createElement('canvas');
                canevas.width = canevas.height = 1;
                pinceau = canevas.getContext('2d', { willReadFrequently: true });
            }
            // Deux témoins : une valeur refusée par le canevas laisse le précédent en place.
            pinceau.fillStyle = '#000001';
            pinceau.fillStyle = v;
            const refusee = pinceau.fillStyle === '#000001';
            pinceau.fillStyle = '#000002';
            pinceau.fillStyle = v;
            if (!(refusee && pinceau.fillStyle === '#000002')) {
                pinceau.clearRect(0, 0, 1, 1);
                pinceau.fillRect(0, 0, 1, 1);
                const [r, g, b, a] = pinceau.getImageData(0, 0, 1, 1).data;
                res = [r, g, b, a / 255];
            }
        } catch { /* canevas indisponible */ }
        if (couleursLues.size >= 200) couleursLues.delete(couleursLues.keys().next().value);
        couleursLues.set(v, res);
        return res;
    };

    /** Vrai pour toute couleur d'alpha nul, quelle que soit sa syntaxe, ou illisible. */
    const isTransparent = (color) => {
        const c = lireCouleur(color);
        return !c || c[3] === 0;
    };

    // =========================================================================
    // CSS
    // =========================================================================
    /**
     * Trois façons de présenter la citation. Elles partagent le même HTML : seule la
     * mise en forme change, via CONFIG.reply.style.
     *
     *  rail   — la citation fait corps avec le message : aucun cadre, aucun fond propre,
     *           un filet vertical dans la couleur de grade court le long de l'ensemble.
     *  inline — encore plus léger : la citation est simplement la première ligne du
     *           message, en gris et plus petite. Aucun filet.
     *  card   — la citation est un bloc détaché avec son propre fond et sa bordure.
     */
    const buildReplyStyles = (r) => ({
        rail: `
        /* Le filet est un box-shadow interne : contrairement à une bordure, il ne
           décale pas le texte du message.
           Pas de filet là où 7TV trace déjà le sien : les deux s'additionneraient et
           la barre paraîtrait deux fois trop épaisse sur les messages de grade. */
        .chat-line__message.btc-reply.btc-reply:not(.btc-native-accent) {
            box-shadow: inset ${r.accentWidth} 0 0 0 var(--btc-reply-accent);
        }
        .btc-reply-slot.btc-reply-slot {
            background: none !important;
            border: 0 !important;
            /* L'espace au-dessus est un padding, pas une marge : une marge haute
               s'effondrerait à travers les conteneurs sans bordure ni remplissage et
               s'appliquerait hors du fond du message au lieu d'aérer la citation. */
            padding: ${r.gap} 0 0 0 !important;
            margin: 0 0 ${r.gap} 0 !important;
        }`,

        inline: `
        .btc-reply-slot.btc-reply-slot {
            background: none !important;
            border: 0 !important;
            padding: ${r.gap} 0 0 0 !important;
            margin: 0 0 ${r.gap} 0 !important;
        }`,

        card: `
        .btc-reply-slot.btc-reply-slot {
            background-image: linear-gradient(var(--btc-reply-block-tint), var(--btc-reply-block-tint));
            border-left: ${r.accentWidth} solid var(--btc-reply-accent);
            border-radius: 2px;
            padding: calc(${r.gap} / 2) 6px !important;
            margin: ${r.gap} 0 ${r.gap} 0 !important;
        }`
    });

    const buildCSS = () => {
        const r = CONFIG.reply;
        const c = CONFIG.compact;
        const REPLY_STYLES = buildReplyStyles(r);

        // Spécificité renforcée. Twitch stylise la citation via une classe
        // styled-components hachée (.OLUUU au moment où ceci est écrit) qui déclare
        // `font-size: var(--font-size-5) !important`. À spécificité égale (0,1,0) et
        // avec !important des deux côtés, c'est l'ordre du document qui tranche — et
        // styled-components injecte ses feuilles après la nôtre, donc nous perdions.
        // La classe doublée porte la spécificité à (0,2,0), le sélecteur de type à
        // (0,2,1) : nous passons devant quel que soit l'ordre, sans dépendre du hachage
        // de Twitch qui change à chaque build.
        // Espace entre l'icône et le texte d'une notice. Nommé parce que deux règles
        // doivent s'accorder dessus : celle qui l'écarte, et celle qui aligne le message
        // d'abonnement sur ce même bord.
        const NOTICE_GAP = '6px';
        // Vignette « cadeau mystère » d'un gift multiple. La liste de ses destinataires se
        // retire d'autant, pour s'aligner sur le texte qui suit la vignette.
        const GIFT_IMG = 26;
        const GIFT_IMG_GAP = 6;
        // Typographie d'un message de chat Twitch, reprise par le message joint à une
        // notice quand l'apparence « citation » est désactivée.
        const MESSAGE_FONT_SIZE = '14px';
        const MESSAGE_LINE_HEIGHT = '1.5';
        const MSG = `.btc-notice-line.btc-notice-line ${SEL.nestedMessage}`;
        const Q = 'p.btc-reply-quote.btc-reply-quote';
        const NL = '.btc-notice-line.btc-notice-line';
        const NC = '.btc-notice-card.btc-notice-card';
        const S = '.btc-reply-slot.btc-reply-slot';

        return `
        :root {
            --btc-reply-line-tint: ${r.lineTint};
            --btc-reply-block-tint: ${r.blockTint};
            --btc-reply-color: ${r.color};
            --btc-reply-font-scale: ${r.fontScale};
            --btc-reply-emote-height: ${r.emoteHeight};
            --btc-reply-accent: ${r.accentFallback};
        }

        /* ---------- 1. Message qui répond à quelqu'un ---------- */
        /* Teinte additive : elle se compose avec le fond posé par 7TV (highlight de
           grade, first-time chatter…) au lieu de l'écraser. */
        .chat-line__message.btc-reply.btc-reply {
            background-image: linear-gradient(var(--btc-reply-line-tint), var(--btc-reply-line-tint));
        }

        /* ---------- 2. Citation ---------- */
        ${REPLY_STYLES[r.style] || REPLY_STYLES.rail}

        ${S} > * {
            align-items: flex-start !important;
        }
        /* La bulle vit dans un wrapper en display:block plus haut qu'elle. Alignée en
           haut de la rangée, elle flottait au-dessus du texte, et le décalage variait
           selon que la première ligne contenait une emote ou non. On donne au wrapper
           la hauteur exacte d'une ligne de citation et on y centre la bulle :
           l'ancrage devient indépendant du contenu. */
        ${S} .tw-svg,
        ${S} > * > div:first-child:has(svg) {
            height: calc(var(--btc-reply-font-scale) * ${r.lineHeight}em) !important;
            display: flex !important;
            align-items: center !important;
            justify-content: center !important;
            flex: 0 0 auto !important;
        }
        /* Twitch tronque la citation avec overflow:hidden posé sur des wrappers
           intermédiaires : on les neutralise pour que le texte puisse se dérouler. */
        ${S},
        ${S} > *,
        ${S} > * > * {
            overflow: visible !important;
            max-height: none !important;
            min-width: 0 !important;
        }
        ${Q} {
            display: block !important;
            white-space: normal !important;
            overflow: visible !important;
            text-overflow: clip !important;
            -webkit-line-clamp: none !important;
            -webkit-box-orient: initial !important;
            max-height: none !important;
            height: auto !important;
            font-size: calc(1em * var(--btc-reply-font-scale)) !important;
            line-height: ${r.lineHeight} !important;
            color: var(--btc-reply-color) !important;
            overflow-wrap: anywhere !important;
        }
        ${Q} .btc-reply-emote {
            height: var(--btc-reply-emote-height) !important;
            width: auto !important;
            /* Assurance : la largeur peut venir d'un aspect-ratio mémorisé. S'il était
               faux, l'emote serait étirée plutôt que simplement mal cadrée. */
            object-fit: contain !important;
            vertical-align: -0.32em !important;
            margin: 0 1px !important;
            display: inline-block !important;
        }
        ${Q} .btc-reply-mention {
            color: inherit !important;
            font-weight: 600 !important;
        }
        ${Q} .btc-reply-target {
            font-weight: 600 !important;
        }
        ${r.underlineNames ? `
        ${Q} .btc-reply-mention,
        ${Q} .btc-reply-target {
            text-decoration: underline !important;
            text-underline-offset: 2px !important;
        }` : ''}
        ${S} svg {
            width: calc(var(--btc-reply-font-scale) * 1.15em) !important;
            height: calc(var(--btc-reply-font-scale) * 1.15em) !important;
            opacity: 0.55;
            flex-shrink: 0;
        }
        ${r.showIcon ? '' : `${S} svg { display: none !important; }`}

        /* ---------- 3. Notices sub / prime / gift compactées ---------- */
        ${c.enabled ? `
        /* Aucune marge à gauche de la carte : c'est elle qui décollait la barre de
           couleur du bord. L'espace avant le texte est repris sur la ligne de notice. */
        ${NC} {
            padding: 3px 8px 3px 0 !important;
            margin: 1px 0 !important;
            /* Teinte additive : posée en dégradé, elle se compose avec le fond de Twitch
               au lieu de l'écraser — même procédé que le fond des réponses. La variable
               est renseignée en JS depuis la couleur de la barre ; sans elle, la règle
               retombe sur du transparent et ne change rien. */
            background-image: linear-gradient(var(--btc-notice-tint, transparent),
                                              var(--btc-notice-tint, transparent)) !important;
        }
        ${NC} .btc-notice-bar {
            width: 3px !important;
            min-width: 3px !important;
        }
        ${NL} {
            /* Même expression que la citation, donc exactement la même taille rendue :
               une valeur en pixels recopiée à la main divergerait au premier réglage. */
            font-size: ${c.quoteLook
                ? `calc(1em * var(--btc-reply-font-scale))`
                : c.fontSize} !important;
            line-height: ${c.lineHeight} !important;
            padding: 0 0 0 ${c.textIndent} !important;
            /* Repère de positionnement pour l'icône, sortie du flux plus bas. */
            position: relative !important;
        }
        /* L'icône est centrée sur la notice entière, message d'abonnement compris. Elle
           ne peut donc pas rester dans la rangée icône + texte : cette rangée s'arrête
           au texte, et l'icône se retrouvait haut placée dès qu'un message suivait. On
           la sort du flux et on réserve sa place par un remplissage sur la notice — ce
           qui aligne du même coup TOUT le contenu, texte et message, sur un seul bord
           gauche, au lieu de dépendre d'un retrait recopié à deux endroits.
           Le remplissage n'est posé que s'il y a une icône : un gift multiple n'en a
           pas, et son texte serait décalé dans le vide. */
        ${NL}:has(.btc-notice-icon) {
            padding-left: calc(${c.textIndent} + ${c.iconSize} + ${NOTICE_GAP}) !important;
        }
        ${NL} .btc-notice-icon {
            position: absolute !important;
            left: ${c.textIndent} !important;
            top: 50% !important;
            transform: translateY(-50%) !important;
            height: calc(${c.lineHeight} * 1em) !important;
            width: ${c.iconSize} !important;
            display: flex !important;
            align-items: center !important;
        }
        ${NL} p,
        ${NL} span:not(.btc-gift-recipient) {
            line-height: ${c.lineHeight} !important;
        }
        /* Twitch déclare la taille de police sur ses propres composants de texte — les
           classes CoreText hachées — et en !important. La taille posée sur la ligne de
           notice était donc réécrite fragment par fragment : la notice restait à la
           taille de Twitch pendant que le message d'abonnement, lui, suivait la nôtre.
           Même rapport de force que sur la citation, même parade : le sélecteur de type
           porte la spécificité à (0,2,1) et passe devant, sans dépendre d'un hachage qui
           change à chaque build. On hérite au lieu de recalculer — la ligne porte déjà
           la bonne taille, et répéter calc(1em * échelle) la réduirait à chaque niveau. */
        ${NL} p,
        ${NL} span,
        ${NL} div,
        ${NL} a,
        ${NL} b,
        ${NL} strong,
        ${NL} button {
            font-size: inherit !important;
        }
        ${NL} > * svg {
            width: ${c.iconSize} !important;
            height: ${c.iconSize} !important;
        }
        /* Le message écrit par la personne qui se réabonne est une ligne de chat
           complète, imbriquée dans la notice et rendue par Twitch à sa taille normale.
           Il vit en principe hors du bloc de texte de la notice, et ressortait comme un
           corps étranger au milieu d'une notice à la taille d'une citation. Il prend donc
           la même typographie — ce sont, comme une citation, les mots de quelqu'un
           d'autre — mais garde son propre bloc : c'est du texte libre, le fondre dans la
           phrase de Twitch brouillerait qui parle. S'il se retrouve dans le bloc de texte,
           la règle de mise en ligne plus bas l'exclut explicitement, lui et son contenu.

           On hérite de la taille au lieu de réappliquer l'expression de la citation :
           celle-ci est relative au em du parent, et le parent est déjà réduit — la
           réappliquer ici réduirait une seconde fois. */
        ${NL} ${SEL.resubCustom},
        ${MSG} {
            font-size: ${c.quoteLook ? 'inherit' : MESSAGE_FONT_SIZE} !important;
            line-height: ${c.quoteLook ? c.lineHeight : MESSAGE_LINE_HEIGHT} !important;
            /* Aucun retrait propre : le remplissage de la notice place déjà le message
               sur le même bord gauche que le texte de l'annonce. */
            margin: 2px 0 0 0 !important;
        }
        /* Twitch enveloppe pseudo et badges dans un <button>, dont la feuille par défaut
           du navigateur garde le remplissage et la bordure — 1px 6px et 2px, soit 8 px
           qui décalaient les badges vers la droite par rapport au texte de l'annonce.
           On neutralise la boîte du bouton plutôt que de compter sur Twitch pour le
           faire : rien ne garantit qu'il la réinitialise sur toutes ses pages. */
        ${MSG} button {
            padding: 0 !important;
            border: 0 !important;
            margin: 0 !important;
            background: none !important;
            vertical-align: baseline !important;
        }
        /* La ligne imbriquée porte le remplissage d'un message de chat : dans une
           notice, ces 20 px de côté décalent le texte sans rien apporter. */
        ${MSG} {
            padding: 0 !important;
        }
        ${MSG} svg {
            width: auto !important;
            height: auto !important;
        }
        /* Illustration « cadeau mystère » : de 100 px de haut à une vignette. */
        ${NL} ${SEL.massGiftImage} {
            width: ${GIFT_IMG}px !important;
            height: ${GIFT_IMG}px !important;
            object-fit: contain !important;
            margin: 0 ${GIFT_IMG_GAP}px 0 0 !important;
        }
        ${NL} ${SEL.massGiftOverlay} {
            display: none !important;
        }
        ${NL} ${SEL.massGiftName} {
            display: inline !important;
            font-size: ${c.quoteLook ? 'inherit' : c.fontSize} !important;
            margin: 0 !important;
        }
        /* Bord gauche irrégulier : l'icône vivait dans le flux du texte, si bien que la
           première ligne démarrait après elle et les suivantes revenaient sous elle. La
           rangée devient une colonne d'icône plus un bloc de texte, ce qui aligne toutes
           les lignes. Les trois rôles sont étiquetés en JS : la profondeur du porte-icône
           varie d'un type de notice à l'autre, un sélecteur CSS unique se tromperait de
           cible — il l'a fait. */
        /* L'icône étant hors du flux, la rangée n'a plus rien à répartir : un bloc
           ordinaire suffit, et le texte occupe toute la largeur restante. */
        ${NL} .btc-notice-row {
            display: block !important;
        }
        ${NL} .btc-notice-text {
            display: block !important;
            min-width: 0 !important;
        }

        /* Twitch enveloppe le pseudo dans des conteneurs rendus en bloc, ce qui le
           pousse sur sa propre ligne au-dessus du texte de la notice. On les remet en
           ligne pour que la notice tienne en un seul paragraphe. Le conteneur
           intermédiaire est visé par sa structure et non par sa classe hachée. */
        ${NL} span:has(> .chatter-name),
        ${NL} .chatter-name,
        ${NL} .chatter-name span {
            display: inline !important;
        }

        /* Une notice tient en un seul flux. Le pseudo n'est pas le seul bloc que Twitch
           y place : une « série de visionnage » range le pseudo et les points de chaîne
           dans une rangée à part, au-dessus du texte, et cette rangée contient
           elle-même des <p> — soit trois retours à la ligne pour une seule notice.
           Plutôt que d'énumérer des structures qui changeront, tout ce qui vit dans le
           bloc de texte passe en ligne.

           Exception : le message personnalisé d'un resub, du texte libre écrit par la
           personne, garde son propre bloc s'il se trouve ici. Les :not() le retirent de
           la sélection, lui (X), tout ce qu'il contient (X *) et, pour les div, les
           conteneurs qui l'entourent (:has(X)) : un bloc ne se loge pas dans une ligne. */
        ${NL} .btc-notice-text div:not(${SEL.nestedMessage}):not(${SEL.nestedMessage} *):not(:has(${SEL.nestedMessage})),
        ${NL} .btc-notice-text p:not(${SEL.nestedMessage}):not(${SEL.nestedMessage} *),
        ${NL} .btc-notice-text span:not(${SEL.nestedMessage}):not(${SEL.nestedMessage} *) {
            display: inline !important;
        }

        /* Ces fragments étaient séparés par des sauts de bloc, pas par des espaces :
           mis bout à bout ils se recollent (« StreakUser01+ », « 450Série de visionnage
           atteinte ! »). On rend l'espace à tout fragment qui en précède un autre. Le
           dernier n'en reçoit pas, sinon la notice traînerait une espace en fin de
           ligne. Là où Twitch écrit déjà l'espace dans son texte, l'élément se trouve
           être le dernier de son parent : aucun doublon possible. */
        ${NL} .btc-notice-text div:not(:last-child)::after,
        ${NL} .btc-notice-text p:not(:last-child)::after,
        ${NL} .btc-notice-text .chatter-name:not(:last-child)::after {
            content: " ";
            white-space: pre;
        }

        /* Une boîte rendue en ligne ignore width et height : l'icône de points de
           chaîne, que Twitch dimensionnait par son conteneur, repartait à sa taille
           naturelle et faisait enfler la ligne. On la borne sur l'interligne.
           L'illustration du gift multiple a sa propre taille, plus bas. */
        ${NL} .btc-notice-text img:not(${SEL.massGiftImage}) {
            height: calc(${c.lineHeight} * 1em) !important;
            width: auto !important;
            vertical-align: -0.2em !important;
        }

        /* Le conteneur du nom du donateur peut être une colonne flex, qui garderait le
           pseudo au-dessus du texte malgré le display:inline. On le repasse en bloc.
           Visé par sa structure : sa classe est un hachage. */
        ${NL} div:has(> ${SEL.massGiftName}) {
            display: block !important;
        }

        /* Le nom du donateur est un <p> passé en inline : sans ça, il se recolle au
           texte qui suit (« SquidNinja00offre 50 abonnements »). */
        ${NL} ${SEL.massGiftName}::after {
            content: " ";
            white-space: pre;
        }

        /* Apparence « citation » : le texte de la notice reprend le gris du texte cité
           pour rester une information secondaire. Le pseudo est exclu — c'est lui qui
           permet de reconnaître la notice d'un coup d'œil, il garde sa couleur. */
        ${c.quoteLook ? `
        /* Visé sur la ligne de notice entière et non sur son bloc de texte : ce bloc
           n'est étiqueté qu'à partir de l'icône SVG, et un gift multiple n'en a pas —
           il restait blanc au milieu de notices grises.
           Les pseudos sont exclus : ce sont eux qui permettent de reconnaître la notice
           d'un coup d'œil. Leur couleur est posée en style inline par Twitch, qu'un
           !important de notre côté écraserait sans cette exception. */
        ${NL},
        ${NL} p:not(${SEL.massGiftName}),
        ${NL} span:not(.chatter-name):not(.chatter-name *):not(${SEL.username}):not(${SEL.username} *) {
            color: var(--btc-reply-color) !important;
        }
        /* Twitch enveloppe pseudo et badges dans un <button>, et la feuille par défaut
           du navigateur y impose 13.33px sans héritage. Tout ce qui s'exprime en em à
           l'intérieur se résout donc sur cette taille-là et non sur celle de la notice.
           On rétablit l'héritage sur tout le sous-arbre avant de dimensionner quoi que
           ce soit en em. */
        ${MSG} *,
        ${NL} ${SEL.resubCustom} * {
            font-size: inherit !important;
        }
        /* Badges remis à l'échelle du texte réduit. */
        ${MSG} .chat-badge {
            height: calc(${c.lineHeight} * 1em) !important;
            width: auto !important;
        }
        /* Un pseudo dont la couleur reste inconnue — la personne n'a pas encore parlé —
           ne doit pas fondre dans le gris de la notice : il garde la couleur de texte
           de Twitch, comme avant compactage. Le style inline posé par le script quand
           la couleur est connue passe devant, un !important en ligne l'emportant sur un
           !important de feuille quelle que soit la spécificité. */
        ${NL} .chatter-name,
        ${NL} ${SEL.massGiftName} {
            color: var(--color-text-base, #efeff1) !important;
        }
        /* Un pseudo dont on a retrouvé la couleur : les enveloppes intérieures que
           Twitch colore par ses propres classes doivent suivre la nôtre. Posée
           uniquement sur les pseudos recolorés, pour que les autres gardent le rendu
           de Twitch au lieu de virer au gris. */
        ${NL} .btc-notice-name span {
            color: inherit !important;
        }
        ` : ''}
        ` : ''}

        /* ---------- Regroupement des gifts multiples ---------- */
        .btc-hidden { display: none !important; }
        /* Couleurs tirées de celle du texte : lisibles sur le thème sombre comme sur le
           clair, là où un blanc semi-transparent disparaissait sur fond blanc. */
        .btc-gift-recipients {
            margin: 3px 0 0 ${GIFT_IMG + GIFT_IMG_GAP}px;
            color: color-mix(in srgb, currentColor 72%, transparent);
            font-size: 0.95em;
            line-height: 1.35;
            overflow-wrap: anywhere;
        }
        .btc-gift-recipient:not(:last-child)::after {
            content: ", ";
            color: color-mix(in srgb, currentColor 62%, transparent);
        }
        .btc-gift-pending {
            opacity: 0.6;
            font-style: italic;
        }

        /* ---------- Séparateurs ---------- */
        ${CONFIG.separators ? `
        .chat-line__message:not(.chat-line--inline),
        .btc-notice-card,
        .chat-line__status,
        .seventv-system-notice-line {
            border-bottom: 1px solid color-mix(in srgb, currentColor 8%, transparent) !important;
            padding-bottom: 4px !important;
        }
        ` : ''}

        /* ---------- Espace au-dessus des messages relevés par 7TV ---------- */
        /* 7TV réserve 1.3rem au-dessus de ces messages pour y poser son étiquette de
           règle, contre 0.75rem en dessous. L'étiquette retirée, ce déséquilibre ne
           correspond plus à rien. Sa règle a une spécificité de (0,10,0) — un :is()
           suivi de huit :not() — mais elle n'est pas !important : la nôtre l'emporte
           donc sans avoir à rivaliser de sélecteur. */
        ${CONFIG.highlightPaddingTop ? `
        .seventv-chat-message-custom-highlight {
            padding-top: ${CONFIG.highlightPaddingTop} !important;
        }
        ` : ''}

        /* ---------- Affichage progressif ---------- */
        /* display:none plutôt que visibility:hidden : la ligne ne doit pas occuper sa
           place tant qu'elle n'est pas relâchée, sinon le chat se décale d'un vide. */
        .btc-differe { display: none !important; }

        /* ---------- Alignement emotes / badges ---------- */
        /* Une seule valeur pour les emotes et les badges, sinon les deux dérivent : ils
           étaient réglés séparément et l'emote flottait 1,95 px au-dessus des badges.

           Le retrait n'est posé que sur la boîte la plus externe. 7TV empile enveloppe
           sur enveloppe autour de chaque emote, et un décalage appliqué à chaque niveau
           s'additionne — mesuré : le même réglage partout doublait l'écart au lieu de
           l'annuler. Les niveaux intérieurs sont donc remis à plat sur la ligne de base,
           pour ne rien ajouter au retrait de l'enveloppe qui les porte. */
        ${CONFIG.emoteAlign ? (() => {
            const boites = SEL.emoteBox;
            const tout = `${SEL.emoteBox},${SEL.emote},.chat-badge`;
            return `
        .chat-line__message :is(${tout}) {
            vertical-align: ${CONFIG.emoteAlign} !important;
        }
        /* Niveaux intérieurs remis à plat. Leur sélecteur est plus spécifique que celui
           ci-dessus, ils reprennent donc la main quel que soit l'ordre. */
        .chat-line__message :is(${boites}) :is(${boites},${SEL.emote}) {
            vertical-align: baseline !important;
        }`;
        })() : ''}
        /* Espace au-dessus, comme FrankerFaceZ. Posé sur l'enveloppe externe et non sur
           l'image : 7TV superpose les emotes « zero-width » à l'intérieur de l'enveloppe,
           et décaler la seule image de base les désolidariserait. Les emoji en sont
           exemptés, comme chez FFZ — sans quoi une ligne d'emoji grandirait sans raison. */
        ${CONFIG.emotePaddingTop ? `
        .chat-line__message :is(${SEL.emoteBox}):not(:is(${SEL.emoteBox}) *):not(:has(img.seventv-emoji)) {
            padding-top: ${CONFIG.emotePaddingTop} !important;
        }` : ''}

        /* ---------- Densité adaptative en rafale ---------- */
        /* Classe posée sur <html> quand le débit dépasse le seuil d'entrée. Chaque effet
           est une option ; aucun ne touche au texte des messages eux-mêmes. */
        ${CONFIG.rafale.badges ? `
        .btc-rafale .chat-line__message .chat-badge:not([alt*="odérat" i]):not([alt*="oderator" i]):not([alt*="VIP" i]):not([alt*="iffuse" i]):not([alt*="roadcaster" i]):not([alt*="taff" i]):not([alt*="dmin" i]),
        .btc-rafale .chat-line__message .seventv-chat-badge {
            display: none !important;
        }` : ''}
        ${CONFIG.rafale.notices ? `
        .btc-rafale .btc-notice-line .btc-notice-text,
        .btc-rafale .btc-gift-recipients {
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
        }
        .btc-rafale .btc-notice-line:not(:hover) ${SEL.nestedMessage},
        .btc-rafale .btc-notice-line:not(:hover) ${SEL.resubCustom} {
            display: none !important;
        }` : ''}
        ${CONFIG.rafale.citations ? `
        .btc-rafale p.btc-reply-quote.btc-reply-quote {
            white-space: nowrap !important;
            overflow: hidden !important;
            text-overflow: ellipsis !important;
        }` : ''}
        ${CONFIG.rafale.espacement ? `
        .btc-rafale .chat-line__message {
            padding-top: 2px !important;
            padding-bottom: 2px !important;
        }
        .btc-rafale .btc-reply-slot.btc-reply-slot {
            padding-top: 2px !important;
            margin-bottom: 2px !important;
        }
        .btc-rafale.btc-rafale .chat-line__message :is(${SEL.emoteBox}):not(:is(${SEL.emoteBox}) *) {
            padding-top: 0 !important;
        }` : ''}

        /* ---------- Fil de conversation au survol ---------- */
        /* Contour plutôt que fond ou ombre : le fond porte déjà la teinte des réponses et
           les highlights de 7TV, l'ombre intérieure porte le filet du style « rail ». */
        :root {
            --btc-fil-couleur: #a970ff;
        }
        .chat-line__message.btc-fil-parent {
            outline: 1px solid var(--btc-fil-couleur) !important;
            outline-offset: -1px;
        }
        .chat-line__message.btc-fil-enfant {
            outline: 1px dashed var(--btc-fil-couleur) !important;
            outline-offset: -1px;
        }
        .chat-line__message.btc-fil-actif {
            outline: 1px solid color-mix(in srgb, var(--btc-fil-couleur) 50%, transparent) !important;
            outline-offset: -1px;
        }
        .btc-fil :is(${SEL.chatRoot.join(',')}) > :not(:has(.btc-fil-actif, .btc-fil-parent, .btc-fil-enfant)):not(.btc-fil-actif, .btc-fil-parent, .btc-fil-enfant) {
            opacity: 0.35 !important;
        }
        @media (prefers-reduced-motion: no-preference) {
            :is(${SEL.chatRoot.join(',')}) > * {
                transition: opacity 0.12s ease-out;
            }
        }

        /* ---------- Message rejoint depuis une carte ---------- */
        @keyframes btc-repere {
            from { outline-color: var(--btc-fil-couleur); }
            to { outline-color: transparent; }
        }
        .btc-repere {
            outline: 2px solid transparent !important;
            outline-offset: -2px;
            animation: btc-repere 2.4s ease-out;
        }
        @media (prefers-reduced-motion: reduce) {
            .btc-repere {
                animation: none;
                outline-color: var(--btc-fil-couleur) !important;
            }
        }

        /* ---------- Bouton du panneau, à côté des réglages du chat ---------- */
        .btc-bouton {
            display: inline-flex !important;
            align-items: center;
            justify-content: center;
            width: 30px;
            height: 30px;
            margin: 0 2px;
            padding: 0;
            border: 0;
            border-radius: 4px;
            background: transparent;
            color: inherit;
            cursor: pointer;
            opacity: 0.8;
        }
        .btc-bouton:hover {
            opacity: 1;
            background: color-mix(in srgb, currentColor 12%, transparent);
        }
        .btc-bouton:focus-visible {
            outline: 2px solid var(--btc-fil-couleur);
            outline-offset: 1px;
        }

        `;
    };

    const injectCSS = () => {
        const id = 'btc-styles';
        let style = document.getElementById(id);
        if (!style) {
            style = document.createElement('style');
            style.id = id;
            (document.head || document.documentElement).appendChild(style);
        }
        style.textContent = buildCSS();
    };

    /**
     * Styles de la couche d'interface (panneau, pastille, cartes), dans un shadow DOM.
     * Les couleurs reprennent les variables de thème de Twitch, qui traversent le shadow
     * DOM ; les valeurs de repli sont celles du thème sombre.
     */
    function cssInterface() {
        return `
        :host {
            --fond: var(--color-background-base, #18181b);
            --fond-2: var(--color-background-alt, #26262c);
            --fond-3: var(--color-background-alt-2, #2f2f35);
            --texte: var(--color-text-base, #efeff1);
            --texte-2: var(--color-text-alt-2, #adadb8);
            --bord: color-mix(in srgb, var(--texte) 16%, transparent);
            --accent: var(--color-text-link, #bf94ff);
            --alerte: #f5333f;
            --rayon: 8px;
            color: var(--texte);
            font: 13px/1.45 Inter, Roobert, "Helvetica Neue", Helvetica, Arial, sans-serif;
        }
        [hidden] { display: none !important; }
        button, input, select, textarea { font: inherit; color: inherit; }
        button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible {
            outline: 2px solid var(--accent);
            outline-offset: 1px;
        }
        .couche { position: fixed; pointer-events: none; }
        .couche > * { pointer-events: auto; }

        /* Panneau */
        .panneau {
            position: fixed;
            top: 64px;
            right: 16px;
            width: min(440px, calc(100vw - 32px));
            max-height: calc(100vh - 96px);
            display: flex;
            flex-direction: column;
            background: var(--fond);
            color: var(--texte);
            border: 1px solid var(--bord);
            border-radius: 12px;
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
            overflow: hidden;
        }
        .panneau > header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 14px 8px; }
        .titre { display: flex; align-items: baseline; gap: 8px; }
        .titre strong { font-size: 15px; letter-spacing: 0.01em; }
        .version { color: var(--texte-2); font-size: 12px; font-variant-numeric: tabular-nums; }
        .fermer {
            border: 0;
            background: transparent;
            font-size: 20px;
            line-height: 1;
            width: 28px;
            height: 28px;
            border-radius: 6px;
            cursor: pointer;
            color: var(--texte-2);
        }
        .fermer:hover { background: var(--fond-2); color: var(--texte); }
        .onglets { display: flex; gap: 4px; padding: 0 10px; border-bottom: 1px solid var(--bord); }
        .onglets button {
            border: 0;
            background: transparent;
            padding: 8px 10px;
            cursor: pointer;
            color: var(--texte-2);
            border-bottom: 2px solid transparent;
            margin-bottom: -1px;
            font-weight: 600;
        }
        .onglets button[aria-selected="true"] { color: var(--texte); border-bottom-color: var(--accent); }
        .vue { overflow: auto; padding: 12px 14px 16px; display: grid; gap: 12px; align-content: start; }

        /* Réglages */
        .groupe { border: 1px solid var(--bord); border-radius: var(--rayon); padding: 8px 12px 10px; margin: 0; display: grid; gap: 8px; min-width: 0; }
        .groupe legend {
            padding: 0 6px;
            font-weight: 700;
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: var(--texte-2);
        }
        .reglage { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 2px 10px; }
        .reglage.bool { grid-template-columns: auto minmax(0, 1fr); }
        .reglage .aide { grid-column: 1 / -1; }
        .reglage.bool .aide { grid-column: 2; }
        .reglage input[type="checkbox"] { width: 16px; height: 16px; margin: 0; accent-color: var(--accent); }
        .champ { display: inline-flex; align-items: center; gap: 6px; }
        input[type="number"], input[type="search"], select, textarea {
            background: var(--fond-2);
            border: 1px solid var(--bord);
            border-radius: 6px;
            padding: 5px 8px;
            min-width: 0;
        }
        input[type="number"] { width: 6.5em; text-align: right; font-variant-numeric: tabular-nums; }
        .unite { color: var(--texte-2); font-size: 12px; }
        .aide { color: var(--texte-2); font-size: 12px; margin: 0; }
        .alerte { color: var(--alerte); font-size: 12px; margin: 0; }
        .etat { display: grid; gap: 6px; justify-items: start; }
        .etat p { margin: 0; }
        .pied { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
        .pied .aide, .pied .alerte { flex-basis: 100%; }
        .principal, .secondaire { border-radius: 6px; padding: 6px 12px; cursor: pointer; font-weight: 600; }
        .principal { background: var(--accent); color: var(--fond); border: 0; }
        .secondaire { background: var(--fond-2); border: 1px solid var(--bord); }
        .secondaire:hover { background: var(--fond-3); }
        .danger { border-color: var(--alerte); color: var(--alerte); }
        .lien { border: 0; background: none; padding: 0 0 0 6px; color: var(--accent); cursor: pointer; text-decoration: underline; }

        /* Historique */
        .recherche { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px; }
        .recherche #btc-h-texte { grid-column: 1 / -1; }
        .resume { margin: 0; color: var(--texte-2); font-size: 12px; }
        .resultats { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
        .resultats li {
            display: grid;
            grid-template-columns: auto auto minmax(0, 1fr);
            gap: 0 8px;
            align-items: baseline;
            padding: 4px 6px;
            border-radius: 6px;
        }
        .resultats li:nth-child(odd) { background: var(--fond-2); }
        .resultats li.notice { color: var(--texte-2); }
        .resultats time { color: var(--texte-2); font-size: 11px; font-variant-numeric: tabular-nums; white-space: nowrap; }
        .resultats .pseudo { border: 0; background: none; padding: 0; font-weight: 700; cursor: pointer; white-space: nowrap; }
        .resultats .texte { overflow-wrap: anywhere; }

        /* Pouls */
        .chiffres { margin: 0; font-variant-numeric: tabular-nums; }
        .graphe { width: 100%; height: 120px; display: block; background: var(--fond-2); border-radius: 6px; --trace: var(--accent); }
        .vue h3 { margin: 4px 0 0; font-size: 13px; }
        .moments { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
        .moments li { display: flex; flex-wrap: wrap; gap: 0 6px; align-items: baseline; }
        .moments time { font-variant-numeric: tabular-nums; color: var(--texte-2); }
        .copie { width: 100%; box-sizing: border-box; }

        /* Pastille, en haut à droite du chat */
        .pastille {
            position: absolute;
            top: 6px;
            right: 14px;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 2px 8px 2px 6px;
            border-radius: 999px;
            border: 1px solid var(--bord);
            background: color-mix(in srgb, var(--fond) 88%, transparent);
            font-size: 12px;
            cursor: pointer;
            font-variant-numeric: tabular-nums;
            --trace: var(--accent);
        }
        .pastille .mini { width: 60px; height: 16px; display: block; }
        .pastille .etiquette { color: var(--texte-2); max-width: 9em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .pastille .etiquette:empty { display: none; }
        .pastille.rafale { border-color: var(--alerte); }
        .pastille.rafale .valeur { color: var(--alerte); font-weight: 700; }
        .pastille.pic { box-shadow: 0 0 0 2px color-mix(in srgb, var(--alerte) 45%, transparent); }

        /* Cartes */
        .carte { background: var(--fond); border: 1px solid var(--bord); border-radius: 10px; box-shadow: 0 8px 28px rgba(0, 0, 0, 0.4); }
        .carte.absence {
            position: absolute;
            top: 34px;
            left: 10px;
            right: 10px;
            max-height: 60%;
            overflow: auto;
            padding: 10px 12px;
            display: grid;
            gap: 6px;
        }
        .carte.absence header { display: flex; align-items: center; gap: 8px; }
        .carte.absence header .duree { color: var(--texte-2); font-variant-numeric: tabular-nums; }
        .carte.absence header .fermer { margin-left: auto; }
        .carte.absence p { margin: 0; }
        .titre-bloc { font-weight: 700; }
        .mentions { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
        .mentions .texte { overflow-wrap: anywhere; }
        .emotes { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; }
        .emote { display: inline-flex; align-items: center; gap: 2px; font-variant-numeric: tabular-nums; }
        .emote img { height: 22px; width: auto; }
        .carte.survol { position: fixed; padding: 8px 10px; font-size: 12px; pointer-events: none; display: grid; gap: 4px; }
        .carte.survol .entete { display: flex; justify-content: space-between; gap: 8px; }
        .carte.survol .entete span { color: var(--texte-2); }
        .carte.survol ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 3px; }
        .carte.survol li { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 6px; }
        .carte.survol time { color: var(--texte-2); font-variant-numeric: tabular-nums; white-space: nowrap; }
        .carte.survol li span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        @media (prefers-reduced-motion: no-preference) {
            .pastille, .carte { transition: opacity 0.15s ease-out; }
        }
        `;
    }

    // =========================================================================
    // INDEX DES EMOTES
    // Twitch ne met que du texte brut dans la citation d'une réponse. Pour y
    // réafficher les emotes, on indexe celles qui passent dans le chat.
    // =========================================================================
    const EMOTE_INDEX_MAX = 600;
    // nom -> { url, ratio }. Le ratio largeur/hauteur sert à réserver la place de
    // l'emote dans la citation avant son chargement : sans lui l'image naît à zéro de
    // large puis s'élargit d'un coup, la citation se re-découpe et le message grandit
    // une seconde fois — après que Twitch a recollé le chat en bas.
    const emoteIndex = new Map();

    const urlFromSrcset = (srcset) => {
        if (!srcset) return null;
        // « url 1x, url 2x, url 3x » — on prend le 2x s'il existe, sinon le premier.
        const entries = srcset.split(',').map(s => s.trim()).filter(Boolean);
        if (!entries.length) return null;
        const two = entries.find(e => /\s2x$/.test(e));
        return (two || entries[0]).split(/\s+/)[0] || null;
    };

    /** Ratio plausible pour une emote : au-delà, c'est une mesure aberrante. */
    const ratioPlausible = (r) => (r > 0.1 && r < 12 ? r : 0);

    const rememberEmote = (img) => {
        const name = img.dataset.emoteName || img.getAttribute('alt');
        if (!name) return;
        const connu = emoteIndex.get(name);
        // Toute emote revue repasse en tête : à l'éviction, ce sont les moins récemment
        // vues qui partent, et non les premières vues — les emotes phares de la chaîne.
        if (connu) emoteIndex.delete(name);
        // Déjà connue avec ses proportions : plus rien à en tirer. Sans elles on
        // retente, l'image de la fois précédente n'était pas encore chargée. On lit
        // uniquement les dimensions naturelles : mesurer la boîte forcerait un calcul
        // de mise en page sur chaque emote de chaque message.
        if (connu && connu.ratio) { emoteIndex.set(name, connu); return; }
        const url = (connu && connu.url)
            || img.dataset.fallbackImageUrl
            || urlFromSrcset(img.getAttribute('srcset'))
            || img.currentSrc
            || img.getAttribute('src');
        if (!url) return;
        const ratio = img.naturalWidth > 0 && img.naturalHeight > 0
            ? ratioPlausible(img.naturalWidth / img.naturalHeight)
            : 0;
        if (!connu && emoteIndex.size >= EMOTE_INDEX_MAX) {
            // On jette le quart le moins récemment vu.
            let drop = Math.floor(EMOTE_INDEX_MAX / 4);
            for (const key of emoteIndex.keys()) {
                if (drop-- <= 0) break;
                emoteIndex.delete(key);
            }
        }
        emoteIndex.set(name, { url, ratio });
    };

    // =========================================================================
    // INDEX DES COULEURS DE PSEUDO
    // La citation ne contient que « @pseudo » en texte brut. On mémorise la couleur
    // de chat de chaque personne vue passer pour pouvoir la recolorer : on identifie
    // alors d'un coup d'œil à qui le message répond.
    // =========================================================================
    const NAME_INDEX_MAX = 400;
    const nameColors = new Map(); // login ou nom affiché, en minuscules -> couleur

    // Pseudos de notice dont la couleur n'est pas encore connue (voir plus bas).
    const PENDING_NAMES_MAX = 60;
    const pendingNoticeNames = new Map();   // login -> Set(éléments)

    const applyNoticeNameColor = (el, color) => {
        ajouterClasse(el, 'btc-notice-name');
        // En important : Twitch colore les enveloppes intérieures par ses propres
        // classes, qu'un style inline ordinaire ne dépasserait pas.
        el.style.setProperty('color', color, 'important');
    };

    /**
     * Retient la couleur d'une clé. Elle repasse en tête à chaque message de la personne,
     * si bien que l'éviction touche les moins récemment vus, et elle suit un changement de
     * couleur en cours de session au lieu de garder la première vue.
     */
    const memoriserCouleur = (cle, color) => {
        nameColors.delete(cle);
        if (nameColors.size >= NAME_INDEX_MAX) nameColors.delete(nameColors.keys().next().value);
        nameColors.set(cle, color);

        // Un pseudo de notice attendait cette couleur : on le sert maintenant.
        const attente = pendingNoticeNames.get(cle);
        if (attente) {
            for (const nom of attente) {
                if (nom.isConnected) applyNoticeNameColor(nom, color);
            }
            pendingNoticeNames.delete(cle);
        }
    };

    // On indexe toujours, même quand la recoloration est désactivée : sinon activer
    // l'option depuis la console ne colorerait que les gens vus après coup.
    // Double clé : le login (data-a-user), stable, et le nom affiché, seul présent dans
    // une notice. Pour un pseudo international, les deux diffèrent.
    const indexNameColors = (noms) => {
        for (const el of noms) {
            const color = el.style.color || el.dataset.seventvChatColor;
            if (!color) continue;
            const login = (el.dataset.seventvUserLogin || el.dataset.aUser || '').trim().toLowerCase();
            const affiche = (el.textContent || '').trim().toLowerCase();
            if (login) memoriserCouleur(login, color);
            if (affiche && affiche !== login) memoriserCouleur(affiche, color);
        }
    };

    /**
     * Vrai si l'élément appartient au message qu'une personne a joint à la notice
     * `racine` : ce texte-là n'est ni traduit, ni analysé, ni recoloré comme une notice.
     */
    const dansMessageJoint = (el, racine) => {
        const joint = el && el.closest(`${SEL.nestedMessage},${SEL.resubCustom}`);
        return !!joint && joint !== racine && racine.contains(joint);
    };

    // =========================================================================
    // COULEUR DES PSEUDOS DE NOTICE
    // Twitch n'applique pas la couleur de chat au pseudo d'une notice : il sort dans la
    // couleur du texte, donc en gris comme le reste une fois la notice compactée. On la
    // repose depuis l'index alimenté par les messages. La personne n'a pas forcément
    // encore parlé — une série de visionnage récompense le fait de regarder, pas
    // d'écrire — alors le pseudo est mis en attente et recoloré dès qu'un de ses
    // messages passe.
    // =========================================================================
    const colorNoticeNames = (noticeLine) => {
        if (!CONFIG.compact.colorNames) return;
        // Source exacte quand elle existe : le message joint à un abonnement porte la
        // couleur de son auteur en style inline. Elle ne vaut que pour le pseudo de cet
        // auteur, pas pour les autres noms de la notice.
        const auteur = noticeLine.querySelector(`${SEL.nestedMessage} ${SEL.username}`);
        const couleurJointe = auteur ? (auteur.style.color || '').trim() : '';
        const nomsAuteur = new Set();
        if (auteur) {
            for (const v of [auteur.dataset.aUser, auteur.dataset.seventvUserLogin, auteur.textContent]) {
                if (v && v.trim()) nomsAuteur.add(v.trim().toLowerCase());
            }
        }

        for (const nom of noticeLine.querySelectorAll(`${SEL.chatterName},${SEL.massGiftName}`)) {
            // Le pseudo du message joint a déjà la sienne, posée par Twitch.
            if (dansMessageJoint(nom, noticeLine)) continue;
            if (nom.classList.contains('btc-notice-name')) continue;

            const login = nom.textContent.trim().toLowerCase();
            const color = (couleurJointe && nomsAuteur.has(login) ? couleurJointe : '')
                || (login && nameColors.get(login));
            if (color) { applyNoticeNameColor(nom, color); continue; }
            if (!login) continue;

            if (pendingNoticeNames.size >= PENDING_NAMES_MAX) {
                pendingNoticeNames.delete(pendingNoticeNames.keys().next().value);
            }
            let attente = pendingNoticeNames.get(login);
            if (!attente) { attente = new Set(); pendingNoticeNames.set(login, attente); }
            attente.add(nom);
        }
    };

    /** Recolore le « @pseudo » de la citation avec la couleur de chat de la personne. */
    const colorQuotedName = (quote, line) => {
        const span = quote.querySelector(':scope > span');
        if (!span) return;

        // L'étiquetage est inconditionnel : il sert aussi au soulignement, qui n'a rien
        // à voir avec la recoloration. Les lier faisait dépendre le soulignement de la
        // cible d'une option sans rapport, et seules les mentions du texte étaient
        // soulignées.
        ajouterClasse(span, 'btc-reply-target');
        if (!CONFIG.reply.colorQuotedName) return;

        // 7TV expose le login exact de la personne citée sur la ligne. On le préfère au
        // texte affiché, qui peut être un nom international ou une casse différente.
        const login = (line && line.dataset.seventvReplyParentLogin
            || span.textContent.trim().replace(/^@/, '')).toLowerCase();
        if (!login) return;
        const color = nameColors.get(login);
        if (color) span.style.color = color;
    };

    // =========================================================================
    // RÉPONSES
    // =========================================================================

    /** Twitch signale une réponse par l'aria-label ; 7TV par un attribut dédié. */
    const looksLikeReply = (line) => !!line.dataset.seventvReplyParentLogin
        || RE.replyAria.test(line.getAttribute('aria-label') || '');

    /**
     * Le bloc « réponse » n'a aucune classe stable. Twitch place systématiquement un
     * premier <div> vide dans .chat-line__message-container ; quand le message est une
     * réponse, ce div contient l'icône + un <p title="texte d'origine">.
     */
    const findReplyParts = (line) => {
        const container = line.querySelector(SEL.lineContainer);
        if (!container) return null;
        const slot = container.firstElementChild;
        if (!slot || slot.childElementCount === 0) return null;
        // Une citation porte le texte d'origine dans son title. Un <p> sans title n'est
        // retenu que si Twitch ou 7TV annoncent eux-mêmes une réponse : sinon tout bloc
        // que Twitch placerait là (bandeau, épinglage…) passerait pour une citation.
        const quote = slot.querySelector('p[title]') || (looksLikeReply(line) && slot.querySelector('p'));
        if (!quote) return null;
        return { slot, quote };
    };

    /** Récupère l'élément qui porte le texte du message d'origine dans la citation. */
    const findQuoteTextNode = (quote) => {
        // Structure observée : « Répond à <span>@user</span> : <span>texte</span> »
        const spans = quote.querySelectorAll(':scope > span');
        return spans.length ? spans[spans.length - 1] : null;
    };

    /** Remplace les noms d'emotes par des images et met les mentions en valeur. */
    const tokenizeQuote = (target) => {
        // Les nœuds déjà transformés sont ignorés : sans ça, une seconde passe
        // re-emballerait « @pseudo » dans une mention imbriquée dans la précédente.
        const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => {
                const parent = node.parentElement;
                return parent && (parent.classList.contains('btc-reply-mention')
                                  || parent.classList.contains('btc-reply-target'))
                    ? NodeFilter.FILTER_REJECT
                    : NodeFilter.FILTER_ACCEPT;
            }
        });
        const textNodes = [];
        let node;
        while ((node = walker.nextNode())) textNodes.push(node);

        for (const textNode of textNodes) {
            const text = textNode.textContent;
            if (!text || !text.trim()) continue;

            const parts = text.split(/(\s+)/);
            let needsWork = false;
            for (const part of parts) {
                const t = part.trim();
                if (!t) continue;
                if (emoteIndex.has(t) || (t.length > 1 && t[0] === '@')) { needsWork = true; break; }
            }
            if (!needsWork) continue;

            const frag = document.createDocumentFragment();
            for (const part of parts) {
                const t = part.trim();
                if (!t) { frag.appendChild(document.createTextNode(part)); continue; }

                if (emoteIndex.has(t)) {
                    const { url, ratio } = emoteIndex.get(t);
                    const img = creer('img', 'btc-reply-emote');
                    img.src = url;
                    img.alt = t;
                    img.title = t;
                    img.loading = 'lazy';
                    if (ratio) {
                        // Place réservée d'avance : le chargement ne déplace plus rien.
                        img.style.aspectRatio = String(ratio);
                    } else {
                        // Proportions inconnues : on rattrapera le décalage au chargement.
                        img.addEventListener('load', () => onEmoteChargee(img, t), { once: true });
                    }
                    frag.appendChild(img);
                } else if (t.length > 1 && t[0] === '@') {
                    const span = creer('span', 'btc-reply-mention');
                    span.textContent = t;
                    frag.appendChild(span);
                } else {
                    frag.appendChild(document.createTextNode(part));
                }
            }
            if (textNode.parentNode) textNode.parentNode.replaceChild(frag, textNode);
        }
    };

    /** Retire « Répond à » / « Replying to » en gardant « @pseudo : texte ». */
    const stripReplyPrefix = (quote) => {
        for (const child of quote.childNodes) {
            if (child.nodeType !== Node.TEXT_NODE) continue;
            const stripped = child.textContent.replace(RE.replyPrefix, '');
            if (stripped !== child.textContent) {
                child.textContent = stripped;
                return;
            }
            if (child.textContent.trim()) return; // premier texte utile, pas un préfixe
        }
    };

    /**
     * Marque les lignes où 7TV dessine déjà sa barre, pour que le style rail n'en
     * superpose pas une seconde. On ne touche à la classe que si elle change : la
     * modifier déclencherait notre propre observateur d'attributs.
     */
    const appliquerBarreNative = (line, presente) => {
        if (line.classList.contains('btc-native-accent') !== presente) {
            line.classList.toggle('btc-native-accent', presente);
        }
    };

    const HIGHLIGHT_LABEL_ATTR = 'data-seventv-custom-highlight-label';

    /**
     * Enlève l'étiquette de règle « Custom Highlights ». Retirer un attribut absent ne
     * produit aucun enregistrement de mutation : l'opération est idempotente et ne peut
     * pas relancer notre propre observateur.
     */
    const stripHighlightLabel = (el) => {
        if (!CONFIG.hideHighlightLabel) return;
        if (el.hasAttribute(HIGHLIGHT_LABEL_ATTR)) el.removeAttribute(HIGHLIGHT_LABEL_ATTR);
    };

    /**
     * Reporte la couleur posée par 7TV (highlight de grade modo/VIP, first-time chatter,
     * highlight personnalisé) sur la barre latérale du bloc de citation. On lit le style
     * calculé plutôt que des classes précises : ça marche quelle que soit la façon dont
     * 7TV applique la couleur, et ça survivra à ses prochaines mises à jour.
     */
    const applyGradeAccent = (line) => {
        let accent = null;
        // 7TV trace-t-il déjà sa propre barre à gauche de cette ligne ? Si oui, le filet
        // s'ajouterait à la sienne et la ferait paraître deux fois trop épaisse. Il faut
        // donc le mesurer, pas seulement lire la couleur déclarée : un highlight de
        // premier message, par exemple, dessine une bordure sans poser de variable.
        let barreNative = false;
        try {
            const cs = getComputedStyle(line);
            barreNative = parseFloat(cs.borderLeftWidth) > 0 && !isTransparent(cs.borderLeftColor);

            // Couleur : la variable inline de 7TV d'abord, c'est la source autoritative.
            const inline = (line.style.getPropertyValue('--seventv-chat-custom-highlight-border-color')
                || line.style.getPropertyValue('--seventv-chat-custom-highlight-color')).trim();
            if (inline) {
                line.style.setProperty('--btc-reply-accent', inline);
                appliquerBarreNative(line, barreNative);
                return;
            }

            // Repli : la couleur peut venir d'une feuille de style plutôt que d'un
            // attribut inline. Là, seul le style calculé la connaît.
            const declared = (cs.getPropertyValue('--seventv-chat-custom-highlight-border-color')
                || cs.getPropertyValue('--seventv-chat-custom-highlight-color')).trim();

            if (declared) {
                accent = declared;
            } else if (barreNative) {
                accent = cs.borderLeftColor;
            } else {
                // Fond de grade semi-transparent : on en reprend la teinte, opacifiée,
                // pour que la barre reste lisible. Un fond d'alpha nul n'en a aucune.
                const fond = lireCouleur(cs.backgroundColor);
                if (fond && fond[3] > 0) accent = `rgba(${fond[0]}, ${fond[1]}, ${fond[2]}, 0.85)`;
            }
        } catch { /* style indisponible */ }

        if (accent) line.style.setProperty('--btc-reply-accent', accent);
        else line.style.removeProperty('--btc-reply-accent');
        appliquerBarreNative(line, barreNative);
    };

    const processReply = (line) => {
        const parts = findReplyParts(line);
        if (!parts) {
            // Twitch dit que c'est une réponse mais nous n'avons pas trouvé la citation :
            // la structure a changé. C'est exactement ce qui a tué la v14 en silence.
            if (looksLikeReply(line)) compter('reponsesRatees', line);
            return;
        }
        const { slot, quote } = parts;

        // Idempotence. On se repère sur l'attribut title, qui porte le texte d'origine
        // et que Twitch met à jour quand React recycle la ligne pour un autre message.
        // Surtout pas sur textContent : on le modifie nous-mêmes, donc il dériverait et
        // le bloc serait retraité en boucle. Une ligne déjà traitée ne relit pas son style :
        // la teinte de grade suit les changements de classe par l'observateur.
        const key = quote.getAttribute('title');
        const marque = key !== null ? key : '1';
        if (quote.dataset.btcQuote === marque && line.classList.contains('btc-reply')) return;

        compter('reponses', line);
        ajouterClasse(line, 'btc-reply');
        ajouterClasse(slot, 'btc-reply-slot');
        ajouterClasse(quote, 'btc-reply-quote');
        applyGradeAccent(line);
        if (quote.dataset.btcQuote === marque) return;
        quote.dataset.btcQuote = marque;

        if (CONFIG.reply.hidePrefix) stripReplyPrefix(quote);
        colorQuotedName(quote, line);

        if (CONFIG.reply.renderEmotes) {
            const target = findQuoteTextNode(quote) || quote;
            tokenizeQuote(target);
        }
        log('réponse traitée', () => (key || '').slice(0, 60));
    };

    // =========================================================================
    // NOTICES (sub, prime, gift, raid…)
    // =========================================================================

    /** Filtre de parcours : écarte le texte du message personnel joint à `racine`. */
    const horsMessageJoint = (racine) => (node) => (dansMessageJoint(node.parentElement, racine)
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT);

    /** Texte d'une notice, sans le message que la personne y a écrit. */
    const texteDeNotice = (notice) => {
        const walker = document.createTreeWalker(notice, NodeFilter.SHOW_TEXT, { acceptNode: horsMessageJoint(notice) });
        let texte = '';
        let node;
        while ((node = walker.nextNode())) texte += node.textContent;
        return texte;
    };

    // Seul le texte de Twitch est traduit : le message joint est écrit par quelqu'un, et
    // une règle comme « redeemed → a utilisé » le défigurait.
    const translateNotice = (element) => {
        if (!CONFIG.translate) return;
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, { acceptNode: horsMessageJoint(element) });
        let node;
        while ((node = walker.nextNode())) {
            const text = node.textContent;
            if (!text || text.length < 3) continue;
            let out = text;
            // replace() sur une expression globale repart toujours du début et rend la
            // chaîne intacte s'il ne trouve rien : un test préalable doublait le travail.
            for (const [re, to] of NOTICE_FR) out = out.replace(re, to);
            if (out !== text) node.textContent = out.replace(/\s+([.,!?])/g, '$1');
        }
    };

    const translateSystemNotice = (element) => {
        if (!CONFIG.translate) return;
        const span = element.querySelector('.seventv-system-notice') || element;
        const text = normalizeSpaces(span.textContent || '');
        if (!text) return;
        for (const [re, build] of SYSTEM_NOTICE_FR) {
            const m = text.match(re);
            if (m) { span.textContent = build(m); return; }
        }
    };

    /**
     * Étiquette la rangée « icône + texte » d'une notice. La profondeur du porte-icône
     * change selon le type — un abonnement l'enveloppe d'un div de plus qu'un watch
     * streak — donc on remonte depuis l'icône jusqu'au premier ancêtre qui a un second
     * enfant : c'est la rangée, et l'enfant qu'on vient de quitter est la colonne.
     */
    const layoutNoticeRow = (noticeLine) => {
        const icon = noticeLine.querySelector('.tw-svg');
        if (!icon) return;

        let colonne = icon;
        let rangee = icon.parentElement;
        while (rangee && rangee !== noticeLine && rangee.childElementCount < 2) {
            colonne = rangee;
            rangee = rangee.parentElement;
        }
        if (!rangee || rangee.childElementCount < 2) return;

        ajouterClasse(rangee, 'btc-notice-row');
        ajouterClasse(colonne, 'btc-notice-icon');
        for (const enfant of rangee.children) {
            if (enfant !== colonne) ajouterClasse(enfant, 'btc-notice-text');
        }
    };

    // =========================================================================
    // TEINTE DES NOTICES
    // Twitch pose la couleur d'accent de la chaîne en style inline sur la barre des
    // notices d'abonnement. Celle d'une série de visionnage ne la porte pas : elle
    // retombe sur un gris de thème (--color-border-quote). On retient donc la dernière
    // couleur non neutre rencontrée pour teinter aussi celles qui n'en ont pas — sans
    // quoi la moitié des notices resteraient grises.
    // =========================================================================
    let accentChaine = null;   // [r, g, b] de la dernière couleur non neutre rencontrée

    // Notices teintées d'un gris faute de mieux : la couleur de la chaîne n'était pas
    // encore connue. Rien ne garantit qu'une notice d'abonnement arrive en premier —
    // une série de visionnage peut très bien ouvrir la session. On les revoit dès que
    // la couleur se présente, comme on recolore les pseudos mis en attente.
    const CARTES_NEUTRES_MAX = 40;
    const cartesNeutres = new Set();

    /** Un gris n'est pas une couleur de chaîne : ses trois composantes se valent. */
    const estNeutre = (red, green, blue) =>
        Math.max(red, green, blue) - Math.min(red, green, blue) < 12;

    const poserTeinte = (card, [red, green, blue]) => {
        card.style.setProperty('--btc-notice-tint',
            `rgba(${red}, ${green}, ${blue}, ${CONFIG.compact.tintOpacity})`);
    };

    const mettreEnAttente = (card) => {
        if (cartesNeutres.size >= CARTES_NEUTRES_MAX) {
            cartesNeutres.delete(cartesNeutres.values().next().value);
        }
        cartesNeutres.add(card);
    };

    const tintNotice = (card, bar) => {
        if (!CONFIG.compact.tintOpacity) {
            card.style.removeProperty('--btc-notice-tint');
            return;
        }
        let composantes = null;
        try {
            const c = bar && lireCouleur(getComputedStyle(bar).backgroundColor);
            // Une barre invisible ne fournit rien : on retombera sur l'accent connu.
            if (c && c[3] > 0) composantes = c.slice(0, 3);
        } catch { /* style indisponible */ }

        // Aucune barre exploitable — certaines annonces n'en ont pas du tout. Elles
        // doivent malgré tout porter la couleur de la chaîne : c'est « toute annonce »
        // qui est demandé, pas « toute annonce qui déclare une couleur ».
        if (!composantes) {
            if (!accentChaine) { mettreEnAttente(card); return; }
            poserTeinte(card, accentChaine);
            return;
        }

        if (!estNeutre(...composantes)) {
            const decouverte = !accentChaine || accentChaine.join() !== composantes.join();
            accentChaine = composantes;
            if (decouverte && cartesNeutres.size) {
                for (const attente of cartesNeutres) {
                    if (attente.isConnected) poserTeinte(attente, accentChaine);
                }
                cartesNeutres.clear();
            }
        } else if (accentChaine) {
            composantes = accentChaine;
        } else {
            mettreEnAttente(card);
        }
        poserTeinte(card, composantes);
    };

    // Une carte de notice contient la barre, la notice et au plus un élément de décor.
    // Au-delà, ce n'est pas un conteneur dédié et on n'y touche pas.
    const CARTE_ENFANTS_MAX = 3;

    const compactNotice = (noticeLine) => {
        if (!CONFIG.compact.enabled) return;
        ajouterClasse(noticeLine, 'btc-notice-line');

        // La « carte » est le parent qui porte le fond et la barre de couleur. On ne
        // la décore que si c'est bien un conteneur dédié : jamais la racine du chat,
        // sinon le padding s'appliquerait à toute la liste.
        const card = noticeLine.parentElement;
        if (!card || card === chatRoot || card.classList.contains('btc-notice-card')) return;
        if (card.childElementCount > CARTE_ENFANTS_MAX) return;

        ajouterClasse(card, 'btc-notice-card');
        layoutNoticeRow(noticeLine);
        colorNoticeNames(noticeLine);
        // La barre de couleur est le frère précédent : un div vide avec un
        // background inline.
        const bar = noticeLine.previousElementSibling;
        const barreValide = bar && !bar.childElementCount && bar.getAttribute('style');
        if (barreValide) ajouterClasse(bar, 'btc-notice-bar');
        // Appelé même sans barre : la notice doit être teintée dans tous les cas.
        tintNotice(card, barreValide ? bar : null);
    };

    // =========================================================================
    // REGROUPEMENT DES GIFTS MULTIPLES
    // =========================================================================
    const gifts = {
        pending: new Map(),   // donateur -> { notice, expected, recipients, listEl, timer }
        recent: [],           // gifts individuels pas encore rattachés : { donor, recipient, line, ts }

        MAX_PENDING: 8,

        prune(now) {
            const cutoff = now - CONFIG.compact.giftLookbehindMs;
            let i = 0;
            while (i < this.recent.length && this.recent[i].ts < cutoff) i++;
            if (i) this.recent.splice(0, i);
        },

        open(donor, notice, expected) {
            this.close(donor);
            if (this.pending.size >= this.MAX_PENDING) this.close(this.pending.keys().next().value);
            const listEl = creer('div', 'btc-gift-recipients btc-gift-pending');
            notice.appendChild(listEl);

            const entry = { notice, expected, listEl, recipients: [], timer: null };
            entry.timer = setTimeout(() => this.close(donor), CONFIG.compact.giftWindowMs);
            this.pending.set(donor, entry);

            // Rattrapage : certains gifts individuels arrivent avant l'annonce.
            this.prune(Date.now());
            for (const g of [...this.recent]) {
                if (g.donor === donor) this.absorb(donor, g.recipient, g.line);
            }
            this.render(donor);
            log('gift multiple ouvert', donor, expected);
        },

        absorb(donor, recipient, line) {
            const entry = this.pending.get(donor);
            if (!entry) return false;
            if (entry.recipients.length >= entry.expected) return false;
            if (entry.recipients.includes(recipient)) return false;
            entry.recipients.push(recipient);
            ajouterClasse(line, 'btc-hidden');
            // Rattaché, il quitte la fenêtre de rattrapage : un second gift multiple du même
            // donateur, quelques secondes plus tard, le reprenait pour lui.
            this.recent = this.recent.filter((g) => g.line !== line);
            return true;
        },

        render(donor) {
            const entry = this.pending.get(donor);
            if (!entry) return;
            const { listEl, recipients, expected } = entry;
            // Ajout incrémental : seuls les nouveaux destinataires sont créés. Reconstruire
            // la liste à chaque gift coûtait n(n+1)/2 éléments, au plus fort de la rafale.
            for (const name of recipients.slice(listEl.childElementCount)) {
                const span = creer('span', 'btc-gift-recipient');
                span.textContent = name;
                listEl.appendChild(span);
            }
            listEl.classList.toggle('btc-gift-pending', recipients.length < expected);
        },

        close(donor) {
            const entry = this.pending.get(donor);
            if (!entry) return;
            clearTimeout(entry.timer);
            entry.listEl.classList.remove('btc-gift-pending');
            if (!entry.recipients.length) entry.listEl.remove();
            this.pending.delete(donor);
        },

        reset() {
            // Fermer plutôt qu'abandonner : sans close(), la liste gardait pour toujours
            // son style « en attente ».
            for (const donor of [...this.pending.keys()]) this.close(donor);
            this.recent.length = 0;
        }
    };

    /** Pseudos de la notice elle-même, hors message joint. */
    const nomsDeNotice = (notice) => [...notice.querySelectorAll(SEL.chatterName)]
        .filter((n) => !dansMessageJoint(n, notice));

    const nameAt = (notice, index) => {
        const el = nomsDeNotice(notice)[index];
        return el ? normalizeSpaces(el.textContent) : null;
    };

    /**
     * Entrée du chat qui contient l'élément : l'enfant direct de la racine, ni plus ni
     * moins. Masquer « le parent de la carte » pouvait viser la racine elle-même pour peu
     * que Twitch imbrique la notice d'un niveau de moins — tout le chat disparaissait.
     */
    const ligneDuChat = (el) => {
        let line = el;
        while (line.parentElement && line.parentElement !== chatRoot) line = line.parentElement;
        return line.parentElement === chatRoot ? line : null;
    };

    const processGiftNotice = (notice, text) => {
        if (!CONFIG.compact.aggregateGifts) return;

        const massMatch = text.match(RE.massGift);
        if (massMatch) {
            const expected = parseCount(massMatch[1] || massMatch[2]);
            const donorEl = notice.querySelector(`${SEL.massGiftName} ${SEL.chatterName}`)
                || nomsDeNotice(notice)[0];
            const donor = donorEl ? normalizeSpaces(donorEl.textContent) : null;
            if (donor && expected > 0) gifts.open(donor, notice, expected);
            return;
        }

        if (RE.singleGift.test(text)) {
            const donor = nameAt(notice, 0);
            const recipient = nameAt(notice, 1);
            if (!donor || !recipient) return;

            const line = ligneDuChat(notice);
            if (!line) return;

            const now = Date.now();
            gifts.prune(now);
            gifts.recent.push({ donor, recipient, line, ts: now });

            if (gifts.absorb(donor, recipient, line)) {
                gifts.render(donor);
                const entry = gifts.pending.get(donor);
                if (entry && entry.recipients.length >= entry.expected) gifts.close(donor);
            }
        }
    };

    const processNotice = (notice) => {
        if (notice.dataset.btcNotice === '1') return;
        notice.dataset.btcNotice = '1';
        diag.notices++;

        translateNotice(notice);
        compactNotice(notice);
        // Analysé sans le message joint : une phrase comme « gifted a sub to » écrite par
        // l'abonné suffisait à faire passer sa notice pour un gift.
        processGiftNotice(notice, normalizeSpaces(texteDeNotice(notice)));
    };

    /**
     * Réapplique aux notices déjà affichées les réglages lus en JS (teinte, couleur des
     * pseudos, traduction). Le reste de leur mise en forme suit la feuille de style.
     */
    const rafraichirNotices = () => {
        if (!chatRoot) return;
        for (const n of chatRoot.querySelectorAll('.btc-notice-line')) {
            translateNotice(n);
            if (CONFIG.compact.colorNames) {
                colorNoticeNames(n);
            } else {
                for (const nom of n.querySelectorAll('.btc-notice-name')) {
                    nom.classList.remove('btc-notice-name');
                    nom.style.removeProperty('color');
                }
            }
            const card = n.parentElement;
            if (card && card.classList.contains('btc-notice-card')) {
                const bar = n.previousElementSibling;
                tintNotice(card, bar && bar.classList.contains('btc-notice-bar') ? bar : null);
            }
        }
    };

    // =========================================================================
    // TRAITEMENT D'UNE LIGNE
    // Une seule traversée du sous-arbre : les éléments utiles sont collectés d'un coup,
    // puis traités dans l'ordre d'avant — index d'abord, pour que les notices et les
    // citations trouvent les couleurs et les emotes de leur propre lot.
    // =========================================================================
    const SEL_UTILES = [SEL.emote, SEL.username, SEL.systemNotice, SEL.notice, SEL.line].join(',');

    const collecter = (element) => {
        const lot = { emotes: [], noms: [], systeme: [], notices: [], lignes: [] };
        const trier = (el) => {
            if (el.matches(SEL.emote)) lot.emotes.push(el);
            if (el.matches(SEL.username)) lot.noms.push(el);
            // Les notices système 7TV portent le même data-test-selector que celles de
            // Twitch mais sont déjà compactes : elles ne sont que traduites.
            if (el.matches(SEL.systemNotice)) lot.systeme.push(el);
            else if (el.matches(SEL.notice)) lot.notices.push(el);
            if (el.matches(SEL.line)) lot.lignes.push(el);
        };
        if (element.matches(SEL_UTILES)) trier(element);
        for (const el of element.querySelectorAll(SEL_UTILES)) trier(el);
        return lot;
    };

    const traiterLigne = (line) => {
        compter('lignes', line);
        stripHighlightLabel(line);
        processReply(line);
    };

    const processLine = (element) => {
        if (!element || element.nodeType !== Node.ELEMENT_NODE) return;
        const lot = collecter(element);

        if (CONFIG.reply.renderEmotes) lot.emotes.forEach(rememberEmote);
        indexNameColors(lot.noms);

        // Notices système 7TV (exclusions, suppressions) — toujours en anglais.
        for (const n of lot.systeme) protege(translateSystemNotice, n);
        // Notices Twitch (sub, prime, gift, raid…).
        for (const n of lot.notices) protege(processNotice, n);
        // Messages utilisateur.
        for (const line of lot.lignes) protege(traiterLigne, line);
    };

    // =========================================================================
    // AUTO-DIAGNOSTIC
    // La v14 est morte en silence : ses sélecteurs ne correspondaient plus à rien et
    // rien ne le signalait. Twitch change ses classes hachées à chaque build et 7TV
    // réécrit son extension ; ce contrôle transforme une casse muette en avertissement
    // lisible, avec le renvoi vers l'enregistreur DOM.
    // =========================================================================
    const SELF_CHECK_DELAY = 20000;
    let selfCheckTimer = null;

    // Indices qu'on est bien sur une page de chaîne : sans eux, l'absence de chat est
    // normale (page d'accueil, annuaire…) et il ne faut surtout pas alerter.
    const PAGE_CHAT_SELECTORS = '[data-a-target="chat-input"],.chat-room,'
        + 'section[data-test-selector="chat-room-component-layout"],[data-test-selector="chat-room"]';

    const runSelfCheck = ({ verbeux = false, force = false } = {}) => {
        const sondes = [];
        const add = (nom, ok, indice) => sondes.push({ ancre: nom, ok, indice });
        const root = chatRoot;

        add('conteneur du chat', !!root, SEL.chatRoot[0]);
        if (root) {
            // Un conteneur détaché répond encore à toutes les requêtes : sans ce contrôle,
            // un script devenu inerte passait le diagnostic.
            add('conteneur toujours dans la page', root.isConnected, 'chatRoot.isConnected');
            add('ligne de message', !!root.querySelector(SEL.line), SEL.line);
            add('corps du message', !!root.querySelector(SEL.body), SEL.body);
            add('pseudo', !!root.querySelector(SEL.username), SEL.username);
            add('conteneur de ligne', !!root.querySelector(SEL.lineContainer), SEL.lineContainer);
        }
        add('feuille de style injectée', !!document.getElementById('btc-styles'), '#btc-styles');
        // Ancre conditionnelle : on ne peut pas conclure de l'absence de réponse, mais
        // une réponse annoncée par Twitch et non découpée est une preuve de casse.
        add('bloc de citation', diag.reponsesRatees === 0,
            '.chat-line__message-container > premier enfant non vide');

        const cassees = sondes.filter(p => !p.ok);
        const inactif = diag.lignes === 0 && diag.notices === 0;

        if (cassees.length && (force || !inactif)) {
            console.warn(
                `[BetterTwitchChat] ${cassees.length} ancre(s) ne correspondent plus au DOM.\n` +
                cassees.map(p => `  ✗ ${p.ancre} — ${p.indice}`).join('\n') +
                '\nTwitch ou 7TV a probablement changé sa structure. Détail : __BTC.selfCheck().' +
                '\nÀ signaler sur https://github.com/Maxezify/Betterchat-for-Twitch/issues'
            );
        } else if (verbeux) {
            console.log('[BetterTwitchChat] toutes les ancres répondent.');
        }
        if (verbeux) console.table(sondes);

        return {
            ok: cassees.length === 0,
            inactif,
            sondes,
            compteurs: { ...diag }
        };
    };

    const scheduleSelfCheck = () => {
        clearTimeout(selfCheckTimer);
        selfCheckTimer = setTimeout(() => runSelfCheck(), SELF_CHECK_DELAY);
    };

    // =========================================================================
    // OBSERVATEUR
    // =========================================================================
    let observer = null;
    let queue = [];
    // File pleine : le prochain passage reprend toute la racine, au lieu de jeter sans les
    // traiter les nœuds les plus anciens — parfois de vraies lignes ou des notices.
    let fileDebordee = false;
    let flushPlanifie = false;
    const QUEUE_MAX = 120;

    // =========================================================================
    // RECOLLAGE EN BAS
    // Nos transformations agrandissent la ligne : la citation passe d'une ligne
    // tronquée à plusieurs, les espaces s'ajoutent. Elles s'appliquent dans la frame
    // qui suit l'insertion, donc APRÈS que Twitch a recollé le chat en bas — le bas du
    // nouveau message se retrouvait sous le pli. On recolle une fois la ligne à sa
    // taille définitive, et seulement si le chat y était déjà : quelqu'un qui a remonté
    // l'historique ne doit jamais être ramené en bas de force.
    // =========================================================================

    // Twitch recolle au pixel près, mais scrollHeight peut être fractionnaire. Un cran
    // de molette dépasse largement ce seuil : aucun risque de confondre les deux cas.
    const SCROLL_EPSILON = 4;
    let scroller = null;
    // Vrai tant que le scroller retenu ne défile pas encore (chat pas assez rempli) : le
    // choix est alors provisoire et refait à chaque appel. Le premier choix se faisant sur
    // un chat encore vide, le repli structurel n'était sinon jamais atteint.
    let scrollerProvisoire = false;
    let colleEnBas = true;
    const scrollersEcoutes = new WeakSet();

    // Dernière valeur que nous avons nous-mêmes écrite. Sert à distinguer nos propres
    // déplacements d'un geste de lecture : comparer les positions est sans dépendance
    // de timing, contrairement à un drapeau qu'il faudrait lever et baisser à temps.
    let dernierEcrit = -1;

    const ecrireScroll = (sc, valeur) => {
        sc.scrollTop = Math.max(0, Math.min(valeur, sc.scrollHeight - sc.clientHeight));
        // On relit la valeur réellement retenue : le navigateur borne et arrondit à sa
        // façon, et comparer notre intention à ce qu'il a fait ferait passer nos propres
        // déplacements pour des gestes de lecture.
        dernierEcrit = sc.scrollTop;
    };

    // =====================================================================
    // BOUCLE D'ANIMATION
    // Le glissement du chat et le relâchement des messages avancent tous deux ici. Une
    // seule boucle plutôt que deux minuteries : moins de réveils, et surtout les deux
    // ne peuvent plus se désynchroniser. Elle suit la cadence de l'écran — c'est ce qui
    // fait la fluidité, une minuterie à intervalle fixe produit des à-coups dès qu'elle
    // tombe à côté d'un rafraîchissement.
    // =====================================================================
    let frame = null;
    let horodatage = 0;
    let dansLaBoucle = false;
    let glissementActif = false;
    // Vitesse de croissance du contenu, lissée, en pixels par seconde. C'est la mesure
    // de la cadence du chat : chaque message allonge la liste d'autant de pixels.
    let vitesseContenu = 0;
    let hauteurPrecedente = 0;
    // Fin du dernier glissement : une reprise après une longue pause repart d'une vitesse
    // nulle au lieu d'hériter de celle d'une rafale passée.
    let finGlissement = 0;
    const PAUSE_OUBLI_VITESSE_MS = 2000;

    const arreterGlissement = () => {
        glissementActif = false;
        hauteurPrecedente = 0;   // la prochaine reprise repart d'une mesure fraîche
        finGlissement = performance.now();
    };

    const demarrerBoucle = () => {
        // Ne rien planifier depuis l'intérieur de la boucle : elle se replanifie seule à
        // la fin du pas. Sans cette garde, un relâchement de message provoquait une
        // seconde planification dans la même image, et le pas suivant recevait un temps
        // écoulé nul — donc un déplacement nul.
        if (frame !== null || dansLaBoucle) return;
        horodatage = performance.now();
        frame = requestAnimationFrame(avancerBoucle);
    };

    /**
     * Approche exponentielle : à chaque image, on parcourt une part de ce qu'il reste.
     * La vitesse décroît donc avec la distance, ce qui donne une arrivée douce et sans
     * arrêt net — un trajet à durée fixe doit trancher quand il expire, et ce coup de
     * ciseaux est exactement ce qui se voit. La cible est relue à chaque image : dans un
     * chat rapide, elle s'éloigne pendant le trajet, et le suiveur s'y adapte seul.
     * La part dépend du temps écoulé, donc le rendu est le même à 60 ou 144 Hz.
     */
    const avancerGlissement = (dt) => {
        if (!glissementActif) return false;
        const sc = getScroller();
        if (!sc || !sc.isConnected) { glissementActif = false; return false; }
        const cible = sc.scrollHeight - sc.clientHeight;
        const reste = cible - sc.scrollTop;
        if (reste <= 1) { ecrireScroll(sc, cible); arreterGlissement(); return false; }

        // Cadence du chat, mesurée sur la croissance du contenu. Lissée, sinon le rythme
        // saccadé des insertions ferait osciller la vitesse d'une image à l'autre.
        const hauteur = sc.scrollHeight;
        if (hauteurPrecedente) {
            const instantanee = Math.max(0, hauteur - hauteurPrecedente) * 1000 / dt;
            vitesseContenu += (instantanee - vitesseContenu) * 0.2;
        }
        hauteurPrecedente = hauteur;

        // Constante de temps : au bout de smoothScrollMs, 98 % du trajet est fait.
        // Un suiveur de constante tau traîne, en régime établi, de vitesse × tau. On
        // resserre donc tau juste assez pour que ce retard reste sous la limite : le
        // glissement s'accélère quand le chat s'emballe, sans jamais devenir un saut.
        const tauBase = Math.max(16, CONFIG.smoothScrollMs / 4);
        const retardMax = Math.max(40, sc.clientHeight * CONFIG.smoothScrollMaxLag);
        const tau = vitesseContenu > 1
            ? Math.max(16, Math.min(tauBase, 1000 * retardMax / vitesseContenu))
            : tauBase;
        // Plancher d'un pixel : un déplacement fractionnaire n'est pas appliqué par le
        // navigateur, et la course exponentielle finit forcément par en demander un.
        // Sans ce plancher, le suiveur se fige à quelques pixels du bas — mesuré.
        // Plafond de déplacement : le mouvement reste continu quoi qu'il arrive. Sans
        // lui, l'accélération ci-dessus produit des bonds de plusieurs écrans par image
        // dès que le chat s'emballe — ce qui rejoint le bas, mais n'est plus un
        // glissement. Rapporté au temps écoulé, donc identique à toute cadence d'écran.
        const plafond = Math.max(4, sc.clientHeight * CONFIG.smoothScrollMaxStep * dt / 16.7);
        const pas = Math.min(plafond, Math.max(1, reste * (1 - Math.exp(-dt / tau))));
        ecrireScroll(sc, sc.scrollTop + pas);
        return true;
    };

    // Déclaration de fonction, donc hissée : la boucle et demarrerBoucle s'appellent
    // l'une l'autre.
    function avancerBoucle(maintenant) {
        frame = null;
        dansLaBoucle = true;
        // Borné des deux côtés : un onglet en arrière-plan ne reçoit plus d'images et
        // l'écart accumulé ferait sauter le chat d'un bond au retour ; un écart nul
        // ferait tourner la boucle sans jamais avancer.
        const dt = Math.min(100, Math.max(1, maintenant - horodatage));
        horodatage = maintenant;

        const encoreDesMessages = relacherEnAttente(maintenant);
        const encoreDuTrajet = avancerGlissement(dt);
        dansLaBoucle = false;
        if (encoreDesMessages || encoreDuTrajet) {
            frame = requestAnimationFrame(avancerBoucle);
        }
    }

    const mesurerCollage = (sc) => {
        if (!sc) return true;
        // Pendant un glissement, le chat n'est pas au bas mais il y va : le compter
        // comme décroché arrêterait le suivi dès la première animation.
        if (glissementActif) return true;
        return sc.scrollHeight - sc.scrollTop - sc.clientHeight <= SCROLL_EPSILON;
    };

    const recollerEnBas = (sc) => {
        if (!sc) return;
        // Onglet masqué : aucune image ne viendrait animer le glissement, on va droit au bas.
        if (CONFIG.smoothScrollMs > 0 && !document.hidden) {
            if (sc.scrollHeight - sc.clientHeight - sc.scrollTop <= 0.5) return;
            if (!glissementActif && performance.now() - finGlissement > PAUSE_OUBLI_VITESSE_MS) {
                vitesseContenu = 0;
            }
            glissementActif = true;
            demarrerBoucle();
            return;
        }
        ecrireScroll(sc, sc.scrollHeight);
    };

    const defile = (el) => !!el && el.scrollHeight - el.clientHeight > SCROLL_EPSILON;

    const trouverScroller = () => {
        const nomme = document.querySelector(SEL.scroller);
        if (defile(nomme)) return nomme;
        // Repli structurel si Twitch déplaçait le débordement sur un autre niveau :
        // le premier ancêtre du chat qui défile réellement. Aucune classe hachée.
        let el = chatRoot && chatRoot.parentElement;
        while (el && el !== document.body) {
            const oy = getComputedStyle(el).overflowY;
            if ((oy === 'auto' || oy === 'scroll') && defile(el)) return el;
            el = el.parentElement;
        }
        // Chat pas encore assez rempli pour déborder : choix provisoire.
        return nomme || null;
    };

    function getScroller() {
        if (!scroller || !scroller.isConnected || (scrollerProvisoire && !defile(scroller))) {
            scroller = trouverScroller();
            scrollerProvisoire = !defile(scroller);
        }
        const sc = scroller;
        if (sc && !scrollersEcoutes.has(sc)) {
            scrollersEcoutes.add(sc);
            // Chrome « ancre » le défilement : quand du contenu apparaît, il déplace
            // scrollTop de lui-même pour garder le même point de lecture à l'écran. Sur
            // un chat qui révèle ses messages un par un, ce mouvement n'est pas un
            // geste de lecture — mais il en émet l'événement, et notre suivi le prenait
            // pour tel : le glissement s'interrompait dès la première ligne relâchée.
            sc.style.overflowAnchor = 'none';
            // Seule source fiable de l'intention de lecture : un agrandissement du
            // contenu n'émet aucun événement de défilement, une action humaine si.
            // L'écouteur lit l'élément qu'il écoute, pas la variable partagée, qui peut
            // désigner entre-temps un autre scroller.
            sc.addEventListener('scroll', () => {
                if (sc !== scroller) return;
                // Nos propres écritures ne disent rien de l'intention de lecture.
                if (Math.abs(sc.scrollTop - dernierEcrit) <= 1.5) return;
                // Un geste pendant un glissement l'interrompt : on rend la main.
                arreterGlissement();
                colleEnBas = sc.scrollHeight - sc.scrollTop - sc.clientHeight <= SCROLL_EPSILON;
            }, { passive: true });
        }
        return sc;
    }

    /**
     * Une emote dont on ignorait les proportions vient de se charger : elle a pris sa
     * largeur d'un coup et a pu re-découper la citation. On retient ses proportions
     * pour les prochaines, puis on rattrape le décalage.
     */
    function onEmoteChargee(img, nom) {
        const connu = emoteIndex.get(nom);
        if (connu && !connu.ratio && img.naturalWidth > 0 && img.naturalHeight > 0) {
            connu.ratio = ratioPlausible(img.naturalWidth / img.naturalHeight);
        }
        if (colleEnBas) recollerEnBas(getScroller());
    }

    // =========================================================================
    // AFFICHAGE PROGRESSIF
    // Twitch insère les messages par paquets : dans un chat rapide, plusieurs lignes
    // surgissent d'un coup. On les masque au moment même de leur insertion — le rappel
    // de l'observateur s'exécute avant le premier rendu, donc rien ne clignote — puis
    // on les relâche une par une. Quand le retard grandit, on accélère plutôt que de
    // renoncer : l'affichage reste progressif du début à la fin.
    // =========================================================================
    const AFFICHAGE_RATTRAPAGE_MS = 400;
    // Plafond du tampon. Au-delà, la boucle ne suit manifestement plus (onglet suspendu,
    // page gelée) : tout est relâché d'un bloc plutôt que retenu indéfiniment.
    const AFFICHAGE_MAX = 300;
    const enAttenteAffichage = [];
    let dernierRelache = 0;

    const relacherLigne = (line) => {
        if (line.isConnected) line.classList.remove('btc-differe');
    };

    const relacherTout = () => {
        while (enAttenteAffichage.length) relacherLigne(enAttenteAffichage.shift());
    };

    /**
     * Appelé par la boucle. Rend vrai tant qu'il reste des lignes à relâcher.
     * Le nombre relâché est calculé pour résorber le retard en un temps fixe, quelle que
     * soit la cadence du chat — et sur le temps écoulé depuis le dernier relâchement,
     * pas sur la durée d'une image : avec messageBatchMs au-delà d'une image, le
     * rattrapage était sinon ralenti d'autant.
     */
    function relacherEnAttente(maintenant) {
        const attente = enAttenteAffichage.length;
        if (!attente) return false;
        const ecoule = maintenant - dernierRelache;
        if (ecoule < CONFIG.messageBatchMs) return true;
        dernierRelache = maintenant;

        // Borné comme dt : une longue pause ne doit pas tout relâcher d'un coup.
        const pas = Math.min(ecoule, Math.max(100, CONFIG.messageBatchMs));
        const parImage = Math.max(1, Math.ceil(attente * pas / AFFICHAGE_RATTRAPAGE_MS));
        for (let i = 0; i < parImage && enAttenteAffichage.length; i++) {
            relacherLigne(enAttenteAffichage.shift());
        }
        // Le contenu vient de grandir : le suiveur doit repartir vers le nouveau bas.
        if (colleEnBas) recollerEnBas(getScroller());
        return enAttenteAffichage.length > 0;
    }

    const differerAffichage = (node) => {
        // Rien n'est différé onglet masqué : le relâchement avance au rythme des images,
        // et il n'y en a plus. Les lignes s'accumulaient sans fin.
        if (!CONFIG.messageBatchMs || document.hidden) return;
        // Uniquement ce que Twitch dépose à la racine du chat. Nos propres insertions
        // ne passent pas par ici (voir nosNoeuds).
        if (node.parentElement !== chatRoot) return;
        if (node.classList.contains('btc-differe')) return;
        node.classList.add('btc-differe');
        enAttenteAffichage.push(node);
        if (enAttenteAffichage.length > AFFICHAGE_MAX) relacherTout();
        demarrerBoucle();
    };

    /** Signale aux fonctions les entrées arrivées en direct, une seule fois chacune. */
    const signalerArrivees = (noeuds) => {
        const maintenant = Date.now();
        for (const n of noeuds) {
            if (n.parentElement !== chatRoot || entreesVues.has(n)) continue;
            entreesVues.add(n);
            if (maintenant < arriveesDes) continue;
            declencher('arrivee', n, horodatages.get(n) || maintenant);
        }
    };

    const flush = () => {
        const batch = queue;
        const toutReprendre = fileDebordee;
        queue = [];
        fileDebordee = false;
        flushPlanifie = false;
        if (!chatRoot) return;
        // Mesuré ici et non à l'insertion : à ce stade Twitch a déjà fait son propre
        // recollage, l'écart au bas reflète donc bien l'intention de qui lit.
        const sc = getScroller();
        colleEnBas = mesurerCollage(sc);
        if (toutReprendre) {
            processLine(chatRoot);
        } else {
            // Un nœud dont un ancêtre est aussi dans le lot est couvert par le passage de
            // cet ancêtre : on ne parcourt pas deux fois le même sous-arbre.
            const lot = new Set(batch.filter((n) => n.isConnected));
            for (const node of lot) {
                let p = node.parentElement;
                while (p && p !== chatRoot && !lot.has(p)) p = p.parentElement;
                if (!p || p === chatRoot) processLine(node);
            }
        }
        signalerArrivees(toutReprendre ? [...chatRoot.children] : batch);
        if (colleEnBas) recollerEnBas(sc);
    };

    const planifierFlush = () => {
        if (flushPlanifie) return;
        flushPlanifie = true;
        // Onglet masqué : le navigateur suspend requestAnimationFrame, pas les minuteries
        // (bridées, mais elles tournent). Sans ce détour, rien n'était traité avant le
        // retour au premier plan.
        if (document.hidden) setTimeout(flush, 100);
        else requestAnimationFrame(flush);
    };

    const enqueue = (node) => {
        if (!fileDebordee) {
            if (queue.length < QUEUE_MAX) {
                queue.push(node);
            } else {
                fileDebordee = true;
                queue = [];
            }
        }
        planifierFlush();
    };

    const surVisibilite = () => {
        if (!document.hidden) return;
        // Rien ne doit rester masqué derrière un onglet en pause, et un traitement promis
        // à une image qui ne viendra plus passe par une minuterie.
        relacherTout();
        arreterGlissement();
        if (flushPlanifie) setTimeout(flush, 100);
    };

    // Classes posées par Twitch et 7TV, sans les nôtres (btc-*), dans un ordre stable.
    const classesEtrangeres = (valeur) => (valeur || '').split(/\s+/)
        .filter((c) => c && !c.startsWith('btc-'))
        .sort()
        .join(' ');

    const onMutations = (mutations) => {
        for (const m of mutations) {
            if (m.type === 'childList') {
                for (const node of m.addedNodes) {
                    if (node.nodeType !== Node.ELEMENT_NODE || nosNoeuds.has(node)) continue;
                    if (node.parentElement === chatRoot) horodatages.set(node, Date.now());
                    differerAffichage(node);
                    enqueue(node);
                }
            } else if (m.type === 'attributes') {
                const t = m.target;
                if (m.attributeName === HIGHLIGHT_LABEL_ATTR) {
                    stripHighlightLabel(t);
                    continue;
                }
                // Nos propres classes ne disent rien du grade : seul un changement venu de
                // Twitch ou 7TV justifie de relire le style. Sans ce tri, chaque réponse
                // déclenchait deux lectures du style calculé.
                if (m.attributeName === 'class'
                    && (m.oldValue === t.getAttribute('class')
                        || classesEtrangeres(m.oldValue) === classesEtrangeres(t.getAttribute('class')))) {
                    continue;
                }
                // 7TV pose ses classes de highlight après l'insertion, avec l'étiquette
                // de règle : il faut retirer celle-ci et recalculer la couleur d'accent.
                stripHighlightLabel(t);
                if (t.classList.contains('btc-reply')) applyGradeAccent(t);
            }
        }
    };

    // =========================================================================
    // CONNEXION AU CONTENEUR DU CHAT ET NAVIGATION SPA
    // =========================================================================
    const findChatRoot = () => {
        for (const sel of SEL.chatRoot) {
            const el = document.querySelector(sel);
            if (el) return el;
        }
        return null;
    };

    // Clé de chaîne : dit si l'on a changé de chaîne, donc d'emotes et de couleur
    // d'accent. Les sous-pages d'une même chaîne (/x, /x/about, /popout/x/chat) la
    // partagent ; une query string ou un # ne la changent pas.
    const PREFIXES_CHAINE = new Set(['popout', 'embed', 'moderator']);
    const cleDeChaine = () => {
        const seg = location.pathname.split('/').filter(Boolean);
        return (PREFIXES_CHAINE.has(seg[0]) ? seg[1] : seg[0]) || '';
    };
    let chaineCourante = null;

    /** Oublie ce qui est propre à une chaîne : emotes, couleur d'accent, gifts en cours. */
    const oublierChaine = () => {
        emoteIndex.clear();
        gifts.reset();
        accentChaine = null;
        cartesNeutres.clear();
    };

    /** Se détache du conteneur courant et solde ce qui lui appartenait. */
    const teardown = () => {
        if (chatRoot) declencher('deconnexion', chatRoot);
        if (observer) { observer.disconnect(); observer = null; }
        clearTimeout(selfCheckTimer);
        diag.lignes = diag.reponses = diag.reponsesRatees = diag.notices = 0;
        dejaComptes = { lignes: new WeakSet(), reponses: new WeakSet(), reponsesRatees: new WeakSet() };
        queue = [];
        fileDebordee = false;
        flushPlanifie = false;
        relacherTout();
        arreterGlissement();
        gifts.reset();
        cartesNeutres.clear();
        entreesVues = new WeakSet();
        chatRoot = null;
        scroller = null;
    };

    const start = (root) => {
        teardown();
        chatRoot = root;
        const cle = cleDeChaine();
        if (cle !== chaineCourante) { oublierChaine(); chaineCourante = cle; }
        vitesseContenu = 0;
        observer = new MutationObserver(onMutations);
        observer.observe(root, {
            childList: true,
            subtree: true,
            attributes: true,
            // Ancienne valeur : distingue nos propres classes de celles de Twitch et 7TV.
            attributeOldValue: true,
            // L'étiquette 7TV est observée pour elle-même : elle peut être posée sans
            // qu'aucune classe ne change.
            attributeFilter: ['class', 'data-seventv-processed', HIGHLIGHT_LABEL_ATTR]
        });
        // Relevé initial : sans lui, une emote chargée avant le premier lot traité
        // recollerait le chat en bas alors que rien ne dit qu'il y était.
        colleEnBas = mesurerCollage(getScroller());
        processLine(root);
        // Ce qui est déjà là n'est pas une arrivée : Twitch le rejoue à chaque ouverture.
        for (const c of root.children) entreesVues.add(c);
        arriveesDes = Date.now() + CONFIG.stabilisationMs;
        declencher('connexion', root);
        scheduleSelfCheck();
        log('démarré sur', root.className);
    };

    const RACINE_ABSENTE_ALERTE_MS = 60000;
    let absenceDepuis = 0;
    let absenceSignalee = false;

    /**
     * Garde la connexion sur le bon conteneur. Appelée chaque seconde et après chaque
     * navigation : le conteneur peut être remplacé sans que l'URL change (colonne repliée
     * puis rouverte, mode cinéma…), et l'URL peut changer sans que le conteneur change
     * (sous-page de la chaîne, paramètres). Bon marché tant que le conteneur est en
     * place : un simple isConnected, la recherche dans la page n'a lieu qu'en son absence.
     */
    const surveillerRacine = () => {
        if (chatRoot && chatRoot.isConnected) {
            // Même conteneur, mais peut-être une autre chaîne si Twitch le réutilise.
            const cle = cleDeChaine();
            if (cle !== chaineCourante) { oublierChaine(); chaineCourante = cle; }
            return;
        }
        const found = findChatRoot();
        if (found) {
            log('conteneur du chat', chatRoot ? 'remplacé' : 'trouvé');
            start(found);
            absenceDepuis = 0;
            absenceSignalee = false;
            return;
        }
        if (chatRoot) { log('conteneur du chat perdu'); teardown(); }
        if (!absenceDepuis) {
            absenceDepuis = Date.now();
        } else if (!absenceSignalee && Date.now() - absenceDepuis > RACINE_ABSENTE_ALERTE_MS
                   && document.querySelector(PAGE_CHAT_SELECTORS)) {
            // Page de chaîne, mais aucun conteneur reconnu depuis une minute : la panne la
            // plus grave, qui ne doit pas rester muette.
            absenceSignalee = true;
            runSelfCheck({ force: true });
        }
    };

    const watchNavigation = () => {
        let lastUrl = location.href;
        const onChange = () => {
            if (location.href === lastUrl) return;
            lastUrl = location.href;
            absenceDepuis = 0;
            absenceSignalee = false;
            // Plus de démontage systématique : la surveillance décide s'il faut se
            // reconnecter. Un passage rapide après la navigation, puis la ronde régulière.
            setTimeout(surveillerRacine, 300);
        };
        window.addEventListener('popstate', onChange);
        const push = history.pushState;
        const replace = history.replaceState;
        history.pushState = function (...args) { const r = push.apply(this, args); onChange(); return r; };
        history.replaceState = function (...args) { const r = replace.apply(this, args); onChange(); return r; };
    };

    // =========================================================================
    // FONCTIONS v15.26 — SOCLE COMMUN
    // Réglages persistants, couche d'interface, lecture des messages et cadence du chat.
    // Les fonctions se branchent sur les crochets déclarés dans l'état partagé : rien
    // dans le cœur du script ne dépend d'elles, et chacune peut être coupée.
    // =========================================================================

    // ---------------------------------------------------------------- petits outils
    const echapperRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sansAccents = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const mediane = (valeurs) => {
        if (!valeurs.length) return 0;
        const v = [...valeurs].sort((a, b) => a - b);
        const m = Math.floor(v.length / 2);
        return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
    };
    const incrementer = (map, cle, n = 1) => map.set(cle, (map.get(cle) || 0) + n);
    const premiers = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
    const nombreFr = (n) => Number(n).toLocaleString('fr-FR');
    const pluriel = (n, un, plusieurs) => `${nombreFr(n)} ${n > 1 ? plusieurs : un}`;
    const heureCourte = (ts) => new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const dateCourte = (ts) => new Date(ts).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const dureeLisible = (ms) => {
        const s = Math.round(ms / 1000);
        if (s < 60) return `${s} s`;
        const min = Math.round(s / 60);
        if (min < 60) return `${min} min`;
        return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
    };
    const horloge = (ms) => {
        const s = Math.max(0, Math.floor(ms / 1000));
        const hh = Math.floor(s / 3600);
        const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
        const ss = String(s % 60).padStart(2, '0');
        return `${hh}:${mm}:${ss}`;
    };
    const mouvementReduit = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Stockage du navigateur : peut être plein, bloqué ou absent (navigation privée). Une
    // lecture ou une écriture ratée ne doit jamais arrêter le script.
    const lireStockage = (cle) => { try { return localStorage.getItem(cle); } catch { return null; } };
    const ecrireStockage = (cle, valeur) => {
        try {
            if (valeur === null) localStorage.removeItem(cle);
            else localStorage.setItem(cle, valeur);
            return true;
        } catch { return false; }
    };

    // ---------------------------------------------------------------- réglages
    // Les réglages modifiés dans le panneau sont enregistrés dans le navigateur. Ils
    // survivent ainsi aux mises à jour du script, qui remplacent le fichier — et avec lui
    // toute modification faite à la main dans CONFIG. Seuls les écarts aux valeurs
    // d'origine sont gardés : une valeur par défaut changée par une nouvelle version
    // s'applique à quiconque ne l'avait pas modifiée.
    const CLE_REGLAGES = 'btc:reglages:v1';
    const DEFAUTS = structuredClone(CONFIG);

    const lireChemin = (objet, cle) => cle.split('.').reduce((o, k) => (o == null ? undefined : o[k]), objet);
    const ecrireChemin = (objet, cle, valeur) => {
        const parties = cle.split('.');
        const fin = parties.pop();
        let o = objet;
        for (const k of parties) o = o[k] = (o[k] && typeof o[k] === 'object') ? o[k] : {};
        o[fin] = valeur;
    };

    const bool = (cle, libelle, aide) => ({ cle, type: 'bool', libelle, aide });
    const nombre = (cle, libelle, min, max, pas, unite, aide) => ({ cle, type: 'nombre', libelle, min, max, pas, unite, aide });
    const choix = (cle, libelle, options, aide) => ({ cle, type: 'choix', libelle, options, aide });

    /** Ce que le panneau expose. Le reste de CONFIG garde ses valeurs écrites dans le code. */
    const REGLAGES = [
        { section: 'Réponses', entrees: [
            choix('reply.style', 'Présentation de la citation',
                [['rail', 'Filet le long du message'], ['inline', 'Première ligne du message'], ['card', 'Bloc détaché']]),
            nombre('reply.fontScale', 'Taille de la citation', 0.6, 1.2, 0.025, '×', 'Relative au texte du chat.'),
            bool('reply.hidePrefix', 'Retirer « Répond à »'),
            bool('reply.showIcon', 'Afficher la bulle de réponse'),
            bool('reply.renderEmotes', 'Afficher les emotes dans la citation'),
            bool('reply.underlineNames', 'Souligner les pseudos cités'),
            bool('reply.colorQuotedName', 'Colorer le pseudo cité')
        ] },
        { section: 'Notices', entrees: [
            bool('compact.enabled', 'Compacter les notices (sub, gift, raid…)'),
            bool('compact.quoteLook', 'Apparence discrète, comme une citation'),
            bool('compact.colorNames', 'Colorer les pseudos des notices'),
            nombre('compact.tintOpacity', 'Teinte de fond', 0, 0.5, 0.05, '', '0 : aucune teinte.'),
            bool('compact.aggregateGifts', 'Regrouper les gifts multiples'),
            bool('translate', 'Traduire les notices restées en anglais')
        ] },
        { section: 'Affichage', entrees: [
            nombre('messageBatchMs', 'Délai entre deux messages affichés', 0, 200, 1, 'ms', '0 : les messages arrivent par paquets, comme sur Twitch.'),
            nombre('smoothScrollMs', 'Durée du défilement fluide', 0, 3000, 100, 'ms', '0 : saut direct en bas.'),
            bool('separators', 'Trait entre les messages'),
            bool('hideHighlightLabel', 'Retirer l\'étiquette des règles « Custom Highlights » de 7TV')
        ] },
        { section: 'Densité en rafale', aide: 'Quand le chat s\'emballe, il se resserre pour rester lisible, puis revient à la normale.', entrees: [
            bool('rafale.enabled', 'Activer la densité adaptative'),
            nombre('rafale.entree', 'Seuil d\'entrée', 2, 60, 1, 'msg/s'),
            nombre('rafale.sortie', 'Seuil de sortie', 1, 50, 1, 'msg/s', 'Ramené sous le seuil d\'entrée s\'il le dépasse.'),
            bool('rafale.badges', 'Masquer les badges secondaires (modo, VIP et diffuseur restent)'),
            bool('rafale.notices', 'Notices sur une ligne, message joint au survol'),
            bool('rafale.citations', 'Citations sur une ligne'),
            bool('rafale.espacement', 'Lignes resserrées'),
            bool('rafale.indicateur', 'Signaler la rafale dans le chat')
        ] },
        { section: 'Fil de conversation', aide: 'Au survol d\'une réponse, le message d\'origine et les autres réponses ressortent.', entrees: [
            bool('fil.enabled', 'Activer le fil au survol'),
            bool('fil.estomper', 'Estomper le reste du chat'),
            nombre('fil.delaiMs', 'Délai avant affichage', 0, 1000, 50, 'ms')
        ] },
        { section: 'Pendant ton absence', aide: 'Un résumé de ce qui s\'est passé quand tu reviens sur l\'onglet.', entrees: [
            bool('absence.enabled', 'Activer le résumé au retour'),
            nombre('absence.minimumS', 'Absence minimale', 10, 3600, 10, 's')
        ] },
        { section: 'Historique long', aide: 'Garde les messages dans ce navigateur, au-delà des 150 lignes de Twitch. Rien n\'est envoyé ailleurs.', entrees: [
            bool('historique.enabled', 'Enregistrer l\'historique'),
            nombre('historique.maxParChaine', 'Messages gardés par chaîne', 1000, 100000, 1000, ''),
            nombre('historique.jours', 'Durée de conservation', 1, 90, 1, 'jours'),
            bool('historique.survol', 'Derniers messages d\'une personne au survol de son pseudo'),
            nombre('historique.survolMs', 'Délai avant la carte de survol', 200, 3000, 100, 'ms')
        ] },
        { section: 'Pouls du chat', aide: 'Cadence du chat et moments forts de la session.', entrees: [
            bool('pouls.enabled', 'Mesurer le pouls du chat'),
            bool('pouls.pastille', 'Afficher le pouls dans le chat'),
            nombre('pouls.sensibilite', 'Seuil d\'un moment fort', 1.5, 5, 0.1, '× la normale', 'Plus bas : plus de moments repérés.')
        ] },
        { section: 'Divers', entrees: [
            bool('debug', 'Journal détaillé dans la console')
        ] }
    ];
    const ENTREES = REGLAGES.flatMap((s) => s.entrees);

    /** Valeur acceptable pour un réglage, ou undefined. Un nombre est borné et arrondi au pas. */
    const validerReglage = (e, v) => {
        if (e.type === 'bool') return typeof v === 'boolean' ? v : undefined;
        if (e.type === 'choix') return e.options.some(([o]) => o === v) ? v : undefined;
        const n = typeof v === 'number' ? v : (typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN);
        if (!Number.isFinite(n)) return undefined;
        const borne = Math.min(e.max, Math.max(e.min, n));
        const decimales = (String(e.pas).split('.')[1] || '').length;
        return Number((Math.round(borne / e.pas) * e.pas).toFixed(decimales));
    };

    const chargerReglages = () => {
        let stocke = null;
        try { stocke = JSON.parse(lireStockage(CLE_REGLAGES) || 'null'); } catch { stocke = null; }
        if (!stocke || typeof stocke !== 'object') return;
        for (const e of ENTREES) {
            const v = validerReglage(e, lireChemin(stocke, e.cle));
            if (v !== undefined) ecrireChemin(CONFIG, e.cle, v);
        }
    };

    /** Enregistre les écarts aux valeurs d'origine. Rend false si le stockage a refusé. */
    const enregistrerReglages = () => {
        const ecarts = {};
        for (const e of ENTREES) {
            const v = lireChemin(CONFIG, e.cle);
            if (v !== lireChemin(DEFAUTS, e.cle)) ecrireChemin(ecarts, e.cle, v);
        }
        return ecrireStockage(CLE_REGLAGES, Object.keys(ecarts).length ? JSON.stringify(ecarts) : null);
    };

    /** Réapplique la configuration en cours aux messages déjà affichés. */
    const recharger = () => {
        injectCSS();
        if (!chatRoot) return;
        // Le garde-fou d'idempotence des citations est levé : sans cela, un réglage changé
        // n'aurait aucun effet sur les réponses déjà mises en forme.
        for (const q of chatRoot.querySelectorAll('.btc-reply-quote')) delete q.dataset.btcQuote;
        processLine(chatRoot);
        rafraichirNotices();
    };

    let stockageReglagesOk = true;
    const appliquerReglages = () => {
        recharger();
        declencher('reglages');
    };

    const changerReglage = (cle, valeur) => {
        const e = ENTREES.find((x) => x.cle === cle);
        const v = e ? validerReglage(e, valeur) : undefined;
        if (v === undefined) return false;
        ecrireChemin(CONFIG, cle, v);
        stockageReglagesOk = enregistrerReglages();
        appliquerReglages();
        return true;
    };

    const retablirReglages = () => {
        for (const e of ENTREES) ecrireChemin(CONFIG, e.cle, lireChemin(DEFAUTS, e.cle));
        stockageReglagesOk = ecrireStockage(CLE_REGLAGES, null);
        appliquerReglages();
    };

    // ---------------------------------------------------------------- qui regarde
    let identite = null;
    let identiteLueA = 0;
    /**
     * Ton pseudo, lu dans la page (profil gardé par Twitch dans le navigateur, sinon son
     * cookie « login »). Il ne sert qu'à reconnaître les mentions et ne quitte jamais la page.
     */
    const monIdentite = () => {
        if (identite || Date.now() - identiteLueA < 30000) return identite;
        identiteLueA = Date.now();
        try {
            const u = JSON.parse(lireStockage('twilight-user') || 'null');
            if (u && u.login) identite = { login: String(u.login).toLowerCase(), nom: String(u.displayName || u.login).toLowerCase() };
        } catch { /* format inattendu : on essaie le cookie */ }
        if (!identite) {
            const m = (document.cookie || '').match(/(?:^|;\s*)login=([^;]+)/);
            if (m) {
                const login = decodeURIComponent(m[1]).toLowerCase();
                identite = { login, nom: login };
            }
        }
        return identite;
    };

    // ---------------------------------------------------------------- lecture des messages
    /** Texte d'un élément tel qu'on le lit : les emotes y comptent par leur nom. */
    const texteBrut = (el) => {
        if (!el) return '';
        const morceaux = [];
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
        let n;
        while ((n = walker.nextNode())) {
            if (n.nodeType === Node.TEXT_NODE) morceaux.push(n.textContent);
            else if (n.tagName === 'IMG') morceaux.push(` ${n.dataset.emoteName || n.getAttribute('alt') || ''} `);
        }
        return normalizeSpaces(morceaux.join(''));
    };

    /** Auteur, texte, emotes et, pour une réponse, le message d'origine qu'elle cite. */
    const lireMessage = (ligne) => {
        const auteur = ligne.querySelector(SEL.username);
        const login = auteur ? (auteur.dataset.aUser || auteur.dataset.seventvUserLogin || auteur.textContent || '').trim().toLowerCase() : '';
        const nom = auteur ? normalizeSpaces(auteur.textContent || '') : '';
        const couleur = auteur ? (auteur.style.color || auteur.dataset.seventvChatColor || '') : '';
        const corps = ligne.querySelector(SEL.body);
        const texte = texteBrut(corps);
        const emotes = corps
            ? [...corps.querySelectorAll('img')].map((i) => i.dataset.emoteName || i.getAttribute('alt')).filter(Boolean)
            : [];
        const parts = findReplyParts(ligne);
        let parentLogin = '';
        let parentTexte = '';
        if (parts) {
            const cible = parts.quote.querySelector(':scope > span');
            parentLogin = (ligne.dataset.seventvReplyParentLogin || (cible ? cible.textContent : ''))
                .trim().replace(/^@/, '').toLowerCase();
            parentTexte = normalizeSpaces(parts.quote.getAttribute('title') || '');
        }
        const moi = monIdentite();
        let mentionneMoi = false;
        if (moi && login && login !== moi.login) {
            const noms = [...new Set([moi.login, moi.nom])].map(echapperRegex).join('|');
            mentionneMoi = parentLogin === moi.login
                || new RegExp(`(^|[^\\w])@?(${noms})(?![\\w])`, 'i').test(texte);
        }
        return { login, nom, couleur, texte, emotes, estReponse: !!parts, parentLogin, parentTexte, mentionneMoi };
    };

    // Genre d'une notice, d'après son texte (français ou anglais, une fois traduite).
    // Les gifts individuels passent avant tout le reste : leur texte parle aussi d'abonnement.
    const GENRES_NOTICE = [
        ['gift', RE.singleGift],
        ['gift-multiple', RE.massGift],
        ['raid', /\braid/i],
        ['serie', /visionnage|watch\s*streak|stream\s+streak/i],
        ['abonnement', /abonn|subscri|\bprime\b/i]
    ];
    const genreDeNotice = (texte) => (GENRES_NOTICE.find(([, re]) => re.test(texte)) || ['autre'])[0];

    /** Ce que contient une entrée du chat : un message, une notice, ou un message système. */
    const lireEntree = (entree) => {
        const notice = entree.matches(SEL.notice) ? entree : entree.querySelector(SEL.notice);
        if (notice && !notice.matches(SEL.systemNotice)) {
            const texte = normalizeSpaces(texteDeNotice(notice));
            const premier = notice.querySelector(`${SEL.massGiftName} ${SEL.chatterName}`) || nomsDeNotice(notice)[0];
            const nom = premier ? normalizeSpaces(premier.textContent) : '';
            const genre = genreDeNotice(texte);
            const m = genre === 'gift-multiple' ? texte.match(RE.massGift) : null;
            return { type: 'notice', element: entree, notice, genre, texte, login: nom.toLowerCase(), nom,
                quantite: m ? parseCount(m[1] || m[2]) : 1, emotes: [] };
        }
        if (entree.matches(SEL.systemNotice) || entree.querySelector(SEL.systemNotice)) {
            return { type: 'systeme', element: entree, texte: normalizeSpaces(entree.textContent || ''), emotes: [] };
        }
        const ligne = entree.matches(SEL.line) ? entree : entree.querySelector(SEL.line);
        if (ligne) return { type: 'message', element: entree, ligne, ...lireMessage(ligne) };
        return null;
    };

    // Chaque arrivée brute est lue une seule fois ici, puis servie à toutes les fonctions.
    // La lecture complète (texte, emotes, mentions) n'a lieu que si une fonction en a
    // besoin à cet instant ; sinon seul le genre de l'entrée est établi, ce qui suffit à
    // la mesure de cadence. Chaque fonction déclare son besoin dans `besoinsLecture`.
    const besoinsLecture = [];
    const lectureLegere = (entree) => {
        if (entree.matches(SEL.systemNotice) || entree.querySelector(SEL.systemNotice)) return { type: 'systeme', element: entree, emotes: [] };
        if (entree.matches(SEL.notice) || entree.querySelector(SEL.notice)) return { type: 'notice', element: entree, genre: '', emotes: [] };
        if (entree.matches(SEL.line) || entree.querySelector(SEL.line)) return { type: 'message', element: entree, emotes: [], texte: '' };
        return null;
    };
    crochets.arrivee.push((entree, ts) => {
        const info = besoinsLecture.some((f) => f()) ? lireEntree(entree) : lectureLegere(entree);
        if (info) declencher('entree', info, ts);
    });

    // ---------------------------------------------------------------- cadence
    // Horodatage des messages et notices arrivés pendant la dernière minute, dans l'ordre.
    const arrivees = [];
    crochets.entree.push((info, ts) => {
        if (info.type === 'systeme') return;
        let i = arrivees.length;
        while (i > 0 && arrivees[i - 1] > ts) i--;
        arrivees.splice(i, 0, ts);
        const limite = Date.now() - 60000;
        let j = 0;
        while (j < arrivees.length && arrivees[j] < limite) j++;
        if (j) arrivees.splice(0, j);
    });
    /** Débit moyen, en messages par seconde, sur les `s` dernières secondes. */
    const debit = (s, maintenant = Date.now()) => {
        const depuis = maintenant - s * 1000;
        let n = 0;
        for (let i = arrivees.length - 1; i >= 0 && arrivees[i] > depuis; i--) {
            if (arrivees[i] <= maintenant) n++;
        }
        return n / s;
    };

    // ---------------------------------------------------------------- couche d'interface
    // Tout ce que le script affiche lui-même vit dans un shadow DOM : les styles de Twitch
    // ne l'atteignent pas, et les siens ne débordent pas sur la page. Il est rattaché à
    // <body>, hors du conteneur du chat : l'observateur ne le voit pas.
    let ui = null;

    /** Petit constructeur d'éléments : jamais d'innerHTML, tout texte passe par textContent. */
    const h = (tag, attrs, ...enfants) => {
        const el = document.createElement(tag);
        for (const [k, v] of Object.entries(attrs || {})) {
            if (v == null || v === false) continue;
            if (k === 'class') el.className = v;
            else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
            else el.setAttribute(k, v === true ? '' : String(v));
        }
        for (const c of enfants.flat()) {
            if (c == null || c === false) continue;
            el.append(c instanceof Node ? c : String(c));
        }
        return el;
    };

    const installerInterface = () => {
        if (ui) return ui;
        const hote = document.createElement('div');
        hote.id = 'btc-ui';
        hote.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;z-index:2147483000;';
        const racine = hote.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = cssInterface();
        const couche = h('div', { class: 'couche', hidden: true });
        racine.append(style, couche);
        (document.body || document.documentElement).appendChild(hote);
        ui = { hote, racine, style, couche, panneau: null, vues: {}, controles: new Map(), pastille: null, carteAbsence: null, carteSurvol: null };
        return ui;
    };

    /** Cale la couche sur la zone visible du chat, pour y poser pastille et cartes. */
    const placerCouche = () => {
        if (!ui) return;
        const sc = chatRoot && chatRoot.isConnected ? getScroller() : null;
        const r = sc ? sc.getBoundingClientRect() : null;
        const visible = !!r && r.width > 0 && r.height > 0;
        ui.couche.hidden = !visible;
        if (!visible) return;
        Object.assign(ui.couche.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    };
    window.addEventListener('resize', () => placerCouche(), { passive: true });

    /** Amène une ligne du chat à l'écran et la fait ressortir un instant. */
    const allerA = (el) => {
        if (!el || !el.isConnected) return false;
        el.scrollIntoView({ block: 'center', behavior: mouvementReduit() ? 'auto' : 'smooth' });
        el.classList.remove('btc-repere');
        void el.offsetWidth;
        el.classList.add('btc-repere');
        setTimeout(() => el.classList.remove('btc-repere'), 2600);
        return true;
    };

    // =========================================================================
    // PANNEAU DE RÉGLAGES
    // Trois onglets : les réglages, l'historique et le pouls du chat. Chaque fonction
    // inscrit sa propre vue dans `vuesPanneau` ; le panneau ne la construit qu'à la
    // première ouverture.
    // =========================================================================
    const ONGLETS = [['reglages', 'Réglages'], ['historique', 'Historique'], ['pouls', 'Pouls du chat']];
    const vuesPanneau = {};
    let ongletCourant = 'reglages';
    let boutonPanneau = null;

    const panneauOuvert = () => !!(ui && ui.panneau && !ui.panneau.hidden);

    const montrerOnglet = (id) => {
        if (!ui || !ui.panneau) return;
        ongletCourant = id;
        for (const b of ui.panneau.querySelectorAll('[role="tab"]')) {
            const actif = b.dataset.onglet === id;
            b.setAttribute('aria-selected', String(actif));
            b.tabIndex = actif ? 0 : -1;
        }
        for (const [cle, vue] of Object.entries(ui.vues)) vue.hidden = cle !== id;
        const v = vuesPanneau[id];
        if (!v || !v.montrer) return;
        // Une vue peut être asynchrone (historique) : son échec est signalé, pas propagé.
        try {
            const r = v.montrer(ui.vues[id]);
            if (r && typeof r.catch === 'function') r.catch((e) => console.error('[BTC] panneau', e));
        } catch (e) { console.error('[BTC] panneau', e); }
    };

    const fermerPanneau = () => {
        if (!panneauOuvert()) return;
        ui.panneau.hidden = true;
        if (boutonPanneau && boutonPanneau.isConnected) boutonPanneau.focus();
    };

    const synchroniserReglages = () => {
        if (!ui) return;
        for (const [cle, champ] of ui.controles) {
            const v = lireChemin(CONFIG, cle);
            if (champ.type === 'checkbox') champ.checked = !!v;
            else champ.value = String(v);
        }
        for (const p of ui.racine.querySelectorAll('.alerte-stockage')) p.hidden = stockageReglagesOk;
    };

    vuesPanneau.reglages = {
        construire(vue) {
            for (const s of REGLAGES) {
                const groupe = h('fieldset', { class: 'groupe' }, h('legend', {}, s.section), s.aide ? h('p', { class: 'aide' }, s.aide) : null);
                for (const e of s.entrees) {
                    const id = `btc-r-${e.cle.replace(/\W/g, '-')}`;
                    let champ;
                    if (e.type === 'bool') champ = h('input', { type: 'checkbox', id, 'data-cle': e.cle });
                    else if (e.type === 'choix') champ = h('select', { id, 'data-cle': e.cle }, e.options.map(([v, l]) => h('option', { value: v }, l)));
                    else champ = h('input', { type: 'number', id, 'data-cle': e.cle, min: e.min, max: e.max, step: e.pas, inputmode: 'decimal' });
                    champ.addEventListener('change', () => {
                        const brut = e.type === 'bool' ? champ.checked : champ.value;
                        changerReglage(e.cle, brut);
                        synchroniserReglages();
                    });
                    const aide = e.aide ? h('small', { class: 'aide' }, e.aide) : null;
                    groupe.append(e.type === 'bool'
                        ? h('div', { class: 'reglage bool' }, champ, h('label', { for: id }, e.libelle), aide)
                        : h('div', { class: 'reglage' }, h('label', { for: id }, e.libelle),
                            h('span', { class: 'champ' }, champ, e.unite ? h('span', { class: 'unite' }, e.unite) : null), aide));
                    ui.controles.set(e.cle, champ);
                }
                vue.append(groupe);
            }
            // Rétablir en deux temps, sans boîte de dialogue : un premier clic arme, un second confirme.
            const retablir = h('button', { type: 'button', class: 'secondaire', 'data-action': 'retablir' }, 'Rétablir les réglages par défaut');
            let arme = null;
            const desarmer = () => {
                clearTimeout(arme);
                arme = null;
                retablir.textContent = 'Rétablir les réglages par défaut';
                retablir.classList.remove('danger');
            };
            retablir.addEventListener('click', () => {
                if (!arme) {
                    retablir.textContent = 'Confirmer : tout remettre par défaut';
                    retablir.classList.add('danger');
                    arme = setTimeout(desarmer, 4000);
                    return;
                }
                desarmer();
                retablirReglages();
                synchroniserReglages();
            });
            vue.append(h('div', { class: 'pied' }, retablir,
                h('p', { class: 'aide' }, 'Enregistrés dans ce navigateur : ils survivent aux mises à jour du script.'),
                h('p', { class: 'alerte alerte-stockage', hidden: true }, 'Réglage appliqué mais non enregistré : le stockage du navigateur est indisponible.')));
            synchroniserReglages();
        },
        montrer: () => synchroniserReglages()
    };

    const construirePanneau = () => {
        installerInterface();
        const nav = h('div', { class: 'onglets', role: 'tablist', 'aria-label': 'Sections' });
        for (const [id, libelle] of ONGLETS) {
            nav.append(h('button', { type: 'button', role: 'tab', id: `btc-onglet-${id}`, 'data-onglet': id,
                'aria-controls': `btc-vue-${id}`, onclick: () => montrerOnglet(id) }, libelle));
        }
        // Flèches gauche/droite entre les onglets, comme le veut le motif « tablist ».
        nav.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            const ids = ONGLETS.map(([id]) => id);
            const i = (ids.indexOf(ongletCourant) + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length;
            montrerOnglet(ids[i]);
            nav.querySelector(`[data-onglet="${ids[i]}"]`).focus();
        });
        const p = h('div', { class: 'panneau', role: 'dialog', 'aria-label': 'Réglages de BetterTwitchChat', hidden: true },
            h('header', {},
                h('div', { class: 'titre' }, h('strong', {}, 'BetterTwitchChat'), h('span', { class: 'version' }, `v${VERSION}`)),
                h('button', { type: 'button', class: 'fermer', 'aria-label': 'Fermer', onclick: fermerPanneau }, '×')),
            nav);
        for (const [id] of ONGLETS) {
            const vue = h('section', { class: 'vue', id: `btc-vue-${id}`, role: 'tabpanel', 'aria-labelledby': `btc-onglet-${id}`, 'data-vue': id, hidden: true });
            ui.vues[id] = vue;
            p.append(vue);
            const v = vuesPanneau[id];
            if (v && v.construire) protege(v.construire, vue);
        }
        ui.racine.append(p);
        ui.panneau = p;
    };

    const ouvrirPanneau = (onglet) => {
        if (!ui || !ui.panneau) construirePanneau();
        ui.panneau.hidden = false;
        montrerOnglet(onglet || ongletCourant);
        const tab = ui.panneau.querySelector('[role="tab"][aria-selected="true"]');
        if (tab) tab.focus();
    };

    const basculerPanneau = (onglet) => {
        if (panneauOuvert() && (!onglet || onglet === ongletCourant)) fermerPanneau();
        else ouvrirPanneau(onglet);
    };

    // =========================================================================
    // DENSITÉ ADAPTATIVE EN RAFALE
    // Au-delà d'un débit mesuré, une classe sur <html> resserre le chat ; les effets eux-
    // mêmes sont des règles CSS (buildCSS). Deux seuils et une durée minimale évitent le
    // clignotement : on entre au-dessus du seuil haut sur une fenêtre courte, on ne sort
    // qu'en dessous du seuil bas sur une fenêtre double, et pas avant cette même durée.
    // =========================================================================
    let rafaleActive = false;
    let rafaleDepuis = 0;

    const basculerRafale = (oui) => {
        rafaleActive = oui;
        rafaleDepuis = Date.now();
        document.documentElement.classList.toggle('btc-rafale', oui);
        log(oui ? 'rafale : entrée' : 'rafale : sortie', () => `${debit(5).toFixed(1)} msg/s`);
    };

    const evaluerRafale = (maintenant = Date.now()) => {
        const r = CONFIG.rafale;
        if (!r.enabled || !chatRoot) {
            if (rafaleActive) basculerRafale(false);
            return;
        }
        const fenetre = Math.max(1, r.fenetreS || 5);
        const entree = r.entree;
        const sortie = Math.min(r.sortie, entree * 0.8);
        if (!rafaleActive && debit(fenetre, maintenant) >= entree) basculerRafale(true);
        else if (rafaleActive && debit(fenetre * 2, maintenant) < sortie && maintenant - rafaleDepuis >= fenetre * 2000) basculerRafale(false);
    };
    crochets.tic.push(() => evaluerRafale());
    crochets.reglages.push(() => evaluerRafale());
    crochets.deconnexion.push(() => { if (rafaleActive) basculerRafale(false); });

    // =========================================================================
    // FIL DE CONVERSATION AU SURVOL
    // Une réponse cite le texte d'origine (attribut title) et son auteur. On retrouve ce
    // message parmi ceux encore affichés, par auteur et par texte — emotes comprises,
    // lues par leur nom comme dans la citation — puis les autres réponses au même message.
    // =========================================================================
    let filLigne = null;
    let filMinuteur = null;
    const filMarques = [];

    const effacerFil = () => {
        clearTimeout(filMinuteur);
        for (const [el, c] of filMarques.splice(0)) el.classList.remove(c);
        document.documentElement.classList.remove('btc-fil');
    };

    /** Même texte, ou l'un est le début de l'autre (citation tronquée) au-delà de 8 caractères. */
    const memeTexte = (a, b) => {
        const x = sansAccents(a);
        const y = sansAccents(b);
        if (!x || !y) return false;
        return x === y || (Math.min(x.length, y.length) >= 8 && (x.startsWith(y) || y.startsWith(x)));
    };
    const repondA = (r, p) => !!(r && p && r.estReponse && p.login)
        && (r.parentLogin === p.login || r.parentLogin === p.nom.toLowerCase())
        && memeTexte(r.parentTexte, p.texte);
    const memeParent = (a, b) => !!(a && b && a.estReponse && b.estReponse)
        && a.parentLogin === b.parentLogin && memeTexte(a.parentTexte, b.parentTexte);

    const marquerFil = (el, classe) => {
        if (el.classList.contains(classe)) return;
        el.classList.add(classe);
        filMarques.push([el, classe]);
    };

    const montrerFil = (ligne) => {
        effacerFil();
        if (!CONFIG.fil.enabled || !chatRoot || !ligne.isConnected) return;
        const lignes = [...chatRoot.querySelectorAll(SEL.line)];
        const infos = new Map(lignes.map((l) => [l, lireMessage(l)]));
        const m = infos.get(ligne) || lireMessage(ligne);
        let parent = null;
        if (m.estReponse) {
            for (let i = lignes.indexOf(ligne) - 1; i >= 0; i--) {
                if (repondA(m, infos.get(lignes[i]))) { parent = lignes[i]; break; }
            }
        }
        let proches;
        if (parent) {
            const p = infos.get(parent);
            proches = lignes.filter((l) => l !== ligne && l !== parent && repondA(infos.get(l), p));
        } else if (m.estReponse) {
            // Message d'origine sorti du chat : les autres réponses au même message restent liées.
            proches = lignes.filter((l) => l !== ligne && memeParent(infos.get(l), m));
        } else {
            proches = lignes.filter((l) => l !== ligne && repondA(infos.get(l), m));
        }
        if (!parent && !proches.length) return;
        marquerFil(ligne, 'btc-fil-actif');
        if (parent) marquerFil(parent, 'btc-fil-parent');
        for (const l of proches) marquerFil(l, 'btc-fil-enfant');
        if (CONFIG.fil.estomper) document.documentElement.classList.add('btc-fil');
    };

    const surSurvolFil = (e) => {
        if (!CONFIG.fil.enabled) return;
        const ligne = e.target instanceof Element ? e.target.closest(SEL.line) : null;
        if (ligne === filLigne) return;
        filLigne = ligne;
        clearTimeout(filMinuteur);
        if (!ligne) { effacerFil(); return; }
        filMinuteur = setTimeout(() => protege(montrerFil, ligne), CONFIG.fil.delaiMs);
    };
    const surSortieFil = () => {
        filLigne = null;
        effacerFil();
    };

    crochets.connexion.push((root) => {
        root.addEventListener('mouseover', surSurvolFil);
        root.addEventListener('mouseleave', surSortieFil);
    });
    crochets.deconnexion.push((root) => {
        root.removeEventListener('mouseover', surSurvolFil);
        root.removeEventListener('mouseleave', surSortieFil);
        surSortieFil();
    });
    crochets.reglages.push(() => { if (!CONFIG.fil.enabled) surSortieFil(); });

    // =========================================================================
    // HISTORIQUE LONG ET RECHERCHE
    // Les messages arrivés en direct sont gardés dans IndexedDB, par chaîne, dans ce
    // navigateur seulement. Écriture groupée chaque seconde ; purge par âge et par volume
    // toutes les dix minutes. Ce qui était déjà affiché à l'ouverture du chat n'est pas
    // repris : Twitch le rejoue à chaque visite et il serait compté plusieurs fois.
    // =========================================================================
    const NOM_BASE = 'btc-historique';
    const PURGE_MS = 10 * 60000;
    let basePromesse = null;
    let tampon = [];
    let dernierePurge = 0;
    const etatHistorique = { disponible: typeof indexedDB !== 'undefined', erreur: '' };

    const finTransaction = (tx) => new Promise((ok, ko) => {
        tx.oncomplete = () => ok();
        tx.onerror = () => ko(tx.error);
        tx.onabort = () => ko(tx.error);
    });
    const resultat = (r) => new Promise((ok, ko) => {
        r.onsuccess = () => ok(r.result);
        r.onerror = () => ko(r.error);
    });
    /** Parcourt un curseur ; `surCurseur` rend false pour s'arrêter. */
    const parcourirCurseur = (source, plage, sens, surCurseur, cles = false) => new Promise((ok, ko) => {
        const r = cles ? source.openKeyCursor(plage, sens) : source.openCursor(plage, sens);
        r.onsuccess = () => {
            const c = r.result;
            if (!c) { ok(); return; }
            const suite = surCurseur(c);
            if (suite === false) { ok(); return; }
            if (suite !== 'deja') c.continue();
        };
        r.onerror = () => ko(r.error);
    });

    const ouvrirBase = () => {
        if (basePromesse) return basePromesse;
        basePromesse = new Promise((ok) => {
            if (!etatHistorique.disponible) { ok(null); return; }
            let r;
            try { r = indexedDB.open(NOM_BASE, 1); } catch (e) {
                etatHistorique.disponible = false;
                etatHistorique.erreur = String(e && e.message || e);
                ok(null);
                return;
            }
            r.onupgradeneeded = () => {
                const s = r.result.createObjectStore('messages', { keyPath: 'id', autoIncrement: true });
                s.createIndex('chaine_ts', ['chaine', 'ts']);
                s.createIndex('chaine_login_ts', ['chaine', 'login', 'ts']);
                s.createIndex('ts', 'ts');
            };
            r.onsuccess = () => ok(r.result);
            r.onerror = () => {
                etatHistorique.disponible = false;
                etatHistorique.erreur = String(r.error && r.error.message || r.error);
                ok(null);
            };
        });
        return basePromesse;
    };

    const viderTampon = async () => {
        if (!tampon.length) return 0;
        const lot = tampon;
        tampon = [];
        const db = await ouvrirBase();
        if (!db) return 0;
        try {
            const tx = db.transaction('messages', 'readwrite');
            const store = tx.objectStore('messages');
            for (const e of lot) store.add(e);
            await finTransaction(tx);
            return lot.length;
        } catch (e) {
            console.warn('[BTC] historique : écriture impossible', e);
            return 0;
        }
    };

    const plageChaine = (chaine, depuis = -Infinity, avant = Infinity) => IDBKeyRange.bound([chaine, depuis], [chaine, avant], false, true);

    const listerChaines = async () => {
        const db = await ouvrirBase();
        if (!db) return [];
        const chaines = [];
        const index = db.transaction('messages').objectStore('messages').index('chaine_ts');
        await parcourirCurseur(index, null, 'next', (c) => {
            const ch = c.key[0];
            chaines.push(ch);
            c.continue([ch, Infinity]);
            return 'deja';
        }, true);
        return chaines;
    };

    const compterHistorique = async (chaine = chaineCourante) => {
        const db = await ouvrirBase();
        if (!db || !chaine) return 0;
        return resultat(db.transaction('messages').objectStore('messages').index('chaine_ts').count(plageChaine(chaine)));
    };

    const purgerHistorique = async () => {
        dernierePurge = Date.now();
        const db = await ouvrirBase();
        if (!db) return;
        const limiteAge = Date.now() - CONFIG.historique.jours * 86400000;
        let tx = db.transaction('messages', 'readwrite');
        await parcourirCurseur(tx.objectStore('messages').index('ts'), IDBKeyRange.upperBound(limiteAge, true), 'next', (c) => { c.delete(); });
        await finTransaction(tx);
        for (const chaine of await listerChaines()) {
            const nb = await compterHistorique(chaine);
            let enTrop = nb - CONFIG.historique.maxParChaine;
            if (enTrop <= 0) continue;
            tx = db.transaction('messages', 'readwrite');
            await parcourirCurseur(tx.objectStore('messages').index('chaine_ts'), plageChaine(chaine), 'next', (c) => {
                if (enTrop-- <= 0) return false;
                c.delete();
                return true;
            });
            await finTransaction(tx);
        }
    };

    /**
     * Recherche, des plus récents aux plus anciens. `texte` ignore la casse et les accents ;
     * `pseudo` est un début de pseudo ou de login ; `avant` (exclu) sert à paginer.
     */
    const chercherHistorique = async ({ chaine = chaineCourante, texte = '', pseudo = '', depuis = -Infinity,
        avant = Infinity, type = '', limite = 100 } = {}) => {
        const db = await ouvrirBase();
        if (!db || !chaine) return { resultats: [], encore: false };
        const aiguille = sansAccents(normalizeSpaces(texte));
        const qui = sansAccents(String(pseudo).trim().replace(/^@/, ''));
        const garder = (v) => (!type || v.type === type)
            && (!aiguille || sansAccents(v.texte).includes(aiguille))
            && (!qui || sansAccents(v.login).startsWith(qui) || sansAccents(v.nom).startsWith(qui));
        const resultats = [];
        let encore = false;
        const index = db.transaction('messages').objectStore('messages').index('chaine_ts');
        await parcourirCurseur(index, plageChaine(chaine, depuis, avant), 'prev', (c) => {
            if (!garder(c.value)) return true;
            if (resultats.length >= limite) { encore = true; return false; }
            resultats.push(c.value);
            return true;
        });
        return { resultats, encore };
    };

    /** Derniers messages d'une personne sur une chaîne, et combien sont gardés. */
    const derniersDe = async (login, n = 5, chaine = chaineCourante) => {
        const db = await ouvrirBase();
        if (!db || !chaine || !login) return { total: 0, messages: [] };
        const index = db.transaction('messages').objectStore('messages').index('chaine_login_ts');
        const plage = IDBKeyRange.bound([chaine, login, -Infinity], [chaine, login, Infinity]);
        const messages = [];
        await parcourirCurseur(index, plage, 'prev', (c) => {
            messages.push(c.value);
            return messages.length < n;
        });
        const total = await resultat(index.count(plage));
        return { total, messages };
    };

    const effacerHistorique = async (chaine = null) => {
        tampon = chaine ? tampon.filter((e) => e.chaine !== chaine) : [];
        const db = await ouvrirBase();
        if (!db) return;
        const tx = db.transaction('messages', 'readwrite');
        const store = tx.objectStore('messages');
        if (!chaine) store.clear();
        else await parcourirCurseur(store.index('chaine_ts'), plageChaine(chaine), 'next', (c) => { c.delete(); });
        await finTransaction(tx);
    };

    besoinsLecture.push(() => CONFIG.historique.enabled);
    crochets.entree.push((info, ts) => {
        if (!CONFIG.historique.enabled || info.type === 'systeme') return;
        const chaine = chaineCourante || cleDeChaine();
        if (!chaine) return;
        tampon.push({ chaine, ts, type: info.type, genre: info.genre || '', login: info.login || '', nom: info.nom || '',
            couleur: info.couleur || '', texte: info.texte || '', parent: info.parentLogin || '', mention: !!info.mentionneMoi });
        if (tampon.length >= 200) viderTampon();
    });
    crochets.tic.push(() => {
        if (tampon.length) viderTampon();
        if (CONFIG.historique.enabled && Date.now() - dernierePurge > PURGE_MS) purgerHistorique();
    });

    // ---- carte au survol d'un pseudo
    let survolNom = null;
    let survolMinuteur = null;
    let survolJeton = 0;

    const masquerCarteSurvol = () => {
        survolJeton++;
        if (ui && ui.carteSurvol) ui.carteSurvol.hidden = true;
    };

    const montrerCarteSurvol = async (nomEl) => {
        const jeton = ++survolJeton;
        const login = (nomEl.dataset.aUser || nomEl.dataset.seventvUserLogin || nomEl.textContent || '').trim().toLowerCase();
        const { total, messages } = await derniersDe(login, 5);
        if (jeton !== survolJeton || !nomEl.isConnected) return;
        installerInterface();
        if (!ui.carteSurvol) {
            ui.carteSurvol = h('div', { class: 'carte survol', role: 'tooltip', hidden: true });
            ui.racine.append(ui.carteSurvol);
        }
        const carte = ui.carteSurvol;
        carte.replaceChildren(
            h('div', { class: 'entete' }, h('strong', {}, normalizeSpaces(nomEl.textContent || login)),
                h('span', {}, total ? `${pluriel(total, 'message gardé', 'messages gardés')} ici` : 'aucun message gardé ici')),
            messages.length
                ? h('ul', {}, messages.map((m) => h('li', {}, h('time', {}, dateCourte(m.ts)), h('span', {}, m.texte || '—'))))
                : null);
        carte.dataset.total = String(total);
        carte.hidden = false;
        const r = nomEl.getBoundingClientRect();
        const largeur = Math.min(320, window.innerWidth - 16);
        const gauche = Math.max(8, Math.min(r.left, window.innerWidth - largeur - 8));
        const haut = r.bottom + 6 + carte.offsetHeight > window.innerHeight ? Math.max(8, r.top - carte.offsetHeight - 6) : r.bottom + 6;
        Object.assign(carte.style, { left: `${gauche}px`, top: `${haut}px`, width: `${largeur}px` });
    };

    const surSurvolPseudo = (e) => {
        if (!CONFIG.historique.enabled || !CONFIG.historique.survol) return;
        const nomEl = e.target instanceof Element ? e.target.closest(SEL.username) : null;
        if (nomEl === survolNom) return;
        survolNom = nomEl;
        clearTimeout(survolMinuteur);
        masquerCarteSurvol();
        if (nomEl) survolMinuteur = setTimeout(() => montrerCarteSurvol(nomEl).catch(() => {}), CONFIG.historique.survolMs);
    };
    const surSortiePseudo = () => {
        survolNom = null;
        clearTimeout(survolMinuteur);
        masquerCarteSurvol();
    };
    crochets.connexion.push((root) => {
        root.addEventListener('mouseover', surSurvolPseudo);
        root.addEventListener('mouseleave', surSortiePseudo);
    });
    crochets.deconnexion.push((root) => {
        root.removeEventListener('mouseover', surSurvolPseudo);
        root.removeEventListener('mouseleave', surSortiePseudo);
        surSortiePseudo();
    });

    // ---- vue « Historique » du panneau
    const PERIODES = [['tout', 'Tout', Infinity], ['heure', 'Dernière heure', 3600000], ['jour', '24 heures', 86400000], ['semaine', '7 jours', 604800000]];
    const filtresHistorique = { chaine: '', texte: '', pseudo: '', periode: 'tout', type: '' };
    let rechercheJeton = 0;

    const ouvrirHistorique = (filtres = {}) => {
        Object.assign(filtresHistorique, { chaine: chaineCourante || '', texte: '', pseudo: '', periode: 'tout', type: '' }, filtres);
        ouvrirPanneau('historique');
    };

    vuesPanneau.historique = {
        construire(vue) {
            const etat = h('div', { class: 'etat' });
            const chaine = h('select', { id: 'btc-h-chaine', 'aria-label': 'Chaîne' });
            const texte = h('input', { type: 'search', id: 'btc-h-texte', placeholder: 'Mot, phrase, emote…', 'aria-label': 'Texte recherché' });
            const pseudo = h('input', { type: 'search', id: 'btc-h-pseudo', placeholder: 'Pseudo', 'aria-label': 'Pseudo' });
            const periode = h('select', { id: 'btc-h-periode', 'aria-label': 'Période' }, PERIODES.map(([v, l]) => h('option', { value: v }, l)));
            const type = h('select', { id: 'btc-h-type', 'aria-label': 'Type' },
                h('option', { value: '' }, 'Messages et notices'), h('option', { value: 'message' }, 'Messages'), h('option', { value: 'notice' }, 'Notices'));
            const resume = h('p', { class: 'resume', 'aria-live': 'polite' });
            const liste = h('ol', { class: 'resultats' });
            const plus = h('button', { type: 'button', class: 'secondaire', hidden: true }, 'Plus anciens');
            const effacerChaine = h('button', { type: 'button', class: 'secondaire' }, 'Effacer cette chaîne');
            const toutEffacer = h('button', { type: 'button', class: 'secondaire' }, 'Tout effacer');
            const formulaire = h('form', { class: 'recherche', role: 'search' }, chaine, texte, pseudo, periode, type);
            vue.append(etat, formulaire, resume, liste, plus, h('div', { class: 'pied' }, effacerChaine, toutEffacer,
                h('p', { class: 'aide' }, 'Tout reste dans ce navigateur. Les messages déjà affichés à l\'ouverture du chat ne sont pas repris.')));

            let dernierTs = Infinity;
            const lire = () => ({ chaine: chaine.value, texte: texte.value, pseudo: pseudo.value, periode: periode.value, type: type.value });
            const afficher = (resultats, ajouter) => {
                if (!ajouter) liste.replaceChildren();
                for (const m of resultats) {
                    const qui = h('button', { type: 'button', class: 'pseudo', title: `Messages de ${m.nom || m.login}` }, m.nom || m.login || '—');
                    if (m.couleur) qui.style.color = m.couleur;
                    qui.addEventListener('click', () => { pseudo.value = m.login; chercher(); });
                    liste.append(h('li', { class: m.type === 'notice' ? 'notice' : null }, h('time', { datetime: new Date(m.ts).toISOString() }, dateCourte(m.ts)), qui, h('span', { class: 'texte' }, m.texte || '—')));
                }
            };
            // Déclaration hissée : les pseudos de la liste relancent la recherche.
            async function chercher(suite = false) {
                const jeton = ++rechercheJeton;
                const f = lire();
                Object.assign(filtresHistorique, f);
                const duree = (PERIODES.find(([v]) => v === f.periode) || PERIODES[0])[2];
                const r = await chercherHistorique({ chaine: f.chaine, texte: f.texte, pseudo: f.pseudo, type: f.type,
                    depuis: Number.isFinite(duree) ? Date.now() - duree : -Infinity, avant: suite ? dernierTs : Infinity, limite: 100 });
                if (jeton !== rechercheJeton) return;
                afficher(r.resultats, suite);
                if (r.resultats.length) dernierTs = r.resultats[r.resultats.length - 1].ts;
                plus.hidden = !r.encore;
                const n = liste.children.length;
                resume.textContent = n ? `${pluriel(n, 'résultat', 'résultats')}${r.encore ? ' (et plus)' : ''}` : 'Aucun message ne correspond.';
            }
            let differe = null;
            formulaire.addEventListener('input', () => { clearTimeout(differe); differe = setTimeout(() => chercher(), 250); });
            formulaire.addEventListener('change', () => chercher());
            formulaire.addEventListener('submit', (e) => { e.preventDefault(); chercher(); });
            plus.addEventListener('click', () => chercher(true));

            const deuxTemps = (bouton, libelle, action) => {
                let arme = null;
                bouton.addEventListener('click', async () => {
                    if (!arme) {
                        bouton.textContent = 'Confirmer la suppression';
                        bouton.classList.add('danger');
                        arme = setTimeout(() => { arme = null; bouton.textContent = libelle; bouton.classList.remove('danger'); }, 4000);
                        return;
                    }
                    clearTimeout(arme);
                    arme = null;
                    bouton.textContent = libelle;
                    bouton.classList.remove('danger');
                    await action();
                    vuesPanneau.historique.montrer(vue);
                });
            };
            deuxTemps(effacerChaine, 'Effacer cette chaîne', () => effacerHistorique(chaine.value));
            deuxTemps(toutEffacer, 'Tout effacer', () => effacerHistorique(null));

            vue.btc = { etat, chaine, texte, pseudo, periode, type, chercher };
        },
        async montrer(vue) {
            const c = vue.btc;
            if (!c) return;
            c.etat.replaceChildren();
            vue.querySelector('form').hidden = !CONFIG.historique.enabled;
            if (!CONFIG.historique.enabled) {
                // Rien n'est ouvert tant que l'historique est coupé : pas de base créée pour rien.
                const activer = h('button', { type: 'button', class: 'principal' }, 'Activer l\'historique');
                activer.addEventListener('click', () => { changerReglage('historique.enabled', true); vuesPanneau.historique.montrer(vue); });
                c.etat.append(h('p', {}, 'L\'historique est désactivé : rien n\'est enregistré.'), activer,
                    h('p', { class: 'aide' }, 'Ce qui a déjà été gardé reste en place et redevient consultable à la réactivation.'));
                return;
            }
            if (!etatHistorique.disponible) {
                c.etat.append(h('p', { class: 'alerte' }, `Stockage IndexedDB indisponible dans ce navigateur${etatHistorique.erreur ? ` (${etatHistorique.erreur})` : ''}.`));
                return;
            }
            await viderTampon();
            const chaines = await listerChaines();
            const courante = chaineCourante || '';
            if (courante && !chaines.includes(courante)) chaines.unshift(courante);
            c.chaine.replaceChildren(...chaines.map((ch) => h('option', { value: ch }, ch === courante ? `${ch} (en cours)` : ch)));
            c.chaine.value = filtresHistorique.chaine && chaines.includes(filtresHistorique.chaine) ? filtresHistorique.chaine : courante;
            c.texte.value = filtresHistorique.texte;
            c.pseudo.value = filtresHistorique.pseudo;
            c.periode.value = filtresHistorique.periode;
            c.type.value = filtresHistorique.type;
            const total = c.chaine.value ? await compterHistorique(c.chaine.value) : 0;
            c.etat.append(h('p', { class: 'aide' }, c.chaine.value
                ? `${pluriel(total, 'message gardé', 'messages gardés')} pour ${c.chaine.value}.`
                : 'Aucune chaîne enregistrée pour l\'instant.'));
            await c.chercher();
        }
    };

    // =========================================================================
    // « PENDANT TON ABSENCE »
    // Quand l'onglet passe en arrière-plan, on tient les comptes de ce qui arrive ; au
    // retour, s'il s'est absenté assez longtemps et qu'il s'est passé quelque chose, une
    // carte le résume. Le script traite le chat même onglet masqué (correction B4).
    // =========================================================================
    let absence = null;

    const nouvelleAbsence = () => ({
        debut: Date.now(), messages: 0, notices: { abonnement: 0, gift: 0, raid: 0, serie: 0 },
        donateurs: new Map(), mentions: [], emotes: new Map(), auteurs: new Map(), seaux: new Map()
    });

    besoinsLecture.push(() => !!absence);
    crochets.entree.push((info, ts) => {
        if (!absence) return;
        if (info.type === 'message') {
            absence.messages++;
            incrementer(absence.seaux, Math.floor(ts / 10000));
            for (const e of info.emotes) incrementer(absence.emotes, e);
            if (info.login) incrementer(absence.auteurs, info.nom || info.login);
            if (info.mentionneMoi && absence.mentions.length < 20) {
                absence.mentions.push({ element: info.element, nom: info.nom || info.login, texte: info.texte, ts });
            }
        } else if (info.type === 'notice') {
            // Un gift multiple s'annonce puis arrive en N gifts individuels : seuls ces
            // derniers sont comptés, l'annonce compterait chaque abonnement deux fois.
            if (info.genre === 'gift') {
                absence.notices.gift++;
                if (info.nom) incrementer(absence.donateurs, info.nom);
            } else if (info.genre in absence.notices) {
                absence.notices[info.genre]++;
            }
        }
    });

    const resumerAbsence = (a, duree) => {
        const notices = a.notices;
        const emotes = premiers(a.emotes, 5).map(([nom, n]) => ({ nom, n, url: (emoteIndex.get(nom) || {}).url || '' }));
        return {
            duree,
            messages: a.messages,
            parMinute: Math.round(a.messages / Math.max(1, duree / 60000)),
            pic: Math.max(0, ...a.seaux.values()) * 6,
            notices,
            donateur: premiers(a.donateurs, 1)[0] || null,
            mentions: a.mentions,
            emotes,
            bavards: premiers(a.auteurs, 3)
        };
    };

    const fermerAbsence = () => {
        if (ui && ui.carteAbsence) { ui.carteAbsence.remove(); ui.carteAbsence = null; }
    };

    const afficherAbsence = (r) => {
        installerInterface();
        fermerAbsence();
        placerCouche();
        const lignes = [];
        lignes.push(h('p', {}, `${pluriel(r.messages, 'message', 'messages')} · ${nombreFr(r.parMinute)}/min en moyenne`
            + (r.pic ? ` · pic à ${nombreFr(r.pic)}/min` : '')));
        const n = r.notices;
        const evenements = [];
        if (n.abonnement) evenements.push(pluriel(n.abonnement, 'abonnement', 'abonnements'));
        if (n.gift) evenements.push(`${pluriel(n.gift, 'abonnement offert', 'abonnements offerts')}${r.donateur ? ` (${nombreFr(r.donateur[1])} par ${r.donateur[0]})` : ''}`);
        if (n.raid) evenements.push(pluriel(n.raid, 'raid', 'raids'));
        if (n.serie) evenements.push(pluriel(n.serie, 'série de visionnage', 'séries de visionnage'));
        if (evenements.length) lignes.push(h('p', {}, evenements.join(' · ')));
        if (r.mentions.length) {
            lignes.push(h('p', { class: 'titre-bloc' }, pluriel(r.mentions.length, 'mention de toi', 'mentions de toi')));
            lignes.push(h('ul', { class: 'mentions' }, r.mentions.slice(0, 5).map((m) => {
                const present = m.element && m.element.isConnected;
                const aller = present
                    ? h('button', { type: 'button', class: 'lien', onclick: () => allerA(m.element) }, 'Aller au message')
                    : (CONFIG.historique.enabled
                        ? h('button', { type: 'button', class: 'lien', onclick: () => ouvrirHistorique({ texte: m.texte.slice(0, 60) }) }, 'Voir dans l\'historique')
                        : h('span', { class: 'aide' }, 'plus dans le chat'));
                return h('li', {}, h('strong', {}, m.nom), h('span', { class: 'texte' }, ` ${m.texte}`), aller);
            })));
        }
        if (r.emotes.length) {
            lignes.push(h('p', { class: 'emotes' }, 'Emotes phares : ', r.emotes.map((e) => h('span', { class: 'emote' },
                e.url ? h('img', { src: e.url, alt: e.nom, title: e.nom }) : h('span', {}, e.nom), ` ×${nombreFr(e.n)}`))));
        }
        if (r.bavards.length) {
            lignes.push(h('p', {}, 'Les plus bavards : ', r.bavards.map(([nom, nb]) => `${nom} (${nombreFr(nb)})`).join(' · ')));
        }
        const carte = h('div', { class: 'carte absence', role: 'status', 'aria-live': 'polite',
            'data-messages': r.messages, 'data-gifts': n.gift, 'data-abonnements': n.abonnement, 'data-raids': n.raid, 'data-mentions': r.mentions.length },
        h('header', {}, h('strong', {}, 'Pendant ton absence'), h('span', { class: 'duree' }, dureeLisible(r.duree)),
            h('button', { type: 'button', class: 'fermer', 'aria-label': 'Fermer le résumé', onclick: fermerAbsence }, '×')),
        lignes);
        ui.couche.append(carte);
        ui.carteAbsence = carte;
    };

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            absence = CONFIG.absence.enabled ? nouvelleAbsence() : null;
            return;
        }
        const a = absence;
        absence = null;
        if (!a || !CONFIG.absence.enabled) return;
        const duree = Date.now() - a.debut;
        if (duree < CONFIG.absence.minimumS * 1000) return;
        const evenements = Object.values(a.notices).reduce((x, y) => x + y, 0);
        if (!a.messages && !evenements) return;
        protege(() => afficherAbsence(resumerAbsence(a, duree)));
    });
    crochets.deconnexion.push(() => fermerAbsence());

    // =========================================================================
    // POULS DU CHAT ET MOMENTS FORTS
    // Les messages sont comptés par seaux de 10 s (deux heures gardées). Un seau compte
    // comme pic quand il dépasse à la fois `sensibilite` fois la médiane des 30 seaux qui
    // le précèdent (5 minutes) et cette médiane plus un écart minimal, avec un plancher
    // absolu ; des pics consécutifs forment un seul moment. Il faut une minute
    // d'historique pour juger : l'ouverture d'une session ne fait pas un pic.
    // =========================================================================
    const SEAU_MS = 10000;
    const SEAUX_MAX = 720;
    const seaux = [];
    let moments = [];
    let seauAnalyse = 0;
    let debutLive = null;
    let debutLiveLuA = 0;

    const nouveauSeau = (debut) => ({ debut, n: 0, emotes: new Map(), textes: new Map() });

    const seauPour = (ts) => {
        const debut = Math.floor(ts / SEAU_MS) * SEAU_MS;
        const dernier = seaux[seaux.length - 1];
        if (dernier && dernier.debut === debut) return dernier;
        if (dernier && debut < dernier.debut) return seaux.find((s) => s.debut === debut) || null;
        // Seaux vides intercalés : le graphe garde l'échelle du temps pendant un creux.
        let t = dernier ? Math.max(dernier.debut + SEAU_MS, debut - SEAUX_MAX * SEAU_MS) : debut;
        while (t < debut) { seaux.push(nouveauSeau(t)); t += SEAU_MS; }
        const s = nouveauSeau(debut);
        seaux.push(s);
        if (seaux.length > SEAUX_MAX) seaux.splice(0, seaux.length - SEAUX_MAX);
        return s;
    };

    besoinsLecture.push(() => CONFIG.pouls.enabled);
    crochets.entree.push((info, ts) => {
        if (!CONFIG.pouls.enabled || info.type !== 'message') return;
        const s = seauPour(ts);
        if (!s) return;
        s.n++;
        for (const e of info.emotes) incrementer(s.emotes, e);
        const t = sansAccents(info.texte).slice(0, 80);
        if (t && (s.textes.has(t) || s.textes.size < 40)) incrementer(s.textes, t);
    });

    /** Moments forts d'une série de seaux { n } : indices de début et de fin (exclue), pic, base. */
    const detecterMoments = (serie, { sensibilite = 2.5, minimum = 8, ecartMin = 5, fenetre = 30, historiqueMin = 6 } = {}) => {
        const trouves = [];
        for (let i = 0; i < serie.length; i++) {
            if (i < historiqueMin) continue;
            const base = mediane(serie.slice(Math.max(0, i - fenetre), i).map((s) => s.n));
            const seuil = Math.max(minimum, base * sensibilite, base + ecartMin);
            if (serie[i].n < seuil) continue;
            const dernier = trouves[trouves.length - 1];
            if (dernier && dernier.fin === i) {
                dernier.fin = i + 1;
                dernier.pic = Math.max(dernier.pic, serie[i].n);
            } else {
                trouves.push({ debut: i, fin: i + 1, pic: serie[i].n, base });
            }
        }
        return trouves;
    };

    /** Lit « 1:23:45 » ou « 23:45 » en millisecondes. */
    const lireDuree = (texte) => {
        const m = String(texte || '').match(/(?:(\d+):)?(\d{1,2}):(\d{2})(?!\d)/);
        if (!m) return null;
        return ((Number(m[1] || 0) * 3600) + Number(m[2]) * 60 + Number(m[3])) * 1000;
    };

    // Durée du live affichée par Twitch près du lecteur. Sa classe n'est pas garantie : à
    // défaut, les moments n'ont que leur heure locale.
    const SEL_DUREE_LIVE = ['.live-time', '[data-a-target="player-live-time"]', '[class*="live-time"]'];
    const lireDebutLive = () => {
        if (Date.now() - debutLiveLuA < 60000) return debutLive;
        debutLiveLuA = Date.now();
        for (const sel of SEL_DUREE_LIVE) {
            const el = document.querySelector(sel);
            const duree = el && lireDuree(el.textContent);
            if (duree != null) {
                const estime = Date.now() - duree;
                if (!debutLive || Math.abs(estime - debutLive) > 5000) debutLive = estime;
                return debutLive;
            }
        }
        return debutLive;
    };

    const analyserPouls = () => {
        // Le seau en cours n'est pas jugé : il n'est pas fini.
        const clos = seaux.slice(0, -1);
        const trouves = detecterMoments(clos, { sensibilite: CONFIG.pouls.sensibilite, minimum: CONFIG.pouls.minimum });
        lireDebutLive();
        moments = trouves.map((m) => {
            const emotes = new Map();
            const textes = new Map();
            for (const s of clos.slice(m.debut, m.fin)) {
                for (const [e, n] of s.emotes) incrementer(emotes, e, n);
                for (const [t, n] of s.textes) incrementer(textes, t, n);
            }
            const texte = premiers(textes, 1)[0];
            const ts = clos[m.debut].debut;
            return {
                ts,
                fin: clos[m.fin - 1].debut + SEAU_MS,
                parMinute: m.pic * 6,
                base: Math.round(m.base * 6),
                emote: (premiers(emotes, 1)[0] || [])[0] || '',
                texte: texte && texte[1] >= 3 ? texte[0] : '',
                depuisLive: debutLive != null && ts >= debutLive ? ts - debutLive : null
            };
        });
        seauAnalyse = clos.length ? clos[clos.length - 1].debut : 0;
    };

    crochets.tic.push(() => {
        if (!CONFIG.pouls.enabled || !chatRoot) return;
        // Un seau vide est ouvert chaque seconde s'il le faut : un chat muet est aussi une mesure.
        seauPour(Date.now());
        const clos = seaux.length > 1 ? seaux[seaux.length - 2].debut : 0;
        if (clos !== seauAnalyse) analyserPouls();
    });
    crochets.reglages.push(() => { if (CONFIG.pouls.enabled) analyserPouls(); });
    let chainePouls = null;
    crochets.connexion.push(() => {
        // Changement de chaîne : la session de pouls repart de zéro.
        if (chaineCourante === chainePouls) return;
        chainePouls = chaineCourante;
        seaux.length = 0;
        moments = [];
        seauAnalyse = 0;
        debutLive = null;
        debutLiveLuA = 0;
    });

    const enPic = () => {
        const dernier = moments[moments.length - 1];
        return !!dernier && seaux.length > 1 && dernier.fin >= seaux[seaux.length - 2].debut + SEAU_MS;
    };

    const emoteDominante = (nbSeaux) => {
        const e = new Map();
        for (const s of seaux.slice(-nbSeaux)) for (const [nom, n] of s.emotes) incrementer(e, nom, n);
        return (premiers(e, 1)[0] || [])[0] || '';
    };

    const etiquetteMoment = (m) => `${m.depuisLive != null ? `+${horloge(m.depuisLive)} · ` : ''}${heureCourte(m.ts)}`;

    /** Liste des moments forts, prête à coller (notes de VOD, clips). */
    const texteMoments = () => {
        const titre = `Moments forts — ${chaineCourante || 'chat'} — ${new Date().toLocaleDateString('fr-FR')}`;
        const lignes = moments.map((m) => `${etiquetteMoment(m)} — ${nombreFr(m.parMinute)} msg/min (normale ${nombreFr(m.base)})`
            + `${m.emote ? ` — ${m.emote}` : ''}${m.texte ? ` — « ${m.texte} »` : ''}`);
        return [titre, ...(lignes.length ? lignes : ['(aucun moment fort pour l\'instant)'])].join('\n');
    };

    /** Barres de messages par minute ; les moments forts ressortent dans la couleur d'alerte. */
    const dessinerPouls = (canevas, serie, { marquer = true } = {}) => {
        const dpr = window.devicePixelRatio || 1;
        const largeur = Math.max(10, canevas.clientWidth || Number(canevas.getAttribute('width')) || 60);
        const hauteur = Math.max(10, canevas.clientHeight || Number(canevas.getAttribute('height')) || 18);
        canevas.width = Math.round(largeur * dpr);
        canevas.height = Math.round(hauteur * dpr);
        const x = canevas.getContext('2d');
        if (!x) return;
        x.setTransform(dpr, 0, 0, dpr, 0, 0);
        x.clearRect(0, 0, largeur, hauteur);
        if (!serie.length) return;
        const style = getComputedStyle(canevas);
        const couleur = style.getPropertyValue('--trace').trim() || '#a970ff';
        const alerte = style.getPropertyValue('--alerte').trim() || '#eb0400';
        const max = Math.max(1, ...serie.map((s) => s.n));
        const pas = largeur / serie.length;
        const dansMoment = (t) => marquer && moments.some((m) => t >= m.ts && t < m.fin);
        serie.forEach((s, i) => {
            const hBarre = Math.max(s.n ? 1 : 0, (s.n / max) * (hauteur - 2));
            x.fillStyle = dansMoment(s.debut) ? alerte : couleur;
            x.fillRect(i * pas, hauteur - hBarre, Math.max(1, pas - (pas > 3 ? 1 : 0)), hBarre);
        });
    };

    vuesPanneau.pouls = {
        construire(vue) {
            const etat = h('div', { class: 'etat' });
            const chiffres = h('p', { class: 'chiffres', 'aria-live': 'polite' });
            const canevas = h('canvas', { class: 'graphe', height: '120', role: 'img', 'aria-label': 'Messages par minute pendant la session' });
            const legende = h('p', { class: 'aide' });
            const liste = h('ol', { class: 'moments' });
            const copier = h('button', { type: 'button', class: 'secondaire' }, 'Copier la liste');
            const copie = h('textarea', { class: 'copie', readonly: true, rows: '4', hidden: true, 'aria-label': 'Liste des moments forts' });
            copier.addEventListener('click', async () => {
                const texte = texteMoments();
                try {
                    await navigator.clipboard.writeText(texte);
                    copier.textContent = 'Copiée';
                    setTimeout(() => { copier.textContent = 'Copier la liste'; }, 2000);
                } catch {
                    copie.value = texte;
                    copie.hidden = false;
                    copie.select();
                }
            });
            vue.append(etat, chiffres, canevas, legende, h('h3', {}, 'Moments forts'), liste, h('div', { class: 'pied' }, copier, copie,
                h('p', { class: 'aide' }, 'Mesure de la session en cours, sur ce navigateur. L\'heure « +h:mm:ss » est comptée depuis le début du live quand Twitch l\'affiche.')));
            vue.btc = { etat, chiffres, canevas, legende, liste };
        },
        montrer(vue) {
            const c = vue.btc;
            if (!c) return;
            c.etat.replaceChildren();
            if (!CONFIG.pouls.enabled) {
                const activer = h('button', { type: 'button', class: 'principal' }, 'Activer le pouls du chat');
                activer.addEventListener('click', () => { changerReglage('pouls.enabled', true); vuesPanneau.pouls.montrer(vue); });
                c.etat.append(h('p', {}, 'Le pouls est désactivé : rien n\'est mesuré.'), activer);
            }
            const minute = Math.round(debit(60) * 60);
            const emote = emoteDominante(6);
            c.chiffres.textContent = `${nombreFr(minute)} messages sur la dernière minute${emote ? ` · emote du moment : ${emote}` : ''}`;
            dessinerPouls(c.canevas, seaux);
            const debut = seaux[0];
            c.legende.textContent = debut ? `Depuis ${heureCourte(debut.debut)} · un trait = 10 s · en rouge : moments forts` : 'Pas encore de mesure.';
            c.liste.replaceChildren(...(moments.length ? [...moments].reverse().map((m) => h('li', {},
                h('time', {}, etiquetteMoment(m)), h('strong', {}, `${nombreFr(m.parMinute)} msg/min`),
                h('span', { class: 'aide' }, ` (normale ${nombreFr(m.base)})`),
                m.emote ? h('span', { class: 'emote' }, ` · ${m.emote}`) : null,
                m.texte ? h('span', { class: 'texte' }, ` · « ${m.texte} »`) : null)) : [h('li', { class: 'aide' }, 'Aucun moment fort pour l\'instant.')]));
        }
    };
    crochets.tic.push(() => {
        if (panneauOuvert() && ongletCourant === 'pouls' && ui.vues.pouls) vuesPanneau.pouls.montrer(ui.vues.pouls);
    });

    // =========================================================================
    // PASTILLE, BOUTON ET RACCOURCI
    // La pastille, en haut à droite du chat, réunit l'état de rafale et le pouls. Le
    // bouton s'insère à côté de l'engrenage des réglages du chat ; s'il n'est pas là,
    // Alt+Maj+B et __BTC.reglages.ouvrir() ouvrent toujours le panneau.
    // =========================================================================
    const majPastille = () => {
        const rafale = CONFIG.rafale.enabled && CONFIG.rafale.indicateur && rafaleActive;
        const pouls = CONFIG.pouls.enabled && CONFIG.pouls.pastille;
        if (!rafale && !pouls) {
            if (ui && ui.pastille) ui.pastille.hidden = true;
            return;
        }
        installerInterface();
        if (!ui.pastille) {
            ui.pastille = h('button', { type: 'button', class: 'pastille', hidden: true },
                h('canvas', { class: 'mini', width: '60', height: '16', 'aria-hidden': 'true' }),
                h('span', { class: 'valeur' }), h('span', { class: 'etiquette' }));
            ui.pastille.addEventListener('click', () => basculerPanneau(CONFIG.pouls.enabled ? 'pouls' : 'reglages'));
            ui.couche.append(ui.pastille);
        }
        const p = ui.pastille;
        p.hidden = false;
        p.classList.toggle('rafale', rafale);
        p.classList.toggle('pic', pouls && enPic());
        const mini = p.querySelector('.mini');
        mini.hidden = !pouls;
        if (pouls) dessinerPouls(mini, seaux.slice(-30), { marquer: true });
        const minute = Math.round(debit(60) * 60);
        p.querySelector('.valeur').textContent = rafale ? `Rafale · ${Math.round(debit(5))} msg/s` : `${nombreFr(minute)}/min`;
        const emote = pouls ? emoteDominante(6) : '';
        p.querySelector('.etiquette').textContent = emote && !rafale ? emote : '';
        p.setAttribute('aria-label', rafale
            ? `Rafale en cours, ${Math.round(debit(5))} messages par seconde. Ouvrir le panneau.`
            : `Pouls du chat : ${minute} messages par minute${emote ? `, emote du moment ${emote}` : ''}. Ouvrir le panneau.`);
    };

    const iconeReglages = () => {
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '0 0 20 20');
        svg.setAttribute('width', '20');
        svg.setAttribute('height', '20');
        svg.setAttribute('aria-hidden', 'true');
        for (const [y, x] of [[5, 13], [10, 7], [15, 11]]) {
            const trait = document.createElementNS(ns, 'path');
            trait.setAttribute('d', `M3 ${y}H17`);
            trait.setAttribute('stroke', 'currentColor');
            trait.setAttribute('stroke-width', '1.6');
            trait.setAttribute('stroke-linecap', 'round');
            const bouton = document.createElementNS(ns, 'circle');
            bouton.setAttribute('cx', String(x));
            bouton.setAttribute('cy', String(y));
            bouton.setAttribute('r', '2.2');
            bouton.setAttribute('fill', 'currentColor');
            svg.append(trait, bouton);
        }
        return svg;
    };

    const assurerBouton = () => {
        const ancre = document.querySelector('[data-a-target="chat-settings"]');
        if (!ancre || !ancre.parentElement) return;
        if (boutonPanneau && boutonPanneau.isConnected && boutonPanneau.nextElementSibling === ancre) return;
        if (!boutonPanneau) {
            boutonPanneau = h('button', { type: 'button', class: 'btc-bouton', 'aria-label': 'Réglages de BetterTwitchChat',
                title: 'BetterTwitchChat (Alt+Maj+B)' }, iconeReglages());
            boutonPanneau.addEventListener('click', (e) => { e.preventDefault(); basculerPanneau(); });
        }
        ancre.parentElement.insertBefore(boutonPanneau, ancre);
    };

    window.addEventListener('keydown', (e) => {
        if (e.altKey && e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyB') {
            e.preventDefault();
            basculerPanneau();
        } else if (e.key === 'Escape' && panneauOuvert()) {
            fermerPanneau();
        }
    }, true);

    crochets.tic.push(() => {
        assurerBouton();
        placerCouche();
        majPastille();
    });
    crochets.reglages.push(() => majPastille());

    // =========================================================================
    // DÉMARRAGE
    // =========================================================================
    chargerReglages();
    injectCSS();
    watchNavigation();
    document.addEventListener('visibilitychange', surVisibilite);
    surveillerRacine();
    setInterval(() => {
        surveillerRacine();
        declencher('tic');
    }, 1000);

    // Point d'entrée pour bidouiller la config depuis la console.
    window.__BTC = {
        config: CONFIG,
        // Réapplique la config en cours aux messages déjà affichés.
        reload: () => recharger(),
        emotes: emoteIndex,
        gifts,
        // Panneau et réglages persistants (enregistrés dans ce navigateur).
        reglages: {
            ouvrir: (onglet) => ouvrirPanneau(onglet),
            fermer: () => fermerPanneau(),
            changer: (cle, valeur) => changerReglage(cle, valeur),
            retablir: () => retablirReglages(),
            liste: () => ENTREES.map((e) => ({ ...e, valeur: lireChemin(CONFIG, e.cle), defaut: lireChemin(DEFAUTS, e.cle) }))
        },
        historique: {
            chercher: chercherHistorique,
            derniersDe,
            compter: compterHistorique,
            chaines: listerChaines,
            vider: viderTampon,
            purger: purgerHistorique,
            effacer: effacerHistorique,
            // Pour le banc de test : ajoute des entrées comme si elles étaient arrivées.
            ajouter: (entrees) => { tampon.push(...entrees); }
        },
        pouls: { seaux, moments: () => moments, detecter: detecterMoments, texte: texteMoments },
        rafale: () => rafaleActive,
        // Outils internes, exposés pour le banc de test et le diagnostic.
        interne: {
            terminerStabilisation: () => { arriveesDes = 0; },
            lireMessage, lireEntree, genreDeNotice, monIdentite, debit, lireDuree, validerReglage
        },
        // Contrôle des points d'accroche. Lancé seul 20 s après le démarrage ; à
        // rappeler à la main pour voir le détail.
        selfCheck: () => runSelfCheck({ verbeux: true }),

        // Diagnostic : dit quelle version tourne réellement et ce qui est appliqué.
        check() {
            const quote = document.querySelector('.btc-reply-quote');
            const body = document.querySelector(SEL.body);
            const info = {
                version: VERSION,
                style: CONFIG.reply.style,
                fontScale: CONFIG.reply.fontScale,
                tailleCitation: quote ? getComputedStyle(quote).fontSize : '(aucune réponse à l\'écran)',
                tailleMessage: body ? getComputedStyle(body).fontSize : '(aucun message à l\'écran)',
                reponsesTraitees: document.querySelectorAll('.btc-reply').length,
                emotesIndexees: emoteIndex.size,
                cssInjecte: !!document.getElementById('btc-styles'),
                conteneurConnecte: !!chatRoot && chatRoot.isConnected,
                // Rendu progressif : de quoi voir d'un coup d'œil si une boucle reste
                // en route ou si des lignes sont restées masquées.
                glissementMs: CONFIG.smoothScrollMs,
                batchMs: CONFIG.messageBatchMs,
                glissementEnCours: glissementActif,
                boucleActive: frame !== null,
                lignesEnAttente: enAttenteAffichage.length,
                vitesseChat: Math.round(vitesseContenu),
                debitMsgParS: Number(debit(5).toFixed(1)),
                rafale: rafaleActive,
                historique: CONFIG.historique.enabled,
                pouls: CONFIG.pouls.enabled
            };
            console.table(info);
            return info;
        },

        /**
         * Explique QUI décide de la taille de la citation. Parcourt toutes les feuilles
         * de style, retient les règles qui visent réellement l'élément et déclarent une
         * font-size, et les rend dans l'ordre de la cascade. À utiliser quand la taille
         * ne correspond pas à `fontScale` : la dernière ligne gagnante est la coupable.
         */
        whyFontSize() {
            const quote = document.querySelector('.btc-reply-quote');
            if (!quote) { console.warn('[BTC] aucune réponse à l\'écran'); return null; }
            const matches = [];
            // Les règles groupées (@media, @supports, @layer, @container) sont parcourues
            // aussi : la règle gagnante peut s'y trouver.
            const parcourir = (rules, origine) => {
                for (const rule of rules) {
                    if (!rule.selectorText) {
                        if (rule.cssRules) parcourir(rule.cssRules, origine);
                        continue;
                    }
                    const value = rule.style && rule.style.getPropertyValue('font-size');
                    if (!value) continue;
                    let hit = false;
                    try { hit = quote.matches(rule.selectorText); } catch { /* sélecteur exotique */ }
                    if (!hit) continue;
                    matches.push({
                        origine,
                        selecteur: rule.selectorText,
                        valeur: value,
                        important: rule.style.getPropertyPriority('font-size') === 'important'
                    });
                }
            };
            for (const sheet of document.styleSheets) {
                let rules;
                try { rules = sheet.cssRules; } catch {
                    matches.push({ origine: sheet.href || '(inline)', erreur: 'illisible (CORS)' });
                    continue;
                }
                if (rules) parcourir(rules, sheet.href ? sheet.href.split('/').pop() : (sheet.ownerNode?.id || '(inline)'));
            }
            const applique = getComputedStyle(quote).fontSize;
            console.log(`[BTC] taille réellement appliquée : ${applique}`);
            console.table(matches);
            return { applique, regles: matches };
        }
    };

    console.log(`[BetterTwitchChat] v${VERSION} — chat Twitch natif + 7TV`);
})();
