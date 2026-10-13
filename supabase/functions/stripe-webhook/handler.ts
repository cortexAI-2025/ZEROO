import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';

import { HttpError, handle, json, requireEnv } from '../_shared/http.ts';
import { Stripe, stripeClient } from '../_shared/stripe.ts';
import { adminClient, unwrap } from '../_shared/supabase.ts';

const cryptoProvider = Stripe.createSubtleCryptoProvider();

/**
 * Deux points de terminaison Stripe arrivent ici :
 *   • compte plateforme (STRIPE_WEBHOOK_SECRET) : abonnements des restaurants et des livreurs ;
 *   • comptes connectés (STRIPE_CONNECT_WEBHOOK_SECRET) : paiements des repas (comptes des
 *     restaurants) et des courses (comptes des livreurs), état des comptes.
 */
async function verify(stripe: Stripe, payload: string, signature: string): Promise<Stripe.Event> {
  const secrets = [
    Deno.env.get('STRIPE_WEBHOOK_SECRET'),
    Deno.env.get('STRIPE_CONNECT_WEBHOOK_SECRET'),
  ].filter((s): s is string => !!s);
  for (const secret of secrets) {
    try {
      return await stripe.webhooks.constructEventAsync(
        payload,
        signature,
        secret,
        undefined,
        cryptoProvider,
      );
    } catch {
      // essaie le secret suivant
    }
  }
  throw new HttpError(400, 'invalid_signature');
}

/**
 * Formule du restaurant : Pro (retrait + livraison) si le prix souscrit est un prix Pro, sinon
 * Start. Sans identifiants de prix configurés, on se fie à la formule choisie au paiement.
 */
function merchantPlan(subscription: Stripe.Subscription): 'start' | 'pro' {
  const proPrices = [
    Deno.env.get('STRIPE_PRICE_PRO_MONTH'),
    Deno.env.get('STRIPE_PRICE_PRO_YEAR'),
  ].filter((id): id is string => !!id);
  const priceId = subscription.items.data[0]?.price?.id;
  if (proPrices.length > 0) return priceId && proPrices.includes(priceId) ? 'pro' : 'start';
  return subscription.metadata?.plan === 'pro' ? 'pro' : 'start';
}

/** Abonnement d'un restaurant ou d'un livreur (même offre), retrouvé par son client Stripe. */
async function syncSubscription(db: SupabaseClient, subscription: Stripe.Subscription) {
  const customerId =
    typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id;
  const periodEnd = subscription.items.data[0]?.current_period_end;
  const toDate = (seconds: number | null | undefined) =>
    seconds ? new Date(seconds * 1000).toISOString() : null;
  for (const table of ['subscriptions', 'courier_subscriptions']) {
    const { data: existing } = await db
      .from(table)
      .select('trial_used')
      .eq('stripe_customer_id', customerId)
      .maybeSingle();
    if (!existing) continue;
    unwrap(
      await db
        .from(table)
        .update({
          stripe_subscription_id: subscription.id,
          status: subscription.status,
          trial_end: toDate(subscription.trial_end),
          current_period_end: toDate(periodEnd),
          cancel_at_period_end: subscription.cancel_at_period_end,
          trial_used: existing.trial_used || subscription.trial_end !== null,
          ...(table === 'subscriptions' ? { plan: merchantPlan(subscription) } : {}),
        })
        .eq('stripe_customer_id', customerId),
    );
  }
}

type PaymentKind = 'meal' | 'delivery';

const kindOf = (metadata: Stripe.Metadata | null | undefined): PaymentKind =>
  metadata?.kind === 'delivery' ? 'delivery' : 'meal';

/**
 * Un restaurant ou un livreur contrôle entièrement son compte Stripe : il pourrait créer un
 * paiement portant l'identifiant d'une commande qui n'est pas la sienne. On n'accepte donc
 * un événement de paiement que s'il vient du compte attendu pour ce paiement (restaurant
 * pour le repas, livreur pour la course) et, pour une autorisation, si le montant autorisé
 * couvre le montant dû.
 */
async function orderFromEvent(
  db: SupabaseClient,
  event: Stripe.Event,
  metadata: Stripe.Metadata | null | undefined,
  amount?: number,
) {
  const orderId = metadata?.order_id;
  if (!orderId) return null;
  const kind = kindOf(metadata);
  const order = unwrap(
    await db
      .from('orders')
      .select('id, stripe_account_id, total_cents, courier_stripe_account_id, delivery_fee_cents')
      .eq('id', orderId)
      .maybeSingle(),
  ) as {
    id: string;
    stripe_account_id: string | null;
    total_cents: number;
    courier_stripe_account_id: string | null;
    delivery_fee_cents: number;
  } | null;
  const expectedAccount =
    kind === 'delivery' ? order?.courier_stripe_account_id : order?.stripe_account_id;
  if (!order || !event.account || expectedAccount !== event.account) {
    console.warn(`Événement ${event.id} ignoré : compte Stripe différent de celui attendu`);
    return null;
  }
  const due = kind === 'delivery' ? order.delivery_fee_cents : order.total_cents;
  if (amount !== undefined && amount < due) {
    console.warn(`Événement ${event.id} ignoré : montant autorisé insuffisant`);
    return null;
  }
  return { id: order.id, kind };
}

