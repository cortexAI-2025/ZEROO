// Annuaire public : un VISITEUR (sans compte) découvre les établissements. SANS Supabase : l'API est simulée par interception réseau.
// Prérequis : `EXPO_PUBLIC_SUPABASE_URL=https://x.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=x npm run build:web`
// (l'hôte « x » doit correspondre au nom de la clé de session ci-dessous), puis `node e2e/directory-public.mock.e2e.js`.
// Vérifie : depuis l'accueil, sans session, « Découvrir » ouvre l'annuaire (pas de redirection vers la connexion).
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
  await new Promise((r) => server.listen(8098, r));
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1000, height: 1400 },
    permissions: ['geolocation'],
    geolocation: { latitude: 48.8686, longitude: 2.3314 },
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const cors = { 'access-control-allow-origin': '*' };
  await page.route('https://x.supabase.co/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/rpc/nearby_merchants'))
      return route.fulfill({ json: merchants, headers: cors });
    if (url.includes('/auth/v1/')) return route.fulfill({ json: {}, headers: cors });
    return route.fulfill({ json: [], headers: cors });
  });
  await page.route(/tile\.openstreetmap\.org/, (route) => route.abort());
  await page.route(/geopf\.fr/, (route) => route.fulfill({ json: { features: [] } }));

  await page.goto('http://localhost:8098/');
  await page.getByTestId('landing-cta-discover').first().waitFor({ timeout: 20000 });
  await page.getByTestId('landing-cta-discover').first().click();
  await page.getByRole('button', { name: 'Utiliser ma position' }).click({ timeout: 20000 });
  await page.getByTestId('explore-count').waitFor({ timeout: 20000 });
  const count = (await page.getByTestId('explore-count').innerText()).trim();
  const url = page.url();
  const darkText = await page.getByTestId('merchant-cuisine-de-nuit').innerText();
  console.log(
    'URL : ' +
      url +
      '\nrésultats : ' +
      count +
      '\ndark kitchen sans adresse : ' +
      !darkText.includes('1 rue'),
  );
  await browser.close();
  server.close();
  const ok =
    url.includes('/decouvrir') &&
    count.startsWith('4 ') &&
    !darkText.includes('1 rue') &&
    errors.length === 0;
  if (errors.length) console.log('erreurs de page :', errors.slice(0, 3));
  console.log(ok ? 'OK' : 'ÉCHEC');
  process.exit(ok ? 0 : 1);
})();
