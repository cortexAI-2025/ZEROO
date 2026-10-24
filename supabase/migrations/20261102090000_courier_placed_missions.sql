-- Delivery assignment sequencing fix.
-- Couriers must be able to claim a newly placed delivery before merchant acceptance.
-- Preserve all existing guards by altering only the two status predicates.
do $$
declare
  fn text;
  definition text;
  updated text;
begin
  foreach fn in array array['available_missions', 'courier_accept_mission'] loop
    select pg_get_functiondef(p.oid) into definition
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = fn;
    if definition is null then
      raise exception 'Missing required function: %', fn;
    end if;
    updated := replace(
      definition,
      'o.status in (' || quote_literal('accepted') || ', ' || quote_literal('preparing') || ', ' || quote_literal('ready') || ')',
      'o.status in (' || quote_literal('placed') || ', ' || quote_literal('accepted') || ', ' || quote_literal('preparing') || ', ' || quote_literal('ready') || ')'
    );
    if updated = definition then
      raise exception 'Expected status filter missing from %', fn;
    end if;
    execute updated;
  end loop;
end $$;
