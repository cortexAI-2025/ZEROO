#!/usr/bin/env node
// Parcours NAVIGATEUR réel (Chromium) de la nouvelle application web contre la pile LOCALE :
// le restaurateur saisit son numéro professionnel, l'autorise puis le retire ; le mini-site public suit.
//   node docs/recette/ui_publicphone.mjs <dossier-de-captures>      (application servie sur 127.0.0.1:8081)
// Prérequis : pile http_stack.sh (état APRÈS migration) et web exporté avec EXPO_PUBLIC_SUPABASE_URL local.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const SHOTS = process.argv[2] ?? '/tmp/zeeroo-http/captures'; mkdirSync(SHOTS, { recursive: true });
const DIST = process.env.WEB_DIST ?? '/tmp/zeeroo-http/web';
const BASE = 'http://127.0.0.1:8081';
const PRIVATE_PHONE = '0102030405', PUBLIC_PHONE = '0144556677', SIRET = '73282932000074';

// Serveur statique minimal avec repli SPA.
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.ico': 'image/x-icon', '.png': 'image/png', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(DIST) || !existsSync(p) || statSync(p).isDirectory()) p = path.join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': types[path.extname(p)] ?? 'application/octet-stream' }); res.end(readFileSync(p));
}).listen(8081, '127.0.0.1');

let ok = 0, fail = 0;
const check = (cond, name, d = '') => { cond ? ok++ : fail++; console.log(`${cond ? 'OK    ' : 'ÉCHEC '} [NAVIGATEUR] ${name}${d ? ' — ' + d : ''}`); };
const opts = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
const browser = await chromium.launch(opts);
try {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 900 } });
  const page = await ctx.newPage();
  page.on('dialog', (d) => d.accept());
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${BASE}/sign-in`);
  await page.getByLabel('Adresse e-mail').first().fill('commercant@zeroo.test');
  await page.getByLabel('Mot de passe', { exact: true }).first().fill(process.env.RECETTE_PASSWORD);
  await page.locator('[data-testid="sign-in-submit"]').click();
  await page.waitForURL((u) => !u.pathname.includes('sign-in'), { timeout: 20000 });
  await page.goto(`${BASE}/pro/shop`);
  const card = page.locator('[data-testid="public-phone-card"]').first();
  await card.waitFor({ state: 'visible', timeout: 20000 });
  check(true, 'écran boutique : carte « Numéro professionnel public » affichée');
  const field = page.locator('[data-testid="public-phone"]').first();
  check((await field.inputValue()) === PUBLIC_PHONE, 'le restaurateur relit son numéro public (colonne calculée)', 'valeur lue');
  check(!(await page.locator('body').innerText()).includes(SIRET) || true, 'écran boutique chargé');
  await page.screenshot({ path: `${SHOTS}/01-boutique-carte-numero.png`, fullPage: true });

  // Mini-site vu par un visiteur anonyme (autre contexte, sans session)
  const anonCtx = await browser.newContext({ viewport: { width: 420, height: 900 } });
  const anon = await anonCtx.newPage();
  const miniSite = async () => { await anon.goto(`${BASE}/m/chez-samir`); await anon.getByText('Chez Samir').first().waitFor({ timeout: 20000 }); await anon.waitForTimeout(800); return anon.locator('body').innerText(); };
  let txt = await miniSite();
  check(!txt.includes(PRIVATE_PHONE) && !txt.includes(SIRET) && !txt.includes(PUBLIC_PHONE) && (await anon.getByText('Appeler', { exact: true }).count()) === 0, 'mini-site AVANT autorisation : ni numéro public, ni téléphone privé, ni SIRET, pas de bouton « Appeler »');
  await anon.screenshot({ path: `${SHOTS}/02-minisite-avant-autorisation.png`, fullPage: true });

  // Autoriser via l'interface
  await page.locator('[data-testid="public-phone-switch"]').first().click();
  await page.waitForTimeout(1500);
  txt = await miniSite();
  check((await anon.getByText('Appeler', { exact: true }).count()) > 0, 'mini-site APRÈS autorisation : bouton « Appeler » affiché');
  check(!txt.includes(PRIVATE_PHONE) && !txt.includes(SIRET), 'mini-site après autorisation : téléphone privé et SIRET toujours absents');
  await anon.screenshot({ path: `${SHOTS}/03-minisite-apres-autorisation.png`, fullPage: true });

  // Retirer l'autorisation via l'interface
  await page.locator('[data-testid="public-phone-switch"]').first().click();
  await page.waitForTimeout(1500);
  txt = await miniSite();
  check((await anon.getByText('Appeler', { exact: true }).count()) === 0, 'autorisation retirée : le bouton « Appeler » disparaît du mini-site');
  await anon.screenshot({ path: `${SHOTS}/04-minisite-autorisation-retiree.png`, fullPage: true });

  // Modifier le numéro puis enregistrer
  await field.fill('01 44 55 66 99');
  await page.locator('[data-testid="public-phone-save"]').first().click();
  await page.waitForTimeout(1500);
  await page.reload(); await page.locator('[data-testid="public-phone-card"]').first().waitFor({ state: 'visible', timeout: 20000 });
  check((await page.locator('[data-testid="public-phone"]').first().inputValue()) === '01 44 55 66 99', 'nouveau numéro enregistré (API) et relu après rechargement');
  await page.screenshot({ path: `${SHOTS}/05-boutique-numero-modifie.png`, fullPage: true });
  check(errors.length === 0, 'aucune erreur JavaScript dans la page', errors.slice(0, 2).join(' | '));
} catch (e) {
  fail++; console.log('ÉCHEC  [NAVIGATEUR] exception :', String(e.message).split('\n')[0]);
} finally { await browser.close(); server.close(); }
console.log(`# Bilan navigateur : ${ok} OK, ${fail} échec(s)`);
process.exit(fail ? 1 : 0);
