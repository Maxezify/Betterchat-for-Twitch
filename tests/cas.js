'use strict';
/*
 * Cas de test. Chaque cas renvoie { ok, details } : ok vaut true quand le comportement est
 * correct. Le champ `audit` relie le cas aux points d'AUDIT.md.
 *
 *   dynamique : le script tourne dans Chromium, sur la page de tests/page.js ;
 *   statique  : lecture du code source ou analyse ESLint.
 */

const CAS = [];
const dyn = (id, audit, titre, run) => CAS.push({ id, audit, type: 'dynamique', titre, run });
const stat = (id, audit, titre, run) => CAS.push({ id, audit, type: 'statique', titre, run });

// =============================================================================
// Bugs
// =============================================================================
dyn('B1', ['B1', 'D1'], 'Démarrage avec une citation sans title : pas de plantage', ({ ouvrir }) =>
    ouvrir(async (page, { errors }) => {
        const r = await page.evaluate(() => ({
            api: typeof window.__BTC,
            suivante: document.querySelectorAll('.chat-line__message')[1].classList.contains('btc-reply')
        }));
        return { ok: r.api === 'object' && r.suivante && !errors.length,
            details: `__BTC=${r.api}, réponse suivante traitée=${r.suivante}, erreur=${errors[0] || 'aucune'}` };
    }, {
        before: () => {
            window.__mk.root().appendChild(window.__mk.reply({ title: false, quoted: 'sans title' }));
            window.__mk.root().appendChild(window.__mk.reply({ quoted: 'avec title' }));
        }
    }));

dyn('B1b', ['B1', 'D1'], 'Citation sans title après le démarrage : aucune exception', ({ ouvrir }) =>
    ouvrir(async (page, { consoleErrors }) => {
        const traitee = await page.evaluate(async () => {
            const w = window.__mk.reply({ title: false }); window.__mk.root().appendChild(w);
            await window.__mk.frames(4);
            return w.querySelector('.chat-line__message').classList.contains('btc-reply');
        });
        const err = consoleErrors.find((t) => t.includes('[BTC]'));
        return { ok: !err && traitee, details: err ? err.split('\n')[0].slice(0, 110) : `aucune erreur, réponse traitée=${traitee}` };
    }));

dyn('B1c', ['B1'], 'Un <p> sans title hors réponse n\'est pas pris pour une citation', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const w = window.__mk.message({ premier: '<div><p>Bandeau Twitch</p></div>' });
        window.__mk.root().appendChild(w); await window.__mk.frames(4);
        const faux = w.querySelector('.chat-line__message').classList.contains('btc-reply');
        return { ok: !faux, details: `ligne marquée comme réponse=${faux}` };
    })));

dyn('B2', ['B2'], 'Couleur de chaîne découverte : le tampon d\'affichage n\'est pas vidé d\'un coup', async ({ ouvrir }) => {
    const scenario = (neutre) => ouvrir((page) => page.evaluate(async (avecNeutre) => {
        const mk = window.__mk; const root = mk.root();
        if (avecNeutre) { root.appendChild(mk.notice({ bar: 'rgb(128, 128, 128)', html: `<p>${mk.name('zoe')} est sur une série de 3 visionnages</p>` })); await mk.frames(10); }
        for (let i = 0; i < 60; i++) root.appendChild(mk.message({ text: `msg ${i}` }));
        root.appendChild(mk.notice({ html: `<p>${mk.name('carol')} s'est abonné avec Prime.</p>` }));
        await Promise.resolve();
        const avant = document.querySelectorAll('.btc-differe').length;
        const apres = await new Promise((r) => requestAnimationFrame(() => r(document.querySelectorAll('.btc-differe').length)));
        return avant - apres;
    }, neutre));
    const temoin = await scenario(false);
    const neutre = await scenario(true);
    return { ok: neutre <= Math.max(temoin * 4, 8), details: `lignes relâchées dans l'image : témoin=${temoin}, après une notice grise=${neutre}` };
});

dyn('B3', ['B3'], 'Deux gifts multiples successifs du même donateur', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        root.appendChild(mk.massGift('xavier', 2)); await mk.frames();
        root.appendChild(mk.singleGift('xavier', 'alice')); root.appendChild(mk.singleGift('xavier', 'bob')); await mk.frames();
        const b2 = mk.massGift('xavier', 2); root.appendChild(b2); await mk.frames();
        const liste = () => [...b2.querySelectorAll('.btc-gift-recipient')].map((s) => s.textContent).join(', ');
        const avant = liste();
        const carol = mk.singleGift('xavier', 'carol'); const dave = mk.singleGift('xavier', 'dave');
        root.appendChild(carol); root.appendChild(dave); await mk.frames();
        const visibles = [carol, dave].filter((n) => !n.classList.contains('btc-hidden')).length;
        return { ok: !avant.includes('alice') && visibles === 0 && liste() === 'carol, dave',
            details: `2e liste à l'ouverture="${avant}", finale="${liste()}", gifts restés visibles=${visibles}/2` };
    })));

dyn('B4', ['B4', 'R9'], 'Onglet en arrière-plan : pas de rétention, tout est traité', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        const rafSuspendus = [];
        const masquer = (oui) => {
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => oui });
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (oui ? 'hidden' : 'visible') });
            document.dispatchEvent(new Event('visibilitychange'));
        };
        window.requestAnimationFrame = (cb) => { rafSuspendus.push(cb); return rafSuspendus.length; };
        masquer(true);
        const N = 2000, TAMPON = 150;
        for (let i = 0; i < N; i += 10) {
            for (let j = 0; j < 10; j++) root.appendChild(mk.reply({ quoted: `q${i + j}` }));
            while (root.children.length > TAMPON) root.firstElementChild.remove();
            await mk.sleep(0);
        }
        await mk.sleep(300);
        const retenues = window.__BTC.check().lignesEnAttente;
        window.requestAnimationFrame = window.__realRAF;
        masquer(false);
        for (const cb of rafSuspendus.splice(0)) cb(performance.now());
        await mk.frames(90);
        const brutes = [...root.querySelectorAll('.chat-line__message')].filter((l) => !l.classList.contains('btc-reply')).length;
        return { ok: retenues <= 300 && brutes === 0,
            details: `lignes retenues pendant l'arrière-plan=${retenues}, réponses visibles non traitées au retour=${brutes}/${TAMPON}` };
    })));

dyn('B5', ['B5'], 'Le message écrit par l\'abonné n\'est pas traduit', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const texte = "I redeemed my points in Dave's channel !";
        const n = mk.notice({ html: `<p>${mk.name('carol')} subscribed with Prime.</p>`, after: mk.nested('carol', texte) });
        mk.root().appendChild(n); await mk.frames();
        const t = n.querySelector('[data-a-target="chat-line-message-body"]').textContent;
        const notice = n.querySelector('.txt').textContent;
        return { ok: t === texte && notice.includes("s'est abonné avec Prime"),
            details: `message="${t}" ; notice="${notice.trim()}"` };
    })));

dyn('B5b', ['B5'], 'Une phrase de l\'abonné ne fait pas passer sa notice pour un gift', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        root.appendChild(mk.massGift('carol', 3)); await mk.frames();
        const n = mk.notice({ html: `<p>${mk.name('carol')} s'est abonné avec Prime.</p>`,
            after: mk.nested('carol', `<span class="text-fragment">I gifted a sub to </span>${mk.name('dave')}`) });
        root.appendChild(n); await mk.frames();
        const masquee = n.classList.contains('btc-hidden');
        return { ok: !masquee, details: `notice de réabonnement masquée comme un gift=${masquee}` };
    })));

dyn('B6', ['B6'], 'Gift dans une notice peu imbriquée : le chat reste visible', async ({ ouvrir }) => {
    const scenario = (depth) => ouvrir((page) => page.evaluate(async (d) => {
        const mk = window.__mk; const root = mk.root();
        root.appendChild(mk.message());
        root.appendChild(mk.massGift('xavier', 2)); await mk.frames();
        const g = mk.singleGift('xavier', 'alice', { depth: d }); root.appendChild(g); await mk.frames();
        return { racine: getComputedStyle(root).display, giftMasque: g.classList.contains('btc-hidden') };
    }, depth));
    const d1 = await scenario(1);
    const d0 = await scenario(0);
    const ok = d1.racine !== 'none' && d0.racine !== 'none' && d1.giftMasque && d0.giftMasque;
    return { ok, details: `racine : carte directe=${d1.racine}, notice directe=${d0.racine} ; gift masqué=${d1.giftMasque}/${d0.giftMasque}` };
});

dyn('B7', ['B7'], 'Message joint dans le bloc texte : il garde son bloc', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk;
        const dedans = mk.notice({ html: `<p>${mk.name('carol')} s'est abonné avec Prime.</p>${mk.nested('carol', 'coucou')}` });
        const dehors = mk.notice({ html: `<p>${mk.name('dan')} s'est abonné avec Prime.</p>`, after: mk.nested('dan', 'salut') });
        mk.root().append(dedans, dehors); await mk.frames();
        const d = getComputedStyle(dedans.querySelector('.btc-notice-text .chat-line__message')).display;
        const o = getComputedStyle(dehors.querySelector('[data-test-selector="user-notice-line"] > .chat-line__message')).display;
        return { ok: d !== 'inline' && o !== 'inline', details: `display du message joint : dans le bloc texte=${d}, hors du bloc=${o}` };
    })));

dyn('B8', ['B8'], 'messageBatchMs = 100 : le tampon se résorbe aussi vite qu\'au réglage par défaut', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        window.__BTC.config.messageBatchMs = 100;
        const t0 = performance.now();
        for (let i = 0; i < 120; i++) root.appendChild(mk.message({ text: `m${i}` }));
        await Promise.resolve();   // laisse l'observateur différer les lignes
        const differees = document.querySelectorAll('.btc-differe').length;
        while (document.querySelector('.btc-differe') && performance.now() - t0 < 9000) await mk.frames(1);
        const ms = Math.round(performance.now() - t0);
        return { ok: differees > 0 && ms < 3500, details: `${differees} lignes différées, relâchées en ${ms} ms (attendu < 3500)` };
    })));

// =============================================================================
// Robustesse
// =============================================================================
dyn('R1', ['R1'], 'Changement d\'URL sur la même chaîne : l\'état est conservé', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        root.appendChild(mk.message());
        root.appendChild(mk.massGift('xavier', 3)); await mk.frames();
        root.appendChild(mk.singleGift('xavier', 'alice')); await mk.frames();
        history.replaceState(null, '', location.pathname + '?ref=test');
        await mk.sleep(1700);
        const bob = mk.singleGift('xavier', 'bob'); root.appendChild(bob); await mk.frames();
        const suivis = window.__BTC.gifts.pending.size;
        return { ok: suivis === 1 && bob.classList.contains('btc-hidden'),
            details: `gifts suivis après navigation=${suivis}, gift suivant regroupé=${bob.classList.contains('btc-hidden')}` };
    })));

dyn('R1b', ['R1'], 'Changement de chaîne : emotes et gifts de l\'ancienne chaîne soldés', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        root.appendChild(mk.message({ emotes: ['Kappa'] }));
        const bombe = mk.massGift('xavier', 3); root.appendChild(bombe); await mk.frames();
        root.appendChild(mk.singleGift('xavier', 'alice')); await mk.frames();
        history.pushState(null, '', '/autrechaine');
        await mk.sleep(800);
        const liste = bombe.querySelector('.btc-gift-recipients');
        const enAttente = !!liste && liste.classList.contains('btc-gift-pending');
        const emotes = window.__BTC.emotes.size;
        return { ok: !enAttente && emotes === 0 && window.__BTC.gifts.pending.size === 0,
            details: `liste encore « en attente »=${enAttente}, emotes gardées=${emotes}, gifts suivis=${window.__BTC.gifts.pending.size}` };
    })));

dyn('R2', ['R2'], 'Conteneur remplacé sans changement d\'URL : reconnexion', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const old = mk.root();
        old.appendChild(mk.message()); await mk.frames();
        const neuf = old.cloneNode(false); old.replaceWith(neuf);
        await mk.sleep(1500);
        neuf.appendChild(mk.reply()); await mk.frames(5);
        const traitee = neuf.querySelector('.chat-line__message').classList.contains('btc-reply');
        return { ok: traitee, details: `réponse dans le nouveau conteneur traitée=${traitee}` };
    })));

dyn('R2b', ['R2', 'D2'], 'Conteneur disparu : l\'auto-diagnostic le signale', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const old = mk.root();
        old.appendChild(mk.message()); await mk.frames();
        old.remove();
        await mk.sleep(1500);
        const diag = window.__BTC.selfCheck();
        return { ok: diag.ok === false, details: `selfCheck().ok=${diag.ok} (attendu false)` };
    })));

