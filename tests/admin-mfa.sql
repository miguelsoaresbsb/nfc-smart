-- Database-owner regression only. All identities, sessions and factors roll back.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
('831ac888-9a44-4fcb-a001-000000000001','admin-mfa-fixture@example.invalid',now()),
('831ac888-9a44-4fcb-a001-000000000002','other-mfa-fixture@example.invalid',now()),
('831ac888-9a44-4fcb-a001-000000000003','other-admin-mfa-fixture@example.invalid',now());
INSERT INTO public.platform_admins(user_id) VALUES
('831ac888-9a44-4fcb-a001-000000000001'),('831ac888-9a44-4fcb-a001-000000000003');
DO $$ BEGIN
 IF has_function_privilege('anon','public.admin_mfa_verified()','EXECUTE') THEN RAISE EXCEPTION 'Anonymous role can call admin verification RPC'; END IF;
 IF NOT has_function_privilege('authenticated','public.admin_mfa_verified()','EXECUTE') THEN RAISE EXCEPTION 'Authenticated bootstrap cannot call verification RPC'; END IF;
END $$;
INSERT INTO public.companies(id,name,slug) VALUES('831ac888-9a44-4fcb-a001-000000000101','MFA fixture','admin-mfa-fixture-831ac888');
INSERT INTO public.subscriptions(company_id,status) VALUES('831ac888-9a44-4fcb-a001-000000000101','pending');
INSERT INTO public.access_requests(id,name,email,company_name,user_id,status) VALUES('831ac888-9a44-4fcb-a001-000000000102','MFA other','other-mfa-fixture@example.invalid','MFA other','831ac888-9a44-4fcb-a001-000000000002','pending');
SELECT set_config('request.jwt.claim.sub','831ac888-9a44-4fcb-a001-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"831ac888-9a44-4fcb-a001-000000000001","aal":"aal1","session_id":"831ac888-9a44-4fcb-a001-000000000201"}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE n integer; BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.platform_admins WHERE user_id=auth.uid()) THEN RAISE EXCEPTION 'MFA bootstrap own role is inaccessible'; END IF;
 IF EXISTS(SELECT 1 FROM public.platform_admins WHERE user_id<>auth.uid()) THEN RAISE EXCEPTION 'AAL1 bootstrap leaked another administrator identity'; END IF;
 IF private.is_platform_admin() OR public.admin_mfa_verified() THEN RAISE EXCEPTION 'AAL1 admin gained privileges'; END IF;
 IF EXISTS(SELECT 1 FROM public.access_requests WHERE id='831ac888-9a44-4fcb-a001-000000000102') THEN RAISE EXCEPTION 'AAL1 admin read another account request'; END IF;
 UPDATE public.subscriptions SET status='active',expires_at=now()+interval '1 day' WHERE company_id='831ac888-9a44-4fcb-a001-000000000101'; GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>0 THEN RAISE EXCEPTION 'AAL1 admin changed billing'; END IF;
 BEGIN
   PERFORM public.approve_access_request('831ac888-9a44-4fcb-a001-000000000102');
   RAISE EXCEPTION 'AAL1 admin approved a request';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

SELECT set_config('request.jwt.claims','{"sub":"831ac888-9a44-4fcb-a001-000000000001","aal":"aal2","session_id":"831ac888-9a44-4fcb-a001-000000000201"}',true);
DO $$ BEGIN IF private.is_platform_admin() THEN RAISE EXCEPTION 'JWT alone granted MFA without live session/factor'; END IF; END $$;
INSERT INTO auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at,secret) VALUES
('831ac888-9a44-4fcb-a001-000000000301','831ac888-9a44-4fcb-a001-000000000001','Test only','totp','verified',now(),now(),'fixture-not-an-authenticator-secret'),
('831ac888-9a44-4fcb-a001-000000000302','831ac888-9a44-4fcb-a001-000000000002','Other test only','totp','verified',now(),now(),'fixture-not-an-authenticator-secret');
INSERT INTO auth.sessions(id,user_id,factor_id,aal,not_after) VALUES
('831ac888-9a44-4fcb-a001-000000000201','831ac888-9a44-4fcb-a001-000000000001','831ac888-9a44-4fcb-a001-000000000301','aal1',now()+interval '1 day');
DO $$ BEGIN IF private.is_platform_admin() THEN RAISE EXCEPTION 'AAL1 session accepted with AAL2 JWT'; END IF; END $$;
UPDATE auth.sessions SET aal='aal2' WHERE id='831ac888-9a44-4fcb-a001-000000000201';
SELECT set_config('request.jwt.claims','{"sub":"831ac888-9a44-4fcb-a001-000000000001","aal":"aal1","session_id":"831ac888-9a44-4fcb-a001-000000000201"}',true);
DO $$ BEGIN IF private.is_platform_admin() THEN RAISE EXCEPTION 'AAL1 token reused an upgraded live session'; END IF; END $$;
SELECT set_config('request.jwt.claims','{"sub":"831ac888-9a44-4fcb-a001-000000000001","aal":"aal2"}',true);
DO $$ BEGIN IF private.is_platform_admin() THEN RAISE EXCEPTION 'Token without session identity accepted'; END IF; END $$;
SELECT set_config('request.jwt.claims','{"sub":"831ac888-9a44-4fcb-a001-000000000001","aal":"aal2","session_id":"831ac888-9a44-4fcb-a001-000000000201"}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE n integer; BEGIN
 IF NOT private.is_platform_admin() OR NOT public.admin_mfa_verified() THEN RAISE EXCEPTION 'Verified current MFA session cannot administer'; END IF;
 UPDATE public.subscriptions SET status='active',expires_at=now()+interval '1 day' WHERE company_id='831ac888-9a44-4fcb-a001-000000000101'; GET DIAGNOSTICS n=ROW_COUNT;
 IF n<>1 THEN RAISE EXCEPTION 'Verified MFA admin cannot service billing'; END IF;
END $$;
RESET ROLE;
UPDATE auth.sessions SET user_id='831ac888-9a44-4fcb-a001-000000000002',factor_id='831ac888-9a44-4fcb-a001-000000000302' WHERE id='831ac888-9a44-4fcb-a001-000000000201';
DO $$ BEGIN IF private.is_platform_admin() THEN RAISE EXCEPTION 'Another user session accepted'; END IF; END $$;
UPDATE auth.sessions SET user_id='831ac888-9a44-4fcb-a001-000000000001' WHERE id='831ac888-9a44-4fcb-a001-000000000201';
UPDATE auth.sessions SET factor_id='831ac888-9a44-4fcb-a001-000000000302' WHERE id='831ac888-9a44-4fcb-a001-000000000201';
DO $$ BEGIN IF private.is_platform_admin() THEN RAISE EXCEPTION 'Another user factor accepted'; END IF; END $$;
UPDATE auth.sessions SET factor_id='831ac888-9a44-4fcb-a001-000000000301',not_after=now()-interval '1 minute' WHERE id='831ac888-9a44-4fcb-a001-000000000201';
DO $$ BEGIN IF private.is_platform_admin() THEN RAISE EXCEPTION 'Expired session kept admin privileges'; END IF; END $$;
UPDATE auth.sessions SET not_after=now()+interval '1 day' WHERE id='831ac888-9a44-4fcb-a001-000000000201';
UPDATE auth.sessions SET factor_id=NULL WHERE id='831ac888-9a44-4fcb-a001-000000000201';
DO $$ BEGIN IF private.is_platform_admin() THEN RAISE EXCEPTION 'Session without factor accepted'; END IF; END $$;
UPDATE auth.sessions SET factor_id='831ac888-9a44-4fcb-a001-000000000301' WHERE id='831ac888-9a44-4fcb-a001-000000000201';
UPDATE auth.mfa_factors SET factor_type='phone' WHERE id='831ac888-9a44-4fcb-a001-000000000301';
DO $$ BEGIN IF private.is_platform_admin() THEN RAISE EXCEPTION 'Non-TOTP factor accepted'; END IF; END $$;
UPDATE auth.mfa_factors SET factor_type='totp' WHERE id='831ac888-9a44-4fcb-a001-000000000301';
UPDATE auth.mfa_factors SET status='unverified' WHERE id='831ac888-9a44-4fcb-a001-000000000301';
DO $$ BEGIN IF private.is_platform_admin() THEN RAISE EXCEPTION 'Unverified/removed factor kept admin privileges'; END IF; END $$;
UPDATE auth.mfa_factors SET status='verified' WHERE id='831ac888-9a44-4fcb-a001-000000000301';
UPDATE auth.users SET email_confirmed_at=NULL WHERE id='831ac888-9a44-4fcb-a001-000000000001';
DO $$ BEGIN IF private.is_platform_admin() THEN RAISE EXCEPTION 'Unconfirmed admin identity accepted'; END IF; END $$;
UPDATE auth.users SET email_confirmed_at=now() WHERE id='831ac888-9a44-4fcb-a001-000000000001';
DELETE FROM public.platform_admins WHERE user_id='831ac888-9a44-4fcb-a001-000000000001';
DO $$ BEGIN IF private.is_platform_admin() THEN RAISE EXCEPTION 'Revoked platform role kept admin privileges'; END IF; END $$;
INSERT INTO public.platform_admins(user_id) VALUES('831ac888-9a44-4fcb-a001-000000000001');
DELETE FROM auth.mfa_factors WHERE id='831ac888-9a44-4fcb-a001-000000000301';
DO $$ BEGIN IF private.is_platform_admin() THEN RAISE EXCEPTION 'Deleted factor kept admin privileges'; END IF; END $$;
INSERT INTO auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at,secret)
VALUES('831ac888-9a44-4fcb-a001-000000000301','831ac888-9a44-4fcb-a001-000000000001','Test only','totp','verified',now(),now(),'fixture-not-an-authenticator-secret');
DO $$ BEGIN IF NOT private.is_platform_admin() THEN RAISE EXCEPTION 'Restored MFA fixture no longer valid before session revocation test'; END IF; END $$;
DELETE FROM auth.sessions WHERE id='831ac888-9a44-4fcb-a001-000000000201';
DO $$ BEGIN IF private.is_platform_admin() THEN RAISE EXCEPTION 'Revoked session JWT kept admin privileges'; END IF; END $$;
SELECT set_config('request.jwt.claims','{"sub":"831ac888-9a44-4fcb-a001-000000000001","aal":"aal2","session_id":"not-a-uuid"}',true);
DO $$ BEGIN IF private.is_platform_admin() THEN RAISE EXCEPTION 'Invalid session id accepted'; END IF; END $$;
ROLLBACK;
SELECT 'MFA identity, bootstrap, AAL, session, expiry and factor assertions passed; fixtures rolled back' AS result;
