-- Database-owner regression. Nothing persists: accounts, companies, payment
-- states, content, and storage metadata are rolled back at the end.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
('d8aa5b44-3c99-44af-a001-000000000001','paid-security-customer@example.invalid'),
('d8aa5b44-3c99-44af-a001-000000000002','paid-security-other@example.invalid'),
('d8aa5b44-3c99-44af-a001-000000000003','paid-security-admin@example.invalid');
INSERT INTO public.platform_admins(user_id) VALUES ('d8aa5b44-3c99-44af-a001-000000000003');
INSERT INTO public.companies(id,name,slug) VALUES
('d8aa5b44-3c99-44af-a001-000000000101','Paid security active','paid-security-active-d8aa5b44'),
('d8aa5b44-3c99-44af-a001-000000000102','Paid security pending','paid-security-pending-d8aa5b44'),
('d8aa5b44-3c99-44af-a001-000000000103','Paid security expired','paid-security-expired-d8aa5b44'),
('d8aa5b44-3c99-44af-a001-000000000104','Paid security canceled','paid-security-canceled-d8aa5b44'),
('d8aa5b44-3c99-44af-a001-000000000105','Paid security foreign','paid-security-foreign-d8aa5b44'),
('d8aa5b44-3c99-44af-a001-000000000106','Paid security no expiry','paid-security-no-expiry-d8aa5b44');
INSERT INTO public.company_members(company_id,user_id,role)
SELECT id, CASE WHEN id='d8aa5b44-3c99-44af-a001-000000000105' THEN 'd8aa5b44-3c99-44af-a001-000000000002'::uuid ELSE 'd8aa5b44-3c99-44af-a001-000000000001'::uuid END, 'owner'
FROM public.companies WHERE slug LIKE 'paid-security-%-d8aa5b44';
INSERT INTO public.access_requests(name,email,company_name,user_id,status,company_id)
SELECT 'Paid security test',u.email,c.name,m.user_id,'approved',c.id
FROM public.companies c JOIN public.company_members m ON m.company_id=c.id JOIN auth.users u ON u.id=m.user_id
WHERE c.slug LIKE 'paid-security-%-d8aa5b44';
INSERT INTO public.subscriptions(company_id,status,expires_at)
SELECT id, CASE WHEN id='d8aa5b44-3c99-44af-a001-000000000102' THEN 'pending' WHEN id='d8aa5b44-3c99-44af-a001-000000000104' THEN 'canceled' ELSE 'active' END,
CASE WHEN id='d8aa5b44-3c99-44af-a001-000000000106' THEN NULL WHEN id='d8aa5b44-3c99-44af-a001-000000000103' THEN now()-interval '1 day' ELSE now()+interval '1 day' END
FROM public.companies WHERE slug LIKE 'paid-security-%-d8aa5b44';
INSERT INTO public.profiles(company_id,display_name)
SELECT id,name FROM public.companies WHERE slug LIKE 'paid-security-%-d8aa5b44';
INSERT INTO public.actions(id,company_id,label,url,enabled) VALUES
('d8aa5b44-3c99-44af-a001-000000000201','d8aa5b44-3c99-44af-a001-000000000101','Paid hidden action','https://example.invalid',false),
('d8aa5b44-3c99-44af-a001-000000000202','d8aa5b44-3c99-44af-a001-000000000102','Pending action','https://example.invalid',true),
('d8aa5b44-3c99-44af-a001-000000000203','d8aa5b44-3c99-44af-a001-000000000103','Expired action','https://example.invalid',true),
('d8aa5b44-3c99-44af-a001-000000000204','d8aa5b44-3c99-44af-a001-000000000104','Canceled action','https://example.invalid',true),
('d8aa5b44-3c99-44af-a001-000000000205','d8aa5b44-3c99-44af-a001-000000000105','Foreign hidden action','https://example.invalid',false),
('d8aa5b44-3c99-44af-a001-000000000206','d8aa5b44-3c99-44af-a001-000000000106','No-expiry action','https://example.invalid',true);
INSERT INTO public.qr_codes(company_id,name,image_url)
SELECT id,name,'https://example.invalid/test.png' FROM public.companies WHERE slug LIKE 'paid-security-%-d8aa5b44';
INSERT INTO public.profile_media(company_id,image_url)
SELECT id,'https://example.invalid/test.png' FROM public.companies WHERE slug LIKE 'paid-security-%-d8aa5b44';
INSERT INTO public.analytics_events(company_id,event_type)
SELECT id,'page_view' FROM public.companies WHERE slug LIKE 'paid-security-%-d8aa5b44';
INSERT INTO storage.objects(bucket_id,name) VALUES
('company-assets','d8aa5b44-3c99-44af-a001-000000000101/security-fixture.png'),
('company-assets','d8aa5b44-3c99-44af-a001-000000000102/security-fixture.png'),
('company-assets','d8aa5b44-3c99-44af-a001-000000000105/security-fixture.png');