dyn('R3', ['R3'], 'Étiquette 7TV posée seule : retirée', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const w = mk.message(); mk.root().appendChild(w); await mk.frames();
        const line = w.querySelector('.chat-line__message');
        line.setAttribute('data-seventv-custom-highlight-label', '★'); await mk.frames();
        const reste = line.hasAttribute('data-seventv-custom-highlight-label');
        return { ok: !reste, details: `attribut toujours présent=${reste}` };
    })));

dyn('R4', ['R4'], 'Thème clair : séparateurs de destinataires et filet des réponses visibles', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        root.appendChild(mk.massGift('xavier', 2)); await mk.frames();
        root.appendChild(mk.singleGift('xavier', 'alice')); root.appendChild(mk.singleGift('xavier', 'bob'));
        const w = mk.reply(); root.appendChild(w); await mk.frames(4);
        const virgule = getComputedStyle(document.querySelector('.btc-gift-recipient'), '::after').color;
        const ombre = getComputedStyle(w.querySelector('.chat-line__message')).boxShadow;
        const filet = (ombre.match(/^(.*?)\s+-?[\d.]+px/) || [])[1] || 'none';
        const lv = mk.luminanceSur(virgule); const lf = mk.luminanceSur(filet);
        return { ok: lv < 0.85 && lf < 0.85,
            details: `luminance sur fond blanc : virgule=${lv.toFixed(2)}, filet=${lf.toFixed(2)} (1 = invisible)` };
    }), { page: { theme: 'clair' } }));

dyn('R6', ['R6'], 'Couleurs color-mix() lues, couleurs transparentes ignorées', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        const a = mk.reply({ style: 'background-color: color-mix(in srgb, rgb(145, 71, 255) 30%, transparent)' });
        const b = mk.reply({ style: 'background-color: rgba(255, 0, 0, 0)' });
        root.append(a, b); await mk.frames(4);
        const va = a.querySelector('.chat-line__message').style.getPropertyValue('--btc-reply-accent');
        const vb = b.querySelector('.chat-line__message').style.getPropertyValue('--btc-reply-accent');
        // Le canevas arrondit à l'unité près : on tolère un écart de 3 par composante.
        const proche = (v, cible) => { const m = v.match(/(\d+),\s*(\d+),\s*(\d+)/); return !!m && cible.every((c, i) => Math.abs(+m[i + 1] - c) <= 3); };
        return { ok: proche(va, [145, 71, 255]) && !vb, details: `accent color-mix="${va || 'aucun'}", accent fond transparent="${vb || 'aucun'}"` };
    })));

dyn('R7a', ['R7'], 'Pseudo international : coloré dans une notice', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        root.appendChild(mk.message({ user: 'Jéjé Ünïcode', login: 'jeje_login', color: 'rgb(200, 30, 30)' })); await mk.frames();
        const n = mk.notice({ html: `<p>${mk.name('Jéjé Ünïcode')} s'est abonné avec Prime.</p>` });
        root.appendChild(n); await mk.frames();
        const c = n.querySelector('.chatter-name').style.color;
        return { ok: c === 'rgb(200, 30, 30)', details: `couleur posée="${c || 'aucune'}"` };
    })));

dyn('R7b', ['R7'], 'Changement de couleur en cours de session : suivi', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        root.appendChild(mk.message({ user: 'alice', color: 'rgb(255, 0, 0)' })); await mk.frames();
        root.appendChild(mk.message({ user: 'alice', color: 'rgb(0, 0, 255)' })); await mk.frames();
        const n = mk.notice({ html: `<p>${mk.name('alice')} s'est abonné avec Prime.</p>` });
        root.appendChild(n); await mk.frames();
        const c = n.querySelector('.chatter-name').style.color;
        return { ok: c === 'rgb(0, 0, 255)', details: `couleur posée="${c}" (attendu la plus récente, bleu)` };
    })));

dyn('R7c', ['R7'], 'Couleur du message joint : réservée à son auteur', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        root.appendChild(mk.message({ user: 'dave', color: 'rgb(0, 0, 255)' })); await mk.frames();
        const n = mk.notice({ html: `<p>${mk.name('carol')} parle de ${mk.name('dave')}</p>`, after: mk.nested('carol', 'coucou', 'rgb(0, 200, 0)') });
        root.appendChild(n); await mk.frames();
        const [c, d] = [...n.querySelectorAll('.txt .chatter-name')].map((x) => x.style.color);
        return { ok: c === 'rgb(0, 200, 0)' && d === 'rgb(0, 0, 255)', details: `carol="${c}", dave="${d}" (attendu vert, bleu)` };
    })));

dyn('R8', ['R8'], 'Défilement porté par un ancêtre : le repli structurel est trouvé', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        for (let i = 0; i < 80; i++) { root.appendChild(mk.message({ text: `m${i}` })); if (i % 10 === 9) await mk.frames(2); }
        await mk.sleep(2500);
        const o = document.querySelector('.outer');
        const ecart = Math.round(o.scrollHeight - o.scrollTop - o.clientHeight);
        return { ok: ecart < 10, details: `écart au bas du chat=${ecart}px (attendu < 10)` };
    }), { page: { scrollerParent: true } }));

dyn('R9', ['R9'], '300 lignes d\'un coup : aucune n\'est perdue', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        for (let i = 0; i < 300; i++) root.appendChild(mk.reply({ quoted: `q${i}` }));
        await mk.frames(10);
        const brutes = [...root.querySelectorAll('.chat-line__message')].filter((l) => !l.classList.contains('btc-reply')).length;
        return { ok: brutes === 0, details: `réponses non traitées=${brutes}/300` };
    })));

dyn('R10', ['R10'], 'Script chargé deux fois : une seule instance', ({ ouvrir, SCRIPT }) =>
    ouvrir(async (page, { logs }) => {
        await page.addScriptTag({ content: SCRIPT });
        await page.evaluate(() => window.__mk.frames(3));
        const banniere = logs.filter((t) => /^\[BetterTwitchChat\] v\S+ — chat Twitch/.test(t)).length;
        return { ok: banniere === 1, details: `instances démarrées=${banniere}` };
    }));

// =============================================================================
// Performance
// =============================================================================
dyn('P1', ['P1'], 'Une seule lecture du style calculé par réponse', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        const orig = window.getComputedStyle; let appels = 0;
        window.getComputedStyle = function (e, ...r) { if (e && e.classList && e.classList.contains('chat-line__message')) appels++; return orig.call(this, e, ...r); };
        for (let i = 0; i < 100; i++) root.appendChild(mk.reply({ quoted: `q${i}` }));
        await mk.frames(60);
        window.getComputedStyle = orig;
        return { ok: appels <= 100, details: `getComputedStyle pour 100 réponses=${appels}` };
    })));

dyn('P2', ['P2'], 'Gift de 100 : liste construite en O(n)', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        root.appendChild(mk.massGift('xavier', 100)); await mk.frames();
        let spans = 0;
        const mo = new MutationObserver((l) => { for (const m of l) for (const n of m.addedNodes) if (n.classList && n.classList.contains('btc-gift-recipient')) spans++; });
        mo.observe(root, { childList: true, subtree: true });
        for (let i = 0; i < 100; i += 10) {
            for (let j = 0; j < 10; j++) root.appendChild(mk.singleGift('xavier', `user${i + j}`));
            await mk.frames(2);
        }
        await mk.frames(10); mo.disconnect();
        return { ok: spans === 100, details: `spans créés pour 100 destinataires=${spans}` };
    })));

dyn('P3', ['P3', 'P2'], 'Nos propres éléments ne repassent pas dans le pipeline', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        root.appendChild(mk.message({ emotes: ['Kappa'] })); await mk.frames();
        root.appendChild(mk.massGift('xavier', 30)); await mk.frames();
        const qsa = Element.prototype.querySelectorAll; let surNous = 0;
        const nous = /(^|\s)btc-(reply-mention|reply-emote|gift-recipient)/;
        Element.prototype.querySelectorAll = function (...a) { if (nous.test(this.className || '')) surNous++; return qsa.apply(this, a); };
        for (let i = 0; i < 30; i++) {
            root.appendChild(mk.reply({ quoted: `Kappa @bob ${i}` }));
            root.appendChild(mk.singleGift('xavier', `u${i}`));
        }
        await mk.frames(20);
        Element.prototype.querySelectorAll = qsa;
        return { ok: surNous === 0, details: `requêtes lancées sur nos propres éléments=${surNous}` };
    })));

dyn('P5', ['P5'], 'Index des emotes : une emote revue n\'est pas évincée', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        for (let m = 0; m < 12; m++) root.appendChild(mk.message({ emotes: Array.from({ length: 50 }, (_, i) => `e${m * 50 + i}`) }));
        await mk.frames(4);
        root.appendChild(mk.message({ emotes: ['e0'] })); await mk.frames(4);
        root.appendChild(mk.message({ emotes: ['e600'] })); await mk.frames(4);
        const garde = window.__BTC.emotes.has('e0');
        return { ok: garde, details: `emote revue juste avant l'éviction toujours indexée=${garde}` };
    })));

// =============================================================================
// Outils de debug
// =============================================================================
dyn('D2', ['D2'], 'Compteurs du diagnostic : une ligne comptée une fois', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        for (let i = 0; i < 10; i++) root.appendChild(mk.message({ text: `m${i}` }));
        await mk.frames(4);
        window.__BTC.reload(); window.__BTC.reload();
        const n = window.__BTC.selfCheck().compteurs.lignes;
        return { ok: n === 10, details: `lignes comptées=${n} (attendu 10)` };
    })));

dyn('D3', ['D3'], 'whyFontSize() voit les règles placées dans @media', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const w = mk.reply(); mk.root().appendChild(w); await mk.frames(4);
        const st = document.createElement('style');
        st.textContent = '@media all { .btc-reply-quote.d3-test { font-size: 3px; } }';
        document.head.appendChild(st);
        w.querySelector('.btc-reply-quote').classList.add('d3-test');
        const r = window.__BTC.whyFontSize();
        const vu = !!r && r.regles.some((x) => x.selecteur === '.btc-reply-quote.d3-test');
        return { ok: vu, details: `règle @media listée=${vu}` };
    })));

dyn('D4', ['D4'], 'reload() réapplique la teinte des notices', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const n = mk.notice({ html: `<p>${mk.name('carol')} s'est abonné avec Prime.</p>` });
        mk.root().appendChild(n); await mk.frames();
        window.__BTC.config.compact.tintOpacity = 0.4; window.__BTC.reload();
        const v = n.querySelector('.btc-notice-card').style.getPropertyValue('--btc-notice-tint');
        return { ok: /0\.4\)$/.test(v), details: `teinte après reload="${v}"` };
    })));

// =============================================================================
// Statique : code mort, maintenabilité, distribution
// =============================================================================
const absent = (src, motifs) => motifs.filter((m) => (m instanceof RegExp ? m.test(src) : src.includes(m)));
const verifAbsence = (motifs) => ({ SCRIPT }) => {
    const restants = absent(SCRIPT, motifs);
    return { ok: !restants.length, details: restants.length ? `encore présent : ${restants.map(String).join(' ; ')}` : 'aucune trace' };
};

stat('M1', ['M1'], 'Expressions RE.totalGifts, RE.subscribed, RE.raid retirées', verifAbsence([/^\s+totalGifts:/m, /^\s+subscribed:/m, /^\s+raid:/m]));
stat('M2', ['M2'], 'Constante L inutilisée retirée', verifAbsence(['const L =']));
stat('M3', ['M3'], 'tier et entry.ts retirés', verifAbsence(['RE.tier', /^\s+tier:/m, 'ts: Date.now(), timer']));
stat('M4', ['M4'], 'Ligne redondante de render() retirée', verifAbsence(["if (!recipients.length) listEl.textContent = '';"]));
stat('M5', ['M5'], 'selfCheckDone retiré', verifAbsence(['selfCheckDone']));
stat('M6', ['M6'], 'diag.verifieA retiré', verifAbsence(['verifieA']));
stat('M7', ['M7'], 'Sélecteur .seventv-chat-list retiré', verifAbsence(["'.seventv-chat-list'"]));
stat('M8', ['M8'], 'Alternative de sélecteur redondante retirée', verifAbsence(['.scrollable-area[data-a-target="chat-scroller"]']));
stat('M9', ['M9'], 'Gardes impossibles retirées', verifAbsence(['try { images = root.querySelectorAll', 'try { nodes = root.querySelectorAll', 'matches?.(', 'classList?.']));
stat('M10', ['M10'], 'Replis var() jamais utilisés retirés', verifAbsence(['var(--btc-reply-font-scale, ']));

