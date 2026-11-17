-- Database-owner regression. Users, factors, sessions, companies, pieces and
-- audit rows roll back. Sequence positions are deliberately never reused: gaps
-- caused by tests or failed transactions are normal and have no customer meaning.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
('ba89c4c2-31a8-4d61-a001-000000000001','nfc-tags-admin@example.invalid',now()),
('ba89c4c2-31a8-4d61-a001-000000000002','nfc-tags-customer-a@example.invalid',now()),
('ba89c4c2-31a8-4d61-a001-000000000003','nfc-tags-customer-b@example.invalid',now()),
('ba89c4c2-31a8-4d61-a001-000000000004','nfc-tags-unconfirmed@example.invalid',NULL),
('ba89c4c2-31a8-4d61-a001-000000000005','nfc-tags-pending@example.invalid',now());
INSERT INTO public.platform_admins(user_id) VALUES('ba89c4c2-31a8-4d61-a001-000000000001');
INSERT INTO auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at,secret)
VALUES('ba89c4c2-31a8-4d61-a001-000000000301','ba89c4c2-31a8-4d61-a001-000000000001','NFC regression only','totp','verified',now(),now(),'fixture-not-an-authenticator-secret');
INSERT INTO auth.sessions(id,user_id,factor_id,aal,not_after)
VALUES('ba89c4c2-31a8-4d61-a001-000000000201','ba89c4c2-31a8-4d61-a001-000000000001','ba89c4c2-31a8-4d61-a001-000000000301','aal2',now()+interval '1 day');
INSERT INTO public.companies(id,name,slug) VALUES
('ba89c4c2-31a8-4d61-a001-000000000101','NFC unpaid A','nfc-tags-unpaid-a-ba89c4c2'),
('ba89c4c2-31a8-4d61-a001-000000000102','NFC paid B','nfc-tags-paid-b-ba89c4c2'),
('ba89c4c2-31a8-4d61-a001-000000000103','NFC unconfirmed C','nfc-tags-unconfirmed-c-ba89c4c2'),
('ba89c4c2-31a8-4d61-a001-000000000104','NFC pending D','nfc-tags-pending-d-ba89c4c2');
INSERT INTO public.company_members(company_id,user_id,role) VALUES
('ba89c4c2-31a8-4d61-a001-000000000101','ba89c4c2-31a8-4d61-a001-000000000002','owner'),
('ba89c4c2-31a8-4d61-a001-000000000102','ba89c4c2-31a8-4d61-a001-000000000003','viewer'),
('ba89c4c2-31a8-4d61-a001-000000000103','ba89c4c2-31a8-4d61-a001-000000000004','owner'),
('ba89c4c2-31a8-4d61-a001-000000000104','ba89c4c2-31a8-4d61-a001-000000000005','owner');
INSERT INTO public.access_requests(name,email,company_name,user_id,status,company_id)
SELECT 'NFC tags regression',u.email,c.name,m.user_id,CASE WHEN c.id='ba89c4c2-31a8-4d61-a001-000000000104' THEN 'pending' ELSE 'approved' END,c.id
FROM public.companies c JOIN public.company_members m ON m.company_id=c.id JOIN auth.users u ON u.id=m.user_id
WHERE c.slug LIKE 'nfc-tags-%-ba89c4c2';
INSERT INTO public.subscriptions(company_id,status,expires_at)
SELECT id,CASE WHEN id='ba89c4c2-31a8-4d61-a001-000000000102' THEN 'active' ELSE 'pending' END,
CASE WHEN id='ba89c4c2-31a8-4d61-a001-000000000102' THEN now()+interval '1 day' ELSE NULL END
FROM public.companies WHERE slug LIKE 'nfc-tags-%-ba89c4c2';
CREATE TEMP TABLE nfc_tags_billing_before ON COMMIT DROP AS
SELECT to_jsonb(s) AS snapshot FROM public.subscriptions s WHERE s.company_id IN (SELECT id FROM public.companies WHERE slug LIKE 'nfc-tags-%-ba89c4c2');
CREATE TEMP TABLE nfc_tags_slugs_before ON COMMIT DROP AS
SELECT id,slug FROM public.companies WHERE slug LIKE 'nfc-tags-%-ba89c4c2';

