// Précommande et commande groupée dans le panier, SANS Supabase (API simulée par interception réseau).
// Prérequis : `EXPO_PUBLIC_SUPABASE_URL=https://x.supabase.co EXPO_PUBLIC_SUPABASE_ANON_KEY=x npm run build:web`,
// puis `node e2e/schedule.mock.e2e.js`.
// Vérifie : « Dès que possible » par défaut, créneaux de 15 min pendant les horaires, résumé de la
// commande programmée, commande groupée proposée seulement si l'établissement l'accepte.
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

const settings = (group) => ({
  delivery_enabled: false,
  delivery_fee_cents: 300,
  accepts_cash_pickup: false,
  payment_link: 'https://pay.exemple.test/x',
  offers_pickup: true,
  offers_delivery: false,
  delivery_available_now: false,
  has_order_mode: true,
  default_prep_minutes: 15,
  timezone: 'Europe/Paris',
  group_orders_enabled: group,
  group_min_lead_hours: 24,
  group_min_headcount: 5,
  group_min_total_cents: 0,
});
const hours = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
  weekday,
  opens_at: '11:00:00',
  closes_at: '23:00:00',
}));
// Horloge figée à 08:00 UTC (9 h ou 10 h à Paris), avant l'ouverture de 11 h : le nombre de créneaux du
// premier jour ne dépend plus de l'heure à laquelle le test est lancé (la CI tournait à 21 h 35 à
// Paris : il ne restait que 3 créneaux avant la fermeture de 23 h et le test échouait à tort).
const NOW = new Date();
NOW.setUTCHours(8, 0, 0, 0);
const cart = (slug) => ({
  state: {
    merchant: { id: slug, slug, name: 'Chez Samir' },
    lines: [
      {
        key: 'i1',
        itemId: 'i1',
        name: 'Menu Tacos',
        unitPriceCents: 1050,
        quantity: 1,
        options: [],
        isLoyaltyMenu: false,
        basePriceCents: 1050,
      },
    ],
    note: '',
    rewardLineKey: null,
    fulfillment: 'pickup',
    deliveryAddress: null,
    deliveryPhone: '',
    deliveryInstructions: '',
    scheduledFor: null,
    group: null,
  },
  version: 0,
});

(async () => {
  await new Promise((r) => server.listen(8096, r));
  const browser = await chromium.launch();
  const errors = [];
  const out = [];
  const check = (label, ok) => {
    out.push(`${ok ? 'ok  ' : 'ÉCHEC'} ${label}`);
    if (!ok) errors.push(label);
  };

  for (const [slug, group] of [
    ['chez-samir', true],
    ['snack-simple', false],
  ]) {
    const context = await browser.newContext({ viewport: { width: 900, height: 1500 } });
    await context.clock.setFixedTime(NOW);
    await context.addInitScript(
      (c) => localStorage.setItem('zeroo.cart', JSON.stringify(c)),
      cart(slug),
    );
    const page = await context.newPage();
    page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
    const cors = { 'access-control-allow-origin': '*' };
    await page.route('https://x.supabase.co/**', (route) => {
      const url = route.request().url();
      if (url.includes('/rest/v1/merchant_opening_hours'))
        return route.fulfill({ json: hours, headers: cors });
      if (url.includes('/rest/v1/merchants'))
        return route.fulfill({ json: settings(group), headers: cors });
      if (url.includes('/auth/v1/')) return route.fulfill({ json: {}, headers: cors });
      return route.fulfill({ json: [], headers: cors });
    });
    await page.goto('http://localhost:8096/cart');
    await page.getByTestId('schedule').waitFor({ timeout: 20000 });
    check(
      `${slug} : « Dès que possible » par défaut`,
      await page
        .getByText("L'établissement prépare votre commande dès qu'il l'accepte.")
        .isVisible(),
    );
    await page.getByTestId('schedule-later').click();
    await page.locator('[data-testid^="schedule-time-"]').first().waitFor({ timeout: 10000 });
    const times = await page.locator('[data-testid^="schedule-time-"]').count();
    check(`${slug} : créneaux de 15 minutes proposés (${times})`, times >= 4);
    const first = await page
      .locator('[data-testid^="schedule-time-"]')
      .first()
      .getAttribute('data-testid');
    const minutes = Number(first.slice(-2));
    check(`${slug} : un créneau tombe sur un quart d'heure (${first})`, minutes % 15 === 0);
    await page.locator('[data-testid^="schedule-time-"]').nth(1).click();
    await page.getByTestId('cart-scheduled').waitFor({ timeout: 5000 });
    check(
      `${slug} : résumé de la commande programmée`,
      (await page.getByTestId('cart-scheduled').innerText()).includes('Commande programmée'),
    );
    const toggle = await page.getByTestId('group-toggle').count();
    check(
      `${slug} : commande groupée ${group ? 'proposée' : 'absente'}`,
      group ? toggle === 1 : toggle === 0,
    );
    if (group) {
      await page.getByTestId('group-toggle').click();
      await page.getByTestId('group-company').waitFor({ timeout: 5000 });
      check(
        `${slug} : nom d'entreprise et convives demandés`,
        (await page.getByTestId('group-headcount').count()) === 1,
      );
      const day = await page
        .locator('[data-testid^="schedule-day-"]')
        .first()
        .getAttribute('data-testid');
      check(
        `${slug} : délai de 24 h respecté (premier jour ${day.slice(-10)})`,
        new Date(day.slice(-10) + 'T23:59:00').getTime() >= NOW.getTime() + 23 * 3600e3,
      );
    }
    await page.screenshot({ path: `/tmp/schedule-${slug}.png` });
    await context.close();
  }
  await browser.close();
  server.close();
  console.log(out.join('\n'));
  if (errors.length) {
    console.log('ÉCHECS :', errors.join(' | '));
    process.exit(1);
  }
  console.log('OK');
})();
