#!/usr/bin/env node
'use strict';
/*
 * Reproduction des constats de l'audit de la v15.26.2 (AUDIT-15.26.2.md).
 *
 *   node tests/reproduction-15.26.2.js                    script à la racine
 *   node tests/reproduction-15.26.2.js --script chemin.js un autre fichier
 *   node tests/reproduction-15.26.2.js --seulement B1,B2  certains constats seulement
 *
 * Chaque cas dit si le défaut est REPRODUIT sur le script testé. Ce fichier ne fait pas
 * partie du banc (tests/cas.js) : tant que les défauts ne sont pas corrigés, il échouerait.
 * Une fois un défaut corrigé, son cas passe à « non reproduit » et rejoint le banc.
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
const AVEC = (valeur) => ({ before: (a) => localStorage.setItem(a.cle, JSON.stringify(a.valeur)), avecArg: { cle: STOCKAGE, valeur } });

const ouvrir = async (nav, fn, { before, avecArg } = {}) => {
    const context = await nav.newContext();
    const page = await context.newPage();
    await page.route('https://www.twitch.tv/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: pageHtml() }));
    await page.addInitScript(HELPERS);
    await page.goto('https://www.twitch.tv/testchannel');
    if (before) await page.evaluate(before, avecArg);
    await page.addScriptTag({ content: SCRIPT });
    await page.evaluate(() => window.__mk.frames(3));
    try { return await fn(page); } finally { await context.close(); }
};

// La zone de saisie réelle de Twitch est un éditeur contenteditable (Slate), pas un textarea.
const SAISIE_TWITCH = () => {
    const champ = document.createElement('div');
    champ.setAttribute('role', 'textbox');
    champ.setAttribute('contenteditable', 'true');
    champ.setAttribute('data-a-target', 'chat-input-editeur');
    champ.innerHTML = '<span data-slate-leaf="true">bonjour</span>';
    document.querySelector('section').appendChild(champ);
    return champ;
};

const CAS = [
    ['B1', 'Alt+Maj+B sans effet dans la zone de saisie du chat (Windows, Linux)', (nav) => ouvrir(nav, (page) => page.evaluate(async (src) => {
        const champ = (0, eval)(`(${src})`)();
        await window.__mk.sleep(1200);
        champ.focus();
        // Sous Windows et Linux, Alt+Maj+B donne la touche « B » : aucun caractère n'est tapé.
        const ev = new KeyboardEvent('keydown', { key: 'B', code: 'KeyB', altKey: true, shiftKey: true, bubbles: true, cancelable: true });
        champ.querySelector('span').dispatchEvent(ev);
        const ui = window.__mk.ui();
        const p = ui && ui.querySelector('.panneau');
        // <dialog> depuis la v15.26.4 (open), élément caché par hidden avant.
        const ouvert = !!p && (p.tagName === 'DIALOG' ? p.open : !p.hidden);
        return { reproduit: !ouvert, mesure: `panneau ouvert par Alt+Maj+B depuis la saisie du chat : ${ouvert}` };
    }, SAISIE_TWITCH.toString()))],

    ['B2', 'Échap : le focus part sur le bouton du panneau au lieu de revenir à la saisie', (nav) => ouvrir(nav, (page) => page.evaluate(async () => {
        await window.__mk.sleep(1200);
        const saisie = document.querySelector('[data-a-target="chat-input"]');
        saisie.focus();
        window.__BTC.reglages.ouvrir();
        document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
        const actif = document.activeElement;
        const surSaisie = actif === saisie;
        const description = surSaisie ? 'la saisie du chat' : actif ? (actif.classList.contains('btc-bouton') ? 'bouton du panneau' : actif.tagName.toLowerCase()) : 'aucun';
        return { reproduit: !surSaisie, mesure: `focus après Échap : ${description} (attendu : la saisie du chat)` };
    }))],

    ['B3', 'Pouls : un passage d\'une minute sur une autre chaîne efface les moments de la première', (nav) => ouvrir(nav, (page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root(); const B = window.__BTC;
        B.interne.terminerStabilisation();
        for (let i = 0; i < 12; i++) root.appendChild(mk.message({ user: 'u' + i, text: 'chaîne A ' + i }));
        await mk.frames(4); await mk.sleep(1100);
        const avant = B.pouls.seaux.reduce((n, s) => n + s.n, 0);
        history.pushState({}, '', '/autrechaine'); await mk.sleep(1300);
        history.pushState({}, '', '/testchannel'); await mk.sleep(1300);
        const apres = B.pouls.seaux.reduce((n, s) => n + s.n, 0);
        return { reproduit: avant === 12 && apres === 0, mesure: `messages mesurés sur testchannel : ${avant} avant, ${apres} au retour d'un aller-retour sur une autre chaîne` };
    }), AVEC({ pouls: { enabled: true } }))],

    ['B4', 'Absence : deux chaînes mélangées dans un même résumé (raid ou navigation onglet masqué)', (nav) => ouvrir(nav, (page) => page.evaluate(async () => {
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
        const n = c ? Number(c.dataset.messages) : 0;
        return { reproduit: n === 9, mesure: `messages résumés au retour sur la chaîne B : ${n} (5 de la chaîne A + 4 de la B)` };
    }))],

    ['B5', 'Pouls : le compteur du panneau, en aria-live, est réécrit chaque seconde', (nav) => ouvrir(nav, (page) => page.evaluate(async () => {
        window.__BTC.reglages.changer('pouls.enabled', true);
        window.__BTC.reglages.ouvrir('pouls');
        const vue = window.__mk.ui().querySelector('[data-vue="pouls"]');
        const compteur = vue.querySelector('.chiffres');
        const enDirect = compteur.hasAttribute('aria-live');
        let ecritures = 0;
        new MutationObserver((m) => { ecritures += m.length; }).observe(compteur, { childList: true, characterData: true, subtree: true });
        await window.__mk.sleep(3200);
        return { reproduit: enDirect && ecritures >= 3,
            mesure: `compteur en aria-live=${enDirect}, réécrit ${ecritures} fois en 3 s, texte inchangé « ${compteur.textContent} »` };
    }))],

    ['B6', 'Pastille de rafale posée sur le haut du chat, là où Twitch affiche ses bandeaux', (nav) => ouvrir(nav, (page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root(); const B = window.__BTC;
        B.interne.terminerStabilisation();
        B.reglages.changer('rafale.entree', 3);
        B.config.rafale.fenetreS = 1;
        for (let i = 0; i < 20; i++) root.appendChild(mk.message({ text: `m${i}` }));
        await mk.sleep(1300);
        const visibles = mk.ui() ? [...mk.ui().querySelectorAll('.couche > *')].filter((e) => !e.hidden) : [];
        const p = visibles[0];
        if (!p) return { reproduit: false, mesure: 'rien n\'est posé sur le chat pendant la rafale' };
        const r = p.getBoundingClientRect();
        const sc = document.querySelector('[data-a-target="chat-scroller"]').getBoundingClientRect();
        const dansLeHaut = r.top >= sc.top && r.bottom <= sc.top + 40;
        return { reproduit: dansLeHaut, mesure: `pastille de ${Math.round(r.top - sc.top)} à ${Math.round(r.bottom - sc.top)} px sous le haut du chat` };
    }))],

    ['B7', 'Un clic sur le bouton du panneau remonte aux gestionnaires des conteneurs de Twitch', (nav) => ouvrir(nav, (page) => page.evaluate(async () => {
        await window.__mk.sleep(1200);
        const bouton = document.querySelector('.btc-bouton');
        let recu = false;
        bouton.parentElement.parentElement.addEventListener('click', () => { recu = true; });
        bouton.click();
        return { reproduit: recu, mesure: `clic reçu par un conteneur parent : ${recu}` };
    }))]
];

(async () => {
    const { chromium } = require('playwright');
    const nav = await chromium.launch();
    let reproduits = 0; let total = 0;
    try {
        for (const [id, titre, fn] of CAS) {
            if (seulement && !seulement.has(id)) continue;
            total++;
            let r;
            try { r = await fn(nav); } catch (e) { r = { reproduit: null, mesure: `erreur : ${String(e.message || e).split('\n')[0]}` }; }
            if (r.reproduit) reproduits++;
            const marque = r.reproduit ? 'REPRODUIT     ' : r.reproduit === false ? 'non reproduit ' : 'erreur        ';
            console.log(`${marque} ${id.padEnd(3)} ${titre}\n               ${r.mesure}`);
        }
    } finally { await nav.close(); }
    console.log(`\n${reproduits}/${total} constats reproduits sur ${path.basename(fichier)}`);
})().catch((e) => { console.error(e); process.exit(2); });
