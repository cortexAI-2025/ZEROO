// Required registration fields, without a real Auth call, email or account creation.
const http = require('http');
const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..', 'dist');
const server = http.createServer((req, res) => {
  let file = path.join(root, new URL(req.url, 'http://localhost').pathname);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
  const ext = path.extname(file);
  res.setHeader(
    'content-type',
    {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.ttf': 'font/ttf',
      '.png': 'image/png',
    }[ext] || 'application/octet-stream',
  );
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
    args: process.env.CHROMIUM_EXECUTABLE_PATH
      ? [
          '--no-sandbox',
          '--no-zygote',
          '--single-process',
          '--disable-dev-shm-usage',
          '--use-gl=angle',
          '--use-angle=swiftshader',
        ]
      : [],
  });
  try {
    const requests = [];
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*.supabase.co/**', (route) => {
      if (route.request().url().includes('/auth/v1/signup')) {
        requests.push(route.request().postDataJSON());
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: '91000000-0000-4000-8000-000000000001',
            aud: 'authenticated',
            email: 'lea@example.test',
            identities: [],
            app_metadata: { provider: 'email' },
            user_metadata: {},
            created_at: '2026-10-28T12:00:00Z',
          }),
        });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.goto(`http://127.0.0.1:${server.address().port}/sign-up`);
    await page.getByLabel('Prénom *', { exact: true }).waitFor();
    await page.getByTestId('sign-up-submit').click();
    await page.getByText('Indiquez votre prénom.', { exact: true }).waitFor();
    assert.equal(requests.length, 0);
    const fields = [
      ['Prénom *', 'Léa'],
      ['Nom *', 'Dupont'],
      ['Adresse (numéro et rue) *', '12 rue des Lilas'],
      ['Code postal *', '78190'],
      ['Ville *', 'Trappes'],
      ['Numéro de téléphone *', '06 12 34 56 78'],
      ['Adresse e-mail', '  LEA@example.test '],
      ['Mot de passe', 'motdepasse1'],
    ];
    for (const [label, value] of fields) await page.getByLabel(label, { exact: true }).fill(value);
    assert.equal(await page.locator('input[type=file]').count(), 0);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    if (process.env.SIGNUP_SCREENSHOT_PATH)
      await page.screenshot({ path: process.env.SIGNUP_SCREENSHOT_PATH, fullPage: true });
    await page.getByTestId('sign-up-submit').click();
    await page.getByText(/lea@example.test/).waitFor();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].email, 'lea@example.test');
    assert.equal(requests[0].data.contact_phone, '+33612345678');
    assert.equal(requests[0].data.first_name, 'Léa');
    assert.equal(requests[0].data.last_name, 'Dupont');
    assert.equal(requests[0].data.address_line, '12 rue des Lilas');
    assert.equal(requests[0].data.postal_code, '78190');
    assert.equal(requests[0].data.city, 'Trappes');
    assert.equal(requests[0].phone, undefined);
    assert.equal(requests[0].data.avatar_url, undefined);
    assert.deepEqual(errors, []);
    console.log(
      'PASS required signup fields, mobile layout, contact payload, email confirmation and no client avatar',
    );
  } finally {
    await browser.close();
    server.close();
  }
})().catch((error) => {
  console.error(error);
  server.close();
  process.exitCode = 1;
});
