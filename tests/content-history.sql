-- Database-owner regression after the history migration. Everything rolls back.
-- Older captured_xid values simulate versions from earlier transactions while
-- keeping this entire regression isolated in one rollback-only transaction.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
('6b51bc9b-4c33-4d5a-a001-000000000001','history-owner@example.invalid',now()),
('6b51bc9b-4c33-4d5a-a001-000000000002','history-viewer@example.invalid',now()),
('6b51bc9b-4c33-4d5a-a001-000000000003','history-foreign@example.invalid',now());
INSERT INTO public.companies(id,name,slug,description) VALUES
('6b51bc9b-4c33-4d5a-a001-000000000101','Histórico inicial','history-original-6b51bc9b','Descrição inicial'),
('6b51bc9b-4c33-4d5a-a001-000000000102','Foreign history','history-foreign-6b51bc9b','Foreign private text'),
('6b51bc9b-4c33-4d5a-a001-000000000103','Unpaid history','history-unpaid-6b51bc9b','Unpaid text');
INSERT INTO public.company_members(company_id,user_id,role) VALUES
('6b51bc9b-4c33-4d5a-a001-000000000101','6b51bc9b-4c33-4d5a-a001-000000000001','owner'),
('6b51bc9b-4c33-4d5a-a001-000000000101','6b51bc9b-4c33-4d5a-a001-000000000002','viewer'),
('6b51bc9b-4c33-4d5a-a001-000000000102','6b51bc9b-4c33-4d5a-a001-000000000003','owner'),
('6b51bc9b-4c33-4d5a-a001-000000000103','6b51bc9b-4c33-4d5a-a001-000000000001','owner');
INSERT INTO public.access_requests(name,email,company_name,user_id,status,company_id)
SELECT 'History fixture',u.email,c.name,m.user_id,'approved',c.id
FROM public.companies c JOIN public.company_members m ON m.company_id=c.id JOIN auth.users u ON u.id=m.user_id
WHERE c.id IN ('6b51bc9b-4c33-4d5a-a001-000000000101','6b51bc9b-4c33-4d5a-a001-000000000102','6b51bc9b-4c33-4d5a-a001-000000000103');
INSERT INTO public.subscriptions(company_id,status,expires_at) VALUES
('6b51bc9b-4c33-4d5a-a001-000000000101','active',now()+interval '2 days'),
('6b51bc9b-4c33-4d5a-a001-000000000102','active',now()+interval '2 days'),
('6b51bc9b-4c33-4d5a-a001-000000000103','pending',NULL);
SELECT set_config('nfc.history_restore_company','6b51bc9b-4c33-4d5a-a001-000000000101',true);
INSERT INTO public.profiles(company_id,display_name,tagline) VALUES
('6b51bc9b-4c33-4d5a-a001-000000000101','Perfil inicial','Apresentação inicial');
INSERT INTO public.qr_codes(id,company_id,name,image_url) VALUES
('6b51bc9b-4c33-4d5a-a001-000000000301','6b51bc9b-4c33-4d5a-a001-000000000101','QR inicial','https://example.invalid/original.png');
INSERT INTO public.actions(id,company_id,type,label,url,position,enabled,created_at,pix_qr_code_id) VALUES
('6b51bc9b-4c33-4d5a-a001-000000000201','6b51bc9b-4c33-4d5a-a001-000000000101','pix','PIX inicial','#pix',0,true,'2026-01-01T00:00:00Z','6b51bc9b-4c33-4d5a-a001-000000000301'),
('6b51bc9b-4c33-4d5a-a001-000000000202','6b51bc9b-4c33-4d5a-a001-000000000101','website','Site inicial','https://example.invalid/original',1,false,'2026-01-02T00:00:00Z',NULL);
SELECT set_config('nfc.history_restore_company','',true);
INSERT INTO public.company_content_versions(id,company_id,operation,captured_xid,snapshot) VALUES
('6b51bc9b-4c33-4d5a-a001-000000000401','6b51bc9b-4c33-4d5a-a001-000000000101','initial',txid_current()-1,private.company_content_snapshot('6b51bc9b-4c33-4d5a-a001-000000000101')),
('6b51bc9b-4c33-4d5a-a001-000000000402','6b51bc9b-4c33-4d5a-a001-000000000102','initial',txid_current()-1,private.company_content_snapshot('6b51bc9b-4c33-4d5a-a001-000000000102')),
('6b51bc9b-4c33-4d5a-a001-000000000403','6b51bc9b-4c33-4d5a-a001-000000000103','initial',txid_current()-1,private.company_content_snapshot('6b51bc9b-4c33-4d5a-a001-000000000103'));
SELECT set_config('test.history.subscription',(SELECT to_jsonb(s)::text FROM public.subscriptions s WHERE company_id='6b51bc9b-4c33-4d5a-a001-000000000101'),true);
DO $$ DECLARE snapshot jsonb; BEGIN
 SELECT v.snapshot INTO snapshot FROM public.company_content_versions v WHERE id='6b51bc9b-4c33-4d5a-a001-000000000401';
 IF snapshot ?| ARRAY['slug','company_id','subscriptions','members','access_requests'] OR snapshot->'company' ?| ARRAY['id','slug','status','expires_at','user_id'] THEN RAISE EXCEPTION 'History contains account/billing authority'; END IF;
 IF has_table_privilege('authenticated','public.company_content_versions','INSERT') OR has_table_privilege('authenticated','public.company_content_versions','UPDATE') OR has_table_privilege('authenticated','public.company_content_versions','DELETE') THEN RAISE EXCEPTION 'Client can forge or remove history'; END IF;
 IF has_function_privilege('anon','public.get_company_content_history(uuid)','EXECUTE') OR has_function_privilege('anon','public.restore_company_content_version(uuid,uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'Anonymous history RPC exposed'; END IF;
 IF has_function_privilege('authenticated','private.company_content_snapshot(uuid)','EXECUTE') OR has_function_privilege('authenticated','private.capture_company_content_version(uuid,text)','EXECUTE') THEN RAISE EXCEPTION 'Internal snapshot/capture exposed'; END IF;
END $$;

-- Multiple mutations in a transaction keep one complete before-image.
UPDATE public.companies SET name='Histórico alterado',description='Texto alterado',slug='history-stable-link-6b51bc9b' WHERE id='6b51bc9b-4c33-4d5a-a001-000000000101';
UPDATE public.profiles SET display_name='Perfil alterado' WHERE company_id='6b51bc9b-4c33-4d5a-a001-000000000101';
UPDATE public.actions SET label='PIX alterado',created_at='2026-02-01T00:00:00Z' WHERE id='6b51bc9b-4c33-4d5a-a001-000000000201';
DELETE FROM public.actions WHERE id='6b51bc9b-4c33-4d5a-a001-000000000202';
INSERT INTO public.actions(company_id,label,url) VALUES('6b51bc9b-4c33-4d5a-a001-000000000101','Botão posterior','https://example.invalid/new');
-- A deleted UUID reused by another company must never be overwritten.
INSERT INTO public.actions(id,company_id,label,url) VALUES('6b51bc9b-4c33-4d5a-a001-000000000202','6b51bc9b-4c33-4d5a-a001-000000000102','Foreign reused UUID','https://example.invalid/foreign');
DELETE FROM public.qr_codes WHERE id='6b51bc9b-4c33-4d5a-a001-000000000301';
DO $$ BEGIN
 IF (SELECT count(*) FROM public.company_content_versions WHERE company_id='6b51bc9b-4c33-4d5a-a001-000000000101' AND captured_xid=txid_current())<>1 THEN RAISE EXCEPTION 'Transaction captured duplicate before-images'; END IF;
 IF (SELECT snapshot->'company'->>'name' FROM public.company_content_versions WHERE company_id='6b51bc9b-4c33-4d5a-a001-000000000101' AND captured_xid=txid_current())<>'Histórico inicial' THEN RAISE EXCEPTION 'Captured after-image instead of before-image'; END IF;
 BEGIN
  UPDATE public.actions SET company_id='6b51bc9b-4c33-4d5a-a001-000000000102' WHERE id='6b51bc9b-4c33-4d5a-a001-000000000201';
  RAISE EXCEPTION 'Action was moved between companies';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  UPDATE public.profiles SET company_id='6b51bc9b-4c33-4d5a-a001-000000000102' WHERE company_id='6b51bc9b-4c33-4d5a-a001-000000000101';
  RAISE EXCEPTION 'Profile was moved between companies';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $$;

SELECT set_config('request.jwt.claim.sub','6b51bc9b-4c33-4d5a-a001-000000000001',true);
SELECT set_config('request.jwt.claims','{"sub":"6b51bc9b-4c33-4d5a-a001-000000000001","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE history jsonb; prior_revision text; cid uuid; BEGIN
 history:=public.get_company_content_history('6b51bc9b-4c33-4d5a-a001-000000000101');
 IF jsonb_array_length(history->'versions')<>2 OR length(history->>'revision')<>32 THEN RAISE EXCEPTION 'Paid owner history unavailable'; END IF;
 IF EXISTS(SELECT 1 FROM public.company_content_versions WHERE company_id IN ('6b51bc9b-4c33-4d5a-a001-000000000102','6b51bc9b-4c33-4d5a-a001-000000000103')) THEN RAISE EXCEPTION 'Foreign or unpaid history leaked'; END IF;
 FOREACH cid IN ARRAY ARRAY['6b51bc9b-4c33-4d5a-a001-000000000102','6b51bc9b-4c33-4d5a-a001-000000000103']::uuid[] LOOP
  BEGIN PERFORM public.get_company_content_history(cid); RAISE EXCEPTION 'Forbidden history RPC allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.restore_company_content_version(cid,'6b51bc9b-4c33-4d5a-a001-000000000401',history->>'revision'); RAISE EXCEPTION 'Forbidden restoration allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 END LOOP;
 BEGIN PERFORM public.restore_company_content_version('6b51bc9b-4c33-4d5a-a001-000000000101','6b51bc9b-4c33-4d5a-a001-000000000402',history->>'revision'); RAISE EXCEPTION 'Foreign version restored'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 prior_revision:=history->>'revision';
 UPDATE public.companies SET description='Uma edição concorrente' WHERE id='6b51bc9b-4c33-4d5a-a001-000000000101';
 BEGIN PERFORM public.restore_company_content_version('6b51bc9b-4c33-4d5a-a001-000000000101','6b51bc9b-4c33-4d5a-a001-000000000401',prior_revision); RAISE EXCEPTION 'Stale revision overwrote new edit'; EXCEPTION WHEN serialization_failure THEN NULL; END;
 IF (SELECT description FROM public.companies WHERE id='6b51bc9b-4c33-4d5a-a001-000000000101')<>'Uma edição concorrente' THEN RAISE EXCEPTION 'Failed restore changed content'; END IF;
END $$;
RESET ROLE;
-- Start a simulated fresh transaction for the pre-restore undo snapshot.
UPDATE public.company_content_versions SET captured_xid=txid_current()-2 WHERE company_id='6b51bc9b-4c33-4d5a-a001-000000000101' AND captured_xid=txid_current();
SET LOCAL ROLE authenticated;
DO $$ DECLARE history jsonb; result jsonb; BEGIN
 history:=public.get_company_content_history('6b51bc9b-4c33-4d5a-a001-000000000101');
 result:=public.restore_company_content_version('6b51bc9b-4c33-4d5a-a001-000000000101','6b51bc9b-4c33-4d5a-a001-000000000401',history->>'revision');
 IF (result->>'restored_actions')::int<>2 OR (result->>'missing_qr_references')::int<>1 THEN RAISE EXCEPTION 'Restore counts invalid'; END IF;
 IF (SELECT name FROM public.companies WHERE id='6b51bc9b-4c33-4d5a-a001-000000000101')<>'Histórico inicial' OR (SELECT display_name FROM public.profiles WHERE company_id='6b51bc9b-4c33-4d5a-a001-000000000101')<>'Perfil inicial' THEN RAISE EXCEPTION 'Company/profile not restored'; END IF;
 IF (SELECT slug FROM public.companies WHERE id='6b51bc9b-4c33-4d5a-a001-000000000101')<>'history-stable-link-6b51bc9b' THEN RAISE EXCEPTION 'Restore changed permanent URL'; END IF;
 IF (SELECT to_jsonb(s)::text FROM public.subscriptions s WHERE company_id='6b51bc9b-4c33-4d5a-a001-000000000101') IS DISTINCT FROM current_setting('test.history.subscription') THEN RAISE EXCEPTION 'Restore changed billing'; END IF;
 IF (SELECT count(*) FROM public.actions WHERE company_id='6b51bc9b-4c33-4d5a-a001-000000000101')<>2 OR EXISTS(SELECT 1 FROM public.actions WHERE company_id='6b51bc9b-4c33-4d5a-a001-000000000101' AND label='Botão posterior') THEN RAISE EXCEPTION 'Action set not restored atomically'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.actions WHERE company_id='6b51bc9b-4c33-4d5a-a001-000000000101' AND label='Site inicial' AND enabled=false AND position=1 AND id<>'6b51bc9b-4c33-4d5a-a001-000000000202') THEN RAISE EXCEPTION 'Deleted action not safely recreated'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.actions WHERE id='6b51bc9b-4c33-4d5a-a001-000000000201' AND created_at='2026-01-01T00:00:00Z' AND pix_qr_code_id IS NULL) THEN RAISE EXCEPTION 'Original action date or deleted QR handling wrong'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.company_content_versions WHERE company_id='6b51bc9b-4c33-4d5a-a001-000000000101' AND operation='restore' AND snapshot->'company'->>'description'='Uma edição concorrente') THEN RAISE EXCEPTION 'Restore cannot be undone'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.actions WHERE id='6b51bc9b-4c33-4d5a-a001-000000000202' AND company_id='6b51bc9b-4c33-4d5a-a001-000000000102' AND label='Foreign reused UUID') THEN RAISE EXCEPTION 'Restoration overwrote foreign action'; END IF;
 IF (SELECT role FROM public.company_members WHERE company_id='6b51bc9b-4c33-4d5a-a001-000000000101' AND user_id='6b51bc9b-4c33-4d5a-a001-000000000001')<>'owner' OR NOT EXISTS(SELECT 1 FROM public.access_requests WHERE user_id='6b51bc9b-4c33-4d5a-a001-000000000001' AND company_id='6b51bc9b-4c33-4d5a-a001-000000000101' AND status='approved') THEN RAISE EXCEPTION 'Restore changed account permissions'; END IF;
