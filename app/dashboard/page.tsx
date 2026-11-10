import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowUpRight, BarChart3, CheckCircle2, Link2, Palette, Send } from "lucide-react";
import { getAuthorizedAccess } from "@/lib/auth-guard";
import { createClient } from "@/lib/supabase-server";
import SetupProgress from "@/app/components/SetupProgress";
import { analyticsWindow } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const access = await getAuthorizedAccess();
  if (access.isAdmin) redirect("/admin");
  const company = access.company;
  const sb = await createClient();
  const { since, until } = analyticsWindow();
  const [subscriptionResult, buttonsResult, viewsResult, clicksResult] = await Promise.all([
    sb.from("subscriptions").select("status,expires_at").eq("company_id", company.id).maybeSingle(),
    sb.from("actions").select("id", { count: "exact", head: true }).eq("company_id", company.id).eq("enabled", true),
    sb.from("analytics_events").select("id", { count: "exact", head: true }).eq("company_id", company.id).eq("event_type", "page_view").gte("created_at", since).lte("created_at", until),
    sb.from("analytics_events").select("id", { count: "exact", head: true }).eq("company_id", company.id).eq("event_type", "action_click").gte("created_at", since).lte("created_at", until),
  ]);
  if (subscriptionResult.error) throw new Error("Não foi possível verificar a situação da sua página.");
  const subscription = subscriptionResult.data;
  const active = subscription?.status === "active" && (!subscription.expires_at || new Date(subscription.expires_at).getTime() > Date.now());
  const directContacts = Number(Boolean(company.phone_enabled && company.phone?.trim())) + Number(Boolean(company.whatsapp_enabled && company.whatsapp?.trim()));
  const buttons = buttonsResult.error ? null : (buttonsResult.count || 0) + directContacts;
  const readyIdentity = Boolean(company.description?.trim());
  const next = !readyIdentity
    ? { title: "Dê a sua cara à página", text: "Comece com um modelo do seu segmento e personalize as informações da empresa.", href: "/dashboard/editor", label: "Personalizar minha página" }
    : buttons === 0 || buttons === null
      ? { title: "Adicione seu primeiro botão", text: "Escolha o que seu cliente deve fazer: falar com você, ver seus produtos ou encontrar sua empresa.", href: "/dashboard/actions", label: "Configurar botões" }
      : !active
        ? { title: "Ative sua página para os clientes", text: "Sua empresa já foi aprovada. Confira a assinatura para liberar o acesso público.", href: "/dashboard/subscription", label: "Ver assinatura" }
        : { title: "Tudo pronto para compartilhar", text: "Copie seu endereço permanente ou baixe o QR Code para receber seus próximos contatos.", href: "/dashboard/nfc", label: "Compartilhar minha página" };
  const formatted = (result: { error: unknown; count: number | null }) => result.error ? "—" : (result.count || 0).toLocaleString("pt-BR");

  return <main className="premium-shell dashboard-page"><section className="subpage">
    <div className="section-kicker">VISÃO GERAL</div>
    <div className="hub-title dashboard-heading"><div><h1>Olá, <span>{company.name}.</span></h1><p>Seu negócio pronto para se conectar, em um só lugar.</p></div><span className={"dashboard-status " + (active ? "is-active" : "is-pending")}><i/>{active ? "PÁGINA ATIVA" : "AGUARDANDO ASSINATURA"}</span></div>
    <SetupProgress step={active ? 3 : 2} complete={active}/>
    <section className="overview-next" aria-label="Próximo passo"><div><small>{active && readyIdentity && buttons ? "SUA PÁGINA ESTÁ NO AR" : "SEU PRÓXIMO PASSO"}</small><h2>{next.title}</h2><p>{next.text}</p></div><Link href={next.href} className="premium-btn premium-btn-dark">{next.label}<ArrowUpRight size={15}/></Link></section>
    <div className="dashboard-section-heading"><div><span>ACOMPANHAMENTO</span><h2>Um olhar sobre os últimos 30 dias</h2></div></div>
    <div className="overview-stats"><article className="overview-stat"><span>Visitas à página</span><strong>{formatted(viewsResult)}</strong><small>Aberturas da sua página pública</small></article><article className="overview-stat"><span>Interações com botões</span><strong>{formatted(clicksResult)}</strong><small>Atalhos acionados pelos visitantes</small></article><article className="overview-stat"><span>Botões e contatos ativos</span><strong>{buttons === null ? "—" : buttons}</strong><small>Atalhos disponíveis na página</small></article></div>
    <Link href="/dashboard/analytics" className="overview-results-link"><BarChart3 size={15}/>Ver resultados e evolução<ArrowUpRight size={14}/></Link>
    <div className="dashboard-section-heading"><div><span>GERENCIE SUA PRESENÇA</span><h2>O essencial, sempre à mão</h2></div></div>
    <div className="overview-tools">
      <Link className="overview-tool" href="/dashboard/editor"><Palette size={23}/><strong>Minha página</strong><p>Modelos por segmento, identidade visual e contatos.</p><span>Personalizar<ArrowUpRight size={13}/></span></Link>
      <Link className="overview-tool" href="/dashboard/actions"><Link2 size={23}/><strong>Botões</strong><p>Edite os atalhos e organize a ordem em que aparecem.</p><span>Gerenciar botões<ArrowUpRight size={13}/></span></Link>
      <Link className="overview-tool" href="/dashboard/nfc"><Send size={23}/><strong>Compartilhar</strong><p>Endereço permanente da plaquinha e biblioteca de QR Codes.</p><span>Abrir compartilhamento<ArrowUpRight size={13}/></span></Link>
    </div>
    {active && <p className="analytics-note"><CheckCircle2 size={18}/> As alterações salvas aparecem na sua página sem precisar regravar a plaquinha.</p>}
  </section></main>;
}
