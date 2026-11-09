-- Use the existing private helper so anonymous visitors do not need access to
-- the private subscription records when recording public page analytics.
DROP POLICY IF EXISTS "public analytics insert" ON public.analytics_events;
CREATE POLICY "public analytics insert"
ON public.analytics_events
FOR INSERT TO anon, authenticated
WITH CHECK (
  event_type IN ('page_view', 'action_click')
  AND private.is_public_company_active(company_id)
  AND (
    action_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.actions a
      WHERE a.id = analytics_events.action_id
        AND a.company_id = analytics_events.company_id
        AND a.enabled
    )
  )
);

-- A customer may request access, but only a platform admin can approve access
-- or choose the company the request is associated with.
DROP POLICY IF EXISTS "access_requests_insert" ON public.access_requests;
DROP POLICY IF EXISTS "request own insert" ON public.access_requests;
CREATE POLICY "access_requests_insert"
ON public.access_requests
FOR INSERT TO authenticated
WITH CHECK (
  private.is_platform_admin()
  OR (
    user_id = (SELECT auth.uid())
    AND status = 'pending'
    AND company_id IS NULL
    AND reviewed_at IS NULL
  )
);

-- Initial administrator setup has already completed. Preserve the existing
-- platform_admins row; future signup emails must never grant master access.
DROP TRIGGER IF EXISTS bootstrap_platform_admin ON auth.users;
