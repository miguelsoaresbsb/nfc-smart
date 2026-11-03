import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type Payload = { secret?: string; event?: string; data?: Record<string, unknown> | Record<string, unknown>[] };
const SECRET = Deno.env.get("CAKTO_WEBHOOK_SECRET") || "";
const PRODUCT_ID = Deno.env.get("CAKTO_PRODUCT_ID") || "";
const TOLERANCE_SECONDS = 300;

function timingSafeEqual(a: string, b: string) {
  const aa = new TextEncoder().encode(a), bb = new TextEncoder().encode(b);
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}
async function verifySignature(body: string, timestamp: string, signature: string) {
  if (!SECRET || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > TOLERANCE_SECONDS) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`));
  const hex = [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(signature, `v1=${hex}`);
}
function dateOf(value: unknown): Date | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const d = new Date(value); return Number.isFinite(d.getTime()) ? d : null;
}
function addMonth(date: Date) {
  const d = new Date(date), day = d.getUTCDate();
  d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1);
  d.setUTCDate(Math.min(day, new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()));
  return d;
}
async function eventIdFor(event: string, data: Record<string, unknown>, rawBody: string) {
  const id = data.id ?? data.refId ?? data.reference_id;
  if (id != null && String(id).trim()) return `${event}:${String(id)}`;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${event}:${rawBody}`));
  return `${event}:${[...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("")}`;
}

Deno.serve(async req => {
  if (req.method !== "POST") return Response.json({ ok: false, error: "method_not_allowed" }, { status: 405 });
  if (!SECRET) return Response.json({ ok: false, error: "webhook_not_configured" }, { status: 503 });
  const rawBody = await req.text();
  if (!(await verifySignature(rawBody, req.headers.get("X-Cakto-Timestamp") || "", req.headers.get("X-Cakto-Signature") || ""))) {
    return Response.json({ ok: false, error: "invalid_signature" }, { status: 401 });
  }
  let payload: Payload;
  try { payload = JSON.parse(rawBody) as Payload; } catch { return Response.json({ ok: false, error: "invalid_json" }, { status: 400 }); }
  if (!payload.secret || !timingSafeEqual(payload.secret, SECRET)) return Response.json({ ok: false, error: "invalid_secret" }, { status: 401 });
  const event = String(payload.event || "");
  const records = Array.isArray(payload.data) ? payload.data : payload.data ? [payload.data] : [];
  if (!event || records.length === 0) return Response.json({ ok: false, error: "invalid_payload" }, { status: 400 });

  let keys: Record<string, string>;
  try { keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}") as Record<string, string>; }
  catch { return Response.json({ ok: false, error: "supabase_key_config_invalid" }, { status: 503 }); }
  const url = Deno.env.get("SUPABASE_URL"), serviceKey = keys.default;
  if (!url || !serviceKey) return Response.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const paid = new Set(["purchase_approved", "subscription_renewed", "subscription_resumed", "subscription_late_recovered"]);
  const canceled = new Set(["subscription_canceled"]);
  const revoked = new Set(["refund", "chargeback"]);
  const expired = new Set(["subscription_late", "subscription_renewal_refused"]);
  const recognized = new Set([...paid, ...canceled, ...revoked, ...expired, "checkout_abandonment"]);

  try {
    let processed = 0;
    for (const data of records) {
      if (!data || typeof data !== "object") throw new Error("invalid_event_record");
      const externalId = await eventIdFor(event, data, rawBody);
      const { data: previous, error: lookupError } = await db.from("webhook_events").select("processed_at")
        .eq("provider", "cakto").eq("external_event_id", externalId).maybeSingle();
      if (lookupError) throw lookupError;
      if (previous?.processed_at) { processed++; continue; }
      const { error: reserveError } = await db.from("webhook_events").upsert({
        provider: "cakto", external_event_id: externalId, event_type: event,
        payload: { event, order_id: data.id ?? data.refId ?? null },
      }, { onConflict: "provider,external_event_id" });
      if (reserveError) throw reserveError;

      if (!recognized.has(event) || event === "checkout_abandonment") {
        const { error } = await db.from("webhook_events").update({ processed_at: new Date().toISOString() })
          .eq("provider", "cakto").eq("external_event_id", externalId);
        if (error) throw error; processed++; continue;
      }

      const customer = (data.customer || {}) as Record<string, unknown>;
      const product = (data.product || {}) as Record<string, unknown>;
      const sub = (data.subscription || {}) as Record<string, unknown>;
      const email = String(customer.email || "").trim().toLowerCase();
      const productId = String(product.id || "");
      const subId = String(sub.id || "");
      if (!email || !productId || !subId) throw new Error("missing_required_subscription_fields");
      if (PRODUCT_ID && productId !== PRODUCT_ID) throw new Error("unexpected_cakto_product");

      const { data: request, error: requestError } = await db.from("access_requests").select("company_id")
        .eq("email", email).eq("status", "approved").not("company_id", "is", null)
        .order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (requestError) throw requestError;
      if (!request?.company_id) throw new Error("approved_company_not_found");

      const { data: current, error: currentError } = await db.from("subscriptions")
        .select("id,started_at,expires_at,cakto_product_id,cakto_subscription_id")
        .eq("company_id", request.company_id).maybeSingle();
      if (currentError) throw currentError;
      if (!current) throw new Error("local_subscription_not_found");
      if (current.cakto_product_id && String(current.cakto_product_id) !== productId) throw new Error("cakto_product_mismatch");
      if (current.cakto_subscription_id && String(current.cakto_subscription_id) !== subId) {
        const oldExpiry = dateOf(current.expires_at);
        if (oldExpiry && oldExpiry > new Date()) throw new Error("active_contract_already_linked");
      }

      const now = new Date();
      const patch: Record<string, unknown> = {
        plan: "monthly", cakto_product_id: productId, cakto_subscription_id: subId,
        cakto_customer_id: customer.id ? String(customer.id) : null,
      };
      if (paid.has(event)) {
        const suppliedNext = dateOf(sub.next_payment_date);
        const oldExpiry = dateOf(current.expires_at);
        patch.status = "active";
        patch.started_at = current.started_at || dateOf(data.paidAt)?.toISOString() || now.toISOString();
        patch.expires_at = (suppliedNext || addMonth(oldExpiry && oldExpiry > now ? oldExpiry : now)).toISOString();
      } else if (canceled.has(event)) {
        const oldExpiry = dateOf(current.expires_at);
        patch.status = oldExpiry && oldExpiry > now ? "active" : "expired";
        patch.expires_at = current.expires_at;
      } else if (revoked.has(event)) {
        patch.status = "canceled"; patch.expires_at = now.toISOString();
      } else if (expired.has(event)) {
        patch.status = "expired"; patch.expires_at = now.toISOString();
      }
      const { error: updateError } = await db.from("subscriptions").update(patch).eq("id", current.id);
      if (updateError) throw updateError;
      const { error: finishError } = await db.from("webhook_events").update({ processed_at: new Date().toISOString() })
        .eq("provider", "cakto").eq("external_event_id", externalId);
      if (finishError) throw finishError;
      processed++;
    }
    return Response.json({ ok: true, processed });
  } catch (error) {
    console.error("Cakto webhook processing failed", error instanceof Error ? error.message : "unknown_error");
    return Response.json({ ok: false, error: "processing_failed" }, { status: 503 });
  }
});
