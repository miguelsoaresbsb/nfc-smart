-- A login, approved request or editable membership alone is not a paid license.
-- Keep billing/account metadata available so customers can regularize access;
-- protect the feature data at the database boundary, including direct REST/RPC.
CREATE OR REPLACE FUNCTION private.is_public_company_active(p_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.company_id = p_company_id AND s.status = 'active'
      AND s.expires_at IS NOT NULL AND s.expires_at > now()
  )
$$;
REVOKE ALL ON FUNCTION private.is_public_company_active(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_public_company_active(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.can_use_company(p_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT private.is_platform_admin() OR (
    private.is_public_company_active(p_company_id)
    AND private.is_company_member(p_company_id)
    AND EXISTS (
      SELECT 1 FROM public.access_requests r
      WHERE r.user_id = (SELECT auth.uid()) AND r.company_id = p_company_id
        AND r.status = 'approved'
    )
  )
$$;
REVOKE ALL ON FUNCTION private.can_use_company(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_use_company(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION private.can_edit_company(p_company_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT private.is_platform_admin() OR (
    private.can_use_company(p_company_id)
    AND EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = p_company_id AND cm.user_id = (SELECT auth.uid())
        AND cm.role IN ('owner', 'admin', 'editor')
    )
  )
$$;
REVOKE ALL ON FUNCTION private.can_edit_company(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_edit_company(uuid) TO authenticated, service_role;

-- The existing INSERT/UPDATE/DELETE policies, reorder RPC and storage writer
-- helper all call can_edit_company, so they inherit this paid check atomically.
ALTER POLICY actions_select_authenticated ON public.actions
USING (private.can_use_company(company_id) OR (enabled AND private.is_public_company_active(company_id)));
ALTER POLICY profiles_select_authenticated ON public.profiles
USING (private.can_use_company(company_id) OR private.is_public_company_active(company_id));
ALTER POLICY profile_media_select_authenticated ON public.profile_media
USING (private.can_use_company(company_id) OR (enabled AND private.is_public_company_active(company_id)));
ALTER POLICY qr_codes_select_authenticated ON public.qr_codes
USING (private.can_use_company(company_id) OR (enabled AND private.is_public_company_active(company_id)));
ALTER POLICY "member analytics" ON public.analytics_events
USING (private.can_use_company(company_id));

CREATE OR REPLACE FUNCTION private.can_read_company_asset(p_name text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT private.is_platform_admin() OR EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id::text = (storage.foldername(p_name))[1]
      AND cm.user_id = (SELECT auth.uid()) AND private.can_use_company(cm.company_id)
  )
$$;
REVOKE ALL ON FUNCTION private.can_read_company_asset(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.can_read_company_asset(text) TO authenticated, service_role;
DROP POLICY IF EXISTS "public company assets" ON storage.objects;
CREATE POLICY "paid member asset metadata" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'company-assets' AND private.can_read_company_asset(name));
-- company-assets remains a public bucket for deliberately published business
-- images at known URLs. This policy removes anonymous directory enumeration;
-- signed-in listing and all writes are checked against the paid membership.

-- New accounts must establish control of their email through Supabase Auth.
-- Existing confirmed accounts and the current administrator are not changed.
DROP TRIGGER IF EXISTS auto_confirm_signup_email ON auth.users;
REVOKE ALL ON FUNCTION private.auto_confirm_signup_email() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.bootstrap_platform_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.create_access_request_on_signup() FROM PUBLIC, anon, authenticated;

-- RLS does not govern TRUNCATE. Remove Supabase's legacy broad defaults and
-- regrant only the Data API operations actually used by this application.
REVOKE ALL ON public.companies, public.profiles, public.company_members,
  public.access_requests, public.platform_admins, public.actions,
  public.profile_media, public.qr_codes, public.subscriptions,
  public.analytics_events, public.webhook_events FROM anon, authenticated;
GRANT SELECT ON public.companies, public.profiles, public.actions,
  public.profile_media, public.qr_codes TO anon;
GRANT INSERT ON public.analytics_events TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.companies, public.profiles,
  public.company_members, public.access_requests, public.actions,
  public.profile_media, public.qr_codes, public.subscriptions TO authenticated;
GRANT SELECT ON public.platform_admins TO authenticated;
GRANT SELECT, INSERT ON public.analytics_events TO authenticated;
-- Changes to subscriptions, memberships and approvals remain admin-only under
-- the existing RLS policies. Webhook ledger/RPC remain service-role-only.

-- A customer may not claim a different buyer's email in a pending request.
-- The helper can inspect only the current account, avoiding email enumeration.
CREATE OR REPLACE FUNCTION private.owns_verified_email(p_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id = (SELECT auth.uid())
      AND u.email_confirmed_at IS NOT NULL
      AND lower(btrim(u.email)) = lower(btrim(p_email))
  )
$$;
REVOKE ALL ON FUNCTION private.owns_verified_email(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.owns_verified_email(text) TO authenticated, service_role;
ALTER POLICY access_requests_insert ON public.access_requests
WITH CHECK (
  private.is_platform_admin()
  OR (user_id = (SELECT auth.uid()) AND status = 'pending'
    AND company_id IS NULL AND reviewed_at IS NULL
    AND private.owns_verified_email(email))
);

CREATE OR REPLACE FUNCTION private.approve_access_request(request_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  access_request public.access_requests%ROWTYPE;
  new_company_id uuid;
  base_slug text;
  company_slug text;
BEGIN
  IF auth.uid() IS NULL OR NOT private.is_platform_admin() THEN
    RAISE EXCEPTION 'Somente administradores podem autorizar acessos.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO access_request FROM public.access_requests
  WHERE id = request_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada.';
  END IF;
  IF access_request.status = 'approved' AND access_request.company_id IS NOT NULL THEN
    RETURN access_request.company_id;
  END IF;
  IF access_request.status <> 'pending' OR access_request.user_id IS NULL THEN
    RAISE EXCEPTION 'Esta solicitação não está pendente ou não possui usuário.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id = access_request.user_id
      AND u.email_confirmed_at IS NOT NULL
      AND lower(btrim(u.email)) = lower(btrim(access_request.email))
  ) THEN
    RAISE EXCEPTION 'O e-mail da solicitação precisa corresponder à conta confirmada.' USING ERRCODE = '42501';
  END IF;
  base_slug := trim(both '-' from regexp_replace(lower(translate(
    access_request.company_name,
    'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
    'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
  )), '[^a-z0-9]+', '-', 'g'));
  base_slug := coalesce(nullif(left(base_slug, 90), ''), 'empresa');
  company_slug := base_slug;
  LOOP
    BEGIN
      INSERT INTO public.companies(name, slug)
      VALUES (trim(access_request.company_name), company_slug)
      RETURNING id INTO new_company_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      company_slug := base_slug || '-' || left(replace(gen_random_uuid()::text, '-', ''), 12);
    END;
  END LOOP;
  INSERT INTO public.profiles(company_id, display_name)
  VALUES (new_company_id, trim(access_request.company_name));
  INSERT INTO public.subscriptions(company_id, plan, status)
  VALUES (new_company_id, 'monthly', 'pending');
  INSERT INTO public.company_members(company_id, user_id, role)
  VALUES (new_company_id, access_request.user_id, 'owner');
  UPDATE public.access_requests SET status = 'approved',
    company_id = new_company_id, reviewed_at = now()
  WHERE id = request_id;
  RETURN new_company_id;
END;
$$;
