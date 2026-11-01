"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Clock3, Sparkles, Wifi } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";

type SubscriptionRow = {
  status: "pending" | "active" | "expired" | "canceled";
  plan: string;
  started_at: string | null;
  expires_at: string | null;
};

function statusText(status: SubscriptionRow["status"]) {
  if (status === "active") return "ATIVA";
  if (status === "expired") return "EXPIRADA";
  if (status === "canceled") return "CANCELADA";
  return "AGUARDANDO PAGAMENTO";
}

export default function Subscription() {
  const sb = createClient();
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const { data: auth } = await sb.auth.getUser();
      if (!auth.user) {
        window.location.href = "/login";
        return;
      }

      const { data: member, error: memberError } = await sb
        .from("company_members")
        .select("company_id")
        .eq("user_id", auth.user.id)
        .limit(1)
        .maybeSingle();

      if (memberError || !member) {
        setError(memberError?.message || "Empresa não encontrada.");
        setLoading(false);
        return;
      }

      const { data, error: subscriptionError } = await sb
        .from("subscriptions")
        .select("status,plan,started_at,expires_at")
        .eq("company_id", member.company_id)
        .maybeSingle();

      if (subscriptionError) setError(subscriptionError.message);
      else setSubscription(data);
      setLoading(false);
    })();
  }, []);

  const expires = subscription?.expires_at
    ? new Date(subscription.expires_at).toLocaleDateString("pt-BR")
    : null;

  return (
    <main className="premium-shell subscription-page">
      <header className="premium-nav">
        <Link href="/dashboard" className="brand">
          <span className="brand-mark"><Wifi size={17} /></span>
          <span>NFC<span>SMART</span></span>
        </Link>
        <Link href="/dashboard" className="premium-btn"><ArrowLeft size={15} /> Painel</Link>
      </header>

      <section className="subpage">
        <div className="section-kicker"><span className="live-dot" /> ASSINATURA</div>
        <div className="hub-title">
          <div>
            <h1>Plano simples. <span>Experiência completa.</span></h1>
            <p>A contratação combina a plaquinha física com a continuidade da plataforma digital.</p>
          </div>
        </div>

        {error && <div className="notice">{error}</div>}

        <div className="subscription-card">
          <div className="plan-icon"><Sparkles size={22} /></div>
          <small>VALORES DE CONTRATAÇÃO</small>
          <h2>R$ 80,00 <span>pagamento único</span></h2>
          <p className="subscription-expiry">Plaquinha física NFC personalizada.</p>
          <h2>R$ 30,00 <span>/ mês</span></h2>
          <p className="subscription-expiry">Acesso contínuo à página digital, painel de edição, hospedagem e manutenção do sistema.</p>

          {loading ? (
            <div className="subscription-status"><Clock3 size={15} /> CARREGANDO</div>
          ) : (
            <div className="subscription-status">
              {subscription?.status === "active" ? <CheckCircle2 size={15} /> : <Clock3 size={15} />}
              {subscription ? statusText(subscription.status) : "SEM ASSINATURA"}
            </div>
          )}

          <div className="plan-benefits">
            <span>✓ Página digital vinculada à sua plaquinha</span>
            <span>✓ Editor visual para atualizar seus dados</span>
            <span>✓ Botões de WhatsApp, Instagram, Pix e localização</span>
            <span>✓ QR Code e acompanhamento de interações</span>
          </div>

          {expires && <p className="subscription-expiry">Validade registrada atualmente: {expires}</p>}

          <div className="subscription-setup">
            <b>Pagamento recorrente em configuração</b>
            <span>Os novos valores já estão apresentados nesta aba. O checkout antigo de R$ 80 por ano não será usado, para evitar cobranças diferentes do novo modelo. A cobrança mensal será liberada após conectar o novo plano recorrente na Cakto.</span>
          </div>

        </div>
      </section>
    </main>
  );
}