stat('Q1', ['Q1'], 'Commentaires remis à leur place', ({ SCRIPT }) => {
    const src = SCRIPT.replace(/\r\n/g, '\n');
    const echecs = [];
    if (!/Trait de séparation[^\n]*\n[^\n]*\n\s+separators:/.test(src)) echecs.push('commentaire de separators');
    if (!/Reporte la couleur posée par 7TV[\s\S]{0,400}?\*\/\n\s+const applyGradeAccent/.test(src)) echecs.push('JSDoc de applyGradeAccent');
    if (src.includes('tools/7tv-dom-recorder')) echecs.push('renvoi vers un outil absent');
    if (src.includes('segment de branche par `main`')) echecs.push('consigne de mise à jour périmée');
    return { ok: !echecs.length, details: echecs.length ? `à corriger : ${echecs.join(', ')}` : 'commentaires cohérents' };
});

stat('Q4', ['Q4'], 'CSS dédoublonné, nombres magiques nommés', ({ SCRIPT }) => {
    const icones = (SCRIPT.match(/\$\{NL\} \.btc-notice-icon \{/g) || []).length;
    // Le retrait de la liste des destinataires ne doit plus être écrit en dur (26 + 6 px).
    const restes = absent(SCRIPT, [/\.btc-gift-recipients\s*\{\s*margin:\s*3px 0 0 32px/, "'inherit' : '14px'", 'childElementCount > 3']);
    return { ok: icones === 1 && !restes.length, details: `blocs .btc-notice-icon=${icones} ; nombres en dur restants=${restes.join(', ') || 'aucun'}` };
});

stat('Q5', ['Q5'], 'Version : en-tête et repli identiques, lue via GM_info', ({ SCRIPT }) => {
    const entete = (SCRIPT.match(/@version\s+(\S+)/) || [])[1];
    const repli = (SCRIPT.match(/const VERSION\s*=[\s\S]{0,160}?['"](\d+\.\d+\.\d+)['"]/) || [])[1];
    const gm = /GM_info\.script\.version/.test(SCRIPT);
    return { ok: !!entete && entete === repli && gm, details: `@version=${entete}, repli=${repli}, GM_info=${gm}` };
});

stat('S2', ['S2'], 'Mises à jour depuis prod de ce dépôt, identité du script conservée', ({ SCRIPT }) => {
    const url = 'https://raw.githubusercontent.com/Maxezify/Betterchat-for-Twitch/prod/BetterTwitchChat.user.js';
    const maj = (SCRIPT.match(/@updateURL\s+(\S+)/) || [])[1];
    const dl = (SCRIPT.match(/@downloadURL\s+(\S+)/) || [])[1];
    const nom = (SCRIPT.match(/@name\s+(.+)/) || [])[1];
    const ns = (SCRIPT.match(/@namespace\s+(\S+)/) || [])[1];
    const ok = maj === url && dl === url && nom.trim() === 'BetterTwitchChat (+ 7TV)'
        && ns === 'https://github.com/Maxezify/BetterTwitchChat-with-7tv';
    return { ok, details: `@updateURL=${maj === url ? 'prod de ce dépôt' : maj} ; @name/@namespace inchangés=${nom.trim() === 'BetterTwitchChat (+ 7TV)' && ns.endsWith('BetterTwitchChat-with-7tv')}` };
});

stat('LINT', ['Q2', 'Q3', 'M2'], 'ESLint : aucun avertissement', async ({ eslint }) => {
    const r = await eslint();
    if (r === null) return { ok: null, details: 'ESLint absent (npm install)' };
    return { ok: r.length === 0, details: r.length ? `${r.length} avertissement(s) : ${r.slice(0, 3).join(' | ')}` : '0 avertissement' };
});

// =============================================================================
// Fonctions de la v15.26 (F1 panneau, F3 rafale, F5 fil, F7 absence,
// F14 pouls). Les cas qui dépendent des arrivées en direct lèvent d'abord la période
// de stabilisation (2 s après la connexion, où Twitch rejoue les derniers messages).
// =============================================================================
const STOCKAGE = 'btc:reglages:v1';
const recharger = async (page, SCRIPT) => {
    await page.reload();
    await page.addScriptTag({ content: SCRIPT });
    await page.evaluate(() => window.__mk.frames(3));
};

dyn('F1a', ['F1'], 'Panneau : un contrôle par réglage, deux onglets', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        window.__BTC.reglages.ouvrir();
        await window.__mk.frames(2);
        const r = window.__mk.ui();
        const p = r && r.querySelector('.panneau');
        const visible = !!p && (p.tagName === 'DIALOG' ? p.open : !p.hidden);
        const controles = r ? r.querySelectorAll('[data-cle]').length : 0;
        const attendu = window.__BTC.reglages.liste().length;
        const onglets = r ? r.querySelectorAll('[role="tab"]').length : 0;
        return { ok: visible && controles === attendu && onglets === 2,
            details: `panneau ouvert=${visible}, contrôles=${controles}/${attendu}, onglets=${onglets}` };
    })));

dyn('F1b', ['F1'], 'Réglage changé : appliqué, enregistré seul, conservé après rechargement', ({ ouvrir, SCRIPT }) =>
    ouvrir(async (page) => {
        const avant = await page.evaluate(async (cle) => {
            window.__BTC.reglages.ouvrir();
            const sel = window.__mk.ui().querySelector('[data-cle="reply.style"]');
            sel.value = 'card';
            sel.dispatchEvent(new Event('change'));
            await window.__mk.frames(2);
            return { config: window.__BTC.config.reply.style, stocke: localStorage.getItem(cle),
                css: document.getElementById('btc-styles').textContent.includes('linear-gradient(var(--btc-reply-block-tint)') };
        }, STOCKAGE);
        await recharger(page, SCRIPT);
        const apres = await page.evaluate(() => window.__BTC.config.reply.style);
        const ok = avant.config === 'card' && avant.stocke === '{"reply":{"style":"card"}}' && avant.css && apres === 'card';
        return { ok, details: `appliqué=${avant.config} (CSS ${avant.css}), enregistré=${avant.stocke}, après rechargement=${apres}` };
    }));

dyn('F1c', ['F1'], 'Valeurs enregistrées invalides : ignorées ou bornées', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(() => {
        const c = window.__BTC.config;
        const ok = c.reply.style === 'rail' && c.reply.fontScale === 1.2 && c.rafale.entree === 8 && c.pouls.enabled === false;
        return { ok, details: `style=${c.reply.style}, fontScale=${c.reply.fontScale} (borné), rafale.entree=${c.rafale.entree}, pouls=${c.pouls.enabled}` };
    }), { before: (cle) => localStorage.setItem(cle, JSON.stringify({ reply: { style: 'zzz', fontScale: 99 }, rafale: { entree: 'abc' }, pouls: { enabled: 'oui' }, historique: { enabled: true }, inconnu: 1 })), avecArg: STOCKAGE }));

dyn('F1d', ['F1'], 'Bouton à côté des réglages du chat, Alt+Maj+B et Échap', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk;
        await mk.sleep(1200);
        const voisin = document.querySelector('[data-a-target="chat-settings"]').previousElementSibling;
        const bouton = !!voisin && voisin.classList.contains('btc-bouton');
        const ouvert = () => { const p = mk.ui() && mk.ui().querySelector('.panneau'); return !!p && (p.tagName === 'DIALOG' ? p.open : !p.hidden); };
        const touche = (o) => window.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...o }));
        if (bouton) voisin.click();
        const parClic = ouvert();
        touche({ key: 'B', code: 'KeyB', altKey: true, shiftKey: true });
        const fermeParRaccourci = !ouvert();
        touche({ key: 'B', code: 'KeyB', altKey: true, shiftKey: true });
        const ouvertParRaccourci = ouvert();
        touche({ key: 'Escape', code: 'Escape' });
        const fermeParEchap = !ouvert();
        return { ok: bouton && parClic && fermeParRaccourci && ouvertParRaccourci && fermeParEchap,
            details: `bouton=${bouton}, clic=${parClic}, raccourci ferme/ouvre=${fermeParRaccourci}/${ouvertParRaccourci}, Échap=${fermeParEchap}` };
    })));

dyn('F1e', ['F1'], 'Rétablir les réglages : en deux temps', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async (cle) => {
        window.__BTC.reglages.changer('reply.style', 'card');
        window.__BTC.reglages.ouvrir();
        const b = window.__mk.ui().querySelector('[data-action="retablir"]');
        b.click();
        const apresUn = window.__BTC.config.reply.style;
        b.click();
        const apresDeux = window.__BTC.config.reply.style;
        const stocke = localStorage.getItem(cle);
        return { ok: apresUn === 'card' && apresDeux === 'rail' && stocke === null,
            details: `après un clic=${apresUn}, après confirmation=${apresDeux}, stockage=${stocke}` };
    }, STOCKAGE)));

dyn('F3a', ['F3'], 'Rafale : entrée au-dessus du seuil, badges secondaires masqués', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        window.__BTC.interne.terminerStabilisation();
        window.__BTC.reglages.changer('rafale.entree', 3);
        window.__BTC.config.rafale.fenetreS = 1;
        const mod = mk.message({ user: 'modo', badges: ['Modérateur'] });
        const abo = mk.message({ user: 'abo', badges: ['Abonné depuis 3 mois'] });
        root.append(mod, abo);
        for (let i = 0; i < 18; i++) root.appendChild(mk.message({ text: `m${i}` }));
        await mk.sleep(1300);
        const actif = document.documentElement.classList.contains('btc-rafale');
        const vu = (w) => getComputedStyle(w.querySelector('.chat-badge')).display !== 'none';
        const bouton = document.querySelector('.btc-bouton');
        const signal = !!bouton && bouton.classList.contains('btc-bouton--rafale') && /Rafale en cours · \d+ msg\/s/.test(bouton.title);
        return { ok: actif && vu(mod) && !vu(abo) && signal,
            details: `rafale=${actif}, badge modo visible=${vu(mod)}, badge abonné visible=${vu(abo)}, bouton="${bouton && bouton.title}"` };
    })));

dyn('F3b', ['F3'], 'Rafale : sortie après l\'accalmie', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        window.__BTC.interne.terminerStabilisation();
        window.__BTC.reglages.changer('rafale.entree', 3);
        window.__BTC.config.rafale.fenetreS = 1;
        for (let i = 0; i < 20; i++) root.appendChild(mk.message({ text: `m${i}` }));
        await mk.sleep(1300);
        const entree = window.__BTC.rafale();
        await mk.sleep(3200);
        const sortie = !window.__BTC.rafale() && !document.documentElement.classList.contains('btc-rafale');
        return { ok: entree && sortie, details: `entrée=${entree}, sortie après 3 s de calme=${sortie}` };
    })));

dyn('F3c', ['F3'], 'Rafale coupée : aucun effet', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        window.__BTC.interne.terminerStabilisation();
        window.__BTC.reglages.changer('rafale.enabled', false);
        window.__BTC.config.rafale.entree = 3;
        window.__BTC.config.rafale.fenetreS = 1;
        for (let i = 0; i < 20; i++) root.appendChild(mk.message({ text: `m${i}` }));
        await mk.sleep(1300);
        const actif = document.documentElement.classList.contains('btc-rafale');
        return { ok: !actif, details: `rafale déclenchée=${actif}` };
    })));

// Conversation de test : bob écrit, alice et carol lui répondent, dave parle d'autre chose.
const conversation = ({ texteBob, emotesBob = [] }) => {
    const mk = window.__mk; const root = mk.root();
    const bob = mk.message({ user: 'bob', text: texteBob, emotes: emotesBob });
    const cite = [texteBob, ...emotesBob].join(' ').trim();
    const alice = mk.reply({ user: 'alice', to: 'bob', quoted: cite, text: 'oui !' });
    const dave = mk.message({ user: 'dave', text: 'autre sujet' });
    const carol = mk.reply({ user: 'carol', to: 'bob', quoted: cite, text: 'pareil' });
    root.append(bob, alice, dave, carol);
    window.__conv = { bob, alice, dave, carol };
};
const etatFil = () => {
    const c = window.__conv;
    const cl = (w) => w.querySelector('.chat-line__message').className;
    return { bob: cl(c.bob), alice: cl(c.alice), carol: cl(c.carol), dave: cl(c.dave),
        opaciteDave: Number(getComputedStyle(c.dave).opacity), estompe: !!document.querySelector('.btc-fil-racine') };
};

