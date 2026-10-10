// Livraison dans l'app web, trois navigateurs : une nouvelle livreuse (inscription, Stripe,
// abonnement, rattachement), le restaurant « Chez Samir » et la cliente Nadia.
// Pages Stripe et géocodeur simulés ; fonctions servies contre stripe-mock (voir README).
// E2E_SHOTS=<dossier> : captures d'écran des étapes clés.
const {
  BASE,
  connectEvent,
  launch,
  PLATFORM_SECRET,
  run,
  sql,
  step,
  visible: v,
  webhook,
} = require('./helpers');

const SAMIR = '30000000-0000-0000-0000-000000000001';
const SHOTS = process.env.E2E_SHOTS;
const shot = (page, name) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${name}.png` }) : null);

async function signUp(email) {
  const res = await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      apikey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ email, password: 'motdepasse1' }),
  });
  if (!res.ok) throw new Error('inscription ' + res.status);
  sql(`update auth.users set email_confirmed_at = now() where email = '${email}'`);
}

/** SIRET de test unique, avec une clé de Luhn valide. */
function testSiret() {
  const base = String(Date.now()).slice(-13);
  for (let k = 0; k < 10; k++) {
    const s = base + k;
    const sum = [...s].reduce((total, c, i) => {
      const d = Number(c);
      if (i % 2 === 1) return total + d;
      return total + (d * 2 > 9 ? d * 2 - 9 : d * 2);
    }, 0);
    if (sum % 10 === 0) return s;
  }
  throw new Error('SIRET');
}

run('Livraison dans l’app', async () => {
  sql(`delete from merchant_opening_hours where merchant_id = '${SAMIR}'`);
  sql(
    `insert into merchant_opening_hours (merchant_id, weekday, opens_at, closes_at) select '${SAMIR}', d, t.o, t.c from generate_series(1,7) d, (values ('00:00'::time,'12:00'::time),('12:00'::time,'00:00'::time)) t(o,c)`,
  );
  sql(
    `update merchants set is_paused = false, paused_until = null, is_published = true where id = '${SAMIR}'`,
  );
  sql(
    `update orders set status = 'refused' where status in ('pending_payment','placed','accepted','preparing','ready','out_for_delivery')`,
  );
  // Seule la nouvelle livreuse sera disponible : la course lui revient.
  sql(`update couriers set is_available = false`);

  const browser = await launch();
  const pages = [];
  const open = async (width = 420) => {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    pages.push(page);
    page.on('pageerror', (e) => console.log('PAGE ERROR', e.message));
    page.on('dialog', (d) => d.accept());
    return page;
  };
  const text = (p, s, o) => v(p.getByText(s, o));
  const signIn = async (p, email) => {
    await p.goto(BASE + '/sign-in');
    await v(p.getByLabel('Adresse e-mail')).fill(email);
    await v(p.getByLabel('Mot de passe')).fill('motdepasse1');
    await v(p.getByTestId('sign-in-submit')).click();
  };

  try {
    // --- Nouvelle livreuse ------------------------------------------------------------------
    const email = `lea${Date.now()}@zeroo.test`;
    await signUp(email);
    const lea = await open();
    await signIn(lea, email);
    await lea.getByTestId('choose-space-courier').click();
    await text(lea, 'Devenir livreur Zéroo').waitFor();
    await v(lea.getByTestId('courier-name')).fill('Léa Martin');
    await v(lea.getByTestId('courier-phone')).fill('06 11 22 33 44');
    await v(lea.getByTestId('courier-siret')).fill('123 456 789 00016');
    await text(lea, 'Scooter').click();
    await v(lea.getByTestId('courier-submit')).click();
    await text(lea, 'SIRET invalide', { exact: false }).waitFor();
    await shot(lea, '1-livreur-inscription');
    const siret = testSiret();
    await v(lea.getByTestId('courier-siret')).fill(
      siret.replace(/(\d{3})(\d{3})(\d{3})(\d{5})/, '$1 $2 $3 $4'),
    );
    await v(lea.getByTestId('courier-submit')).click();
    await v(lea.getByTestId('courier-setup')).waitFor();
    const leaId = sql(`select id from couriers where siret = '${siret}'`);
    if (!leaId) throw new Error('profil livreur absent');
    step(
      'inscription livreur : SIRET vérifié (clé de Luhn), profil créé, liste « Avant votre première course »',
    );

    // Paiements et abonnement : pages Stripe simulées, retour sur l'onglet Compte.
    await lea.route(/https:\/\/[^/]*stripe\.(com|me)\/.*/, (route) => {
      const fromCheckout = route.request().url().includes('checkout.stripe.com');
      const target = fromCheckout ? '/livreur/compte?subscribed=1' : '/livreur/compte?done=1';
      return route.fulfill({ status: 302, headers: { location: `${BASE}${target}` } });
    });
    await v(lea.getByRole('tab', { name: /Compte/ })).click();
    // Au retour, l'app relit le compte chez Stripe (ici stripe-mock, toujours « inactif ») :
    // le webhook simulé n'est envoyé qu'après, comme dans la réalité.
    const refreshed = lea.waitForResponse(
      (r) => r.url().includes('connect-onboarding') && r.request().postData()?.includes('refresh'),
    );
    await v(lea.getByTestId('setup-payments')).click();
    await lea.waitForURL(/\/livreur\/compte\?done=1/);
    await refreshed;
    const account = sql(
      `select stripe_account_id from courier_stripe_accounts where courier_id = '${leaId}'`,
    );
    await connectEvent(
      'account.updated',
      {
        id: account,
        object: 'account',
        charges_enabled: true,
        payouts_enabled: true,
        details_submitted: true,
      },
      account,
    );
    await v(lea.getByTestId('payments-card'))
      .getByText('Paiements actifs', { exact: false })
      .waitFor();
    await v(lea.getByTestId('subscribe'))
      .getByText('Démarrer mon essai gratuit de 30 jours')
      .click();
    await lea.waitForURL(/subscribed=1/);
    const customer = sql(
      `select stripe_customer_id from courier_subscriptions where courier_id = '${leaId}'`,
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
    await v(lea.getByTestId('subscription-card'))
      .getByText('Essai gratuit jusqu', { exact: false })
      .waitFor();
    await v(lea.getByTestId('subscription-card')).getByText('Abonnement Zéroo Livreur').waitFor();
    await shot(lea, '2-livreur-compte');
    step(
      'compte livreur : Stripe Connect activé par webhook, abonnement Livreur 9,99 € avec 30 jours d’essai',
    );

    await v(lea.getByRole('tab', { name: /Restaurants/ })).click();
    await v(lea.getByTestId('courier-merchant-search')).fill('Samir');
    await v(lea.getByTestId('request-link-chez-samir')).click();
    await v(lea.getByTestId('link-chez-samir')).getByText('En attente').waitFor();
    step('rattachement : Léa trouve « Chez Samir » et demande à livrer (en attente)');

    // --- Le restaurant accepte la livreuse -----------------------------------------------------
    const samir = await open(1280);
    await signIn(samir, 'commercant@zeroo.test');
    await samir.getByTestId('choose-space-merchant').click();
    await samir.waitForURL(/\/pro/);
    await v(samir.getByRole('tab', { name: /Boutique/ })).click();
    await v(samir.getByTestId('delivery-settings'))
      .getByText('Activée · 3,50 €', { exact: false })
      .waitFor();
    await v(samir.getByTestId('delivery-settings')).click();
    await v(samir.getByTestId(`approve-courier-${leaId}`)).click();
    await text(samir, 'Léa Martin').waitFor();
    await v(samir.getByText('Demandes de livreurs'))
      .waitFor({ state: 'detached' })
      .catch(() => undefined);
    await shot(samir, '3-restaurant-livraison');
    await v(lea.getByTestId('link-chez-samir')).getByText('Accepté').waitFor();
    step(
      'restaurant : réglages de livraison (3,50 €, zone de 3 km), accepte Léa ; Léa voit « Accepté » en temps réel',
    );

    await v(lea.getByRole('tab', { name: /Courses/ })).click();
    await v(lea.getByTestId('courier-setup')).waitFor({ state: 'detached' });
    await v(lea.getByTestId('availability-switch')).click();
    await lea.waitForTimeout(500);
    if (sql(`select is_available from couriers where id = '${leaId}'`) !== 't')
      throw new Error('Léa devrait être disponible');
    step('Léa a tout configuré : elle se rend disponible');

    // --- La cliente commande en livraison ---------------------------------------------------------
    const nadia = await open();
    await nadia.route('https://data.geopf.fr/**', (route) =>
      route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          features: [
            {
              geometry: { coordinates: [2.34, 48.87] },
              properties: {
                label: '5 Rue Saint-Augustin 75002 Paris',
                name: '5 Rue Saint-Augustin',
                postcode: '75002',
                city: 'Paris',
              },
            },
          ],
        }),
      }),
    );
    await signIn(nadia, 'client@zeroo.test');
    await nadia.getByTestId('choose-space-client').click();
    await nadia.waitForURL(/explore/);
    await nadia.goto(BASE + '/m/chez-samir');
    await v(nadia.getByTestId('merchant-delivers'))
      .getByText('Livraison possible · 3,50 €')
      .waitFor();
    await v(nadia.getByTestId('menu-item-Menu Américain')).click();
    await v(nadia.getByTestId('item-add')).click();
    await v(nadia.getByTestId('cart-bar')).click();
    await v(nadia.getByTestId('fulfillment-delivery')).click();
    await v(nadia.getByTestId('delivery-address')).fill('5 rue saint augustin');
    await text(nadia, '5 Rue Saint-Augustin 75002 Paris').click();
    await v(nadia.getByTestId('delivery-phone')).fill('06 98 76 54 32');
    await v(nadia.getByTestId('delivery-quote'))
      .getByText('Livraison possible', { exact: false })
      .waitFor();
    await v(nadia.getByTestId('cart-delivery-fee')).getByText('3,50 €').waitFor();
    await v(nadia.getByTestId('cart-total')).getByText('13,00 €').waitFor();
    await text(nadia, 'Deux paiements', { exact: false }).waitFor();
    await shot(nadia, '4-client-panier-livraison');
    step(
      'panier : « Livraison », adresse choisie dans la liste, devis OK, repas 9,50 € + course 3,50 € = 13,00 €',
    );

    // Deux pages Stripe Checkout enchaînées : le repas (compte du restaurant), puis la course
    // (compte de Léa). Chaque passage simulé envoie le webhook d'autorisation correspondant.
    let visits = 0;
    const latestOrder = () =>
      sql(
        `select id from orders where customer_id = '20000000-0000-0000-0000-000000000001' order by created_at desc limit 1`,
      );
    await nadia.route(/https:\/\/checkout\.stripe\.com\/.*/, async (route) => {
      const orderId = latestOrder();
      visits += 1;
      if (visits === 1) {
        await connectEvent('checkout.session.completed', {
          id: sql(`select stripe_checkout_session_id from orders where id = '${orderId}'`),
          mode: 'payment',
          payment_intent: `pi_repas_${Date.now()}`,
          amount_total: 950,
          metadata: { order_id: orderId, kind: 'meal' },
        });
        // Playwright n'intercepte pas la cible d'une redirection 302 : la page simulée
        // navigue elle-même vers la page de paiement de la course.
        return route.fulfill({
          contentType: 'text/html',
          body: `<script>location.href = 'https://checkout.stripe.com/c/pay/course-${orderId}'</script>`,
        });
      }
      await connectEvent(
        'checkout.session.completed',
        {
          id: sql(`select delivery_checkout_session_id from orders where id = '${orderId}'`),
          mode: 'payment',
          payment_intent: `pi_course_${Date.now()}`,
          amount_total: 350,
          metadata: { order_id: orderId, kind: 'delivery' },
        },
        account,
      );
      return route.fulfill({
        status: 302,
        headers: { location: `${BASE}/order/${orderId}?paid=1` },
      });
    });
    await v(nadia.getByTestId('place-order')).getByText('Payer · 13,00 €').click();
    await text(nadia, 'En attente de confirmation du restaurant et du livreur').waitFor();
    if (visits !== 2) throw new Error(`deux pages de paiement attendues, ${visits} vues`);
    const orderId = latestOrder();
    const deliveryCode = (await v(nadia.getByTestId('delivery-code')).innerText()).trim();
    const pickupCode = sql(`select pickup_code from orders where id = '${orderId}'`);
    await v(nadia.getByTestId('order-total')).getByText('13,00 €').waitFor();
    await shot(nadia, '5-client-suivi');
    step(
      `deux pages Stripe (repas puis course) → commande ${pickupCode} envoyée ; code de livraison ${deliveryCode}`,
    );

    // --- Livreuse et restaurant -----------------------------------------------------------------
    await samir.goto(BASE + '/pro');
    const card = v(samir.getByTestId(`order-${pickupCode}`));
    await card.getByText('🛵 Livraison · Paris', { exact: false }).waitFor();
    await card.getByText('En attente de la confirmation de Léa', { exact: false }).waitFor();
    if (!(await v(samir.getByTestId(`accept-${pickupCode}`)).isDisabled()))
      throw new Error('acceptation possible avant la confirmation du livreur');
    step(
      'restaurant : commande « 🛵 Livraison », acceptation bloquée tant que Léa n’a pas confirmé',
    );

    const runCard = v(lea.getByTestId(`run-${pickupCode}`));
    await runCard.getByText('Nouvelle course').waitFor();
    await runCard.getByText('Course : 3,50 €').waitFor();
    await runCard.getByText('Livraison : 5 Rue Saint-Augustin, 75002 Paris').waitFor();
    await shot(lea, '6-livreur-nouvelle-course');
    await v(lea.getByTestId(`confirm-run-${pickupCode}`)).click();
    await runCard.getByText('Course confirmée', { exact: false }).waitFor();
    await card.getByText('Léa a confirmé la course.').waitFor();
    await v(samir.getByTestId(`accept-${pickupCode}`)).click();
    await text(nadia, 'Acceptée : Léa livrera votre commande.').waitFor();
    if (
      sql(
        `select (paid_at is not null) || '|' || (delivery_paid_at is not null) from orders where id = '${orderId}'`,
      ) !== 'true|true'
    )
      throw new Error('repas et course doivent être encaissés');
    step(
      'Léa confirme (temps réel chez le restaurant) → le restaurant accepte : repas et course encaissés ; la cliente le voit',
    );

    await v(samir.getByTestId(`ready-${pickupCode}`)).click();
    await v(lea.getByTestId(`run-pickup-code-${pickupCode}`))
      .getByText(pickupCode)
      .waitFor();
    await v(samir.getByLabel('Code de retrait présenté par le livreur')).fill(pickupCode);
    await v(samir.getByTestId(`handover-${pickupCode}`))
      .getByText('Remettre au livreur')
      .click();
    await runCard.getByText('En route vers le client.').waitFor();
    await text(nadia, 'Léa est en route avec votre commande.').waitFor();
    step(
      'prête → Léa voit le code de retrait, le restaurant le saisit : « Remettre au livreur » → la cliente voit « Léa est en route »',
    );

    await v(lea.getByTestId(`delivery-code-${pickupCode}`)).fill(
      deliveryCode === '0000' ? '1111' : '0000',
    );
    await v(lea.getByTestId(`delivered-${pickupCode}`)).click();
    await text(lea, 'Code de livraison incorrect', { exact: false }).waitFor();
    await v(lea.getByTestId(`delivery-code-${pickupCode}`)).fill(deliveryCode);
    await shot(lea, '7-livreur-livraison');
    await v(lea.getByTestId(`delivered-${pickupCode}`)).click();
    await text(nadia, 'Commande livrée. Bon appétit !').waitFor();
    await shot(nadia, '8-client-livree');
    await v(lea.getByRole('tab', { name: /Revenus/ })).click();
    await v(lea.getByTestId('earnings-Aujourd’hui').or(lea.getByTestId("earnings-Aujourd'hui")))
      .getByText('3,50 €')
      .waitFor();
    await shot(lea, '9-livreur-revenus');
    step(
      'livraison validée avec le code de la cliente (code faux refusé) ; revenus du jour de Léa : 3,50 €',
    );
  } catch (error) {
    // Captures de chaque navigateur pour comprendre l'échec.
    for (const [i, page] of pages.entries()) await shot(page, `echec-${i}`)?.catch(() => undefined);
    throw error;
  }

  sql(
    `update couriers set is_available = false where id <> '80000000-0000-0000-0000-000000000001'`,
  );
  sql(`update couriers set is_available = true where id = '80000000-0000-0000-0000-000000000001'`);
  await browser.close();
});
