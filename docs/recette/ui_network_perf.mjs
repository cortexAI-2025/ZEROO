#!/usr/bin/env node
// Résilience réseau et performances du web, dans Chromium, sur la pile LOCALE : bandeau hors connexion, message d'erreur réseau
// dédié, reprise au retour de la connexion, et temps de chargement avec réseau 4G lente + processeur ralenti (x4), réponses compressées.
//   RECETTE_PASSWORD=… CHROMIUM_PATH=… WEB_DIR=/tmp/zeeroo-http/web-final node docs/recette/ui_network_perf.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const WEB = process.env.WEB_DIR ?? '/tmp/zeeroo-http/web-final';
const PASSWORD = process.env.RECETTE_PASSWORD;
if (!PASSWORD) {
  console.error('RECETTE_PASSWORD requis');
  process.exit(64);
}
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
};
const srv = http.createServer((q, r) => {
  let f = path.join(WEB, decodeURIComponent(q.url.split('?')[0]));
  if (!f.startsWith(WEB) || !fs.existsSync(f) || fs.statSync(f).isDirectory())
    f = path.join(WEB, 'index.html');
  const type = types[path.extname(f)] ?? 'application/octet-stream';
  const raw = fs.readFileSync(f);
  const gz =
    /gzip/.test(q.headers['accept-encoding'] ?? '') && /text|javascript|json|svg/.test(type);
  r.writeHead(200, { 'content-type': type, ...(gz ? { 'content-encoding': 'gzip' } : {}) });
  r.end(gz ? zlib.gzipSync(raw) : raw);
});
await new Promise((res) => srv.listen(0, '127.0.0.1', res));
const BASE = `http://127.0.0.1:${srv.address().port}`;
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

// 1. Performances : visiteur anonyme, mobile, 4G lente (1,6 Mb/s, 150 ms) et CPU x4
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (0.75 * 1024 * 1024) / 8,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const t0 = Date.now();
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.innerText.trim().length > 50, null, {
    timeout: 60000,
  });
  const interactive = Date.now() - t0;
  const nav = await page.evaluate(() => {
    const n = performance.getEntriesByType('navigation')[0];
    const fcp = performance.getEntriesByName('first-contentful-paint')[0];
    return {
      fcp: fcp ? Math.round(fcp.startTime) : null,
      dcl: Math.round(n.domContentLoadedEventEnd),
      transfer: performance
        .getEntriesByType('resource')
        .reduce((s, e) => s + (e.transferSize || 0), 0),
    };
  });
  console.log(
    `INFO   4G lente + CPU x4 : contenu affiché en ${interactive} ms, FCP ${nav.fcp} ms, DCL ${nav.dcl} ms, ${(nav.transfer / 1024).toFixed(0)} Ko transférés (compressés)`,
  );
  line(
    interactive < 15000,
    `P1 Page d’accueil lisible en moins de 15 s sur 4G lente avec processeur ralenti (${(interactive / 1000).toFixed(1)} s)`,
  );
  line(
    nav.transfer < 2.5 * 1024 * 1024,
    `P2 Transfert initial inférieur à 2,5 Mo (${(nav.transfer / 1024 / 1024).toFixed(2)} Mo)`,
  );
  await ctx.close();
}

// 2. Hors connexion : bandeau, message dédié, reprise
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/sign-in`);
  await page.waitForSelector('input', { timeout: 20000 });
  await page
    .locator(
      'input[type=email], input[inputmode=email], input[autocomplete=email], input[autocomplete=username]',
    )
    .first()
    .fill('client@zeroo.test');
  await page.locator('input[type=password]').first().fill(PASSWORD);
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => !location.pathname.includes('sign-in'), null, {
    timeout: 20000,
  });
  await page.waitForTimeout(1500);
  line(
    (await page.locator('[data-testid=offline-banner]').count()) === 0,
    'N1 En ligne : aucun bandeau hors connexion',
  );
  await ctx.setOffline(true);
  await page.waitForSelector('[data-testid=offline-banner]', { timeout: 5000 }).catch(() => {});
  line(
    (await page.locator('[data-testid=offline-banner]').count()) === 1,
    'N2 Hors connexion : le bandeau apparaît aussitôt',
  );
  // Écran jamais chargé : navigation interne vers « Fidélité » → erreur réseau dédiée (pas « Une erreur est survenue »)
  const tab = page.getByText(/fidélité/i).first();
  await tab.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(4000);
  const body = await page.locator('body').innerText();
  line(
    /Connexion impossible/.test(body),
    'N3 Écran jamais chargé, hors ligne : message « Connexion impossible… » (au lieu d’un chargement sans fin)',
  );
  line(!/Une erreur est survenue/.test(body), 'N3 Aucun message d’erreur générique trompeur');
  await ctx.setOffline(false);
  await page
    .waitForFunction(() => !document.querySelector('[data-testid=offline-banner]'), null, {
      timeout: 5000,
    })
    .catch(() => {});
  line(
    (await page.locator('[data-testid=offline-banner]').count()) === 0,
    'N4 Retour de la connexion : le bandeau disparaît',
  );
  await page.waitForTimeout(3500);
  const after = await page.locator('body').innerText();
  line(
    !/Connexion impossible/.test(after),
    'N5 Retour du réseau : la requête reprend seule et l’écran se charge',
    /Fidélité|carte/i.test(after) ? '' : 'contenu à vérifier',
  );
  await ctx.close();
}
await browser.close();
srv.close();
console.log(`\n# Bilan : ${ok} OK, ${fail} ÉCHEC`);
process.exit(fail ? 1 : 0);
