-- Depuis la prise de mission dès la commande placée, un livreur peut être affecté à une commande que le
-- restaurant refuse (ou qui expire, ou que le client annule) avant l'acceptation. Il est alors libéré :
-- l'affectation est retirée de la commande, qui ne le compte plus, et il est prévenu par notification.
-- La commande garde une trace de l'ancien livreur (`released_courier_id`, pour la notification et l'audit).
-- Les paiements déjà déclarés ne sont pas modifiés : ils se règlent directement entre les parties.

alter table public.orders
  add column released_courier_id uuid references public.couriers (id) on delete set null;

create or replace function public.release_courier_on_closed_order()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status in ('refused', 'expired', 'cancelled') and old.courier_id is not null then
    new.released_courier_id := old.courier_id;
    new.courier_id := null;
    new.courier_name := null;
    new.courier_accepted_at := null;
    new.delivery_payment_due_at := null;
  end if;
  return new;
end;
$$;

create trigger orders_release_courier
  before update of status on public.orders
  for each row
  when (new.status is distinct from old.status)
  execute function public.release_courier_on_closed_order();

revoke execute on function public.release_courier_on_closed_order() from public, anon, authenticated;