/**
 * Course payée. Le paiement doit appartenir au livreur actuel de la mission : en web, le
 * paiement n'est rattaché qu'à ce moment (metadata.courier_id). Si la mission a changé de
 * main entre-temps, le client est remboursé et la commande n'est pas modifiée.
 */
async function settleDelivery(
  db: SupabaseClient,
  stripe: Stripe,
  event: Stripe.Event,
  orderId: string,
  intentId: string,
  metadata: Stripe.Metadata | null | undefined,
) {
  const courierId = metadata?.courier_id;
  if (courierId) {
    unwrap(
      await db.rpc('attach_delivery_payment_intent', {
        p_order_id: orderId,
        p_courier_id: courierId,
        p_payment_intent_id: intentId,
      }),
    );
  }
  const settled = unwrap(
    await db.rpc('mark_delivery_authorized', {
      p_order_id: orderId,
      p_payment_intent_id: intentId,
    }),
  );
  if (!settled && event.account) {
    console.warn(`Course ${orderId} : paiement ${intentId} d'un ancien livreur, remboursé`);
    await stripe.refunds.create(
      { payment_intent: intentId },
      { stripeAccount: event.account, idempotencyKey: `refund-stale-${intentId}` },
    );
  }
}

async function processEvent(db: SupabaseClient, stripe: Stripe, event: Stripe.Event) {
  switch (event.type) {
    // Repas : autorisé (capture manuelle, capturé quand le restaurant accepte).
    case 'payment_intent.amount_capturable_updated': {
      const intent = event.data.object;
      if (kindOf(intent.metadata) !== 'meal') break;
      const order = await orderFromEvent(db, event, intent.metadata, intent.amount_capturable);
      if (order) {
        unwrap(
          await db.rpc('mark_order_authorized', {
            p_order_id: order.id,
            p_payment_intent_id: intent.id,
          }),
        );
      }
      break;
    }
    // Course : encaissée tout de suite quand le client la règle.
    case 'payment_intent.succeeded': {
      const intent = event.data.object;
      if (kindOf(intent.metadata) !== 'delivery') break;
      const order = await orderFromEvent(db, event, intent.metadata, intent.amount_received);
      if (order) await settleDelivery(db, stripe, event, order.id, intent.id, intent.metadata);
      break;
    }
    case 'payment_intent.canceled': {
      const intent = event.data.object;
      // Une course annulée (changement de livreur) ne touche pas la commande.
      if (kindOf(intent.metadata) !== 'meal') break;
      const order = await orderFromEvent(db, event, intent.metadata);
      if (order) unwrap(await db.rpc('mark_order_payment_failed', { p_order_id: order.id }));
      break;
    }
    case 'checkout.session.completed': {
      const session = event.data.object;
      if (session.mode === 'subscription' && session.subscription) {
        const id =
          typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
        await syncSubscription(db, await stripe.subscriptions.retrieve(id));
      } else if (session.mode === 'payment' && session.payment_intent) {
        const order = await orderFromEvent(db, event, session.metadata, session.amount_total ?? 0);
        const intentId =
          typeof session.payment_intent === 'string'
            ? session.payment_intent
            : session.payment_intent.id;
        if (order?.kind === 'delivery') {
          await settleDelivery(db, stripe, event, order.id, intentId, session.metadata);
        } else if (order) {
          unwrap(
            await db.rpc('mark_order_authorized', {
              p_order_id: order.id,
              p_payment_intent_id: intentId,
            }),
          );
        }
      }
      break;
    }
    case 'checkout.session.expired': {
      const session = event.data.object;
      const order =
        session.mode === 'payment' && kindOf(session.metadata) === 'meal'
          ? await orderFromEvent(db, event, session.metadata)
          : null;
      if (order) unwrap(await db.rpc('mark_order_payment_failed', { p_order_id: order.id }));
      break;
    }
    case 'account.updated': {
      const account = event.data.object;
      const status = {
        charges_enabled: account.charges_enabled,
        payouts_enabled: account.payouts_enabled,
        details_submitted: account.details_submitted,
      };
      // Compte d'un restaurant ou d'un livreur : une seule des deux mises à jour s'applique.
      for (const table of ['merchant_stripe_accounts', 'courier_stripe_accounts']) {
        unwrap(await db.from(table).update(status).eq('stripe_account_id', account.id));
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted':
      await syncSubscription(db, event.data.object);
      break;
    default:
      // Événement non utilisé : accusé de réception simple.
      break;
  }
}

export const handler = handle(async (req) => {
  requireEnv('STRIPE_SECRET_KEY');
  const signature = req.headers.get('Stripe-Signature');
  if (!signature) throw new HttpError(400, 'invalid_signature');
  const payload = await req.text();
  const stripe = stripeClient();
  const event = await verify(stripe, payload, signature);

  const db = adminClient();
  const { data: seen } = await db
    .from('stripe_events')
    .select('id')
    .eq('id', event.id)
    .maybeSingle();
  if (seen) return json({ received: true, duplicate: true });

  await processEvent(db, stripe, event);
  // Enregistré après traitement : en cas d'erreur, Stripe renverra l'événement.
  await db.from('stripe_events').upsert({ id: event.id, type: event.type });
  return json({ received: true });
});
