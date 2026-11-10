import { NextRequest } from "next/server";
import { createAuthRouteClient } from "@/lib/auth-route-client";
import { RECOVERY_COOKIE, RECOVERY_LIFETIME_SECONDS, recoveryIntent, resolveAuthCallback } from "@/lib/auth-recovery";

export async function GET(request: NextRequest) {
  const { supabase, redirect } = createAuthRouteClient(request);
  const result = await resolveAuthCallback(request.nextUrl.searchParams, supabase.auth);
  let path = result.path;
  let intent = "";
  try {
  if (result.recovery && !result.failed) {
    const { data: { user }, error } = await supabase.auth.getUser();
    const { data, error: claimsError } = await supabase.auth.getClaims();
    const sessionId = data?.claims.session_id;
    if (error || !user || claimsError || typeof sessionId !== "string") path = "/redefinir-senha?error=expired";
    else intent = recoveryIntent(user.id, sessionId);
  }
  } catch { path = "/redefinir-senha?error=expired"; }
  const response = redirect(path);
  response.cookies.set(RECOVERY_COOKIE, intent, {
    httpOnly: true, secure: request.nextUrl.protocol === "https:", sameSite: "lax", path: "/",
    maxAge: intent ? RECOVERY_LIFETIME_SECONDS : 0,
  });
  return response;
}
