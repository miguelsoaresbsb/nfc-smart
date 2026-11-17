-- Database-owner regression; every identity, factor, session and company rolls back.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
('a9ab0983-0476-48da-92fa-41d20c64f101','approval-admin@example.invalid',now()),
('a9ab0983-0476-48da-92fa-41d20c64f102','approval-customer@example.invalid',now());
INSERT INTO public.platform_admins(user_id) VALUES('a9ab0983-0476-48da-92fa-41d20c64f101');
INSERT INTO auth.mfa_factors(id,user_id,friendly_name,factor_type,status,created_at,updated_at,secret)
VALUES('a9ab0983-0476-48da-92fa-41d20c64f301','a9ab0983-0476-48da-92fa-41d20c64f101','Approval regression only','totp','verified',now(),now(),'fixture-not-an-authenticator-secret');
INSERT INTO auth.sessions(id,user_id,factor_id,aal,not_after)
VALUES('a9ab0983-0476-48da-92fa-41d20c64f302','a9ab0983-0476-48da-92fa-41d20c64f101','a9ab0983-0476-48da-92fa-41d20c64f301','aal2',now()+interval '1 day');
-- An unrelated company shares the name, but must never be reused by approval.
INSERT INTO public.companies(id,name,slug)
VALUES('a9ab0983-0476-48da-92fa-41d20c64f201','Approval duplicate-name fixture','approval-duplicate-a9ab0983');
INSERT INTO public.access_requests(id,name,email,company_name,user_id,status)
VALUES('a9ab0983-0476-48da-92fa-41d20c64f001','Approval test','approval-customer@example.invalid','Approval duplicate-name fixture','a9ab0983-0476-48da-92fa-41d20c64f102','pending');
SELECT set_config('request.jwt.claim.sub','a9ab0983-0476-48da-92fa-41d20c64f101',true);
SELECT set_config('request.jwt.claims','{"sub":"a9ab0983-0476-48da-92fa-41d20c64f101","aal":"aal2","session_id":"a9ab0983-0476-48da-92fa-41d20c64f302"}',true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE first_company uuid; second_company uuid;
BEGIN
  IF NOT private.is_platform_admin() THEN RAISE EXCEPTION 'Administrator fixture has no verified MFA session'; END IF;
  first_company := public.approve_access_request('a9ab0983-0476-48da-92fa-41d20c64f001');
  second_company := public.approve_access_request('a9ab0983-0476-48da-92fa-41d20c64f001');
  IF first_company IS NULL OR first_company IS DISTINCT FROM second_company THEN RAISE EXCEPTION 'Approval retry created a duplicate or returned no company'; END IF;
  IF first_company='a9ab0983-0476-48da-92fa-41d20c64f201' THEN RAISE EXCEPTION 'Same-name company was incorrectly reused'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.subscriptions WHERE company_id=first_company AND status='pending') THEN RAISE EXCEPTION 'Missing pending subscription'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE company_id=first_company) THEN RAISE EXCEPTION 'Missing profile'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.company_members WHERE company_id=first_company AND user_id='a9ab0983-0476-48da-92fa-41d20c64f102' AND role='owner') THEN RAISE EXCEPTION 'Missing buyer membership'; END IF;
  IF (SELECT count(*) FROM public.companies WHERE name='Approval duplicate-name fixture')<>2 THEN RAISE EXCEPTION 'Approval did not create exactly one separate company'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub','a9ab0983-0476-48da-92fa-41d20c64f102',true);
SELECT set_config('request.jwt.claims','{"sub":"a9ab0983-0476-48da-92fa-41d20c64f102","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF private.is_platform_admin() THEN RAISE EXCEPTION 'Ordinary customer became an administrator'; END IF;
  BEGIN
    PERFORM public.approve_access_request('a9ab0983-0476-48da-92fa-41d20c64f001');
    RAISE EXCEPTION 'Ordinary customer approved a request';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'MFA administrator, idempotent approval, isolated company and customer-denial assertions passed; fixtures rolled back' AS result;
