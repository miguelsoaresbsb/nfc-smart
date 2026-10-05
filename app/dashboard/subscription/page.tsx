"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, ExternalLink, Sparkles, Wifi } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";

type SubscriptionRow = {
  status: "pending" | "active" | "expired" | "canceled";
  plan: string;
  started_at: string | null;
  expires_at: string | null;
};

const checkoutUrl = process.env.NEXT_PUBLIC_CAKTO_CHECKOUT_URL || "";

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
            <p>Seu NFC SMART permanece disponível enquanto o plano anual estiver válido.</p>
          </div>
        </div>

        {error && <div className="notice">{error}</div>}

        <div className="subscription-card">
          <div className="plan-icon"><Sparkles size={22} /></div>
          <small>PLANO ANUAL</small>
          <h2>R$ 80 <span>/ ano</span></h2>

          {loading ? (
            <div className="subscription-status"><Clock3 size={15} /> CARREGANDO</div>
          ) : (
            <div className="subscription-status">
              {subscription?.status === "active" ? <CheckCircle2 size={15} /> : <Clock3 size={15} />}
              {subscription ? statusText(subscription.status) : "SEM ASSINATURA"}
            </div>
          )}

          <div className="plan-benefits">
            <span>✓ Página pública permanente enquanto ativa</span>
            <span>✓ Editor visual completo</span>
            <span>✓ Ações e QR Codes</span>
            <span>✓ Analytics</span>
          </div>

          {expires && <p className="subscription-expiry">Válida até {expires}</p>}

          {checkoutUrl ? (
            <a href={checkoutUrl} target="_blank" rel="noreferrer" className="premium-btn">
              {subscription?.status === "active" ? "Renovar assinatura" : "Assinar por R$ 80/ano"}
              <ExternalLink size={15} />
            </a>
          ) : (
            <div className="subscription-setup">
              <b>Pagamento Cakto aguardando configuração</b>
              <span>Assim que o checkout do plano anual for conectado, o botão de pagamento aparecerá aqui.</span>
            </div>
          )}

          <Link href="/dashboard/editor" className="premium-btn secondary-action">
            Personalizar minha página <ArrowRight size={15} />
          </Link>
        </div>
      </section>
    </main>
  );
}
