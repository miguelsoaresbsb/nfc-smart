-- NFC Smart: all existing subscription records use the monthly plan identifier.
-- Existing expires_at values are intentionally preserved so already-paid access is not shortened.
update public.subscriptions
set plan = 'monthly'
where plan = 'annual';
