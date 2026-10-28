// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    files: ['admin-web/app.js'],
    rules: { 'import/no-unresolved': ['error', { ignore: ['^https://cdn\\.jsdelivr\\.net/'] }] },
  },
  {
    files: ['admin-web/*.test.cjs'],
    languageOptions: { globals: { __dirname: 'readonly' } },
  },
  {
    ignores: ['dist/*', '.expo/*', 'supabase/functions/*', 'e2e/*', 'docs/*', 'admin-web/dist/**'],
  },
]);
