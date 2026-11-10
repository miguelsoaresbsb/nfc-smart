import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase-public";
import { parseAnalyticsEvent } from "@/lib/analytics";
import { readLimitedBody } from "@/supabase/functions/_shared/request-body";

export async function POST(request: Request) {
  const read = await readLimitedBody(request, 4096);
  if (read.error) return NextResponse.json({ ok: false, error: read.error }, { status: read.status });
  let body: unknown;
  try { body = JSON.parse(read.body!); } catch { body = null; }
  const event = parseAnalyticsEvent(body);
  if (!event) {
    return NextResponse.json({ ok: false, error: "invalid_event" }, { status: 400 });
  }

  try {
    const supabase = createPublicClient();
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
