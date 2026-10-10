import { HttpError, handle, json, readJson, requireEnv } from '../_shared/http.ts';
import { formatCents, formatTime } from '../_shared/format.ts';
import { type PushContent, sendPush } from '../_shared/push.ts';
import { adminClient, unwrap } from '../_shared/supabase.ts';

type Body = { order_id: string; status: string; previous_status: string | null };

type OrderForPush = {
  id: string;
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
  const { order_id, status, previous_status } = await readJson<Body>(req);

  const db = adminClient();
  const order = unwrap(
    await db
      .from('orders')
      .select(
        'id, customer_id, customer_name, pickup_code, total_cents, is_loyalty_reward, estimated_ready_at, refusal_reason, fulfillment, delivery_fee_cents, delivery_city, delivery_code, courier_name, cancelled_by, couriers(user_id), merchants(name, owner_id, timezone)',
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
        isDelivery
          ? await toCourier({
              title: 'Nouvelle course 🛵',
              body: `${merchant.name} → ${area} · ${formatCents(order.delivery_fee_cents)}. Confirmez la course.`,
              sound: 'new-order.wav',
              channelId: 'orders',
            })
          : { sent: 0 },
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
            ? `${merchant.name} prépare votre commande, ${courier} la livrera.`
            : readyAt
              ? `${merchant.name} prépare votre commande, prête vers ${readyAt}.`
              : `${merchant.name} prépare votre commande.`,
        }),
        isDelivery
          ? await toCourier({
              title: 'Course confirmée',
              body: readyAt
                ? `${merchant.name} prépare la commande ${order.pickup_code}, prête vers ${readyAt}.`
                : `${merchant.name} prépare la commande ${order.pickup_code}.`,
            })
          : { sent: 0 },
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
      // Seuls ceux qui avaient déjà reçu la commande sont prévenus.
      if (previous_status !== 'placed') break;
      if (order.cancelled_by === 'courier') {
        result = sum(
          await toCustomer({
            title: 'Livraison impossible',
            body: `Aucun livreur n’a pu prendre votre commande chez ${merchant.name}. Vous n’avez pas été débité.`,
          }),
          await toMerchant({
            title: 'Commande annulée',
            body: `Le livreur a décliné la commande ${order.pickup_code}.`,
          }),
        );
      } else {
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
      }
      break;
  }
  return json(result);
});
