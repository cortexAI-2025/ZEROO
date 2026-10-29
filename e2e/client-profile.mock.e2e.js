// Profile read/edit and pending email change, with all Supabase calls mocked.
const http = require('http'),
  fs = require('fs'),
  path = require('path'),
  assert = require('node:assert/strict');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..', 'dist');
const server = http.createServer((req, res) => {
  let file = path.join(root, new URL(req.url, 'http://localhost').pathname);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(root, 'index.html');
  res.setHeader(
    'content-type',
    {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.ttf': 'font/ttf',
      '.png': 'image/png',
    }[path.extname(file)] || 'application/octet-stream',
  );
  fs.createReadStream(file).pipe(res);
});
(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
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
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const user = {
      id: '91020000-0000-4000-8000-000000000001',
      aud: 'authenticated',
      email: 'lea@example.test',
      email_confirmed_at: '2026-10-28T10:00:00Z',
      app_metadata: { provider: 'email' },
      user_metadata: {},
      created_at: '2026-10-28T10:00:00Z',
    };
    let profile = {
      id: user.id,
      account_space: 'client',
      first_name: 'Léa',
      last_name: 'Dupont',
      display_name: 'Léa Dupont',
      address_line: '12 rue des Lilas',
      postal_code: '78190',
      city: 'Trappes',
      phone: '+33612345678',
    };
    const calls = [];
    let failSave = false;
    await page.route('**/*.supabase.co/**', (route) => {
      const url = route.request().url();
      const method = route.request().method();
      const reply = (data, status = 200) =>
        route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
      if (url.includes('/auth/v1/token')) {
        const b64 = (x) => Buffer.from(JSON.stringify(x)).toString('base64url');
        return reply({
          access_token:
            b64({ alg: 'HS256', typ: 'JWT' }) +
            '.' +
            b64({
              sub: user.id,
              exp: Math.floor(Date.now() / 1000) + 3600,
              aud: 'authenticated',
              role: 'authenticated',
            }) +
            '.fixture',
          refresh_token: 'fixture-refresh',
          token_type: 'bearer',
          expires_in: 3600,
          user,
        });
      }
      if (url.includes('/auth/v1/user') && method === 'PUT') {
        calls.push({ email: route.request().postDataJSON() });
        user.new_email = route.request().postDataJSON().email;
        return reply(user);
      }
      if (url.includes('/auth/v1/user')) return reply(user);
      if (url.includes('/rpc/get_my_account_space')) return reply('client');
      if (url.includes('/rpc/is_platform_admin')) return reply(false);
      if (url.includes('/rpc/update_client_profile')) {
        const data = route.request().postDataJSON();
        calls.push(data);
        if (failSave) return reply({ message: 'Service indisponible', code: 'XX000' }, 500);
        profile = {
          ...profile,
          ...data.p_profile,
          display_name: data.p_profile.first_name + ' ' + data.p_profile.last_name,
        };
        return reply(null);
      }
      if (url.includes('/rest/v1/profiles')) return reply(profile);
      return reply([]);
    });
    const base = process.env.PROFILE_TEST_BASE_URL || `http://127.0.0.1:${server.address().port}`;
    if (process.env.PROFILE_TEST_BASE_URL)
      await page.route(base + '/**', async (route) => {
        const r = await fetch(route.request().url());
        await route.fulfill({
          status: r.status,
          contentType: r.headers.get('content-type') || 'application/octet-stream',
          body: Buffer.from(await r.arrayBuffer()),
        });
      });
    await page.goto(base + '/sign-in');
    await page.getByLabel('Adresse e-mail', { exact: true }).fill(user.email);
    await page.getByLabel('Mot de passe', { exact: true }).fill('fixture-pass1');
    await page.getByTestId('sign-in-submit').click();
    await page.waitForURL(/explore/);
    await page.goto(base + '/account');
    const card = page.getByTestId('client-profile');
    await card.getByText('Léa', { exact: false }).waitFor();
    assert.match(await card.innerText(), /12 rue des Lilas/);
    assert.equal(await card.locator('input').count(), 0);
    assert.equal(await page.locator('input[type=file]').count(), 0);
    await page.getByTestId('client-profile-edit').click();
    await page.getByLabel('Prénom *', { exact: true }).fill('Annulé');
    await card.getByText('Annuler', { exact: true }).click();
    assert.match(await card.innerText(), /Léa/);
    assert.equal(calls.length, 0);
    await page.getByTestId('client-profile-edit').click();
    await page.getByLabel('Nom *', { exact: true }).fill('');
    await page.getByTestId('client-profile-save').click();
    await page.getByText('Indiquez votre nom.', { exact: true }).waitFor();
    assert.equal(calls.length, 0);
    await page.getByLabel('Nom *', { exact: true }).fill('Martin');
    await page.getByLabel('Adresse (numéro et rue) *', { exact: true }).fill('8 avenue de la Gare');
    await page.getByLabel('Numéro de téléphone *', { exact: true }).fill('07 11 22 33 44');
    failSave = true;
    await page.getByTestId('client-profile-save').click();
    await card.getByRole('alert').waitFor();
    assert.equal(await card.locator('input').count(), 6);
    failSave = false;
    await page.getByTestId('client-profile-save').click();
    await card.getByText('Informations enregistrées.', { exact: true }).waitFor();
    assert.equal(await card.locator('input').count(), 0);
    assert.match(await card.innerText(), /Martin/);
    assert.match(await card.innerText(), /8 avenue de la Gare/);
    assert.equal(calls.at(-1).p_profile.phone, '+33711223344');
    await page.reload();
    await page.getByTestId('client-profile-edit').waitFor();
    assert.match(await card.innerText(), /Martin/);
    if (process.env.PROFILE_SCREENSHOT_PATH)
      await page.screenshot({ path: process.env.PROFILE_SCREENSHOT_PATH, fullPage: true });
    await page.getByTestId('client-email-edit').click();
    await page.getByLabel('Nouvelle adresse e-mail', { exact: true }).fill('new@example.test');
    await page.getByTestId('client-email-submit').click();
    await page.getByText(/Changement en attente pour new@example.test/).waitFor();
    assert.equal(user.email, 'lea@example.test');
    assert.equal(calls.at(-1).email.email, 'new@example.test');
    assert.deepEqual(errors, []);
    console.log(
      'PASS client profile details, cancel, required fields, failed save, persistence, no avatar and pending email confirmation',
    );
  } finally {
    await browser.close();
    server.close();
  }
})().catch((e) => {
  console.error(e);
  server.close();
  process.exitCode = 1;
});
