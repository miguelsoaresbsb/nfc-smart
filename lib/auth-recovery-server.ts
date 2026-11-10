import type { SupabaseClient } from "@supabase/supabase-js";
import { verifiedRecoveryUser } from "@/lib/auth-recovery";

export async function verifiedRecoverySession(supabase: SupabaseClient, intent: string | undefined) {
  return verifiedRecoveryUser(supabase.auth, intent);
}
