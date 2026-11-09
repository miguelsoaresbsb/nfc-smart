BEGIN;
-- Use existing accounts only inside a rolled-back transaction.
INSERT INTO public.access_requests(id,name,email,company_name,user_id,status)
SELECT 'a9ab0983-0476-48da-92fa-41d20c64f001', 'Approval test', 'approval@example.invalid', c.name, u.id, 'pending'
FROM public.companies c CROSS JOIN auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.platform_admins a WHERE a.user_id=u.id)
ORDER BY c.id,u.id LIMIT 1;
SELECT set_config('request.jwt.claim.sub',(SELECT user_id::text FROM public.platform_admins LIMIT 1),true);
SET LOCAL ROLE authenticated;
DO $$
DECLARE first_company uuid; second_company uuid;
BEGIN
  first_company := public.approve_access_request('a9ab0983-0476-48da-92fa-41d20c64f001');
  second_company := public.approve_access_request('a9ab0983-0476-48da-92fa-41d20c64f001');
  IF first_company IS DISTINCT FROM second_company THEN RAISE EXCEPTION 'Approval retry created a duplicate'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.subscriptions WHERE company_id=first_company AND status='pending') THEN RAISE EXCEPTION 'Missing pending subscription'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE company_id=first_company) THEN RAISE EXCEPTION 'Missing profile'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.company_members WHERE company_id=first_company AND role='owner') THEN RAISE EXCEPTION 'Missing membership'; END IF;
  IF (SELECT count(*) FROM public.companies c WHERE c.name=(SELECT company_name FROM public.access_requests WHERE id='a9ab0983-0476-48da-92fa-41d20c64f001')) < 2 THEN RAISE EXCEPTION 'Same-name company was incorrectly reused'; END IF;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claim.sub',(SELECT u.id::text FROM auth.users u WHERE NOT EXISTS(SELECT 1 FROM public.platform_admins a WHERE a.user_id=u.id) LIMIT 1),true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.approve_access_request('a9ab0983-0476-48da-92fa-41d20c64f001');
    RAISE EXCEPTION 'Ordinary customer approved a request';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'Approval assertions passed; fixtures rolled back' AS result;
