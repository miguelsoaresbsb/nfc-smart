-- Run with the database owner after the permission migration. Every fixture and
-- event is rolled back; assertion failures abort the transaction.
BEGIN;

INSERT INTO public.companies(id, name, slug)
VALUES
  ('eb2e91f8-0e02-465f-b8f0-a9a4dc9f7001', 'RLS test active', 'rls-test-active-eb2e91f8'),
  ('eb2e91f8-0e02-465f-b8f0-a9a4dc9f7002', 'RLS test pending', 'rls-test-pending-eb2e91f8');
INSERT INTO public.subscriptions(company_id, status, expires_at)
VALUES
  ('eb2e91f8-0e02-465f-b8f0-a9a4dc9f7001', 'active', now() + interval '1 day'),
  ('eb2e91f8-0e02-465f-b8f0-a9a4dc9f7002', 'pending', NULL);
INSERT INTO public.actions(id, company_id, type, label, url, enabled)
VALUES
  ('eb2e91f8-0e02-465f-b8f0-a9a4dc9f7011', 'eb2e91f8-0e02-465f-b8f0-a9a4dc9f7001', 'custom', 'Valid', 'https://example.com', true),
  ('eb2e91f8-0e02-465f-b8f0-a9a4dc9f7012', 'eb2e91f8-0e02-465f-b8f0-a9a4dc9f7002', 'custom', 'Other tenant', 'https://example.com', true);

SET LOCAL ROLE anon;
INSERT INTO public.analytics_events(company_id, event_type)
VALUES ('eb2e91f8-0e02-465f-b8f0-a9a4dc9f7001', 'page_view');
INSERT INTO public.analytics_events(company_id, event_type, action_id)
VALUES ('eb2e91f8-0e02-465f-b8f0-a9a4dc9f7001', 'action_click', 'eb2e91f8-0e02-465f-b8f0-a9a4dc9f7011');

DO $test$
BEGIN
  BEGIN
    INSERT INTO public.analytics_events(company_id, event_type)
    VALUES ('eb2e91f8-0e02-465f-b8f0-a9a4dc9f7002', 'page_view');
    RAISE EXCEPTION 'Inactive-company analytics unexpectedly accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.analytics_events(company_id, event_type, action_id)
    VALUES ('eb2e91f8-0e02-465f-b8f0-a9a4dc9f7001', 'action_click', 'eb2e91f8-0e02-465f-b8f0-a9a4dc9f7012');
    RAISE EXCEPTION 'Cross-company action unexpectedly accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$test$;
RESET ROLE;

-- Use an existing ordinary user to avoid creating an Auth account. The test
-- fails explicitly if no customer account exists in the environment.
DO $test$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users u
    WHERE NOT EXISTS (SELECT 1 FROM public.platform_admins a WHERE a.user_id = u.id)
  ) THEN
    RAISE EXCEPTION 'RLS test requires an existing non-admin user';
  END IF;
END
$test$;
SELECT set_config('request.jwt.claim.sub', (
  SELECT u.id::text FROM auth.users u
  WHERE NOT EXISTS (SELECT 1 FROM public.platform_admins a WHERE a.user_id = u.id)
  ORDER BY u.id LIMIT 1
), true);
SELECT set_config('test.customer.email', (SELECT email FROM auth.users WHERE id=auth.uid()), true);
SET LOCAL ROLE authenticated;

DO $test$
BEGIN
  BEGIN
    INSERT INTO public.access_requests(name, email, company_name, user_id, status)
    VALUES ('RLS test', current_setting('test.customer.email'), 'RLS test', auth.uid(), 'approved');
    RAISE EXCEPTION 'Self-approved access request unexpectedly accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO public.access_requests(name, email, company_name, user_id, status, company_id)
    VALUES ('RLS test', current_setting('test.customer.email'), 'RLS test', auth.uid(), 'pending', 'eb2e91f8-0e02-465f-b8f0-a9a4dc9f7001');
    RAISE EXCEPTION 'Self-selected company unexpectedly accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  INSERT INTO public.access_requests(name, email, company_name, user_id, status)
  VALUES ('RLS test', current_setting('test.customer.email'), 'RLS test', auth.uid(), 'pending');
END
$test$;
RESET ROLE;

ROLLBACK;
SELECT 'RLS assertions passed; all fixtures rolled back' AS result;