DO $$ DECLARE role_name text; table_name text; BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated'] LOOP
  FOREACH table_name IN ARRAY ARRAY['public.nfc_tags','private.nfc_tag_admin_notes','private.nfc_tag_events'] LOOP
   IF has_table_privilege(role_name,table_name,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES') THEN RAISE EXCEPTION 'Excessive grant on % for %',table_name,role_name; END IF;
  END LOOP;
  IF has_sequence_privilege(role_name,'private.nfc_tag_serial_seq','USAGE,SELECT,UPDATE') THEN RAISE EXCEPTION 'Caller can manipulate inventory serial sequence'; END IF;
 END LOOP;
 IF has_table_privilege('anon','public.nfc_tags','SELECT') OR has_table_privilege('authenticated','private.nfc_tag_admin_notes','SELECT') OR has_table_privilege('authenticated','private.nfc_tag_events','SELECT') THEN RAISE EXCEPTION 'Inventory or private notes exposed'; END IF;
END $$;

-- AAL1 administrators cannot operate inventory, including private implementation.
SELECT set_config('request.jwt.claim.sub','ba89c4c2-31a8-4d61-a001-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"ba89c4c2-31a8-4d61-a001-000000000001","aal":"aal1","session_id":"ba89c4c2-31a8-4d61-a001-000000000201"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.admin_list_nfc_tags(); RAISE EXCEPTION 'AAL1 inventory list allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.admin_save_nfc_tag(); RAISE EXCEPTION 'AAL1 inventory creation allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM private.admin_save_nfc_tag(); RAISE EXCEPTION 'Private implementation bypassed MFA'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"ba89c4c2-31a8-4d61-a001-000000000001","aal":"aal2","session_id":"ba89c4c2-31a8-4d61-a001-000000000201"}',true);
SET LOCAL ROLE authenticated;
SELECT set_config('nfc_tags_test.own_id',public.admin_save_nfc_tag(NULL,'ba89c4c2-31a8-4d61-a001-000000000101','personalization','Private fixture note',NULL)::text,true);
SELECT set_config('nfc_tags_test.foreign_id',public.admin_save_nfc_tag(NULL,'ba89c4c2-31a8-4d61-a001-000000000102','personalization','Other private fixture',NULL)::text,true);
SELECT public.admin_save_nfc_tag(NULL,'ba89c4c2-31a8-4d61-a001-000000000103','personalization','',NULL);
SELECT public.admin_save_nfc_tag(NULL,'ba89c4c2-31a8-4d61-a001-000000000104','personalization','',NULL);
SELECT set_config('nfc_tags_test.stock_id',public.admin_save_nfc_tag()::text,true);
DO $$ DECLARE n integer; BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_list_nfc_tags('NFC unpaid A') WHERE id=current_setting('nfc_tags_test.own_id')::uuid AND notes='Private fixture note') THEN RAISE EXCEPTION 'Admin search or private notes lost'; END IF;
 SELECT count(*) INTO n FROM public.nfc_tags WHERE id IN (current_setting('nfc_tags_test.own_id')::uuid,current_setting('nfc_tags_test.foreign_id')::uuid,current_setting('nfc_tags_test.stock_id')::uuid) AND serial ~ '^NFC-[0-9]{8,}$';
 IF n<>3 OR (SELECT count(DISTINCT serial) FROM public.nfc_tags WHERE id IN (current_setting('nfc_tags_test.own_id')::uuid,current_setting('nfc_tags_test.foreign_id')::uuid,current_setting('nfc_tags_test.stock_id')::uuid))<>3 THEN RAISE EXCEPTION 'Server-generated serials invalid or repeated'; END IF;
 BEGIN PERFORM public.admin_save_nfc_tag(NULL,NULL,'activated','',NULL); RAISE EXCEPTION 'Creation skipped physical stages'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.admin_save_nfc_tag(current_setting('nfc_tags_test.own_id')::uuid,'ba89c4c2-31a8-4d61-a001-000000000101','delivery','', (SELECT updated_at FROM public.nfc_tags WHERE id=current_setting('nfc_tags_test.own_id')::uuid)); RAISE EXCEPTION 'Stage skipping allowed'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.admin_save_nfc_tag(current_setting('nfc_tags_test.stock_id')::uuid,NULL,'production','', (SELECT updated_at FROM public.nfc_tags WHERE id=current_setting('nfc_tags_test.stock_id')::uuid)); RAISE EXCEPTION 'Production started without company'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.admin_save_nfc_tag(current_setting('nfc_tags_test.own_id')::uuid,'ba89c4c2-31a8-4d61-a001-000000000101','production','',now()-interval '1 day'); RAISE EXCEPTION 'Stale inventory edit allowed'; EXCEPTION WHEN serialization_failure THEN NULL; END;