dyn('F5a', ['F5'], 'Fil : survol d\'une réponse, origine et autre réponse ressortent', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async (etat) => {
        const mk = window.__mk;
        await mk.frames(3);
        mk.survoler(window.__conv.alice.querySelector('.text-fragment'));
        await mk.sleep(400);
        const e = (0, eval)(`(${etat})`)();
        const ok = /btc-fil-parent/.test(e.bob) && /btc-fil-actif/.test(e.alice) && /btc-fil-enfant/.test(e.carol)
            && !/btc-fil/.test(e.dave) && e.estompe && e.opaciteDave < 0.5;
        return { ok, details: `bob=${/btc-fil-parent/.test(e.bob) ? 'origine' : '—'}, carol=${/btc-fil-enfant/.test(e.carol) ? 'réponse liée' : '—'}, dave estompé=${e.opaciteDave}` };
    }, etatFil.toString()), { before: conversation, avecArg: { texteBob: 'salut tout le monde' } }));

dyn('F5b', ['F5'], 'Fil : survol du message d\'origine, ses réponses ressortent', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async (etat) => {
        const mk = window.__mk;
        await mk.frames(3);
        mk.survoler(window.__conv.bob.querySelector('.text-fragment'));
        await mk.sleep(400);
        const e = (0, eval)(`(${etat})`)();
        const ok = /btc-fil-actif/.test(e.bob) && /btc-fil-enfant/.test(e.alice) && /btc-fil-enfant/.test(e.carol) && !/btc-fil/.test(e.dave);
        return { ok, details: `réponses liées : alice=${/btc-fil-enfant/.test(e.alice)}, carol=${/btc-fil-enfant/.test(e.carol)}, dave=${/btc-fil/.test(e.dave)}` };
    }, etatFil.toString()), { before: conversation, avecArg: { texteBob: 'salut tout le monde' } }));

dyn('F5c', ['F5'], 'Fil : emote dans le message d\'origine, retrouvée par son nom', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async (etat) => {
        const mk = window.__mk;
        await mk.frames(3);
        mk.survoler(window.__conv.alice.querySelector('.text-fragment'));
        await mk.sleep(400);
        const e = (0, eval)(`(${etat})`)();
        return { ok: /btc-fil-parent/.test(e.bob), details: `origine « gg Kappa » retrouvée=${/btc-fil-parent/.test(e.bob)}` };
    }, etatFil.toString()), { before: conversation, avecArg: { texteBob: 'gg', emotesBob: ['Kappa'] } }));

dyn('F5d', ['F5'], 'Fil : la souris quitte le chat, tout redevient normal', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk;
        await mk.frames(3);
        mk.survoler(window.__conv.alice.querySelector('.text-fragment'));
        await mk.sleep(400);
        const avant = document.querySelectorAll('[class*="btc-fil-"]').length;
        mk.root().dispatchEvent(new MouseEvent('mouseleave'));
        await mk.frames(2);
        const apres = document.querySelectorAll('[class*="btc-fil-"]').length;
        const estompe = !!document.querySelector('.btc-fil-racine');
        return { ok: avant > 0 && apres === 0 && !estompe, details: `lignes marquées avant/après=${avant}/${apres}, estompage restant=${estompe}` };
    }), { before: conversation, avecArg: { texteBob: 'salut tout le monde' } }));

dyn('F5e', ['F5'], 'Fil : message sans lien, rien n\'est estompé', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk;
        await mk.frames(3);
        mk.survoler(window.__conv.dave.querySelector('.text-fragment'));
        await mk.sleep(400);
        const marques = document.querySelectorAll('[class*="btc-fil-"]').length;
        const estompe = !!document.querySelector('.btc-fil-racine');
        return { ok: marques === 0 && !estompe, details: `lignes marquées=${marques}, estompage=${estompe}` };
    }), { before: conversation, avecArg: { texteBob: 'salut tout le monde' } }));

const PROFIL = (login, nom) => () => localStorage.setItem('twilight-user', JSON.stringify({ login: 'testeur', displayName: 'Testeur' }));

dyn('F7a', ['F7'], 'Absence : résumé au retour (messages, gifts, abonnement, mention, emote)', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        window.__BTC.interne.terminerStabilisation();
        window.__BTC.config.absence.minimumS = 0;
        mk.masquer(true);
        for (let i = 0; i < 5; i++) root.appendChild(mk.message({ user: i % 2 ? 'alice' : 'bob', text: 'ahah', emotes: ['KEKW'] }));
        root.appendChild(mk.message({ user: 'carol', text: '@testeur tu as vu ça ?' }));
        root.appendChild(mk.singleGift('xavier', 'alice'));
        root.appendChild(mk.singleGift('xavier', 'bob'));
        root.appendChild(mk.notice({ html: `<p>${mk.name('dan')} s'est abonné avec Prime.</p>` }));
        await mk.sleep(500);
        mk.masquer(false);
        await mk.frames(2);
        const c = mk.ui() && mk.ui().querySelector('.carte.absence');
        if (!c) return { ok: false, details: 'aucune carte' };
        const d = c.dataset;
        // L'emote phare s'affiche en image : son nom est dans l'attribut alt.
        const emote = !!c.querySelector('.emote img[alt="KEKW"]') || /KEKW/.test(c.textContent);
        const ok = d.messages === '6' && d.gifts === '2' && d.abonnements === '1' && d.mentions === '1' && emote && /xavier/.test(c.textContent);
        return { ok, details: `messages=${d.messages}, gifts=${d.gifts} (top : xavier), abonnements=${d.abonnements}, mentions=${d.mentions}, emote phare=${emote}` };
    }), { before: PROFIL() }));

dyn('F7b', ['F7'], 'Absence trop courte : pas de résumé', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        window.__BTC.interne.terminerStabilisation();
        mk.masquer(true);
        root.appendChild(mk.message({ text: 'un message' }));
        await mk.sleep(300);
        mk.masquer(false);
        await mk.frames(2);
        const c = mk.ui() && mk.ui().querySelector('.carte.absence');
        return { ok: !c, details: `carte affichée après 0,3 s (minimum 60 s)=${!!c}` };
    })));

dyn('F7c', ['F7'], 'Absence : « Aller au message » ramène la mention à l\'écran', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        window.__BTC.interne.terminerStabilisation();
        window.__BTC.config.absence.minimumS = 0;
        mk.masquer(true);
        const mention = mk.message({ user: 'carol', text: 'coucou @Testeur' });
        root.appendChild(mention);
        for (let i = 0; i < 40; i++) root.appendChild(mk.message({ text: `remplissage ${i}` }));
        await mk.sleep(500);
        mk.masquer(false);
        await mk.frames(2);
        const bouton = [...mk.ui().querySelectorAll('.carte.absence button.lien')].find((b) => /Aller/.test(b.textContent));
        if (bouton) bouton.click();
        await mk.sleep(200);
        // Le repère doit se voir : une classe posée ne suffit pas (T1 de l'audit 15.26).
        const couleur = getComputedStyle(mention).outlineColor;
        const visible = mention.classList.contains('btc-repere') && couleur !== 'rgba(0, 0, 0, 0)';
        return { ok: !!bouton && visible, details: `bouton=${!!bouton}, message repéré=${visible} (contour ${couleur})` };
    }), { before: PROFIL() }));

dyn('F14a', ['F14'], 'Pouls : détection des moments forts (série synthétique)', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(() => {
        const detecter = window.__BTC.pouls.detecter;
        const serie = (valeurs) => valeurs.map((n) => ({ n }));
        const pic = detecter(serie([...Array(30).fill(4), 40, 45, ...Array(10).fill(4)]));
        const plat = detecter(serie(Array(60).fill(20)));
        const tropTot = detecter(serie([4, 4, 4, 60, 4, 4]));
        const ok = pic.length === 1 && pic[0].debut === 30 && pic[0].fin === 32 && pic[0].pic === 45 && plat.length === 0 && tropTot.length === 0;
        return { ok, details: `pic=${JSON.stringify(pic.map((m) => [m.debut, m.fin, m.pic]))}, série plate=${plat.length}, sans historique=${tropTot.length}` };
    })));

dyn('F14b', ['F14'], 'Pouls : mesuré en direct, rien d\'affiché dans le chat (il se lit dans le panneau)', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        window.__BTC.interne.terminerStabilisation();
        window.__BTC.reglages.changer('pouls.enabled', true);
        for (let i = 0; i < 12; i++) root.appendChild(mk.message({ text: `pog ${i}`, emotes: ['PogU'] }));
        await mk.sleep(1300);
        const comptes = window.__BTC.pouls.seaux.reduce((t, s) => t + s.n, 0);
        const p = mk.ui() && mk.ui().querySelector('.pastille');
        const visible = !!p && !p.hidden;
        return { ok: comptes === 12 && !visible, details: `messages comptés=${comptes}, pastille dans le chat=${visible}` };
    })));

dyn('F14c', ['F14'], 'Pouls : liste copiable des moments, heure depuis le début du live', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const B = window.__BTC;
        const maintenant = Date.now();
        const debut = Math.floor(maintenant / 10000) * 10000 - 40 * 10000;
        for (let i = 0; i < 40; i++) {
            const n = i === 34 ? 50 : 3;
            B.pouls.seaux.push({ debut: debut + i * 10000, n, emotes: new Map([['KEKW', n]]), textes: new Map([['lets go', { n: i === 34 ? 9 : 0, texte: 'lets go' }]]) });
        }
        B.reglages.changer('pouls.enabled', true);
        const moments = B.pouls.moments();
        const texte = B.pouls.texte();
        const duree = B.interne.lireDuree('1:23:45') === 5025000 && B.interne.lireDuree('23:45') === 1425000;
        const ok = moments.length === 1 && moments[0].parMinute === 300 && /\+\d+:\d{2}:\d{2}/.test(texte) && /KEKW/.test(texte) && /lets go/.test(texte) && duree;
        return { ok, details: `moments=${moments.length}, ligne="${texte.split('\n')[1] || ''}", lecture des durées=${duree}` };
    }), { page: { dureeLive: '2:00:00' } }));

// =============================================================================
// Audit de la v15.26 (AUDIT-15.26.md) : un cas par défaut corrigé, préfixé de 26. Ils
// reprennent les reproductions de tests/reproduction-15.26.js, inversées.
// =============================================================================
const AVEC = (valeur) => ({ before: (a) => localStorage.setItem(a.cle, JSON.stringify(a.valeur)), avecArg: { cle: STOCKAGE, valeur } });
const HORLOGE = new Date('2026-11-19T20:00:00Z');

dyn('26B1', ['15.26 B1'], 'Repère « Aller au message » : le contour se voit pendant l\'animation', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        root.appendChild(mk.message({ user: 'alice', text: 'cible' })); await mk.frames(3);
        const ligne = root.lastElementChild;
        ligne.classList.add('btc-repere');
        await mk.sleep(200);
        const couleur = getComputedStyle(ligne).outlineColor;
        return { ok: couleur !== 'rgba(0, 0, 0, 0)', details: `couleur du contour à 200 ms : ${couleur}` };
    })));

dyn('26B3', ['15.26 B3'], 'Pouls : un moment fort reste dans la liste après deux heures', ({ ouvrir }) =>
    ouvrir(async (page) => {
        const ajouter = (n, texte) => page.evaluate(({ n, texte }) => {
            const mk = window.__mk; const root = mk.root();
            for (let i = 0; i < n; i++) root.appendChild(mk.message({ user: 'u' + (i % 20), text: texte || ('msg ' + i) }));
        }, { n, texte });
        await page.clock.runFor(3000);
        for (let k = 0; k < 12; k++) { await ajouter(3); await page.clock.runFor(10000); }
        await ajouter(60, 'BUT !'); await page.clock.runFor(10000);
        for (let k = 0; k < 3; k++) { await ajouter(3); await page.clock.runFor(10000); }
        const avant = await page.evaluate(() => window.__BTC.pouls.moments().length);
        // Deux heures et quart de silence d'un bond, puis quelques tics ordinaires.
        await page.clock.fastForward(2 * 3600000 + 15 * 60000);
        await page.clock.runFor(3000);
        const apres = await page.evaluate(() => ({ moments: window.__BTC.pouls.moments().length, seaux: window.__BTC.pouls.seaux.length }));
        return { ok: avant === 1 && apres.moments === 1 && apres.seaux === 720,
            details: `moments après le pic : ${avant} ; 2 h 15 plus tard : ${apres.moments} (graphe : ${apres.seaux} tranches)` };
    }, { horloge: HORLOGE, ...AVEC({ pouls: { enabled: true } }) }));

