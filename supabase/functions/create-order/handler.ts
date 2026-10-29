import { HttpError, handle, json, readJson } from '../_shared/http.ts';
import type { OrderRow } from '../_shared/orders.ts';
import { adminClient, requireAccountSpace, requireUser, unwrap } from '../_shared/supabase.ts';

/**
 * Lien de paiement du restaurant. Après la migration 20261029120000 il vit dans la table fermée
 * `merchant_private` ; avant la migration (ou après un retour arrière) dans la colonne de `merchants`.
 * Les deux sont lues : cette fonction peut donc être déployée AVANT la migration et reste valable après un
 * retour arrière, sans fenêtre où les paiements par carte seraient refusés.
 */
async function paymentLink(db: ReturnType<typeof adminClient>, merchantId: string) {
  const priv = await db
    .from('merchant_private')
    .select('payment_link')
    .eq('merchant_id', merchantId)
    .maybeSingle(); // table absente avant la migration : erreur ignorée, on lit la colonne historique
  const fromPrivate = (priv.data as { payment_link: string | null } | null)?.payment_link;
  if (fromPrivate) return fromPrivate;
  const legacy = await db
    .from('merchants')
    .select('payment_link')
    .eq('id', merchantId)
    .maybeSingle();
  return (legacy.data as { payment_link: string | null } | null)?.payment_link ?? null;
}

type Body = {
  merchantId: string;
  /** useReward : une unité de cette ligne (menu formule) est le menu offert par la fidélité. */
  items: {
    itemId: string;
    quantity: number;
    optionIds?: string[];
    useReward?: boolean;
    /** Prix annoncé au client pour la ligne : refusé si l'offre ou le prix a changé. */
    expectedTotalCents?: number;
  }[];
  note?: string;
  /** Repas : carte via le lien du restaurant (défaut) ou espèces au comptoir (retrait). */
  mealPayment?: 'card' | 'cash';
  /** Livraison : carte via le lien du livreur ou espèces remises au livreur. */
  deliveryPayment?: 'card' | 'cash';
  /** Précommande : instant ISO. Absent : dès que possible. */
  scheduledFor?: string;
  /** Commande groupée entreprise (formule Pro de l'établissement). */
  group?: { companyName: string; headcount: number };
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
  await requireAccountSpace(db, user.id, 'client');
  const mealPayment = body.mealPayment ?? 'card';
  if (mealPayment === 'card') {
    if (!(await paymentLink(db, body.merchantId)))
      throw new HttpError(400, 'merchant_no_payment_link');
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
        expected_total_cents: i.expectedTotalCents ?? null,
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
      p_scheduled_for: body.scheduledFor ?? null,
      p_group: body.group
        ? { company_name: body.group.companyName, headcount: body.group.headcount }
        : null,
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
