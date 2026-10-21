import { HttpError, handle, json, readJson, requireEnv } from '../_shared/http.ts';
import { formatCents, formatTime } from '../_shared/format.ts';
import { type PushContent, sendPush } from '../_shared/push.ts';
import { adminClient, unwrap } from '../_shared/supabase.ts';

type Body = {
  order_id: string;
  status: string;
  previous_status: string | null;
  /** Absent : changement de statut. Sinon : événement de mission (livraison). */
  event?: 'mission_available' | 'courier_assigned' | 'mission_unclaimed';
};

type OrderForPush = {
  id: string;
  merchant_id: string;
  delivery_payment_method: 'card' | 'cash';
  customer_id: string | null;
  customer_name: string | null;
  pickup_code: string;
  total_cents: number;
  is_loyalty_reward: boolean;
  estimated_ready_at: string | null;
  refusal_reason: string | null;
  fulfillment: 'pickup' | 'delivery';
  delivery_fee_cents: number;
  delivery_city: string | null;
  delivery_code: string | null;
  courier_name: string | null;
  cancelled_by: string | null;
  couriers: { user_id: string } | null;
  merchants: { name: string; owner_id: string; timezone: string };
};

/**
 * Appelée par le trigger orders_notify_status_change (pg_net) à chaque changement de
 * statut utile : prévient le commerçant (nouvelle commande, annulation), le client et,
 * pour une livraison, le livreur.
 */
