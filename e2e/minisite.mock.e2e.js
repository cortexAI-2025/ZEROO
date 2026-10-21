// Mini-site Pro vs fiche de commande Start, SANS Supabase (API simulée par interception réseau).
// Prérequis : `EXPO_PUBLIC_SUPABASE_URL=https://x.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=x npm run build:web`,
// puis `node e2e/minisite.mock.e2e.js`.
// Vérifie : une fiche Pro montre logo, accroche, présentation, couleur, partage et Happy Hours ;
// la même fiche sans Pro (réglages conservés en base) ne montre que la fiche de commande.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DIST = path.join(__dirname, '..', 'dist');
const mime = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
};
const server = http.createServer((req, res) => {
  let file = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  res.writeHead(200, { 'content-type': mime[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const merchant = (slug, hasMinisite) => ({
  id: slug,
  owner_id: 'o',
  slug,
  name: slug === 'chez-samir' ? 'Chez Samir' : 'Snack Start',
  description: 'Tacos et grillades.',
  category: 'snack',
  phone: null,
  address_line: '12 rue de la Paix',
  postal_code: '75002',
  city: 'Paris',
  latitude: 48.8686,
  longitude: 2.3314,
  timezone: 'Europe/Paris',
  photo_url: null,
  is_published: true,
  is_paused: false,
  paused_until: null,
  delivery_enabled: false,
  delivery_fee_cents: 300,
  delivery_radius_m: 3000,
  offers_pickup: true,
  pickup_instructions: null,
  logo_url: 'https://exemple.test/logo.png',
  tagline: 'Tacos et grillades maison',
  about: 'Depuis 2014, Samir prépare ses recettes sur place.',
  accent_color: 'orange',
  is_open_now: true,
  is_paused_now: false,
  is_accepting_orders: true,
  is_payments_ready: true,
  is_subscription_active: true,
  has_delivery_option: false,
  has_order_mode: true,
  offers_delivery: false,
  delivery_available_now: false,
  has_minisite: hasMinisite,
  merchant_opening_hours: [],
  merchant_closures: [],
});
const menu = [
  {
    id: 'c1',
    merchant_id: 'x',
    name: 'Menus',
    position: 0,
    is_active: true,
    menu_items: [
      {
        id: 'i1',
        merchant_id: 'x',
        category_id: 'c1',
        name: 'Menu Tacos',
        description: null,
        price_cents: 1050,
        image_url: null,
        is_available: true,
        is_formula: false,
        is_in_slot_now: true,
        is_loyalty_menu: false,
        meal_periods: [],
        position: 0,
        menu_item_slots: [],
        menu_option_groups: [],
      },
    ],
  },
];
const offers = [
  {
    happy_hour_id: 'h1',
    name: 'Happy tacos',
    item_id: 'i1',
    regular_cents: 1050,
    promo_cents: 840,
    ends_at: new Date(Date.now() + 3600e3).toISOString(),
    quantity_remaining: null,
  },
];

(async () => {
  await new Promise((r) => server.listen(8097, r));
  const browser = await chromium.launch();
  const errors = [];
  const out = [];
  const check = (label, ok) => {
    out.push(`${ok ? 'ok  ' : 'ÉCHEC'} ${label}`);
    if (!ok) errors.push(label);
  };

  for (const [slug, pro] of [
    ['chez-samir', true],
    ['snack-start', false],
  ]) {
    const page = await (
      await browser.newContext({ viewport: { width: 900, height: 1300 } })
    ).newPage();
    page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
    await page.route('https://x.supabase.co/**', (route) => {
      const url = route.request().url();
      const cors = { 'access-control-allow-origin': '*' };
      if (url.includes('/rpc/active_happy_hours'))
        return route.fulfill({ json: offers, headers: cors });
      if (url.includes('/rest/v1/merchants'))
        return route.fulfill({ json: merchant(slug, pro), headers: cors });
      if (url.includes('/rest/v1/menu_categories'))
        return route.fulfill({ json: menu, headers: cors });
      return route.fulfill({ json: [], headers: cors });
    });
    await page.route(/tile\.openstreetmap\.org|exemple\.test/, (route) => route.abort());
    await page.goto(`http://localhost:8097/m/${slug}`);
    await page.getByText('Menu Tacos').first().waitFor({ timeout: 20000 });
    // Les offres arrivent par une requête distincte : on les attend avant de vérifier.
    await page.getByTestId('active-offers').waitFor({ timeout: 10000 }).catch(() => undefined);
    const has = async (testId) => (await page.getByTestId(testId).count()) > 0;
    const label = pro ? 'Pro' : 'Start (Pro expiré, réglages conservés en base)';
    check(`${label} : commande directe (produit au menu)`, true);
    check(`${label} : Happy Hour en cours affichée`, await has('active-offers'));
    check(`${label} : logo ${pro ? 'visible' : 'masqué'}`, (await has('site-logo')) === pro);
    check(
      `${label} : accroche ${pro ? 'visible' : 'masquée'}`,
      (await has('site-tagline')) === pro,
    );
    check(
      `${label} : présentation ${pro ? 'visible' : 'masquée'}`,
      (await has('site-about')) === pro,
    );
    check(
      `${label} : couleur ${pro ? 'appliquée' : 'non appliquée'}`,
      (await has('site-accent')) === pro,
    );
    check(
      `${label} : partage ${pro ? 'proposé' : 'non proposé'}`,
      (await has('site-share')) === pro,
    );
    check(
      `${label} : carte de situation ${pro ? 'affichée' : 'absente'}`,
      (await page.locator('.leaflet-container').count()) > 0 === pro,
    );
    await page.screenshot({
      path: path.join(require('os').tmpdir(), `minisite-${pro ? 'pro' : 'start'}.png`),
      fullPage: true,
    });
    await page.context().close();
  }
  console.log(out.join('\n'));
  await browser.close();
  server.close();
  if (errors.length) {
    console.error('ÉCHEC :', errors.join(' | '));
    process.exit(1);
  }
})().catch((e) => {
  console.error('ÉCHEC', e.message);
  process.exit(1);
});
