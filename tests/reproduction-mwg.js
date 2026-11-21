#!/usr/bin/env node
'use strict';
/*
 * Reproduction des écarts au guide Modern Web Guidance (AUDIT-MWG.md).
 *
 *   node tests/reproduction-mwg.js                    script à la racine
 *   node tests/reproduction-mwg.js --script chemin.js un autre fichier
 *   node tests/reproduction-mwg.js --seulement G1,G2  certains constats seulement
 *
 * Chaque cas dit si l'écart est REPRODUIT sur le script testé, avec la mesure qui le montre.
 * Les identifiants sont ceux de l'audit (G1… ; P1 cherche une tâche longue et ne doit pas en
 * trouver). Comme les autres fichiers de reproduction, il ne fait pas partie du banc
 * (tests/cas.js) : un écart corrigé rejoint le banc sous forme de cas.
 */

const fs = require('fs');
const path = require('path');
const { pageHtml, HELPERS } = require('./page');

const args = process.argv.slice(2);
const opt = (nom) => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : undefined; };
const fichier = opt('--script') || path.join(__dirname, '..', 'BetterTwitchChat.user.js');
const seulement = opt('--seulement') ? new Set(opt('--seulement').split(',')) : null;
const SCRIPT = fs.readFileSync(fichier, 'utf8');

/**
 * Ouvre la page de test et y lance le script.
 * theme : 'sombre' | 'clair' ; media : options de page.emulateMedia ; avant : code lancé
 * dans la page avant le script (raccourcir une minuterie, changer la langue…).
 */