export const handler = handle(async (req) => {
  if (req.headers.get('x-cron-secret') !== requireEnv('CRON_SECRET'))
    throw new HttpError(401, 'unauthorized');
  const { order_id, status, previous_status, event } = await readJson<Body>(req);

  const db = adminClient();
  const order = unwrap(
    await db
      .from('orders')
      .select(
        'id, merchant_id, delivery_payment_method, customer_id, customer_name, pickup_code, total_cents, is_loyalty_reward, estimated_ready_at, refusal_reason, fulfillment, delivery_fee_cents, delivery_city, delivery_code, courier_name, cancelled_by, couriers(user_id), merchants(name, owner_id, timezone)',
      )
      .eq('id', order_id)
      .maybeSingle(),
  ) as unknown as OrderForPush | null;
  if (!order) return json({ sent: 0 });

  const merchant = order.merchants;
  const customer = order.customer_name ?? 'Un client';
  const toCustomer = (content: PushContent) =>
    order.customer_id
      ? sendPush(db, [order.customer_id], { data: { url: `/order/${order.id}` }, ...content })
      : { sent: 0 };
  const toMerchant = (content: PushContent) =>
    sendPush(db, [merchant.owner_id], { data: { url: '/pro' }, ...content });
  const isDelivery = order.fulfillment === 'delivery';
  const courierUser = order.couriers?.user_id;
  const toCourier = (content: PushContent) =>
    courierUser
      ? sendPush(db, [courierUser], { data: { url: '/livreur' }, ...content })
      : { sent: 0 };
  const sum = (...results: { sent: number }[]) => ({
    sent: results.reduce((total, r) => total + r.sent, 0),
  });
  // Le service de notifications est un tiers : la ville suffit, l'adresse est dans l'app.
  const area = order.delivery_city ?? '';
  const courier = order.courier_name ?? 'Votre livreur';

  if (event === 'mission_available') {
    // Tous les livreurs rattachés et disponibles : le premier qui accepte obtient la course.
    const links = unwrap(
      await db
        .from('merchant_couriers')
        .select('couriers(user_id, is_available, available_until)')
        .eq('merchant_id', order.merchant_id)
        .eq('status', 'approved'),
    ) as unknown as {
      couriers: { user_id: string; is_available: boolean; available_until: string | null } | null;
    }[];
    // Seulement les livreurs en ligne : disponibles et dont la fenêtre de présence n'a pas expiré.
    const userIds = links
      .map((link) => link.couriers)
      .filter(
        (c): c is { user_id: string; is_available: boolean; available_until: string } =>
          !!c?.is_available && !!c.available_until && Date.parse(c.available_until) > Date.now(),
      )
      .map((c) => c.user_id);
    if (userIds.length === 0) return json({ sent: 0 });
    return json(
      await sendPush(db, userIds, {
        data: { url: '/livreur' },
        title: 'Nouvelle mission 🛵',
        body: `${merchant.name} → ${area} · ${formatCents(order.delivery_fee_cents)}. Le premier qui accepte la prend.`,
        sound: 'new-order.wav',
        channelId: 'orders',
      }),
    );
  }
  if (event === 'mission_unclaimed') {
    // Personne n'a pris la livraison dans le délai : le client et le restaurant décident.
    return json(
      sum(
        await toCustomer({
          title: 'Pas encore de livreur',
          body: `Votre livraison de ${merchant.name} n'a pas encore de livreur. Patientez ou annulez la commande dans l'app.`,
          channelId: 'orders',
        }),
        await toMerchant({
          title: 'Livraison sans livreur',
          body: `Commande ${order.pickup_code} : aucun livreur depuis plus de 15 minutes.`,
          channelId: 'orders',
        }),
      ),
    );
  }
  if (event === 'courier_assigned') {
    return json(
      await toCustomer(
        order.delivery_payment_method === 'card'
          ? {
              title: `${courier} prend votre livraison 🛵`,
              body: `Réglez la livraison (${formatCents(order.delivery_fee_cents)}) avec son lien de paiement, dans l'app.`,
              channelId: 'orders',
            }
          : {
              title: `${courier} prend votre livraison 🛵`,
              body: `Prévoyez ${formatCents(order.delivery_fee_cents)} en espèces à lui remettre à la livraison.`,
            },
      ),
    );
  }

  let result: { sent: number } = { sent: 0 };
  switch (status) {
    case 'placed':
      result = sum(
        await toMerchant({
          title: isDelivery ? 'Nouvelle commande à livrer 🛵' : 'Nouvelle commande 🔔',
          body: `${customer} · ${formatCents(order.total_cents)}${order.is_loyalty_reward ? ' · menu offert' : ''}`,
          sound: 'new-order.wav',
          channelId: 'orders',
        }),
      );
      break;
    case 'accepted': {
      const readyAt = order.estimated_ready_at
        ? formatTime(order.estimated_ready_at, merchant.timezone)
        : null;
      result = sum(
        await toCustomer({
          title: 'Commande acceptée ✅',
          body: isDelivery
            ? `${merchant.name} prépare votre commande. Un livreur va la prendre en charge.`
            : readyAt
              ? `${merchant.name} prépare votre commande, prête vers ${readyAt}.`
              : `${merchant.name} prépare votre commande.`,
        }),
      );
      break;
    }
    case 'ready':
      result = isDelivery
        ? await toCourier({
            title: 'Commande prête 📦',
            body: `Récupérez la commande ${order.pickup_code} chez ${merchant.name}.`,
          })
        : await toCustomer({
            title: 'C’est prêt ! 🎉',
            body: `Votre commande chez ${merchant.name} vous attend. Code de retrait : ${order.pickup_code}`,
          });
      break;
    case 'out_for_delivery':
      result = await toCustomer({
        title: 'En route 🛵',
        body: `${courier} arrive avec votre commande. Code de livraison à lui donner : ${order.delivery_code}`,
      });
      break;
    case 'delivered':
      result = await toCustomer({
        title: 'Commande livrée 🎉',
        body: `Bon appétit ! Merci d’avoir commandé chez ${merchant.name}.`,
      });
      break;
    case 'refused':
      result = sum(
        await toCustomer({
          title: 'Commande non acceptée',
          body: `${merchant.name} n’a pas pu accepter votre commande${order.refusal_reason ? ` (${order.refusal_reason})` : ''}. Vous n’avez pas été débité.`,
        }),
        isDelivery
          ? await toCourier({
              title: 'Course annulée',
              body: `${merchant.name} n’a pas accepté la commande ${order.pickup_code}.`,
            })
          : { sent: 0 },
      );
      break;
    case 'expired':
      result = sum(
        await toCustomer({
          title: 'Commande non confirmée',
          body: `${merchant.name} n’a pas répondu à temps. Vous n’avez pas été débité.`,
        }),
        isDelivery
          ? await toCourier({
              title: 'Course annulée',
              body: `La commande ${order.pickup_code} n’a pas été confirmée à temps.`,
            })
          : { sent: 0 },
      );
      break;
    case 'cancelled':
      // Livraison annulée faute de livreur (après acceptation) : l'autre partie est prévenue.
      if (order.refusal_reason === 'no_courier') {
        result =
          order.cancelled_by === 'merchant'
            ? await toCustomer({
                title: 'Livraison annulée',
                body: `${merchant.name} a annulé votre livraison faute de livreur. Un éventuel remboursement du repas se règle directement avec le restaurant.`,
              })
            : await toMerchant({
                title: 'Commande annulée',
                body: `${customer} a annulé la commande ${order.pickup_code} (aucun livreur).`,
              });
        break;
      }
      // Seuls ceux qui avaient déjà reçu la commande sont prévenus.
      if (previous_status !== 'placed') break;
      result = sum(
        await toMerchant({
          title: 'Commande annulée',
          body: `${customer} a annulé sa commande ${order.pickup_code}.`,
        }),
        isDelivery
          ? await toCourier({
              title: 'Course annulée',
              body: `Le client a annulé la commande ${order.pickup_code}.`,
            })
          : { sent: 0 },
      );
      break;
  }
  return json(result);
});
