import { createClient } from "@/lib/supabase-server";
import { createPrintKitPdf, printKitFilename } from "@/lib/print-pdf";
import { decidePrintKitAccess } from "@/lib/print-kit-access";
import { getPublicPageUrl } from "@/lib/public-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const privateHeaders = { "cache-control": "private, no-store", vary: "Cookie", "x-content-type-options": "nosniff", "referrer-policy": "no-referrer" };
const error = (message: string, status: number) => Response.json({ error: message }, { status, headers: privateHeaders });

export async function GET(request: Request) {
  if (new URL(request.url).search) return error("O material é gerado somente para a empresa da sua conta. Abra o download pelo painel.", 400);
  try {
    const sb = await createClient();
    const { data: { user }, error: authError } = await sb.auth.getUser();
    if (authError || !user) return error("Entre na sua conta para baixar o material.", 401);
    if (!user.email_confirmed_at) return error("Confirme seu e-mail antes de baixar o material.", 403);
    const requests = await sb.from("access_requests").select("company_id").eq("user_id", user.id).eq("status", "approved").not("company_id", "is", null).order("created_at").limit(100);
    if (requests.error) return error("Não foi possível verificar sua autorização. Tente novamente.", 503);
    const ids = (requests.data || []).map(item => item.company_id as string);
    if (!ids.length) return error("Sua empresa precisa estar aprovada para baixar o material.", 403);
    const result = await sb.from("company_members").select("company_id,user_id,companies(id,name,slug)").eq("user_id", user.id).in("company_id", ids).order("created_at").limit(1).maybeSingle();
    if (result.error) return error("Não foi possível verificar sua empresa. Tente novamente.", 503);
    const member = result.data;
    const company = member ? (Array.isArray(member.companies) ? member.companies[0] : member.companies) as { id: string; name: string; slug: string } | null : null;
    if (!member || !company) return error("Não encontramos uma empresa aprovada vinculada à sua conta.", 403);
    const subscription = await sb.from("subscriptions").select("status,expires_at").eq("company_id", company.id).maybeSingle();
    if (subscription.error) return error("Não foi possível verificar sua assinatura. Tente novamente.", 503);
    const decision = decidePrintKitAccess({ user, approvedCompanyIds: ids, membership: { ...member, company }, subscription: subscription.data });
    if (decision !== "allowed") return error(decision === "subscription_required" ? "Uma assinatura ativa é necessária para gerar o material. Confira sua assinatura no painel." : "Você não tem acesso ao material desta empresa.", 403);
    const pdf = createPrintKitPdf({ companyName: company.name, publicUrl: getPublicPageUrl(company.slug) });
    const body = new ArrayBuffer(pdf.byteLength);
    new Uint8Array(body).set(pdf);
    return new Response(body, { headers: { ...privateHeaders, "content-type": "application/pdf", "content-disposition": `attachment; filename="${printKitFilename(company.slug)}"`, "cross-origin-resource-policy": "same-origin" } });
  } catch {
    return error("Não foi possível preparar o PDF agora. Tente novamente em alguns instantes.", 503);
  }
}
