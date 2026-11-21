'use strict';
/*
 * Page de test : une imitation du DOM du chat Twitch, construite à partir des ancres que
 * le script documente lui-même dans son en-tête. Aucune requête réseau : la page est
 * servie par une interception locale de Playwright.
 */

// Variables de thème que Twitch pose sur la page : le panneau et les notices les lisent.
const THEME_SOMBRE = ':root{--color-background-base:#18181b;--color-background-alt:#26262c;--color-background-alt-2:#2f2f35;'
    + '--color-text-base:#efeff1;--color-text-alt-2:#adadb8;--color-text-link:#bf94ff}';
const THEME_CLAIR = ':root{--color-background-base:#ffffff;--color-background-alt:#f7f7f8;--color-background-alt-2:#efeff1;'
    + '--color-text-base:#0e0e10;--color-text-alt-2:#53535f;--color-text-link:#8205b4}';
// Boutons d'icône de Twitch (réglages du chat) : la structure est relevée sur la page réelle,
// le style en reprend l'essentiel. Le bouton du script est une copie de l'engrenage, dont il
// doit avoir exactement la taille et l'alignement.
const BOUTONS_TWITCH = '.ScCoreButton-sc-ocjdkq-0{display:inline-flex;position:relative;align-items:center;justify-content:center;'
    + 'vertical-align:middle;border:0;padding:0;border-radius:4px;background:transparent;color:inherit;cursor:pointer}'
    + '.ScButtonIcon-sc-9yap0r-0{width:30px;height:30px}'
    + '.ButtonIconFigure-sc-1emm8lf-0{display:inline-flex;align-items:center;width:20px;height:20px;fill:currentColor}'
    + '.ScSvgWrapper-sc-wkgzod-0{display:inline-flex;align-items:center;width:100%;height:100%}.ScSvgWrapper-sc-wkgzod-0 svg{width:100%;height:100%}';
const STYLE_SOMBRE = THEME_SOMBRE + BOUTONS_TWITCH + 'html,body{margin:0;background:#18181b;color:#efeff1;font:13px/1.5 Arial,sans-serif}';
const STYLE_CLAIR = THEME_CLAIR + BOUTONS_TWITCH + 'html,body{margin:0;background:#ffffff;color:#0e0e10;font:13px/1.5 Arial,sans-serif}';

/**
 * @param {object} o
 * @param {'sombre'|'clair'} [o.theme]
 * @param {boolean} [o.scrollerParent]  le défilement est porté par un ancêtre, pas par
 *                                      l'élément [data-a-target="chat-scroller"]
 * @param {string}  [o.dureeLive]       durée du live affichée près du lecteur (« 1:23:45 »)
 */
