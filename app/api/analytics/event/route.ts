import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as {
    companyId?: string;
    eventType?: "page_view" | "action_click";
    actionId?: string;
    sessionId?: string;
  } | null;

  if (!body?.companyId || !body.eventType || !["page_view", "action_click"].includes(body.eventType)) {
    return NextResponse.json({ ok: false, error: "invalid_event" }, { status: 400 });
  }

  const sessionId = String(body.sessionId || "").slice(0, 120) || null;
  const supabase = await createClient();

  const { error } = await supabase.from("analytics_events").insert({
    company_id: body.companyId,
    action_id: body.actionId || null,
    event_type: body.eventType,
    session_id: sessionId,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
