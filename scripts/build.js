#!/usr/bin/env node
'use strict';
/*
 * Construit la version distribuée en prod : même code, sans commentaires ni espaces.
 *
 *   node scripts/build.js                       BetterTwitchChat.user.js → dist/BetterTwitchChat.user.js
 *   node scripts/build.js --entree a.js --sortie b.js
 *
 * - L'en-tête ==UserScript== est recopié tel quel : le gestionnaire de scripts le lit.
 * - Commentaires JS et espaces retirés par terser, sans compression ni renommage : le code
 *   reste celui de la source, et les noms restent lisibles dans la console.
 * - Commentaires CSS et espaces retirés dans les gabarits de buildCSS / buildReplyStyles.
 *   Un commentaire CSS coupé par une interpolation ${…} arrête la construction plutôt que
 *   de produire une feuille de style abîmée.
 * Le banc de test reconnaît ce fichier à sa ligne « Construit par scripts/build.js ».
 */

const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const { minify } = require('terser');

const RACINE = path.join(__dirname, '..');
const args = process.argv.slice(2);
const opt = (nom, defaut) => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : defaut; };
const entree = opt('--entree', path.join(RACINE, 'BetterTwitchChat.user.js'));
const sortie = opt('--sortie', path.join(RACINE, 'dist', 'BetterTwitchChat.user.js'));
const FONCTIONS_CSS = new Set(['buildCSS', 'buildReplyStyles']);

const echec = (msg) => { console.error(`✗ Construction impossible : ${msg}`); process.exit(1); };

const source = fs.readFileSync(entree, 'utf8').replace(/\r\n/g, '\n');
const fin = source.indexOf('// ==/UserScript==');
if (!source.startsWith('// ==UserScript==') || fin < 0) echec('en-tête ==UserScript== introuvable.');
const finEntete = source.indexOf('\n', fin) + 1;
const entete = source.slice(0, finEntete);
const corps = source.slice(finEntete);
const version = (entete.match(/@version\s+(\S+)/) || [])[1] || '?';

// ---------------------------------------------------------------- gabarits CSS
const ast = acorn.parse(corps, { ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true });

// Zones des fonctions qui fabriquent la feuille de style.
const zones = [];
const parcourir = (n, visite) => {
    if (!n || typeof n.type !== 'string') return;
    visite(n);
    for (const cle of Object.keys(n)) {
        const v = n[cle];
        if (Array.isArray(v)) v.forEach((x) => parcourir(x, visite));
        else if (v && typeof v.type === 'string') parcourir(v, visite);
    }
};
parcourir(ast, (n) => {
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && FONCTIONS_CSS.has(n.id.name) && n.init) {
        zones.push([n.init.start, n.init.end]);
    }
});
if (zones.length !== FONCTIONS_CSS.size) echec(`fonctions CSS attendues : ${[...FONCTIONS_CSS].join(', ')}.`);
const dansZone = (n) => zones.some(([a, b]) => n.start >= a && n.end <= b);

const remplacements = [];
let commentairesCss = 0;
parcourir(ast, (n) => {
    if (n.type !== 'TemplateElement' || !dansZone(n)) return;
    const brut = corps.slice(n.start, n.end);
    const ouverts = (brut.match(/\/\*/g) || []).length;
    const fermes = (brut.match(/\*\//g) || []).length;
    if (ouverts !== fermes) echec(`commentaire CSS coupé par une interpolation vers le caractère ${n.start}.`);
    commentairesCss += ouverts;
    const net = brut.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\s+/g, ' ');
    if (net !== brut) remplacements.push([n.start, n.end, net]);
});
let corpsCss = corps;
for (const [a, b, net] of remplacements.sort((x, y) => y[0] - x[0])) corpsCss = corpsCss.slice(0, a) + net + corpsCss.slice(b);

// ---------------------------------------------------------------- JS
(async () => {
    const r = await minify(corpsCss, {
        ecma: 2022,
        compress: false,
        mangle: false,
        format: { comments: false, ascii_only: false }
    });
    const marque = `// Construit par scripts/build.js à partir de la source commentée v${version} (branche dev de Maxezify/Betterchat-for-Twitch).\n`;
    const resultat = `${entete}${marque}${r.code}\n`;
    fs.mkdirSync(path.dirname(sortie), { recursive: true });
    fs.writeFileSync(sortie, resultat);
    const ko = (n) => `${(n / 1024).toFixed(1)} Ko`;
    console.log(`✓ ${path.relative(process.cwd(), sortie) || sortie} : ${ko(Buffer.byteLength(source))} → ${ko(Buffer.byteLength(resultat))}`
        + ` (${commentairesCss} commentaires CSS retirés, v${version})`);
})().catch((e) => echec(e.message));
