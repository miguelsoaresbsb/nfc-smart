-- Requires an existing ordinary customer; every fixture and mutation rolls back.
BEGIN;
INSERT INTO public.companies(id,name,slug) VALUES
('a89459b2-a59a-4cd6-9c01-b6e1e9a90001','Order test company','order-test-a89459b2'),
('a89459b2-a59a-4cd6-9c01-b6e1e9a90002','Order other company','order-test-other-a89459b2');
INSERT INTO public.company_members(company_id,user_id,role)
SELECT 'a89459b2-a59a-4cd6-9c01-b6e1e9a90001',id,'editor' FROM auth.users u
WHERE NOT EXISTS(SELECT 1 FROM public.platform_admins a WHERE a.user_id=u.id) ORDER BY u.id LIMIT 1;
INSERT INTO public.actions(id,company_id,type,label,url,position) VALUES
('a89459b2-a59a-4cd6-9c01-b6e1e9a90101','a89459b2-a59a-4cd6-9c01-b6e1e9a90001','website','First','https://example.com/first',0),
('a89459b2-a59a-4cd6-9c01-b6e1e9a90102','a89459b2-a59a-4cd6-9c01-b6e1e9a90001','website','Second','https://example.com/second',1),
('a89459b2-a59a-4cd6-9c01-b6e1e9a90103','a89459b2-a59a-4cd6-9c01-b6e1e9a90002','website','Other','https://example.com/other',0);
SELECT set_config('request.jwt.claim.sub',(SELECT user_id::text FROM public.company_members WHERE company_id='a89459b2-a59a-4cd6-9c01-b6e1e9a90001' LIMIT 1),true);
INSERT INTO public.subscriptions(company_id,status,expires_at)
VALUES ('a89459b2-a59a-4cd6-9c01-b6e1e9a90001','active',now()+interval '1 day');
INSERT INTO public.access_requests(name,email,company_name,user_id,status,company_id)
VALUES ('Order test',(SELECT email FROM auth.users WHERE id=auth.uid()),'Order test',auth.uid(),'approved','a89459b2-a59a-4cd6-9c01-b6e1e9a90001');
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  PERFORM public.reorder_company_actions('a89459b2-a59a-4cd6-9c01-b6e1e9a90001',ARRAY['a89459b2-a59a-4cd6-9c01-b6e1e9a90102','a89459b2-a59a-4cd6-9c01-b6e1e9a90101']::uuid[]);
  IF (SELECT position FROM public.actions WHERE id='a89459b2-a59a-4cd6-9c01-b6e1e9a90102')<>0 THEN RAISE EXCEPTION 'Order not saved'; END IF;
  BEGIN
    PERFORM public.reorder_company_actions('a89459b2-a59a-4cd6-9c01-b6e1e9a90001',ARRAY['a89459b2-a59a-4cd6-9c01-b6e1e9a90101','a89459b2-a59a-4cd6-9c01-b6e1e9a90101']::uuid[]);
    RAISE EXCEPTION 'Duplicate IDs accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.reorder_company_actions('a89459b2-a59a-4cd6-9c01-b6e1e9a90001',ARRAY['a89459b2-a59a-4cd6-9c01-b6e1e9a90101']::uuid[]);
    RAISE EXCEPTION 'Incomplete order accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.reorder_company_actions('a89459b2-a59a-4cd6-9c01-b6e1e9a90001',ARRAY['a89459b2-a59a-4cd6-9c01-b6e1e9a90101','a89459b2-a59a-4cd6-9c01-b6e1e9a90103']::uuid[]);
    RAISE EXCEPTION 'Cross-tenant action accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  BEGIN
    PERFORM public.reorder_company_actions('a89459b2-a59a-4cd6-9c01-b6e1e9a90002',ARRAY['a89459b2-a59a-4cd6-9c01-b6e1e9a90103']::uuid[]);
    RAISE EXCEPTION 'Cross-tenant company accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
UPDATE public.company_members SET role='viewer' WHERE company_id='a89459b2-a59a-4cd6-9c01-b6e1e9a90001';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  BEGIN
    PERFORM public.reorder_company_actions('a89459b2-a59a-4cd6-9c01-b6e1e9a90001',ARRAY['a89459b2-a59a-4cd6-9c01-b6e1e9a90102','a89459b2-a59a-4cd6-9c01-b6e1e9a90101']::uuid[]);
    RAISE EXCEPTION 'Viewer changed order';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'Action ordering assertions passed; fixtures rolled back' AS result;
