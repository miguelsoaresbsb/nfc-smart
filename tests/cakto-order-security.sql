-- Run after bind_refunds_to_paid_orders. All payment fixtures roll back.
BEGIN;
DO $$
#variable_conflict use_variable
DECLARE
  company_id uuid := gen_random_uuid();
  user_id uuid := gen_random_uuid();
  customer_email text := 'billing-audit-' || user_id || '@example.invalid';
  contract_id text := 'billing-audit-' || gen_random_uuid();
  first_order text := 'billing-audit-' || gen_random_uuid();
  next_order text := 'billing-audit-' || gen_random_uuid();
  forged_company uuid := gen_random_uuid();
  forged_email text := 'forged-buyer-' || user_id || '@example.invalid';
  event jsonb;
  result jsonb;
  expected_expiry timestamptz := statement_timestamp() + interval '28 days';
  later_expiry timestamptz := statement_timestamp() + interval '29 days 6 hours';
  actual_expiry timestamptz;
  actual_status text;
BEGIN
  IF has_function_privilege('anon','public.process_cakto_event(jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','public.process_cakto_event(jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Public role can activate subscriptions';
  END IF;
  IF has_function_privilege('anon','private.is_verified_cakto_buyer(uuid,text)','EXECUTE')
    OR has_function_privilege('authenticated','private.is_verified_cakto_buyer(uuid,text)','EXECUTE') THEN
    RAISE EXCEPTION 'Public role can probe canonical buyer verification';
  END IF;
  INSERT INTO auth.users(id,email,email_confirmed_at) VALUES(user_id,customer_email,now());
  INSERT INTO public.companies(id,name,slug) VALUES(company_id,'Billing audit','billing-audit-'||company_id);
  INSERT INTO public.company_members(company_id,user_id,role) VALUES(company_id,user_id,'owner');
  INSERT INTO public.access_requests(name,email,company_name,user_id,status,company_id)
  VALUES('Billing audit',customer_email,'Billing audit',user_id,'approved',company_id);
  INSERT INTO public.subscriptions(company_id,status) VALUES(company_id,'pending');
  event := jsonb_build_object('event_type','purchase_approved','order_id',first_order,'product_id','billing-audit-product',
    'subscription_id',contract_id,'customer_email',customer_email,
    'paid_at',statement_timestamp()-interval '2 days','event_at',statement_timestamp()-interval '2 days','period_end',expected_expiry);
  INSERT INTO public.companies(id,name,slug) VALUES(forged_company,'Forged request audit','forged-billing-audit-'||forged_company);
  INSERT INTO public.company_members(company_id,user_id,role) VALUES(forged_company,user_id,'owner');
  INSERT INTO public.access_requests(name,email,company_name,user_id,status,company_id)
  VALUES('Forged request',forged_email,'Forged request audit',user_id,'approved',forged_company);
  INSERT INTO public.subscriptions(company_id,status) VALUES(forged_company,'pending');
  BEGIN
    PERFORM public.process_cakto_event(event || jsonb_build_object('customer_email',forged_email,'order_id','forged-'||first_order,'subscription_id','forged-'||contract_id));
    RAISE EXCEPTION 'Forged request email captured another buyer payment';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'approved_company_not_found' THEN RAISE; END IF;
  END;
  PERFORM public.process_cakto_event(event);
  -- A lifecycle notification at -12h must not suppress a valid payment at
  -- -18h that arrives later; payment ordering uses a separate paid watermark.
  PERFORM public.process_cakto_event(event || jsonb_build_object('event_type','subscription_canceled','event_at',statement_timestamp()-interval '12 hours'));
  PERFORM public.process_cakto_event(event || jsonb_build_object('order_id',next_order,
    'paid_at',statement_timestamp()-interval '18 hours','event_at',statement_timestamp()-interval '18 hours','period_end',later_expiry));
  SELECT s.status,s.expires_at INTO actual_status,actual_expiry FROM public.subscriptions s WHERE s.company_id=company_id;
  IF actual_status<>'active' OR actual_expiry<>later_expiry THEN RAISE EXCEPTION 'Lifecycle timestamp incorrectly suppressed valid payment'; END IF;
  result := public.process_cakto_event(event || jsonb_build_object('event_type','refund','event_at',statement_timestamp()-interval '1 hour'));
  IF result->>'outcome'<>'other_paid_order_refund_ignored' THEN RAISE EXCEPTION 'Refund was not bound to original paid order'; END IF;
  SELECT s.status,s.expires_at INTO actual_status,actual_expiry FROM public.subscriptions s WHERE s.company_id=company_id;
  IF actual_status<>'active' OR actual_expiry<>later_expiry THEN RAISE EXCEPTION 'Old order refund removed newer paid month'; END IF;
  PERFORM public.process_cakto_event(event || jsonb_build_object('event_type','refund','order_id',next_order,'event_at',statement_timestamp()-interval '30 minutes'));
  result := public.process_cakto_event(event || jsonb_build_object('event_type','subscription_resumed','order_id',next_order,
    'paid_at',statement_timestamp()-interval '18 hours','event_at',statement_timestamp()-interval '18 hours','period_end',later_expiry));
  IF result->>'outcome'<>'revoked_order_ignored' THEN RAISE EXCEPTION 'Refunded order was reactivated'; END IF;
  SELECT s.status INTO actual_status FROM public.subscriptions s WHERE s.company_id=company_id;
  IF actual_status<>'canceled' THEN RAISE EXCEPTION 'Refund did not preserve revocation'; END IF;
  BEGIN
    PERFORM public.process_cakto_event(event || jsonb_build_object('order_id','long-'||next_order,
      'paid_at',statement_timestamp(),'event_at',statement_timestamp(),'period_end',statement_timestamp()+interval '365 days'));
    RAISE EXCEPTION 'Year of access accepted for monthly product';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'invalid_payment_period' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.process_cakto_event(event || jsonb_build_object('order_id','future-'||next_order,
      'paid_at',statement_timestamp()+interval '1 day','period_end',statement_timestamp()+interval '31 days'));
    RAISE EXCEPTION 'Future payment activated access';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'invalid_payment_period' THEN RAISE; END IF;
  END;
  UPDATE public.subscriptions s SET status='active',expires_at=NULL WHERE s.company_id=company_id;
  BEGIN
    PERFORM public.process_cakto_event(event || jsonb_build_object('order_id','other-'||next_order,'subscription_id','other-'||contract_id,
      'paid_at',statement_timestamp(),'event_at',statement_timestamp(),'period_end',statement_timestamp()+interval '30 days'));
    RAISE EXCEPTION 'Unexpired legacy contract was replaced';
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM<>'active_contract_already_linked' THEN RAISE; END IF;
  END;
END $$;
ROLLBACK;
SELECT 'Billing security assertions passed; all fixtures rolled back' AS result;
