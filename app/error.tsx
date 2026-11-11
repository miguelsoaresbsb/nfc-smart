"use client";

import { useEffect, useRef, useTransition } from "react";

export default function ErrorPage({ retry }: { retry: () => void }) {
  const [pending, startTransition] = useTransition();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return <main className="premium-shell auth-premium">
    <section className="auth-premium-wrap"><div className="auth-premium-card system-message" aria-busy={pending}>
      <span className="section-kicker">VAMOS TENTAR DE NOVO</span>
      <h1 ref={heading} tabIndex={-1}>Não conseguimos abrir esta página.</h1>
      <p>Confira sua conexão e tente carregar novamente. Se o problema continuar, você pode voltar ao início.</p>
      <button className="premium-btn premium-btn-dark" type="button" disabled={pending} onClick={() => startTransition(() => retry())}>{pending ? "Carregando…" : "Tentar novamente"}</button>
      <a className="premium-btn" href="/">Voltar ao início</a>
    </div></section>
  </main>;
}
