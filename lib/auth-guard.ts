import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";
import { hasPaidSubscription, type AccessSubscription } from "@/lib/subscription-access";

export const getAuthorizedAccess = cache(async () => {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  if (!user.email_confirmed_at) redirect("/login?auth_error=confirm");
  const { data: admin, error: adminError } = await supabase
    .from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
  if (adminError) throw new Error("Não foi possível verificar seu acesso. Tente novamente.");
  if (admin) return { user, isAdmin: true as const, company: null, subscription: null, hasPaidAccess: true };

  const { data: requests, error: requestError } = await supabase
    .from("access_requests").select("company_id")
    .eq("user_id", user.id).eq("status", "approved").not("company_id", "is", null);
  if (requestError) throw new Error("Não foi possível verificar sua autorização. Tente novamente.");
  const companyIds = (requests || []).map((request) => request.company_id);
  if (!companyIds.length) redirect("/acesso-pendente");
  const { data: member, error: memberError } = await supabase
    .from("company_members").select("company_id,role,companies(id,name,slug,description,logo_url,phone,whatsapp,phone_enabled,whatsapp_enabled)")
    .eq("user_id", user.id).in("company_id", companyIds).order("created_at").limit(1).maybeSingle();
  if (memberError) throw new Error("Não foi possível verificar sua empresa. Tente novamente.");
  if (!member) redirect("/acesso-pendente");
  const company = (Array.isArray(member.companies) ? member.companies[0] : member.companies) as {
    id: string; name: string; slug: string; description: string | null; logo_url: string | null;
    phone: string | null; whatsapp: string | null; phone_enabled: boolean; whatsapp_enabled: boolean;
  } | null;
  if (!company) redirect("/acesso-pendente");
  const { data: subscription, error: subscriptionError } = await supabase
    .from("subscriptions").select("status,expires_at").eq("company_id", company.id).maybeSingle();
  if (subscriptionError) throw new Error("Não foi possível verificar sua assinatura. Tente novamente.");
  return {
    user, isAdmin: false as const, company, role: member.role as string,
    subscription: subscription as AccessSubscription | null,
    hasPaidAccess: hasPaidSubscription(subscription),
  };
});

/** Defense in depth: every paid route verifies entitlement on the server. */
export const requirePaidAccess = cache(async () => {
  const access = await getAuthorizedAccess();
  if (!access.hasPaidAccess) redirect("/dashboard/subscription?required=1");
  return access;
});
