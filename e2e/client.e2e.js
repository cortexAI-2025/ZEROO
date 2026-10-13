const { connectEvent, BASE, launch, run, sql, step, visible, webhook } = require('./helpers');
const SAMIR = '30000000-0000-0000-0000-000000000001';

run('Espace client', async () => {
  // Ouverture 24 h/24 pour un test indépendant de l'heure ; pas de commande en cours.
  sql(`delete from merchant_opening_hours where merchant_id = '${SAMIR}'`);
  sql(
    `insert into merchant_opening_hours (merchant_id, weekday, opens_at, closes_at) select '${SAMIR}', d, t.o, t.c from generate_series(1,7) d, (values ('00:00'::time,'12:00'::time),('12:00'::time,'00:00'::time)) t(o,c)`,
  );
  sql(
    `update merchants set is_paused = false, paused_until = null, is_published = true where id = '${SAMIR}'`,
  );
  sql(
    `update orders set status = 'refused' where status in ('placed','accepted','preparing','ready')`,
  );

  const browser = await launch();
  const clientCtx = await browser.newContext({
    viewport: { width: 420, height: 900 },
    geolocation: { latitude: 48.87, longitude: 2.33 },
    permissions: [],
  });
  const page = await clientCtx.newPage();
  page.on('pageerror', (e) => console.log('PAGE ERROR (client)', e.message));
  page.on('dialog', (d) => d.accept());
  const v = visible;
  const text = (p, s, o) => v(p.getByText(s, o));
  const signIn = async (p, email) => {
    await v(p.getByLabel('Adresse e-mail')).fill(email);
    await v(p.getByLabel('Mot de passe')).fill('motdepasse1');
    await v(p.getByTestId('sign-in-submit')).click();
  };

  // --- Visiteur sans compte, arrivé par le QR code -------------------------
  await page.goto(BASE + '/m/chez-samir');
  await text(page, 'Tacos 2 viandes, frites et boisson').waitFor();
  step('visiteur sans compte : fiche et menu du commerce (lien du QR code)');

  await v(page.getByTestId('menu-item-Kebab')).click();
  await v(page.getByTestId('item-add')).click();
  await text(page, 'Choisissez : Sauce').waitFor();
  await v(page.getByRole('radio', { name: 'Blanche' })).click();
  await v(page.getByRole('radio', { name: 'Harissa' })).click(); // choix unique : remplace Blanche
  await v(page.getByLabel('Quantité +')).click();
  await text(page, 'Ajouter · 15,00 €').waitFor();
  await v(page.getByTestId('item-add')).click();

  await v(page.getByTestId('menu-item-Menu Tacos')).click();
  await v(page.getByRole('checkbox', { name: 'Algérienne' })).click();
  await v(page.getByRole('checkbox', { name: 'Samouraï' })).click();
  await v(page.getByRole('checkbox', { name: 'Blanche' })).click(); // max 2 : ignorée
  await v(page.getByRole('checkbox', { name: 'Cheddar' })).click();
  await text(page, 'Ajouter · 11,50 €').waitFor();
  await v(page.getByTestId('item-add')).click();
  await text(page, 'Voir le panier (3) · 26,50 €').waitFor();
  step(
    'options : sauce obligatoire, choix unique, maximum respecté, supplément payant ; panier 26,50 €',
  );

  await v(page.getByTestId('cart-bar')).click();
  await text(page, 'Harissa').waitFor();
  await text(page, 'Algérienne, Samouraï, Cheddar').waitFor();
  await v(page.getByLabel('Kebab -')).click();
  await text(page, '19,00 €').first().waitFor();
  await text(page, 'Se connecter pour commander').click();
  await signIn(page, 'client@zeroo.test');
  await v(page.getByTestId('place-order')).waitFor();
  if (!page.url().endsWith('/cart')) throw new Error('retour au panier attendu : ' + page.url());
  step('connexion demandée au moment de commander, puis retour direct au panier conservé');

  // --- Commande ------------------------------------------------------------
  await v(page.getByLabel('Une précision pour le commerçant ? (facultatif)')).fill(
    'Bien chaud svp',
  );
  // Page Stripe Checkout simulée : 1er passage, le client abandonne ; 2e passage, il paie
  // (Stripe envoie alors le webhook d'autorisation puis renvoie vers l'app).
  let checkoutVisits = 0;
  const latestOrder = () =>
    sql(
      `select id from orders where customer_id = '20000000-0000-0000-0000-000000000001' order by created_at desc limit 1`,
    );
  await page.route(/https:\/\/checkout\.stripe\.com\/.*/, async (route) => {
    const orderId = latestOrder();
    checkoutVisits += 1;
    if (checkoutVisits === 1) {
      return route.fulfill({
        status: 302,
        headers: { location: `${BASE}/cart?cancelled=${orderId}` },
      });
    }
    await connectEvent('payment_intent.amount_capturable_updated', {
      amount_capturable: 100000,
      id: `pi_e2e_${Date.now()}`,
      object: 'payment_intent',
      metadata: { order_id: orderId },
    });
    return route.fulfill({ status: 302, headers: { location: `${BASE}/order/${orderId}?paid=1` } });
  });

  await v(page.getByTestId('place-order')).click();
  await text(page, 'Paiement annulé : aucun montant n').waitFor();
  const abandoned = latestOrder();
  await page.waitForTimeout(500);
  if (sql(`select status from orders where id = '${abandoned}'`) !== 'cancelled')
    throw new Error('commande abandonnée non annulée');
  step(
    'paiement abandonné sur Stripe Checkout : retour au panier conservé, commande annulée, aucun débit',
  );

  await v(page.getByTestId('place-order')).click();
  await text(page, 'En attente de confirmation par le commerçant').waitFor();
  const code = (await v(page.getByTestId('pickup-code')).innerText()).trim();
  const dbOrder = sql(
    `select total_cents || '|' || status || '|' || customer_note from orders where pickup_code = '${code}' and customer_id = '20000000-0000-0000-0000-000000000001'`,
  );
  if (dbOrder !== '1900|placed|Bien chaud svp') throw new Error('commande en base : ' + dbOrder);
  step(
    `paiement Stripe Checkout autorisé → commande ${code} transmise, 19,00 € recalculés côté serveur`,
  );

  // --- Commerçant, dans un autre navigateur ----------------------------------
  const merchantCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const mp = await merchantCtx.newPage();
  mp.on('pageerror', (e) => console.log('PAGE ERROR (commerçant)', e.message));
  await mp.goto(BASE + '/sign-in');
  await signIn(mp, 'commercant@zeroo.test');
  await mp.getByTestId('choose-space-merchant').click();
  const card = v(mp.getByTestId(`order-${code}`));
  await card.waitFor();
  await card.getByText('Bien chaud svp', { exact: false }).waitFor();
  await card.getByText('15 min', { exact: true }).click();
  await card.getByText('Accepter (15 min)').click();
  await text(page, 'Acceptée : prête vers').waitFor({ timeout: 10000 });
  if (
    sql(
      `select (paid_at is not null) from orders where pickup_code = '${code}' and status = 'accepted'`,
    ) !== 't'
  ) {
    throw new Error("paiement non capturé à l'acceptation");
  }
  step('le commerçant accepte → paiement capturé, le client voit « Acceptée » en direct');

  // « Je pars maintenant » : position lue une fois, heure d'arrivée chez le commerçant.
  await clientCtx.grantPermissions(['geolocation']);
  await v(page.getByTestId('departure-card')).getByText('En voiture').click();
  await v(page.getByTestId('departure-go')).click();
  await v(page.getByTestId('departure-announced')).waitFor({ timeout: 15000 });
  await v(mp.getByTestId(`eta-${code}`))
    .getByText('🚗 Arrivée prévue vers', { exact: false })
    .waitFor({ timeout: 15000 });
  await v(mp.getByTestId(`advice-${code}`))
    .getByText('Lancez la préparation', { exact: false })
    .waitFor();
  if (sql(`select customer_travel_mode from orders where pickup_code = '${code}'`) !== 'drive')
    throw new Error('mode de trajet');
  step(
    "« Je pars maintenant » en voiture → le commerçant voit l'heure d'arrivée et quand lancer la préparation",
  );

  await v(mp.getByTestId(`ready-${code}`)).click();
  await text(page, 'Votre commande est prête').waitFor({ timeout: 10000 });
  await card.getByLabel('Code de retrait du client').fill(code);
  await v(mp.getByTestId(`handover-${code}`)).click();
  await text(page, 'Commande récupérée. Bon appétit !').waitFor({ timeout: 10000 });
  step('prête puis remise avec le code → suivi client à jour sans rechargement');

  await page.goto(BASE + '/');
  await page.getByTestId('choose-space-client').click();
  await v(page.getByRole('tab', { name: /Commandes/ })).click();
  await text(page, 'Terminées').waitFor();
  await text(page, 'Récupérée').first().waitFor();
  step('historique client');

  // --- Recherche ---------------------------------------------------------------
  await page.goto(BASE + '/');
  await v(page.getByLabel('Rechercher un commerce')).fill('750');
  await v(page.getByTestId('merchant-chez-samir')).waitFor();
  await v(page.getByLabel('Rechercher un commerce')).fill('');
  await clientCtx.grantPermissions(['geolocation']);
  await text(page, 'Utiliser ma position').click();
  await text(page, 'Autour de vous').waitFor();
  await v(page.getByTestId('merchant-chez-samir')).getByText('190 m', { exact: false }).waitFor();
  step('recherche par code postal, puis à proximité avec la position (190 m)');

  // --- Commerce mis en pause pendant que le client prépare son panier ----------
  await page.goto(BASE + '/m/chez-samir');
  await v(page.getByTestId('menu-item-Canette 33 cl')).click();
  await v(page.getByTestId('item-add')).click();
  sql(`update merchants set is_paused = true where id = '${SAMIR}'`);
  await v(page.getByTestId('cart-bar')).click();
  await v(page.getByTestId('place-order')).click();
  await text(page, 'Ce commerce ne prend pas de commandes pour le moment').waitFor();
  await page.goto(BASE + '/m/chez-samir');
  await v(page.getByTestId('not-accepting')).getByText('ne prend plus de commandes').waitFor();
  sql(`update merchants set is_paused = false where id = '${SAMIR}'`);
  step('commerce en pause : commande refusée par le serveur et bandeau sur la fiche');

  await browser.close();
});
