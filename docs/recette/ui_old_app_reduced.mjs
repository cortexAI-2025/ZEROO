#!/usr/bin/env node
// ANCIENNE application (build de la branche précédente, sur 127.0.0.1:8082) en MODE RETOUR ARRIÈRE RÉDUIT : le restaurateur
// retrouve son lien de paiement et son téléphone ; un SIRET saisi dans l'ancienne application va dans merchant_private, jamais
// dans merchants.
//   node docs/recette/ui_old_app_reduced.mjs [dossier-de-captures]
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const SHOTS = process.argv[2] ?? '/tmp/zeeroo-http/captures'; mkdirSync(SHOTS, { recursive: true });
const DIST = process.env.WEB_DIST_OLD ?? '/tmp/zeeroo-http/web-old';
const sql = (q) => execFileSync('psql', ['-X', '-At', '-F', '|', '-h', '127.0.0.1', '-p', '54322', '-U', 'postgres', '-d', 'postgres', '-c', q], { env: process.env }).toString().trim();
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (!existsSync(p) || statSync(p).isDirectory()) p = path.join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': types[path.extname(p)] ?? 'application/octet-stream' }); res.end(readFileSync(p));
}).listen(8082, '127.0.0.1');
const BASE = 'http://127.0.0.1:8082';
const SAMIR = '30000000-0000-0000-0000-000000000001';
const NEW_SIRET = '12345678200010';
let ok = 0, fail = 0;
const check = (c, n, d = '') => { c ? ok++ : fail++; console.log(`${c ? 'OK    ' : 'ÉCHEC '} [ANCIENNE APP, MODE RÉDUIT] ${n}${d ? ' — ' + d : ''}`); };
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const page = await (await browser.newContext({ viewport: { width: 1100, height: 900 } })).newPage(); page.on('dialog', (d) => d.accept());
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(`${BASE}/sign-in`);
  await page.getByLabel('Adresse e-mail').first().fill('commercant@zeroo.test'); await page.getByLabel('Mot de passe', { exact: true }).first().fill(process.env.RECETTE_PASSWORD);
  await page.locator('[data-testid="sign-in-submit"]').click(); await page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 20000 });
  await page.goto(`${BASE}/pro/shop`); await page.locator('[data-testid="payment-link-card"]').first().waitFor({ state: 'visible', timeout: 20000 });
  check((await page.getByText('Lien actif', { exact: true }).count()) > 0, 'boutique : « Lien actif » affiché (le lien de paiement est à nouveau lisible)');
  await page.screenshot({ path: `${SHOTS}/20-mode-reduit-boutique.png`, fullPage: true });
  await page.goto(`${BASE}/pro/info`); await page.locator('[data-testid="merchant-submit"]').first().waitFor({ state: 'visible', timeout: 20000 });
  const siret0 = await page.locator('[data-testid="merchant-siret"]').first().inputValue();
  check(siret0 === '', 'formulaire : SIRET vide (donnée administrative non restaurée dans merchants)');
  const phoneBefore = sql(`select phone from public.merchants where id='${SAMIR}'`);
  // 1) enregistrer sans rien changer : rien n'est perdu
  const adminBefore = sql(`select coalesce(legal_name,'∅'),coalesce(siret,'∅'),coalesce(vat_number,'∅'),coalesce(contact_email,'∅') from public.merchant_private where merchant_id='${SAMIR}'`);
  await page.locator('[data-testid="merchant-submit"]').first().click(); await page.waitForTimeout(2500);
  check(sql(`select coalesce(legal_name,'∅'),coalesce(siret,'∅'),coalesce(vat_number,'∅'),coalesce(contact_email,'∅') from public.merchant_private where merchant_id='${SAMIR}'`) === adminBefore, 'enregistrer sans changement : champs administratifs privés INCHANGÉS');
  check(sql(`select phone from public.merchants where id='${SAMIR}'`) === phoneBefore && phoneBefore !== '', 'enregistrer sans changement : téléphone conservé dans merchants');
  // 2) saisir un SIRET dans l'ancienne application : il doit aller en privé, pas dans merchants
  await page.goto(`${BASE}/pro/info`); await page.locator('[data-testid="merchant-siret"]').first().waitFor({ state: 'visible', timeout: 20000 });
  await page.locator('[data-testid="merchant-siret"]').first().fill(NEW_SIRET);
  await page.locator('[data-testid="merchant-submit"]').first().click(); await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/21-mode-reduit-siret-saisi.png`, fullPage: true });
  check(sql(`select siret from public.merchant_private where merchant_id='${SAMIR}'`) === NEW_SIRET, 'SIRET saisi dans l\'ancienne application : enregistré dans merchant_private');
  check(sql(`select coalesce(siret,'∅') from public.merchants where id='${SAMIR}'`) === '∅', 'SIRET saisi : JAMAIS écrit dans merchants (donc invisible des clients et livreurs)');
  check(errs.length === 0, 'aucune erreur JavaScript', errs.slice(0, 2).join(' | '));
} catch (e) { fail++; console.log('ÉCHEC  exception :', String(e.message).split('\n')[0]); }
finally { await browser.close(); server.close(); }
// Remise en état des données fictives.
sql(`update public.merchant_private set siret='73282932000074' where merchant_id='${SAMIR}'`);
console.log(`# Bilan ancienne application, mode réduit : ${ok} OK, ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
