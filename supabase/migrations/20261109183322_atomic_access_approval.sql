-- The privileged implementation stays outside the exposed schema. Every call
-- verifies the real platform-admin table, then locks the request for retries.
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

REVOKE ALL ON FUNCTION private.approve_access_request(uuid) FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.approve_access_request(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_access_request(request_id uuid)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$ SELECT private.approve_access_request(request_id); $$;
REVOKE ALL ON FUNCTION public.approve_access_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_access_request(uuid) TO authenticated;
