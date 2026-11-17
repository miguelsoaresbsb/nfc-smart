-- Mandatory second factor for platform administrators. No user/factor is enrolled
-- by this migration. Own platform_admins rows remain readable for bootstrap only.
CREATE OR REPLACE FUNCTION private.is_platform_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT coalesce(auth.jwt()->>'aal' = 'aal2', false)
    AND EXISTS (
      SELECT 1
      FROM public.platform_admins pa
      JOIN auth.users u ON u.id = pa.user_id AND u.email_confirmed_at IS NOT NULL
      JOIN auth.sessions s ON s.user_id = pa.user_id
        AND s.id::text = auth.jwt()->>'session_id'
        AND s.aal = 'aal2'
        AND (s.not_after IS NULL OR s.not_after > now())
      JOIN auth.mfa_factors f ON f.id = s.factor_id AND f.user_id = pa.user_id
        AND f.factor_type = 'totp' AND f.status = 'verified'
      WHERE pa.user_id = auth.uid()
    );
$function$;

-- Existing private helper execute grants are retained because RLS helpers call
-- this function. It answers only about the authenticated caller, without inputs.
CREATE OR REPLACE FUNCTION public.admin_mfa_verified()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.is_platform_admin();
$function$;
REVOKE ALL ON FUNCTION public.admin_mfa_verified() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_mfa_verified() TO authenticated;


-- NFC SMART content history; combined into the reviewed release migration.
-- Only content is versioned. Company identifiers, URLs/slugs, membership,
-- approvals, subscription/payment data and analytics are never restored.
CREATE TABLE IF NOT EXISTS public.company_content_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  operation text NOT NULL CHECK (operation IN ('company','profile','action','restore','initial')),
  captured_xid bigint NOT NULL DEFAULT txid_current(),
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot)='object' AND snapshot->>'schema'='1'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT company_content_versions_transaction_key UNIQUE(company_id,captured_xid)
);
CREATE INDEX IF NOT EXISTS company_content_versions_recent_idx
ON public.company_content_versions(company_id,created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS company_content_versions_actor_idx
ON public.company_content_versions(actor_id) WHERE actor_id IS NOT NULL;
ALTER TABLE public.company_content_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.company_content_versions FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.company_content_versions TO authenticated,service_role;
DROP POLICY IF EXISTS company_content_versions_paid_read ON public.company_content_versions;
CREATE POLICY company_content_versions_paid_read ON public.company_content_versions
FOR SELECT TO authenticated USING ((SELECT auth.uid()) IS NOT NULL AND private.can_use_company(company_id));

CREATE OR REPLACE FUNCTION private.company_content_snapshot(p_company_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=''
AS $fn$
 SELECT jsonb_build_object('schema',1,'company',jsonb_build_object('name',c.name,'logo_url',c.logo_url,'cover_url',c.cover_url,'description',c.description,'phone',c.phone,'whatsapp',c.whatsapp,'instagram',c.instagram,'website',c.website,'google_review_url',c.google_review_url,'pix_key',c.pix_key,'address',c.address,'primary_color',c.primary_color,'background_color',c.background_color,'text_color',c.text_color,'button_style',c.button_style,'button_text_color',c.button_text_color,'secondary_text_color',c.secondary_text_color,'whatsapp_enabled',c.whatsapp_enabled,'phone_enabled',c.phone_enabled),
  'profile',(SELECT jsonb_build_object('display_name',p.display_name,'tagline',p.tagline,'avatar_url',p.avatar_url,'secondary_image_url',p.secondary_image_url) FROM public.profiles p WHERE p.company_id=c.id),
  'actions',coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'type',a.type,'label',a.label,'url',a.url,'icon',a.icon,'position',a.position,'enabled',a.enabled,'created_at',a.created_at,'pix_key',a.pix_key,'pix_key_type',a.pix_key_type,'pix_receiver_name',a.pix_receiver_name,'pix_amount',a.pix_amount,'pix_description',a.pix_description,'pix_copy_paste',a.pix_copy_paste,'pix_qr_code_id',a.pix_qr_code_id,'wifi_ssid',a.wifi_ssid,'wifi_password',a.wifi_password,'wifi_security',a.wifi_security,'wifi_hidden',a.wifi_hidden,'wifi_qr_code_id',a.wifi_qr_code_id) ORDER BY a.position,a.created_at,a.id)
   FROM public.actions a WHERE a.company_id=c.id),'[]'::jsonb))
 FROM public.companies c WHERE c.id=p_company_id
