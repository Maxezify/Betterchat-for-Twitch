#!/usr/bin/env node
/*
 * Banc de reproduction de l'audit (voir AUDIT.md).
 *
 * Charge BetterTwitchChat.js tel quel dans Chromium, sur une page qui imite le DOM du
 * chat Twitch à partir des ancres que le script documente lui-même (en-tête du
 * fichier). Aucune requête réseau : la page est servie par une interception locale.
 *
 * Chaque test affiche « BUG PRÉSENT » (comportement fautif reproduit) ou « OK »
 * (comportement attendu). Une fois les corrections appliquées sur la branche dev, le
 * même banc doit passer entièrement au vert.
 *
 * Utilisation :
 *   npm install --no-save playwright
 *   npx playwright install chromium
 *   node audit/repro.js
 *   BTC_SCRIPT=chemin/vers/autre.js node audit/repro.js   (autre version)
 *
 * Limite : le DOM est simulé. Les tests prouvent la logique du script, pas la forme
 * exacte du DOM de Twitch le jour où on les lance.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

// BTC_SCRIPT permet de pointer sur une autre version du script (ex. une copie corrigée).
const SCRIPT = fs.readFileSync(process.env.BTC_SCRIPT || path.join(__dirname, '..', 'BetterTwitchChat.js'), 'utf8');
const URL = 'https://www.twitch.tv/testchannel';

const PAGE = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>mock</title>
<style>
 html,body{margin:0;background:#18181b;color:#efeff1;font:13px/1.5 Arial,sans-serif}
 .scrollable-area{height:400px;width:340px;overflow-y:auto}
</style></head><body>
<section class="chat-room" data-test-selector="chat-room-component-layout">
 <div class="scrollable-area" data-a-target="chat-scroller">
  <div class="chat-scrollable-area__message-container" data-test-selector="chat-scrollable-area__message-container"></div>
 </div>
 <textarea data-a-target="chat-input"></textarea>
</section></body></html>`;

// Fabriques de lignes, injectées dans la page avant le script.
const HELPERS = () => {
    window.__realRAF = window.requestAnimationFrame.bind(window);
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
    const root = () => document.querySelector('[data-test-selector="chat-scrollable-area__message-container"]');
    const body = (user, text, color) =>
        `<div><span class="chat-author__display-name" data-a-user="${esc(user)}" style="color: ${color}">${esc(user)}</span><span>: </span>`
        + `<span data-a-target="chat-line-message-body"><span class="text-fragment">${esc(text)}</span></span></div>`;
    const message = ({ user = 'alice', text = 'salut', color = 'rgb(255, 0, 0)' } = {}) => h(
        `<div class="line-wrap"><div class="chat-line__message" data-a-target="chat-line-message" aria-label="${esc(user)} : ${esc(text)}">`
        + `<div class="chat-line__message-container"><div></div>${body(user, text, color)}</div></div></div>`);
    const reply = ({ user = 'alice', to = 'bob', quoted = 'texte cité', text = 'ma réponse', title = true } = {}) => h(
        `<div class="line-wrap"><div class="chat-line__message" data-a-target="chat-line-message" aria-label="Réponse à ${esc(to)}, ${esc(user)} : ${esc(text)}">`
        + `<div class="chat-line__message-container"><div><div><div><svg class="tw-svg" width="12" height="12"></svg></div>`
        + `<p${title ? ` title="${esc(quoted)}"` : ''}>Répond à <span>@${esc(to)}</span> : <span>${esc(quoted)}</span></p></div></div>`
        + `${body(user, text, 'rgb(0, 128, 255)')}</div></div></div>`);
    // depth 2 : enveloppe > carte > notice ; 1 : carte enfant direct de la racine ; 0 : notice enfant direct.
    const notice = ({ bar = 'rgb(145, 71, 255)', icon = true, html = '', after = '', depth = 2 } = {}) => {
        const line = `<div data-test-selector="user-notice-line"><div class="row">`
            + (icon ? '<div class="ico"><div><svg class="tw-svg" width="16" height="16"></svg></div></div>' : '')
            + `<div class="txt">${html}</div></div>${after}</div>`;
        if (depth === 0) return h(line);
        const card = `<div class="card"><div class="bar" style="background-color: ${bar}"></div>${line}</div>`;
        return h(depth === 1 ? card : `<div class="notice-wrap">${card}</div>`);
    };
    const name = (n) => `<span class="chatter-name"><span>${esc(n)}</span></span>`;
    const nested = (user, text) => `<div class="chat-line__message" data-a-target="chat-line-message">`
        + `<div class="chat-line__message-container"><div></div>${body(user, text, 'rgb(0, 200, 0)')}</div></div>`;
    const massGift = (donor, n, o = {}) => notice({ icon: false, ...o,
        html: `<div><p class="mystery-gift-theme__displayname">${name(donor)}</p></div><p>offre ${n} abonnements de niveau 1 à la communauté !</p>` });
    const singleGift = (donor, to, o = {}) => notice({ ...o,
        html: `<p>${name(donor)} a offert un abonnement de niveau 1 à ${name(to)} !</p>` });
    const frames = (n = 3) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : window.__realRAF(f)); window.__realRAF(f); });
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    window.__mk = { h, root, message, reply, notice, name, nested, massGift, singleGift, frames, sleep };
};

async function withPage(browser, fn, { before } = {}) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const errors = [];
    const consoleErrors = [];
    page.on('pageerror', (e) => errors.push(String(e.message || e)));
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    await page.route('https://www.twitch.tv/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: PAGE }));
    await page.addInitScript(HELPERS);
    await page.goto(URL);
    if (before) await page.evaluate(before);
    await page.addScriptTag({ content: SCRIPT });
    await page.evaluate(() => window.__mk.frames(3));
    try {
        return await fn(page, { errors, consoleErrors });
    } finally {
        await context.close();
    }
}

const TESTS = [];
const test = (id, titre, fn) => TESTS.push({ id, titre, fn });

// ---------------------------------------------------------------------------
test('B1', 'Citation sans attribut title : plantage de log() au démarrage', async (browser) =>
    withPage(browser, async (page, { errors }) => {
        const r = await page.evaluate(() => ({
            api: typeof window.__BTC,
            secondeReponseTraitee: document.querySelectorAll('.chat-line__message')[1].classList.contains('btc-reply')
        }));
        const bug = r.api === 'undefined';
        return { bug, details: `window.__BTC=${r.api}, réponse suivante traitée=${r.secondeReponseTraitee}, erreur="${errors[0] || '-'}"` };
    }, {
        before: () => {
            const root = window.__mk.root();
            root.appendChild(window.__mk.reply({ title: false, quoted: 'sans title' }));
            root.appendChild(window.__mk.reply({ quoted: 'avec title' }));
        }
    }));

test('B1b', 'Citation sans title après le démarrage : exception à chaque ligne', async (browser) =>
    withPage(browser, async (page, { consoleErrors }) => {
        await page.evaluate(async () => {
            window.__mk.root().appendChild(window.__mk.reply({ title: false }));
            await window.__mk.frames(4);
        });
        const err = consoleErrors.find((t) => t.includes('[BTC]'));
        return { bug: !!err, details: err ? err.split('\n')[0].slice(0, 120) : 'aucune erreur' };
    }));

test('B2', 'Lignes mal placées dans tintNotice() : tout le tampon est relâché d\'un coup', async (browser) => {
    const scenario = async (avecNoticeNeutre) => withPage(browser, (page) => page.evaluate(async (neutre) => {
        const mk = window.__mk;
        const root = mk.root();
        if (neutre) { root.appendChild(mk.notice({ bar: 'rgb(128, 128, 128)', html: `<p>${mk.name('zoe')} est sur une série de 3 visionnages</p>` })); await mk.frames(10); }
        for (let i = 0; i < 60; i++) root.appendChild(mk.message({ text: `msg ${i}` }));
        root.appendChild(mk.notice({ bar: 'rgb(145, 71, 255)', html: `<p>${mk.name('carol')} s'est abonné avec Prime.</p>` }));
        await Promise.resolve();                       // laisse passer l'observateur
        const avant = document.querySelectorAll('.btc-differe').length;
        const apres = await new Promise((r) => requestAnimationFrame(() => r(document.querySelectorAll('.btc-differe').length)));
        return avant - apres;
    }, avecNoticeNeutre));
    const temoin = await scenario(false);
    const casBug = await scenario(true);
    return { bug: casBug > temoin * 4, details: `lignes relâchées dans l'image : témoin=${temoin}, après une notice grise=${casBug}` };
});

test('B3', 'Deux gifts multiples successifs du même donateur : destinataires réattribués', async (browser) =>
    withPage(browser, (page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        root.appendChild(mk.massGift('xavier', 2)); await mk.frames();
        root.appendChild(mk.singleGift('xavier', 'alice')); root.appendChild(mk.singleGift('xavier', 'bob')); await mk.frames();
        const bombe2 = mk.massGift('xavier', 2); root.appendChild(bombe2); await mk.frames();
        const liste2 = [...bombe2.querySelectorAll('.btc-gift-recipient')].map((s) => s.textContent).join(', ');
        const carol = mk.singleGift('xavier', 'carol'); const dave = mk.singleGift('xavier', 'dave');
        root.appendChild(carol); root.appendChild(dave); await mk.frames();
        const visibles = [carol, dave].filter((n) => !n.classList.contains('btc-hidden')).length;
        return { bug: liste2.includes('alice') || visibles > 0, details: `liste du 2e gift="${liste2}", gifts du 2e lot restés visibles=${visibles}/2` };
    })));

test('B4', 'Onglet en arrière-plan (rAF suspendu) : tampon sans limite + lignes jamais traitées', async (browser) =>
    withPage(browser, (page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        const enAttenteRaf = [];
        const masquer = (oui) => {
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => oui });
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (oui ? 'hidden' : 'visible') });
            document.dispatchEvent(new Event('visibilitychange'));
        };
        // Onglet masqué : Chrome cesse d'appeler les callbacks de requestAnimationFrame.
        window.requestAnimationFrame = (cb) => { enAttenteRaf.push(cb); return enAttenteRaf.length; };
        masquer(true);
        const N = 2000, TAMPON_TWITCH = 150;
        for (let i = 0; i < N; i += 10) {
            for (let j = 0; j < 10; j++) root.appendChild(mk.reply({ quoted: `q${i + j}` }));
            while (root.children.length > TAMPON_TWITCH) root.firstElementChild.remove();
            await mk.sleep(0);
        }
        const info = window.__BTC.check();
        const detachees = N - TAMPON_TWITCH;
        // Retour au premier plan.
        window.requestAnimationFrame = window.__realRAF;
        masquer(false);
        for (const cb of enAttenteRaf.splice(0)) cb(performance.now());
        await mk.frames(90);
        const nonTraitees = [...root.querySelectorAll('.chat-line__message')].filter((l) => !l.classList.contains('btc-reply')).length;
        return {
            bug: info.lignesEnAttente >= N || nonTraitees > 0,
            details: `lignes retenues en arrière-plan=${info.lignesEnAttente} (dont ~${detachees} déjà retirées du DOM), réponses visibles jamais traitées au retour=${nonTraitees}/${TAMPON_TWITCH}`
        };
    })));

test('B5', 'Traduction appliquée au message écrit par l\'abonné', async (browser) =>
    withPage(browser, (page) => page.evaluate(async () => {
        const mk = window.__mk;
        const n = mk.notice({ html: `<p>${mk.name('carol')} subscribed with Prime.</p>`, after: mk.nested('carol', "I redeemed my points in Dave's channel !") });
        mk.root().appendChild(n); await mk.frames();
        const t = n.querySelector('[data-a-target="chat-line-message-body"]').textContent;
        return { bug: t !== "I redeemed my points in Dave's channel !", details: `message de l'abonné devenu : "${t}"` };
    })));

test('B6', 'Gift individuel dans une notice peu imbriquée : tout le chat est masqué', async (browser) => {
    const scenario = (depth) => withPage(browser, (page) => page.evaluate(async (d) => {
        const mk = window.__mk; const root = mk.root();
        root.appendChild(mk.message());
        root.appendChild(mk.massGift('xavier', 2)); await mk.frames();
        root.appendChild(mk.singleGift('xavier', 'alice', { depth: d })); await mk.frames();
        return getComputedStyle(root).display;
    }, depth));
    const d1 = await scenario(1);
    const d0 = await scenario(0);
    return { bug: d1 === 'none' || d0 === 'none', details: `display de la racine du chat : carte enfant direct=${d1}, notice enfant directe=${d0}` };
});

test('B7', 'Message joint placé dans le bloc texte : la règle :not(:has()) le passe en inline', async (browser) =>
    withPage(browser, (page) => page.evaluate(async () => {
        const mk = window.__mk;
        const dedans = mk.notice({ html: `<p>${mk.name('carol')} s'est abonné avec Prime.</p>${mk.nested('carol', 'coucou')}` });
        const dehors = mk.notice({ html: `<p>${mk.name('dan')} s'est abonné avec Prime.</p>`, after: mk.nested('dan', 'salut') });
        mk.root().append(dedans, dehors); await mk.frames();
        const d = getComputedStyle(dedans.querySelector('.btc-notice-text .chat-line__message')).display;
        const o = getComputedStyle(dehors.querySelector('[data-test-selector="user-notice-line"] > .chat-line__message')).display;
        return { bug: d === 'inline', details: `display du message joint : dans le bloc texte=${d}, hors du bloc=${o}` };
    })));

test('P1', 'Notre propre classList.add relance applyGradeAccent (getComputedStyle en double)', async (browser) =>
    withPage(browser, (page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        // 1) Le navigateur émet-il un enregistrement pour une classe déjà présente ?
        const el = document.createElement('div'); el.className = 'x';
        let recs = 0; const mo = new MutationObserver((l) => { recs += l.length; });
        mo.observe(el, { attributes: true }); el.classList.add('x'); await Promise.resolve(); mo.disconnect();
        // 2) Appels à getComputedStyle par ligne de réponse.
        const orig = window.getComputedStyle; let appels = 0;
        window.getComputedStyle = function (e, ...r) { if (e && e.classList && e.classList.contains('chat-line__message')) appels++; return orig.call(this, e, ...r); };
        for (let i = 0; i < 100; i++) root.appendChild(mk.reply({ quoted: `q${i}` }));
        await mk.frames(60);
        window.getComputedStyle = orig;
        return { bug: appels > 100, details: `classList.add d'une classe existante → ${recs} enregistrement(s) ; getComputedStyle pour 100 réponses = ${appels}` };
    })));

test('P2', 'Liste des destinataires reconstruite entièrement à chaque gift (O(n²))', async (browser) =>
    withPage(browser, (page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        root.appendChild(mk.massGift('xavier', 100)); await mk.frames();
        let spans = 0;
        const mo = new MutationObserver((l) => { for (const m of l) for (const n of m.addedNodes) if (n.classList && n.classList.contains('btc-gift-recipient')) spans++; });
        mo.observe(root, { childList: true, subtree: true });
        const qsa = Element.prototype.querySelectorAll; let qsaSurNosSpans = 0;
        Element.prototype.querySelectorAll = function (...a) { if (this.classList && this.classList.contains('btc-gift-recipient')) qsaSurNosSpans++; return qsa.apply(this, a); };
        for (let i = 0; i < 100; i += 10) {
            for (let j = 0; j < 10; j++) root.appendChild(mk.singleGift('xavier', `user${i + j}`));
            await mk.frames(2);
        }
        await mk.frames(10);
        Element.prototype.querySelectorAll = qsa; mo.disconnect();
        return { bug: spans > 100, details: `spans créés pour 100 destinataires=${spans} ; querySelectorAll lancés sur nos propres spans=${qsaSurNosSpans}` };
    })));

test('R1', 'Navigation SPA sans changement de chat : état des gifts perdu, liste figée « en attente »', async (browser) =>
    withPage(browser, (page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        root.appendChild(mk.message());
        const bombe = mk.massGift('xavier', 3); root.appendChild(bombe); await mk.frames();
        root.appendChild(mk.singleGift('xavier', 'alice')); await mk.frames();
        history.replaceState(null, '', location.pathname + '?ref=test');   // simple changement de query string
        await mk.sleep(1700);
        const bob = mk.singleGift('xavier', 'bob'); root.appendChild(bob); await mk.frames();
        const liste = bombe.querySelector('.btc-gift-recipients');
        return {
            bug: !!liste && liste.classList.contains('btc-gift-pending') && window.__BTC.gifts.pending.size === 0,
            details: `liste toujours « en attente »=${liste && liste.classList.contains('btc-gift-pending')}, gifts suivis=${window.__BTC.gifts.pending.size}, gift suivant masqué=${bob.classList.contains('btc-hidden')}`
        };
    })));

test('R2', 'Conteneur du chat remplacé sans changement d\'URL : script inerte, auto-diagnostic aveugle', async (browser) =>
    withPage(browser, (page) => page.evaluate(async () => {
        const mk = window.__mk; const old = mk.root();
        old.appendChild(mk.message()); await mk.frames();
        const neuf = old.cloneNode(false); old.replaceWith(neuf);
        neuf.appendChild(mk.reply()); await mk.sleep(2500); await mk.frames(5);
        const traitee = neuf.querySelector('.chat-line__message').classList.contains('btc-reply');
        const diag = window.__BTC.selfCheck();
        return { bug: !traitee, details: `réponse dans le nouveau conteneur traitée=${traitee}, selfCheck().ok=${diag.ok}` };
    })));

test('R3', 'Étiquette 7TV posée sans changement de classe : jamais retirée', async (browser) =>
    withPage(browser, (page) => page.evaluate(async () => {
        const mk = window.__mk; const w = mk.message(); mk.root().appendChild(w); await mk.frames();
        const line = w.querySelector('.chat-line__message');
        line.setAttribute('data-seventv-custom-highlight-label', '★'); await mk.frames();
        const reste = line.hasAttribute('data-seventv-custom-highlight-label');
        return { bug: reste, details: `attribut toujours présent=${reste}` };
    })));

// ---------------------------------------------------------------------------
(async () => {
    const browser = await chromium.launch();
    let presents = 0;
    try {
        for (const t of TESTS) {
            let res;
            try { res = await t.fn(browser); } catch (e) { res = { bug: null, details: `échec du test : ${e.message.split('\n')[0]}` }; }
            const etat = res.bug === null ? 'ERREUR     ' : res.bug ? 'BUG PRÉSENT' : 'OK         ';
            if (res.bug) presents++;
            console.log(`${etat}  ${t.id.padEnd(4)} ${t.titre}\n             ${res.details}`);
        }
    } finally {
        await browser.close();
    }
    console.log(`\n${presents}/${TESTS.length} comportement(s) fautif(s) reproduit(s).`);
})();