const pageHtml = ({ theme = 'sombre', scrollerParent = false, dureeLive = '' } = {}) => {
    const conteneur = '<div class="chat-scrollable-area__message-container" '
        + 'data-test-selector="chat-scrollable-area__message-container"></div>';
    const zone = scrollerParent
        ? `<div class="outer" style="height:300px;width:340px;overflow-y:auto">
             <div class="scrollable-area" data-a-target="chat-scroller" style="overflow:visible">${conteneur}</div>
           </div>`
        : `<div class="scrollable-area" data-a-target="chat-scroller" style="height:400px;width:340px;overflow-y:auto">${conteneur}</div>`;
    return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>banc</title>
<style>${theme === 'clair' ? STYLE_CLAIR : STYLE_SOMBRE}</style></head><body>
${dureeLive ? `<div class="channel-info"><span class="live-time">${dureeLive}</span></div>` : ''}
<section class="chat-room" data-test-selector="chat-room-component-layout">${zone}
 <div class="chat-wysiwyg-input__editor" role="textbox" aria-multiline="true" data-a-target="chat-input" data-slate-editor="true" contenteditable="true" tabindex="0"><div data-slate-node="element"><span data-slate-node="text"><span data-slate-leaf="true" data-a-target="chat-input-text">bonjour</span></span></div></div>
 <div class="chat-input__buttons"><div class="kFDiny"><div class="glFavL"><div class="InjectLayout-sc-1i43xsx-0 bohlnR"><div class="Layout-sc-1xcs6mc-0 dXmeTP">`
    + `<button class="ScCoreButton-sc-ocjdkq-0 eBQIRH ScButtonIcon-sc-9yap0r-0 jcYIUn" data-a-target="chat-settings" aria-label="Paramètres du chat">`
    + `<div class="ButtonIconFigure-sc-1emm8lf-0 jgYFuA"><div class="ScSvgWrapper-sc-wkgzod-0 cnGLHG tw-svg">`
    + `<svg width="24" height="24" viewBox="0 0 24 24" focusable="false" aria-hidden="true" role="presentation"><path d="M12 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"></path></svg>`
    + `</div></div></button></div></div></div></div></div>
</section></body></html>`;
};

/** Fabriques de lignes et utilitaires, injectés dans la page avant le script. */
const HELPERS = () => {
    window.__realRAF = window.requestAnimationFrame.bind(window);
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
    const root = () => document.querySelector('[data-test-selector="chat-scrollable-area__message-container"]');
    const GIF = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
    const emote = (nom) => `<img class="chat-image" data-emote-name="${esc(nom)}" alt="${esc(nom)}" src="${GIF}">`;
    const badge = (alt) => `<img class="chat-badge" alt="${esc(alt)}" src="${GIF}" width="18" height="18">`;
    const corps = (user, html, color, login, badges = []) =>
        `<div>${badges.map(badge).join('')}<span class="chat-author__display-name" data-a-user="${esc(login || user)}" style="color: ${color}">${esc(user)}</span><span>: </span>`
        + `<span data-a-target="chat-line-message-body">${html}</span></div>`;
    const message = ({ user = 'alice', login, text = 'salut', color = 'rgb(255, 0, 0)', emotes = [], premier = '', badges = [] } = {}) => h(
        `<div class="line-wrap"><div class="chat-line__message" data-a-target="chat-line-message" aria-label="${esc(user)} : ${esc(text)}">`
        + `<div class="chat-line__message-container"><div>${premier}</div>`
        + corps(user, `<span class="text-fragment">${esc(text)}</span>${emotes.map(emote).join('')}`, color, login, badges)
        + '</div></div></div>');
    const reply = ({ user = 'alice', to = 'bob', quoted = 'texte cité', text = 'ma réponse', title = true, style = '' } = {}) => h(
        `<div class="line-wrap"><div class="chat-line__message" data-a-target="chat-line-message" style="${style}" aria-label="Réponse à ${esc(to)}, ${esc(user)} : ${esc(text)}">`
        + '<div class="chat-line__message-container"><div><div><div><svg class="tw-svg" width="12" height="12"></svg></div>'
        + `<p${title ? ` title="${esc(quoted)}"` : ''}>Répond à <span>@${esc(to)}</span> : <span>${esc(quoted)}</span></p></div></div>`
        + corps(user, `<span class="text-fragment">${esc(text)}</span>`, 'rgb(0, 128, 255)')
        + '</div></div></div>');
    // depth 2 : enveloppe > carte > notice ; 1 : carte enfant direct de la racine ; 0 : notice enfant directe.
    const notice = ({ bar = 'rgb(145, 71, 255)', icon = true, html = '', after = '', depth = 2 } = {}) => {
        const line = '<div data-test-selector="user-notice-line"><div class="row">'
            + (icon ? '<div class="ico"><div><svg class="tw-svg" width="16" height="16"></svg></div></div>' : '')
            + `<div class="txt">${html}</div></div>${after}</div>`;
        if (depth === 0) return h(line);
        const card = `<div class="card"><div class="bar" style="background-color: ${bar}"></div>${line}</div>`;
        return h(depth === 1 ? card : `<div class="notice-wrap">${card}</div>`);
    };
    const name = (n) => `<span class="chatter-name"><span>${esc(n)}</span></span>`;
    const nested = (user, html, color = 'rgb(0, 200, 0)') => '<div class="chat-line__message" data-a-target="chat-line-message">'
        + `<div class="chat-line__message-container"><div></div>${corps(user, html, color)}</div></div>`;
    const massGift = (donor, n, o = {}) => notice({ icon: false, ...o,
        html: `<div><p class="mystery-gift-theme__displayname">${name(donor)}</p></div><p>offre ${n} abonnements de niveau 1 à la communauté !</p>` });
    const singleGift = (donor, to, o = {}) => notice({ ...o,
        html: `<p>${name(donor)} a offert un abonnement de niveau 1 à ${name(to)} !</p>` });
    const frames = (n = 3) => new Promise((r) => { let i = 0; const f = () => (++i >= n ? r() : window.__realRAF(f)); window.__realRAF(f); });
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    /** Onglet masqué ou visible, comme le navigateur le signale à la page. */
    const masquer = (oui) => {
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => oui });
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (oui ? 'hidden' : 'visible') });
        document.dispatchEvent(new Event('visibilitychange'));
    };
    const ui = () => (document.getElementById('btc-ui') || {}).shadowRoot || null;
    const survoler = (el) => el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    /** Luminance relative (0 noir – 1 blanc) d'une couleur CSS posée sur un fond donné. */
    const luminanceSur = (couleur, fond = '#ffffff') => {
        const c = document.createElement('canvas'); c.width = c.height = 1;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.fillStyle = fond; x.fillRect(0, 0, 1, 1);
        x.fillStyle = couleur; x.fillRect(0, 0, 1, 1);
        const [r, g, b] = x.getImageData(0, 0, 1, 1).data;
        const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    };
    window.__mk = { h, root, message, reply, notice, name, nested, massGift, singleGift, emote, frames, sleep, luminanceSur, masquer, ui, survoler };
};

module.exports = { pageHtml, HELPERS };
