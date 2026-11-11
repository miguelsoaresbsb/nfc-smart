import Link from "next/link";
import { redirect } from "next/navigation";
import { Clock3, ShieldAlert, Wifi } from "lucide-react";
import { createClient } from "@/lib/supabase-server";
import SetupProgress from "@/app/components/SetupProgress";
import "../auth-flow.css";

export const dynamic = "force-dynamic";

export default async function AccessPending() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  let rejected = false;
  let unavailable = false;
  if (user) {
    const { data: admin, error: adminError } = await supabase.from("platform_admins").select("user_id").eq("user_id", user.id).maybeSingle();
    if (admin) redirect("/dashboard");
    const { data: request, error: requestError } = await supabase.from("access_requests").select("status,company_id").eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    unavailable = Boolean(adminError || requestError);
    if (request?.status === "approved" && request.company_id) {
      const { data: member, error: memberError } = await supabase.from("company_members").select("company_id").eq("company_id", request.company_id).eq("user_id", user.id).maybeSingle();
      if (member) redirect("/dashboard");
      unavailable = unavailable || Boolean(memberError);
    }
    rejected = request?.status === "rejected";
  }
  return (
    <main className="premium-shell auth-premium">
      <a href="#main-content" className="site-skip-link">Ir para a situação do cadastro</a>
      <header className="premium-nav"><Link href="/" className="brand" aria-label="NFC SMART — início"><span className="brand-mark"><Wifi size={17} aria-hidden="true"/></span><span>NFC<span>SMART</span></span></Link></header>
      <section className="auth-premium-wrap" aria-labelledby="pending-title">
        <div className="auth-premium-card" id="main-content" tabIndex={-1}>
          <span className="auth-premium-icon">{rejected ? <ShieldAlert size={22} aria-hidden="true"/> : <Clock3 size={22} aria-hidden="true"/>}</span>
          <div className="section-kicker">SOLICITAÇÃO DE ACESSO</div>
          <h1 id="pending-title">{!user ? "Acompanhe seu cadastro" : unavailable ? "Vamos consultar novamente." : rejected ? "Solicitação não aprovada" : "Seu cadastro está em análise."}</h1>
          <p>{!user ? "Entre com o e-mail e a senha do cadastro para consultar sua solicitação e acompanhar as próximas etapas." : unavailable ? "Não conseguimos carregar a situação da sua empresa agora. Tente novamente em alguns instantes." : rejected ? "Sua solicitação foi analisada e não foi aprovada. Para entender o motivo, fale com a equipe responsável pela sua contratação." : "Seu pedido foi recebido. A equipe do NFC SMART precisa aprovar a empresa antes da contratação da assinatura."}</p>
          {!unavailable && <SetupProgress step={user ? 1 : 0} rejected={rejected}/>}
          {user && <p className="auth-account-reference">Você está na conta <b>{user.email}</b>.</p>}
          {user && !rejected && !unavailable && <div className="auth-flow-context"><b>O próximo passo está aqui.</b>Após a aprovação, esta conta permitirá contratar a assinatura. A confirmação do pagamento libera a personalização e a página pública. Você não precisa enviar outro cadastro.</div>}
          {unavailable ? <a href="/acesso-pendente" className="premium-btn premium-btn-dark auth-submit">Consultar situação novamente</a> : <Link href={user ? "/dashboard" : "/login"} className="premium-btn premium-btn-dark auth-submit">{user ? "Atualizar situação do cadastro" : "Ir para o login"}</Link>}
          {user && <form action="/auth/signout" method="post" className="auth-secondary-form"><button className="premium-btn" type="submit">Sair da conta</button></form>}
        </div>
      </section>
    </main>
  );
}
