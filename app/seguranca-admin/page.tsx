import Link from "next/link";
import type { Metadata } from "next";
import { ShieldCheck, Wifi } from "lucide-react";
import { getAdminSecurityAccess } from "@/lib/auth-guard";
import AdminMfa from "./AdminMfa";
import "../auth-flow.css";
import "./security.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Segurança administrativa", robots: { index: false, follow: false } };

export default async function AdminSecurityPage() {
  const access = await getAdminSecurityAccess();
  return <main className="premium-shell auth-premium admin-security-page">
    <a href="#main-content" className="site-skip-link">Ir para a confirmação de segurança</a>
    <header className="premium-nav"><Link href="/" className="brand" aria-label="NFC SMART — início"><span className="brand-mark"><Wifi size={18} aria-hidden="true"/></span><span>NFC<span>SMART</span></span></Link><form action="/auth/signout" method="post"><button type="submit" className="premium-btn">Sair da conta</button></form></header>
    <section className="admin-security-wrap" id="main-content" tabIndex={-1} aria-labelledby="admin-security-title">
      <div className="admin-security-heading"><span className="auth-premium-icon"><ShieldCheck size={24} aria-hidden="true"/></span><div className="section-kicker">ACESSO ADMINISTRATIVO</div><h1 id="admin-security-title">Uma segunda etapa.<br/><span>Mais proteção para o sistema.</span></h1><p>A senha identifica sua conta. O código do seu aplicativo autenticador confirma o acesso à administração.</p></div>
      <AdminMfa initiallyVerified={access.mfaVerified}/>
    </section>
  </main>;
}
