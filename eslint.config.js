// Analyse statique du userscript (npm run lint). Le banc de test l'exécute aussi :
// tout avertissement fait échouer les vérifications Q2/Q3 de l'audit.
'use strict';

const navigateur = Object.fromEntries([
    'window', 'document', 'console', 'location', 'history', 'navigator', 'performance',
    'Node', 'NodeFilter', 'MutationObserver', 'Event', 'getComputedStyle',
    'requestAnimationFrame', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
    'GM_info', 'Element', 'localStorage', 'indexedDB', 'IDBKeyRange', 'structuredClone', 'ResizeObserver'
].map((nom) => [nom, 'readonly']));

module.exports = [
    {
        files: ['BetterTwitchChat.user.js'],
        languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: navigateur },
        rules: {
            'no-undef': 'warn',
            'no-unused-vars': ['warn', { args: 'all', caughtErrors: 'all' }],
            // Les déclarations de fonction (hissées) servent aux appels mutuels de la boucle.
            'no-use-before-define': ['warn', { functions: false, classes: true, variables: true }],
            'no-shadow': 'warn',
            'prefer-const': 'warn',
            'no-unreachable': 'warn',
            'no-dupe-keys': 'warn',
            'no-empty': ['warn', { allowEmptyCatch: false }],
            'eqeqeq': ['warn', 'smart']
        }
    }
];
