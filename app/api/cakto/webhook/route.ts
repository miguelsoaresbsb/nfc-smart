import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CaktoSubscription = {
  id?: string | number;
  status?: string;
  recurrence_period?: number | string;
  next_payment_date?: string | null;
  canceledAt?: string | null;
  amount?: string | number;
};

type CaktoOrder = {
  id?: string | number;
  status?: string;
  amount?: number | string;
  offer?: { price?: number | string } | null;
  product?: { id?: string | number; type?: string } | null;
  customer?: { id?: string | number; email?: string } | null;
  subscription?: CaktoSubscription | null;
  paidAt?: string | null;
};

type CaktoPayload = {
  secret?: string;
  event?: string;
  data?: CaktoOrder | CaktoOrder[];
};

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

function safeOrderData(order: CaktoOrder) {
  return {
    id: order.id ?? null,
    status: order.status ?? null,
    product_id: order.product?.id ?? null,
    subscription_id: order.subscription?.id ?? null,
    amount: order.amount ?? null,
  };
}

function getNextPeriodEnd(order: CaktoOrder, now: Date) {
  const nextPayment = order.subscription?.next_payment_date;
  if (nextPayment && Number.isFinite(Date.parse(nextPayment))) {
    return new Date(nextPayment).toISOString();
  }

  const recurrenceDays = Number(order.subscription?.recurrence_period);
  const days = Number.isFinite(recurrenceDays) && recurrenceDays > 0 ? recurrenceDays : 30;
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

async function processOrder(supabase: any, event: string, order: CaktoOrder, rawBody: string) {
  const orderId = order.id == null
    ? createHash("sha256").update(event + ":" + rawBody).digest("hex")
    : String(order.id);
  const productId = order.product?.id == null ? null : String(order.product.id);
  const subscriptionId = order.subscription?.id == null ? null : String(order.subscription.id);
  const customerEmail = order.customer?.email?.trim().toLowerCase();

  const externalEventId = `${event}:${orderId}`;
  const { data: previousEvent, error: previousEventError } = await supabase
    .from("webhook_events")
    .select("processed_at")
    .eq("provider", "cakto")
    .eq("external_event_id", externalEventId)
    .maybeSingle();

  if (previousEventError) throw previousEventError;
  if (previousEvent?.processed_at) return;

  const isPaidEvent = event === "purchase_approved" || event === "subscription_renewed";
  const isCancellation = event === "subscription_canceled";
  const isImmediateRevocation = event === "refund" || event === "chargeback";
  const supportedEvent = isPaidEvent || isCancellation || isImmediateRevocation;

  if (supportedEvent) {
    if (!customerEmail || !productId || order.product?.type !== "subscription" || !subscriptionId) {
      throw new Error("Evento sem os dados obrigatórios de uma assinatura recorrente.");
    }

    if (isPaidEvent) {
      const expectedAmount = Number(process.env.CAKTO_MONTHLY_AMOUNT || "29.90");
      const paidAmount = Number(order.amount ?? order.offer?.price ?? order.subscription?.amount);
      if (!Number.isFinite(paidAmount) || Math.abs(paidAmount - expectedAmount) > 0.01) {
        throw new Error("O valor recebido não corresponde à mensalidade configurada.");
      }
      if (order.status && order.status !== "paid") {
        throw new Error("O pedido ainda não está pago.");
      }
    }

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
      .select("id,plan,status,cakto_product_id,cakto_customer_id,cakto_subscription_id,started_at,expires_at")
      .eq("company_id", membership.company_id)
      .maybeSingle();

    if (subscriptionError) throw subscriptionError;
    if (!subscription) throw new Error("Assinatura local não encontrada para a empresa.");
    if (subscription.cakto_product_id && String(subscription.cakto_product_id) !== productId) {
      throw new Error("O produto recebido não corresponde ao produto Cakto vinculado à empresa.");
    }
    if (subscription.cakto_subscription_id && String(subscription.cakto_subscription_id) !== subscriptionId) {
      // A company cannot silently switch to a different recurring contract.
      // A fresh contract is allowed only after its previous access has expired.
      const oldExpiry = subscription.expires_at ? new Date(subscription.expires_at) : null;
      if (oldExpiry && oldExpiry > new Date()) {
        throw new Error("Já existe outra assinatura recorrente vinculada a esta empresa.");
      }
    }

    const now = new Date();
    let patch: Record<string, unknown> = {
      plan: "monthly",
      cakto_product_id: productId,
      cakto_customer_id: order.customer?.id == null ? undefined : String(order.customer.id),
      cakto_subscription_id: subscriptionId,
    };

    if (isPaidEvent) {
      patch = {
        ...patch,
        status: "active",
        started_at: subscription.started_at || order.paidAt || now.toISOString(),
        expires_at: getNextPeriodEnd(order, now),
      };
    } else if (isImmediateRevocation) {
      patch = {
        ...patch,
        status: "canceled",
        expires_at: now.toISOString(),
      };
    } else if (isCancellation) {
      // Cakto's cancellation event describes cancellation of future renewals.
      // Keep access through the already-paid period; expires_at was set by the
      // last successful payment's next_payment_date.
      const currentExpiry = subscription.expires_at ? new Date(subscription.expires_at) : null;
      patch = {
        ...patch,
        status: currentExpiry && currentExpiry > now ? "active" : "expired",
        expires_at: subscription.expires_at,
      };
    }

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
        payload: safeOrderData(order),
        processed_at: new Date().toISOString(),
      },
      { onConflict: "provider,external_event_id" },
    );

  if (eventError) throw eventError;
}

export async function POST(request: Request) {
  const secret = process.env.CAKTO_WEBHOOK_SECRET;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret || !supabaseUrl || !supabaseSecretKey) {
    return NextResponse.json({ ok: false, error: "webhook_not_configured" }, { status: 503 });
  }

  const rawBody = await request.text();
  let payload: CaktoPayload;
  try {
    payload = JSON.parse(rawBody) as CaktoPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  if (!safeEqual(String(payload.secret || ""), secret)) {
    return NextResponse.json({ ok: false, error: "invalid_secret" }, { status: 401 });
  }
  if (!payload.event || !payload.data) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }

  const supabase: any = createClient(supabaseUrl, supabaseSecretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const records = Array.isArray(payload.data) ? payload.data : [payload.data];
    for (const record of records) {
      await processOrder(supabase, payload.event, record, rawBody);
    }
    return NextResponse.json({ ok: true, processed: records.length });
  } catch (error) {
    console.error("Cakto webhook processing failed", error instanceof Error ? error.message : "unknown_error");
    return NextResponse.json({ ok: false, error: "processing_failed" }, { status: 503 });
  }
}
