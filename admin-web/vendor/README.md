# Client Supabase embarqué

`supabase.js` est le paquet npm `@supabase/supabase-js` **2.117.3** (licence MIT, https://github.com/supabase/supabase-js),
empaqueté en un seul module ES par esbuild 0.25.10. Il remplace le chargement depuis `cdn.jsdelivr.net` :
l'interface d'administration n'exécute plus aucun script venu d'un tiers.

- SHA-256 : `5aa99d86a9cfc7a4cde51a4c5d4ba5a5bd887e92859c83a22f8cc2ef7218fa60` (vérifié par `admin-web/security.test.cjs`)

## Reconstruire
```bash
mkdir /tmp/vendorbuild && cd /tmp/vendorbuild && npm init -y
npm i @supabase/supabase-js@2.117.3 esbuild@0.25.10
echo "export { createClient } from '@supabase/supabase-js';" > entry.js
npx esbuild entry.js --bundle --format=esm --platform=browser --target=es2022 --minify --legal-comments=none --outfile=supabase.js
cp supabase.js <dépôt>/admin-web/vendor/supabase.js && sha256sum supabase.js
```
Puis mettre à jour le SHA-256 ci-dessus et la version dans `security.test.cjs`.
