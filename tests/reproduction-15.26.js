#!/usr/bin/env node
'use strict';
/*
 * Reproduction des constats de l'audit de la v15.26.0 (AUDIT-15.26.md).
 *
 *   node tests/reproduction-15.26.js                    script à la racine
 *   node tests/reproduction-15.26.js --script chemin.js un autre fichier
 *   node tests/reproduction-15.26.js --seulement B1,P1  certains constats seulement
 *
 * Chaque cas dit si le défaut est REPRODUIT sur le script testé. Tous sont corrigés en
 * v15.26.1 et couverts par le banc (cas 26B1 à 26P2 de tests/cas.js) : ce fichier reste comme
 * contre-épreuve, il reproduit les 11 défauts sur la v15.26.0 et aucun sur la v15.26.1
 * (--script pour comparer). Les durées dépendent de la machine : seuls les ordres de
 * grandeur comptent.
 */

const fs = require('fs');
const path = require('path');
const { pageHtml, HELPERS } = require('./page');

const args = process.argv.slice(2);
const opt = (nom) => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : undefined; };
const fichier = opt('--script') || path.join(__dirname, '..', 'BetterTwitchChat.user.js');
const seulement = opt('--seulement') ? new Set(opt('--seulement').split(',')) : null;
const SCRIPT = fs.readFileSync(fichier, 'utf8');
const STOCKAGE = 'btc:reglages:v1';
/** Options d'ouverture : réglages enregistrés avant le chargement du script. */
const AVEC = (valeur) => ({ before: (a) => localStorage.setItem(a.cle, JSON.stringify(a.valeur)), avecArg: { cle: STOCKAGE, valeur } });