dyn('26B4', ['15.26 B4'], 'Pouls : changement de chaîne dans le même conteneur, la mesure repart de zéro', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root(); const B = window.__BTC;
        B.interne.terminerStabilisation();
        for (let i = 0; i < 12; i++) root.appendChild(mk.message({ user: 'u' + i, text: 'chaîne A ' + i }));
        await mk.frames(4); await mk.sleep(1100);
        const avant = B.pouls.seaux.reduce((n, s) => n + s.n, 0);
        history.pushState({}, '', '/autrechaine');
        await mk.sleep(1500);
        const apres = B.pouls.seaux.reduce((n, s) => n + s.n, 0);
        const debit = B.interne.debit(60);
        return { ok: avant === 12 && apres === 0 && debit === 0, details: `messages comptés avant : ${avant}, après le changement : ${apres}, débit restant : ${debit}` };
    }), AVEC({ pouls: { enabled: true } })));

dyn('26B5', ['15.26 B5'], 'Réglages : chaque option s\'applique aux messages affichés, dans les deux sens', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root(); const R = window.__BTC.reglages;
        const res = {};
        // Compactage activé après coup.
        R.changer('compact.enabled', false);
        const n1 = mk.singleGift('xavier', 'bob'); root.appendChild(n1); await mk.frames(4);
        R.changer('compact.enabled', true);
        res.compactage = !!n1.querySelector('.btc-notice-line');
        // Préfixe, emotes et couleur de la citation.
        root.appendChild(mk.message({ user: 'bob', text: 'gg', emotes: ['Kappa'] }));
        const rep = mk.reply({ user: 'alice', to: 'bob', quoted: 'gg Kappa', text: 'oui' });
        root.appendChild(rep); await mk.frames(4);
        const q = () => rep.querySelector('.btc-reply-quote');
        R.changer('reply.colorQuotedName', true);
        const coloree = !!q().querySelector('.btc-reply-target').style.color;
        const image = !!q().querySelector('img');
        R.changer('reply.hidePrefix', false);
        R.changer('reply.renderEmotes', false);
        R.changer('reply.colorQuotedName', false);
        res.prefixe = /^Répond à/.test(q().textContent.trim());
        res.emotes = image && !q().querySelector('img') && /Kappa/.test(q().textContent);
        res.couleur = coloree && !q().querySelector('.btc-reply-target').style.color;
        // Traduction.
        const prime = mk.notice({ html: `<p>${mk.name('dan')} subscribed with Prime.</p>` });
        root.appendChild(prime); await mk.frames(4);
        const fr = /abonné avec Prime/.test(prime.textContent);
        R.changer('translate', false);
        res.traduction = fr && /subscribed with Prime/.test(prime.textContent);
        // Étiquette 7TV.
        const etiq = mk.message({ user: 'eve', text: 'relevé' });
        etiq.querySelector('.chat-line__message').setAttribute('data-seventv-custom-highlight-label', '⭐');
        root.appendChild(etiq); await mk.frames(4);
        const retiree = !etiq.querySelector('[data-seventv-custom-highlight-label]');
        R.changer('hideHighlightLabel', false); await mk.frames(2);
        res.etiquette = retiree && !!etiq.querySelector('[data-seventv-custom-highlight-label="⭐"]');
        // Regroupement des gifts.
        root.appendChild(mk.massGift('zed', 2)); root.appendChild(mk.singleGift('zed', 'a1')); root.appendChild(mk.singleGift('zed', 'a2'));
        await mk.frames(4);
        const masques = root.querySelectorAll('.btc-hidden').length;
        R.changer('compact.aggregateGifts', false);
        res.gifts = masques === 2 && !root.querySelector('.btc-hidden') && !root.querySelector('.btc-gift-recipients');
        return { ok: Object.values(res).every(Boolean), details: Object.entries(res).map(([k, v]) => `${k}=${v}`).join(', ') };
    })));

dyn('26B6', ['15.26 B6'], 'Réglages : deux onglets ouverts, aucun n\'écrase l\'autre', ({ ouvrirOnglets }) =>
    ouvrirOnglets(2, async ([a, b]) => {
        await a.evaluate(() => window.__BTC.reglages.changer('reply.style', 'card'));
        await b.waitForTimeout(300);
        const styleB = await b.evaluate(() => window.__BTC.config.reply.style);
        await b.evaluate(() => window.__BTC.reglages.changer('rafale.entree', 12));
        await a.waitForTimeout(300);
        const stocke = JSON.parse(await a.evaluate((cle) => localStorage.getItem(cle), STOCKAGE) || '{}');
        const entreeA = await a.evaluate(() => window.__BTC.config.rafale.entree);
        const ok = styleB === 'card' && !!stocke.reply && stocke.reply.style === 'card' && !!stocke.rafale && stocke.rafale.entree === 12 && entreeA === 12;
        return { ok, details: `l'onglet B voit style=${styleB} ; enregistré=${JSON.stringify(stocke)} ; l'onglet A voit entree=${entreeA}` };
    }));

dyn('26B7', ['15.26 B7'], 'Mentions : « @pseudo » ou réponse, pas le pseudo nu', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root(); const lire = window.__BTC.interne.lireMessage;
        const essai = (w) => { root.appendChild(w); return lire(w.querySelector('.chat-line__message')).mentionneMoi; };
        const nu = essai(mk.message({ user: 'alice', text: 'le chat est calme ce soir' }));
        const arobase = essai(mk.message({ user: 'bob', text: 'hé @Chat tu es là ?' }));
        const reponse = essai(mk.reply({ user: 'carol', to: 'chat', quoted: 'coucou', text: 'salut' }));
        return { ok: !nu && arobase && reponse, details: `pseudo nu=${nu}, @pseudo=${arobase}, réponse=${reponse}` };
    }), { before: () => localStorage.setItem('twilight-user', JSON.stringify({ login: 'chat', displayName: 'Chat' })) }));

dyn('26B8', ['15.26 B8'], 'Pouls : le message représentatif garde ses accents et sa casse', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root(); const B = window.__BTC;
        B.interne.terminerStabilisation();
        for (let i = 0; i < 4; i++) root.appendChild(mk.message({ user: 'u' + i, text: i ? 'énorme le BUT' : 'ÉNORME le but' }));
        await mk.frames(4);
        const s = B.pouls.seaux.find((x) => x.n > 0);
        const t = s ? [...s.textes.values()][0] : null;
        return { ok: !!t && t.n === 4 && t.texte === 'ÉNORME le but', details: t ? `${t.n} variantes comptées ensemble, affiché « ${t.texte} »` : 'aucun texte compté' };
    }), AVEC({ pouls: { enabled: true } })));

dyn('26B9', ['15.26 B9'], 'Pouls : un petit chat qui arrive par paquets ne fait pas de moments forts', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(() => {
        const d = window.__BTC.pouls.detecter;
        const paquets = d(Array.from({ length: 720 }, (_, i) => ({ n: i % 6 === 0 ? 18 : 0 }))).length;
        const vraiPic = d(Array.from({ length: 60 }, (_, i) => ({ n: i === 40 ? 60 : (i % 6 === 0 ? 18 : 0) }))).length;
        return { ok: paquets === 0 && vraiPic === 1, details: `2 h de paquets de 18 messages : ${paquets} moment(s) ; un vrai pic de 60 au milieu : ${vraiPic}` };
    })));

dyn('26R1', ['15.26 R1'], 'Emotes comptées même encore écrites en texte (7TV pas encore passé)', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        root.appendChild(mk.message({ user: 'bob', text: 'gg', emotes: ['catJAM'] })); await mk.frames(3);
        const w = mk.message({ user: 'alice', text: 'catJAM catJAM trop bien' }); root.appendChild(w); await mk.frames(3);
        const m = window.__BTC.interne.lireMessage(w.querySelector('.chat-line__message'));
        return { ok: m.emotes.length === 2 && m.emotes.every((e) => e === 'catJAM'), details: `emotes lues : ${JSON.stringify(m.emotes)}` };
    })));

dyn('26R4', ['15.26 R4', '15.26.2 T1'], 'Raccourcis : le caractère d\'Option+Maj+B (macOS) laissé au champ, Échap gardé pour le panneau', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk;
        const ouvert = () => { const p = mk.ui() && mk.ui().querySelector('.panneau'); return !!p && (p.tagName === 'DIALOG' ? p.open : !p.hidden); };
        const champ = document.querySelector('[data-a-target="chat-input"] [data-slate-leaf]');
        // Sous macOS, Option+Maj+B tape « ı » : le champ doit le recevoir.
        const ev = new KeyboardEvent('keydown', { key: 'ı', code: 'KeyB', altKey: true, shiftKey: true, bubbles: true, cancelable: true });
        champ.dispatchEvent(ev);
        const dansChamp = ouvert() || ev.defaultPrevented;
        window.__BTC.reglages.ouvrir();
        let vuParLaPage = false;
        document.addEventListener('keydown', () => { vuParLaPage = true; });
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        return { ok: !dansChamp && !ouvert() && !vuParLaPage,
            details: `caractère de macOS intercepté dans le champ=${dansChamp}, Échap ferme=${!ouvert()}, Échap vu aussi par la page=${vuParLaPage}` };
    })));

dyn('26R5', ['15.26 R5'], 'Absence : la carte se ferme seule au bout d\'une minute', ({ ouvrir }) =>
    ouvrir(async (page) => {
        await page.clock.runFor(3000);
        await page.evaluate(() => {
            const mk = window.__mk; window.__BTC.config.absence.minimumS = 10;
            mk.masquer(true);
            for (let i = 0; i < 5; i++) mk.root().appendChild(mk.message({ text: 'pendant ' + i }));
        });
        await page.clock.runFor(20000);
        await page.evaluate(() => window.__mk.masquer(false));
        await page.clock.runFor(500);
        const carte = () => page.evaluate(() => !!window.__mk.ui() && !!window.__mk.ui().querySelector('.carte.absence'));
        const auRetour = await carte();
        await page.clock.runFor(61000);
        const ensuite = await carte();
        return { ok: auRetour && !ensuite, details: `carte au retour=${auRetour}, encore là une minute plus tard=${ensuite}` };
    }, { horloge: HORLOGE }));

/** Page lourde (environ 9 500 éléments) et 150 lignes, dont des réponses. */
const pageLourde = async () => {
    const mk = window.__mk; const root = mk.root();
    for (let i = 0; i < 150; i++) {
        root.appendChild(i % 5 === 4
            ? mk.reply({ user: 'u' + i, to: 'u' + (i - 4), quoted: 'message ' + (i - 4), text: 'réponse ' + i })
            : mk.message({ user: 'u' + i, text: 'message ' + i }));
    }
    await mk.frames(8);
    const lest = document.createElement('div');
    for (let i = 0; i < 2000; i++) {
        const d = document.createElement('div');
        d.append(document.createElement('span'));
        d.firstChild.append(document.createElement('b'), document.createElement('i'));
        lest.appendChild(d);
    }
    document.body.appendChild(lest);
    void document.body.offsetHeight;
    return lest;
};

dyn('26P1', ['15.26 P1'], 'Fil : survol d\'une réponse sur une page lourde, sous 40 ms', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async (src) => {
        const lest = await (0, eval)(`(${src})`)();
        const mk = window.__mk; const root = mk.root();
        window.__BTC.config.fil.delaiMs = 0;
        const reponses = [...root.querySelectorAll('.chat-line__message')].filter((_, i) => i % 5 === 4);
        const d = [];
        for (let k = 0; k < 15; k++) {
            mk.survoler(reponses[k + 5].querySelector('[data-a-target="chat-line-message-body"]'));
            await new Promise((r) => setTimeout(r, 0));
            const t0 = performance.now();
            await new Promise((r) => setTimeout(r, 0));
            void document.body.offsetHeight; getComputedStyle(root.firstElementChild).opacity;
            d.push(performance.now() - t0);
            mk.survoler(lest.firstElementChild); await new Promise((r) => setTimeout(r, 0)); void document.body.offsetHeight;
        }
        d.sort((a, b) => a - b);
        return { ok: d[7] < 40, details: `${document.getElementsByTagName('*').length} éléments, survol : ${d[7].toFixed(1)} ms (médiane, 117 ms en v15.26.0)` };
    }, pageLourde.toString())));

dyn('26S1', ['15.26 S1'], 'Identité : le cookie « login » d\'abord, le profil Twitch (qui porte le jeton) en repli', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(() => {
        const moi = window.__BTC.interne.monIdentite() || {};
        return { ok: moi.login === 'parcookie', details: `pseudo retenu : ${moi.login}` };
    }), { before: () => {
        document.cookie = 'login=parcookie; path=/';
        localStorage.setItem('twilight-user', JSON.stringify({ login: 'parprofil', displayName: 'ParProfil', authToken: 'jeton' }));
    } }));

