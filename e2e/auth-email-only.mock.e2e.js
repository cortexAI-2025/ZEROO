// Connexion par e-mail uniquement : aucun bouton Google / Apple sur la connexion et l'inscription, SANS Supabase.
// Prérequis : `EXPO_PUBLIC_SUPABASE_URL=https://x.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=x npm run build:web`
// (EXPO_PUBLIC_OAUTH_PROVIDERS=google,apple est ajouté ici : les boutons restent masqués par l'interrupteur
// SOCIAL_SIGN_IN_ENABLED de src/features/auth/config.ts), puis `node e2e/auth-email-only.mock.e2e.js`.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DIST = path.join(__dirname, '..', 'dist');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let file = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

(async () => {
  await new Promise((resolve) => server.listen(8099, resolve));
  const browser = await chromium.launch();
  const failures = [];
  try {
    for (const route of ['/sign-in', '/sign-up']) {
      const page = await browser.newPage();
      // Aucune requête réelle : l'API Supabase est coupée.
      await page.route('**/*.supabase.co/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
      await page.goto(`http://localhost:8099${route}`, { waitUntil: 'networkidle' });
      await page.waitForSelector('input', { timeout: 15000 });
      const text = await page.evaluate(() => document.body.innerText);
      const inputs = await page.locator('input').count();
      const social = await page.locator('[data-testid="sign-in-google"], [data-testid="sign-in-apple"]').count();
      const ok = inputs >= 2 && social === 0 && !/continuer avec (google|apple)|google ou apple|google et apple|sms/i.test(text);
      console.log(`${ok ? 'ok  ' : 'ECHEC'} ${route} : ${inputs} champs, boutons sociaux : ${social}, mention connexion sociale ou SMS : ${/continuer avec (google|apple)|google ou apple|google et apple|sms/i.test(text)}`);
      if (!ok) failures.push(route);
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  if (failures.length) {
    console.error('ÉCHEC :', failures.join(', '));
    process.exit(1);
  }
  console.log('OK');
})();
