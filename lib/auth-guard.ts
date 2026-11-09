import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

export const getAuthorizedAccess = cache(async () => {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  const { data: admin, error: adminError } = await supabase
    .from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (adminError) throw new Error("Não foi possível verificar seu acesso. Tente novamente.");
  if (admin) return { user, isAdmin: true };

  const { data: requests, error: requestError } = await supabase
    .from("access_requests").select("company_id")
    .eq("user_id", user.id).eq("status", "approved").not("company_id", "is", null);
  if (requestError) throw new Error("Não foi possível verificar sua autorização. Tente novamente.");
  const companyIds = (requests || []).map((request) => request.company_id);
  if (!companyIds.length) redirect("/acesso-pendente");
  const { data: member, error: memberError } = await supabase
    .from("company_members").select("company_id")
    .eq("user_id", user.id).in("company_id", companyIds).limit(1).maybeSingle();
  if (memberError) throw new Error("Não foi possível verificar sua empresa. Tente novamente.");
  if (!member) redirect("/acesso-pendente");
  return { user, isAdmin: false };
});
