import { createClient } from "@supabase/supabase-js";
import { handleCaktoWebhook, readCaktoBody } from "@/supabase/functions/_shared/cakto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) return Response.json({ ok: false, error: "webhook_not_configured" }, { status: 503 });
  if (!key || !process.env.CAKTO_WEBHOOK_SECRET) {
    // Production uses the Supabase Edge receiver. Forward the exact bytes and
    // signing headers; credentials stay in Supabase instead of being copied to
    // Vercel. The receiver validates both body-secret and optional signature.
    const read = await readCaktoBody(request);
    if (read.error) return Response.json({ ok: false, error: read.error }, { status: read.status });
    const rawBody = read.body!;
    const headers = new Headers({ "content-type": "application/json" });
    for (const name of ["x-cakto-signature", "x-cakto-timestamp"]) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }
    try {
      const response = await fetch(new URL("/functions/v1/cakto-webhook", url), {
        method: "POST", headers, body: rawBody, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(6500),
      });
      return new Response(await response.text(), { status: response.status, headers: { "content-type": "application/json" } });
    } catch {
      console.error("Cakto Edge receiver unavailable");
      return Response.json({ ok: false, error: "webhook_receiver_unavailable" }, { status: 503 });
    }
  }
  return handleCaktoWebhook(request, {
    secret: process.env.CAKTO_WEBHOOK_SECRET || "",
    productId: process.env.CAKTO_PRODUCT_ID || "45d2743f-a019-40c5-9567-9311dc344b69",
    monthlyAmount: Number(process.env.CAKTO_MONTHLY_AMOUNT || "29.90"),
  }, () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
}
