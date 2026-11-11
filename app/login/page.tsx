"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, LoaderCircle, LockKeyhole, Wifi } from "lucide-react";
import AuthPasswordField from "@/app/components/AuthPasswordField";
import { createClient } from "@/lib/supabase-browser";
import { safeAuthPath } from "@/lib/auth-redirect";
import "../auth-flow.css";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [passwordUpdated, setPasswordUpdated] = useState(false);
  const errorRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const reason = params.get("auth_error");
    setPasswordUpdated(params.get("password") === "updated");
    if (reason === "callback") setError("O link de confirmação expirou ou é inválido. Entre com seu e-mail e senha ou solicite outro link em Esqueci minha senha.");
    if (reason === "confirm") setError("Confirme seu e-mail pelo link enviado no cadastro antes de acessar o painel. Confira também a pasta de spam.");
    if (reason === "signout") setError("Não foi possível encerrar sua sessão. Tente novamente.");
  }, []);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  async function go(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setError(""); setLoading(true);
    try {
      const { error: authError } = await createClient().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
      if (authError) {
        setError(authError.code === "invalid_credentials" ? "E-mail ou senha incorretos. Confira os dados ou use Esqueci minha senha." : authError.code === "email_not_confirmed" ? "Confirme seu e-mail antes de entrar. Procure a mensagem do NFC SMART na caixa de entrada ou no spam." : authError.status === 429 ? "Muitas tentativas em pouco tempo. Aguarde alguns minutos antes de entrar novamente." : "Não foi possível entrar agora. Aguarde um momento e tente novamente.");
        return;
      }
      const next = safeAuthPath(new URLSearchParams(window.location.search).get("next"));
      router.replace(next); router.refresh();
    } catch { setError("Não foi possível conectar. Confira sua internet e tente novamente. Seus dados continuam preenchidos."); }
    finally { setLoading(false); }
  }
  return <main className="premium-shell auth-premium">
    <a href="#main-content" className="site-skip-link">Ir para o formulário</a>
    <header className="premium-nav"><Link href="/" className="brand" aria-label="NFC SMART — início"><span className="brand-mark"><Wifi size={17} aria-hidden="true"/></span><span>NFC<span>SMART</span></span></Link><Link href="/" className="premium-btn"><ArrowLeft size={16} aria-hidden="true"/> Início</Link></header>
    <section className="auth-premium-wrap" aria-labelledby="login-title">
      <form className="auth-premium-card" id="main-content" tabIndex={-1} onSubmit={go} aria-busy={loading}>
        <span className="auth-premium-icon"><LockKeyhole size={22} aria-hidden="true"/></span>
        <div className="section-kicker">ÁREA DO CLIENTE</div>
        <h1 id="login-title">Seu negócio, conectado.</h1>
        <p>Entre para acompanhar sua conta e cuidar da página da sua plaquinha.</p>
        {passwordUpdated && <div className="auth-flow-success" role="status">Senha atualizada. Entre com sua nova senha.</div>}
        <div className="auth-field"><label htmlFor="login-email">E-mail</label><input id="login-email" name="email" type="email" inputMode="email" maxLength={320} autoComplete="email" autoCapitalize="none" spellCheck={false} placeholder="voce@empresa.com" value={email} onChange={event => setEmail(event.target.value)} aria-describedby="login-email-hint" required disabled={loading}/><small id="login-email-hint" className="auth-field-hint">Use o mesmo e-mail informado no cadastro.</small></div>
        <AuthPasswordField id="login-password" name="password" label="Senha" maxLength={128} autoComplete="current-password" placeholder="Sua senha" value={password} onChange={event => setPassword(event.target.value)} required disabled={loading}/>
        <Link href="/recuperar-senha" className="auth-flow-forgot">Esqueci minha senha</Link>
        {error && <div className="error auth-form-error" id="login-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</div>}
        <button className="premium-btn premium-btn-dark auth-submit" disabled={loading} type="submit">{loading ? <><LoaderCircle size={18} className="auth-busy-icon" aria-hidden="true"/> Entrando…</> : <>Entrar no painel <ArrowRight size={17} aria-hidden="true"/></>}</button>
        <div className="auth-premium-footer">Ainda não tem uma conta? <Link href="/solicitar-acesso">Solicitar cadastro</Link></div>
      </form>
    </section>
  </main>;
}
