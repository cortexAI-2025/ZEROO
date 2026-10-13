import { HttpError, handle, json, readJson } from '../_shared/http.ts';
import { type OrderRow } from '../_shared/orders.ts';
import { appWebUrl, MIN_CHARGE_CENTS, stripeClient } from '../_shared/stripe.ts';
import { adminClient, requireUser, unwrap } from '../_shared/supabase.ts';

type Body = { orderId: string; channel: 'native' | 'web' };

/**
 * Le client règle la course quand un livreur a accepté la mission (carte, Apple Pay, Google
 * Pay). Charge directe sans commission sur le compte Stripe du livreur, encaissée tout de
 * suite (le livreur est engagé). Le paiement est rattaché au livreur actuel : si la mission
 * change de main, l'ancien paiement est annulé et ne compte plus.
 */
export const handler = handle(async (req) => {
  const user = await requireUser(req);
  const body = await readJson<Body>(req);
  if (!body?.orderId || !['native', 'web'].includes(body.channel)) {
    throw new HttpError(400, 'invalid_body');
  }

  const db = adminClient();
  const { data, error } = await db.rpc('start_delivery_payment', {
    p_order_id: body.orderId,
    p_customer_id: user.id,
  });
  if (error) {
    if (error.message.includes('order_not_found')) throw new HttpError(404, 'order_not_found');
    if (error.message.includes('delivery_not_payable')) throw new HttpError(409, 'delivery_not_payable');
    throw new Error(error.message);
  }
  const order = data as OrderRow;
  const account = order.courier_stripe_account_id;
  if (!account || !order.courier_id) throw new HttpError(409, 'delivery_not_payable');
  if (order.delivery_fee_cents < MIN_CHARGE_CENTS) throw new HttpError(400, 'amount_too_small');

  const stripe = stripeClient();
  const options = { stripeAccount: account };
  const description = `Livraison de la commande ${order.pickup_code}`;
  const metadata = { order_id: order.id, kind: 'delivery', courier_id: order.courier_id };

  if (body.channel === 'web') {
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        locale: 'fr',
        customer_email: user.email,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'eur',
              unit_amount: order.delivery_fee_cents,
              product_data: { name: description },
            },
          },
        ],
        payment_intent_data: { description, metadata },
        metadata,
        success_url: `${appWebUrl()}/order/${order.id}?paid=1`,
        cancel_url: `${appWebUrl()}/order/${order.id}`,
        expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
      },
      { ...options, idempotencyKey: `delivery-checkout-${order.id}-${order.courier_id}` },
    );
    return json({ orderId: order.id, checkoutUrl: session.url });
  }

  // Un paiement déjà ouvert pour ce livreur est repris (le client a fermé la feuille).
  let intent = order.delivery_payment_intent_id
    ? await stripe.paymentIntents.retrieve(order.delivery_payment_intent_id, undefined, options)
    : null;
  if (!intent || intent.status === 'canceled') {
    intent = await stripe.paymentIntents.create(
      {
        amount: order.delivery_fee_cents,
        currency: 'eur',
        automatic_payment_methods: { enabled: true },
        description,
        metadata,
        receipt_email: user.email,
      },
      { ...options, idempotencyKey: `delivery-${order.id}-${order.courier_id}` },
    );
    unwrap(
      await db.rpc('attach_delivery_payment_intent', {
        p_order_id: order.id,
        p_courier_id: order.courier_id,
        p_payment_intent_id: intent.id,
      }),
    );
  }
  return json({
    orderId: order.id,
    payment: {
      kind: 'delivery',
      clientSecret: intent.client_secret,
      stripeAccountId: account,
      displayName: order.courier_name ?? 'Votre livreur',
      amountCents: order.delivery_fee_cents,
    },
  });
});
