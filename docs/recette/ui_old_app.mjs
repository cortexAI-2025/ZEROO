#!/usr/bin/env node
// Compatibilité de l'ANCIENNE application (build de la branche précédente, servie sur 127.0.0.1:8082) contre la base
// DÉJÀ MIGRÉE : que voit et que fait un restaurateur qui n'a pas rechargé son application pendant la bascule ?
//   node docs/recette/ui_old_app.mjs [dossier-de-captures]     (pile locale en état APRÈS migration)
// Les constats sont des OBSERVATIONS documentées (pas des succès) : elles fondent la procédure de déploiement.
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
const SAMIR = "30000000-0000-0000-0000-000000000001";
const snap = () => sql(`select coalesce(legal_name,'∅'),coalesce(siret,'∅'),coalesce(vat_number,'∅'),coalesce(contact_email,'∅'),coalesce(phone,'∅'),coalesce(payment_link,'∅') from public.merchant_private where merchant_id='${SAMIR}'`);
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const before = snap(); console.log(`# État base avant le parcours : ${before}`);
try {
  const anonPage = await (await browser.newContext()).newPage(); const errs = []; anonPage.on('pageerror', (e) => errs.push(e.message));
  await anonPage.goto(`${BASE}/m/chez-samir`); await anonPage.getByText('Chez Samir').first().waitFor({ timeout: 20000 });
  console.log(`OBSERVATION [ANCIENNE APP] mini-site public : se charge (fiche « Chez Samir » affichée), erreurs JS : ${errs.length}`);
  await anonPage.screenshot({ path: `${SHOTS}/10-ancienne-app-minisite.png`, fullPage: true });

  const page = await (await browser.newContext({ viewport: { width: 1100, height: 900 } })).newPage(); page.on('dialog', (d) => d.accept());
  await page.goto(`${BASE}/sign-in`);
  await page.getByLabel('Adresse e-mail').first().fill('commercant@zeroo.test'); await page.getByLabel('Mot de passe', { exact: true }).first().fill(process.env.RECETTE_PASSWORD);
  await page.locator('[data-testid="sign-in-submit"]').click(); await page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 20000 });
  await page.goto(`${BASE}/pro/shop`); await page.locator('[data-testid="payment-link-card"]').first().waitFor({ state: 'visible', timeout: 20000 });
  const hasActive = (await page.getByText('Lien actif', { exact: true }).count()) > 0;
  console.log(`OBSERVATION [ANCIENNE APP] écran boutique du restaurateur : badge « Lien actif » ${hasActive ? 'affiché' : 'ABSENT (le lien de paiement n\'est plus lisible par l\'ancienne application)'}`);
  await page.screenshot({ path: `${SHOTS}/11-ancienne-app-boutique.png`, fullPage: true });

  await page.goto(`${BASE}/pro/info`); await page.locator('[data-testid="merchant-submit"]').first().waitFor({ state: 'visible', timeout: 20000 });
  const siretField = await page.locator('[data-testid="merchant-siret"]').first().inputValue();
  console.log(`OBSERVATION [ANCIENNE APP] formulaire « informations » : champ SIRET pré-rempli = « ${siretField} »`);
  await page.locator('[data-testid="merchant-submit"]').first().click(); await page.waitForTimeout(2500);
  await page.screenshot({ path: `${SHOTS}/12-ancienne-app-enregistrement.png`, fullPage: true });
} finally { await browser.close(); server.close(); }
const after = snap();
console.log(`# État base après « Enregistrer » dans l'ancienne application : ${after}`);
if (after === before) console.log('RÉSULTAT : valeurs privées INCHANGÉES après enregistrement par l\'ancienne application.');
else console.log('RÉSULTAT : ⚠ RISQUE DE PERTE DE DONNÉES — l\'ancienne application a modifié/effacé des valeurs privées en enregistrant la fiche.');
// Remise en état de la pile (données fictives de recette).
sql(`update public.merchant_private set legal_name='Samir Food Recette SAS', siret='73282932000074', vat_number='FR32732829320', contact_email='contact-recette@example.test', phone='0102030405', payment_link='https://pay.example.test/recette-samir' where merchant_id='${SAMIR}'`);
process.exit(0);
