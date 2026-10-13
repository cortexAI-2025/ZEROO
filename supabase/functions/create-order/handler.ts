import { HttpError, handle, json, readJson } from '../_shared/http.ts';
import type { OrderRow } from '../_shared/orders.ts';
import { adminClient, requireUser, unwrap } from '../_shared/supabase.ts';

type Body = {
  merchantId: string;
  /** useReward : une unité de cette ligne (menu formule) est le menu offert par la fidélité. */
  items: { itemId: string; quantity: number; optionIds?: string[]; useReward?: boolean }[];
  note?: string;
  /** Repas : carte via le lien du restaurant (défaut) ou espèces au comptoir (retrait). */
  mealPayment?: 'card' | 'cash';
  /** Livraison : carte via le lien du livreur ou espèces remises au livreur. */
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

/**
 * Crée la commande (prix recalculés en base) et l'envoie aussitôt au restaurant. Aucun
 * paiement ici : ZeeRoo n'encaisse rien. Le client paie le repas via le lien de paiement du
 * restaurant une fois la commande acceptée (ou en espèces au comptoir), et la livraison via
 * le lien du livreur qui prend la mission (ou en espèces à la livraison).
 */
export const handler = handle(async (req) => {
  const user = await requireUser(req);
  const body = await readJson<Body>(req);
  if (!body?.merchantId || !Array.isArray(body.items)) throw new HttpError(400, 'invalid_body');

  const db = adminClient();
  const mealPayment = body.mealPayment ?? 'card';
  if (mealPayment === 'card') {
    const merchant = unwrap(
      await db.from('merchants').select('payment_link').eq('id', body.merchantId).maybeSingle(),
    ) as { payment_link: string | null } | null;
    if (!merchant?.payment_link) throw new HttpError(400, 'merchant_no_payment_link');
  }

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
      p_meal_payment: mealPayment,
      p_delivery_payment: body.deliveryPayment ?? 'card',
    }),
  ) as OrderRow;

  // Carte : pas de paiement préalable, la commande part tout de suite au restaurant.
  if (order.status === 'pending_payment') {
    unwrap(
      await db.rpc('mark_order_authorized', { p_order_id: order.id, p_payment_intent_id: null }),
    );
  }
  return json({ orderId: order.id });
});
