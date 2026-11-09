import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { handleCaktoWebhook } from "../_shared/cakto.ts";

Deno.serve(async request => {
  let bundledKeys: Record<string, string>;
  try { bundledKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"); }
  catch { return Response.json({ ok: false, error: "supabase_key_config_invalid" }, { status: 503 }); }
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SECRET_KEY") || bundledKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return Response.json({ ok: false, error: "supabase_not_configured" }, { status: 503 });
  return handleCaktoWebhook(request, {
    secret: Deno.env.get("CAKTO_WEBHOOK_SECRET") || "",
    productId: Deno.env.get("CAKTO_PRODUCT_ID") || "45d2743f-a019-40c5-9567-9311dc344b69",
    monthlyAmount: Number(Deno.env.get("CAKTO_MONTHLY_AMOUNT") || "29.90"),
  }, () => createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }));
});
