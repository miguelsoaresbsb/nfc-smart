import Link from "next/link";

export default function NotFound() {
  return <main className="premium-shell auth-premium">
    <section className="auth-premium-wrap"><div className="auth-premium-card">
      <h1>Página indisponível</h1>
      <p>Confira o endereço. A página pode estar aguardando ativação da assinatura.</p>
      <Link className="premium-btn premium-btn-dark" href="/">Ir para o início</Link>
    </div></section>
  </main>;
}
