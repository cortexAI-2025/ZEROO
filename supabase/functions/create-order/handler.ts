import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';

import { HttpError, handle, json, readJson } from '../_shared/http.ts';
import { type OrderRow, releaseOrderPayments } from '../_shared/orders.ts';
import { appWebUrl, MIN_CHARGE_CENTS, type Stripe, stripeClient } from '../_shared/stripe.ts';
import { adminClient, requireUser, unwrap } from '../_shared/supabase.ts';

type Body = {
  merchantId: string;
  /** useReward : une unité de cette ligne (menu formule) est le menu offert par la fidélité. */
  items: { itemId: string; quantity: number; optionIds?: string[]; useReward?: boolean }[];
  note?: string;
  /** native : PaymentSheet dans l'app ; web : page Stripe Checkout. */
  channel: 'native' | 'web';
  /** Repas : carte (défaut) ou espèces au comptoir (retrait uniquement, restaurants qui l'acceptent). */
  mealPayment?: 'card' | 'cash';
  /** Course : carte (réglée quand un livreur accepte) ou espèces remises au livreur. */
  deliveryPayment?: 'card' | 'cash';
  /** Absent : retrait sur place. */
  delivery?: {
    addressLine: string;
    postalCode: string;
    city: string;
    latitude: number;
    longitude: number;
    phone: string;
    instructions?: string;
  };
};

/** Un paiement à confirmer dans l'app (feuille de paiement Stripe). */
type NativePayment = {
  kind: 'meal';
  clientSecret: string;
  stripeAccountId: string;
  displayName: string;
  amountCents: number;
};

/**
 * Crée la commande (prix recalculés en base) puis le paiement du repas, en charge directe et
 * sans commission, sur le compte Stripe du restaurant. Il est seulement autorisé : il sera
 * capturé quand le restaurant acceptera.
 * La course n'est pas payée ici : elle l'est quand un livreur accepte la mission
 * (fonction pay-delivery). Retrait en espèces : aucun paiement en ligne.
 */
export const handler = handle(async (req) => {
  const user = await requireUser(req);
  const body = await readJson<Body>(req);
  if (
    !body?.merchantId ||
    !Array.isArray(body.items) ||
    !['native', 'web'].includes(body.channel)
  ) {
    throw new HttpError(400, 'invalid_body');
  }

  const db = adminClient();
  const delivery = body.delivery;
  const order = unwrap(
    await db.rpc('create_order', {
      p_customer_id: user.id,
      p_merchant_id: body.merchantId,
      p_items: body.items.map((i) => ({
        item_id: i.itemId,
        quantity: i.quantity,
        option_ids: i.optionIds ?? [],
        use_reward: i.useReward === true,
      })),
      p_customer_note: body.note ?? null,
      p_delivery: delivery
        ? {
            address_line: delivery.addressLine,
            postal_code: delivery.postalCode,
            city: delivery.city,
            latitude: delivery.latitude,
            longitude: delivery.longitude,
            phone: delivery.phone,
            instructions: delivery.instructions ?? null,
          }
        : null,
      p_meal_payment: body.mealPayment ?? 'card',
      p_delivery_payment: body.deliveryPayment ?? 'card',
    }),
  ) as OrderRow;

  // Espèces au comptoir : la commande est déjà partie au restaurant, rien à payer en ligne.
  if (order.meal_payment_method === 'cash') return json({ orderId: order.id, cash: true });

  const mealFree = order.total_cents === 0;
  const stripe = stripeClient();

  const fail = async (code: string) => {
    await releaseOrderPayments(stripe, order);
    await db.rpc('mark_order_payment_failed', { p_order_id: order.id });
    throw new HttpError(400, code);
  };

  // Menu offert sans rien d'autre à payer : le repas est réglé sans Stripe.
  if (mealFree) {
    unwrap(
      await db.rpc('mark_order_authorized', { p_order_id: order.id, p_payment_intent_id: null }),
    );
    return json({ orderId: order.id, free: true });
  }
  if (!order.stripe_account_id) return await fail('merchant_not_accepting');
  if (order.total_cents < MIN_CHARGE_CENTS) return await fail('amount_too_small');

  const merchant = unwrap(
    await db.from('merchants').select('name').eq('id', order.merchant_id).single(),
  ) as { name: string };

  const meal = {
    amount: order.total_cents,
    account: order.stripe_account_id,
    description: `Commande ${order.pickup_code} – ${merchant.name}`,
    metadata: { order_id: order.id, kind: 'meal' },
  };

  try {
    if (body.channel === 'web') {
      return json({
        orderId: order.id,
        checkoutUrl: await createMealCheckout(db, stripe, order, user.email, meal),
      });
    }

    const intent = await createIntent(stripe, meal, user.email, `payment-${order.id}`);
    unwrap(
      await db.from('orders').update({ stripe_payment_intent_id: intent.id }).eq('id', order.id),
    );
    const payments: NativePayment[] = [
      {
        kind: 'meal',
        clientSecret: intent.client_secret!,
        stripeAccountId: meal.account,
        displayName: merchant.name,
        amountCents: meal.amount,
      },
    ];
    return json({ orderId: order.id, payments });
  } catch (error) {
    const latest = unwrap(
      await db.from('orders').select('*').eq('id', order.id).single(),
    ) as OrderRow;
    await releaseOrderPayments(stripe, latest);
    await db.rpc('mark_order_payment_failed', { p_order_id: order.id });
    throw error;
  }
});

type Charge = {
  amount: number;
  account: string;
  description: string;
  metadata: Record<string, string>;
};

/** Autorisation à capture manuelle, en charge directe sur le compte du vendeur. */
function createIntent(stripe: Stripe, charge: Charge, email: string | undefined, key: string) {
  return stripe.paymentIntents.create(
    {
      amount: charge.amount,
      currency: 'eur',
      capture_method: 'manual',
      automatic_payment_methods: { enabled: true },
      description: charge.description,
      metadata: charge.metadata,
      receipt_email: email,
    },
    { stripeAccount: charge.account, idempotencyKey: key },
  );
}

/** Web : page Stripe Checkout du repas ; elle renvoie vers le suivi de commande. */
async function createMealCheckout(
  db: SupabaseClient,
  stripe: Stripe,
  order: OrderRow,
  email: string | undefined,
  meal: Charge,
): Promise<string> {
  const items = unwrap(
    await db.from('order_items').select('name, unit_price_cents, quantity').eq('order_id', order.id),
  ) as { name: string; unit_price_cents: number; quantity: number }[];
  const session = await stripe.checkout.sessions.create(
    {
      mode: 'payment',
      locale: 'fr',
      customer_email: email,
      line_items: items.map((item) => ({
        quantity: item.quantity,
        price_data: {
          currency: 'eur',
          unit_amount: item.unit_price_cents,
          product_data: { name: item.name },
        },
      })),
      payment_intent_data: {
        capture_method: 'manual',
        description: meal.description,
        metadata: meal.metadata,
      },
      metadata: meal.metadata,
      success_url: `${appWebUrl()}/order/${order.id}?paid=1`,
      cancel_url: `${appWebUrl()}/cart?cancelled=${order.id}`,
      expires_at: Math.floor(Date.now() / 1000) + 31 * 60,
    },
    { stripeAccount: meal.account, idempotencyKey: `checkout-${order.id}` },
  );
  unwrap(
    await db.from('orders').update({ stripe_checkout_session_id: session.id }).eq('id', order.id),
  );
  return session.url!;
}
