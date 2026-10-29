// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    files: ['admin-web/*.test.cjs'],
    languageOptions: { globals: { __dirname: 'readonly' } },
  },
  {
    ignores: [
      'dist/*',
      '.expo/*',
      'supabase/functions/*',
      'e2e/*',
      'docs/*',
      'admin-web/dist/**',
      'admin-web/vendor/**',
    ],
  },
]);
