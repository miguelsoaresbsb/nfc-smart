"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";

export default function Login() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [mode, setMode] = useState<"login" | "request">("login");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
      options: { shouldCreateUser: true },
    });
    setLoading(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setStep("code");
    setMsg("Enviamos um código de acesso para seu e-mail.");
  }

  async function verifyCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    const supabase = createClient();
    const normalized = email.trim().toLowerCase();
    const { error } = await supabase.auth.verifyOtp({
      email: normalized,
      token: code.trim(),
      type: "email",
    });
    if (error) {
      setLoading(false);
      setMsg("Código inválido ou expirado.");
      return;
    }

    const { data: admin } = await supabase
      .from("platform_admins")
      .select("user_id")
      .maybeSingle();

    const { data: request } = await supabase
      .from("access_requests")
      .select("status")
      .eq("email", normalized)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!admin && request?.status !== "approved") {
      await supabase.auth.signOut();
      setLoading(false);
      setMsg(
        request?.status === "rejected"
          ? "Seu pedido de acesso foi recusado. Entre em contato com o administrador."
          : "Seu acesso ainda está aguardando autorização do administrador.",
      );
      return;
    }

    window.location.href = "/dashboard";
  }

  async function requestAccess(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    const supabase = createClient();
    const { error } = await supabase.from("access_requests").insert({
      email: email.trim().toLowerCase(),
      name: name.trim() || null,
      phone: phone.trim() || null,
      status: "pending",
    });
    setLoading(false);
    if (error) {
      setMsg(
        error.code === "23505"
          ? "Já existe uma solicitação pendente para este e-mail."
          : error.message,
      );
      return;
    }
    setMode("login");
    setMsg("Solicitação enviada. Agora aguarde a autorização do administrador.");
  }

  return (
    <main className="min-h-screen grid place-items-center bg-[#05070a] px-5">
      <div className="glass w-full max-w-md rounded-3xl p-8">
        <div className="text-xs uppercase tracking-[.3em] text-white/40">NFC Smart</div>
        <h1 className="mt-3 text-3xl font-semibold">
          {mode === "login" ? "Acesse seu painel" : "Solicite seu acesso"}
        </h1>
        <p className="mt-2 text-sm text-white/50">
          {mode === "login"
            ? "Seu acesso só é liberado depois da autorização do administrador."
            : "Preencha seus dados. O pedido aparecerá no painel do administrador."}
        </p>

        {mode === "request" ? (
          <form onSubmit={requestAccess} className="mt-8 space-y-3">
            <input className="w-full rounded-xl border border-white/10 bg-black/30 p-3 outline-none" placeholder="Seu nome" value={name} onChange={e => setName(e.target.value)} required />
            <input className="w-full rounded-xl border border-white/10 bg-black/30 p-3 outline-none" placeholder="E-mail" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            <input className="w-full rounded-xl border border-white/10 bg-black/30 p-3 outline-none" placeholder="WhatsApp / telefone" value={phone} onChange={e => setPhone(e.target.value)} />
            <button disabled={loading} className="w-full rounded-xl bg-white p-3 font-semibold text-black disabled:opacity-50">
              {loading ? "Enviando..." : "Pedir autorização"}
            </button>
            <button type="button" onClick={() => setMode("login")} className="w-full p-2 text-sm text-white/50">
              Já fui autorizado → Entrar
            </button>
          </form>
        ) : step === "email" ? (
          <form onSubmit={sendCode} className="mt-8 space-y-3">
            <input className="w-full rounded-xl border border-white/10 bg-black/30 p-3 outline-none" placeholder="E-mail autorizado" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            <button disabled={loading} className="w-full rounded-xl bg-white p-3 font-semibold text-black disabled:opacity-50">
              {loading ? "Enviando..." : "Enviar código de acesso"}
            </button>
            <button type="button" onClick={() => setMode("request")} className="w-full p-2 text-sm text-white/50">
              Ainda não tenho acesso → Solicitar autorização
            </button>
          </form>
        ) : (
          <form onSubmit={verifyCode} className="mt-8 space-y-3">
            <input className="w-full rounded-xl border border-white/10 bg-black/30 p-3 text-center text-2xl tracking-[.5em] outline-none" placeholder="000000" inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ""))} required />
            <button disabled={loading} className="w-full rounded-xl bg-white p-3 font-semibold text-black disabled:opacity-50">
              {loading ? "Verificando..." : "Confirmar código"}
            </button>
            <button type="button" onClick={() => setStep("email")} className="w-full p-2 text-sm text-white/50">
              ← Alterar e-mail
            </button>
          </form>
        )}

        {msg && <p className="mt-5 text-sm text-white/65">{msg}</p>}
      </div>
    </main>
  );
}
