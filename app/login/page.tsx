"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase-browser";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [mode, setMode] = useState<"login" | "request">("login");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(false);

  async function login(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMsg("");
    const supabase = createClient();
    const normalized = email.trim().toLowerCase();

    const { error } = await supabase.auth.signInWithPassword({ email: normalized, password });
    if (error) {
      setLoading(false);
      setMsg("E-mail ou senha inválidos. Se ainda não possui acesso, solicite autorização.");
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
          : "Seu login ainda não foi autorizado pelo administrador.",
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
    const normalized = email.trim().toLowerCase();

    if (password.length < 6) {
      setLoading(false);
      setMsg("A senha deve ter pelo menos 6 caracteres.");
      return;
    }

    const { error: signupError } = await supabase.auth.signUp({
      email: normalized,
      password,
      options: {
        data: { name: name.trim(), phone: phone.trim() },
        emailRedirectTo: "https://nfc-smart-one.vercel.app/auth/callback?next=/login",
      },
    });

    const { error: requestError } = await supabase.from("access_requests").insert({
      email: normalized,
      name: name.trim() || null,
      phone: phone.trim() || null,
      status: "pending",
    });

    if (requestError && requestError.code !== "23505") {
      setLoading(false);
      setMsg(requestError.message);
      return;
    }

    if (signupError && !/already|exists|registered/i.test(signupError.message)) {
      setLoading(false);
      setMsg(signupError.message);
      return;
    }

    await supabase.auth.signOut();
    setMode("login");
    setLoading(false);
    setMsg("Pedido enviado. Aguarde a autorização do administrador para entrar.");
  }

  return (
    <main className="min-h-screen grid place-items-center bg-[#05070a] px-5">
      <div className="glass w-full max-w-md rounded-3xl p-8">
        <div className="text-xs uppercase tracking-[.3em] text-white/40">NFC Smart</div>
        <h1 className="mt-3 text-3xl font-semibold">
          {mode === "login" ? "Acesse seu painel" : "Solicite acesso"}
        </h1>
        <p className="mt-2 text-sm text-white/50">
          {mode === "login"
            ? "O acesso só funciona depois que o administrador autorizar sua conta."
            : "Seu pedido aparecerá no painel do dono do sistema para aprovação."}
        </p>

        {mode === "request" ? (
          <form onSubmit={requestAccess} className="mt-8 space-y-3">
            <input className="w-full rounded-xl border border-white/10 bg-black/30 p-3 outline-none" placeholder="Seu nome" value={name} onChange={e => setName(e.target.value)} required />
            <input className="w-full rounded-xl border border-white/10 bg-black/30 p-3 outline-none" placeholder="E-mail" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            <input className="w-full rounded-xl border border-white/10 bg-black/30 p-3 outline-none" placeholder="WhatsApp / telefone" value={phone} onChange={e => setPhone(e.target.value)} />
            <input className="w-full rounded-xl border border-white/10 bg-black/30 p-3 outline-none" placeholder="Crie uma senha" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
            <button disabled={loading} className="w-full rounded-xl bg-white p-3 font-semibold text-black disabled:opacity-50">
              {loading ? "Enviando..." : "Pedir autorização"}
            </button>
            <button type="button" onClick={() => setMode("login")} className="w-full p-2 text-sm text-white/50">
              Já tenho acesso → Entrar
            </button>
          </form>
        ) : (
          <form onSubmit={login} className="mt-8 space-y-3">
            <input className="w-full rounded-xl border border-white/10 bg-black/30 p-3 outline-none" placeholder="E-mail" type="email" value={email} onChange={e => setEmail(e.target.value)} required />
            <input className="w-full rounded-xl border border-white/10 bg-black/30 p-3 outline-none" placeholder="Senha" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
            <button disabled={loading} className="w-full rounded-xl bg-white p-3 font-semibold text-black disabled:opacity-50">
              {loading ? "Entrando..." : "Entrar"}
            </button>
            <button type="button" onClick={() => setMode("request")} className="w-full p-2 text-sm text-white/50">
              Ainda não tenho acesso → Solicitar autorização
            </button>
          </form>
        )}

        {msg && <p className="mt-5 text-sm text-white/65">{msg}</p>}
      </div>
    </main>
  );
}
