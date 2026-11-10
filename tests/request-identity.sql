-- Account/buyer identity regression; all accounts/requests/companies roll back.
BEGIN;
INSERT INTO auth.users(id,email) VALUES
('afb84e8d-0ef1-4201-a001-000000000001','identity-customer@example.invalid'),
('afb84e8d-0ef1-4201-a001-000000000002','identity-other@example.invalid'),
('afb84e8d-0ef1-4201-a001-000000000003','identity-admin@example.invalid');
INSERT INTO public.platform_admins(user_id) VALUES ('afb84e8d-0ef1-4201-a001-000000000003');
SELECT set_config('request.jwt.claim.sub','afb84e8d-0ef1-4201-a001-000000000001',true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF private.owns_verified_email('identity-customer@example.invalid') THEN RAISE EXCEPTION 'Unconfirmed email accepted'; END IF;
  BEGIN
    INSERT INTO public.access_requests(name,email,company_name,user_id)
    VALUES('Unconfirmed','identity-customer@example.invalid','Identity fixture',auth.uid());
    RAISE EXCEPTION 'Unconfirmed user inserted request';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
UPDATE auth.users SET email_confirmed_at=now() WHERE id='afb84e8d-0ef1-4201-a001-000000000001';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF NOT private.owns_verified_email(' IDENTITY-CUSTOMER@example.invalid ') THEN RAISE EXCEPTION 'Canonical own email rejected'; END IF;
  IF private.owns_verified_email('identity-other@example.invalid') THEN RAISE EXCEPTION 'Other buyer email accepted'; END IF;
  BEGIN
    INSERT INTO public.access_requests(name,email,company_name,user_id)
    VALUES('Forged email','identity-other@example.invalid','Identity fixture',auth.uid());
    RAISE EXCEPTION 'Customer inserted request under another buyer email';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  INSERT INTO public.access_requests(id,name,email,company_name,user_id)
  VALUES('afb84e8d-0ef1-4201-a001-000000000101','Confirmed',' IDENTITY-CUSTOMER@example.invalid ','Identity approved fixture',auth.uid());
END $$;
RESET ROLE;
-- Existing/admin-imported malformed requests are checked again by approval.
INSERT INTO public.access_requests(id,name,email,company_name,user_id) VALUES
('afb84e8d-0ef1-4201-a001-000000000102','Wrong account','identity-other@example.invalid','Identity forged fixture','afb84e8d-0ef1-4201-a001-000000000001'),
('afb84e8d-0ef1-4201-a001-000000000103','Unconfirmed','identity-other@example.invalid','Identity unconfirmed fixture','afb84e8d-0ef1-4201-a001-000000000002');
SELECT set_config('request.jwt.claim.sub','afb84e8d-0ef1-4201-a001-000000000003',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE before_count bigint; after_count bigint; cid uuid; BEGIN
  SELECT count(*) INTO before_count FROM public.companies;
  BEGIN
    PERFORM public.approve_access_request('afb84e8d-0ef1-4201-a001-000000000102');
    RAISE EXCEPTION 'Approval accepted mismatched buyer email';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    PERFORM public.approve_access_request('afb84e8d-0ef1-4201-a001-000000000103');
    RAISE EXCEPTION 'Approval accepted unconfirmed account';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  SELECT count(*) INTO after_count FROM public.companies;
  IF after_count<>before_count THEN RAISE EXCEPTION 'Failed approval left a company behind'; END IF;
  IF EXISTS(SELECT 1 FROM public.access_requests WHERE id IN ('afb84e8d-0ef1-4201-a001-000000000102','afb84e8d-0ef1-4201-a001-000000000103') AND (status<>'pending' OR company_id IS NOT NULL)) THEN RAISE EXCEPTION 'Failed approval changed request'; END IF;
  cid := public.approve_access_request('afb84e8d-0ef1-4201-a001-000000000101');
  IF cid IS NULL OR NOT EXISTS(SELECT 1 FROM public.subscriptions WHERE company_id=cid AND status='pending') THEN RAISE EXCEPTION 'Verified approval failed'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'Canonical confirmed account and approval assertions passed; fixtures rolled back' AS result;
