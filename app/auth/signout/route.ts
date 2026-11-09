import { NextRequest } from "next/server";
import { createAuthRouteClient } from "@/lib/auth-route-client";

export async function POST(request: NextRequest) {
  const { supabase, redirect } = createAuthRouteClient(request);
  try {
    const { error } = await supabase.auth.signOut();
    if (error) return redirect("/login?auth_error=signout");
  } catch {
    return redirect("/login?auth_error=signout");
  }
  return redirect("/login");
}
