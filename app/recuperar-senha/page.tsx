"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, Check, LoaderCircle, Mail, Wifi } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";
import { RECOVERY_SUCCESS_MESSAGE } from "@/lib/auth-recovery";
import "../auth-flow.css";

export default function RecoverPassword() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => { if (sent) successRef.current?.focus(); }, [sent]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const { error: authError } = await createClient().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: new URL("/auth/callback", window.location.origin).toString(),
      });
      if (authError && authError.code !== "user_not_found") {
        setError(authError.status === 429 ? "Aguarde alguns minutos antes de solicitar outro link. Confira também se uma mensagem já chegou ao seu e-mail." : "Não foi possível solicitar o link agora. Aguarde um momento e tente novamente.");
        return;
      }
      setSent(true);
    } catch { setError("Não foi possível conectar. Confira sua internet e tente novamente. O e-mail informado continua preenchido."); }
    finally { setBusy(false); }
  }
  return <main className="premium-shell auth-premium">
    <a href="#main-content" className="site-skip-link">Ir para a recuperação</a>
    <header className="premium-nav"><Link href="/" className="brand" aria-label="NFC SMART — início"><span className="brand-mark"><Wifi size={17} aria-hidden="true"/></span><span>NFC<span>SMART</span></span></Link>{!sent && <Link href="/login" className="premium-btn"><ArrowLeft size={16} aria-hidden="true"/> Entrar</Link>}</header>
    <section className="auth-premium-wrap" aria-labelledby="recovery-title"><div className="auth-premium-card" id="main-content" tabIndex={-1}>
      <span className="auth-premium-icon">{sent ? <Check size={22} aria-hidden="true"/> : <Mail size={22} aria-hidden="true"/>}</span>
      <div className="section-kicker">RECUPERAÇÃO DE ACESSO</div>
      <h1 id="recovery-title">{sent ? "Confira seu e-mail." : "Recupere sua senha."}</h1>
      {sent ? <>
        <div className="auth-flow-success" role="status" tabIndex={-1} ref={successRef}>{RECOVERY_SUCCESS_MESSAGE}</div>
        <ol className="auth-next-steps"><li>Procure a mensagem de recuperação na caixa de entrada ou no spam.</li><li>Abra o link neste mesmo navegador.</li><li>Crie uma nova senha e entre novamente.</li></ol>
        <p className="auth-flow-note">O link é pessoal e pode ser usado uma vez. Aguarde alguns minutos antes de solicitar outro.</p>
        <Link href="/login" className="premium-btn premium-btn-dark auth-submit">Voltar para o login</Link>
      </> : <>
        <p>Informe o e-mail da sua conta. Você receberá as instruções para criar uma nova senha.</p>
        <form className="auth-flow-form" onSubmit={submit} aria-busy={busy}>
          <div className="auth-field"><label htmlFor="recovery-email">E-mail</label><input id="recovery-email" name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} maxLength={320} value={email} required onChange={event => setEmail(event.target.value)} placeholder="voce@empresa.com" aria-describedby="recovery-email-hint" disabled={busy}/><small id="recovery-email-hint" className="auth-field-hint">Use o e-mail que você já utiliza para entrar no NFC SMART.</small></div>
          {error && <p className="error auth-form-error" id="recovery-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</p>}
          <button type="submit" className="premium-btn premium-btn-dark auth-submit" disabled={busy}>{busy ? <><LoaderCircle size={18} className="auth-busy-icon" aria-hidden="true"/> Solicitando…</> : "Enviar link de recuperação"}</button>
        </form>
      </>}
    </div></section>
  </main>;
}
