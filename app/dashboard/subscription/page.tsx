"use client";

import { useEffect, useState } from "react";
import { Check, CheckCircle2, Clock3, Copy, ExternalLink, RefreshCw, ShieldCheck, Wifi } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import { hasPaidSubscription } from "@/lib/subscription-access";
import { CHECKOUT_URL, MONTHLY_PRICE_CENTS, NFC_TAG_PRICE_CENTS, formatBRL } from "@/lib/commerce";
import "./subscription.css";

type SubscriptionRow = { status: "pending" | "active" | "expired" | "canceled"; plan: string; started_at: string | null; expires_at: string | null };
const statuses = { active: "ATIVA", expired: "EXPIRADA", canceled: "CANCELADA", pending: "AGUARDANDO PAGAMENTO" };

export default function Subscription() {
  const [sb] = useState(createClient);
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");
  const [accountEmail, setAccountEmail] = useState(""), [copyMessage, setCopyMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true); setError("");
      try {
        const { data: auth, error: authError } = await sb.auth.getUser();
        if (authError) throw authError;
        if (!alive) return;
        if (!auth.user) { window.location.href = "/login"; return; }
        setAccountEmail(auth.user.email || "");
        const { data: member, error: memberError } = await sb.from("company_members").select("company_id").eq("user_id", auth.user.id).limit(1).maybeSingle();
        if (!alive) return;
        if (memberError || !member) throw new Error("membership");
        const result = await sb.from("subscriptions").select("status,plan,started_at,expires_at").eq("company_id", member.company_id).maybeSingle();
        if (!alive) return;
        if (result.error) throw result.error;
        setSubscription(result.data);
      } catch { if (alive) setError("Não conseguimos consultar sua assinatura agora. Tente carregar novamente antes de fazer um pagamento."); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [sb, attempt]);
  const active = hasPaidSubscription(subscription);
  const effectiveStatus = subscription?.status === "active" && !active ? "expired" : subscription?.status;
  const expires = subscription?.expires_at ? new Date(subscription.expires_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null;
  async function copyEmail() {
    try { await navigator.clipboard.writeText(accountEmail); setCopyMessage("E-mail copiado. Use esse endereço no pagamento."); }
    catch { setCopyMessage("Não foi possível copiar. Selecione o e-mail acima e copie manualmente."); }
  }
  return <main className="premium-shell subscription-page"><section className="subpage">
    <div className="section-kicker">ASSINATURA</div>
    <div className="hub-title"><div><h1>Seu plano, <span>sem dúvidas.</span></h1><p>Confira a situação do acesso e entenda o que você está contratando.</p></div></div>
    <div className="billing-layout">
      <section className="billing-plan" aria-labelledby="billing-plan-title" aria-busy={loading}>
        <div className="billing-plan-top"><span className="billing-label">PLATAFORMA DIGITAL</span><span className={"billing-status" + (active ? " is-active" : "")} role="status">{active ? <CheckCircle2 size={16}/> : <Clock3 size={16}/>} {loading ? "CARREGANDO" : error ? "CONSULTA INDISPONÍVEL" : effectiveStatus ? statuses[effectiveStatus] : "SEM ASSINATURA"}</span></div>
        <h2 id="billing-plan-title">Sua presença digital<br/>sempre atualizada.</h2>
        <p className="billing-price">{formatBRL(MONTHLY_PRICE_CENTS)}<span>/ mês</span></p>
        <p className="billing-description">Mensalidade da página, do painel e da hospedagem. A plaquinha física é contratada separadamente.</p>
        <ul className="billing-benefits">{["Página com a identidade da sua empresa", "Modelos por segmento e editor visual", "Contatos, catálogo, PIX e localização", "Biblioteca de QR Codes e resultados"].map(text => <li key={text}><Check size={17} aria-hidden="true"/>{text}</li>)}</ul>
        {expires && !loading && <p className="billing-expiry">{active ? "Acesso pago até" : "Último período pago até"}: <strong>{expires}</strong></p>}
        {error ? <div className="billing-error" role="alert"><p>{error}</p><button type="button" className="premium-btn" onClick={() => setAttempt(value => value + 1)}><RefreshCw size={16}/>Carregar assinatura novamente</button></div> : !loading && (active ? <div className="billing-active-note"><ShieldCheck size={21}/><p><strong>Seu acesso está liberado.</strong>A renovação é processada pela Cakto. Você não precisa contratar outra assinatura para esta empresa.</p></div> : <>
          <a href={CHECKOUT_URL} target="_blank" rel="noopener noreferrer" className="premium-btn premium-btn-dark billing-checkout">Assinar por {formatBRL(MONTHLY_PRICE_CENTS)}/mês<ExternalLink size={17}/></a>
          <p className="billing-caption">Abre o checkout da Cakto em outra aba. O acesso é liberado após a confirmação do pagamento.</p>
        </>)}
      </section>
      <aside className="billing-details" aria-label="Informações da contratação">
        <section className="billing-detail-card"><span className="billing-detail-icon"><Copy size={20}/></span><h2>Use o e-mail da sua conta</h2><p>O pagamento precisa ter este mesmo endereço para ser vinculado à sua empresa aprovada.</p>{accountEmail && <><code className="billing-email">{accountEmail}</code><button type="button" className="premium-btn" onClick={copyEmail}><Copy size={16}/>Copiar e-mail para o pagamento</button></>}<p className="billing-copy-status" role="status">{copyMessage}</p></section>
        <section className="billing-detail-card"><span className="billing-detail-icon"><Wifi size={20}/></span><h2>A plaquinha é sua peça física</h2><p className="billing-tag-price">{formatBRL(NFC_TAG_PRICE_CENTS)}<span>pagamento único</span></p><p>A personalização, a entrega e o pagamento da plaquinha são combinados separadamente. O checkout acima cobra a mensalidade do sistema.</p></section>
      </aside>
    </div>
    <section className="billing-explainer" aria-labelledby="billing-explainer-title"><h2 id="billing-explainer-title">O que acontece com o acesso?</h2><div><p><strong>Pagamento confirmado</strong>A página e as ferramentas ficam disponíveis durante o período pago.</p><p><strong>Assinatura vencida</strong>A edição e a página pública ficam bloqueadas até a regularização.</p><p><strong>Cancelamento</strong>Interrompe as próximas cobranças. O acesso continua até o fim do período já pago.</p></div><p className="billing-renewal-note">Se já contratou pela Cakto, confira a situação da renovação antes de iniciar outra contratação. {!error && <>Para acompanhar um pagamento recente, <button type="button" onClick={() => setAttempt(value => value + 1)} disabled={loading}>atualize a situação da assinatura</button>.</>}</p></section>
  </section></main>;
}
