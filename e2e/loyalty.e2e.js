// Fidélité de bout en bout : carte, menu offert dans le panier, décompte à la remise,
// commande offerte à 0 €, menu rendu en cas de refus. Client et commerçant en parallèle.
const { BASE, connectEvent, launch, run, sql, step, visible } = require('./helpers');

const SAMIR = '30000000-0000-0000-0000-000000000001';
const NADIA = '20000000-0000-0000-0000-000000000001';
const card = () =>
  sql(
    `select paid_menus_count || '/' || rewards_available from loyalty_cards where user_id = '${NADIA}' and merchant_id = '${SAMIR}'`,
  );

run('Fidélité', async () => {
  sql(`delete from merchant_opening_hours where merchant_id = '${SAMIR}'`);
  sql(
    `insert into merchant_opening_hours (merchant_id, weekday, opens_at, closes_at) select '${SAMIR}', d, t.o, t.c from generate_series(1,7) d, (values ('00:00'::time,'12:00'::time),('12:00'::time,'00:00'::time)) t(o,c)`,
  );
  sql(`update merchants set is_paused = false where id = '${SAMIR}'`);
  sql(
    `update orders set status = 'refused' where status in ('pending_payment','placed','accepted','preparing','ready')`,
  );
  sql(
    `insert into loyalty_cards (user_id, merchant_id, paid_menus_count, rewards_available) values ('${NADIA}', '${SAMIR}', 7, 1) on conflict (user_id, merchant_id) do update set paid_menus_count = 7, rewards_available = 1`,
  );

  const browser = await launch();
  const v = visible;
  const text = (p, s, o) => v(p.getByText(s, o));
  const signIn = async (p, email) => {
    await p.goto(BASE + '/sign-in');
    await v(p.getByLabel('Adresse e-mail')).fill(email);
    await v(p.getByLabel('Mot de passe')).fill('motdepasse1');
    await v(p.getByTestId('sign-in-submit')).click();
  };

  const page = await (
    await browser.newContext({ viewport: { width: 420, height: 900 } })
  ).newPage();
  page.on('pageerror', (e) => console.log('PAGE ERROR (client)', e.message));
  page.on('dialog', (d) => d.accept());
  // Page Stripe Checkout simulée : paiement autorisé puis retour vers l'app.
  let checkoutVisits = 0;
  await page.route(/https:\/\/checkout\.stripe\.com\/.*/, async (route) => {
    checkoutVisits += 1;
    const orderId = sql(
      `select id from orders where customer_id = '${NADIA}' order by created_at desc limit 1`,
    );
    await connectEvent('payment_intent.amount_capturable_updated', {
      id: `pi_loyalty_${Date.now()}`,
      object: 'payment_intent',
      amount_capturable: 100000,
      metadata: { order_id: orderId },
    });
    return route.fulfill({ status: 302, headers: { location: `${BASE}/order/${orderId}?paid=1` } });
  });

  await signIn(page, 'client@zeroo.test');
  await page.getByTestId('choose-space-client').click();
  await v(page.getByRole('tab', { name: /Fidélité/ })).click();
  const samirCard = v(page.getByTestId('loyalty-chez-samir'));
  await samirCard.getByText('7/9 menus', { exact: false }).waitFor();
  await samirCard.getByText('1 menu formule offert à utiliser', { exact: false }).waitFor();
  step('onglet Fidélité : 7/9 menus et 1 menu offert chez Chez Samir');

  await samirCard.click();
  await v(page.getByTestId('merchant-loyalty')).getByText('Ma carte chez Chez Samir').waitFor();
  await v(page.getByTestId('menu-item-Kebab')).click();
  await v(page.getByRole('radio', { name: 'Blanche' })).click();
  await v(page.getByTestId('item-add')).click();
  await v(page.getByTestId('cart-bar')).click();
  await v(page.getByTestId('cart-reward')).getByText('Ajoutez un menu formule').waitFor();
  if (await v(page.getByTestId('use-reward-Kebab')).count())
    throw new Error('le kebab (détail) ne doit pas pouvoir être offert');
  step('produit au détail : non éligible au menu offert');

  await v(page.getByText('Continuer mes achats')).click();
  await v(page.getByTestId('menu-item-Menu Américain')).click();
  await v(page.getByLabel('Quantité +')).click();
  await v(page.getByTestId('item-add')).click();
  await v(page.getByTestId('cart-bar')).click();
  await v(page.getByTestId('use-reward-Menu Américain')).click();
  await text(page, '− 9,50 €').waitFor();
  await v(page.getByTestId('cart-total')).getByText('17,00 €').waitFor();
  step('menu formule offert dans le panier : 7,50 + 2 × 9,50 − 9,50 = 17,00 €');

  await v(page.getByTestId('place-order')).click();
  await text(page, 'En attente de confirmation par le commerçant').waitFor();
  await v(page.getByTestId('order-discount')).getByText('− 9,50 €').waitFor();
  const code = (await v(page.getByTestId('pickup-code')).innerText()).trim();
  if (card() !== '7/0') throw new Error('menu offert non réservé : ' + card());
  step(`commande ${code} payée 17,00 € ; menu offert réservé (carte 7/9, 0 disponible)`);

  // Commerçant
  const mp = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  await signIn(mp, 'commercant@zeroo.test');
  await mp.getByTestId('choose-space-merchant').click();
  const orderCard = v(mp.getByTestId(`order-${code}`));
  await orderCard.getByText('🎁 Offert (fidélité)').waitFor();
  await orderCard.getByText('Menu offert : − 9,50 €').waitFor();
  await orderCard.getByText('Accepter', { exact: false }).click();
  await v(mp.getByTestId(`ready-${code}`)).click();
  await orderCard.getByLabel('Code de retrait du client').fill(code);
  await v(mp.getByTestId(`handover-${code}`)).click();
  await v(page.getByTestId('loyalty-earned'))
    .getByText('+1 menu formule ajouté à votre carte')
    .waitFor({ timeout: 10000 });
  if (card() !== '8/0') throw new Error('décompte : ' + card());
  step(
    'commerçant : ligne « Offert (fidélité) » ; remise → +1 (le menu offert et le kebab ne comptent pas), carte 8/9',
  );

  // Commande entièrement offerte, puis refusée : le menu revient sur la carte.
  sql(
    `update loyalty_cards set rewards_available = 1 where user_id = '${NADIA}' and merchant_id = '${SAMIR}'`,
  );
  const visitsBefore = checkoutVisits;
  await page.goto(BASE + '/m/chez-samir');
  await v(page.getByTestId('menu-item-Menu Américain')).click();
  await v(page.getByTestId('item-add')).click();
  await v(page.getByTestId('cart-bar')).click();
  await v(page.getByTestId('use-reward-Menu Américain')).click();
  await v(page.getByTestId('cart-total')).getByText('0,00 €').waitFor();
  await text(page, 'Commande offerte : aucun paiement.').waitFor();
  await v(page.getByTestId('place-order')).getByText('Commander mon menu offert').click();
  await text(page, 'En attente de confirmation par le commerçant').waitFor();
  if (checkoutVisits !== visitsBefore)
    throw new Error('une commande offerte ne doit pas passer par Stripe');
  const freeCode = (await v(page.getByTestId('pickup-code')).innerText()).trim();
  step(`commande offerte ${freeCode} à 0 € : envoyée au commerçant sans paiement Stripe`);

  const freeCard = v(mp.getByTestId(`order-${freeCode}`));
  await freeCard.getByText('Refuser').click();
  await freeCard.getByText('Produit en rupture').click();
  await page.goto(BASE + '/loyalty');
  await v(page.getByTestId('loyalty-chez-samir'))
    .getByText('1 menu formule offert à utiliser', { exact: false })
    .waitFor();
  if (card() !== '8/1') throw new Error('menu non rendu : ' + card());
  step('commande offerte refusée : le menu offert est rendu sur la carte');

  // Libellé côté commerçant
  await v(mp.getByRole('tab', { name: /Menu/ })).click();
  await v(mp.getByText('Menu Tacos')).first().click();
  await v(mp.getByText('Menu formule (compte pour la fidélité)')).waitFor();
  step('fiche produit commerçant : case « Menu formule (compte pour la fidélité) »');

  await browser.close();
});
