#!/usr/bin/env node
// Passage navigateur (Chromium) des trois espaces à 3 largeurs (mobile, tablette, ordinateur) sur la pile LOCALE :
// connexion par l'interface, visite des écrans principaux, contrôle de l'absence d'erreur JavaScript/HTTP inattendue,
// de débordement horizontal et d'écran vide. Ignorés (pile locale) : le websocket Realtime (service non lancé) et les
// ressources externes bloquées par le bac à sable. Données fictives, aucun accès distant.
//   RECETTE_PASSWORD=… CHROMIUM_PATH=… WEB_DIR=/tmp/zeeroo-http/web-final node docs/recette/ui_responsive.mjs [dossier-captures]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const WEB = process.env.WEB_DIR ?? '/tmp/zeeroo-http/web-final';
const PASSWORD = process.env.RECETTE_PASSWORD;
if (!PASSWORD) {
  console.error('RECETTE_PASSWORD requis');
  process.exit(64);
}
const shots = process.argv[2];
if (shots) fs.mkdirSync(shots, { recursive: true });
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};
const srv = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  let f = path.join(WEB, p);
  if (!f.startsWith(WEB) || !fs.existsSync(f) || fs.statSync(f).isDirectory())
    f = path.join(WEB, 'index.html');
  r.writeHead(200, { 'content-type': types[path.extname(f)] ?? 'application/octet-stream' });
  r.end(fs.readFileSync(f));
});
await new Promise((res) => srv.listen(0, '127.0.0.1', res));
const BASE = `http://127.0.0.1:${srv.address().port}`;

const VIEWPORTS = {
  mobile: { width: 390, height: 844 },
  tablette: { width: 820, height: 1180 },
  ordinateur: { width: 1366, height: 768 },
};
const SPACES = {
  client: {
    email: 'client@zeroo.test',
    routes: [
      '/explore',
      '/orders',
      '/cart',
      '/loyalty',
      '/account',
      '/favorites',
      '/addresses',
      '/m/chez-samir',
    ],
  },
  restaurant: {
    email: 'commercant@zeroo.test',
    routes: [
      '/pro',
      '/pro/menu',
      '/pro/shop',
      '/pro/stats',
      '/pro/account',
      '/pro/hours',
      '/pro/info',
      '/pro/delivery',
      '/pro/happy-hours',
      '/pro/baskets',
      '/pro/group-orders',
      '/pro/minisite',
      '/pro/qr',
      '/pro/history',
    ],
  },
  livreur: {
    email: 'livreur@zeroo.test',
    routes: [
      '/livreur',
      '/livreur/restaurants',
      '/livreur/revenus',
      '/livreur/compte',
      '/livreur/profil',
    ],
  },
};
let ok = 0,
  fail = 0;
const line = (good, msg) => {
  good ? ok++ : fail++;
  console.log(`${good ? 'OK    ' : 'ÉCHEC '} ${msg}`);
};
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  args: ['--no-sandbox'],
});
for (const [space, cfg] of Object.entries(SPACES)) {
  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    const ctx = await browser.newContext({ viewport: vp });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push('js: ' + e.message.slice(0, 120)));
    page.on('console', (m) => {
      if (
        m.type() === 'error' &&
        !/favicon|Failed to load resource.*(404|401|403)|realtime\/v1\/websocket|ERR_TUNNEL_CONNECTION_FAILED/.test(
          m.text(),
        )
      )
        errors.push(
          'console: ' +
            m
              .text()
              .replace(/eyJ[A-Za-z0-9_.-]+/g, '[JETON-MASQUÉ]')
              .slice(0, 120),
        );
    });
    await page.goto(`${BASE}/sign-in`);
    await page.waitForSelector('input', { timeout: 20000 });
    await page
      .locator(
        'input[type=email], input[inputmode=email], input[autocomplete=email], input[autocomplete=username]',
      )
      .first()
      .fill(cfg.email);
    await page.locator('input[type=password]').first().fill(PASSWORD);
    await page.keyboard.press('Enter');
    await page
      .waitForFunction(() => !location.pathname.includes('sign-in'), null, { timeout: 20000 })
      .catch(() => {});
    await page.waitForTimeout(1500);
    const loggedIn = !page.url().includes('sign-in');
    line(loggedIn, `${space} / ${vpName} : connexion par l’interface`);
    if (!loggedIn) {
      if (shots) await page.screenshot({ path: `${shots}/${space}-${vpName}-connexion.png` });
      await ctx.close();
      continue;
    }
    for (const route of cfg.routes) {
      await page.goto(BASE + route);
      await page.waitForTimeout(1200);
      const m = await page.evaluate(() => ({
        w: document.documentElement.scrollWidth,
        iw: window.innerWidth,
        text: document.body.innerText.trim().length,
        path: location.pathname,
      }));
      const notFound = /introuvable|not.?found|404/i.test(
        await page
          .locator('body')
          .innerText()
          .catch(() => ''),
      );
      const overflow = m.w > m.iw + 2;
      const redirected =
        !m.path.startsWith(route.split('/').slice(0, 2).join('/')) && route !== '/m/chez-samir';
      const good = !overflow && m.text > 20 && !notFound && !redirected;
      line(
        good,
        `${space} / ${vpName} : ${route}${overflow ? ` — débordement horizontal (${m.w}>${m.iw})` : ''}${m.text <= 20 ? ' — écran vide' : ''}${notFound ? ' — page introuvable' : ''}${redirected ? ` — redirigé vers ${m.path}` : ''}`,
      );
      if (shots && vpName === 'mobile')
        await page.screenshot({
          path: `${shots}/${space}-${vpName}-${route.replace(/\W+/g, '_')}.png`,
        });
    }
    line(
      errors.length === 0,
      `${space} / ${vpName} : aucune erreur JavaScript${errors.length ? ' — ' + [...new Set(errors)].slice(0, 3).join(' | ') : ''}`,
    );
    await ctx.close();
  }
}
await browser.close();
srv.close();
console.log(`\n# Bilan : ${ok} OK, ${fail} ÉCHEC`);
process.exit(fail ? 1 : 0);
