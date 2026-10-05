"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase-browser";

export default function SolicitarAcesso() {
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const name = String(form.get("name") || "").trim();
    const companyName = String(form.get("company_name") || "").trim();
    const email = String(form.get("email") || "").trim().toLowerCase();
    const phone = String(form.get("phone") || "").trim();
    const password = String(form.get("password") || "");

    const supabase = createClient();
    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin + "/auth/callback?next=/acesso-pendente",
        data: { name, company_name: companyName, phone },
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (data.session && data.user) {
      const { error: requestError } = await supabase.from("access_requests").insert({
        name, email, phone: phone || null, company_name: companyName, user_id: data.user.id, status: "pending",
      });
      if (requestError) {
        setError(requestError.message);
        setLoading(false);
        return;
      }
      window.location.href = "/acesso-pendente";
      return;
    }

    setSuccess(true);
    setLoading(false);
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand">NFC<span>SMART</span></div>
        <p className="eyebrow">SOLICITAÇÃO DE ACESSO</p>
        <h1>Crie seu perfil</h1>
        <p className="lead">Preencha seus dados para solicitar acesso ao NFC Smart.</p>
        {success ? (
          <div className="form-success">Cadastro iniciado. Verifique seu e-mail para confirmar a conta. Depois da confirmação, sua solicitação ficará pendente de autorização do administrador.</div>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            <label>Nome<input name="name" required placeholder="Seu nome" /></label>
            <label>Empresa<input name="company_name" required placeholder="Nome da empresa" /></label>
            <label>E-mail<input name="email" required type="email" placeholder="voce@email.com" /></label>
            <label>WhatsApp<input name="phone" placeholder="(00) 00000-0000" /></label>
            <label>Senha<input name="password" required minLength={6} type="password" placeholder="Mínimo de 6 caracteres" /></label>
            {error && <p className="form-error">{error}</p>}
            <button className="btn dark big" type="submit" disabled={loading}>{loading ? "Enviando..." : "Solicitar acesso"}</button>
          </form>
        )}
        <p className="auth-footer"><Link href="/">Voltar</Link> · <Link href="/login">Já tenho acesso</Link></p>
      </section>
    </main>
  );
}
