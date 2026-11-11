import Link from "next/link";

export default function NotFound() {
  return <main className="premium-shell auth-premium">
    <section className="auth-premium-wrap"><div className="auth-premium-card system-message">
      <span className="section-kicker">CONFIRA O ENDEREÇO</span>
      <h1>Página indisponível</h1>
      <p>Este endereço não está disponível no momento. Confira o link recebido. Uma página de empresa também pode ficar indisponível quando a assinatura não está ativa.</p>
      <Link className="premium-btn premium-btn-dark" href="/">Ir para o início</Link>
    </div></section>
  </main>;
}