END $$;
RESET ROLE;

-- Approved and email-confirmed owners can track their piece before paying.
SELECT set_config('request.jwt.claim.sub','ba89c4c2-31a8-4d61-a001-000000000002',true);
SELECT set_config('request.jwt.claims','{"sub":"ba89c4c2-31a8-4d61-a001-000000000002","aal":"aal2","session_id":"ba89c4c2-31a8-4d61-a001-000000000201","user_metadata":{"admin":true}}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF private.can_use_company('ba89c4c2-31a8-4d61-a001-000000000101') THEN RAISE EXCEPTION 'Unpaid fixture unexpectedly has software entitlement'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.nfc_tags WHERE id=current_setting('nfc_tags_test.own_id')::uuid) THEN RAISE EXCEPTION 'Unpaid owner lost physical tracking'; END IF;
 IF EXISTS(SELECT 1 FROM public.nfc_tags WHERE company_id<>'ba89c4c2-31a8-4d61-a001-000000000101' OR company_id IS NULL) THEN RAISE EXCEPTION 'Foreign tenant or stock inventory leaked'; END IF;
 BEGIN PERFORM public.admin_list_nfc_tags(); RAISE EXCEPTION 'Customer metadata/session spoof enabled inventory admin'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM public.admin_save_nfc_tag(); RAISE EXCEPTION 'Customer created a tag'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN UPDATE public.nfc_tags SET status='activated' WHERE id=current_setting('nfc_tags_test.own_id')::uuid; RAISE EXCEPTION 'Customer direct write allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN PERFORM notes FROM private.nfc_tag_admin_notes LIMIT 1; RAISE EXCEPTION 'Customer read internal notes'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- Viewer tracking is read-only; approval and confirmation remain necessary.
SELECT set_config('request.jwt.claim.sub','ba89c4c2-31a8-4d61-a001-000000000003',true);
SELECT set_config('request.jwt.claims','{"sub":"ba89c4c2-31a8-4d61-a001-000000000003"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.nfc_tags WHERE id=current_setting('nfc_tags_test.foreign_id')::uuid) THEN RAISE EXCEPTION 'Approved viewer lost tracking'; END IF; END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','ba89c4c2-31a8-4d61-a001-000000000004',true);
SELECT set_config('request.jwt.claims','{"sub":"ba89c4c2-31a8-4d61-a001-000000000004"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.nfc_tags) THEN RAISE EXCEPTION 'Unconfirmed user read physical inventory'; END IF; END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','ba89c4c2-31a8-4d61-a001-000000000005',true);
SELECT set_config('request.jwt.claims','{"sub":"ba89c4c2-31a8-4d61-a001-000000000005"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF EXISTS(SELECT 1 FROM public.nfc_tags) THEN RAISE EXCEPTION 'Pending approval user read physical inventory'; END IF; END $$;
RESET ROLE;

-- Prepare, deliver and physically activate with separate versions; never grant a plan.
SELECT set_config('request.jwt.claim.sub','ba89c4c2-31a8-4d61-a001-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"ba89c4c2-31a8-4d61-a001-000000000001","aal":"aal2","session_id":"ba89c4c2-31a8-4d61-a001-000000000201"}',true);
SET LOCAL ROLE authenticated;
SELECT public.admin_save_nfc_tag(current_setting('nfc_tags_test.own_id')::uuid,'ba89c4c2-31a8-4d61-a001-000000000101','production','Private fixture note',(SELECT updated_at FROM public.nfc_tags WHERE id=current_setting('nfc_tags_test.own_id')::uuid));
DO $$ BEGIN
 BEGIN PERFORM public.admin_save_nfc_tag(current_setting('nfc_tags_test.own_id')::uuid,'ba89c4c2-31a8-4d61-a001-000000000102','production','', (SELECT updated_at FROM public.nfc_tags WHERE id=current_setting('nfc_tags_test.own_id')::uuid)); RAISE EXCEPTION 'Prepared piece reassigned'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 BEGIN PERFORM public.admin_save_nfc_tag(current_setting('nfc_tags_test.own_id')::uuid,'ba89c4c2-31a8-4d61-a001-000000000101','personalization','', (SELECT updated_at FROM public.nfc_tags WHERE id=current_setting('nfc_tags_test.own_id')::uuid)); RAISE EXCEPTION 'Physical lifecycle moved backwards'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
END $$;
SELECT public.admin_save_nfc_tag(current_setting('nfc_tags_test.own_id')::uuid,'ba89c4c2-31a8-4d61-a001-000000000101','delivery','Private fixture note',(SELECT updated_at FROM public.nfc_tags WHERE id=current_setting('nfc_tags_test.own_id')::uuid));
SELECT public.admin_save_nfc_tag(current_setting('nfc_tags_test.own_id')::uuid,'ba89c4c2-31a8-4d61-a001-000000000101','activated','Private fixture note',(SELECT updated_at FROM public.nfc_tags WHERE id=current_setting('nfc_tags_test.own_id')::uuid));
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.nfc_tags WHERE id=current_setting('nfc_tags_test.own_id')::uuid AND production_at IS NOT NULL AND delivery_at>=production_at AND activated_at>=delivery_at) THEN RAISE EXCEPTION 'Lifecycle timestamps invalid'; END IF; END $$;
SELECT public.admin_archive_nfc_tag(current_setting('nfc_tags_test.own_id')::uuid,true,(SELECT updated_at FROM public.nfc_tags WHERE id=current_setting('nfc_tags_test.own_id')::uuid));
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.admin_list_nfc_tags('','archived') WHERE id=current_setting('nfc_tags_test.own_id')::uuid) THEN RAISE EXCEPTION 'Archived piece lost audit visibility'; END IF;
 BEGIN PERFORM public.admin_archive_nfc_tag(current_setting('nfc_tags_test.own_id')::uuid,false,now()-interval '1 day'); RAISE EXCEPTION 'Stale archive restoration allowed'; EXCEPTION WHEN serialization_failure THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','ba89c4c2-31a8-4d61-a001-000000000002',true);