-- No operation exempt from RLS is exposed by these database roles.
DO $$ DECLARE t text; r text; BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    FOREACH t IN ARRAY ARRAY['companies','profiles','actions','qr_codes','profile_media','analytics_events','company_members','access_requests','platform_admins','subscriptions','webhook_events'] LOOP
      IF has_table_privilege(r,'public.'||t,'TRUNCATE') OR has_table_privilege(r,'public.'||t,'TRIGGER') OR has_table_privilege(r,'public.'||t,'REFERENCES') THEN
        RAISE EXCEPTION 'Excessive table grant remains for % on %',r,t;
      END IF;
    END LOOP;
    IF has_function_privilege(r,'public.process_cakto_event(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'Customer can invoke payment processor'; END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='auth.users'::regclass AND tgname='auto_confirm_signup_email') THEN RAISE EXCEPTION 'Automatic email confirmation remains'; END IF;
  IF EXISTS(SELECT 1 FROM auth.users WHERE id='d8aa5b44-3c99-44af-a001-000000000001' AND email_confirmed_at IS NOT NULL) THEN RAISE EXCEPTION 'New email was silently confirmed'; END IF;
END $$;

-- Subsequent paid/session simulations represent accounts that completed email verification.
UPDATE auth.users SET email_confirmed_at=now() WHERE id IN ('d8aa5b44-3c99-44af-a001-000000000001','d8aa5b44-3c99-44af-a001-000000000002','d8aa5b44-3c99-44af-a001-000000000003');

SET LOCAL ROLE anon;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.profiles WHERE company_id IN ('d8aa5b44-3c99-44af-a001-000000000102','d8aa5b44-3c99-44af-a001-000000000103','d8aa5b44-3c99-44af-a001-000000000104','d8aa5b44-3c99-44af-a001-000000000106')) THEN RAISE EXCEPTION 'Unpaid page visible to public'; END IF;
  IF EXISTS(SELECT 1 FROM storage.objects WHERE name LIKE 'd8aa5b44-%/security-fixture.png') THEN RAISE EXCEPTION 'Anonymous asset directory listing allowed'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.profiles WHERE company_id='d8aa5b44-3c99-44af-a001-000000000101') THEN RAISE EXCEPTION 'Paid public profile unavailable'; END IF;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claim.sub','d8aa5b44-3c99-44af-a001-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"d8aa5b44-3c99-44af-a001-000000000001","user_metadata":{"admin":true,"role":"admin"}}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE cid uuid; n integer; BEGIN
  IF private.is_platform_admin() THEN RAISE EXCEPTION 'Editable metadata granted administrator'; END IF;
  IF NOT private.can_use_company('d8aa5b44-3c99-44af-a001-000000000101') OR NOT private.can_edit_company('d8aa5b44-3c99-44af-a001-000000000101') THEN RAISE EXCEPTION 'Paid owner lost feature access'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.actions WHERE id='d8aa5b44-3c99-44af-a001-000000000201') THEN RAISE EXCEPTION 'Paid owner cannot read own hidden content'; END IF;
  IF EXISTS(SELECT 1 FROM public.actions WHERE id='d8aa5b44-3c99-44af-a001-000000000205') THEN RAISE EXCEPTION 'Foreign hidden content leaked'; END IF;
  IF EXISTS(SELECT 1 FROM public.analytics_events WHERE company_id='d8aa5b44-3c99-44af-a001-000000000105') THEN RAISE EXCEPTION 'Foreign analytics leaked'; END IF;
  IF EXISTS(SELECT 1 FROM storage.objects WHERE name IN ('d8aa5b44-3c99-44af-a001-000000000102/security-fixture.png','d8aa5b44-3c99-44af-a001-000000000105/security-fixture.png')) THEN RAISE EXCEPTION 'Unpaid/foreign asset metadata leaked'; END IF;
  IF NOT EXISTS(SELECT 1 FROM storage.objects WHERE name='d8aa5b44-3c99-44af-a001-000000000101/security-fixture.png') THEN RAISE EXCEPTION 'Paid owner cannot list own assets'; END IF;
  FOREACH cid IN ARRAY ARRAY['d8aa5b44-3c99-44af-a001-000000000102','d8aa5b44-3c99-44af-a001-000000000103','d8aa5b44-3c99-44af-a001-000000000104','d8aa5b44-3c99-44af-a001-000000000106']::uuid[] LOOP
    IF private.can_use_company(cid) OR private.can_edit_company(cid) THEN RAISE EXCEPTION 'Unpaid company has entitlement'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.companies WHERE id=cid) OR NOT EXISTS(SELECT 1 FROM public.subscriptions WHERE company_id=cid) THEN RAISE EXCEPTION 'Account/billing read lost'; END IF;
    IF EXISTS(SELECT 1 FROM public.actions WHERE company_id=cid) OR EXISTS(SELECT 1 FROM public.profiles WHERE company_id=cid) OR EXISTS(SELECT 1 FROM public.qr_codes WHERE company_id=cid) OR EXISTS(SELECT 1 FROM public.profile_media WHERE company_id=cid) OR EXISTS(SELECT 1 FROM public.analytics_events WHERE company_id=cid) THEN RAISE EXCEPTION 'Unpaid content readable via API'; END IF;
    BEGIN
      INSERT INTO public.actions(company_id,label,url) VALUES(cid,'Unpaid insert','https://example.invalid');
      RAISE EXCEPTION 'Unpaid action creation allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    UPDATE public.companies SET description='Unpaid edit' WHERE id=cid; GET DIAGNOSTICS n=ROW_COUNT;
    IF n<>0 THEN RAISE EXCEPTION 'Unpaid company update allowed'; END IF;
    UPDATE public.actions SET label='Unpaid edit' WHERE company_id=cid; GET DIAGNOSTICS n=ROW_COUNT;
    IF n<>0 THEN RAISE EXCEPTION 'Unpaid action update allowed'; END IF;
    DELETE FROM public.actions WHERE company_id=cid; GET DIAGNOSTICS n=ROW_COUNT;
    IF n<>0 THEN RAISE EXCEPTION 'Unpaid action deletion allowed'; END IF;
    BEGIN
      PERFORM public.reorder_company_actions(cid,ARRAY[]::uuid[]);
      RAISE EXCEPTION 'Unpaid reorder allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    IF private.can_edit_company_asset(cid::text||'/test.png') THEN RAISE EXCEPTION 'Unpaid storage write allowed'; END IF;
    BEGIN
      INSERT INTO storage.objects(bucket_id,name) VALUES('company-assets',cid::text||'/forbidden-security-upload.png');
      RAISE EXCEPTION 'Unpaid storage object creation allowed';
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
  UPDATE public.subscriptions SET status='active',expires_at=now()+interval '10 years' WHERE company_id='d8aa5b44-3c99-44af-a001-000000000102'; GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>0 THEN RAISE EXCEPTION 'Customer self-activated subscription'; END IF;
  UPDATE public.company_members SET role='admin' WHERE company_id='d8aa5b44-3c99-44af-a001-000000000101'; GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>0 THEN RAISE EXCEPTION 'Customer changed own role'; END IF;
  BEGIN
    INSERT INTO public.platform_admins(user_id) VALUES(auth.uid());
    RAISE EXCEPTION 'Customer self-promoted to platform admin';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  INSERT INTO public.actions(company_id,label,url,enabled) VALUES('d8aa5b44-3c99-44af-a001-000000000101','Paid insert','https://example.invalid',false);
  UPDATE public.actions SET label='Paid edit' WHERE id='d8aa5b44-3c99-44af-a001-000000000201'; GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>1 THEN RAISE EXCEPTION 'Paid edit failed'; END IF;
  DELETE FROM public.actions WHERE company_id='d8aa5b44-3c99-44af-a001-000000000101' AND label='Paid insert'; GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>1 THEN RAISE EXCEPTION 'Paid deletion failed'; END IF;
