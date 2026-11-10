"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowLeft, Mail, Wifi } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import { RECOVERY_SUCCESS_MESSAGE } from "@/lib/auth-recovery";
import "../auth-flow.css";

export default function RecoverPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const { error } = await createClient().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: new URL("/auth/callback", window.location.origin).toString(),
      });
      if (error && error.code !== "user_not_found") {
        setError(error.status === 429 ? "Aguarde alguns minutos antes de solicitar outro link." : "Não foi possível solicitar o link agora. Tente novamente em alguns minutos.");
        return;
      }
      setSent(true);
    } catch { setError("Não foi possível conectar. Verifique sua conexão e tente novamente."); }
    finally { setBusy(false); }
  }
  return <main className="premium-shell auth-premium">
    <header className="premium-nav"><Link href="/" className="brand"><span className="brand-mark"><Wifi size={17}/></span><span>NFC<span>SMART</span></span></Link><Link href="/login" className="premium-btn"><ArrowLeft size={14}/> Login</Link></header>
    <section className="auth-premium-wrap"><div className="auth-premium-card">
      <span className="auth-premium-icon"><Mail size={22}/></span>
      <div className="section-kicker">RECUPERAÇÃO DE ACESSO</div>
      <h1>Recupere sua senha.</h1>
      {sent ? <><div className="auth-flow-success" role="status">{RECOVERY_SUCCESS_MESSAGE}</div><p className="auth-flow-note">Abra o link no mesmo navegador em que fez a solicitação. O link é pessoal e pode ser usado uma vez.</p><Link href="/login" className="premium-btn premium-btn-dark">Voltar para o login</Link></> : <>
        <p>Informe o e-mail da sua conta. Enviaremos as instruções para você criar uma nova senha.</p>
        <form className="auth-flow-form" onSubmit={submit}>
          <label>E-mail<input type="email" autoComplete="email" maxLength={320} value={email} required onChange={e => setEmail(e.target.value)} placeholder="voce@empresa.com"/></label>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="submit" className="premium-btn premium-btn-dark auth-submit" disabled={busy}>{busy ? "Solicitando…" : "Enviar link de recuperação"}</button>
        </form>
      </>}
      <div className="auth-premium-footer"><Link href="/login">Lembrei minha senha</Link></div>
    </div></section>
  </main>;
}