SELECT set_config('request.jwt.claims','{"sub":"ba89c4c2-31a8-4d61-a001-000000000002"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.nfc_tags WHERE id=current_setting('nfc_tags_test.own_id')::uuid) THEN RAISE EXCEPTION 'Archived piece remained customer-visible'; END IF;
 IF private.can_use_company('ba89c4c2-31a8-4d61-a001-000000000101') THEN RAISE EXCEPTION 'Physical activation granted free software'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS((SELECT snapshot FROM nfc_tags_billing_before EXCEPT SELECT to_jsonb(s) FROM public.subscriptions s WHERE s.company_id IN (SELECT id FROM nfc_tags_slugs_before)) UNION ALL (SELECT to_jsonb(s) FROM public.subscriptions s WHERE s.company_id IN (SELECT id FROM nfc_tags_slugs_before) EXCEPT SELECT snapshot FROM nfc_tags_billing_before)) THEN RAISE EXCEPTION 'Physical workflow changed billing'; END IF;
 IF EXISTS(SELECT 1 FROM nfc_tags_slugs_before b JOIN public.companies c USING(id) WHERE c.slug<>b.slug) THEN RAISE EXCEPTION 'Physical workflow changed permanent public URL'; END IF;
 IF NOT EXISTS(SELECT 1 FROM private.nfc_tag_events WHERE tag_id=current_setting('nfc_tags_test.own_id')::uuid AND event_type='archived') THEN RAISE EXCEPTION 'Inventory audit missing'; END IF;
END $$;
ROLLBACK;
SELECT 'NFC inventory authorization, isolation, serials, lifecycle, conflicts and license separation passed; fixtures rolled back' AS result;
