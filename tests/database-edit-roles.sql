-- Run as database owner after the edit-role / QR ownership migration.
BEGIN;
INSERT INTO public.companies(id, name, slug)
VALUES
  ('e2be91f8-0e02-465f-b8f0-a9a4dc9f7001', 'Role test A', 'role-test-a-e2be91f8'),
  ('e2be91f8-0e02-465f-b8f0-a9a4dc9f7002', 'Role test B', 'role-test-b-e2be91f8');
INSERT INTO public.qr_codes(id, company_id, name, image_url)
VALUES
  ('e2be91f8-0e02-465f-b8f0-a9a4dc9f7011', 'e2be91f8-0e02-465f-b8f0-a9a4dc9f7001', 'QR A', 'https://example.com/a.png'),
  ('e2be91f8-0e02-465f-b8f0-a9a4dc9f7012', 'e2be91f8-0e02-465f-b8f0-a9a4dc9f7002', 'QR B', 'https://example.com/b.png');
INSERT INTO public.actions(id, company_id, type, label, url)
VALUES ('e2be91f8-0e02-465f-b8f0-a9a4dc9f7021', 'e2be91f8-0e02-465f-b8f0-a9a4dc9f7001', 'custom', 'Existing action', 'https://example.com');
SELECT set_config('request.jwt.claim.sub', (
  SELECT u.id::text FROM auth.users u
  WHERE NOT EXISTS (SELECT 1 FROM public.platform_admins a WHERE a.user_id = u.id)
  ORDER BY u.id LIMIT 1
), true);
DO $test$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Test needs a non-admin user'; END IF;
END
$test$;
INSERT INTO public.company_members(company_id, user_id, role)
VALUES ('e2be91f8-0e02-465f-b8f0-a9a4dc9f7001', auth.uid(), 'viewer');
INSERT INTO public.subscriptions(company_id,status,expires_at)
VALUES ('e2be91f8-0e02-465f-b8f0-a9a4dc9f7001','active',now()+interval '1 day');
INSERT INTO public.access_requests(name,email,company_name,user_id,status,company_id)
VALUES ('Role test',(SELECT email FROM auth.users WHERE id=auth.uid()),'Role test',auth.uid(),'approved','e2be91f8-0e02-465f-b8f0-a9a4dc9f7001');
SET LOCAL ROLE authenticated;
DO $test$
DECLARE affected integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = 'e2be91f8-0e02-465f-b8f0-a9a4dc9f7001') THEN
    RAISE EXCEPTION 'Viewer cannot read own company';
  END IF;
  IF private.can_edit_company('e2be91f8-0e02-465f-b8f0-a9a4dc9f7001') THEN
    RAISE EXCEPTION 'Viewer unexpectedly has editing permission';
  END IF;
  BEGIN
    INSERT INTO public.actions(company_id, label, url)
    VALUES ('e2be91f8-0e02-465f-b8f0-a9a4dc9f7001', 'Forbidden', 'https://example.com');
    RAISE EXCEPTION 'Viewer insert unexpectedly accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.companies SET description = 'Forbidden' WHERE id = 'e2be91f8-0e02-465f-b8f0-a9a4dc9f7001';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Viewer company update unexpectedly accepted'; END IF;
  DELETE FROM public.actions WHERE id = 'e2be91f8-0e02-465f-b8f0-a9a4dc9f7021';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 0 THEN RAISE EXCEPTION 'Viewer action delete unexpectedly accepted'; END IF;
  IF private.can_edit_company_asset('e2be91f8-0e02-465f-b8f0-a9a4dc9f7001/test.png') THEN
    RAISE EXCEPTION 'Viewer unexpectedly has storage write permission';
  END IF;
END
$test$;
RESET ROLE;
UPDATE public.company_members SET role = 'editor'
WHERE company_id = 'e2be91f8-0e02-465f-b8f0-a9a4dc9f7001' AND user_id = auth.uid();
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
  IF NOT private.can_edit_company('e2be91f8-0e02-465f-b8f0-a9a4dc9f7001') THEN
    RAISE EXCEPTION 'Editor has no editing permission';
  END IF;
  IF NOT private.can_edit_company_asset('e2be91f8-0e02-465f-b8f0-a9a4dc9f7001/test.png') THEN
    RAISE EXCEPTION 'Editor has no storage write permission';
  END IF;
  IF private.can_edit_company_asset('e2be91f8-0e02-465f-b8f0-a9a4dc9f7002/test.png') THEN
    RAISE EXCEPTION 'Editor can write another company storage';
  END IF;
  INSERT INTO public.actions(company_id, type, label, url, pix_qr_code_id)
  VALUES ('e2be91f8-0e02-465f-b8f0-a9a4dc9f7001', 'pix', 'Valid QR', '', 'e2be91f8-0e02-465f-b8f0-a9a4dc9f7011');
  BEGIN
    INSERT INTO public.actions(company_id, type, label, url, pix_qr_code_id)
    VALUES ('e2be91f8-0e02-465f-b8f0-a9a4dc9f7001', 'pix', 'Other company QR', '', 'e2be91f8-0e02-465f-b8f0-a9a4dc9f7012');
    RAISE EXCEPTION 'Cross-company QR unexpectedly accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
  BEGIN
    INSERT INTO public.actions(company_id, type, label, url, wifi_qr_code_id)
    VALUES ('e2be91f8-0e02-465f-b8f0-a9a4dc9f7001', 'wifi', 'Missing QR', '', 'e2be91f8-0e02-465f-b8f0-a9a4dc9f7099');
    RAISE EXCEPTION 'Missing QR unexpectedly accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL;
  END;
END
$test$;
RESET ROLE;
DO $test$
BEGIN
  BEGIN
    UPDATE public.qr_codes SET company_id = 'e2be91f8-0e02-465f-b8f0-a9a4dc9f7002'
    WHERE id = 'e2be91f8-0e02-465f-b8f0-a9a4dc9f7011';
    RAISE EXCEPTION 'Moving a linked QR to another tenant unexpectedly accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END
$test$;
ROLLBACK;
SELECT 'Edit role, tenant QR, and storage assertions passed; fixtures rolled back' AS result;
