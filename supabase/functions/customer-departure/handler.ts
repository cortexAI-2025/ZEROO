import { HttpError, handle, json, readJson } from '../_shared/http.ts';
import { formatTime } from '../_shared/format.ts';
import { sendPush } from '../_shared/push.ts';
import { type TravelMode, travelSeconds } from '../_shared/routes.ts';
import { adminClient, requireUser, unwrap } from '../_shared/supabase.ts';

type Body = { orderId: string; latitude: number; longitude: number; mode: TravelMode };

const MODES: TravelMode[] = ['walk', 'bike', 'drive'];
const MODE_EMOJI: Record<TravelMode, string> = { walk: '🚶', bike: '🚲', drive: '🚗' };
/** Un nouveau calcul au plus par minute et par commande (coût de l'API Routes). */
const MIN_INTERVAL_MS = 60_000;

/**
 * « Je pars maintenant » : calcule l'heure d'arrivée du client et prévient le commerçant,
 * qui lance la préparation au bon moment. La position n'est utilisée que pour ce calcul,
 * elle n'est ni enregistrée ni journalisée.
 */
export const handler = handle(async (req) => {
  const user = await requireUser(req);
  const body = await readJson<Body>(req);
  const valid =
    body?.orderId &&
    Number.isFinite(body.latitude) &&
    Math.abs(body.latitude) <= 90 &&
    Number.isFinite(body.longitude) &&
    Math.abs(body.longitude) <= 180 &&
    MODES.includes(body.mode);
  if (!valid) throw new HttpError(400, 'invalid_body');

  const db = adminClient();
  const order = unwrap(
    await db
      .from('orders')
      .select(
        'id, merchant_id, customer_id, customer_name, pickup_code, status, customer_departed_at, customer_eta_at, merchants(name, owner_id, timezone)',
      )
      .eq('id', body.orderId)
      .maybeSingle(),
  ) as unknown as {
    id: string;
    merchant_id: string;
    customer_id: string;
    customer_name: string | null;
    pickup_code: string;
    status: string;
    customer_departed_at: string | null;
    customer_eta_at: string | null;
    merchants: {
      name: string;
      owner_id: string;
      timezone: string;
    };
  } | null;
  if (!order || order.customer_id !== user.id) throw new HttpError(404, 'order_not_found');
  if (!['placed', 'accepted', 'preparing', 'ready'].includes(order.status))
    throw new HttpError(409, 'invalid_transition');

  if (
    order.customer_departed_at &&
    Date.now() - Date.parse(order.customer_departed_at) < MIN_INTERVAL_MS
  ) {
    return json({ etaAt: order.customer_eta_at, throttled: true });
  }

  const merchant = order.merchants;
  // Position précise : table fermée au public, lue ici avec la clé de service.
  const { data: place } = await db
    .from('merchant_locations')
    .select('latitude, longitude')
    .eq('merchant_id', order.merchant_id)
    .single();
  if (!place) throw new HttpError(404, 'order_not_found');
  const travel = await travelSeconds(
    { latitude: body.latitude, longitude: body.longitude },
    { latitude: place.latitude, longitude: place.longitude },
    body.mode,
  );
  const updated = unwrap(
    await db.rpc('set_customer_departure', {
      p_order_id: order.id,
      p_customer_id: user.id,
      p_travel_seconds: travel.seconds,
      p_mode: body.mode,
    }),
  ) as { customer_eta_at: string };

  const minutes = Math.max(1, Math.round(travel.seconds / 60));
  await sendPush(db, [merchant.owner_id], {
    title: `Client en route ${MODE_EMOJI[body.mode]}`,
    body: `${order.customer_name ?? 'Votre client'} arrive vers ${formatTime(updated.customer_eta_at, merchant.timezone)} (dans ${minutes} min) · commande ${order.pickup_code}`,
    data: { url: '/pro' },
    channelId: 'orders',
  });

  return json({
    etaAt: updated.customer_eta_at,
    travelSeconds: travel.seconds,
    source: travel.source,
  });
});