$fn$;
REVOKE ALL ON FUNCTION private.company_content_snapshot(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.capture_company_content_version(p_company_id uuid,p_operation text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE version_id uuid; content jsonb;
BEGIN
 IF current_setting('nfc.history_restore_company',true)=p_company_id::text THEN RETURN NULL; END IF;
 -- NOWAIT avoids lock inversion: a direct action UPDATE already holds its row
 -- when BEFORE ROW triggers run. If restore/reorder owns the parent lock, the
 -- competing edit is rolled back instead of waiting in a circular lock chain.
 BEGIN
  PERFORM 1 FROM public.companies WHERE id=p_company_id FOR UPDATE NOWAIT;
 EXCEPTION WHEN lock_not_available THEN
  RAISE EXCEPTION 'Esta página está sendo alterada em outra sessão. Aguarde um momento e tente novamente.' USING ERRCODE='55P03';
 END;
 -- Parent has already gone during an ON DELETE CASCADE: do not create an orphan.
 IF NOT FOUND THEN RETURN NULL; END IF;
 SELECT id INTO version_id FROM public.company_content_versions
 WHERE company_id=p_company_id AND captured_xid=txid_current();
 IF version_id IS NOT NULL THEN RETURN version_id; END IF;
 content:=private.company_content_snapshot(p_company_id);
 IF content IS NULL THEN RETURN NULL; END IF;
 INSERT INTO public.company_content_versions(company_id,actor_id,operation,snapshot)
 VALUES(p_company_id,auth.uid(),p_operation,content)
 ON CONFLICT(company_id,captured_xid) DO NOTHING RETURNING id INTO version_id;
 DELETE FROM public.company_content_versions old_version
 WHERE old_version.company_id=p_company_id AND old_version.id NOT IN (
  SELECT id FROM public.company_content_versions WHERE company_id=p_company_id
  ORDER BY created_at DESC,id DESC LIMIT 30
 );
 RETURN version_id;
END
$fn$;
REVOKE ALL ON FUNCTION private.capture_company_content_version(uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.capture_content_history_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE company_key uuid; operation_kind text;
BEGIN
 IF TG_TABLE_NAME='companies' THEN
  IF jsonb_build_object('name',OLD.name,'logo_url',OLD.logo_url,'cover_url',OLD.cover_url,'description',OLD.description,'phone',OLD.phone,'whatsapp',OLD.whatsapp,'instagram',OLD.instagram,'website',OLD.website,'google_review_url',OLD.google_review_url,'pix_key',OLD.pix_key,'address',OLD.address,'primary_color',OLD.primary_color,'background_color',OLD.background_color,'text_color',OLD.text_color,'button_style',OLD.button_style,'button_text_color',OLD.button_text_color,'secondary_text_color',OLD.secondary_text_color,'whatsapp_enabled',OLD.whatsapp_enabled,'phone_enabled',OLD.phone_enabled) IS NOT DISTINCT FROM jsonb_build_object('name',NEW.name,'logo_url',NEW.logo_url,'cover_url',NEW.cover_url,'description',NEW.description,'phone',NEW.phone,'whatsapp',NEW.whatsapp,'instagram',NEW.instagram,'website',NEW.website,'google_review_url',NEW.google_review_url,'pix_key',NEW.pix_key,'address',NEW.address,'primary_color',NEW.primary_color,'background_color',NEW.background_color,'text_color',NEW.text_color,'button_style',NEW.button_style,'button_text_color',NEW.button_text_color,'secondary_text_color',NEW.secondary_text_color,'whatsapp_enabled',NEW.whatsapp_enabled,'phone_enabled',NEW.phone_enabled) THEN RETURN NEW; END IF;
  company_key:=OLD.id; operation_kind:='company';
 ELSIF TG_TABLE_NAME='profiles' THEN
  IF TG_OP='UPDATE' THEN
   IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN RAISE EXCEPTION 'Um perfil não pode ser movido entre empresas.' USING ERRCODE='23514'; END IF;
   IF jsonb_build_object('display_name',OLD.display_name,'tagline',OLD.tagline,'avatar_url',OLD.avatar_url,'secondary_image_url',OLD.secondary_image_url) IS NOT DISTINCT FROM jsonb_build_object('display_name',NEW.display_name,'tagline',NEW.tagline,'avatar_url',NEW.avatar_url,'secondary_image_url',NEW.secondary_image_url) THEN RETURN NEW; END IF;
  END IF;
  company_key:=CASE WHEN TG_OP='DELETE' THEN OLD.company_id ELSE NEW.company_id END; operation_kind:='profile';
 ELSE
  IF TG_OP='UPDATE' THEN
   IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'Um botão não pode ser movido entre empresas.' USING ERRCODE='23514';
   END IF;
   IF jsonb_build_object('id',OLD.id,'type',OLD.type,'label',OLD.label,'url',OLD.url,'icon',OLD.icon,'position',OLD.position,'enabled',OLD.enabled,'created_at',OLD.created_at,'pix_key',OLD.pix_key,'pix_key_type',OLD.pix_key_type,'pix_receiver_name',OLD.pix_receiver_name,'pix_amount',OLD.pix_amount,'pix_description',OLD.pix_description,'pix_copy_paste',OLD.pix_copy_paste,'pix_qr_code_id',OLD.pix_qr_code_id,'wifi_ssid',OLD.wifi_ssid,'wifi_password',OLD.wifi_password,'wifi_security',OLD.wifi_security,'wifi_hidden',OLD.wifi_hidden,'wifi_qr_code_id',OLD.wifi_qr_code_id) IS NOT DISTINCT FROM jsonb_build_object('id',NEW.id,'type',NEW.type,'label',NEW.label,'url',NEW.url,'icon',NEW.icon,'position',NEW.position,'enabled',NEW.enabled,'created_at',NEW.created_at,'pix_key',NEW.pix_key,'pix_key_type',NEW.pix_key_type,'pix_receiver_name',NEW.pix_receiver_name,'pix_amount',NEW.pix_amount,'pix_description',NEW.pix_description,'pix_copy_paste',NEW.pix_copy_paste,'pix_qr_code_id',NEW.pix_qr_code_id,'wifi_ssid',NEW.wifi_ssid,'wifi_password',NEW.wifi_password,'wifi_security',NEW.wifi_security,'wifi_hidden',NEW.wifi_hidden,'wifi_qr_code_id',NEW.wifi_qr_code_id) THEN RETURN NEW; END IF;
  END IF;
  company_key:=CASE WHEN TG_OP='DELETE' THEN OLD.company_id ELSE NEW.company_id END; operation_kind:='action';
 END IF;
 PERFORM private.capture_company_content_version(company_key,operation_kind);
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END
$fn$;
REVOKE ALL ON FUNCTION private.capture_content_history_trigger() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS capture_company_content_history ON public.companies;
CREATE TRIGGER capture_company_content_history BEFORE UPDATE ON public.companies
FOR EACH ROW EXECUTE FUNCTION private.capture_content_history_trigger();
DROP TRIGGER IF EXISTS capture_profile_content_history ON public.profiles;
CREATE TRIGGER capture_profile_content_history BEFORE INSERT OR UPDATE OR DELETE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.capture_content_history_trigger();
DROP TRIGGER IF EXISTS capture_action_content_history ON public.actions;
CREATE TRIGGER capture_action_content_history BEFORE INSERT OR UPDATE OR DELETE ON public.actions
FOR EACH ROW EXECUTE FUNCTION private.capture_content_history_trigger();

CREATE OR REPLACE FUNCTION private.get_company_content_history(p_company_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE content jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT private.can_use_company(p_company_id) THEN
  RAISE EXCEPTION 'Você não tem acesso ao histórico desta empresa.' USING ERRCODE='42501';
 END IF;
 content:=private.company_content_snapshot(p_company_id);
 IF content IS NULL THEN RAISE EXCEPTION 'Página não encontrada.' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('revision',md5(content::text),'versions',coalesce((
  SELECT jsonb_agg(jsonb_build_object('id',v.id,'created_at',v.created_at,'actor_id',v.actor_id,'operation',v.operation,
   'summary',jsonb_build_object('name',v.snapshot->'company'->>'name','description',v.snapshot->'company'->>'description',
    'action_count',jsonb_array_length(v.snapshot->'actions'),
    'buttons',coalesce((SELECT jsonb_agg(jsonb_build_object('label',item->>'label','enabled',item->'enabled'))
     FROM (SELECT value AS item FROM jsonb_array_elements(v.snapshot->'actions') WITH ORDINALITY AS bounded(value,ordinality) ORDER BY ordinality LIMIT 8) preview),'[]'::jsonb))) ORDER BY v.created_at DESC,v.id DESC)
  FROM public.company_content_versions v WHERE v.company_id=p_company_id),'[]'::jsonb));
END
$fn$;
REVOKE ALL ON FUNCTION private.get_company_content_history(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.get_company_content_history(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.get_company_content_history(p_company_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$ SELECT private.get_company_content_history(p_company_id) $fn$;
REVOKE ALL ON FUNCTION public.get_company_content_history(uuid) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_company_content_history(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.restore_company_content_version(p_company_id uuid,p_version_id uuid,p_expected_revision text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $fn$
DECLARE content jsonb; current_content jsonb; c jsonb; p jsonb; item jsonb;
 action_key uuid; restored_ids uuid[]:='{}'; pix_qr uuid; wifi_qr uuid; missing_qrs integer:=0;
 previous_skip text; restored_count integer:=0;
BEGIN
 IF auth.uid() IS NULL OR NOT private.can_edit_company(p_company_id) THEN
  RAISE EXCEPTION 'Somente quem pode editar uma página ativa pode restaurar seu histórico.' USING ERRCODE='42501';
 END IF;
 IF p_expected_revision IS NULL OR p_expected_revision !~ '^[a-f0-9]{32}$' THEN
  RAISE EXCEPTION 'Atualize o histórico antes de restaurar.' USING ERRCODE='22023';
 END IF;
 PERFORM 1 FROM public.companies WHERE id=p_company_id FOR UPDATE;
 IF NOT FOUND OR NOT private.can_edit_company(p_company_id) THEN
  RAISE EXCEPTION 'Você não tem permissão para restaurar esta página.' USING ERRCODE='42501';
 END IF;
 PERFORM 1 FROM public.actions WHERE company_id=p_company_id ORDER BY id FOR UPDATE;
 SELECT snapshot INTO content FROM public.company_content_versions WHERE id=p_version_id AND company_id=p_company_id;
 IF content IS NULL OR content->>'schema'<>'1' THEN
  RAISE EXCEPTION 'Esta versão não está mais disponível.' USING ERRCODE='22023';
 END IF;
 current_content:=private.company_content_snapshot(p_company_id);
 IF md5(current_content::text) IS DISTINCT FROM p_expected_revision THEN
  RAISE EXCEPTION 'A página mudou em outra aba. Atualize o histórico e confira a versão antes de restaurar.' USING ERRCODE='40001';
 END IF;
 -- Keeps the complete pre-restore content, so this restore can itself be undone.
 PERFORM private.capture_company_content_version(p_company_id,'restore');
 previous_skip:=current_setting('nfc.history_restore_company',true);
 PERFORM set_config('nfc.history_restore_company',p_company_id::text,true);
 c:=content->'company'; p:=content->'profile';
 UPDATE public.companies SET name=c->>'name',logo_url=c->>'logo_url',cover_url=c->>'cover_url',description=c->>'description',phone=c->>'phone',whatsapp=c->>'whatsapp',instagram=c->>'instagram',website=c->>'website',google_review_url=c->>'google_review_url',pix_key=c->>'pix_key',address=c->>'address',primary_color=c->>'primary_color',background_color=c->>'background_color',text_color=c->>'text_color',button_style=c->>'button_style',button_text_color=c->>'button_text_color',secondary_text_color=c->>'secondary_text_color',whatsapp_enabled=(c->>'whatsapp_enabled')::boolean,phone_enabled=(c->>'phone_enabled')::boolean,updated_at=now() WHERE id=p_company_id;
 IF p IS NULL OR p='null'::jsonb THEN
  DELETE FROM public.profiles WHERE company_id=p_company_id;
 ELSE
  INSERT INTO public.profiles(company_id,display_name,tagline,avatar_url,secondary_image_url)
  VALUES(p_company_id,p->>'display_name',p->>'tagline',p->>'avatar_url',p->>'secondary_image_url')
  ON CONFLICT(company_id) DO UPDATE SET display_name=EXCLUDED.display_name,tagline=EXCLUDED.tagline,
   avatar_url=EXCLUDED.avatar_url,secondary_image_url=EXCLUDED.secondary_image_url,updated_at=now();
 END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(content->'actions') LOOP
  action_key:=(item->>'id')::uuid;
  -- Never overwrite another tenant if an old deleted UUID has been reused.
  IF EXISTS(SELECT 1 FROM public.actions WHERE id=action_key AND company_id<>p_company_id) THEN action_key:=gen_random_uuid(); END IF;
  pix_qr:=(item->>'pix_qr_code_id')::uuid; wifi_qr:=(item->>'wifi_qr_code_id')::uuid;
  IF pix_qr IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.qr_codes WHERE id=pix_qr AND company_id=p_company_id) THEN pix_qr:=NULL; missing_qrs:=missing_qrs+1; END IF;
  IF wifi_qr IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.qr_codes WHERE id=wifi_qr AND company_id=p_company_id) THEN wifi_qr:=NULL; missing_qrs:=missing_qrs+1; END IF;
  INSERT INTO public.actions(id,company_id,type,label,url,icon,position,enabled,created_at,pix_key,pix_key_type,pix_receiver_name,pix_amount,pix_description,pix_copy_paste,pix_qr_code_id,wifi_ssid,wifi_password,wifi_security,wifi_hidden,wifi_qr_code_id)
  VALUES(action_key,p_company_id,item->>'type',item->>'label',item->>'url',item->>'icon',(item->>'position')::integer,(item->>'enabled')::boolean,(item->>'created_at')::timestamptz,item->>'pix_key',item->>'pix_key_type',item->>'pix_receiver_name',(item->>'pix_amount')::numeric,item->>'pix_description',item->>'pix_copy_paste',pix_qr,item->>'wifi_ssid',item->>'wifi_password',item->>'wifi_security',(item->>'wifi_hidden')::boolean,wifi_qr)
  ON CONFLICT(id) DO UPDATE SET type=EXCLUDED.type,label=EXCLUDED.label,url=EXCLUDED.url,icon=EXCLUDED.icon,position=EXCLUDED.position,enabled=EXCLUDED.enabled,created_at=EXCLUDED.created_at,pix_key=EXCLUDED.pix_key,pix_key_type=EXCLUDED.pix_key_type,pix_receiver_name=EXCLUDED.pix_receiver_name,pix_amount=EXCLUDED.pix_amount,pix_description=EXCLUDED.pix_description,pix_copy_paste=EXCLUDED.pix_copy_paste,pix_qr_code_id=EXCLUDED.pix_qr_code_id,wifi_ssid=EXCLUDED.wifi_ssid,wifi_password=EXCLUDED.wifi_password,wifi_security=EXCLUDED.wifi_security,wifi_hidden=EXCLUDED.wifi_hidden,wifi_qr_code_id=EXCLUDED.wifi_qr_code_id,updated_at=now()
  WHERE public.actions.company_id=p_company_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Os botões mudaram durante a restauração. Tente novamente.' USING ERRCODE='40001'; END IF;
  restored_ids:=array_append(restored_ids,action_key); restored_count:=restored_count+1;
 END LOOP;
 DELETE FROM public.actions WHERE company_id=p_company_id AND NOT(id=ANY(restored_ids));
 PERFORM set_config('nfc.history_restore_company',coalesce(previous_skip,''),true);
 RETURN jsonb_build_object('restored_actions',restored_count,'missing_qr_references',missing_qrs,
  'revision',md5(private.company_content_snapshot(p_company_id)::text));
END
$fn$;
REVOKE ALL ON FUNCTION private.restore_company_content_version(uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION private.restore_company_content_version(uuid,uuid,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.restore_company_content_version(p_company_id uuid,p_version_id uuid,p_expected_revision text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $fn$ SELECT private.restore_company_content_version(p_company_id,p_version_id,p_expected_revision) $fn$;
REVOKE ALL ON FUNCTION public.restore_company_content_version(uuid,uuid,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.restore_company_content_version(uuid,uuid,text) TO authenticated;

-- Baseline existing pages without changing any customer content.
SELECT private.capture_company_content_version(id,'initial') FROM public.companies;


-- Physical NFC inventory. This workflow never modifies subscriptions or public slugs.
CREATE SEQUENCE private.nfc_tag_serial_seq AS bigint START WITH 1 MINVALUE 1;
REVOKE ALL ON SEQUENCE private.nfc_tag_serial_seq FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.next_nfc_tag_serial()
RETURNS text LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$ SELECT 'NFC-' || pg_catalog.lpad(n::text, greatest(8, pg_catalog.length(n::text)), '0')
      FROM (SELECT pg_catalog.nextval('private.nfc_tag_serial_seq'::regclass) AS n) generated $$;
REVOKE ALL ON FUNCTION private.next_nfc_tag_serial() FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE public.nfc_tags (
  id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
  serial text NOT NULL UNIQUE DEFAULT private.next_nfc_tag_serial(),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'personalization' CHECK (status IN ('personalization','production','delivery','activated')),
  production_at timestamptz,
  delivery_at timestamptz,
  activated_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT nfc_tags_serial_format CHECK (serial ~ '^NFC-[0-9]{8,}$'),
  CONSTRAINT nfc_tags_lifecycle_times CHECK (
    (status='personalization' AND production_at IS NULL AND delivery_at IS NULL AND activated_at IS NULL)
    OR (status='production' AND production_at IS NOT NULL AND delivery_at IS NULL AND activated_at IS NULL)
    OR (status='delivery' AND production_at IS NOT NULL AND delivery_at IS NOT NULL AND activated_at IS NULL)
    OR (status='activated' AND production_at IS NOT NULL AND delivery_at IS NOT NULL AND activated_at IS NOT NULL)
  )
);
CREATE INDEX nfc_tags_company_idx ON public.nfc_tags(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX nfc_tags_open_status_idx ON public.nfc_tags(status,created_at DESC) WHERE archived_at IS NULL;
ALTER TABLE public.nfc_tags ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.nfc_tags FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.nfc_tags TO authenticated;

-- Operator notes and mutation audit are not part of the customer-facing table.
CREATE TABLE private.nfc_tag_admin_notes (
  tag_id uuid PRIMARY KEY REFERENCES public.nfc_tags(id) ON DELETE CASCADE,
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes)<=1000)
);
CREATE TABLE private.nfc_tag_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tag_id uuid NOT NULL REFERENCES public.nfc_tags(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('created','updated','archived','unarchived','company_removed')),
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX nfc_tag_events_tag_idx ON private.nfc_tag_events(tag_id,created_at DESC);
CREATE INDEX nfc_tag_events_actor_idx ON private.nfc_tag_events(actor_user_id) WHERE actor_user_id IS NOT NULL;
ALTER TABLE private.nfc_tag_admin_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.nfc_tag_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON private.nfc_tag_admin_notes,private.nfc_tag_events FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON SEQUENCE private.nfc_tag_events_id_seq FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION private.can_read_nfc_tag(p_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT auth.uid() IS NOT NULL AND EXISTS (
  SELECT 1 FROM public.company_members cm
  JOIN public.access_requests r ON r.company_id=cm.company_id AND r.user_id=cm.user_id
  JOIN auth.users u ON u.id=cm.user_id AND u.email_confirmed_at IS NOT NULL
  WHERE cm.company_id=p_company_id AND cm.user_id=auth.uid() AND r.status='approved'
) $$;
REVOKE ALL ON FUNCTION private.can_read_nfc_tag(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.can_read_nfc_tag(uuid) TO authenticated;
CREATE POLICY nfc_tags_read ON public.nfc_tags FOR SELECT TO authenticated
USING ((SELECT private.is_platform_admin()) OR (archived_at IS NULL AND private.can_read_nfc_tag(company_id)));

CREATE FUNCTION private.admin_list_nfc_tags(p_query text DEFAULT '',p_status text DEFAULT 'all',p_limit integer DEFAULT 50,p_offset integer DEFAULT 0)
RETURNS TABLE(id uuid,serial text,company_id uuid,company_name text,status text,notes text,production_at timestamptz,delivery_at timestamptz,activated_at timestamptz,archived_at timestamptz,created_at timestamptz,updated_at timestamptz,total_count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = ''
AS $$ BEGIN
  IF auth.uid() IS NULL OR NOT private.is_platform_admin() THEN RAISE EXCEPTION 'Confirme a autenticação em duas etapas de administrador.' USING ERRCODE='42501'; END IF;
  IF p_query IS NULL OR char_length(p_query)>120 OR p_status IS NULL OR p_status NOT IN ('all','personalization','production','delivery','activated','archived') OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000 THEN RAISE EXCEPTION 'Filtros de plaquinhas inválidos.' USING ERRCODE='22023'; END IF;
  RETURN QUERY SELECT t.id,t.serial,t.company_id,c.name,t.status,coalesce(n.notes,''),t.production_at,t.delivery_at,t.activated_at,t.archived_at,t.created_at,t.updated_at,count(*) OVER()
  FROM public.nfc_tags t LEFT JOIN public.companies c ON c.id=t.company_id LEFT JOIN private.nfc_tag_admin_notes n ON n.tag_id=t.id
  WHERE ((p_status='archived' AND t.archived_at IS NOT NULL) OR (p_status<>'archived' AND t.archived_at IS NULL AND (p_status='all' OR t.status=p_status)))
    AND (btrim(p_query)='' OR strpos(lower(t.serial||' '||coalesce(c.name,'')),lower(btrim(p_query)))>0)
  ORDER BY t.created_at DESC,t.id LIMIT p_limit OFFSET p_offset;
END $$;
REVOKE ALL ON FUNCTION private.admin_list_nfc_tags(text,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.admin_list_nfc_tags(text,text,integer,integer) TO authenticated;
CREATE FUNCTION public.admin_list_nfc_tags(p_query text DEFAULT '',p_status text DEFAULT 'all',p_limit integer DEFAULT 50,p_offset integer DEFAULT 0)
RETURNS TABLE(id uuid,serial text,company_id uuid,company_name text,status text,notes text,production_at timestamptz,delivery_at timestamptz,activated_at timestamptz,archived_at timestamptz,created_at timestamptz,updated_at timestamptz,total_count bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$ SELECT * FROM private.admin_list_nfc_tags(p_query,p_status,p_limit,p_offset) $$;
REVOKE ALL ON FUNCTION public.admin_list_nfc_tags(text,text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_list_nfc_tags(text,text,integer,integer) TO authenticated;

CREATE FUNCTION private.admin_save_nfc_tag(p_tag_id uuid DEFAULT NULL,p_company_id uuid DEFAULT NULL,p_status text DEFAULT 'personalization',p_notes text DEFAULT '',p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ DECLARE old_tag public.nfc_tags%ROWTYPE; new_tag public.nfc_tags%ROWTYPE; old_notes text; old_step integer; next_step integer; changed_at timestamptz:=clock_timestamp(); BEGIN
  IF auth.uid() IS NULL OR NOT private.is_platform_admin() THEN RAISE EXCEPTION 'Confirme a autenticação em duas etapas de administrador.' USING ERRCODE='42501'; END IF;
  IF p_status IS NULL OR p_status NOT IN ('personalization','production','delivery','activated') OR p_notes IS NULL OR char_length(p_notes)>1000 THEN RAISE EXCEPTION 'Confira a etapa e as observações (até 1.000 caracteres).' USING ERRCODE='22023'; END IF;
  IF p_company_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.companies c WHERE c.id=p_company_id) THEN RAISE EXCEPTION 'A empresa selecionada não está disponível.' USING ERRCODE='23503'; END IF;
  IF p_tag_id IS NULL THEN
    IF p_status<>'personalization' THEN RAISE EXCEPTION 'Toda nova plaquinha começa em personalização.' USING ERRCODE='22023'; END IF;
    INSERT INTO public.nfc_tags(company_id,status,updated_at) VALUES(p_company_id,p_status,changed_at) RETURNING * INTO new_tag;
    INSERT INTO private.nfc_tag_admin_notes(tag_id,notes) VALUES(new_tag.id,btrim(p_notes));
    INSERT INTO private.nfc_tag_events(tag_id,actor_user_id,event_type,details) VALUES(new_tag.id,auth.uid(),'created',jsonb_build_object('company_id',p_company_id,'status',p_status));
    RETURN new_tag.id;
  END IF;
  SELECT * INTO old_tag FROM public.nfc_tags t WHERE t.id=p_tag_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plaquinha não encontrada.' USING ERRCODE='P0002'; END IF;
  IF old_tag.archived_at IS NOT NULL THEN RAISE EXCEPTION 'Restaure o cadastro arquivado antes de editar.' USING ERRCODE='22023'; END IF;
  IF p_expected_updated_at IS NULL OR old_tag.updated_at<>p_expected_updated_at THEN RAISE EXCEPTION 'Esta plaquinha foi atualizada. Recarregue os dados antes de editar.' USING ERRCODE='40001'; END IF;
  IF old_tag.company_id IS DISTINCT FROM p_company_id AND old_tag.status<>'personalization' THEN RAISE EXCEPTION 'A empresa fica vinculada ao iniciar a produção. Arquive uma peça desativada em vez de reatribuir seu serial.' USING ERRCODE='22023'; END IF;
  old_step:=array_position(ARRAY['personalization','production','delivery','activated'],old_tag.status);
  next_step:=array_position(ARRAY['personalization','production','delivery','activated'],p_status);
  IF next_step<old_step OR next_step>old_step+1 THEN RAISE EXCEPTION 'Avance uma etapa por vez, sem voltar etapas concluídas.' USING ERRCODE='22023'; END IF;
  IF next_step>1 AND p_company_id IS NULL AND next_step<>old_step THEN RAISE EXCEPTION 'Vincule uma empresa antes de iniciar a produção.' USING ERRCODE='22023'; END IF;
  SELECT n.notes INTO old_notes FROM private.nfc_tag_admin_notes n WHERE n.tag_id=p_tag_id;
  IF old_tag.company_id IS NOT DISTINCT FROM p_company_id AND old_tag.status=p_status AND coalesce(old_notes,'')=btrim(p_notes) THEN RETURN p_tag_id; END IF;
  UPDATE public.nfc_tags SET company_id=p_company_id,status=p_status,
    production_at=CASE WHEN p_status='production' AND old_tag.status='personalization' THEN changed_at ELSE old_tag.production_at END,
    delivery_at=CASE WHEN p_status='delivery' AND old_tag.status='production' THEN changed_at ELSE old_tag.delivery_at END,
    activated_at=CASE WHEN p_status='activated' AND old_tag.status='delivery' THEN changed_at ELSE old_tag.activated_at END,
    updated_at=changed_at WHERE id=p_tag_id RETURNING * INTO new_tag;
  INSERT INTO private.nfc_tag_admin_notes(tag_id,notes) VALUES(p_tag_id,btrim(p_notes)) ON CONFLICT(tag_id) DO UPDATE SET notes=excluded.notes;
  INSERT INTO private.nfc_tag_events(tag_id,actor_user_id,event_type,details) VALUES(p_tag_id,auth.uid(),'updated',jsonb_build_object('previous_company_id',old_tag.company_id,'company_id',p_company_id,'previous_status',old_tag.status,'status',p_status,'notes_changed',coalesce(old_notes,'')<>btrim(p_notes)));
  RETURN p_tag_id;
END $$;
REVOKE ALL ON FUNCTION private.admin_save_nfc_tag(uuid,uuid,text,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.admin_save_nfc_tag(uuid,uuid,text,text,timestamptz) TO authenticated;
CREATE FUNCTION public.admin_save_nfc_tag(p_tag_id uuid DEFAULT NULL,p_company_id uuid DEFAULT NULL,p_status text DEFAULT 'personalization',p_notes text DEFAULT '',p_expected_updated_at timestamptz DEFAULT NULL)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.admin_save_nfc_tag(p_tag_id,p_company_id,p_status,p_notes,p_expected_updated_at) $$;
REVOKE ALL ON FUNCTION public.admin_save_nfc_tag(uuid,uuid,text,text,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_save_nfc_tag(uuid,uuid,text,text,timestamptz) TO authenticated;

CREATE FUNCTION private.admin_archive_nfc_tag(p_tag_id uuid,p_archived boolean,p_expected_updated_at timestamptz)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ DECLARE old_tag public.nfc_tags%ROWTYPE; BEGIN
  IF auth.uid() IS NULL OR NOT private.is_platform_admin() THEN RAISE EXCEPTION 'Confirme a autenticação em duas etapas de administrador.' USING ERRCODE='42501'; END IF;
  IF p_archived IS NULL THEN RAISE EXCEPTION 'Informe a ação de arquivamento.' USING ERRCODE='22023'; END IF;
  SELECT * INTO old_tag FROM public.nfc_tags t WHERE t.id=p_tag_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plaquinha não encontrada.' USING ERRCODE='P0002'; END IF;
  IF p_expected_updated_at IS NULL OR old_tag.updated_at<>p_expected_updated_at THEN RAISE EXCEPTION 'Esta plaquinha foi atualizada. Recarregue antes de continuar.' USING ERRCODE='40001'; END IF;
  IF (old_tag.archived_at IS NOT NULL)=p_archived THEN RETURN p_tag_id; END IF;
  UPDATE public.nfc_tags SET archived_at=CASE WHEN p_archived THEN clock_timestamp() ELSE NULL END,updated_at=clock_timestamp() WHERE id=p_tag_id;
  INSERT INTO private.nfc_tag_events(tag_id,actor_user_id,event_type) VALUES(p_tag_id,auth.uid(),CASE WHEN p_archived THEN 'archived' ELSE 'unarchived' END);
  RETURN p_tag_id;
END $$;
REVOKE ALL ON FUNCTION private.admin_archive_nfc_tag(uuid,boolean,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.admin_archive_nfc_tag(uuid,boolean,timestamptz) TO authenticated;
CREATE FUNCTION public.admin_archive_nfc_tag(p_tag_id uuid,p_archived boolean,p_expected_updated_at timestamptz)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.admin_archive_nfc_tag(p_tag_id,p_archived,p_expected_updated_at) $$;
REVOKE ALL ON FUNCTION public.admin_archive_nfc_tag(uuid,boolean,timestamptz) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_archive_nfc_tag(uuid,boolean,timestamptz) TO authenticated;

-- Deleting an actual company unassigns its physical pieces and removes internal
-- operator notes; it never leaves those notes attached to a different customer.
CREATE FUNCTION private.nfc_tag_company_removed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$ BEGIN
  IF OLD.company_id IS NOT NULL AND NEW.company_id IS NULL AND NOT EXISTS(SELECT 1 FROM public.companies c WHERE c.id=OLD.company_id) THEN
    DELETE FROM private.nfc_tag_admin_notes WHERE tag_id=OLD.id;
    INSERT INTO private.nfc_tag_events(tag_id,actor_user_id,event_type,details) VALUES(OLD.id,auth.uid(),'company_removed',jsonb_build_object('previous_company_id',OLD.company_id));
    NEW.updated_at:=clock_timestamp();
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.nfc_tag_company_removed() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER nfc_tag_company_removed BEFORE UPDATE OF company_id ON public.nfc_tags FOR EACH ROW EXECUTE FUNCTION private.nfc_tag_company_removed();


-- DRAFT: root merges/applies this with the six-feature migration.
-- Monetary access remains owned by process_cakto_event. These functions only observe.
CREATE TABLE IF NOT EXISTS public.billing_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL UNIQUE CHECK (length(source_key) BETWEEN 1 AND 240),
  kind text NOT NULL CHECK (kind IN ('webhook_failure','activation_mismatch','renewal_issue','expired_without_renewal','invalid_subscription')),
  severity text NOT NULL CHECK (severity IN ('warning','critical')),
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  event_type text CHECK (event_type IS NULL OR event_type IN ('purchase_approved','subscription_renewed','subscription_resumed','subscription_late_recovered','subscription_canceled','subscription_paused','refund','chargeback','subscription_late','subscription_renewal_refused')),
  order_ref text CHECK (order_ref IS NULL OR order_ref ~ '^[A-Za-z0-9_.:-]{1,200}$'),
  contract_ref text CHECK (contract_ref IS NULL OR contract_ref ~ '^[A-Za-z0-9_.:-]{1,200}$'),
  product_ref text CHECK (product_ref IS NULL OR product_ref ~ '^[A-Za-z0-9_.:-]{1,200}$'),
  reason_code text NOT NULL CHECK (reason_code IN ('processing_failed','approved_company_not_found','local_subscription_not_found','active_contract_already_linked','cakto_product_mismatch','invalid_payment_amount','invalid_payment_date','invalid_payment_period','invalid_monthly_recurrence','payment_not_confirmed','invalid_payment_currency','missing_required_subscription_fields','invalid_event_record','missing_product_id','product_not_recurring','activation_mismatch','subscription_late','subscription_renewal_refused','period_ended_without_confirmation','invalid_expiry')),
  state text NOT NULL DEFAULT 'open' CHECK (state IN ('open','acknowledged','resolved')),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_detected_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 1 CHECK (attempts BETWEEN 1 AND 1000000),
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz
);
ALTER TABLE public.billing_alerts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billing_alerts FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.billing_alerts TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.billing_alerts TO service_role;
CREATE POLICY billing_alerts_admin_read ON public.billing_alerts FOR SELECT TO authenticated USING ((SELECT private.is_platform_admin()));
CREATE INDEX IF NOT EXISTS billing_alerts_state_seen_idx ON public.billing_alerts(state,last_seen_at DESC);
CREATE INDEX IF NOT EXISTS billing_alerts_company_idx ON public.billing_alerts(company_id) WHERE company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS webhook_cakto_contract_processed_idx ON public.webhook_events ((payload->>'subscription_id'),(payload->>'product_id'),processed_at DESC) WHERE provider='cakto' AND processed_at IS NOT NULL;

CREATE OR REPLACE FUNCTION private.upsert_billing_alert(
 p_source text,p_kind text,p_severity text,p_company uuid,p_event text,p_order text,p_contract text,p_product text,p_reason text,p_seen timestamptz,p_attempt boolean DEFAULT false
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result uuid;
BEGIN
 IF p_order IS NOT NULL AND p_order !~ '^[A-Za-z0-9_.:-]{1,200}$' THEN p_order:=NULL; END IF;
 IF p_contract IS NOT NULL AND p_contract !~ '^[A-Za-z0-9_.:-]{1,200}$' THEN p_contract:=NULL; END IF;
 IF p_product IS NOT NULL AND p_product !~ '^[A-Za-z0-9_.:-]{1,200}$' THEN p_product:=NULL; END IF;
 INSERT INTO public.billing_alerts(source_key,kind,severity,company_id,event_type,order_ref,contract_ref,product_ref,reason_code,first_seen_at,last_seen_at,last_detected_at)
 VALUES(p_source,p_kind,p_severity,p_company,p_event,p_order,p_contract,p_product,p_reason,p_seen,p_seen,clock_timestamp())
 ON CONFLICT(source_key) DO UPDATE SET
  severity=EXCLUDED.severity,company_id=EXCLUDED.company_id,event_type=EXCLUDED.event_type,
  order_ref=EXCLUDED.order_ref,contract_ref=EXCLUDED.contract_ref,product_ref=EXCLUDED.product_ref,reason_code=EXCLUDED.reason_code,
  state=CASE WHEN public.billing_alerts.state='resolved' THEN 'open' ELSE public.billing_alerts.state END,
  acknowledged_at=CASE WHEN public.billing_alerts.state='resolved' THEN NULL ELSE public.billing_alerts.acknowledged_at END,
  acknowledged_by=CASE WHEN public.billing_alerts.state='resolved' THEN NULL ELSE public.billing_alerts.acknowledged_by END,
  resolved_at=NULL,last_seen_at=greatest(public.billing_alerts.last_seen_at,EXCLUDED.last_seen_at),last_detected_at=clock_timestamp(),
  attempts=CASE WHEN p_attempt THEN least(public.billing_alerts.attempts+1,1000000) ELSE public.billing_alerts.attempts END
 RETURNING id INTO result;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION private.upsert_billing_alert(text,text,text,uuid,text,text,text,text,text,timestamptz,boolean) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.record_cakto_failure(p_failure jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 v_event text:=p_failure->>'event_type'; v_order text:=p_failure->>'order_id';
 v_contract text:=p_failure->>'subscription_id'; v_product text:=p_failure->>'product_id';
 v_reason text:=p_failure->>'reason_code'; v_company uuid;
BEGIN
 IF jsonb_typeof(p_failure) IS DISTINCT FROM 'object' OR octet_length(p_failure::text)>4096 THEN RAISE EXCEPTION 'invalid_failure_record' USING ERRCODE='22023'; END IF;
 IF v_event IS NULL OR v_event NOT IN ('purchase_approved','subscription_renewed','subscription_resumed','subscription_late_recovered','subscription_canceled','subscription_paused','refund','chargeback','subscription_late','subscription_renewal_refused') THEN v_event:=NULL; END IF;
 IF v_order IS NULL OR v_order !~ '^[A-Za-z0-9_.:-]{1,200}$' THEN v_order:=NULL; END IF;
 IF v_contract IS NULL OR v_contract !~ '^[A-Za-z0-9_.:-]{1,200}$' THEN v_contract:=NULL; END IF;
 IF v_product IS NULL OR v_product !~ '^[A-Za-z0-9_.:-]{1,200}$' THEN v_product:=NULL; END IF;
 IF v_event IS NULL OR v_product IS NULL OR (v_order IS NULL AND v_contract IS NULL) THEN RAISE EXCEPTION 'invalid_failure_record' USING ERRCODE='22023'; END IF;
 IF v_reason IS NULL OR v_reason NOT IN ('approved_company_not_found','local_subscription_not_found','active_contract_already_linked','cakto_product_mismatch','invalid_payment_amount','invalid_payment_date','invalid_payment_period','invalid_monthly_recurrence','payment_not_confirmed','invalid_payment_currency','missing_required_subscription_fields','invalid_event_record','missing_product_id','product_not_recurring') THEN v_reason:='processing_failed'; END IF;
 SELECT company_id INTO v_company FROM public.subscriptions WHERE cakto_subscription_id=v_contract AND cakto_product_id=v_product ORDER BY created_at LIMIT 1;
 -- No raw JSON, error.message, customer identity, signature or secret is persisted.
 RETURN private.upsert_billing_alert('webhook:'||md5(coalesce(v_event,'unknown')||':'||coalesce(v_order,'unknown')||':'||coalesce(v_contract,'unknown')||':'||coalesce(v_product,'unknown')),
  'webhook_failure','critical',v_company,v_event,v_order,v_contract,v_product,v_reason,statement_timestamp(),true);
END;
$$;
REVOKE ALL ON FUNCTION private.record_cakto_failure(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION private.record_cakto_failure(jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.record_cakto_failure(p_failure jsonb) RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.record_cakto_failure(p_failure); $$;
REVOKE ALL ON FUNCTION public.record_cakto_failure(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_cakto_failure(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION private.operational_timestamp(p_value text)
RETURNS timestamptz LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_value IS NULL OR length(p_value)>64 THEN RETURN NULL; END IF;
 RETURN p_value::timestamptz;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION private.operational_timestamp(text) FROM PUBLIC,anon,authenticated,service_role;

-- Owner-only entrypoint for pg_cron. Not executable by customers or exposed APIs.
CREATE OR REPLACE FUNCTION private.refresh_operational_alerts_internal()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE row record; scan_at timestamptz:=clock_timestamp(); active_count bigint;
BEGIN
 IF NOT pg_try_advisory_xact_lock(hashtextextended('nfc_operational_alert_scan',0)) THEN RETURN jsonb_build_object('skipped',true); END IF;
 -- A real successful processing of the same event supersedes a prior failed attempt.
 UPDATE public.billing_alerts a SET state='resolved',resolved_at=scan_at
 WHERE a.kind='webhook_failure' AND a.state<>'resolved' AND EXISTS (
  SELECT 1 FROM public.webhook_events e WHERE e.provider='cakto' AND e.processed_at IS NOT NULL
   AND e.payload->>'outcome'='processed' AND e.event_type=a.event_type
   AND e.payload->>'order_id'=a.order_ref AND e.payload->>'subscription_id'=a.contract_ref AND e.payload->>'product_id'=a.product_ref
 );
 -- Inspect only evidence accepted by the payment processor. A later refund of
 -- the very same order is intentional revocation, not an activation failure.
 FOR row IN
  WITH latest AS (
   SELECT DISTINCT ON(e.payload->>'subscription_id',e.payload->>'product_id') e.*
   FROM public.webhook_events e WHERE e.provider='cakto' AND e.processed_at IS NOT NULL AND e.payload->>'outcome'='processed'
    AND e.event_type IN ('purchase_approved','subscription_renewed','subscription_resumed','subscription_late_recovered')
   ORDER BY e.payload->>'subscription_id',e.payload->>'product_id',private.operational_timestamp(e.payload->>'paid_at') DESC NULLS LAST,e.processed_at DESC,e.id
  )
  SELECT e.id,e.event_type,e.payload,e.processed_at,s.company_id FROM latest e
  LEFT JOIN public.subscriptions s ON s.cakto_subscription_id=e.payload->>'subscription_id' AND s.cakto_product_id=e.payload->>'product_id'
  WHERE private.operational_timestamp(e.payload->>'period_end')>scan_at
   AND NOT EXISTS(SELECT 1 FROM public.webhook_events r WHERE r.provider='cakto' AND r.processed_at IS NOT NULL AND r.payload->>'outcome'='processed' AND r.event_type IN ('refund','chargeback') AND r.payload->>'order_id'=e.payload->>'order_id' AND r.payload->>'subscription_id'=e.payload->>'subscription_id' AND r.payload->>'product_id'=e.payload->>'product_id')
   AND (s.id IS NULL OR s.status<>'active' OR s.expires_at IS NULL OR s.expires_at<private.operational_timestamp(e.payload->>'period_end'))
 LOOP
  PERFORM private.upsert_billing_alert('activation:'||row.id,'activation_mismatch','critical',row.company_id,row.event_type,row.payload->>'order_id',row.payload->>'subscription_id',row.payload->>'product_id','activation_mismatch',row.processed_at);
 END LOOP;
 -- A renewal alert records what the provider sent; it never states that a
 -- charge was definitely declined when all we know is a missing confirmation.
 FOR row IN
  SELECT s.company_id,s.cakto_subscription_id,s.cakto_product_id,e.event_type,e.payload,e.processed_at
  FROM public.subscriptions s
  JOIN LATERAL(SELECT e.* FROM public.webhook_events e WHERE e.provider='cakto' AND e.processed_at IS NOT NULL AND e.payload->>'outcome'='processed' AND e.payload->>'subscription_id'=s.cakto_subscription_id AND e.payload->>'product_id'=s.cakto_product_id ORDER BY coalesce(private.operational_timestamp(e.payload->>'event_at'),e.processed_at) DESC,e.processed_at DESC,e.id LIMIT 1)e ON true
  WHERE e.event_type IN ('subscription_late','subscription_renewal_refused')
 LOOP
  PERFORM private.upsert_billing_alert('renewal:'||md5(row.cakto_subscription_id||':'||row.cakto_product_id),'renewal_issue','warning',row.company_id,row.event_type,row.payload->>'order_id',row.cakto_subscription_id,row.cakto_product_id,row.event_type,row.processed_at);
 END LOOP;
 FOR row IN
  SELECT s.* FROM public.subscriptions s
  LEFT JOIN LATERAL(SELECT e.event_type FROM public.webhook_events e WHERE e.provider='cakto' AND e.processed_at IS NOT NULL AND e.payload->>'outcome'='processed' AND e.payload->>'subscription_id'=s.cakto_subscription_id AND e.payload->>'product_id'=s.cakto_product_id ORDER BY coalesce(private.operational_timestamp(e.payload->>'event_at'),e.processed_at) DESC,e.processed_at DESC,e.id LIMIT 1)e ON true
  WHERE s.status IN ('active','expired') AND s.expires_at<=scan_at AND s.cakto_subscription_id IS NOT NULL
   AND coalesce(e.event_type,'') NOT IN ('subscription_canceled','subscription_paused','refund','chargeback','subscription_late','subscription_renewal_refused')
 LOOP
  PERFORM private.upsert_billing_alert('expiry:'||row.company_id,'expired_without_renewal','warning',row.company_id,NULL,row.cakto_current_paid_order_id,row.cakto_subscription_id,row.cakto_product_id,'period_ended_without_confirmation',row.expires_at);
 END LOOP;
 FOR row IN SELECT * FROM public.subscriptions WHERE status='active' AND expires_at IS NULL LOOP
  PERFORM private.upsert_billing_alert('invalid:'||row.company_id,'invalid_subscription','critical',row.company_id,NULL,NULL,row.cakto_subscription_id,row.cakto_product_id,'invalid_expiry',scan_at);
 END LOOP;
 UPDATE public.billing_alerts SET state='resolved',resolved_at=scan_at
 WHERE kind<>'webhook_failure' AND state<>'resolved' AND last_detected_at<scan_at;
 SELECT count(*) INTO active_count FROM public.billing_alerts WHERE state<>'resolved';
 RETURN jsonb_build_object('scan_at',scan_at,'active',active_count);
END;
$$;
REVOKE ALL ON FUNCTION private.refresh_operational_alerts_internal() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION private.refresh_operational_alerts()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT private.is_platform_admin() AND coalesce(auth.jwt()->>'role','')<>'service_role' THEN RAISE EXCEPTION 'Administrator MFA required' USING ERRCODE='42501'; END IF;
 RETURN private.refresh_operational_alerts_internal();
END;
$$;
REVOKE ALL ON FUNCTION private.refresh_operational_alerts() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.refresh_operational_alerts() TO authenticated,service_role;
CREATE OR REPLACE FUNCTION public.refresh_operational_alerts() RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.refresh_operational_alerts(); $$;
REVOKE ALL ON FUNCTION public.refresh_operational_alerts() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.refresh_operational_alerts() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION private.acknowledge_billing_alert(p_alert_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT private.is_platform_admin() THEN RAISE EXCEPTION 'Administrator MFA required' USING ERRCODE='42501'; END IF;
 UPDATE public.billing_alerts SET state='acknowledged',acknowledged_at=statement_timestamp(),acknowledged_by=auth.uid() WHERE id=p_alert_id AND state='open';
 IF NOT FOUND THEN RAISE EXCEPTION 'Alert is not open' USING ERRCODE='22023'; END IF;
END;
$$;
REVOKE ALL ON FUNCTION private.acknowledge_billing_alert(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.acknowledge_billing_alert(uuid) TO authenticated;
CREATE OR REPLACE FUNCTION public.acknowledge_billing_alert(p_alert_id uuid) RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT private.acknowledge_billing_alert(p_alert_id); $$;
REVOKE ALL ON FUNCTION public.acknowledge_billing_alert(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_billing_alert(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION private.admin_sales_funnel(p_days integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT private.is_platform_admin() THEN RAISE EXCEPTION 'Administrator MFA required' USING ERRCODE='42501'; END IF;
 IF p_days NOT IN (0,7,30,90) OR p_days IS NULL THEN RAISE EXCEPTION 'Invalid cohort period' USING ERRCODE='22023'; END IF;
 WITH cohort AS (
  SELECT u.id,u.email_confirmed_at FROM auth.users u WHERE u.deleted_at IS NULL AND NOT EXISTS(SELECT 1 FROM public.platform_admins a WHERE a.user_id=u.id)
   AND (p_days=0 OR u.created_at>=statement_timestamp()-p_days*interval '1 day')
 ), approved AS (
  SELECT DISTINCT u.id AS user_id,r.company_id FROM cohort u JOIN public.access_requests r ON r.user_id=u.id
  WHERE u.email_confirmed_at IS NOT NULL AND r.status='approved' AND r.company_id IS NOT NULL
   AND EXISTS(SELECT 1 FROM public.company_members m WHERE m.company_id=r.company_id AND m.user_id=u.id)
 ), company_evidence AS (
  SELECT a.user_id,c.id AS company_id,s.status,s.expires_at,c.description,c.phone,c.whatsapp,c.phone_enabled,c.whatsapp_enabled,p.tagline,
   (EXISTS(SELECT 1 FROM public.webhook_events e WHERE e.provider='cakto' AND e.processed_at IS NOT NULL AND e.payload->>'outcome'='processed' AND e.event_type IN ('purchase_approved','subscription_renewed','subscription_resumed','subscription_late_recovered') AND e.payload->>'subscription_id'=s.cakto_subscription_id AND e.payload->>'product_id'=s.cakto_product_id)) AS verified_paid
  FROM approved a JOIN public.companies c ON c.id=a.company_id LEFT JOIN public.subscriptions s ON s.company_id=c.id LEFT JOIN public.profiles p ON p.company_id=c.id
 ), paid AS (SELECT DISTINCT user_id FROM company_evidence WHERE verified_paid), ready AS (
  SELECT DISTINCT user_id FROM company_evidence c WHERE verified_paid AND status='active' AND expires_at>statement_timestamp()
   AND coalesce(nullif(btrim(tagline),''),nullif(btrim(description),'')) IS NOT NULL
   AND ((phone_enabled AND nullif(btrim(phone),'') IS NOT NULL) OR (whatsapp_enabled AND nullif(btrim(whatsapp),'') IS NOT NULL) OR EXISTS(SELECT 1 FROM public.actions a WHERE a.company_id=c.company_id AND a.enabled))
 ), legacy AS (SELECT DISTINCT user_id FROM company_evidence WHERE NOT verified_paid AND status='active' AND expires_at>statement_timestamp())
 SELECT jsonb_build_object('snapshot_at',statement_timestamp(),'period_days',p_days,'cohort_started_at',CASE WHEN p_days=0 THEN NULL ELSE statement_timestamp()-p_days*interval '1 day' END,
  'registered',(SELECT count(*) FROM cohort),'confirmed',(SELECT count(*) FROM cohort WHERE email_confirmed_at IS NOT NULL),'approved',(SELECT count(DISTINCT user_id) FROM approved),'paid',(SELECT count(*) FROM paid),'ready',(SELECT count(*) FROM ready),'legacy_active_without_evidence',(SELECT count(*) FROM legacy)) INTO result;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION private.admin_sales_funnel(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.admin_sales_funnel(integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.admin_sales_funnel(p_days integer DEFAULT 30) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.admin_sales_funnel(p_days); $$;
REVOKE ALL ON FUNCTION public.admin_sales_funnel(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_sales_funnel(integer) TO authenticated;

-- A single bounded read supplies the list and badge count without loading all alerts.
CREATE OR REPLACE FUNCTION private.admin_billing_alerts(p_state text DEFAULT 'active',p_limit integer DEFAULT 20,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT private.is_platform_admin() THEN RAISE EXCEPTION 'Administrator MFA required' USING ERRCODE='42501'; END IF;
 IF p_state IS NULL OR p_state NOT IN ('active','resolved') OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 1000000 THEN
  RAISE EXCEPTION 'Invalid alert query' USING ERRCODE='22023';
 END IF;
 WITH filtered AS MATERIALIZED (
  SELECT a.id,a.kind,a.severity,a.state,a.company_id,c.name AS company_name,a.reason_code,a.event_type,a.order_ref,a.contract_ref,a.first_seen_at,a.last_seen_at,a.attempts,a.resolved_at
  FROM public.billing_alerts a LEFT JOIN public.companies c ON c.id=a.company_id
  WHERE (p_state='active' AND a.state<>'resolved') OR (p_state='resolved' AND a.state='resolved')
 ), selected AS (
  SELECT * FROM filtered ORDER BY CASE WHEN state='open' THEN 0 ELSE 1 END,CASE WHEN severity='critical' THEN 0 ELSE 1 END,last_seen_at DESC,id LIMIT p_limit OFFSET p_offset
 )
 SELECT jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY CASE WHEN state='open' THEN 0 ELSE 1 END,CASE WHEN severity='critical' THEN 0 ELSE 1 END,last_seen_at DESC,id) FROM selected s),'[]'::jsonb),
  'total',(SELECT count(*) FROM filtered),'active',(SELECT count(*) FROM public.billing_alerts WHERE state<>'resolved'),
  'open',(SELECT count(*) FROM public.billing_alerts WHERE state='open'),'snapshot_at',statement_timestamp()) INTO result;
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION private.admin_billing_alerts(text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION private.admin_billing_alerts(text,integer,integer) TO authenticated;
CREATE OR REPLACE FUNCTION public.admin_billing_alerts(p_state text DEFAULT 'active',p_limit integer DEFAULT 20,p_offset integer DEFAULT 0)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT private.admin_billing_alerts(p_state,p_limit,p_offset); $$;
REVOKE ALL ON FUNCTION public.admin_billing_alerts(text,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.admin_billing_alerts(text,integer,integer) TO authenticated;


-- Scheduled observation only; no outbound request or billing mutation.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;
SELECT cron.schedule('nfc-operational-alerts','*/5 * * * *',$job$SELECT private.refresh_operational_alerts_internal();$job$);
SELECT private.refresh_operational_alerts_internal();
