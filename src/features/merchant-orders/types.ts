import type { Enums, Tables } from '@/types/database';

export type OrderStatus = Enums<'order_status'>;
export type OrderItemOption = { group: string; name: string; price_delta_cents: number };
export type OrderItem = Omit<Tables<'order_items'>, 'options'> & { options: OrderItemOption[] };
export type Order = Tables<'orders'> & { order_items: OrderItem[] };

export const ACTIVE_STATUSES = [
  'placed',
  'accepted',
  'preparing',
  'ready',
] as const satisfies OrderStatus[];
export const PREP_TIME_CHOICES = [5, 10, 15, 20, 30, 45] as const;
