import { NextRequest } from "next/server";
import { createAuthRouteClient } from "@/lib/auth-route-client";
import { safeAuthPath } from "@/lib/auth-redirect";

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = safeAuthPath(requestUrl.searchParams.get("next"));
  const { supabase, redirect } = createAuthRouteClient(request);
  if (!code) return redirect("/login?auth_error=callback");
  try {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return redirect("/login?auth_error=callback");
    return redirect(next);
  } catch {
    return redirect("/login?auth_error=callback");
  }
}