END $$;
RESET ROLE;

-- Same paid company, read-only role.
UPDATE public.company_members SET role='viewer' WHERE company_id='d8aa5b44-3c99-44af-a001-000000000101';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF NOT private.can_use_company('d8aa5b44-3c99-44af-a001-000000000101') OR private.can_edit_company('d8aa5b44-3c99-44af-a001-000000000101') THEN RAISE EXCEPTION 'Viewer permissions invalid'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.actions WHERE id='d8aa5b44-3c99-44af-a001-000000000201') THEN RAISE EXCEPTION 'Paid viewer lost read access'; END IF;
  BEGIN
    INSERT INTO public.actions(company_id,label,url) VALUES('d8aa5b44-3c99-44af-a001-000000000101','Viewer insert','https://example.invalid');
    RAISE EXCEPTION 'Viewer write allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- Explicit approval can be revoked even while membership/payment remain.
UPDATE public.access_requests SET status='rejected' WHERE company_id='d8aa5b44-3c99-44af-a001-000000000101' AND user_id='d8aa5b44-3c99-44af-a001-000000000001';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF private.can_use_company('d8aa5b44-3c99-44af-a001-000000000101') THEN RAISE EXCEPTION 'Revoked approval still grants paid tools'; END IF;
  IF EXISTS(SELECT 1 FROM public.actions WHERE id='d8aa5b44-3c99-44af-a001-000000000201') THEN RAISE EXCEPTION 'Revoked member can read hidden action'; END IF;
END $$;
RESET ROLE;

-- Platform administrator may service the account without granting customer access.
SELECT set_config('request.jwt.claim.sub','d8aa5b44-3c99-44af-a001-000000000003',true);
SELECT set_config('request.jwt.claims','{"sub":"d8aa5b44-3c99-44af-a001-000000000003"}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE n integer; BEGIN
  IF NOT private.can_use_company('d8aa5b44-3c99-44af-a001-000000000102') OR NOT private.can_edit_company('d8aa5b44-3c99-44af-a001-000000000102') THEN RAISE EXCEPTION 'Administrator lost account-service access'; END IF;
  UPDATE public.profiles SET display_name='Admin serviced pending account' WHERE company_id='d8aa5b44-3c99-44af-a001-000000000102'; GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>1 THEN RAISE EXCEPTION 'Administrator could not service pending profile'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'Paid entitlement, approval, role, tenant, grant, and storage assertions passed; fixtures rolled back' AS result;
