#!/usr/bin/env node
'use strict';
/*
 * Banc de test de BetterTwitchChat.
 *
 *   node tests/banc.js                      teste BetterTwitchChat.user.js à la racine
 *   node tests/banc.js --ref origin/prod    teste la version d'une branche ou d'un commit
 *   node tests/banc.js --script chemin.js   teste un fichier quelconque
 *   node tests/banc.js --seulement B1,R2    ne lance que certains cas
 *   node tests/banc.js --json sortie.json   écrit le rapport à cet endroit
 *   node tests/banc.js --script dist/BetterTwitchChat.user.js
 *                                           teste la version optimisée (npm run test:build) ;
 *                                           --source désigne la source commentée à comparer
 *
 * Le rapport JSON (tests/resultats/<étiquette>.json par défaut) alimente le tableau de
 * bord. Code de sortie 1 si un cas échoue : c'est ce qui bloque le commit (hook
 * pre-commit) et la vérification GitHub.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { pageHtml, HELPERS } = require('./page');
const { CAS } = require('./cas');

const RACINE = path.join(__dirname, '..');
const NOMS = ['BetterTwitchChat.user.js', 'BetterTwitchChat.js'];
const URL_PAGE = 'https://www.twitch.tv/testchannel';

// ---------------------------------------------------------------- arguments
const args = process.argv.slice(2);
const opt = (nom) => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : undefined; };
const ref = opt('--ref');
const seulement = opt('--seulement') ? new Set(opt('--seulement').split(',')) : null;

const git = (...a) => {
    try { return execFileSync('git', a, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
    catch { return null; }
};

// ---------------------------------------------------------------- script à tester
let fichier = opt('--script');
let SCRIPT;
if (ref) {
    for (const nom of NOMS) {
        try {
            SCRIPT = execFileSync('git', ['show', `${ref}:${nom}`], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'ignore'] }).toString('utf8');
            fichier = `${ref}:${nom}`;
            break;
        } catch { /* nom suivant */ }
    }
    if (!SCRIPT) { console.error(`Aucun script trouvé dans ${ref}. Branche distante absente ? Lancer : git fetch origin`); process.exit(2); }
} else {
    fichier = fichier || NOMS.map((n) => path.join(RACINE, n)).find((p) => fs.existsSync(p));
    if (!fichier) { console.error('Script introuvable.'); process.exit(2); }
    SCRIPT = fs.readFileSync(fichier, 'utf8');
}
const version = (SCRIPT.match(/@version\s+(\S+)/) || [])[1] || '?';
// La version optimisée (scripts/build.js) porte cette ligne. Les cas qui ne concernent que
// la source commentée (place des commentaires, ESLint) y sont ignorés, et inversement.
const VARIANTE = /^\/\/ Construit par scripts\/build\.js/m.test(SCRIPT) ? 'optimisée' : 'source';
const cheminSource = opt('--source') || path.join(RACINE, 'BetterTwitchChat.user.js');
const SOURCE = VARIANTE === 'optimisée' && fs.existsSync(cheminSource) ? fs.readFileSync(cheminSource, 'utf8') : null;

// ---------------------------------------------------------------- ESLint (facultatif)
const eslint = async () => {
    let ESLint;
    try { ({ ESLint } = require('eslint')); } catch { return null; }
    const moteur = new ESLint({ cwd: RACINE, overrideConfigFile: path.join(RACINE, 'eslint.config.js') });
    const [r] = await moteur.lintText(SCRIPT, { filePath: path.join(RACINE, 'BetterTwitchChat.user.js') });
    return r.messages.map((m) => `L${m.line} ${m.ruleId}`);
};

// ---------------------------------------------------------------- exécution
(async () => {
    const { chromium } = require('playwright');
    const navigateur = await chromium.launch();

    /** Ouvre une page de test, y charge le script, puis appelle fn(page, journal). */
    const ouvrir = async (fn, { before, page: optionsPage, script = SCRIPT } = {}) => {
        const context = await navigateur.newContext();
        const page = await context.newPage();
        const journal = { errors: [], consoleErrors: [], logs: [] };
        page.on('pageerror', (e) => journal.errors.push(String(e.message || e)));
        page.on('console', (m) => {
            if (m.type() === 'error') journal.consoleErrors.push(m.text());
            else journal.logs.push(m.text());
        });
        const html = pageHtml(optionsPage);
        await page.route('https://www.twitch.tv/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: html }));
        await page.addInitScript(HELPERS);
        await page.goto(URL_PAGE);
        if (before) await page.evaluate(before);
        await page.addScriptTag({ content: script });
        await page.evaluate(() => window.__mk.frames(3));
        try { return await fn(page, journal); } finally { await context.close(); }
    };

    const resultats = [];
    const debut = Date.now();
    for (const cas of CAS) {
        if (seulement && !seulement.has(cas.id)) continue;
        const t0 = Date.now();
        let r;
        try {
            r = cas.variante && cas.variante !== VARIANTE
                ? { ok: null, details: cas.variante === 'source' ? 'vérifié sur la source commentée' : 'concerne la version optimisée' }
                : await cas.run({ ouvrir, SCRIPT, SOURCE, eslint });
        } catch (e) {
            r = { ok: undefined, details: `erreur du test : ${String(e.message || e).split('\n')[0]}` };
        }
        const statut = r.ok === true ? 'ok' : r.ok === false ? 'echec' : r.ok === null ? 'ignore' : 'erreur';
        resultats.push({ id: cas.id, audit: cas.audit, type: cas.type, titre: cas.titre, statut, details: r.details, ms: Date.now() - t0 });
        const marque = { ok: '✓', echec: '✗', ignore: '–', erreur: '!' }[statut];
        console.log(`${marque} ${cas.id.padEnd(5)} ${cas.titre}\n        ${r.details}`);
    }
    const versionNavigateur = navigateur.version();
    await navigateur.close();

    const compte = (s) => resultats.filter((r) => r.statut === s).length;
    const rapport = {
        date: new Date().toISOString(),
        etiquette: ref || (opt('--script') ? path.basename(fichier) : 'copie de travail'),
        branche: ref || git('rev-parse', '--abbrev-ref', 'HEAD'),
        commit: git('rev-parse', '--short', ref || 'HEAD'),
        script: ref ? fichier : path.relative(process.cwd(), fichier),
        version,
        variante: VARIANTE,
        navigateur: `Chromium ${versionNavigateur}`,
        dureeMs: Date.now() - debut,
        resume: { total: resultats.length, ok: compte('ok'), echec: compte('echec'), erreur: compte('erreur'), ignore: compte('ignore') },
        tests: resultats
    };

    const sortie = opt('--json') || path.join(RACINE, 'tests', 'resultats',
        `${(ref || 'courant').replace(/[^\w.-]+/g, '_')}.json`);
    fs.mkdirSync(path.dirname(sortie), { recursive: true });
    fs.writeFileSync(sortie, JSON.stringify(rapport, null, 2));

    const { ok, echec, erreur, ignore, total } = rapport.resume;
    console.log(`\n${ok}/${total} réussis, ${echec} échec(s), ${erreur} erreur(s), ${ignore} ignoré(s) — v${version} (${VARIANTE}), ${rapport.dureeMs} ms`);
    console.log(`Rapport : ${path.relative(process.cwd(), sortie) || sortie}`);
    process.exit(echec || erreur ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
