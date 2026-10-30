import Link from "next/link";
import { ArrowRight, Check, Fingerprint, Globe2, MousePointerClick, ShieldCheck, Sparkles, Wifi } from "lucide-react";

export default function Home() {
  return (
    <main className="premium-shell landing-premium">
      <header className="premium-nav">
        <Link href="/" className="brand"><span className="brand-mark"><Wifi size={17}/></span><span>NFC<span>SMART</span></span></Link>
        <div className="landing-nav-actions"><Link href="/login" className="premium-btn">Entrar</Link><Link href="/solicitar-acesso" className="premium-btn premium-btn-dark">Criar meu perfil <ArrowRight size={14}/></Link></div>
      </header>
      <section className="landing-hero">
        <div className="landing-copy">
          <div className="section-kicker"><span className="live-dot"/> SUA PRESENÇA DIGITAL, EM UM TOQUE</div>
          <h1>Conexões que começam <em>com um toque.</em></h1>
          <p>Transforme sua TAG NFC em uma experiência digital profissional. Reúna contatos, redes sociais, pagamentos, localização e muito mais em uma única página.</p>
          <div className="landing-cta"><Link href="/solicitar-acesso" className="premium-btn premium-btn-dark">Criar meu perfil <ArrowRight size={16}/></Link><Link href="/login" className="landing-text-link">Já sou cliente <ArrowRight size={14}/></Link></div>
          <div className="landing-trust"><span><Check size={14}/> Fácil de atualizar</span><span><Check size={14}/> Link permanente</span><span><Check size={14}/> Feito para celular</span></div>
        </div>
        <div className="landing-visual">
          <div className="landing-orbit orbit-a"/><div className="landing-orbit orbit-b"/>
          <div className="landing-phone">
            <div className="landing-phone-notch"/>
            <div className="landing-cover"/>
            <div className="landing-avatar">N</div>
            <b>Nome da empresa</b><small>Seu negócio. Sua identidade.</small>
            <div className="landing-actions"><span>◉ <b>WhatsApp</b><i>↗</i></span><span>◎ <b>Instagram</b><i>↗</i></span><span>★ <b>Avalie no Google</b><i>↗</i></span><span>PIX <b>Pagamento</b><i>↗</i></span></div>
            <div className="landing-phone-footer">NFC SMART · TOQUE, ABRA, CONECTE</div>
          </div>
          <div className="landing-floating-card"><span><Fingerprint size={17}/></span><div><b>Uma página. Muitas possibilidades.</b><small>Atualize sem regravar sua TAG.</small></div></div>
        </div>
      </section>
      <section className="landing-benefits">
        <div><span><Globe2 size={19}/></span><b>Perfil profissional</b><p>Apresente sua empresa com identidade visual própria.</p></div>
        <div><span><MousePointerClick size={19}/></span><b>Ações personalizadas</b><p>Facilite o contato, o pagamento e a localização.</p></div>
        <div><span><ShieldCheck size={19}/></span><b>Controle em um painel</b><p>Edite seu perfil e acompanhe as interações.</p></div>
      </section>
      <section className="landing-bottom"><div><Sparkles size={18}/><span>Seu próximo contato pode começar agora.</span></div><Link href="/solicitar-acesso" className="premium-btn premium-btn-dark">Começar com NFC Smart <ArrowRight size={15}/></Link></section>
    </main>
  );
}