// Revu par l'audit MWG (G14) : un dialogue non modal, et non une région. La règle de l'audit
// de la v15.26 (focus retenu, aria-modal) ne vaut que pour un dialogue modal.
dyn('26A1', ['15.26 A1', 'MWG G14'], 'Panneau : dialogue non modal, nommé par son titre', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(() => {
        window.__BTC.reglages.ouvrir();
        const p = window.__mk.ui().querySelector('.panneau');
        const id = p.getAttribute('aria-labelledby');
        const titre = id && p.getRootNode().getElementById(id);
        const modal = p.matches(':modal');
        const ok = p.tagName === 'DIALOG' && p.open && !modal && !p.hasAttribute('role') && !!titre && titre.tagName === 'H2';
        return { ok, details: `<${p.tagName.toLowerCase()}> ouvert=${!!p.open}, modal=${modal}, role=${p.getAttribute('role')}, titre ${titre ? `<${titre.tagName.toLowerCase()}> « ${titre.textContent} »` : 'aucun'}` };
    })));

dyn('26T3', ['15.26 T3'], 'Panneau : couleurs du thème clair de Twitch', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(() => {
        window.__BTC.reglages.ouvrir();
        const fond = getComputedStyle(window.__mk.ui().querySelector('.panneau')).backgroundColor;
        const l = window.__mk.luminanceSur(fond);
        return { ok: l > 0.8, details: `fond du panneau ${fond}, luminance ${l.toFixed(2)}` };
    }), { page: { theme: 'clair' } }));

// « ui = { hote » n'est plus cherché : l'hôte est de nouveau gardé dans ui, et sert cette
// fois (thème de l'interface, v15.26.4).
stat('26M', ['15.26 M1', '15.26 M2', '15.26 M3', '15.26 M4', '15.26 M5', '15.26 Q2'], 'Code mort de la v15.26 retiré, aucun caractère invisible dans le code',
    verifAbsence(['quantite', 'element: entree, notice,', "genre: info.genre || ''", 'parent: info.parentLogin', 'mention: !!info.mentionneMoi',
        "genre: '', emotes", "emotes: [], texte: ''", /[̀-ͯ]/]));

// =============================================================================
// Audit de la v15.26.2 (AUDIT-15.26.2.md) : un cas par défaut corrigé, préfixé de 62.
// =============================================================================
// Le panneau est un <dialog> depuis la v15.26.4 (ouvert : open) ; avant, un élément caché par hidden.
const panneauOuvert = () => {
    const ui = window.__mk.ui();
    const p = ui && ui.querySelector('.panneau');
    return !!p && (p.tagName === 'DIALOG' ? p.open : !p.hidden);
};

dyn('62B1', ['15.26.2 B1'], 'Alt+Maj+B ouvre le panneau depuis la saisie du chat (Windows, Linux)', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async (ouvertSrc) => {
        const ouvert = (0, eval)(`(${ouvertSrc})`);
        await window.__mk.sleep(1200);
        const saisie = document.querySelector('[data-a-target="chat-input"]');
        saisie.focus();
        const ev = new KeyboardEvent('keydown', { key: 'B', code: 'KeyB', altKey: true, shiftKey: true, bubbles: true, cancelable: true });
        saisie.querySelector('[data-slate-leaf]').dispatchEvent(ev);
        return { ok: ouvert() && ev.defaultPrevented, details: `panneau ouvert depuis la saisie=${ouvert()}, touche consommée=${ev.defaultPrevented}` };
    }, panneauOuvert.toString())));

dyn('62B2', ['15.26.2 B2'], 'Échap rend le focus à la saisie du chat', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        await window.__mk.sleep(1200);
        const saisie = document.querySelector('[data-a-target="chat-input"]');
        saisie.focus();
        window.__BTC.reglages.ouvrir();
        const surPanneau = document.activeElement !== saisie;
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        const retour = document.activeElement === saisie;
        // Ouvert depuis le bouton, le focus revient au bouton.
        const bouton = document.querySelector('.btc-bouton');
        bouton.focus(); bouton.click();
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        const surBouton = document.activeElement === bouton;
        return { ok: surPanneau && retour && surBouton, details: `focus parti dans le panneau=${surPanneau}, revenu à la saisie=${retour}, ouvert par le bouton : revenu au bouton=${surBouton}` };
    })));

dyn('62B3', ['15.26.2 B3'], 'Pouls : un aller-retour sur une autre chaîne ne perd rien, chaque chaîne a sa mesure', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root(); const B = window.__BTC;
        const total = () => B.pouls.seaux.reduce((n, s) => n + s.n, 0);
        B.interne.terminerStabilisation();
        for (let i = 0; i < 12; i++) root.appendChild(mk.message({ user: 'u' + i, text: 'chaîne A ' + i }));
        await mk.frames(4); await mk.sleep(1100);
        const avant = total();
        history.pushState({}, '', '/autrechaine'); await mk.sleep(1300);
        B.interne.terminerStabilisation();
        for (let i = 0; i < 3; i++) root.appendChild(mk.message({ user: 'v' + i, text: 'chaîne B ' + i }));
        await mk.frames(4); await mk.sleep(200);
        const surB = total();
        history.pushState({}, '', '/testchannel'); await mk.sleep(1300);
        const auRetour = total();
        return { ok: avant === 12 && surB === 3 && auRetour === 12,
            details: `testchannel : ${avant} messages ; autre chaîne : ${surB} ; de retour sur testchannel : ${auRetour}` };
    }), AVEC({ pouls: { enabled: true } })));

dyn('62B4', ['15.26.2 B4'], 'Absence : changement de chaîne onglet masqué, le résumé ne porte que sur la nouvelle', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root(); const B = window.__BTC;
        B.interne.terminerStabilisation();
        B.config.absence.minimumS = 0;
        mk.masquer(true);
        for (let i = 0; i < 5; i++) root.appendChild(mk.message({ user: 'a' + i, text: 'sur la chaîne A' }));
        await mk.sleep(400);
        history.pushState({}, '', '/chaineb'); await mk.sleep(1300);
        B.interne.terminerStabilisation();
        for (let i = 0; i < 4; i++) root.appendChild(mk.message({ user: 'b' + i, text: 'sur la chaîne B' }));
        await mk.sleep(400);
        mk.masquer(false); await mk.frames(2);
        const c = mk.ui() && mk.ui().querySelector('.carte.absence');
        const n = c ? Number(c.dataset.messages) : -1;
        const depart = c ? c.dataset.chaineDepart : '';
        const explique = !!c && /testchannel à chaineb/.test(c.textContent);
        return { ok: n === 4 && depart === 'testchannel' && explique, details: `messages résumés : ${n} (attendu 4), chaîne de départ : ${depart}, changement expliqué=${explique}` };
    })));

dyn('62B5', ['15.26.2 B5', '15.26.2 P1', '15.26.2 A1'], 'Pouls : rien n\'est réécrit chaque seconde, ni compteur ni liste', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        window.__BTC.reglages.changer('pouls.enabled', true);
        window.__BTC.reglages.ouvrir('pouls');
        const vue = window.__mk.ui().querySelector('[data-vue="pouls"]');
        await window.__mk.sleep(1100);
        let ecritures = 0;
        new MutationObserver((m) => { ecritures += m.length; }).observe(vue.querySelector('.chiffres').parentElement, { childList: true, characterData: true, subtree: true });
        const live = vue.querySelectorAll('[aria-live]').length;
        await window.__mk.sleep(3200);
        return { ok: ecritures === 0 && live === 0, details: `écritures en 3 s sans changement : ${ecritures}, régions aria-live dans la vue : ${live}` };
    })));

dyn('62B6', ['15.26.2 B6', '15.26.2 M4'], 'Rafale signalée sur le bouton, rien sur le chat ; carte d\'absence en bas du chat', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root(); const B = window.__BTC;
        B.interne.terminerStabilisation();
        B.reglages.changer('rafale.entree', 3);
        B.config.rafale.fenetreS = 1;
        B.config.absence.minimumS = 0;
        for (let i = 0; i < 20; i++) root.appendChild(mk.message({ text: `m${i}` }));
        await mk.sleep(1300);
        const ui = mk.ui();
        const surLeChat = ui ? [...ui.querySelectorAll('.couche > *')].filter((e) => !e.hidden).length : 0;
        const bouton = document.querySelector('.btc-bouton');
        const point = bouton && getComputedStyle(bouton, '::after').content !== 'none';
        mk.masquer(true);
        root.appendChild(mk.message({ text: 'pendant' }));
        await mk.sleep(300);
        mk.masquer(false); await mk.frames(2);
        const carte = mk.ui().querySelector('.carte.absence');
        const sc = document.querySelector('[data-a-target="chat-scroller"]').getBoundingClientRect();
        const r = carte ? carte.getBoundingClientRect() : null;
        const enBas = !!r && Math.abs(sc.bottom - r.bottom) <= 12 && r.top > sc.top + 40;
        return { ok: surLeChat === 0 && point && enBas,
            details: `éléments posés sur le chat pendant la rafale : ${surLeChat}, point sur le bouton=${point}, carte d'absence en bas=${enBas}` };
    })));

dyn('62B7', ['15.26.2 B7'], 'Le clic sur le bouton du panneau s\'arrête au bouton', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        await window.__mk.sleep(1200);
        const bouton = document.querySelector('.btc-bouton');
        let recu = false;
        bouton.parentElement.parentElement.addEventListener('click', () => { recu = true; });
        bouton.click();
        const p = window.__mk.ui().querySelector('.panneau');
        const ouvert = (p.tagName === 'DIALOG' ? p.open : !p.hidden);
        return { ok: !recu && ouvert, details: `clic reçu par un conteneur=${recu}, panneau ouvert=${ouvert}` };
    })));

dyn('62B8', ['15.26.2 B8'], 'Pouls : « 1 message sur la dernière minute », au singulier', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const B = window.__BTC;
        B.interne.terminerStabilisation();
        B.reglages.changer('pouls.enabled', true);
        mk.root().appendChild(mk.message({ text: 'seul' })); await mk.frames(4);
        B.reglages.ouvrir('pouls');
        const texte = mk.ui().querySelector('[data-vue="pouls"] .chiffres').textContent;
        return { ok: /^1 message sur la dernière minute/.test(texte), details: `« ${texte} »` };
    })));

dyn('62R1', ['15.26.2 R1'], 'Bouton du panneau utilisable même si l\'engrenage est désactivé', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        await window.__mk.sleep(1200);
        const bouton = document.querySelector('.btc-bouton');
        return { ok: !!bouton && !bouton.disabled && !bouton.hasAttribute('tabindex'), details: `désactivé=${bouton && bouton.disabled}, tabindex copié=${bouton && bouton.hasAttribute('tabindex')}` };
    }), { before: () => {
        const g = document.querySelector('[data-a-target="chat-settings"]');
        g.setAttribute('disabled', ''); g.setAttribute('tabindex', '-1');
    } }));

stat('62M', ['15.26.2 M1', '15.26.2 M2', '15.26.2 M4'], 'Code mort de la v15.26.2 retiré', verifAbsence(['input[type="search"]', /\bmarquer\b/, 'ui.pastille', '.pastille {']));

