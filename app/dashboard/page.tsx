import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import {
  ArrowUpRight, BarChart3, CreditCard, ExternalLink, Image,
  LayoutDashboard, Link2, QrCode, Settings2, ShieldCheck, Wifi,
} from "lucide-react";
import PublicUrl from "./PublicUrl";

export const dynamic = "force-dynamic";

const modules = [
  { href: "/dashboard/editor", title: "Identidade visual", description: "Foto, capa, cores e apresentação.", icon: Image },
  { href: "/dashboard/actions", title: "Ações e links", description: "WhatsApp, Instagram, PIX, Google e Wi-Fi.", icon: Link2 },
  { href: "/dashboard/qr-codes", title: "Biblioteca de QR Codes", description: "Organize e associe seus códigos.", icon: QrCode },
  { href: "/dashboard/analytics", title: "Analytics", description: "Entenda visitas e interações.", icon: BarChart3 },
  { href: "/dashboard/nfc", title: "Sua experiência NFC", description: "Copie o endereço da sua página.", icon: Wifi },
  { href: "/dashboard/subscription", title: "Assinatura", description: "Consulte o status do seu plano.", icon: CreditCard },
];

export default async function Dashboard() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { data: admin } = await sb
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (admin) {
    return (
      <main className="premium-shell dashboard-page">
        <header className="premium-nav">
          <Link href="/dashboard" className="brand"><span className="brand-mark"><Wifi size={17}/></span><span>NFC<span>SMART</span></span></Link>
          <Link className="premium-btn" href="/admin"><ShieldCheck size={15}/> Painel Master <ArrowUpRight size={14}/></Link>
        </header>
        <section className="subpage">
          <div className="section-kicker"><span className="live-dot"/> CENTRAL DE CONTROLE</div>
          <div className="hub-title"><div><h1>Visão geral. <span>Controle total.</span></h1><p>Gerencie solicitações, empresas e assinaturas em um único lugar.</p></div></div>
          <Link href="/admin" className="dashboard-feature"><span className="dashboard-feature-icon"><ShieldCheck size={23}/></span><span><b>Administração da plataforma</b><small>Autorize empresas e acompanhe a operação do NFC Smart.</small></span><ArrowUpRight size={19}/></Link>
        </section>
      </main>
    );
  }

  const { data: member } = await sb
    .from("company_members")
    .select("company_id,companies(id,name,slug)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!member) redirect("/acesso-pendente");

  const company: any = Array.isArray(member.companies) ? member.companies[0] : member.companies;
  if (!company) redirect("/acesso-pendente");

  const { data: subscription } = await sb
    .from("subscriptions")
    .select("status,expires_at")
    .eq("company_id", company.id)
    .maybeSingle();

  const active = subscription?.status === "active" &&
    (!subscription.expires_at || new Date(subscription.expires_at) > new Date());

  return (
    <main className="premium-shell dashboard-page">
      <header className="premium-nav">
        <Link href="/dashboard" className="brand"><span className="brand-mark"><Wifi size={17}/></span><span>NFC<span>SMART</span></span></Link>
        <div className="dashboard-nav-actions">
          <Link href={"/p/" + company.slug} target="_blank" className="premium-btn"><ExternalLink size={15}/> Ver página pública</Link>
          <Link href="/dashboard/editor" className="premium-btn premium-btn-dark"><Settings2 size={15}/> Personalizar</Link>
        </div>
      </header>

      <section className="subpage dashboard-content">
        <div className="section-kicker"><span className="live-dot"/> ESPAÇO DA EMPRESA</div>
        <div className="hub-title dashboard-heading">
          <div><h1>Olá, <span>{company.name}.</span></h1><p>Seu perfil digital, suas conexões e seus resultados em um só lugar.</p></div>
          <span className={"dashboard-status " + (active ? "is-active" : "is-pending")}><i/> {active ? "PÁGINA ATIVA" : "ASSINATURA PENDENTE"}</span>
        </div>

        {!active && (
          <div className="dashboard-alert">
            <div><b>Sua página pública ainda não está ativa.</b><p>Conclua ou regularize sua assinatura para liberar seu perfil aos visitantes.</p></div>
            <Link href="/dashboard/subscription" className="premium-btn premium-btn-dark">Ver assinatura <ArrowUpRight size={15}/></Link>
          </div>
        )}

        <PublicUrl slug={company.slug} />

        <div className="dashboard-section-heading"><div><span>FERRAMENTAS</span><h2>Gerencie sua presença digital</h2></div><span>6 módulos</span></div>
        <div className="dashboard-module-grid">
          {modules.map(({href,title,description,icon:Icon}, index) => (
            <Link href={href} className="dashboard-module" key={href}>
              <div className="dashboard-module-top"><span className="dashboard-module-icon"><Icon size={19}/></span><span className="dashboard-module-number">0{index+1}</span></div>
              <b>{title}</b><p>{description}</p><span className="dashboard-module-link">Abrir módulo <ArrowUpRight size={14}/></span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
