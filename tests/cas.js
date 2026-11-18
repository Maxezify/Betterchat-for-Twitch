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
    const restes = absent(SCRIPT, ['32px', "'inherit' : '14px'", 'childElementCount > 3']);
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
// Version optimisée (scripts/build.js)
// =============================================================================
dyn('BUILD', ['Livraison'], 'Version optimisée : même feuille de style que la source', async ({ ouvrir, SOURCE }) => {
    if (!SOURCE) return { ok: null, details: 'source commentée introuvable (--source)' };
    // Espaces normalisés hors des chaînes entre guillemets : Chrome garde tels quels ceux
    // d'une valeur contenant var(), sans effet sur le rendu ; dans une chaîne, ils comptent.
    const regles = (page) => page.evaluate(() => [...document.getElementById('btc-styles').sheet.cssRules].map((r) => r.cssText
        .split(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/)
        .map((morceau, i) => (i % 2 ? morceau : morceau.replace(/\s+/g, ' ')))
        .join('')));
    const optimisee = await ouvrir(regles);
    const source = await ouvrir(regles, { script: SOURCE });
    const ecart = optimisee.findIndex((r, i) => r !== source[i]);
    const ok = optimisee.length === source.length && ecart === -1;
    return { ok, details: ok ? `${optimisee.length} règles CSS identiques à la source`
        : `${optimisee.length} règles contre ${source.length} ; premier écart : ${String(optimisee[ecart] || '').slice(0, 80)}` };
});

/** Cas propres à une seule variante : les autres les marquent « ignoré ». */
const seulementSur = (variante, ...ids) => ids.forEach((id) => { CAS.find((c) => c.id === id).variante = variante; });
seulementSur('source', 'Q1', 'LINT');
seulementSur('optimisée', 'BUILD');

module.exports = { CAS };