// =============================================================================
// v15.26.2 : historique retiré, bouton du panneau calqué sur l'engrenage de Twitch.
// =============================================================================
dyn('N1', ['15.26.2'], 'Historique retiré : la base laissée par la v15.26 est effacée au démarrage', async ({ ouvrir }) => {
    // Base de la v15.26.1 (avec sa marque) et de la v15.26.0 (sans marque).
    const creer = (avecMarque) => new Promise((ok) => {
        const r = indexedDB.open('btc-historique', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('messages', { keyPath: 'id', autoIncrement: true });
        r.onsuccess = () => {
            const tx = r.result.transaction('messages', 'readwrite');
            tx.objectStore('messages').add({ texte: 'ancien message' });
            tx.oncomplete = () => { r.result.close(); if (avecMarque) localStorage.setItem('btc:historique:base', '1'); ok(); };
        };
    });
    const verifier = (page) => page.evaluate(async () => {
        await window.__mk.sleep(500);
        const bases = (await indexedDB.databases()).map((b) => b.name);
        return { reste: bases.includes('btc-historique'), marque: localStorage.getItem('btc:historique:base'), api: 'historique' in window.__BTC };
    });
    const avec = await ouvrir(verifier, { before: creer, avecArg: true });
    const sans = await ouvrir(verifier, { before: creer, avecArg: false });
    const ok = !avec.reste && avec.marque === null && !sans.reste && !avec.api;
    return { ok, details: `base de la v15.26.1 restante=${avec.reste} (marque ${avec.marque}), base de la v15.26.0 restante=${sans.reste}, __BTC.historique=${avec.api}` };
});

dyn('N2', ['15.26.2'], 'Bouton du panneau : copie de l\'engrenage, centré sur lui quelle que soit la mise en page', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        await window.__mk.sleep(1200);
        const engrenage = document.querySelector('[data-a-target="chat-settings"]');
        const bouton = engrenage.previousElementSibling;
        if (!bouton || !bouton.classList.contains('btc-bouton')) return { ok: false, details: 'bouton absent' };
        const mesurer = () => {
            const a = engrenage.getBoundingClientRect(); const b = bouton.getBoundingClientRect();
            const ia = engrenage.querySelector('svg').getBoundingClientRect(); const ib = bouton.querySelector('svg').getBoundingClientRect();
            return { taille: Math.abs(a.width - b.width) + Math.abs(a.height - b.height),
                ecart: Math.abs((ia.top + ia.height / 2) - (ib.top + ib.height / 2)), icone: Math.abs(ia.height - ib.height) };
        };
        const enLigne = mesurer();
        // Même vérification si Twitch range ses boutons dans un conteneur flex.
        Object.assign(engrenage.parentElement.style, { display: 'flex', alignItems: 'flex-end' });
        const enFlex = mesurer();
        const unique = document.querySelectorAll('[data-a-target="chat-settings"]').length === 1;
        const aligne = (m) => m.taille < 0.5 && m.ecart < 0.5 && m.icone < 0.5;
        return { ok: aligne(enLigne) && aligne(enFlex) && unique,
            details: `écart vertical des icônes : ${enLigne.ecart.toFixed(1)} px en ligne, ${enFlex.ecart.toFixed(1)} px en flex ; même taille=${enLigne.taille < 0.5 && enFlex.taille < 0.5} ; engrenage seul à porter son data-a-target=${unique}` };
    })));

// =============================================================================
// Version optimisée (scripts/build.js)
// =============================================================================
dyn('BUILD', ['Livraison'], 'Version optimisée : même feuille de style que la source', async ({ ouvrir, SOURCE }) => {
    if (!SOURCE) return { ok: null, details: 'source commentée introuvable (--source)' };
    // Espaces normalisés hors des chaînes entre guillemets : Chrome garde tels quels ceux
    // d'une valeur contenant var(), sans effet sur le rendu ; dans une chaîne, ils comptent.
    const regles = (page) => page.evaluate(() => {
        const normaliser = (feuille) => [...feuille.cssRules].map((r) => r.cssText
            .split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/)
            .map((morceau, i) => (i % 2 ? morceau : morceau.replace(/\s+/g, ' ')))
            .join(''));
        // Feuille du chat, puis celle du panneau (shadow DOM) une fois ouvert.
        const chat = normaliser(document.getElementById('btc-styles').sheet);
        if (window.__BTC.reglages) window.__BTC.reglages.ouvrir();
        const hote = document.getElementById('btc-ui');
        const panneau = hote ? normaliser(hote.shadowRoot.querySelector('style').sheet) : [];
        return [...chat, '— panneau —', ...panneau];
    });
    const optimisee = await ouvrir(regles);
    const source = await ouvrir(regles, { script: SOURCE });
    const ecart = optimisee.findIndex((r, i) => r !== source[i]);
    const ok = optimisee.length === source.length && ecart === -1;
    return { ok, details: ok ? `${optimisee.length} règles CSS identiques à la source`
        : `${optimisee.length} règles contre ${source.length} ; premier écart : ${String(optimisee[ecart] || '').slice(0, 80)}` };
});

// =============================================================================
// Audit selon Modern Web Guidance (AUDIT-MWG.md) : un cas par écart corrigé, préfixé MW.
// =============================================================================
/** Affiche la carte « Pendant ton absence » : quelques messages arrivés onglet masqué. */
const AFFICHER_ABSENCE = async () => {
    const mk = window.__mk; const root = mk.root(); const B = window.__BTC;
    B.interne.terminerStabilisation();
    B.config.absence.minimumS = 0;
    mk.masquer(true);
    for (let i = 0; i < 4; i++) root.appendChild(mk.message({ user: 'a' + i, text: 'pendant l\'absence ' + i }));
    await mk.sleep(400);
    mk.masquer(false);
    await mk.frames(2);
    return mk.ui().querySelector('.carte.absence');
};
/** Rapport de contraste WCAG entre deux luminances relatives. */
const contraste = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

dyn('MW1', ['MWG G1'], 'Thème : contrôles natifs du panneau dans le thème de Twitch (color-scheme)', async ({ ouvrir }) => {
    const lire = (page) => page.evaluate(() => {
        window.__BTC.reglages.ouvrir();
        const ui = window.__mk.ui();
        return [getComputedStyle(ui.querySelector('select')).colorScheme, getComputedStyle(ui.querySelector('.vue')).colorScheme];
    });
    const sombre = await ouvrir(lire);
    const clair = await ouvrir(lire, { page: { theme: 'clair' } });
    return { ok: sombre.every((s) => /dark/.test(s)) && clair.every((s) => /light/.test(s)),
        details: `thème sombre : ${sombre.join(', ')} ; thème clair : ${clair.join(', ')}` };
});

dyn('MW2', ['MWG G2'], 'Contraste : texte cité lisible en thème clair comme en sombre (4,5:1)', async ({ ouvrir }) => {
    const mesurer = (page) => page.evaluate(async () => {
        const mk = window.__mk;
        mk.root().appendChild(mk.reply({ to: 'bob', quoted: 'le texte cité', text: 'réponse' }));
        await mk.frames(4);
        const c = getComputedStyle(document.querySelector('.btc-reply-quote')).color;
        const fond = getComputedStyle(document.body).backgroundColor;
        return { c: mk.luminanceSur(c, fond), f: mk.luminanceSur(fond) };
    });
    const s = await ouvrir(mesurer);
    const c = await ouvrir(mesurer, { page: { theme: 'clair' } });
    const rs = contraste(s.c, s.f); const rc = contraste(c.c, c.f);
    return { ok: rs >= 4.5 && rc >= 4.5, details: `citation : ${rs.toFixed(2)}:1 en sombre, ${rc.toFixed(2)}:1 en clair (minimum 4,5:1)` };
});

dyn('MW3', ['MWG G3'], 'Contraste : alerte du panneau lisible en thème clair (4,5:1)', ({ ouvrir }) =>
    ouvrir(async (page) => {
        const m = await page.evaluate(async () => {
            const mk = window.__mk;
            await mk.sleep(600);
            Storage.prototype.setItem = () => { throw new Error('plein'); };
            window.__BTC.reglages.ouvrir();
            const champ = mk.ui().querySelector('[data-cle="separators"]');
            champ.checked = !champ.checked;
            champ.dispatchEvent(new Event('change'));
            const alerte = mk.ui().querySelector('.alerte-stockage');
            const c = getComputedStyle(alerte).color;
            const fond = getComputedStyle(mk.ui().querySelector('.panneau')).backgroundColor;
            return { visible: !alerte.hidden, c: mk.luminanceSur(c, fond), f: mk.luminanceSur(fond) };
        });
        const r = contraste(m.c, m.f);
        return { ok: m.visible && r >= 4.5, details: `alerte visible=${m.visible}, ${r.toFixed(2)}:1 sur le fond du panneau` };
    }, { page: { theme: 'clair' } }));

dyn('MW4', ['MWG G4', 'MWG G5'], 'Contrastes forcés : seul l\'onglet actif est souligné, le point de rafale reste visible', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const B = window.__BTC;
        await mk.sleep(1200);
        B.interne.terminerStabilisation();
        B.reglages.changer('rafale.entree', 3);
        B.config.rafale.fenetreS = 1;
        for (let i = 0; i < 20; i++) mk.root().appendChild(mk.message({ text: `m${i}` }));
        await mk.sleep(1300);
        B.reglages.ouvrir('reglages');
        const [actif, autre] = mk.ui().querySelectorAll('[role="tab"]');
        const trait = (el) => {
            const s = getComputedStyle(el); const p = getComputedStyle(el, '::after');
            return (s.borderBottomStyle !== 'none' && parseFloat(s.borderBottomWidth) > 0)
                || (p.content !== 'none' && p.borderBottomStyle !== 'none' && parseFloat(p.borderBottomWidth) > 0);
        };
        const bouton = document.querySelector('.btc-bouton');
        const point = getComputedStyle(bouton, '::after');
        const pointVisible = bouton.classList.contains('btc-bouton--rafale') && point.borderTopStyle !== 'none' && parseFloat(point.borderTopWidth) > 0;
        return { ok: trait(actif) && !trait(autre) && pointVisible,
            details: `trait sous l'onglet actif=${trait(actif)}, sous l'autre=${trait(autre)} ; point de rafale : bordure ${point.borderTopStyle} ${point.borderTopWidth}` };
    }), { contexte: { forcedColors: 'active' } }));

dyn('MW6', ['MWG G6'], 'Absence : fermée au clavier, la carte rend le focus à la saisie du chat', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async (src) => {
        const saisie = document.querySelector('[data-a-target="chat-input"]');
        saisie.focus();
        const carte = await (0, eval)(`(${src})`)();
        if (!carte) return { ok: false, details: 'aucune carte' };
        const fermer = carte.querySelector('.fermer');
        fermer.focus();
        fermer.click();
        const actif = document.activeElement;
        return { ok: actif === saisie, details: `focus après fermeture : ${actif === saisie ? 'la saisie du chat' : `<${actif.tagName.toLowerCase()}>`}` };
    }, AFFICHER_ABSENCE.toString())));

dyn('MW7', ['MWG G7'], 'Absence : la carte ne se ferme pas seule tant que le focus est dedans', ({ ouvrir }) =>
    ouvrir(async (page) => {
        await page.clock.runFor(3000);
        await page.evaluate(() => {
            const mk = window.__mk; window.__BTC.config.absence.minimumS = 10;
            mk.masquer(true);
            for (let i = 0; i < 5; i++) mk.root().appendChild(mk.message({ text: 'pendant ' + i }));
        });
        await page.clock.runFor(20000);
        await page.evaluate(() => window.__mk.masquer(false));
        await page.clock.runFor(500);
        const carte = () => page.evaluate(() => !!window.__mk.ui().querySelector('.carte.absence'));
        await page.evaluate(() => window.__mk.ui().querySelector('.carte.absence .fermer').focus());
        await page.clock.runFor(70000);
        const focusDedans = await carte();
        await page.evaluate(() => document.querySelector('[data-a-target="chat-input"]').focus());
        await page.clock.runFor(16000);
        const apres = await carte();
        return { ok: focusDedans && !apres, details: `carte encore là 70 s plus tard, focus dedans=${focusDedans} ; 16 s après la sortie du focus=${apres}` };
    }, { horloge: HORLOGE }));

dyn('MW8', ['MWG G8'], 'Pouls : après « Activer », le focus passe au compteur', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        await window.__mk.sleep(600);
        window.__BTC.reglages.ouvrir('pouls');
        const ui = window.__mk.ui();
        const activer = [...ui.querySelectorAll('[data-vue="pouls"] button')].find((b) => /Activer/.test(b.textContent));
        activer.focus();
        activer.click();
        const actif = ui.activeElement;
        return { ok: !!actif && actif.classList.contains('chiffres'), details: `focus : ${actif ? `<${actif.tagName.toLowerCase()} class="${actif.className}">` : '<body>'}` };
    })));

dyn('MW9', ['MWG G9'], 'Twitch en anglais : interface et notices traduites marquées en français', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk;
        await mk.sleep(1200);
        mk.root().appendChild(mk.notice({ html: `<p>${mk.name('carol')} subscribed with Prime.</p>` }));
        await mk.frames(4);
        window.__BTC.reglages.ouvrir();
        const p = mk.ui().querySelector('.panneau');
        const b = document.querySelector('.btc-bouton');
        const notice = document.querySelector('[data-test-selector="user-notice-line"] p');
        const traduite = !!notice && /abonn/.test(notice.textContent) && notice.matches(':lang(fr)');
        window.__BTC.reglages.changer('translate', false);
        const rendue = !!notice && /subscribed/.test(notice.textContent) && !notice.hasAttribute('lang');
        return { ok: p.matches(':lang(fr)') && b.matches(':lang(fr)') && traduite && rendue,
            details: `<html lang="${document.documentElement.lang}"> ; panneau=${p.matches(':lang(fr)')}, bouton=${b.matches(':lang(fr)')}, notice traduite en français=${traduite}, langue retirée avec la traduction=${rendue}` };
    }), { before: () => { document.documentElement.lang = 'en'; } }));

