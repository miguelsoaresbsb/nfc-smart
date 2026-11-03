-- NFC Smart production hardening: monthly default, optimized auth lookups,
-- and explicit service-role-only access for the internal webhook ledger.
ALTER TABLE public.subscriptions ALTER COLUMN plan SET DEFAULT 'monthly';

DROP POLICY IF EXISTS "request own insert" ON public.access_requests;
CREATE POLICY "request own insert" ON public.access_requests
FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "request own read" ON public.access_requests;
CREATE POLICY "request own read" ON public.access_requests
FOR SELECT TO authenticated
USING ((user_id = (SELECT auth.uid())) OR private.is_platform_admin());

DROP POLICY IF EXISTS "member members" ON public.company_members;
CREATE POLICY "member members" ON public.company_members
FOR SELECT TO authenticated
USING ((user_id = (SELECT auth.uid())) OR private.is_platform_admin() OR private.is_company_member(company_id));

DROP POLICY IF EXISTS "admin platform" ON public.platform_admins;
CREATE POLICY "admin platform" ON public.platform_admins
FOR SELECT TO authenticated
USING ((user_id = (SELECT auth.uid())) OR private.is_platform_admin());

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.webhook_events FROM anon, authenticated;
GRANT ALL ON TABLE public.webhook_events TO service_role;
