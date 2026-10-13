const {
  ANON,
  AUTH_URL,
  BASE,
  PLATFORM_SECRET,
  launch,
  run,
  sql,
  step,
  visible,
  webhook,
} = require('./helpers');

run('Espace commerçant', async () => {
  // Compte neuf, confirmé via l'API admin (le parcours e-mail est couvert par l'autre test).
  const email = `pro${Date.now()}@zeroo.test`;
  const r = await fetch(`${AUTH_URL}/signup`, {
    method: 'POST',
    headers: { apikey: ANON, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: 'motdepasse1' }),
  });
  if (!r.ok) throw new Error('signup ' + r.status);
  sql(`update auth.users set email_confirmed_at = now() where email = '${email}'`);

  const browser = await launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
  page.on('dialog', (d) => d.accept());
  // Géocodeur public simulé (pas d'accès réseau externe dans ce bac à sable).
  await page.route('https://data.geopf.fr/**', (route) =>
    route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({
        features: [
          {
            geometry: { coordinates: [4.8357, 45.764] },
            properties: {
              label: '5 Place Bellecour 69002 Lyon',
              name: '5 Place Bellecour',
              postcode: '69002',
              city: 'Lyon',
            },
          },
        ],
      }),
    }),
  );
  const v = visible;
  const text = (s, o) => v(page.getByText(s, o));
  const label = (s, o) => v(page.getByLabel(s, o));

  await page.goto(BASE + '/sign-in');
  await label('Adresse e-mail').fill(email);
  await label('Mot de passe').fill('motdepasse1');
  await v(page.getByTestId('sign-in-submit')).click();
  await page.getByTestId('choose-space-merchant').click();
  await text('Bienvenue sur Zéroo Pro').waitFor();
  step('nouveau commerçant : écran de création du commerce');

  await v(page.getByTestId('merchant-submit')).click();
  await text('Indiquez le nom du commerce').waitFor();
  await text('Choisissez une adresse dans la liste').first().waitFor();
  step('validation du formulaire (nom et adresse obligatoires)');

  await label('Nom du commerce').fill('Le Kebab de Léa');
  await text('Sandwicherie').click();
  await label('Adresse').fill('5 place Bellecour');
  await text('5 Place Bellecour 69002 Lyon').click();
  await text('Adresse retenue : 5 Place Bellecour, 69002 Lyon').waitFor();
  await v(page.getByTestId('merchant-submit')).click();
  await v(page.getByTestId('merchant-status')).getByText('Configuration à terminer').waitFor();
  await v(page.getByTestId('setup-banner')).waitFor();
  const slug = sql(
    `select slug from merchants where name = 'Le Kebab de Léa' order by created_at desc limit 1`,
  );
  const merchantId = sql(`select id from merchants where slug = '${slug}'`);
  step(
    `commerce créé (slug ${slug}) → « Configuration à terminer » tant que paiements et abonnement manquent`,
  );

  // Pages Stripe simulées : on revient directement sur l'app, comme après une inscription réussie.
  await page.route(/https:\/\/[^/]*stripe\.(com|me)\/.*/, (route) => {
    const fromCheckout = route.request().url().includes('checkout.stripe.com');
    const target = fromCheckout ? '/pro/stripe?subscribed=1' : '/pro/stripe?done=1';
    return route.fulfill({ status: 302, headers: { location: `${BASE}${target}` } });
  });
  await v(page.getByRole('tab', { name: /Boutique/ })).click();
  await v(page.getByTestId('setup-payments')).click();
  await text('Retour de Stripe').first().waitFor();
  const accountId = sql(
    `select stripe_account_id from merchant_stripe_accounts where merchant_id = '${merchantId}'`,
  );
  await webhook('account.updated', {
    id: accountId,
    object: 'account',
    charges_enabled: true,
    payouts_enabled: true,
    details_submitted: true,
  });
  await text('Retour à ma boutique').click();
  await v(page.getByTestId('payments-card'))
    .getByText('Paiements actifs', { exact: false })
    .waitFor();
  step('« Configurer mes paiements » → compte Stripe Connect créé → webhook → paiements actifs');

  await v(page.getByTestId('subscribe'))
    .getByText('Démarrer mon essai gratuit de 30 jours')
    .click();
  await text('Retour de Stripe').first().waitFor();
  const customer = sql(
    `select stripe_customer_id from subscriptions where merchant_id = '${merchantId}'`,
  );
  const trialEnd = Math.floor(Date.now() / 1000) + 30 * 86400;
  await webhook(
    'customer.subscription.created',
    {
      id: `sub_${Date.now()}`,
      object: 'subscription',
      customer,
      status: 'trialing',
      trial_end: trialEnd,
      cancel_at_period_end: false,
      items: { data: [{ current_period_end: trialEnd }] },
    },
    PLATFORM_SECRET,
  );
  await text('Retour à ma boutique').click();
  await v(page.getByTestId('subscription-card'))
    .getByText('Essai gratuit jusqu', { exact: false })
    .waitFor();
  await v(page.getByRole('tab', { name: /Commandes/ })).click();
  await v(page.getByTestId('merchant-status')).getByText('Non publié').waitFor();
  step(
    '« Démarrer mon essai gratuit » → Stripe Checkout → webhook → essai de 30 jours ; statut « Non publié »',
  );

  // Menu
  await v(page.getByRole('tab', { name: /Menu/ })).click();
  await text('Votre menu est vide').waitFor();
  await label('Nouvelle catégorie').fill('Menus');
  await text('Ajouter', { exact: true }).click();
  await text('+ Ajouter un produit').click();
  await v(page.getByTestId('item-save')).click();
  await text('Indiquez un nom').waitFor();
  await label('Nom', { exact: true }).fill('Menu Kebab');
  await label('Prix (€)').fill('9,9');
  await label('Menu formule (compte pour la fidélité)').click();
  await v(page.getByTestId('item-save')).click();
  await text("+ Ajouter un groupe d'options").click();
  await v(page.getByLabel('Nom du groupe')).first().waitFor();
  await text('+ Ajouter une option').click();
  await v(page.getByLabel('Option', { exact: true }))
    .first()
    .fill('Blanche');
  await v(page.getByLabel('Supplément (€)')).first().fill('0,5');
  await label('Nom du groupe').first().click(); // perte de focus → enregistrement
  await page.waitForTimeout(800);
  const opt = sql(
    `select o.name || '|' || o.price_delta_cents || '|' || g.name from menu_options o join menu_option_groups g on g.id = o.group_id join merchants m on m.id = o.merchant_id where m.slug = '${slug}'`,
  );
  if (opt !== 'Blanche|50|Sauce') throw new Error('option inattendue : ' + opt);
  step('menu : catégorie, produit 9,90 € (menu fidélité), groupe « Sauce » et option +0,50 €');

  await page.goBack();
  await text('9,90 €').waitFor();
  await label("Disponible aujourd'hui : Menu Kebab").click();
  await text('Indisponible', { exact: false }).first().waitFor();
  await label("Disponible aujourd'hui : Menu Kebab").click();
  await page.waitForTimeout(500);
  if (
    sql(
      `select i.is_available from menu_items i join merchants m on m.id = i.merchant_id where m.slug = '${slug}' and i.name = 'Menu Kebab'`,
    ) !== 't'
  )
    throw new Error('dispo');
  step('rupture du jour : produit désactivé puis réactivé depuis la liste');

  // Boutique : publication bloquée sans horaires
  await v(page.getByRole('tab', { name: /Boutique/ })).click();
  await text('Ajoutez au moins un produit disponible et un créneau').waitFor();
  await text("Horaires d'ouverture").click();
  await v(page.getByTestId('day-1')).getByText('+ Ajouter un créneau').click();
  await label('Lundi Ouverture').fill('0h');
  await label('Lundi Fermeture').fill('23:59');
  await text('Copier le lundi sur toute la semaine').click();
  await label('Dimanche Fermeture').fill('23:59');
  await label('Mardi Ouverture').fill('25:00');
  await v(page.getByTestId('hours-save')).click();
  await text('Créneau invalide le Mardi').waitFor();
  await label('Mardi Ouverture').fill('00:00');
  await v(page.getByTestId('hours-save')).click();
  await text('Ma boutique').waitFor();
  if (
    sql(
      `select count(*) from merchant_opening_hours h join merchants m on m.id = h.merchant_id where m.slug = '${slug}'`,
    ) !== '7'
  )
    throw new Error('horaires');
  step('horaires : saisie, contrôle du format, copie sur la semaine (7 créneaux)');

  await v(page.getByTestId('publish-switch')).click();
  await page.waitForTimeout(800);
  await text('15 min').click();
  await v(page.getByTestId('pause-status')).waitFor();
  await v(page.getByRole('tab', { name: /Commandes/ })).click();
  await v(page.getByTestId('merchant-status')).getByText('En pause').waitFor();
  await v(page.getByRole('tab', { name: /Boutique/ })).click();
  await text('Reprendre les commandes').click();
  await v(page.getByRole('tab', { name: /Commandes/ })).click();
  await v(page.getByTestId('merchant-status')).getByText('Ouvert').waitFor();
  step('publication, pause 15 min puis reprise → statut « Ouvert »');

  // QR code
  await v(page.getByRole('tab', { name: /Boutique/ })).click();
  await text('QR code à afficher').click();
  await text(`https://zeroo.fr/m/${slug}`).waitFor();
  if (!(await v(page.getByTestId('merchant-qr')).locator('svg').count())) throw new Error('qr');
  step('QR code vers https://zeroo.fr/m/' + slug);
  await page.goBack();

  // Commandes en temps réel
  await v(page.getByRole('tab', { name: /Commandes/ })).click();
  await text('Aucune commande pour le moment').waitFor();
  await text('Activer la sonnerie').click();
  const msg1 = sql(`select public.dev_place_test_order('${slug}')`);
  const code1 = msg1.split(' ')[1];
  await v(page.getByTestId(`order-${code1}`)).waitFor({ timeout: 10000 });
  await text('Nouvelles (1)').waitFor();
  step(`commande ${code1} reçue en temps réel, sans rechargement`);

  const card1 = v(page.getByTestId(`order-${code1}`));
  await card1.getByText('10 min', { exact: true }).click();
  await card1.getByText('Accepter (10 min)').click();
  await text('En préparation (1)').waitFor();
  await v(page.getByTestId(`order-${code1}`))
    .getByText('Lancer la préparation')
    .click();
  await page.waitForTimeout(500);
  await v(page.getByTestId(`ready-${code1}`)).click();
  await text('Prêtes (1)').waitFor();
  const card1r = v(page.getByTestId(`order-${code1}`));
  await card1r.getByLabel('Code de retrait du client').fill('ZZZZ');
  await v(page.getByTestId(`handover-${code1}`)).click();
  await card1r.getByText('Code de retrait incorrect').waitFor();
  await card1r.getByLabel('Code de retrait du client').fill(code1.toLowerCase());
  await v(page.getByTestId(`handover-${code1}`)).click();
  await text('Aucune commande pour le moment').waitFor();
  const total1 = sql(`select total_cents from orders where pickup_code = '${code1}'`);
  const revenue = await v(page.getByTestId('today-revenue')).innerText();
  const expected = (Number(total1) / 100).toFixed(2).replace('.', ',') + ' €';
  if (revenue.replace(/\s/g, ' ') !== expected) throw new Error(`CA ${revenue} ≠ ${expected}`);
  step(
    `accepter 10 min → préparation → prête → code faux refusé → remise avec le bon code ; CA du jour ${revenue}`,
  );

  const msg2 = sql(`select public.dev_place_test_order('${slug}')`);
  const code2 = msg2.split(' ')[1];
  const card2 = v(page.getByTestId(`order-${code2}`));
  await card2.waitFor({ timeout: 10000 });
  await card2.getByText('Refuser').click();
  await card2.getByText('Produit en rupture').click();
  await text('Aucune commande pour le moment').waitFor();
  if (
    sql(`select status || '|' || refusal_reason from orders where pickup_code = '${code2}'`) !==
    'refused|Produit en rupture'
  )
    throw new Error('refus');
  step(`commande ${code2} refusée avec motif`);

  await v(page.getByRole('button', { name: 'Historique des commandes' }))
    .first()
    .click();
  await text('Récupérée').waitFor();
  await text('Refusée').first().waitFor();
  step('historique : commandes récupérée et refusée');

  await browser.close();
});
