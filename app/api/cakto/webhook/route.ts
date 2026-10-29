import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CaktoOrder = {
  id?: string | number;
  status?: string;
  product?: { id?: string | number } | null;
  customer?: { id?: string | number; email?: string } | null;
  subscription?: { id?: string | number } | null;
  paidAt?: string | null;
  refundedAt?: string | null;
  chargedbackAt?: string | null;
};

type CaktoPayload = {
  secret?: string;
  event?: string;
  data?: CaktoOrder | CaktoOrder[] | Record<string, unknown>;
};

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function verifySignature(rawBody: string, timestamp: string, signature: string, secret: string) {
  const seconds = Number(timestamp);
  if (!Number.isFinite(seconds) || Math.abs(Date.now() / 1000 - seconds) > 300) return false;
  const expected = "v1=" + createHmac("sha256", secret).update(`${timestamp}.`).update(rawBody).digest("hex");
  return safeEqual(signature, expected);
}

function safeOrderData(data: CaktoOrder | Record<string, unknown>) {
  const order = data as CaktoOrder;
  return {
    id: order.id ?? null,
    status: order.status ?? null,
    product_id: order.product?.id ?? null,
    customer_id: order.customer?.id ?? null,
    subscription_id: order.subscription?.id ?? null,
  };
}

async function processOrder(
  supabase: ReturnType<typeof createClient>,
  event: string,
  data: CaktoOrder | Record<string, unknown>,
  rawBody: string,
) {
  const order = data as CaktoOrder;
  const orderId = order.id == null
    ? createHash("sha256").update(event + ":" + rawBody).digest("hex")
    : String(order.id);
  const productId = order.product?.id == null ? null : String(order.product.id);
  const customerEmail = order.customer?.email?.trim().toLowerCase();
  const customerId = order.customer?.id == null ? null : String(order.customer.id);
  const subscriptionId = order.subscription?.id == null ? null : String(order.subscription.id);

  const externalEventId = `${event}:${orderId}`;
  const { data: previousEvent, error: previousEventError } = await supabase
    .from("webhook_events")
    .select("processed_at")
    .eq("provider", "cakto")
    .eq("external_event_id", externalEventId)
    .maybeSingle();

  if (previousEventError) throw previousEventError;
  // Prevent duplicate deliveries from extending an annual subscription twice.
  if (previousEvent?.processed_at) return;

  const activates = event === "purchase_approved" || event === "subscription_renewed";
  const deactivates = event === "refund" || event === "chargeback" || event === "subscription_canceled";

  if (activates || deactivates) {
    if (!customerEmail || !productId) {
      throw new Error("O evento de pagamento não contém e-mail do comprador ou ID do produto.");
    }

    // The access request is created when the account signs up; use it to map
    // the verified buyer email to the approved company without exposing auth.users.
    const { data: accessRequest, error: accessError } = await supabase
      .from("access_requests")
      .select("user_id")
      .eq("email", customerEmail)
      .eq("status", "approved")
      .not("user_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (accessError) throw accessError;
    if (!accessRequest?.user_id) {
      throw new Error("Não foi encontrada uma conta aprovada para o e-mail do comprador.");
    }

    const { data: membership, error: memberError } = await supabase
      .from("company_members")
      .select("company_id")
      .eq("user_id", accessRequest.user_id)
      .limit(1)
      .maybeSingle();

    if (memberError) throw memberError;
    if (!membership?.company_id) {
      throw new Error("O comprador ainda não está vinculado a uma empresa.");
    }

    const { data: subscription, error: subscriptionError } = await supabase
      .from("subscriptions")
      .select("id,cakto_product_id,cakto_customer_id,cakto_subscription_id,expires_at")
      .eq("company_id", membership.company_id)
      .maybeSingle();

    if (subscriptionError) throw subscriptionError;
    if (!subscription || !subscription.cakto_product_id || String(subscription.cakto_product_id) !== productId) {
      throw new Error("O produto recebido não corresponde ao produto Cakto configurado para esta empresa.");
    }

    const now = new Date();
    const existingExpiry = subscription.expires_at ? new Date(subscription.expires_at) : null;
    const baseDate = event === "subscription_renewed" && existingExpiry && existingExpiry > now
      ? existingExpiry
      : (order.paidAt && Number.isFinite(Date.parse(order.paidAt)) ? new Date(order.paidAt) : now);
    const expiresAt = new Date(baseDate.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();

    const patch = activates
      ? {
          status: "active",
          started_at: event === "purchase_approved" ? (order.paidAt || now.toISOString()) : undefined,
          expires_at: expiresAt,
          cakto_customer_id: customerId ?? subscription.cakto_customer_id,
          cakto_subscription_id: subscriptionId ?? subscription.cakto_subscription_id,
        }
      : {
          status: "canceled",
          expires_at: now.toISOString(),
          cakto_customer_id: customerId ?? subscription.cakto_customer_id,
          cakto_subscription_id: subscriptionId ?? subscription.cakto_subscription_id,
        };

    const { error: updateError } = await supabase
      .from("subscriptions")
      .update(patch)
      .eq("id", subscription.id);
    if (updateError) throw updateError;
  }

  const { error: eventError } = await supabase
    .from("webhook_events")
    .upsert(
      {
        provider: "cakto",
        external_event_id: externalEventId,
        event_type: event,
        payload: safeOrderData(data),
        processed_at: new Date().toISOString(),
      },
      { onConflict: "provider,external_event_id", ignoreDuplicates: true },
    );

  if (eventError) throw eventError;
}

export async function POST(request: Request) {
  const secret = process.env.CAKTO_WEBHOOK_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret || !supabaseUrl || !supabaseSecretKey) {
    return NextResponse.json(
      { ok: false, error: "webhook_not_configured" },
      { status: 503 },
    );
  }

  const rawBody = await request.text();
  const timestamp = request.headers.get("x-cakto-timestamp") || "";
  const signature = request.headers.get("x-cakto-signature") || "";

  if (!verifySignature(rawBody, timestamp, signature, secret)) {
    return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }

  let payload: CaktoPayload;
  try {
    payload = JSON.parse(rawBody) as CaktoPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!payload.event || !payload.data || !safeEqual(String(payload.secret || ""), secret)) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const records = Array.isArray(payload.data) ? payload.data : [payload.data];
    for (const record of records) {
      await processOrder(supabase, payload.event, record as CaktoOrder, rawBody);
    }
    return NextResponse.json({ ok: true, processed: records.length });
  } catch (error) {
    // Do not log the body: it may contain customer personal information.
    console.error("Cakto webhook processing failed", error instanceof Error ? error.message : "unknown_error");
    return NextResponse.json({ ok: false, error: "processing_failed" }, { status: 503 });
  }
}
