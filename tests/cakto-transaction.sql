-- Run after the atomic_cakto_webhook migration. Every fixture rolls back.
begin;
do $$
declare
  v_company uuid := gen_random_uuid();
  v_user uuid := gen_random_uuid();
  v_email text := 'cakto-regression-' || v_user || '@example.invalid';
  v_order text := 'test-' || gen_random_uuid();
  v_contract text := 'test-' || gen_random_uuid();
  v_event jsonb;
  v_result jsonb;
  v_expiry timestamptz := statement_timestamp() + interval '28 days';
  v_actual timestamptz;
  v_status text;
begin
  if has_function_privilege('anon','public.process_cakto_event(jsonb)','EXECUTE')
     or has_function_privilege('authenticated','public.process_cakto_event(jsonb)','EXECUTE') then
    raise exception 'webhook RPC is callable by public clients';
  end if;
  insert into auth.users(id,email) values(v_user,v_email);
  insert into public.companies(id,name,slug) values(v_company,'Cakto regression', 'cakto-regression-' || v_company);
  insert into public.company_members(company_id,user_id,role) values(v_company,v_user,'owner');
  insert into public.access_requests(name,email,company_name,user_id,status,company_id)
    values('Regression',v_email,'Cakto regression',v_user,'approved',v_company);
  insert into public.subscriptions(company_id,plan,status) values(v_company,'monthly','pending');
  v_event := jsonb_build_object('event_type','purchase_approved','order_id',v_order,'product_id','test-product',
    'subscription_id',v_contract,'customer_email',upper(v_email),'customer_id','test-customer',
    'paid_at',statement_timestamp()-interval '2 days','event_at',statement_timestamp()-interval '2 days','period_end',v_expiry);
  v_result := public.process_cakto_event(v_event);
  if v_result->>'outcome'<>'processed' then raise exception 'first payment failed: %',v_result; end if;
  select status,expires_at into v_status,v_actual from public.subscriptions where company_id=v_company;
  if v_status<>'active' or v_actual<>v_expiry then raise exception 'paid access not activated'; end if;
  v_result := public.process_cakto_event(v_event);
  if v_result->>'outcome'<>'duplicate' then raise exception 'duplicate delivery not deduplicated'; end if;
  perform public.process_cakto_event(v_event || jsonb_build_object('event_type','subscription_renewed'));
  select expires_at into v_actual from public.subscriptions where company_id=v_company;
  if v_actual<>v_expiry then raise exception 'same payment extended access twice'; end if;
  perform public.process_cakto_event(v_event || jsonb_build_object('event_type','subscription_canceled','event_at',statement_timestamp()-interval '1 day'));
  perform public.process_cakto_event(v_event || jsonb_build_object('event_type','subscription_renewal_refused','event_at',statement_timestamp()-interval '12 hours'));
  select status,expires_at into v_status,v_actual from public.subscriptions where company_id=v_company;
  if v_status<>'active' or v_actual<>v_expiry then raise exception 'cancellation/refusal removed paid access'; end if;
  v_result := public.process_cakto_event(v_event || jsonb_build_object('event_type','refund','subscription_id','unrelated-'||v_contract,'order_id',v_order||'-unrelated'));
  if v_result->>'outcome'<>'unlinked_contract_ignored' then raise exception 'unrelated refund was not ignored'; end if;
  perform public.process_cakto_event(v_event || jsonb_build_object('event_type','refund','event_at',statement_timestamp()-interval '1 hour'));
  select status into v_status from public.subscriptions where company_id=v_company;
  if v_status<>'canceled' then raise exception 'refund did not revoke access'; end if;
  v_result := public.process_cakto_event(v_event || jsonb_build_object('event_type','subscription_late_recovered'));
  if v_result->>'outcome' not in ('revoked_order_ignored','stale_event_ignored') then raise exception 'delayed approval reactivated refund'; end if;
  select status into v_status from public.subscriptions where company_id=v_company;
  if v_status<>'canceled' then raise exception 'refund was reactivated'; end if;
  perform public.process_cakto_event(v_event || jsonb_build_object('event_type','purchase_approved','order_id',v_order||'-new',
    'paid_at',statement_timestamp(),'event_at',statement_timestamp()));
  select status into v_status from public.subscriptions where company_id=v_company;
  if v_status<>'active' then raise exception 'new valid payment failed to restore access'; end if;
  if exists(select 1 from public.webhook_events where external_event_id='purchase_approved:'||v_order and payload ? 'customer_email') then
    raise exception 'ledger contains private email';
  end if;
end;
$$;
rollback;
