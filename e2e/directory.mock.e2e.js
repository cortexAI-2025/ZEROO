// Test de fumée de l'annuaire (web), SANS Supabase : l'API est simulée par interception réseau.
// Prérequis : `EXPO_PUBLIC_SUPABASE_URL=https://x.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=x npm run build:web`
// (l'hôte « x » doit correspondre au nom de la clé de session ci-dessous), puis `node e2e/directory.mock.e2e.js`.
// Vérifie : filtres, liste / carte, adresse masquée d'une dark kitchen, absence de repère pour elle.
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { chromium } = require('playwright');

const DIST = path.join(__dirname, '..', 'dist');
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
};
const server = http.createServer((req, res) => {
  let file = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const base = {
  distance_m: 400,
  is_open: true,
  is_accepting_orders: true,
  offers_pickup: true,
  offers_delivery: false,
  delivery_available_now: false,
  has_happy_hour_now: false,
  meal_periods: [],
  address_line: '1 rue A',
  city: 'Paris',
};
const merchants = [
  {
    ...base,
    id: '1',
    slug: 'chez-samir',
    name: 'Chez Samir',
    category: 'snack',
    offers_delivery: true,
    delivery_available_now: true,
    has_happy_hour_now: true,
    latitude: 48.8686,
    longitude: 2.3314,
  },
  {
    ...base,
    id: '2',
    slug: 'la-mie-doree',
    name: 'La Mie Dorée',
    category: 'boulangerie',
    meal_periods: ['breakfast', 'lunch'],
    latitude: 48.865,
    longitude: 2.34,
  },
  {
    ...base,
    id: '3',
    slug: 'cuisine-de-nuit',
    name: 'Cuisine de Nuit',
    category: 'dark_kitchen',
    address_line: null,
    offers_pickup: false,
    offers_delivery: true,
    delivery_available_now: true,
    meal_periods: ['night'],
    latitude: null,
    longitude: null,
  },
  {
    ...base,
    id: '4',
    slug: 'ferme',
    name: 'Fermé Snack',
    category: 'snack',
    is_open: false,
    is_accepting_orders: false,
    latitude: 48.87,
    longitude: 2.33,
  },
];

(async () => {
  await new Promise((r) => server.listen(8099, r));
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1000, height: 1400 },
    permissions: ['geolocation'],
    geolocation: { latitude: 48.8686, longitude: 2.3314 },
  });
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 86400;
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: '20000000-0000-0000-0000-000000000001', role: 'authenticated', aud: 'authenticated', exp, email: 'nadia@test.fr' })}.sig`;
  const user = {
    id: '20000000-0000-0000-0000-000000000001',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'nadia@test.fr',
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  };
  const session = {
    access_token: jwt,
    refresh_token: 'r',
    expires_at: exp,
    expires_in: 86400,
    token_type: 'bearer',
    user,
  };
  await context.addInitScript(
    (s) => localStorage.setItem('sb-x-auth-token', JSON.stringify(s)),
    session,
  );
  const page = await context.newPage();
  page.on(
    'console',
    (m) => m.type() === 'error' && console.log('console.error', m.text().slice(0, 200)),
  );
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.route('https://x.supabase.co/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/rpc/nearby_merchants'))
      return route.fulfill({ json: merchants, headers: { 'access-control-allow-origin': '*' } });
    if (url.includes('/auth/v1/user'))
      return route.fulfill({ json: user, headers: { 'access-control-allow-origin': '*' } });
    if (url.includes('/auth/v1/'))
      return route.fulfill({ json: {}, headers: { 'access-control-allow-origin': '*' } });
    return route.fulfill({ json: [], headers: { 'access-control-allow-origin': '*' } });
  });
  await page.route(/tile\.openstreetmap\.org/, (route) => route.abort());
  await page.route(/geopf\.fr/, (route) => route.fulfill({ json: { features: [] } }));

  await page.goto('http://localhost:8099/explore');
  await page.getByText('Que souhaitez-vous faire').waitFor({ timeout: 20000 });
  await page.getByText('Trouver un snack ou un restaurant').click();
  await page.getByText('Utiliser ma position').first().waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: 'Utiliser ma position' }).click({ timeout: 8000 });
  await page.getByTestId('explore-count').waitFor({ timeout: 20000 });
  const count = async () => (await page.getByTestId('explore-count').innerText()).trim();
  const out = [];
  out.push('sans filtre : ' + (await count()));
  await page.getByTestId('filter-delivery').click();
  out.push('livraison disponible : ' + (await count()));
  await page.getByTestId('filter-delivery').click();
  await page.getByTestId('filter-pickup').click();
  out.push('retrait : ' + (await count()));
  await page.getByTestId('filter-pickup').click();
  await page.getByTestId('filter-happy').click();
  out.push('Happy Hour : ' + (await count()));
  await page.getByTestId('filter-happy').click();
  await page.getByTestId('filter-open').click();
  out.push('ouvert maintenant : ' + (await count()));
  await page.getByTestId('filter-open').click();
  await page.getByTestId('filter-period-night').click();
  out.push('repas de nuit : ' + (await count()));
  await page.getByTestId('filter-period-night').click();
  await page.getByTestId('filter-category-dark_kitchen').click();
  out.push('dark kitchen : ' + (await count()));
  const darkText = await page.getByTestId('merchant-cuisine-de-nuit').innerText();
  out.push(
    'carte dark kitchen contient « 1 rue » : ' +
      darkText.includes('1 rue') +
      ' ; « Livraison uniquement » : ' +
      darkText.includes('Livraison uniquement'),
  );
  await page.getByTestId('filter-category-dark_kitchen').click();

  await page.getByTestId('view-map').click();
  await page.waitForSelector('.leaflet-container', { timeout: 10000 });
  await page.waitForSelector('path.leaflet-interactive', { timeout: 10000 });
  const markers = await page.locator('path.leaflet-interactive').count();
  out.push(
    'repères sur la carte : ' +
      markers +
      ' (4 établissements dont 1 dark kitchen sans position → 3 attendus)',
  );
  await page.locator('path.leaflet-interactive').first().click({ force: true });
  await page.screenshot({ path: path.join(os.tmpdir(), 'directory-map.png') });
  await page.getByTestId('view-list').click();
  await page.screenshot({ path: path.join(os.tmpdir(), 'directory-list.png') });

  console.log(out.join('\n'));
  const expected = [
    'sans filtre : 4 ',
    'livraison disponible : 2 ',
    'retrait : 3 ',
    'Happy Hour : 1 ',
    'ouvert maintenant : 3 ',
    'repas de nuit : 1 ',
    'dark kitchen : 1 ',
    'carte dark kitchen contient « 1 rue » : false ; « Livraison uniquement » : true',
    'repères sur la carte : 3 ',
  ];
  const missing = expected.filter((e) => !out.some((line) => line.startsWith(e)));
  if (missing.length || errors.length)
    throw new Error(
      'attendu non trouvé : ' + missing.join(' | ') + ' ; erreurs : ' + errors.join(' | '),
    );
  console.log('erreurs de page :', errors.length ? errors.join(' | ') : 'aucune');
  await browser.close();
  server.close();
})().catch((e) => {
  console.error('ÉCHEC', e.message);
  process.exit(1);
});
