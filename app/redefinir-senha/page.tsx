import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LockKeyhole, Wifi } from "lucide-react";
import { createClient } from "@/lib/supabase-server";
import { RECOVERY_COOKIE } from "@/lib/auth-recovery";
import { verifiedRecoverySession } from "@/lib/auth-recovery-server";
import PasswordForm from "./PasswordForm";
import "../auth-flow.css";

export const dynamic = "force-dynamic";

export default async function ResetPassword({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  // Some email templates redirect directly here instead of the callback.
  if (typeof params.code === "string" || typeof params.token_hash === "string") {
    const callback = new URLSearchParams({ next: "/redefinir-senha" });
    for (const key of ["code", "token_hash", "type", "sb_flow_id"]) if (typeof params[key] === "string") callback.set(key, params[key]);
    redirect("/auth/callback?" + callback.toString());
  }
  const supabase = await createClient();
  let valid = false;
  if (!params.error) {
    try { valid = Boolean(await verifiedRecoverySession(supabase, (await cookies()).get(RECOVERY_COOKIE)?.value)); }
    catch { valid = false; }
  }
  return <main className="premium-shell auth-premium">
    <a href="#main-content" className="site-skip-link">Ir para a redefinição de senha</a>
    <header className="premium-nav"><Link href="/" className="brand" aria-label="NFC SMART — início"><span className="brand-mark"><Wifi size={17} aria-hidden="true"/></span><span>NFC<span>SMART</span></span></Link><Link href="/login" className="premium-btn">Login</Link></header>
    <section className="auth-premium-wrap" aria-labelledby="reset-title"><div className="auth-premium-card" id="main-content" tabIndex={-1}>
      <span className="auth-premium-icon"><LockKeyhole size={22} aria-hidden="true"/></span>
      <div className="section-kicker">RECUPERAÇÃO DE ACESSO</div>
      <h1 id="reset-title">{valid ? "Crie sua nova senha." : "Solicite um novo link."}</h1>
      {valid ? <><p>Escolha uma senha exclusiva para entrar no NFC SMART.</p><PasswordForm/></> : <>
        <p>O link expirou, já foi utilizado ou não foi validado neste navegador. Solicite outro link e abra-o no mesmo navegador.</p>
        <Link href="/recuperar-senha" className="premium-btn premium-btn-dark auth-submit">Solicitar link de recuperação</Link>
      </>}
    </div></section>
  </main>;
}
