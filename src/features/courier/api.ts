import { callFunction } from '@/lib/functions';
import { supabase } from '@/lib/supabase';

import type { CourierFormValues } from './schemas';
import {
  type Courier,
  type CourierLink,
  type CourierRun,
  type Earnings,
  type Mission,
  RUN_ACTIVE_STATUSES,
} from './types';

const RUN_SELECT =
  '*, order_items(*), merchants(name, address_line, postal_code, city, latitude, longitude, phone)';

export async function fetchMyCourier(userId: string) {
  const { data, error } = await supabase
    .from('couriers')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data as Courier | null;
}

export async function createCourier(values: CourierFormValues) {
  const { data, error } = await supabase.rpc('create_courier', {
    p_display_name: values.displayName,
    p_phone: values.phone,
    p_legal_status: values.legalStatus,
    p_siret: values.siret,
    p_vehicle: values.vehicle,
  });
  if (error) throw error;
  return data;
}

/** Disponible : exige paiements, abonnement et un restaurant (vérifié en base). */
export async function setAvailability(available: boolean) {
  const { error } = await supabase.rpc('set_courier_availability', { p_available: available });
  if (error) throw error;
}

export async function fetchActiveRuns(courierId: string) {
  const { data, error } = await supabase
    .from('orders')
    .select(RUN_SELECT)
    .eq('courier_id', courierId)
    .in('status', RUN_ACTIVE_STATUSES)
    .order('placed_at', { ascending: true });
  if (error) throw error;
  return data as unknown as CourierRun[];
}

export async function fetchDeliveredRuns(courierId: string, limit = 30) {
  const { data, error } = await supabase
    .from('orders')
    .select(RUN_SELECT)
    .eq('courier_id', courierId)
    .eq('status', 'delivered')
    .order('delivered_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data as unknown as CourierRun[];
}

/** Missions proposées (commandes acceptées par le restaurant, sans livreur) : voir available_missions. */
export async function fetchMissions() {
  const { data, error } = await supabase.rpc('available_missions');
  if (error) throw error;
  return data as Mission[];
}

/** Le premier livreur qui accepte obtient la course ; les autres reçoivent mission_unavailable. */
export async function acceptMission(orderId: string) {
  const { error } = await supabase.rpc('courier_accept_mission', { p_order_id: orderId });
  if (error) throw error;
}

/** Renoncer à une mission non encore payée : elle retourne dans le pool (paiement ouvert annulé côté serveur). */
export async function declineRun(orderId: string) {
  await callFunction('courier-decline', { orderId });
}

export async function markDelivered(orderId: string, deliveryCode: string) {
  const { error } = await supabase.rpc('courier_mark_delivered', {
    p_order_id: orderId,
    p_delivery_code: deliveryCode.trim(),
  });
  if (error) throw error;
}

export async function fetchEarnings(): Promise<Earnings> {
  const { data, error } = await supabase.rpc('courier_earnings_summary');
  if (error) throw error;
  return (data as Earnings[])[0];
}

export async function fetchMyLinks(courierId: string) {
  const { data, error } = await supabase
    .from('merchant_couriers')
    .select(
      '*, merchants(name, city, slug, delivery_enabled, delivery_fee_cents, delivery_radius_m)',
    )
    .eq('courier_id', courierId)
    .order('requested_at', { ascending: false });
  if (error) throw error;
  return data as unknown as CourierLink[];
}

export async function requestLink(merchantId: string) {
  const { error } = await supabase.rpc('request_merchant_link', { p_merchant_id: merchantId });
  if (error) throw error;
}

export async function leaveMerchant(merchantId: string) {
  const { error } = await supabase.rpc('leave_merchant', { p_merchant_id: merchantId });
  if (error) throw error;
}
