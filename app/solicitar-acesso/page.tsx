"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, Check, LoaderCircle, Wifi } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import SetupProgress from "@/app/components/SetupProgress";
import AuthPasswordField from "@/app/components/AuthPasswordField";
import "../auth-flow.css";

const REQUEST_TIMEOUT_MS = 15000;
class SignupTimeoutError extends Error {}
function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new SignupTimeoutError()), ms);
    Promise.resolve(promise).then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

export default function SolicitarAcesso() {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => { if (success) successRef.current?.focus(); }, [success]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    const companyName = String(form.get("company_name") || "").trim();
    const email = String(form.get("email") || "").trim().toLowerCase();
    const phone = String(form.get("phone") || "").trim();
    const password = String(form.get("password") || "");
    setError(""); setSuccess(false);
    if (!name || !companyName || !email || password.length < 8) {
      setError("Preencha nome, empresa e e-mail. Sua senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    setLoading(true);
    try {
      const { data, error: authError } = await withTimeout(createClient().auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: window.location.origin + "/auth/callback?next=/acesso-pendente",
          data: { name, company_name: companyName, phone },
        },
      }), REQUEST_TIMEOUT_MS);
      if (authError) {
        setError(authError.status === 429 || authError.code === "over_email_send_rate_limit" ? "Muitas solicitações em pouco tempo. Aguarde alguns minutos e confira se o e-mail de confirmação já chegou." : authError.code === "weak_password" ? "Escolha uma senha mais forte. Use pelo menos 8 caracteres e combine letras, números e símbolos." : authError.code === "email_address_invalid" || authError.code === "validation_failed" ? "Confira o endereço de e-mail e os demais campos antes de tentar novamente." : "Não foi possível criar este cadastro agora. Se já tem uma conta, entre com seu e-mail e senha.");
        return;
      }
      if (!data.user || data.user.identities?.length === 0) {
        setError("Não foi possível criar este cadastro. Se já tem uma conta, entre com seu e-mail e senha.");
        return;
      }
      // A solicitação é criada pela trigger. A aprovação e o pagamento continuam obrigatórios.
      setNeedsConfirmation(!data.session && !data.user.email_confirmed_at);
      setSubmittedEmail(email);
      setSuccess(true);
    } catch (caught) {
      setError(caught instanceof SignupTimeoutError ? "O envio demorou mais que o esperado. Confira seu e-mail e tente entrar antes de enviar o cadastro novamente." : "Não foi possível conectar. Confira sua internet e tente novamente. Seus dados continuam preenchidos.");
    } finally { setLoading(false); }
  }

  return <main className="premium-shell signup-premium">
    <a href="#main-content" className="site-skip-link">Ir para o cadastro</a>
    <header className="premium-nav"><Link href="/" className="brand" aria-label="NFC SMART — início"><span className="brand-mark"><Wifi size={17} aria-hidden="true"/></span><span>NFC<span>SMART</span></span></Link>{!success && <Link href="/login" className="premium-btn">Já tenho uma conta</Link>}</header>
    <section className="signup-premium-wrap" aria-labelledby="signup-title"><section className="auth-card signup-premium-card" id="main-content" tabIndex={-1}>
      <span className="auth-premium-icon">{success ? <Check size={22} aria-hidden="true"/> : <Wifi size={22} aria-hidden="true"/>}</span>
      <p className="eyebrow">SOLICITAÇÃO DE ACESSO</p>
      <h1 id="signup-title">{success ? needsConfirmation ? "Confira seu e-mail." : "Cadastro recebido." : "Crie seu perfil"}</h1>
      <p className="lead">{success ? "Acompanhe cada etapa para ativar sua página." : "Comece com sua conta. A assinatura vem depois da aprovação."}</p>
      <SetupProgress step={success && !needsConfirmation ? 1 : 0} confirmEmail={success && needsConfirmation}/>
      {success ? <div className="form-success auth-signup-success" role="status" tabIndex={-1} ref={successRef}>
        {needsConfirmation ? <><b>Confirme o e-mail para continuar.</b><p>Enviamos um link de confirmação para:</p><span className="auth-email-review">{submittedEmail}</span><p>Confira a caixa de entrada e o spam. Abra o link neste mesmo navegador.</p></> : <><b>Seu pedido está aguardando aprovação.</b><p>Entre para acompanhar a liberação da sua empresa.</p></>}
        <p>Depois da confirmação do e-mail e da aprovação da empresa, a assinatura ativa libera a personalização e a página pública.</p>
        <Link href="/login" className="premium-btn premium-btn-dark auth-submit">Ir para o login <ArrowRight size={17} aria-hidden="true"/></Link>
      </div> : <>
        <p className="auth-required-note">Preencha os campos abaixo. O WhatsApp é opcional.</p>
        <form className="auth-form" onSubmit={submit} aria-busy={loading}>
          <div className="auth-field"><label htmlFor="signup-name">Nome</label><input id="signup-name" name="name" required maxLength={120} autoComplete="name" placeholder="Seu nome" disabled={loading}/></div>
          <div className="auth-field"><label htmlFor="signup-company">Empresa</label><input id="signup-company" name="company_name" required maxLength={160} autoComplete="organization" placeholder="Nome que seus clientes conhecem" aria-describedby="signup-company-hint" disabled={loading}/><small id="signup-company-hint" className="auth-field-hint">Você poderá personalizar sua página após a ativação.</small></div>
          <div className="auth-field"><label htmlFor="signup-email">E-mail</label><input id="signup-email" name="email" required type="email" inputMode="email" maxLength={320} autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="voce@email.com" aria-describedby="signup-email-hint" disabled={loading}/><small id="signup-email-hint" className="auth-field-hint">É por aqui que você confirma a conta e recupera sua senha.</small></div>
          <div className="auth-field"><label htmlFor="signup-phone">WhatsApp <span className="auth-field-optional">opcional</span></label><input id="signup-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={30} placeholder="(00) 00000-0000" disabled={loading}/></div>
          <AuthPasswordField id="signup-password" name="password" label="Senha" required minLength={8} maxLength={128} autoComplete="new-password" placeholder="Crie uma senha exclusiva" hint="Use pelo menos 8 caracteres. Prefira uma combinação de letras, números e símbolos." disabled={loading}/>
          {error && <p className="form-error auth-form-error" id="signup-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}
          <button className="btn dark big auth-submit" type="submit" disabled={loading}>{loading ? <><LoaderCircle size={18} className="auth-busy-icon" aria-hidden="true"/> Enviando…</> : <>Solicitar acesso <ArrowRight size={17} aria-hidden="true"/></>}</button>
        </form>
        <div className="auth-flow-context"><b>Sem cobrança no cadastro.</b>Primeiro confirme seu e-mail. A equipe analisa sua empresa e, após a aprovação, você poderá contratar a assinatura.</div>
      </>}
    </section></section>
  </main>;
}
