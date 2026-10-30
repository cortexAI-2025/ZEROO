-- Index sur les clés étrangères les plus sollicitées (avertissement « unindexed_foreign_keys » de Supabase Advisors).
-- Sans index, la suppression ou la mise à jour d'une ligne parente (commerce, article, livreur) et les jointures par RLS
-- parcourent toute la table enfant ; invisible aujourd'hui (peu de lignes), coûteux à mesure que les commandes s'accumulent.
-- Uniquement les tables à forte croissance ou lues à chaque commande ; les tables d'administration (faible volume) sont laissées.
-- Application en production : tables petites, verrou d'écriture de quelques millisecondes ; à faire hors heures de commande.
create index if not exists orders_released_courier_id_idx on public.orders (released_courier_id) where released_courier_id is not null;
create index if not exists order_items_menu_item_id_idx on public.order_items (menu_item_id);
create index if not exists order_items_happy_hour_id_idx on public.order_items (happy_hour_id) where happy_hour_id is not null;
create index if not exists order_reviews_customer_id_idx on public.order_reviews (customer_id);
create index if not exists order_courier_skips_courier_id_idx on public.order_courier_skips (courier_id);
create index if not exists loyalty_cards_merchant_id_idx on public.loyalty_cards (merchant_id);
create index if not exists customer_favorites_merchant_id_idx on public.customer_favorites (merchant_id);
create index if not exists menu_items_merchant_id_idx on public.menu_items (merchant_id);
create index if not exists menu_option_groups_merchant_id_idx on public.menu_option_groups (merchant_id);
create index if not exists menu_options_merchant_id_idx on public.menu_options (merchant_id);
create index if not exists menu_item_slots_merchant_id_idx on public.menu_item_slots (merchant_id);
create index if not exists basket_reservations_basket_id_idx on public.basket_reservations (basket_id, merchant_id);
