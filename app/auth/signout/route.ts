import { NextRequest } from "next/server";
import { RECOVERY_COOKIE } from "@/lib/auth-recovery";
import { createAuthRouteClient } from "@/lib/auth-route-client";

export async function POST(request: NextRequest) {
  const { supabase, redirect } = createAuthRouteClient(request);
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
