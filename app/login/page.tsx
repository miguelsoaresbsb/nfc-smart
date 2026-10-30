"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight, LockKeyhole, Wifi } from "lucide-react";
import { createClient } from "@/lib/supabase-browser";

export default function Login() {
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const router=useRouter();
  async function go(e:React.FormEvent) {
    e.preventDefault(); setError(""); setLoading(true);
    const {error}=await createClient().auth.signInWithPassword({email:email.trim(),password});
    if(error){setError(error.message);setLoading(false);} else router.push("/dashboard");
  }
  return (
    <main className="premium-shell auth-premium">
      <header className="premium-nav"><Link href="/" className="brand"><span className="brand-mark"><Wifi size={17}/></span><span>NFC<span>SMART</span></span></Link><Link href="/" className="premium-btn"><ArrowLeft size={14}/> Voltar ao início</Link></header>
      <section className="auth-premium-wrap">
        <form className="auth-premium-card" onSubmit={go}>
          <span className="auth-premium-icon"><LockKeyhole size={22}/></span>
          <div className="section-kicker">ÁREA DO CLIENTE</div>
          <h1>Bem-vindo de volta.</h1><p>Acesse seu espaço para gerenciar sua presença digital.</p>
          <label>E-mail<input type="email" autoComplete="email" placeholder="voce@empresa.com" value={email} onChange={e=>setEmail(e.target.value)} required/></label>
          <label>Senha<input type="password" autoComplete="current-password" placeholder="Sua senha" value={password} onChange={e=>setPassword(e.target.value)} required/></label>
          {error&&<div className="error">{error}</div>}
          <button className="premium-btn premium-btn-dark auth-submit" disabled={loading}>{loading?"Entrando...":"Entrar no painel"} <ArrowRight size={15}/></button>
          <div className="auth-premium-footer">Ainda não tem acesso? <Link href="/solicitar-acesso">Solicitar cadastro</Link></div>
        </form>
      </section>
    </main>
  );
}