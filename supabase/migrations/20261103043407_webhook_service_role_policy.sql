-- Explicitly document the internal webhook ledger's service-role-only RLS path.
DROP POLICY IF EXISTS "service role webhook ledger" ON public.webhook_events;
CREATE POLICY "service role webhook ledger"
ON public.webhook_events
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
