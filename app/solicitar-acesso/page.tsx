"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

const REQUEST_TIMEOUT_MS = 15000;

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("A conexão demorou mais que o esperado. Tente novamente.")), ms),
    ),
  ]);
}

export default function SolicitarAcesso() {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

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

      if (!data.user) {
        setError("O cadastro não foi criado. Tente novamente.");
        setLoading(false);
        return;
      }

      // A trigger do banco cria a solicitação de acesso quando o usuário é criado.
      // Não fazemos signIn automático aqui: a autorização do Admin Master é o gate de acesso.
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
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand">NFC<span>SMART</span></div>
        <p className="eyebrow">SOLICITAÇÃO DE ACESSO</p>
        <h1>Crie seu perfil</h1>
        <p className="lead">Preencha seus dados para solicitar acesso ao NFC Smart.</p>

        {success ? (
          <div className="form-success">
            Solicitação enviada com sucesso. Seu pedido está aguardando autorização do administrador.
            Você poderá entrar no painel somente depois que o administrador autorizar seu acesso.
          </div>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            <label>Nome<input name="name" required placeholder="Seu nome" /></label>
            <label>Empresa<input name="company_name" required placeholder="Nome da empresa" /></label>
            <label>E-mail<input name="email" required type="email" placeholder="voce@email.com" /></label>
            <label>WhatsApp<input name="phone" placeholder="(00) 00000-0000" /></label>
            <label>Senha<input name="password" required minLength={6} type="password" placeholder="Mínimo de 6 caracteres" /></label>
            {error && <p className="form-error">{error}</p>}
            <button className="btn dark big" type="submit" disabled={loading}>
              {loading ? "Enviando..." : "Solicitar acesso"}
            </button>
          </form>
        )}

        <p className="auth-footer">
          <Link href="/">Voltar</Link> · <Link href="/login">Já tenho acesso</Link>
        </p>
      </section>
    </main>
  );
}
