-- Membership permits reading; only the documented editing roles permit writes.
-- SECURITY INVOKER uses the member's existing RLS SELECT policy and never
-- bypasses tenant isolation.
CREATE OR REPLACE FUNCTION private.can_edit_company(p_company_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.is_platform_admin() OR EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = p_company_id
      AND cm.user_id = (SELECT auth.uid())
      AND cm.role IN ('owner', 'admin', 'editor')
  )
$function$;
REVOKE ALL ON FUNCTION private.can_edit_company(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_edit_company(uuid) TO authenticated, service_role;

ALTER POLICY "companies_update_admin_or_member" ON public.companies
USING (private.can_edit_company(id)) WITH CHECK (private.can_edit_company(id));

DO $policies$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['actions', 'profiles', 'profile_media', 'qr_codes']
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON public.%I WITH CHECK (private.can_edit_company(company_id))',
      table_name || '_insert_members', table_name
    );
    EXECUTE format(
      'ALTER POLICY %I ON public.%I USING (private.can_edit_company(company_id)) WITH CHECK (private.can_edit_company(company_id))',
      table_name || '_update_members', table_name
    );
    EXECUTE format(
      'ALTER POLICY %I ON public.%I USING (private.can_edit_company(company_id))',
      table_name || '_delete_members', table_name
    );
  END LOOP;
END
$policies$;

CREATE OR REPLACE FUNCTION private.can_edit_company_asset(p_name text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY INVOKER
SET search_path = ''
AS $function$
  SELECT private.is_platform_admin() OR EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id::text = (storage.foldername(p_name))[1]
      AND cm.user_id = (SELECT auth.uid())
      AND private.can_edit_company(cm.company_id)
  )
$function$;
REVOKE ALL ON FUNCTION private.can_edit_company_asset(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_edit_company_asset(text) TO authenticated, service_role;

ALTER POLICY "member upload assets" ON storage.objects
WITH CHECK (bucket_id = 'company-assets' AND private.can_edit_company_asset(name));
ALTER POLICY "member update assets" ON storage.objects
USING (bucket_id = 'company-assets' AND private.can_edit_company_asset(name))
WITH CHECK (bucket_id = 'company-assets' AND private.can_edit_company_asset(name));
ALTER POLICY "member delete assets" ON storage.objects
USING (bucket_id = 'company-assets' AND private.can_edit_company_asset(name));

-- A foreign key on the QR id alone does not establish tenant ownership.
-- Reject non-existing and invisible references without leaking other tenants.
CREATE OR REPLACE FUNCTION private.validate_action_qr_company()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.pix_qr_code_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.qr_codes q
    WHERE q.id = NEW.pix_qr_code_id AND q.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'PIX QR Code must belong to the action company'
      USING ERRCODE = '23503', CONSTRAINT = 'actions_pix_qr_code_id_fkey';
  END IF;
  IF NEW.wifi_qr_code_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.qr_codes q
    WHERE q.id = NEW.wifi_qr_code_id AND q.company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Wi-Fi QR Code must belong to the action company'
      USING ERRCODE = '23503', CONSTRAINT = 'actions_wifi_qr_code_id_fkey';
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION private.validate_action_qr_company() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS validate_action_qr_company ON public.actions;
CREATE TRIGGER validate_action_qr_company
BEFORE INSERT OR UPDATE OF company_id, pix_qr_code_id, wifi_qr_code_id
ON public.actions FOR EACH ROW EXECUTE FUNCTION private.validate_action_qr_company();

-- Moving a QR to a different tenant would invalidate existing action links.
CREATE OR REPLACE FUNCTION private.prevent_qr_company_move()
RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION 'QR Codes cannot be moved between companies' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION private.prevent_qr_company_move() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS prevent_qr_company_move ON public.qr_codes;
CREATE TRIGGER prevent_qr_company_move
BEFORE UPDATE OF company_id ON public.qr_codes
FOR EACH ROW EXECUTE FUNCTION private.prevent_qr_company_move();
