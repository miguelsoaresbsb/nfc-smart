import Link from "next/link";

export default function SolicitarAcesso() {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <div className="auth-brand">NFC<span>SMART</span></div>
        <p className="eyebrow">SOLICITAÇÃO DE ACESSO</p>
        <h1>Crie seu perfil</h1>
        <p className="lead">Preencha seus dados para solicitar acesso ao NFC Smart.</p>
        <form className="auth-form" action="/api/access-request" method="post">
          <label>Nome<input name="name" required placeholder="Seu nome" /></label>
          <label>E-mail<input name="email" required type="email" placeholder="voce@email.com" /></label>
          <label>WhatsApp<input name="phone" placeholder="(00) 00000-0000" /></label>
          <label>Senha<input name="password" required minLength={6} type="password" placeholder="Mínimo de 6 caracteres" /></label>
          <button className="btn dark big" type="submit">Solicitar acesso</button>
        </form>
        <p className="auth-footer"><Link href="/">Voltar</Link> · <Link href="/login">Já tenho acesso</Link></p>
      </section>
    </main>
  );
}