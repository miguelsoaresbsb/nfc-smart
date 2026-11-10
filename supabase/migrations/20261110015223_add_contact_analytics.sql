-- Direct contact clicks share the existing analytics stream. Only the contact
-- category is stored; phone numbers and WhatsApp destinations are never logged.
ALTER TABLE public.analytics_events ADD COLUMN IF NOT EXISTS contact_type text;
ALTER TABLE public.analytics_events DROP CONSTRAINT IF EXISTS analytics_contact_type_check;
ALTER TABLE public.analytics_events ADD CONSTRAINT analytics_contact_type_check
CHECK (contact_type IS NULL OR (
  contact_type IN ('phone', 'whatsapp', 'phone_copy')
  AND event_type = 'action_click' AND action_id IS NULL
));

DROP POLICY IF EXISTS "public analytics insert" ON public.analytics_events;
CREATE POLICY "public analytics insert" ON public.analytics_events
FOR INSERT TO anon, authenticated
WITH CHECK (
  private.is_public_company_active(company_id)
  AND (
    (event_type = 'page_view' AND action_id IS NULL AND contact_type IS NULL)
    OR (
      event_type = 'action_click' AND contact_type IS NULL
      AND action_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.actions a
        WHERE a.id = analytics_events.action_id
          AND a.company_id = analytics_events.company_id AND a.enabled
      )
    )
    OR (
      event_type = 'action_click' AND action_id IS NULL
      AND contact_type IN ('phone', 'whatsapp', 'phone_copy')
      AND EXISTS (
        SELECT 1 FROM public.companies c
        WHERE c.id = analytics_events.company_id AND (
          (analytics_events.contact_type IN ('phone', 'phone_copy') AND c.phone_enabled AND nullif(btrim(c.phone), '') IS NOT NULL)
          OR (analytics_events.contact_type = 'whatsapp' AND c.whatsapp_enabled AND nullif(btrim(c.whatsapp), '') IS NOT NULL)
        )
      )
    )
  )
);
