-- Prevent direct API execution of trigger-only SECURITY DEFINER routines.
-- Existing database triggers remain functional.
revoke execute on function public.anonymize_orders_on_courier_delete() from public, anon, authenticated;
revoke execute on function public.anonymize_orders_on_profile_delete() from public, anon, authenticated;
revoke execute on function public.anonymize_reservations_on_profile_delete() from public, anon, authenticated;
revoke execute on function public.apply_loyalty_on_status_change() from public, anon, authenticated;
revoke execute on function public.check_group_orders_option() from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.notify_mission_events() from public, anon, authenticated;
revoke execute on function public.notify_order_status_change() from public, anon, authenticated;
revoke execute on function public.notify_unclaimed_mission() from public, anon, authenticated;
revoke execute on function public.release_happy_hour_quota() from public, anon, authenticated;
revoke execute on function public.route_merchant_location() from public, anon, authenticated;
