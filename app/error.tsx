"use client";

export default function ErrorPage({ retry }: { retry: () => void }) {
  return <main className="premium-shell auth-premium">
    <section className="auth-premium-wrap"><div className="auth-premium-card">
      <h1>Não foi possível carregar esta página.</h1>
      <p>Verifique sua conexão e tente novamente.</p>
      <button className="premium-btn premium-btn-dark" onClick={retry}>Tentar novamente</button>
      <a className="premium-btn" href="/">Voltar ao início</a>
    </div></section>
  </main>;
}
