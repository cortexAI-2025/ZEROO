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
  kind: 'meal' | 'delivery';
  clientSecret: string;
  stripeAccountId: string;
  displayName: string;
  amountCents: number;
};

/**
 * Crée la commande (prix recalculés en base) puis ses paiements, en charge directe et sans
 * commission :
 *   • le repas sur le compte Stripe du restaurant ;
 *   • pour une livraison, la course sur le compte Stripe du livreur choisi par la base.
 * Les paiements sont seulement autorisés : ils seront capturés quand le restaurant acceptera.
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
    }),
  ) as OrderRow;

  const isDelivery = order.fulfillment === 'delivery';
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
    if (!isDelivery) return json({ orderId: order.id, free: true });
  } else {
    if (!order.stripe_account_id) return await fail('merchant_not_accepting');
    if (order.total_cents < MIN_CHARGE_CENTS) return await fail('amount_too_small');
  }
  if (isDelivery && !order.courier_stripe_account_id) return await fail('no_courier_available');

  const merchant = unwrap(
    await db.from('merchants').select('name').eq('id', order.merchant_id).single(),
  ) as { name: string };
  const courierName = (
    unwrap(await db.from('orders').select('courier_name').eq('id', order.id).single()) as {
      courier_name: string | null;
    }
  ).courier_name;

  const meal = {
    amount: order.total_cents,
    account: order.stripe_account_id!,
    description: `Commande ${order.pickup_code} – ${merchant.name}`,
    metadata: { order_id: order.id, kind: 'meal' },
  };
  const course = {
    amount: order.delivery_fee_cents,
    account: order.courier_stripe_account_id!,
    description: `Livraison de la commande ${order.pickup_code} – ${merchant.name}`,
    metadata: { order_id: order.id, kind: 'delivery' },
  };

  try {
    if (body.channel === 'web') {
      return json({
        orderId: order.id,
        checkoutUrl: await createCheckouts(db, stripe, order, user.email, {
          meal: mealFree ? null : meal,
          course: isDelivery ? course : null,
        }),
      });
    }

    const payments: NativePayment[] = [];
    if (!mealFree) {
      const intent = await createIntent(stripe, meal, user.email, `payment-${order.id}`);
      unwrap(
        await db.from('orders').update({ stripe_payment_intent_id: intent.id }).eq('id', order.id),
      );
      payments.push({
        kind: 'meal',
        clientSecret: intent.client_secret!,
        stripeAccountId: meal.account,
        displayName: merchant.name,
        amountCents: meal.amount,
      });
    }
    if (isDelivery) {
      const intent = await createIntent(stripe, course, user.email, `delivery-${order.id}`);
      unwrap(
        await db
          .from('orders')
          .update({ delivery_payment_intent_id: intent.id })
          .eq('id', order.id),
      );
      payments.push({
        kind: 'delivery',
        clientSecret: intent.client_secret!,
        stripeAccountId: course.account,
        displayName: courierName ?? merchant.name,
        amountCents: course.amount,
      });
    }
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

/**
 * Web : une page Stripe Checkout par vendeur. Pour une livraison, la page du repas renvoie
 * directement vers celle de la course ; la dernière renvoie au suivi de commande.
 */
async function createCheckouts(
  db: SupabaseClient,
  stripe: Stripe,
  order: OrderRow,
  email: string | undefined,
  charges: { meal: Charge | null; course: Charge | null },
): Promise<string> {
  const cancelUrl = `${appWebUrl()}/cart?cancelled=${order.id}`;
  const expiresAt = Math.floor(Date.now() / 1000) + 31 * 60;
  let nextUrl = `${appWebUrl()}/order/${order.id}?paid=1`;

  if (charges.course) {
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        locale: 'fr',
        customer_email: email,
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: 'eur',
              unit_amount: charges.course.amount,
              product_data: { name: charges.course.description },
            },
          },
        ],
        payment_intent_data: {
          capture_method: 'manual',
          description: charges.course.description,
          metadata: charges.course.metadata,
        },
        metadata: charges.course.metadata,
        success_url: nextUrl,
        cancel_url: cancelUrl,
        expires_at: expiresAt,
      },
      { stripeAccount: charges.course.account, idempotencyKey: `delivery-checkout-${order.id}` },
    );
    unwrap(
      await db
        .from('orders')
        .update({ delivery_checkout_session_id: session.id })
        .eq('id', order.id),
    );
    nextUrl = session.url!;
  }

  if (charges.meal) {
    const items = unwrap(
      await db
        .from('order_items')
        .select('name, unit_price_cents, quantity')
        .eq('order_id', order.id),
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
          description: charges.meal.description,
          metadata: charges.meal.metadata,
        },
        metadata: charges.meal.metadata,
        success_url: nextUrl,
        cancel_url: cancelUrl,
        expires_at: expiresAt,
      },
      { stripeAccount: charges.meal.account, idempotencyKey: `checkout-${order.id}` },
    );
    unwrap(
      await db.from('orders').update({ stripe_checkout_session_id: session.id }).eq('id', order.id),
    );
    nextUrl = session.url!;
  }
  return nextUrl;
}
