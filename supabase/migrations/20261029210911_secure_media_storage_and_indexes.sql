-- Security hardening and supporting indexes applied to NFC Smart production.
-- Public media reads remain available only when the owning company's subscription is active.
DROP POLICY IF EXISTS "public active media" ON public.profile_media;
CREATE POLICY "public active media"
ON public.profile_media
FOR SELECT
TO anon, authenticated
USING (enabled AND private.is_public_company_active(company_id));

-- Cover foreign keys used by common lookups and deletes.
CREATE INDEX IF NOT EXISTS access_requests_company_id_idx ON public.access_requests(company_id);
CREATE INDEX IF NOT EXISTS access_requests_user_id_idx ON public.access_requests(user_id);
CREATE INDEX IF NOT EXISTS actions_company_id_idx ON public.actions(company_id);
CREATE INDEX IF NOT EXISTS actions_pix_qr_code_id_idx ON public.actions(pix_qr_code_id);
CREATE INDEX IF NOT EXISTS actions_wifi_qr_code_id_idx ON public.actions(wifi_qr_code_id);
CREATE INDEX IF NOT EXISTS analytics_events_action_id_idx ON public.analytics_events(action_id);
CREATE INDEX IF NOT EXISTS company_members_user_id_idx ON public.company_members(user_id);
CREATE INDEX IF NOT EXISTS profile_media_company_id_idx ON public.profile_media(company_id);
CREATE INDEX IF NOT EXISTS qr_codes_company_id_idx ON public.qr_codes(company_id);

-- Restrict write access to each company's own folder in the public assets bucket.
DROP POLICY IF EXISTS "member upload assets" ON storage.objects;
DROP POLICY IF EXISTS "member update assets" ON storage.objects;
DROP POLICY IF EXISTS "member delete assets" ON storage.objects;

CREATE POLICY "member upload assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'company-assets'
  AND (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = (SELECT auth.uid())
        AND cm.company_id::text = (storage.foldername(name))[1]
    )
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = (SELECT auth.uid())
    )
  )
);

CREATE POLICY "member update assets"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'company-assets'
  AND (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = (SELECT auth.uid())
        AND cm.company_id::text = (storage.foldername(name))[1]
    )
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = (SELECT auth.uid())
    )
  )
)
WITH CHECK (
  bucket_id = 'company-assets'
  AND (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = (SELECT auth.uid())
        AND cm.company_id::text = (storage.foldername(name))[1]
    )
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = (SELECT auth.uid())
    )
  )
);

CREATE POLICY "member delete assets"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'company-assets'
  AND (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.user_id = (SELECT auth.uid())
        AND cm.company_id::text = (storage.foldername(name))[1]
    )
    OR EXISTS (
      SELECT 1 FROM public.platform_admins pa
      WHERE pa.user_id = (SELECT auth.uid())
    )
  )
);

UPDATE storage.buckets
SET file_size_limit = 6291456,
    allowed_mime_types = ARRAY['image/png','image/jpeg','image/webp']::text[]
WHERE id = 'company-assets';
