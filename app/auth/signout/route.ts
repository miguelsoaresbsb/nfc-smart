import { NextRequest } from "next/server";
import { RECOVERY_COOKIE, isSameAuthOrigin } from "@/lib/auth-recovery";
import { createAuthRouteClient } from "@/lib/auth-route-client";

export async function POST(request: NextRequest) {
  const { supabase, redirect, json } = createAuthRouteClient(request);
  if (!isSameAuthOrigin(request.headers.get("origin"), request.headers.get("host") || request.nextUrl.host, request.nextUrl.protocol)) {
    return json({ error: "Solicitação inválida. Atualize a página e tente novamente." }, 403);
  }
  function finish(path: string) {
    const response = redirect(path);
    response.cookies.delete(RECOVERY_COOKIE);
    return response;
  }
  try {
    const { error } = await supabase.auth.signOut();
    if (error) return finish("/login?auth_error=signout");
  } catch {
    return finish("/login?auth_error=signout");
  }
  return finish("/login");
}
