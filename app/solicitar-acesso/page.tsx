"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

const REQUEST_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("A conexão demorou mais que o esperado. Se já enviou o cadastro, tente entrar antes de enviar novamente.")), ms);
    Promise.resolve(promise).then(resolve, reject).finally(() => clearTimeout(timer));
  });
}

export default function SolicitarAcesso() {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;

    setError("");
    setSuccess(false);
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") || "").trim();
    const companyName = String(form.get("company_name") || "").trim();
    const email = String(form.get("email") || "").trim().toLowerCase();
    const phone = String(form.get("phone") || "").trim();
    const password = String(form.get("password") || "");

    if (!name || !companyName || !email || password.length < 6) {
      setError("Preencha os campos obrigatórios e use uma senha com pelo menos 6 caracteres.");
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient();

      const { data, error: authError } = await withTimeout(
        supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin + "/auth/callback?next=/acesso-pendente",
            data: { name, company_name: companyName, phone },
          },
        }),
        REQUEST_TIMEOUT_MS,
      );

      if (authError) {
        setError(authError.message || "Não foi possível enviar sua solicitação.");
        setLoading(false);
        return;
      }

      if (!data.user || data.user.identities?.length === 0) {
        setError("Não foi possível criar este cadastro. Se já tem uma conta, entre com seu e-mail e senha.");
        setLoading(false);
        return;
      }

      // A trigger do banco cria a solicitação de acesso quando o usuário é criado.
      // Não fazemos signIn automático aqui: a autorização do Admin Master é o gate de acesso.
      setNeedsConfirmation(!data.session && !data.user.email_confirmed_at);
      setSuccess(true);
      setLoading(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Não foi possível enviar sua solicitação. Tente novamente.",
      );
      setLoading(false);
    }
  }

  return (
    <main className="premium-shell signup-premium"><header className="premium-nav"><Link href="/" className="brand"><span className="brand-mark">N</span><span>NFC<span>SMART</span></span></Link><Link href="/login" className="premium-btn">Já tenho acesso</Link></header><section className="signup-premium-wrap">
      <section className="auth-card signup-premium-card">
        <div className="auth-brand">NFC<span>SMART</span></div>
        <p className="eyebrow">SOLICITAÇÃO DE ACESSO</p>
        <h1>Crie seu perfil</h1>
        <p className="lead">Preencha seus dados para solicitar acesso ao NFC Smart.</p>

        {success ? (
          <div className="form-success" role="status">
            Solicitação enviada com sucesso. Seu pedido está aguardando autorização do administrador.
            Você poderá entrar no painel somente depois que o administrador autorizar seu acesso.
            {needsConfirmation && <p>Enviamos um link para confirmar seu e-mail. Verifique sua caixa de entrada e a pasta de spam.</p>}
            <p><Link href="/login">Ir para o login</Link></p>
          </div>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            <label>Nome<input name="name" required maxLength={120} autoComplete="name" placeholder="Seu nome" /></label>
            <label>Empresa<input name="company_name" required maxLength={160} autoComplete="organization" placeholder="Nome da empresa" /></label>
            <label>E-mail<input name="email" required type="email" autoComplete="email" placeholder="voce@email.com" /></label>
            <label>WhatsApp<input name="phone" type="tel" autoComplete="tel" maxLength={30} placeholder="(00) 00000-0000" /></label>
            <label>Senha<input name="password" required minLength={6} type="password" autoComplete="new-password" placeholder="Mínimo de 6 caracteres" /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="btn dark big" type="submit" disabled={loading}>
              {loading ? "Enviando..." : "Solicitar acesso"}
            </button>
          </form>
        )}

        <p className="auth-footer">
          <Link href="/">Voltar</Link> · <Link href="/login">Já tenho acesso</Link>
        </p>
      </section></section>
    </main>
  );
}
