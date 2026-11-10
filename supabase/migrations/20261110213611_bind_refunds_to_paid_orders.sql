-- Store the payment watermark separately from lifecycle delivery times. This
-- does not activate, shorten or extend any existing paid subscription.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS cakto_current_paid_order_id text,
  ADD COLUMN IF NOT EXISTS cakto_current_paid_at timestamptz;

-- The service role cannot SELECT auth.users in this project. Expose only this
-- boolean ownership check to the webhook, never the Auth table or public RPCs.
CREATE OR REPLACE FUNCTION private.is_verified_cakto_buyer(p_user_id uuid, p_email text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $verified$
  SELECT EXISTS (
    SELECT 1 FROM auth.users buyer WHERE buyer.id=p_user_id
      AND buyer.email_confirmed_at IS NOT NULL
      AND lower(btrim(buyer.email))=lower(btrim(p_email))
  );
$verified$;
REVOKE ALL ON FUNCTION private.is_verified_cakto_buyer(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO service_role;
GRANT EXECUTE ON FUNCTION private.is_verified_cakto_buyer(uuid,text) TO service_role;

-- Only normalized, successfully processed payment records are authoritative.
-- Historical rows without such evidence stay NULL until a validated payment.
UPDATE public.subscriptions s
SET cakto_current_paid_order_id = payment.order_id,
    cakto_current_paid_at = payment.paid_at
FROM (
  SELECT DISTINCT ON (payload->>'subscription_id', payload->>'product_id')
    payload->>'subscription_id' AS contract_id,
    payload->>'product_id' AS product_id,
    payload->>'order_id' AS order_id,
    (payload->>'paid_at')::timestamptz AS paid_at
  FROM public.webhook_events
  WHERE provider='cakto' AND processed_at IS NOT NULL
    AND event_type IN ('purchase_approved','subscription_renewed','subscription_resumed','subscription_late_recovered')
    AND payload->>'outcome'='processed'
    AND payload->>'order_id' IS NOT NULL AND payload->>'paid_at' IS NOT NULL
  ORDER BY payload->>'subscription_id', payload->>'product_id', (payload->>'paid_at')::timestamptz DESC
) payment
WHERE s.cakto_subscription_id=payment.contract_id AND s.cakto_product_id=payment.product_id
  AND s.cakto_current_paid_order_id IS NULL;

create or replace function public.process_cakto_event(p_event jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event text := p_event->>'event_type';
  v_order text := nullif(p_event->>'order_id', '');
  v_contract text := nullif(p_event->>'subscription_id', '');
  v_product text := nullif(p_event->>'product_id', '');
  v_external text;
  v_company uuid;
  v_current public.subscriptions%rowtype;
  v_processed timestamptz;
  v_paid boolean := v_event in ('purchase_approved','subscription_renewed','subscription_resumed','subscription_late_recovered');
  v_revoked boolean := v_event in ('refund','chargeback');
  v_event_at timestamptz := coalesce((p_event->>'event_at')::timestamptz, statement_timestamp());
  v_paid_at timestamptz := (p_event->>'paid_at')::timestamptz;
  v_period_end timestamptz := (p_event->>'period_end')::timestamptz;
  v_outcome text := 'processed';
begin
  if v_order is null or v_contract is null or v_product is null or v_event is null then
    raise exception 'missing_required_subscription_fields';
  end if;
  if v_event not in ('purchase_approved','subscription_renewed','subscription_resumed','subscription_late_recovered',
    'subscription_canceled','subscription_paused','refund','chargeback','subscription_late','subscription_renewal_refused') then
    raise exception 'unsupported_subscription_event';
  end if;
  if v_paid and (v_paid_at is null or v_period_end is null or v_period_end <= v_paid_at or v_period_end > v_paid_at + interval '32 days' or v_paid_at > statement_timestamp() + interval '5 minutes') then
    raise exception 'invalid_payment_period';
  end if;
  v_external := v_event || ':' || v_order;
  insert into public.webhook_events(provider,external_event_id,event_type,payload)
    values ('cakto', v_external, v_event, p_event - 'customer_email' - 'customer_id')
    on conflict (provider,external_event_id) do nothing;
  -- The unique-key insert serializes concurrent duplicate deliveries. This row
  -- lock also supports safely retrying a previously unprocessed ledger entry.
  select processed_at into v_processed from public.webhook_events
    where provider='cakto' and external_event_id=v_external for update;
  if v_processed is not null then return jsonb_build_object('outcome','duplicate'); end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('cakto:' || v_contract, 0));

  -- A bound contract remains identifiable if the buyer later changes email.
  -- First-time payments bind through the exact approved company's request,
  -- never an arbitrary first membership of that buyer.
  select * into v_current from public.subscriptions
    where cakto_subscription_id=v_contract and cakto_product_id=v_product
    order by created_at limit 1 for update;
  if not found then
    select r.company_id into v_company from public.access_requests r
      where lower(btrim(r.email))=lower(btrim(p_event->>'customer_email'))
        and r.status='approved' and r.company_id is not null and r.user_id is not null
        and private.is_verified_cakto_buyer(r.user_id,p_event->>'customer_email')
        and exists (select 1 from public.company_members m where m.company_id=r.company_id and m.user_id=r.user_id)
      order by r.created_at desc limit 1;
    if v_company is null then raise exception 'approved_company_not_found'; end if;
    select * into v_current from public.subscriptions where company_id=v_company for update;
    if not found then raise exception 'local_subscription_not_found'; end if;
  end if;

  if v_current.cakto_product_id is not null and v_current.cakto_product_id<>v_product then
    raise exception 'cakto_product_mismatch';
  end if;
  if v_current.cakto_subscription_id is distinct from v_contract then
    -- Negative events never attach or replace a recurring contract. A fresh
    -- purchase can replace an old contract only after paid access has ended.
    if not v_paid then
      v_outcome := 'unlinked_contract_ignored';
    elsif v_current.cakto_subscription_id is not null and (v_current.expires_at > statement_timestamp() or (v_current.status='active' and v_current.expires_at is null)) then
      raise exception 'active_contract_already_linked';
    end if;
  end if;
  if v_paid and exists (select 1 from public.webhook_events where provider='cakto'
    and external_event_id in ('refund:'||v_order,'chargeback:'||v_order) and processed_at is not null) then
    v_outcome := 'revoked_order_ignored';
  end if;
  -- A lifecycle event delivered late must not hide a real, newer payment.
  -- Refunds always win over a replay of their own payment, but a refund for a
  -- different/older order must not erase the current paid month.
  if v_outcome='processed' and v_revoked and v_current.cakto_current_paid_order_id is not null
    and v_current.cakto_current_paid_order_id <> v_order then
    v_outcome := 'other_paid_order_refund_ignored';
  end if;
  if v_current.cakto_subscription_id=v_contract then
    if v_paid and v_current.cakto_current_paid_at > v_paid_at then
      v_outcome := 'stale_event_ignored';
    elsif not v_paid and not v_revoked and v_current.cakto_last_event_at > v_event_at then
      v_outcome := 'stale_event_ignored';
    end if;
  end if;

  if v_outcome='processed' then
    if v_paid then
      update public.subscriptions set plan='monthly',
        status=case when (case when cakto_subscription_id=v_contract then greatest(expires_at,v_period_end) else v_period_end end)>statement_timestamp() then 'active' else 'expired' end,
        started_at=coalesce(started_at,v_paid_at),
        expires_at=case when cakto_subscription_id=v_contract then greatest(expires_at,v_period_end) else v_period_end end,
        cakto_product_id=v_product, cakto_subscription_id=v_contract,
        cakto_customer_id=coalesce(nullif(p_event->>'customer_id',''),cakto_customer_id),
        cakto_last_event_at=case when cakto_subscription_id=v_contract then greatest(cakto_last_event_at,v_event_at) else v_event_at end, cakto_last_order_id=v_order,
        cakto_current_paid_at=v_paid_at, cakto_current_paid_order_id=v_order
        where id=v_current.id;
    elsif v_revoked then
      update public.subscriptions set status='canceled', expires_at=least(coalesce(expires_at,statement_timestamp()),statement_timestamp()),
        cakto_last_event_at=v_event_at, cakto_last_order_id=v_order where id=v_current.id;
    else
      -- Cancellation, pause and a refused renewal cannot erase a period that
      -- has already been paid. Public RLS enforces the expiry even if no later
      -- webhook arrives to update the stored status.
      update public.subscriptions set
        status=case when expires_at>statement_timestamp() then 'active' else 'expired' end,
        cakto_last_event_at=v_event_at, cakto_last_order_id=v_order where id=v_current.id;
    end if;
  end if;
  update public.webhook_events set processed_at=statement_timestamp(),
    payload=(p_event - 'customer_email' - 'customer_id') || jsonb_build_object('outcome',v_outcome)
    where provider='cakto' and external_event_id=v_external;
  return jsonb_build_object('outcome',v_outcome);
end;
$$;
revoke all on function public.process_cakto_event(jsonb) from public, anon, authenticated;
grant execute on function public.process_cakto_event(jsonb) to service_role;