const ouvrir = async (nav, fn, { before, avecArg, contexte, horloge } = {}) => {
    const context = contexte || await nav.newContext();
    const page = await context.newPage();
    await page.route('https://www.twitch.tv/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: pageHtml() }));
    if (horloge) await page.clock.install({ time: horloge });
    await page.addInitScript(HELPERS);
    await page.goto('https://www.twitch.tv/testchannel');
    if (before) await page.evaluate(before, avecArg);
    await page.addScriptTag({ content: SCRIPT });
    if (!horloge) await page.evaluate(() => window.__mk.frames(3));
    try { return await fn(page); } finally { await context.close(); }
};

/** Page lourde (environ 9 500 éléments), comme une page de chaîne Twitch, et 150 lignes. */
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

const CAS = [
    ['B1', 'Repère « Aller au message » : contour transparent pendant l\'animation', (nav) => ouvrir(nav, (page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        root.appendChild(mk.message({ user: 'alice', text: 'cible' })); await mk.frames(3);
        const ligne = root.lastElementChild;
        ligne.classList.add('btc-repere');
        await mk.sleep(200);
        const couleur = getComputedStyle(ligne).outlineColor;
        return { reproduit: couleur === 'rgba(0, 0, 0, 0)', mesure: `couleur du contour à 200 ms : ${couleur}` };
    }))],

    ['B2', 'Historique : pagination « Plus anciens » et horodatages identiques', (nav) => ouvrir(nav, (page) => page.evaluate(async () => {
        const H = window.__BTC.historique; const t0 = Date.now() - 100000;
        // Twitch insère par lots : les messages d'un même lot ont le même horodatage.
        H.ajouter(Array.from({ length: 150 }, (_, i) => ({ chaine: 'testchannel', ts: t0 + Math.floor(i / 7) * 1000, type: 'message', genre: '',
            login: 'a', nom: 'a', couleur: '', texte: `m${i}`, parent: '', mention: false })));
        await H.vider();
        const p1 = await H.chercher({ limite: 100 });
        // Comme le bouton « Plus anciens » : horodatage et identifiant du dernier résultat.
        const d = p1.resultats[p1.resultats.length - 1];
        const p2 = await H.chercher({ limite: 100, avant: d.ts, avantId: d.id });
        const vus = new Set([...p1.resultats, ...p2.resultats].map((x) => x.texte)).size;
        return { reproduit: vus < 150, mesure: `${vus} messages retrouvés sur 150 en deux pages` };
    }), { ...AVEC({ historique: { enabled: true } }) })],

    ['B3', 'Pouls : un moment fort disparaît au bout de deux heures', (nav) => ouvrir(nav, async (page) => {
        const ajouter = (n, texte) => page.evaluate(({ n, texte }) => {
            const mk = window.__mk; const root = mk.root();
            for (let i = 0; i < n; i++) root.appendChild(mk.message({ user: 'u' + (i % 20), text: texte || ('msg ' + i) }));
        }, { n, texte });
        await page.clock.runFor(3000);
        for (let k = 0; k < 60; k++) { await ajouter(3); await page.clock.runFor(10000); }
        await ajouter(30, 'ÉNORME le but'); await ajouter(30); await page.clock.runFor(10000);
        for (let k = 0; k < 12; k++) { await ajouter(3); await page.clock.runFor(10000); }
        const avant = await page.evaluate(() => window.__BTC.pouls.moments().map((m) => m.texte));
        for (let k = 0; k < 405; k++) { await ajouter(6); await page.clock.runFor(20000); }
        const apres = await page.evaluate(() => window.__BTC.pouls.moments().length);
        return { reproduit: avant.length === 1 && apres === 0,
            mesure: `moments après le pic : ${avant.length} (« ${avant[0] || ''} »), 2 h 15 plus tard : ${apres}`, texte: avant[0] };
    }, { horloge: new Date('2026-11-19T20:00:00Z'), ...AVEC({ pouls: { enabled: true } }) })],

    ['B4', 'Pouls : changement de chaîne sans remplacement du conteneur', (nav) => ouvrir(nav, (page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root(); const B = window.__BTC;
        B.interne.terminerStabilisation();
        for (let i = 0; i < 12; i++) root.appendChild(mk.message({ user: 'u' + i, text: 'chaîne A ' + i }));
        await mk.frames(4); await mk.sleep(1100);
        history.pushState({}, '', '/autrechaine');
        await mk.sleep(1500);
        const restants = B.pouls.seaux.reduce((n, s) => n + s.n, 0);
        const titre = B.pouls.texte().split('\n')[0];
        return { reproduit: restants > 0, mesure: `messages de la chaîne A encore comptés : ${restants} ; titre de la liste : « ${titre} »` };
    }), { ...AVEC({ pouls: { enabled: true } }) })],

    ['B5', 'Réglages « à chaud » : certains ne reviennent pas en arrière', (nav) => ouvrir(nav, (page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root(); const B = window.__BTC;
        B.reglages.changer('compact.enabled', false);
        root.appendChild(mk.singleGift('xavier', 'bob')); await mk.frames(4);
        B.reglages.changer('compact.enabled', true); await mk.frames(2);
        const compactee = !!root.lastElementChild.querySelector('.btc-notice-line');
        root.appendChild(mk.reply({ user: 'alice', to: 'bob', quoted: 'texte', text: 'oui' })); await mk.frames(4);
        B.reglages.changer('reply.hidePrefix', false); await mk.frames(2);
        const citation = root.lastElementChild.querySelector('.btc-reply-quote').textContent;
        return { reproduit: !compactee || !/Répond/.test(citation),
            mesure: `notice compactée après réactivation : ${compactee} ; citation après « Retirer Répond à » décoché : « ${citation} »` };
    }))],

    ['B6', 'Réglages : deux onglets ouverts, le second écrase le premier', async (nav) => {
        const ctx = await nav.newContext();
        const onglet = async () => {
            const p = await ctx.newPage();
            await p.route('https://www.twitch.tv/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: pageHtml() }));
            await p.addInitScript(HELPERS); await p.goto('https://www.twitch.tv/testchannel');
            await p.addScriptTag({ content: SCRIPT }); return p;
        };
        try {
            const a = await onglet(); const b = await onglet();
            await a.evaluate(() => window.__BTC.reglages.changer('reply.style', 'card'));
            await b.waitForTimeout(300);   // deux gestes, deux onglets : jamais dans la même milliseconde
            await b.evaluate(() => window.__BTC.reglages.changer('rafale.entree', 12));
            const stocke = await a.evaluate((c) => localStorage.getItem(c), STOCKAGE);
            return { reproduit: !/card/.test(stocke), mesure: `enregistré : ${stocke}` };
        } finally { await ctx.close(); }
    }],

    ['B7', 'Mentions : un pseudo qui est un mot courant est vu partout', (nav) => ouvrir(nav, (page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        root.appendChild(mk.message({ user: 'alice', text: 'le chat est calme ce soir' })); await mk.frames(3);
        const m = window.__BTC.interne.lireMessage(root.lastElementChild.querySelector('.chat-line__message'));
        return { reproduit: m.mentionneMoi, mesure: `pseudo « chat », message « ${m.texte} » : mention=${m.mentionneMoi}` };
    }), { before: () => localStorage.setItem('twilight-user', JSON.stringify({ login: 'chat', displayName: 'Chat' })) })],

    ['B9', 'Pouls : chat lent qui arrive par paquets, chaque paquet devient un moment fort', (nav) => ouvrir(nav, (page) => page.evaluate(() => {
        // 18 messages par minute, groupés en un paquet par minute : la médiane des tranches
        // de 10 s vaut 0, seul le plancher de 8 messages reste comme seuil.
        const serie = Array.from({ length: 720 }, (_, i) => ({ n: i % 6 === 0 ? 18 : 0 }));
        const reguliere = Array.from({ length: 720 }, () => ({ n: 3 }));
        const d = window.__BTC.pouls.detecter;
        const parPaquets = d(serie, { sensibilite: 2.5, minimum: 8 }).length;
        const regulier = d(reguliere, { sensibilite: 2.5, minimum: 8 }).length;
        return { reproduit: parPaquets > 10, mesure: `2 h à 18 msg/min : ${parPaquets} moments forts si les messages arrivent par paquets, ${regulier} s'ils sont réguliers` };
    }))],

    ['P1', 'Fil : coût d\'un survol de réponse sur une page lourde', (nav) => ouvrir(nav, (page) => page.evaluate(async (src) => {
        const lest = await (0, eval)(`(${src})`)();
        const mk = window.__mk; const root = mk.root(); const B = window.__BTC;
        B.config.fil.delaiMs = 0;
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
        const med = d[7];
        return { reproduit: med > 30, mesure: `${document.getElementsByTagName('*').length} éléments, survol d'une réponse : ${med.toFixed(1)} ms (médiane)` };
    }, pageLourde.toString()))],

    ['P2', 'Historique : recherche pendant la frappe, sur 20 000 messages', (nav) => ouvrir(nav, (page) => page.evaluate(async () => {
        const H = window.__BTC.historique; const t0 = Date.now() - 3600000;
        H.ajouter(Array.from({ length: 20000 }, (_, i) => ({ chaine: 'testchannel', ts: t0 + i * 150, type: 'message', genre: '',
            login: 'u' + (i % 300), nom: 'U' + (i % 300), couleur: '', texte: `message ${i} avec un peu de texte élevé autour`, parent: '', mention: false })));
        await H.vider();
        // Deux recherches de suite, comme deux frappes : c'est la seconde qui compte.
        let t = performance.now();
        await H.chercher({ texte: 'introuvabl' });
        const premiere = performance.now() - t;
        t = performance.now();
        await H.chercher({ texte: 'introuvable' });
        const seconde = performance.now() - t;
        return { reproduit: seconde > 100, mesure: `première recherche ${Math.round(premiere)} ms, frappe suivante ${Math.round(seconde)} ms (20 000 messages)` };
    }), { ...AVEC({ historique: { enabled: true } }) })]
];

