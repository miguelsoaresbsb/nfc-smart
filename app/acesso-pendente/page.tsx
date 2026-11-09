import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export default async function AccessPending() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let rejected = false;
  if (user) {
    const { data: admin } = await supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
    if (admin) redirect("/dashboard");
    const { data: request } = await supabase.from("access_requests").select("status,company_id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (request?.status === "approved" && request.company_id) {
      const { data: member } = await supabase.from("company_members").select("company_id").eq("company_id", request.company_id).eq("user_id", user.id).maybeSingle();
      if (member) redirect("/dashboard");
    }
    rejected = request?.status === "rejected";
  }
  return (
    <main className="premium-shell auth-premium">
      <header className="premium-nav"><Link href="/" className="brand"><span className="brand-mark">N</span><span>NFC<span>SMART</span></span></Link><Link href="/login" className="premium-btn">Entrar</Link></header>
      <section className="auth-premium-wrap">
        <div className="auth-premium-card">
          <div className="section-kicker">SOLICITAÇÃO DE ACESSO</div>
          <h1>{rejected ? "Solicitação não aprovada" : "Aguardando autorização"}</h1>
          <p>{rejected ? "Sua solicitação foi analisada e não foi aprovada. Entre em contato com a equipe do NFC Smart para mais informações." : "O administrador do NFC Smart precisa autorizar seu acesso antes que você possa entrar no painel."}</p>
          <Link href={user ? "/dashboard" : "/login"} className="premium-btn premium-btn-dark">{user ? "Verificar liberação" : "Ir para o login"}</Link>
          {user && <form action="/auth/signout" method="post"><button className="premium-btn" type="submit">Sair da conta</button></form>}
        </div>
      </section>
    </main>
  );
}
