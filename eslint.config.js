import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        portfolioData: 'readonly',
        globalLatestFileTime: 'readonly',
        OneSignal: 'readonly',
        OneSignalDeferred: 'writable',
      },
    },
    rules: {
      'no-unused-vars': [
        'warn',
        {
          args: 'after-used',
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_|^e$',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-prototype-builtins': 'off',
      'no-inner-declarations': 'off',
      'no-undef': 'error',
      eqeqeq: ['warn', 'smart'],
      'prefer-const': 'warn',
    },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
  },
  {
    files: ['tests/**/*.js', 'playwright.config.js'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
  },
  {
    files: ['public/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: { ...globals.serviceworker },
    },
  },
  {
    files: ['functions/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: { ...globals.worker, ...globals.node },
    },
  },
  {
    ignores: ['node_modules/**', 'data.js', 'tailwind.css', 'dist/**', 'test-results/**', 'playwright-report/**', '._*', '**/._*'],
  },
];