(async () => {
    const { chromium } = require('playwright');
    const nav = await chromium.launch();
    let reproduits = 0; let total = 0;
    const resultats = {};
    try {
        for (const [id, titre, fn] of CAS) {
            if (seulement && !seulement.has(id)) continue;
            total++;
            let r;
            try { r = await fn(nav); } catch (e) { r = { reproduit: null, mesure: `erreur : ${String(e.message || e).split('\n')[0]}` }; }
            resultats[id] = r;
            if (r.reproduit) reproduits++;
            const marque = r.reproduit ? 'REPRODUIT     ' : r.reproduit === false ? 'non reproduit ' : 'erreur        ';
            console.log(`${marque} ${id.padEnd(3)} ${titre}\n               ${r.mesure}`);
        }
        // Le texte du moment fort (B3) montre aussi la perte des accents et de la casse (B8).
        if (resultats.B3 && resultats.B3.texte !== undefined) {
            const b8 = resultats.B3.texte === 'enorme le but';
            if (b8) reproduits++;
            total++;
            console.log(`${b8 ? 'REPRODUIT     ' : 'non reproduit '} B8  Pouls : message représentatif sans accents ni majuscules\n               « ÉNORME le but » affiché « ${resultats.B3.texte} »`);
        }
    } finally { await nav.close(); }
    console.log(`\n${reproduits}/${total} constats reproduits sur ${path.basename(fichier)}`);
})().catch((e) => { console.error(e); process.exit(2); });
