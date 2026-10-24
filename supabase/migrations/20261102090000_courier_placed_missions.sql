-- Allow couriers to claim a delivery at 'placed' before merchant acceptance.
-- Keep all other authorization, capacity, scheduling and compatibility checks intact.
do $$
declare fn text; original text; changed text;
begin
  foreach fn in array array['available_missions', 'courier_accept_mission'] loop
    select pg_get_functiondef(oid) into original
    from pg_proc where pronamespace = 'public'::regnamespace and proname = fn;
    if original is null then raise exception 'Function missing: %', fn; end if;
    changed := replace(original,
      'o.status in (' || quote_literal('accepted') || ', ' || quote_literal('preparing') || ', ' || quote_literal('ready') || ')',
      'o.status in (' || quote_literal('placed') || ', ' || quote_literal('accepted') || ', ' || quote_literal('preparing') || ', ' || quote_literal('ready') || ')');
    if changed = original then raise exception 'Status filter not found: %', fn; end if;
    execute changed;
  end loop;
end $$;
