// Shared by Vercel and Supabase Edge. Never persist the original body, which
// contains the webhook secret and private customer details.
export type CaktoConfig = { secret: string; productId: string; monthlyAmount?: number };
type RecordValue = Record<string, unknown>;
type Database = { rpc: (name: string, args: RecordValue) => PromiseLike<{ error: { message: string } | null }> };
const paidEvents = new Set(["purchase_approved", "subscription_renewed", "subscription_resumed", "subscription_late_recovered"]);
const supportedEvents = new Set([...paidEvents, "subscription_canceled", "subscription_paused", "refund", "chargeback", "subscription_late", "subscription_renewal_refused"]);
const MAX_BYTES = 1024 * 1024;
function object(value: unknown): value is RecordValue { return value !== null && typeof value === "object" && !Array.isArray(value); }
function identifier(value: unknown) { return (typeof value === "string" || typeof value === "number") ? String(value).trim().slice(0, 200) : ""; }
function date(value: unknown): Date | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value); return Number.isFinite(parsed.getTime()) ? parsed : null;
}
function equal(a: string, b: string) {
  const left = new TextEncoder().encode(a), right = new TextEncoder().encode(b);
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}
export async function validCaktoSignature(rawBody: string, timestamp: string, signature: string, secret: string, now = Date.now()) {
  if (!/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  const hex = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  return signature.split(",").some(part => equal(part.trim(), `v1=${hex}`));
}
export function normalizeCaktoOrder(event: string, value: unknown, config: CaktoConfig) {
  if (!object(value)) throw new Error("invalid_event_record");
  if (!supportedEvents.has(event)) return null;
  const product = object(value.product) ? value.product : {};
  const productId = identifier(product.id);
  if (!productId) throw new Error("missing_product_id");
  // V2 batches can contain unrelated order bumps: never bind those to NFC.
  if (productId !== config.productId) return null;
  if (product.type !== "subscription") throw new Error("product_not_recurring");
  const subscription = object(value.subscription) ? value.subscription : {};
  const customer = object(value.customer) ? value.customer : {};
  const orderId = identifier(value.id), subscriptionId = identifier(subscription.id);
  const email = typeof customer.email === "string" ? customer.email.trim().toLowerCase() : "";
  if (!orderId || !subscriptionId || !email || email.length > 320) throw new Error("missing_required_subscription_fields");
  const paidAt = date(value.paidAt);
  let periodEnd: Date | null = null;
  if (paidEvents.has(event)) {
    if (value.status !== "paid") throw new Error("payment_not_confirmed");
    if (value.currency && value.currency !== "BRL") throw new Error("invalid_payment_currency");
    const amount = Number(value.amount), expected = config.monthlyAmount ?? 29.90;
    // Cakto's baseAmount and offer.price are the product price; amount is the
    // total charged to the buyer and may include checkout fees or interest.
    // Require the recurring product's full price, without accepting an
    // underpayment or a different offer with the same product ID.
    const offer = object(value.offer) ? value.offer : {};
    const base = value.baseAmount == null ? null : Number(value.baseAmount);
    const offered = offer.price == null ? null : Number(offer.price);
    const matchesPlan = (price: number | null) => price !== null && Number.isFinite(price) && Number.isFinite(expected) && Math.abs(price - expected) <= 0.001;
    const listedPrice = base ?? offered ?? amount;
    if (value.amount == null || !Number.isFinite(amount) || !matchesPlan(listedPrice)
      || (base !== null && !matchesPlan(base))
      || (offered !== null && !matchesPlan(offered))
      || amount + 0.001 < expected) {
      // Authenticated diagnostic only: never log identity, payment credentials, signatures or raw body.
      console.error("Cakto amount mismatch", JSON.stringify({
        expected: Number.isFinite(expected) ? expected : null,
        charged: value.amount == null || !Number.isFinite(amount) ? null : amount,
        base: base !== null && Number.isFinite(base) ? base : null,
        offer: offered !== null && Number.isFinite(offered) ? offered : null,
        currency: value.currency === "BRL" ? "BRL" : "other",
      }));
      throw new Error("invalid_payment_amount");
    }
    if (!paidAt) throw new Error("missing_payment_date");
    periodEnd = date(subscription.next_payment_date);
    if (!periodEnd) {
      // Anchor to the payment, never processing time or current expiry. A retry
      // or purchase_approved + subscription_renewed grants the same period.
      const recurrence = Number(subscription.recurrence_period);
      if (Number.isFinite(recurrence) && recurrence > 0 && recurrence <= 366) {
        periodEnd = new Date(paidAt.getTime() + recurrence * 86400000);
      } else {
        periodEnd = new Date(paidAt);
        const day = periodEnd.getUTCDate();
        periodEnd.setUTCDate(1); periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
        const lastDay = new Date(Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() + 1, 0)).getUTCDate();
        periodEnd.setUTCDate(Math.min(day, lastDay));
      }
    }
    if (periodEnd <= paidAt) throw new Error("invalid_payment_period");
  }
  const eventAt = event === "refund" ? date(value.refundedAt)
    : event === "chargeback" ? date(value.chargedbackAt)
    : event === "subscription_canceled" || event === "subscription_paused" ? date(value.canceledAt) || date(subscription.canceledAt)
    : paidEvents.has(event) ? paidAt : null;
  return {
    event_type: event, order_id: orderId, product_id: productId, subscription_id: subscriptionId,
    customer_id: identifier(customer.id) || null, customer_email: email,
    paid_at: paidAt?.toISOString() || null, event_at: eventAt?.toISOString() || null,
    period_end: periodEnd?.toISOString() || null,
  };
}
export async function handleCaktoWebhook(request: Request, config: CaktoConfig, database: () => Database) {
  const reply = (body: RecordValue, status = 200) => Response.json(body, { status });
  if (request.method !== "POST") return reply({ ok: false, error: "method_not_allowed" }, 405);
  if (!config.secret || !config.productId) return reply({ ok: false, error: "webhook_not_configured" }, 503);
  if (Number(request.headers.get("content-length")) > MAX_BYTES) return reply({ ok: false, error: "payload_too_large" }, 413);
  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).length > MAX_BYTES) return reply({ ok: false, error: "payload_too_large" }, 413);
  let payload: unknown;
  try { payload = JSON.parse(rawBody); } catch { return reply({ ok: false, error: "invalid_json" }, 400); }
  if (!object(payload)) return reply({ ok: false, error: "invalid_payload" }, 400);
  if (typeof payload.secret !== "string" || !equal(payload.secret, config.secret)) return reply({ ok: false, error: "invalid_secret" }, 401);
  const timestamp = request.headers.get("x-cakto-timestamp"), signature = request.headers.get("x-cakto-signature");
  // Both body-secret and signed deliveries are documented by Cakto. Supplied
  // signing headers must be complete and valid; never silently ignore them.
  if ((timestamp || signature) && !(await validCaktoSignature(rawBody, timestamp || "", signature || "", config.secret))) return reply({ ok: false, error: "invalid_signature" }, 401);
  if (typeof payload.event !== "string" || !payload.event || payload.event.length > 100) return reply({ ok: false, error: "invalid_payload" }, 400);
  const records = Array.isArray(payload.data) ? payload.data : [payload.data];
  if (!records.length || records.length > 100 || records.some(record => !object(record))) return reply({ ok: false, error: "invalid_payload" }, 400);
  try {
    const normalized = records.map(record => normalizeCaktoOrder(payload.event as string, record, config)).filter(record => record !== null);
    if (!normalized.length) return reply({ ok: true, processed: 0, ignored: records.length });
    const db = database();
    for (const event of normalized) {
      const { error } = await db.rpc("process_cakto_event", { p_event: event });
      if (error) throw new Error(error.message);
    }
    return reply({ ok: true, processed: normalized.length, ignored: records.length - normalized.length });
  } catch (error) {
    console.error("Cakto webhook processing failed", error instanceof Error ? error.message : "unknown_error");
    return reply({ ok: false, error: "processing_failed" }, 503);
  }
}
