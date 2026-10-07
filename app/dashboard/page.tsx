import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase-server";
import PublicUrl from "./PublicUrl";

export const dynamic = "force-dynamic";

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
      <main className="dash">
        <header>
          <b className="logo">NFC<span>SMART</span></b>
          <Link className="btn dark" href="/admin">Painel Master</Link>
        </header>
        <section className="dashhero">
          <p className="eyebrow">MASTER</p>
          <h1>Controle tudo em um só lugar.</h1>
          <p>Autorize empresas e acompanhe assinaturas.</p>
          <Link className="btn dark big" href="/admin">Abrir painel Master</Link>
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
    <main className="dash">
      <header>
        <b className="logo">NFC<span>SMART</span></b>
        <div>
          <Link href={"/p/" + company.slug}>Ver página</Link>
          <Link className="btn dark" href="/dashboard/editor">Editar</Link>
        </div>
      </header>

      {!active && (
        <div className="subscription-alert">
          <strong>Sua página pública ainda não está ativa.</strong>
          <span>Ative ou renove o plano anual de R$ 80 para liberar a página pública.</span>
          <Link className="btn dark" href="/dashboard/subscription">Ver assinatura</Link>
        </div>
      )}

      <section className="dashhero">
        <p className="eyebrow">MINHA EMPRESA</p>
        <h1>{company.name}</h1>
        <p>Edite fotos, cores e crie os quadrados que quiser.</p>

        <PublicUrl slug={company.slug} />

        <div className="dashgrid">
          <Link href="/dashboard/editor"><b>✦</b><strong>Editor</strong><small>Fotos e cores</small></Link>
          <Link href="/dashboard/actions"><b>⌁</b><strong>Ações</strong><small>WhatsApp, PIX, Google…</small></Link>
          <Link href="/dashboard/qr-codes"><b>▦</b><strong>QR Codes</strong><small>Envie e gerencie seus QR Codes</small></Link>
          <Link href="/dashboard/analytics"><b>◌</b><strong>Analytics</strong><small>Visitas e cliques</small></Link>
          <Link href="/dashboard/nfc"><b>⌁</b><strong>NFC</strong><small>Link para a plaquinha</small></Link>
          <Link href="/dashboard/subscription"><b>∞</b><strong>Assinatura</strong><small>R$80 / ano</small></Link>
        </div>
      </section>
    </main>
  );
}