dyn('MW10', ['MWG G10'], 'Bouton du panneau : état ouvert, raccourci, nom fixe pendant une rafale', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const B = window.__BTC;
        await mk.sleep(1200);
        const b = document.querySelector('.btc-bouton');
        const ferme = b.getAttribute('aria-expanded');
        b.click();
        const ouvert = b.getAttribute('aria-expanded');
        B.reglages.fermer();
        const referme = b.getAttribute('aria-expanded');
        B.interne.terminerStabilisation();
        B.reglages.changer('rafale.entree', 3);
        B.config.rafale.fenetreS = 1;
        for (let i = 0; i < 20; i++) mk.root().appendChild(mk.message({ text: `m${i}` }));
        await mk.sleep(1300);
        const nom = b.getAttribute('aria-label');
        const description = b.getAttribute('aria-description') || '';
        const ok = ferme === 'false' && ouvert === 'true' && referme === 'false' && b.getAttribute('aria-keyshortcuts') === 'Alt+Shift+B'
            && nom === 'Réglages de BetterTwitchChat' && /Rafale en cours/.test(description);
        return { ok, details: `aria-expanded fermé/ouvert/refermé=${ferme}/${ouvert}/${referme}, aria-keyshortcuts=${b.getAttribute('aria-keyshortcuts')}, nom en rafale « ${nom} », description « ${description} »` };
    })));

dyn('MW11', ['MWG G11'], 'Réglages : chaque aide est reliée à son champ (aria-describedby)', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(() => {
        window.__BTC.reglages.ouvrir();
        const ui = window.__mk.ui();
        const lignes = [...ui.querySelectorAll('.reglage')].filter((r) => r.querySelector('.aide'));
        const relies = lignes.filter((r) => {
            const champ = r.querySelector('[data-cle]');
            const id = champ.getAttribute('aria-describedby');
            const cible = id && ui.getElementById(id);
            return !!cible && cible === r.querySelector('.aide');
        });
        const groupes = [...ui.querySelectorAll('fieldset')].filter((f) => f.querySelector(':scope > p.aide'));
        const groupesRelies = groupes.filter((f) => f.getAttribute('aria-describedby') === f.querySelector(':scope > p.aide').id);
        return { ok: lignes.length > 0 && relies.length === lignes.length && groupesRelies.length === groupes.length,
            details: `champs : ${relies.length}/${lignes.length} reliés à leur aide ; sections : ${groupesRelies.length}/${groupes.length}` };
    })));

dyn('MW12', ['MWG G12'], 'Onglets : flèches, Début et Fin, sans réagir à Alt', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(() => {
        window.__BTC.reglages.ouvrir('reglages');
        const ui = window.__mk.ui();
        const selectionne = () => ui.querySelector('[role="tab"][aria-selected="true"]').dataset.onglet;
        const touche = (key, opts = {}) => {
            const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts });
            ui.activeElement.dispatchEvent(ev);
            return ev.defaultPrevented;
        };
        ui.querySelector('[data-onglet="reglages"]').focus();
        touche('ArrowRight', { altKey: true });
        const avecAlt = selectionne();
        const bloquee = touche('ArrowRight');
        const droite = selectionne();
        touche('Home');
        const debut = selectionne();
        touche('End');
        const fin = selectionne();
        const ok = avecAlt === 'reglages' && bloquee && droite === 'pouls' && debut === 'reglages' && fin === 'pouls';
        return { ok, details: `Alt+Flèche droite : ${avecAlt} ; Flèche droite : ${droite} (action par défaut bloquée=${bloquee}) ; Début : ${debut} ; Fin : ${fin}` };
    })));

dyn('MW13', ['MWG G13'], 'Mouvement réduit : le chat saute en bas sans glisser', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        for (let i = 0; i < 40; i++) root.appendChild(mk.message({ user: 'u' + i, text: 'remplissage ' + i }));
        await mk.frames(10); await mk.sleep(1800);
        const sc = document.querySelector('[data-a-target="chat-scroller"]');
        for (let i = 0; i < 6; i++) root.appendChild(mk.message({ user: 'n' + i, text: 'nouveau message assez long pour prendre de la place ' + i }));
        const ecarts = [];
        for (let i = 0; i < 8; i++) { await mk.frames(1); ecarts.push(Math.round(sc.scrollHeight - sc.clientHeight - sc.scrollTop)); }
        const intermediaires = ecarts.filter((d) => d > 1).length;
        return { ok: intermediaires <= 1 && ecarts[ecarts.length - 1] <= 1,
            details: `écart au bas, image par image : ${ecarts.join(', ')} px` };
    }), { contexte: { reducedMotion: 'reduce' } }));

dyn('MW15', ['MWG G15'], 'Absence : annonce par une région live existante ou ariaNotify, texte seul', async ({ ouvrir }) => {
    const essai = (page) => page.evaluate(async (src) => {
        const ui = window.__mk.ui();
        const regions = ui ? ui.querySelectorAll('[aria-live]').length : 0;
        const carte = await (0, eval)(`(${src})`)();
        await window.__mk.sleep(300);
        const region = window.__mk.ui().querySelector('.annonce');
        return { regions, carteLive: carte.matches('[aria-live], [role="status"]'), annonces: window.__annonces || [], region: region ? region.textContent : '' };
    }, AFFICHER_ABSENCE.toString());
    // Sans ariaNotify : la région live de l'interface.
    const repli = await ouvrir(essai, { before: () => { delete Element.prototype.ariaNotify; delete Document.prototype.ariaNotify; } });
    // Avec ariaNotify : l'annonce lui est confiée.
    const natif = await ouvrir(essai, { before: () => { Element.prototype.ariaNotify = function (t) { (window.__annonces = window.__annonces || []).push(t); }; } });
    const bon = (t) => /Pendant ton absence/.test(t) && /4 messages/.test(t) && !/Fermer/.test(t);
    const ok = repli.regions >= 1 && !repli.carteLive && bon(repli.region) && natif.annonces.length === 1 && bon(natif.annonces[0]) && !natif.region;
    return { ok, details: `régions live avant la carte : ${repli.regions} ; carte elle-même live=${repli.carteLive} ; région : « ${repli.region} » ; ariaNotify : « ${natif.annonces[0] || '—'} »` };
});

dyn('MW16', ['MWG G16'], 'Absence : le dernier résumé se revoit depuis le panneau', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async (src) => {
        const carte = await (0, eval)(`(${src})`)();
        if (!carte) return { ok: false, details: 'aucune carte' };
        const messages = carte.dataset.messages;
        carte.querySelector('.fermer').click();
        window.__BTC.reglages.ouvrir('reglages');
        const ui = window.__mk.ui();
        const revoir = ui.querySelector('[data-action="revoir-absence"]');
        if (!revoir || revoir.hidden) return { ok: false, details: 'aucun moyen de revoir le résumé' };
        revoir.focus();
        revoir.click();
        const nouvelle = ui.querySelector('.carte.absence');
        const titre = nouvelle && nouvelle.querySelector('h2');
        const ok = !!nouvelle && nouvelle.dataset.messages === messages && ui.activeElement === titre;
        return { ok, details: `carte revue=${!!nouvelle}, messages ${nouvelle ? nouvelle.dataset.messages : '—'}/${messages}, focus sur son titre=${ui.activeElement === titre} ; état : « ${ui.querySelector('#btc-dernier-resume').textContent} »` };
    }, AFFICHER_ABSENCE.toString())));

dyn('MW19', ['MWG G19', 'MWG G20'], 'Absence et pouls : vrais titres, listes marquées comme telles', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        window.__BTC.interne.terminerStabilisation();
        window.__BTC.config.absence.minimumS = 0;
        mk.masquer(true);
        root.appendChild(mk.message({ user: 'carol', text: '@testeur tu as vu ça ?' }));
        await mk.sleep(400);
        mk.masquer(false);
        await mk.frames(2);
        const ui = mk.ui();
        const c = ui.querySelector('.carte.absence');
        window.__BTC.reglages.ouvrir('pouls');
        const titreCarte = c && c.querySelector('h2');
        const titreMentions = c && c.querySelector('h3.titre-bloc');
        const listes = [c && c.querySelector('ul.mentions'), ui.querySelector('ol.moments')];
        const ok = !!titreCarte && c.getAttribute('aria-labelledby') === titreCarte.id && !!titreMentions
            && listes.every((l) => l && l.getAttribute('role') === 'list');
        return { ok, details: `titre de la carte : ${titreCarte ? '<h2>' : 'aucun'}, mentions : ${titreMentions ? '<h3>' : 'aucun'}, role="list" : ${listes.map((l) => (l ? l.getAttribute('role') : 'absente')).join(', ')}` };
    }), { before: PROFIL() }));

dyn('MW21', ['MWG G21'], 'Pouls : copie annoncée, un second clic relance l\'attente', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk;
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.resolve() } });
        window.__BTC.reglages.changer('pouls.enabled', true);
        window.__BTC.reglages.ouvrir('pouls');
        const copier = [...mk.ui().querySelectorAll('[data-vue="pouls"] button')].find((b) => /Copier/.test(b.textContent));
        copier.click();
        await mk.sleep(1500);
        copier.click();
        await mk.sleep(1000);
        const pendant = copier.textContent;
        await mk.sleep(1300);
        const apres = copier.textContent;
        const annonces = window.__annonces || [];
        const ok = pendant === 'Copiée' && apres === 'Copier la liste' && annonces.length === 2 && /copiée/.test(annonces[0]);
        return { ok, details: `libellé 1 s après le second clic « ${pendant} », 2,3 s après « ${apres} » ; annonces : ${annonces.length} (« ${annonces[0] || '—'} »)` };
    }), { before: () => { Element.prototype.ariaNotify = function (t) { (window.__annonces = window.__annonces || []).push(t); }; } }));

dyn('MW22', ['MWG G22'], 'Rafale : le message joint d\'une notice réapparaît au focus clavier', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk;
        mk.root().appendChild(mk.notice({ html: `<p>${mk.name('carol')} s'est réabonné pour 3 mois.</p>`, after: mk.nested('carol', 'merci à tous') }));
        await mk.frames(4);
        document.documentElement.classList.add('btc-rafale');
        const ligne = document.querySelector('[data-test-selector="user-notice-line"]');
        const message = ligne.querySelector('.chat-line__message');
        const avant = getComputedStyle(message).display;
        ligne.tabIndex = 0;
        ligne.focus();
        const auFocus = getComputedStyle(message).display;
        return { ok: avant === 'none' && auFocus !== 'none', details: `message joint en rafale : ${avant} sans focus, ${auFocus} avec le focus dans la notice` };
    })));

dyn('MW23', ['MWG G23'], 'Fil : le focus clavier dans une réponse montre son fil', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        window.__BTC.config.fil.delaiMs = 0;
        root.appendChild(mk.message({ user: 'bob', text: 'le message de bob' }));
        root.appendChild(mk.reply({ user: 'alice', to: 'bob', quoted: 'le message de bob', text: 'bien dit' }));
        await mk.frames(4);
        const [origine, reponse] = root.querySelectorAll('.chat-line__message');
        reponse.tabIndex = 0;
        reponse.focus();
        await mk.sleep(50);
        const parent = origine.classList.contains('btc-fil-parent');
        document.querySelector('[data-a-target="chat-input"]').focus();
        await mk.sleep(50);
        const efface = !origine.classList.contains('btc-fil-parent');
        return { ok: parent && efface, details: `origine marquée au focus=${parent}, effacée quand le focus quitte le chat=${efface}` };
    })));

stat('MWM', ['MWG G18', 'MWG G25', 'MWG G28'], 'Copies de tableaux, aria-controls des onglets et transition sans effet retirés',
    verifAbsence(['[...valeurs].sort', '[...moments].reverse', "'aria-controls'", 'transition: opacity 0.15s']));

dyn('MWC', ['MWG G24', 'MWG G27'], 'Panneau : hauteur en dvh, zone de copie redimensionnable en hauteur seulement', ({ ouvrir }) =>
    ouvrir((page) => page.evaluate(() => {
        window.__BTC.reglages.ouvrir('pouls');
        const ui = window.__mk.ui();
        const regles = [...ui.querySelector('style').sheet.cssRules].map((r) => r.cssText).join('\n');
        const dvh = /\.panneau \{[^}]*100dvh/.test(regles);
        const resize = getComputedStyle(ui.querySelector('.copie')).resize;
        return { ok: dvh && resize === 'vertical', details: `max-height en dvh=${dvh}, resize de la zone de copie=${resize}` };
    })));

/** Cas propres à une seule variante : les autres les marquent « ignoré ». */
const seulementSur = (variante, ...ids) => ids.forEach((id) => { CAS.find((c) => c.id === id).variante = variante; });
seulementSur('source', 'Q1', 'LINT');
seulementSur('optimisée', 'BUILD');

module.exports = { CAS };