const ouvrir = async (nav, fn, { theme = 'sombre', media = null, avant = null, avantArg } = {}) => {
    const context = await nav.newContext();
    const page = await context.newPage();
    await page.route('https://www.twitch.tv/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: pageHtml({ theme }) }));
    await page.addInitScript(HELPERS);
    if (media) await page.emulateMedia(media);
    await page.goto('https://www.twitch.tv/testchannel');
    if (avant) await page.evaluate(avant, avantArg);
    await page.addScriptTag({ content: SCRIPT });
    await page.evaluate(() => window.__mk.frames(3));
    try { return await fn(page); } finally { await context.close(); }
};

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
const RAPPORT = 'const rapport = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);';

const CAS = [
    ['G1', 'Thème sombre : l\'interface ne déclare pas color-scheme, les contrôles natifs restent clairs', (nav) => ouvrir(nav, (page) => page.evaluate(async () => {
        await window.__mk.sleep(1200);
        window.__BTC.reglages.ouvrir();
        const ui = window.__mk.ui();
        const select = ui.querySelector('select');
        const schema = getComputedStyle(select).colorScheme;
        const vue = getComputedStyle(ui.querySelector('.vue')).colorScheme;
        return { reproduit: !/dark/.test(schema), mesure: `color-scheme calculé : liste déroulante « ${schema} », zone défilante « ${vue} » (thème sombre de Twitch)` };
    }))],

    ['G2', 'Thème clair : texte des citations sous 4,5:1 de contraste', (nav) => ouvrir(nav, (page) => page.evaluate(async (rapportSrc) => {
        const rapport = (0, eval)(`(${rapportSrc.replace('const rapport = ', '').replace(/;$/, '')})`);
        const mk = window.__mk; const root = mk.root();
        root.appendChild(mk.reply({ to: 'bob', quoted: 'le texte cité', text: 'réponse' }));
        await mk.frames(4);
        const q = document.querySelector('.btc-reply-quote');
        const c = getComputedStyle(q).color;
        const fond = getComputedStyle(document.body).backgroundColor;
        const r = rapport(mk.luminanceSur(c, fond), mk.luminanceSur(fond));
        return { reproduit: r < 4.5, mesure: `citation ${c} sur fond ${fond} : ${r.toFixed(2)}:1 (minimum 4,5:1 pour un texte de ${getComputedStyle(q).fontSize})` };
    }, RAPPORT), { theme: 'clair' })],

    ['G3', 'Thème clair : message d\'alerte du panneau sous 4,5:1 de contraste', (nav) => ouvrir(nav, (page) => page.evaluate(async (rapportSrc) => {
        const rapport = (0, eval)(`(${rapportSrc.replace('const rapport = ', '').replace(/;$/, '')})`);
        const mk = window.__mk;
        await mk.sleep(1200);
        // Stockage refusé : le panneau affiche son alerte.
        Storage.prototype.setItem = () => { throw new Error('plein'); };
        window.__BTC.reglages.ouvrir();
        const ui = mk.ui();
        const champ = ui.querySelector('[data-cle="separators"]');
        champ.checked = !champ.checked;
        champ.dispatchEvent(new Event('change'));
        const alerte = ui.querySelector('.alerte-stockage');
        const c = getComputedStyle(alerte).color;
        const fond = getComputedStyle(ui.querySelector('.panneau')).backgroundColor;
        const r = rapport(mk.luminanceSur(c, fond), mk.luminanceSur(fond));
        return { reproduit: !alerte.hidden && r < 4.5, mesure: `alerte ${c} sur ${fond} : ${r.toFixed(2)}:1, texte de ${getComputedStyle(alerte).fontSize} (visible : ${!alerte.hidden})` };
    }, RAPPORT), { theme: 'clair' })],

    ['G4', 'Contrastes forcés : les onglets non sélectionnés prennent eux aussi le trait de sélection', (nav) => ouvrir(nav, (page) => page.evaluate(async () => {
        await window.__mk.sleep(1200);
        window.__BTC.reglages.ouvrir();
        const [a, b] = window.__mk.ui().querySelectorAll('[role="tab"]');
        const trait = (el) => { const s = getComputedStyle(el); return { texte: s.color, style: s.borderBottomStyle, couleur: s.borderBottomColor }; };
        const ta = trait(a); const tb = trait(b);
        // Un trait est visible s'il a une épaisseur, un style et une couleur non transparente.
        const visible = (t) => t.style !== 'none' && !/rgba\([^)]*,\s*0\)$/.test(t.couleur) && t.couleur !== 'transparent';
        return { reproduit: visible(tb) && ta.texte === tb.texte,
            mesure: `sélectionné : texte ${ta.texte}, trait ${ta.couleur} ; non sélectionné : texte ${tb.texte}, trait ${tb.couleur} (sans contrastes forcés, ce trait est transparent)` };
    }), { media: { forcedColors: 'active' } })],

    ['G5', 'Contrastes forcés : le point de rafale disparaît du bouton', (nav) => ouvrir(nav, (page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root(); const B = window.__BTC;
        await mk.sleep(1200);
        B.interne.terminerStabilisation();
        B.reglages.changer('rafale.entree', 3);
        B.config.rafale.fenetreS = 1;
        for (let i = 0; i < 20; i++) root.appendChild(mk.message({ text: `m${i}` }));
        await mk.sleep(1300);
        const bouton = document.querySelector('.btc-bouton');
        const point = getComputedStyle(bouton, '::after');
        const fondBouton = getComputedStyle(bouton.parentElement).backgroundColor;
        const visible = bouton.classList.contains('btc-bouton--rafale');
        const memeCouleur = point.backgroundColor === getComputedStyle(document.body).backgroundColor;
        return { reproduit: visible && memeCouleur && point.borderTopStyle === 'none',
            mesure: `rafale signalée : ${visible} ; point : fond ${point.backgroundColor}, bordure ${point.borderTopStyle} ; page ${getComputedStyle(document.body).backgroundColor} (conteneur ${fondBouton})` };
    }), { media: { forcedColors: 'active' } })],

    ['G6', 'Carte d\'absence fermée au clavier : le focus tombe sur <body>', (nav) => ouvrir(nav, (page) => page.evaluate(async (src) => {
        const carte = await (0, eval)(`(${src})`)();
        if (!carte) return { reproduit: null, mesure: 'carte non affichée' };
        const fermer = carte.querySelector('.fermer');
        fermer.focus();
        const avant = window.__mk.ui().activeElement === fermer;
        fermer.click();
        const actif = document.activeElement;
        return { reproduit: avant && actif === document.body, mesure: `focus sur « Fermer » avant : ${avant} ; après : <${actif ? actif.tagName.toLowerCase() : 'aucun'}>` };
    }, AFFICHER_ABSENCE.toString()))],

    ['G7', 'Carte d\'absence : fermeture automatique alors que le focus est dedans', (nav) => ouvrir(nav, (page) => page.evaluate(async (src) => {
        const carte = await (0, eval)(`(${src})`)();
        if (!carte) return { reproduit: null, mesure: 'carte non affichée' };
        carte.querySelector('.fermer').focus();
        await window.__mk.sleep(900);   // minuterie de fermeture ramenée de 60 s à 600 ms
        const fermee = !carte.isConnected;
        const actif = document.activeElement;
        return { reproduit: fermee && actif === document.body, mesure: `carte fermée seule pendant que son bouton avait le focus : ${fermee} ; focus ensuite : <${actif.tagName.toLowerCase()}>` };
    }, AFFICHER_ABSENCE.toString()), {
        // La minuterie d'une minute est ramenée à 600 ms, sans rien changer d'autre.
        avant: () => { const st = window.setTimeout; window.setTimeout = (f, ms, ...a) => st(f, ms === 60000 ? 600 : ms, ...a); }
    })],

    ['G8', 'Pouls : « Activer le pouls du chat » retiré sous le focus, qui tombe sur <body>', (nav) => ouvrir(nav, (page) => page.evaluate(async () => {
        await window.__mk.sleep(1200);
        window.__BTC.reglages.ouvrir('pouls');
        const ui = window.__mk.ui();
        const activer = [...ui.querySelectorAll('[data-vue="pouls"] button')].find((b) => /Activer/.test(b.textContent));
        activer.focus();
        activer.click();
        const actif = document.activeElement;
        return { reproduit: !activer.isConnected && actif === document.body, mesure: `bouton encore dans la page : ${activer.isConnected} ; focus : <${actif.tagName.toLowerCase()}>` };
    }))],

    ['G9', 'Page Twitch en anglais : l\'interface en français n\'est pas marquée lang="fr"', (nav) => ouvrir(nav, (page) => page.evaluate(async () => {
        await window.__mk.sleep(1200);
        window.__BTC.reglages.ouvrir();
        const p = window.__mk.ui().querySelector('.panneau');
        const bouton = document.querySelector('.btc-bouton');
        return { reproduit: !p.matches(':lang(fr)'), mesure: `<html lang="${document.documentElement.lang}"> ; panneau :lang(fr) = ${p.matches(':lang(fr)')} ; bouton :lang(fr) = ${bouton.matches(':lang(fr)')}` };
    }), { avant: () => { document.documentElement.lang = 'en'; } })],

    ['G10', 'Bouton du panneau : état ouvert/fermé non exposé (aria-expanded) et raccourci absent (aria-keyshortcuts)', (nav) => ouvrir(nav, (page) => page.evaluate(async () => {
        await window.__mk.sleep(1200);
        const b = document.querySelector('.btc-bouton');
        b.click();
        const ouvert = !window.__mk.ui().querySelector('.panneau').hidden;
        return { reproduit: ouvert && !b.hasAttribute('aria-expanded'),
            mesure: `panneau ouvert : ${ouvert} ; aria-expanded : ${b.getAttribute('aria-expanded')} ; aria-keyshortcuts : ${b.getAttribute('aria-keyshortcuts')} ; title : « ${b.title} »` };
    }))],

    ['G11', 'Réglages : textes d\'aide non reliés à leur champ (aria-describedby)', (nav) => ouvrir(nav, (page) => page.evaluate(async () => {
        await window.__mk.sleep(1200);
        window.__BTC.reglages.ouvrir();
        const ui = window.__mk.ui();
        const lignes = [...ui.querySelectorAll('.reglage')].filter((r) => r.querySelector('.aide'));
        const relies = lignes.filter((r) => (r.querySelector('[data-cle]').getAttribute('aria-describedby') || '').trim());
        return { reproduit: lignes.length > 0 && relies.length === 0, mesure: `${lignes.length} réglages ont une aide visible, ${relies.length} la relient au champ` };
    }))],

    ['G12', 'Onglets : les flèches agissent même avec Alt (retour du navigateur) et ne bloquent pas l\'action par défaut', (nav) => ouvrir(nav, (page) => page.evaluate(async () => {
        await window.__mk.sleep(1200);
        window.__BTC.reglages.ouvrir('reglages');
        const ui = window.__mk.ui();
        const tab = ui.querySelector('[data-onglet="reglages"]');
        tab.focus();
        const ev = new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', altKey: true, bubbles: true, cancelable: true });
        tab.dispatchEvent(ev);
        const change = ui.querySelector('[data-onglet="pouls"]').getAttribute('aria-selected') === 'true';
        const simple = new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', bubbles: true, cancelable: true });
        ui.activeElement.dispatchEvent(simple);
        return { reproduit: change || !simple.defaultPrevented, mesure: `Alt+Flèche droite change d'onglet : ${change} ; Flèche gauche bloque l'action par défaut : ${simple.defaultPrevented}` };
    }))],

    ['G13', 'Mouvement réduit demandé : le chat glisse quand même vers le bas', (nav) => ouvrir(nav, (page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        for (let i = 0; i < 40; i++) root.appendChild(mk.message({ user: 'u' + i, text: 'remplissage ' + i }));
        await mk.frames(10); await mk.sleep(1800);
        const sc = document.querySelector('[data-a-target="chat-scroller"]');
        for (let i = 0; i < 6; i++) root.appendChild(mk.message({ user: 'n' + i, text: 'nouveau message assez long pour prendre de la place ' + i }));
        const positions = [];
        for (let i = 0; i < 12; i++) { await mk.frames(1); positions.push(Math.round(sc.scrollHeight - sc.clientHeight - sc.scrollTop)); }
        const intermediaires = positions.filter((d) => d > 1).length;
        return { reproduit: intermediaires > 2, mesure: `prefers-reduced-motion: reduce = ${matchMedia('(prefers-reduced-motion: reduce)').matches} ; écart au bas, image par image : ${positions.join(', ')} px` };
    }), { media: { reducedMotion: 'reduce' } })],

    ['G14', 'Panneau : point de repère « region » plutôt qu\'un dialogue non modal titré', (nav) => ouvrir(nav, (page) => page.evaluate(async () => {
        await window.__mk.sleep(1200);
        window.__BTC.reglages.ouvrir();
        const p = window.__mk.ui().querySelector('.panneau');
        const titre = p.querySelector('h1, h2, h3');
        return { reproduit: p.getAttribute('role') === 'region' || p.tagName !== 'DIALOG',
            mesure: `<${p.tagName.toLowerCase()} role="${p.getAttribute('role')}">, nom par aria-label « ${p.getAttribute('aria-label')} », premier titre : ${titre ? `<${titre.tagName.toLowerCase()}> « ${titre.textContent} »` : 'aucun'} ; titre visible : <${p.querySelector('.titre strong').tagName.toLowerCase()}>` };
    }))],

    ['G15', 'Carte d\'absence : région live créée avec son contenu, au lieu d\'exister avant le message', (nav) => ouvrir(nav, (page) => page.evaluate(async (src) => {
        await window.__mk.sleep(600);
        const ui = window.__mk.ui();
        const avant = ui ? ui.querySelectorAll('[aria-live], [role="status"], [role="alert"]').length : 0;
        const carte = await (0, eval)(`(${src})`)();
        if (!carte) return { reproduit: null, mesure: 'carte non affichée' };
        const region = carte.matches('[aria-live], [role="status"]') ? carte : null;
        const boutons = carte.querySelectorAll('button').length;
        return { reproduit: avant === 0 && !!region, mesure: `régions live présentes avant : ${avant} ; la carte est elle-même la région (role=${carte.getAttribute('role')}) et contient ${boutons} bouton(s) lus avec elle` };
    }, AFFICHER_ABSENCE.toString()))],

    ['G16', 'Résumé d\'absence : plus consultable nulle part une fois la carte fermée', (nav) => ouvrir(nav, (page) => page.evaluate(async (src) => {
        const carte = await (0, eval)(`(${src})`)();
        if (!carte) return { reproduit: null, mesure: 'carte non affichée' };
        const resume = carte.querySelector('p').textContent;
        carte.querySelector('.fermer').click();
        window.__BTC.reglages.ouvrir('reglages');
        const textes = [window.__mk.ui().textContent, JSON.stringify(Object.keys(window.__BTC))].join(' ');
        window.__BTC.reglages.ouvrir('pouls');
        const retrouve = textes.includes(resume) || window.__mk.ui().textContent.includes(resume);
        return { reproduit: !retrouve, mesure: `« ${resume} » retrouvé après fermeture : ${retrouve}` };
    }, AFFICHER_ABSENCE.toString()))],

    ['P1', 'Changement d\'un réglage sur un chat chargé : tâche de plus de 50 ms', (nav) => ouvrir(nav, (page) => page.evaluate(async () => {
        const mk = window.__mk; const root = mk.root();
        for (let i = 0; i < 500; i++) {
            root.appendChild(i % 5 === 4
                ? mk.reply({ user: 'u' + i, to: 'u' + (i - 4), quoted: 'message ' + (i - 4), text: 'réponse ' + i })
                : i % 25 === 7 ? mk.singleGift('donateur' + i, 'cible' + i) : mk.message({ user: 'u' + i, text: 'message ' + i }));
        }
        await mk.frames(10); await mk.sleep(1500);
        window.__BTC.reglages.ouvrir();
        const ui = mk.ui();
        const select = ui.querySelector('[data-cle="reply.style"]');
        const durees = [];
        for (const v of ['card', 'inline', 'rail', 'card', 'rail']) {
            select.value = v;
            const t0 = performance.now();
            select.dispatchEvent(new Event('change'));
            void document.body.offsetHeight;   // le style et la mise en page font partie de la tâche
            durees.push(performance.now() - t0);
            await mk.frames(2);
        }
        durees.sort((a, b) => a - b);
        const med = durees[2];
        return { reproduit: med > 50, mesure: `500 entrées : changement de « Présentation de la citation » en ${durees.map((d) => d.toFixed(0)).join(', ')} ms (médiane ${med.toFixed(0)} ms ; seuil du guide : 50 ms)` };
    }))],

    ['G17', 'Interface en px : la taille du texte ne suit pas la taille de police de la page', (nav) => ouvrir(nav, (page) => page.evaluate(async () => {
        await window.__mk.sleep(1200);
        window.__BTC.reglages.ouvrir();
        const ui = window.__mk.ui();
        const label = ui.querySelector('label');
        const avant = getComputedStyle(label).fontSize;
        document.documentElement.style.fontSize = '20px';   // préférence de taille agrandie
        const apres = getComputedStyle(label).fontSize;
        return { reproduit: avant === apres, mesure: `texte du panneau : ${avant} avec une racine à 16 px, ${apres} avec une racine à 20 px` };
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
    console.log(`\n${reproduits}/${total} écarts reproduits sur ${path.basename(fichier)}`);
})().catch((e) => { console.error(e); process.exit(2); });
