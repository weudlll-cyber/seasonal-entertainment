// ============================================================
// File:        eslint.config.js
// Path:        eslint.config.js
// Project:     Seasonal Entertainment
// Description: ESLint flat config for the whole repository: Node rules for server and scripts,
//              browser + React hooks rules for the client, Prettier owns formatting.
// ============================================================

import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import prettierConfig from 'eslint-config-prettier';

export default [
  { ignores: ['**/node_modules/**', 'client/dist/**', 'coverage/**', 'test-results/**'] },

  js.configs.recommended,

  // Dead code and dead variables are errors, not warnings (see CLAUDE.md).
  {
    rules: {
      // ignoreRestSiblings: "const { secret, ...shown } = x" leaves fields out on purpose.
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
    },
  },

  // Node: server, root scripts and tool configs.
  {
    files: ['server/**/*.js', 'scripts/**/*.mjs', '*.config.js', 'client/vite.config.js'],
    languageOptions: { globals: globals.node },
  },

  // Shared rules: run in both, so only globals both have.
  {
    files: ['shared/**/*.js'],
    languageOptions: { globals: globals['shared-node-browser'] },
  },

  // Browser: the React client.
  {
    files: ['client/src/**/*.{js,jsx}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  // Classic scripts the client serves as they are (public/theme-init.js runs before React).
  {
    files: ['client/public/**/*.js'],
    languageOptions: { globals: globals.browser, sourceType: 'script' },
  },
  // Playwright specs run in Node; their page.evaluate callbacks run in the browser.
  {
    files: ['client/e2e/**/*.js'],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  {
    files: ['client/src/**/*.jsx'],
    ...reactHooks.configs.flat.recommended,
  },

  // Must stay last: switches off rules that would fight Prettier.
  prettierConfig,
];
