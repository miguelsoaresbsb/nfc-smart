-- Owner-run integration regression. Every identity, ledger and alert rolls back.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('871ca100-0000-4000-8000-000000000001','operations-admin@example.invalid',now());
INSERT INTO public.platform_admins(user_id) VALUES('871ca100-0000-4000-8000-000000000001');
INSERT INTO auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at,secret)
VALUES('871ca100-0000-4000-8000-000000000002','871ca100-0000-4000-8000-000000000001','Rollback fixture','totp','verified',now(),now(),'fixture-not-an-authenticator-secret');
INSERT INTO auth.sessions(id,user_id,factor_id,aal,not_after)
VALUES('871ca100-0000-4000-8000-000000000003','871ca100-0000-4000-8000-000000000001','871ca100-0000-4000-8000-000000000002','aal2',now()+interval '1 hour');
SELECT set_config('request.jwt.claim.sub','871ca100-0000-4000-8000-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"871ca100-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"871ca100-0000-4000-8000-000000000003"}',true);
SELECT set_config('test.operations.funnel_before',public.admin_sales_funnel(0)::text,true);
DO $$ BEGIN
 IF has_function_privilege('anon','public.record_cakto_failure(jsonb)','EXECUTE') OR has_function_privilege('authenticated','public.record_cakto_failure(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Public roles can forge monitoring records'; END IF;
 IF NOT has_function_privilege('service_role','public.record_cakto_failure(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Service cannot record authenticated failures'; END IF;
 IF has_function_privilege('authenticated','private.refresh_operational_alerts_internal()','EXECUTE') OR has_function_privilege('service_role','private.refresh_operational_alerts_internal()','EXECUTE') THEN RAISE EXCEPTION 'Internal cron entrypoint exposed'; END IF;
 IF has_table_privilege('authenticated','public.billing_alerts','INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'Customer can change monitoring table directly'; END IF;
END $$;
INSERT INTO auth.users(id,email,email_confirmed_at,created_at)
SELECT ('871ca100-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'operations-fixture-'||n||'@example.invalid',CASE WHEN n=11 THEN NULL ELSE now() END,now() FROM generate_series(11,16)n;
INSERT INTO public.companies(id,name,slug,description,phone,phone_enabled,whatsapp_enabled)
SELECT ('871ca100-0000-4000-8000-'||lpad((n+90)::text,12,'0'))::uuid,'Operations fixture '||n,'operations-fixture-'||n,CASE WHEN n=15 THEN 'Apresentação preenchida' ELSE '' END,CASE WHEN n=15 THEN '61999999999' ELSE '' END,n=15,false FROM generate_series(13,16)n;
INSERT INTO public.company_members(company_id,user_id,role)
SELECT ('871ca100-0000-4000-8000-'||lpad((n+90)::text,12,'0'))::uuid,('871ca100-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'owner' FROM generate_series(13,16)n;
INSERT INTO public.access_requests(name,email,company_name,user_id,status,company_id)
SELECT 'Operations fixture '||n,'operations-fixture-'||n||'@example.invalid','Operations fixture '||n,('871ca100-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'approved',('871ca100-0000-4000-8000-'||lpad((n+90)::text,12,'0'))::uuid FROM generate_series(13,16)n;
INSERT INTO public.subscriptions(company_id,status,expires_at,cakto_subscription_id,cakto_product_id,cakto_current_paid_at)
SELECT ('871ca100-0000-4000-8000-'||lpad((n+90)::text,12,'0'))::uuid,CASE WHEN n=16 THEN 'expired' ELSE 'active' END,CASE WHEN n=16 THEN now()-interval '1 day' ELSE now()+interval '7 days' END,'operations-contract-'||n,'operations-product',now()-interval '1 hour' FROM generate_series(13,16)n;
-- The legacy fixture deliberately has a paid timestamp but no accepted ledger.
INSERT INTO public.webhook_events(provider,external_event_id,event_type,processed_at,payload)
SELECT 'cakto','purchase_approved:operations-order-'||n,'purchase_approved',now(),jsonb_build_object('event_type','purchase_approved','order_id','operations-order-'||n,'subscription_id','operations-contract-'||n,'product_id','operations-product','outcome','processed','paid_at',now()-interval '1 hour','event_at',now()-interval '1 hour','period_end',CASE WHEN n=16 THEN now()-interval '1 day' ELSE now()+interval '7 days' END) FROM generate_series(14,16)n;
SET LOCAL ROLE authenticated;
DO $$
DECLARE before jsonb:=current_setting('test.operations.funnel_before')::jsonb; after jsonb; entry record;
BEGIN
 after:=public.admin_sales_funnel(0);
 FOR entry IN SELECT * FROM (VALUES('registered',6),('confirmed',5),('approved',4),('paid',3),('ready',1),('legacy_active_without_evidence',1)) expected(key,delta) LOOP
  IF (after->>entry.key)::bigint-(before->>entry.key)::bigint<>entry.delta THEN RAISE EXCEPTION 'Incorrect funnel stage %: % vs %',entry.key,after,before; END IF;
 END LOOP;
 IF (after->>'ready')::bigint>(after->>'paid')::bigint OR (after->>'paid')::bigint>(after->>'approved')::bigint OR (after->>'approved')::bigint>(after->>'confirmed')::bigint OR (after->>'confirmed')::bigint>(after->>'registered')::bigint THEN RAISE EXCEPTION 'Nonmonotonic funnel'; END IF;
 PERFORM public.admin_sales_funnel(7); PERFORM public.admin_sales_funnel(30); PERFORM public.admin_sales_funnel(90);
 BEGIN PERFORM public.admin_sales_funnel(14); RAISE EXCEPTION 'Invalid cohort accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"871ca100-0000-4000-8000-000000000001","role":"authenticated","aal":"aal1","session_id":"871ca100-0000-4000-8000-000000000003"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.billing_alerts) THEN RAISE EXCEPTION 'AAL1 administrator reads alerts'; END IF;
 BEGIN PERFORM public.admin_sales_funnel(0); RAISE EXCEPTION 'AAL1 administrator reads funnel'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.admin_billing_alerts(); RAISE EXCEPTION 'AAL1 administrator calls list'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.refresh_operational_alerts(); RAISE EXCEPTION 'AAL1 administrator refreshes'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"871ca100-0000-4000-8000-000000000001","role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT public.record_cakto_failure('{"event_type":"purchase_approved","order_id":"operations-retry","subscription_id":"operations-contract-15","product_id":"operations-product","reason_code":"invalid_payment_amount","customer_email":"never-persist@example.invalid","error":"never-persist-secret"}'::jsonb);
SELECT public.record_cakto_failure('{"event_type":"purchase_approved","order_id":"operations-retry","subscription_id":"operations-contract-15","product_id":"operations-product","reason_code":"invalid_payment_amount"}'::jsonb);
SELECT public.record_cakto_failure('{"event_type":"purchase_approved","order_id":"operations-unbound","subscription_id":"operations-unknown","product_id":"operations-product","reason_code":"unknown error containing secret"}'::jsonb);
DO $$ BEGIN
 BEGIN PERFORM public.record_cakto_failure('{"event_type":"bad","order_id":"operations-bad","product_id":"operations-product"}'::jsonb); RAISE EXCEPTION 'Invalid event accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.record_cakto_failure('{"event_type":"purchase_approved","order_id":"customer@example.invalid","subscription_id":"<script>","product_id":"operations-product"}'::jsonb); RAISE EXCEPTION 'Invalid references accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.billing_alerts WHERE order_ref='operations-retry' AND attempts=2 AND company_id='871ca100-0000-4000-8000-000000000105') THEN RAISE EXCEPTION 'Failure dedupe or safe company match failed'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.billing_alerts WHERE order_ref='operations-unbound' AND company_id IS NULL AND reason_code='processing_failed') THEN RAISE EXCEPTION 'Unbound alert exposed reason or chose arbitrary company'; END IF;
 IF EXISTS(SELECT 1 FROM public.billing_alerts WHERE to_jsonb(billing_alerts)::text LIKE '%never-persist%') THEN RAISE EXCEPTION 'Raw diagnostic persisted'; END IF;
END $$;
SELECT set_config('request.jwt.claims','{"sub":"871ca100-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"871ca100-0000-4000-8000-000000000003"}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE result jsonb; target uuid; BEGIN
 SELECT id INTO target FROM public.billing_alerts WHERE order_ref='operations-retry';
 PERFORM public.acknowledge_billing_alert(target);
 PERFORM public.refresh_operational_alerts();
 IF NOT EXISTS(SELECT 1 FROM public.billing_alerts WHERE id=target AND state='acknowledged' AND resolved_at IS NULL) THEN RAISE EXCEPTION 'Acknowledgement hid unresolved payment'; END IF;
 result:=public.admin_billing_alerts('active',1,0);
 IF jsonb_array_length(result->'items')<>1 OR (result->>'active')::integer<2 THEN RAISE EXCEPTION 'Bounded alert listing/count failed'; END IF;
 BEGIN PERFORM public.admin_billing_alerts('all',20,0); RAISE EXCEPTION 'Invalid filter accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
RESET ROLE;
-- A matching accepted payment resolves the retry; a changed expiry is detected,
-- then resolves after the authoritative subscription again matches the payment.
INSERT INTO public.webhook_events(provider,external_event_id,event_type,processed_at,payload)
VALUES('cakto','purchase_approved:operations-retry','purchase_approved',now(),jsonb_build_object('event_type','purchase_approved','order_id','operations-retry','subscription_id','operations-contract-15','product_id','operations-product','outcome','processed','paid_at',now(),'event_at',now(),'period_end',now()+interval '30 days'));
SELECT private.refresh_operational_alerts_internal();
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.billing_alerts WHERE order_ref='operations-retry' AND kind='webhook_failure' AND state='resolved') THEN RAISE EXCEPTION 'Accepted retry failed to resolve webhook alert'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.billing_alerts WHERE company_id='871ca100-0000-4000-8000-000000000105' AND kind='activation_mismatch' AND state='open') THEN RAISE EXCEPTION 'Missing activation mismatch'; END IF;
END $$;
UPDATE public.subscriptions SET expires_at=now()+interval '30 days' WHERE company_id='871ca100-0000-4000-8000-000000000105';
SELECT private.refresh_operational_alerts_internal();
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.billing_alerts WHERE company_id='871ca100-0000-4000-8000-000000000105' AND kind='activation_mismatch' AND state<>'resolved') THEN RAISE EXCEPTION 'Corrected expiry did not resolve mismatch'; END IF;
END $$;
-- Provider lifecycle records may omit event_at. Arrival time is the fallback.
INSERT INTO public.webhook_events(provider,external_event_id,event_type,processed_at,payload)
VALUES('cakto','subscription_late:operations-late','subscription_late',now()+interval '1 minute',jsonb_build_object('event_type','subscription_late','order_id','operations-late','subscription_id','operations-contract-15','product_id','operations-product','outcome','processed','event_at',NULL));
SELECT private.refresh_operational_alerts_internal();
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.billing_alerts WHERE company_id='871ca100-0000-4000-8000-000000000105' AND kind='renewal_issue' AND reason_code='subscription_late' AND state='open') THEN RAISE EXCEPTION 'Null-timestamp late event hidden by old payment'; END IF;
END $$;
INSERT INTO public.webhook_events(provider,external_event_id,event_type,processed_at,payload)
VALUES('cakto','subscription_renewal_refused:operations-refused','subscription_renewal_refused',now()+interval '2 minutes',jsonb_build_object('event_type','subscription_renewal_refused','order_id','operations-refused','subscription_id','operations-contract-15','product_id','operations-product','outcome','processed','event_at',NULL));
SELECT private.refresh_operational_alerts_internal();
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.billing_alerts WHERE company_id='871ca100-0000-4000-8000-000000000105' AND kind='renewal_issue' AND reason_code='subscription_renewal_refused' AND state='open') THEN RAISE EXCEPTION 'Null-timestamp refused renewal hidden by old payment'; END IF;
END $$;
INSERT INTO public.webhook_events(provider,external_event_id,event_type,processed_at,payload)
VALUES('cakto','subscription_late_recovered:operations-recovered','subscription_late_recovered',now()+interval '3 minutes',jsonb_build_object('event_type','subscription_late_recovered','order_id','operations-recovered','subscription_id','operations-contract-15','product_id','operations-product','outcome','processed','paid_at',now()+interval '3 minutes','event_at',now()+interval '3 minutes','period_end',now()+interval '30 days'));
SELECT private.refresh_operational_alerts_internal();
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.billing_alerts WHERE company_id='871ca100-0000-4000-8000-000000000105' AND kind='renewal_issue' AND state<>'resolved') THEN RAISE EXCEPTION 'Recovered payment did not resolve renewal alert'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.subscriptions WHERE company_id='871ca100-0000-4000-8000-000000000105' AND status='active' AND expires_at=now()+interval '30 days') THEN RAISE EXCEPTION 'Observer changed subscription'; END IF;
END $$;
-- Existing expired contract with accepted payment needs a missing-confirmation alert.
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.billing_alerts WHERE company_id='871ca100-0000-4000-8000-000000000106' AND kind='expired_without_renewal' AND state='open') THEN RAISE EXCEPTION 'Missing expired-without-renewal alert'; END IF;
END $$;

-- Non-admin customers cannot read alerts or aggregate customer information.
SELECT set_config('request.jwt.claim.sub','871ca100-0000-4000-8000-000000000015',true);
SELECT set_config('request.jwt.claims','{"sub":"871ca100-0000-4000-8000-000000000015","role":"authenticated","aal":"aal2","session_id":"871ca100-0000-4000-8000-000000000003"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.billing_alerts) THEN RAISE EXCEPTION 'Customer reads monitoring'; END IF;
 BEGIN PERFORM public.admin_sales_funnel(0); RAISE EXCEPTION 'Customer reads funnel'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.admin_billing_alerts(); RAISE EXCEPTION 'Customer calls monitoring'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.acknowledge_billing_alert('871ca100-0000-4000-8000-000000000999'); RAISE EXCEPTION 'Customer acknowledges monitoring'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'Operations alerts, privacy, MFA, evidence, pagination and monotonic funnel assertions passed; fixtures rolled back' AS result;
