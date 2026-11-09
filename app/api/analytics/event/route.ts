import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { parseAnalyticsEvent } from "@/lib/analytics";

export async function POST(request: Request) {
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > 4096) {
    return NextResponse.json({ ok: false, error: "payload_too_large" }, { status: 413 });
  }
  let body: unknown;
  try { body = JSON.parse(raw); } catch { body = null; }
  const event = parseAnalyticsEvent(body);
  if (!event) {
    return NextResponse.json({ ok: false, error: "invalid_event" }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("analytics_events").insert(event);
    if (error) {
      if (error.code === "42501" || error.code === "23503") {
        return NextResponse.json({ ok: false, error: "invalid_target" }, { status: 403 });
      }
      console.error("Analytics write failed", error.code);
      return NextResponse.json({ ok: false, error: "analytics_unavailable" }, { status: 503 });
    }
  } catch {
    return NextResponse.json({ ok: false, error: "analytics_unavailable" }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