END $$;

-- Read-only paid colleagues see history, but cannot publish a restoration.
SELECT set_config('request.jwt.claim.sub','6b51bc9b-4c33-4d5a-a001-000000000002',true);
SELECT set_config('request.jwt.claims','{"sub":"6b51bc9b-4c33-4d5a-a001-000000000002","aal":"aal1"}',true);
SET LOCAL ROLE authenticated;
DO $$ DECLARE history jsonb; BEGIN
 history:=public.get_company_content_history('6b51bc9b-4c33-4d5a-a001-000000000101');
 IF jsonb_array_length(history->'versions')=0 THEN RAISE EXCEPTION 'Viewer cannot consult history'; END IF;
 BEGIN PERFORM public.restore_company_content_version('6b51bc9b-4c33-4d5a-a001-000000000101','6b51bc9b-4c33-4d5a-a001-000000000401',history->>'revision'); RAISE EXCEPTION 'Viewer restored content'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

-- Retention remains bounded and a company cascade cannot recreate an orphan.
DELETE FROM public.company_content_versions WHERE company_id='6b51bc9b-4c33-4d5a-a001-000000000101';
INSERT INTO public.company_content_versions(company_id,operation,captured_xid,snapshot,created_at)
SELECT '6b51bc9b-4c33-4d5a-a001-000000000101','company',txid_current()+1000+g,
private.company_content_snapshot('6b51bc9b-4c33-4d5a-a001-000000000101'),now()-interval '1 hour'+g*interval '1 second' FROM generate_series(1,35) g;
SELECT private.capture_company_content_version('6b51bc9b-4c33-4d5a-a001-000000000101','company');
DO $$ BEGIN
 IF (SELECT count(*) FROM public.company_content_versions WHERE company_id='6b51bc9b-4c33-4d5a-a001-000000000101')<>30 THEN RAISE EXCEPTION 'History retention is not 30'; END IF;
END $$;
DELETE FROM public.companies WHERE id='6b51bc9b-4c33-4d5a-a001-000000000101';
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.company_content_versions WHERE company_id='6b51bc9b-4c33-4d5a-a001-000000000101') THEN RAISE EXCEPTION 'History orphaned after company deletion'; END IF;
END $$;
ROLLBACK;
SELECT 'History tenant/paid/role, immutable snapshot, conflict, restore, undo, QR, retention and cascade assertions passed; fixtures rolled back' AS result;
