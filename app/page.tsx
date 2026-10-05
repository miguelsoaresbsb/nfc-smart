import Link from "next/link";
import { ArrowRight, Check, ChevronRight, Copy, Fingerprint, Globe2, MousePointer2, Palette, QrCode, Smartphone, Sparkles, Wifi } from "lucide-react";

const features = [
  { icon: Palette, title: "Personalização total", text: "Cores, logo, capa, botões e conteúdo do seu jeito." },
  { icon: Smartphone, title: "Feito para celular", text: "Uma experiência rápida e elegante para quem aproxima a TAG." },
  { icon: QrCode, title: "QR Code próprio", text: "Envie seu QR Code e coloque na página sem gerar outro." },
  { icon: Fingerprint, title: "Uma URL permanente", text: "O endereço da TAG continua o mesmo mesmo quando você edita." },
];

const steps = [
  ["01", "Cadastre sua empresa", "Configure sua identidade e os dados do negócio."],
  ["02", "Monte sua página", "Adicione ações, imagens, QR Codes e personalize o visual."],
  ["03", "Aproxime e conecte", "O cliente toca na TAG e abre sua página na hora."],
];

export default function Home() {
  return (
    <main className="home">
      <div className="home-noise" />
      <div className="home-orb home-orb-one" />
      <div className="home-orb home-orb-two" />

      <nav className="home-nav">
        <Link href="/" className="brand">
          <span className="brand-mark"><Wifi size={17} /></span>
          <span>NFC<span>SMART</span></span>
        </Link>
        <div className="home-nav-links">
          <a href="#recursos">Recursos</a>
          <a href="#como-funciona">Como funciona</a>
        </div>
        <Link href="/login" className="nav-login">Entrar <ArrowRight size={16} /></Link>
      </nav>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-dot" /> SUA MARCA. UM TOQUE.</div>
          <h1>Transforme uma <em>aproximação</em> em uma experiência digital.</h1>
          <p className="hero-text">Crie uma página exclusiva para sua TAG NFC, apresente seus links, redes sociais, avaliações, PIX e QR Codes em um só lugar.</p>
          <div className="hero-actions">
            <Link href="/login" className="hero-primary">Começar agora <ArrowRight size={18} /></Link>
            <a href="#como-funciona" className="hero-secondary">Ver como funciona <ChevronRight size={17} /></a>
          </div>
          <div className="hero-proof">
            <div className="proof-item"><Check size={15} /> URL permanente</div>
            <div className="proof-item"><Check size={15} /> Edição online</div>
            <div className="proof-item"><Check size={15} /> Sem trocar a TAG</div>
          </div>
        </div>

        <div className="hero-visual" aria-label="Demonstração visual da TAG NFC Smart">
          <div className="visual-glow" />
          <div className="signal signal-a" />
          <div className="signal signal-b" />
          <div className="signal signal-c" />
          <div className="nfc-tag">
            <div className="tag-shine" />
            <div className="tag-logo"><Wifi size={22} /></div>
            <div className="tag-title">NFC SMART</div>
            <div className="tag-subtitle">TOQUE PARA CONECTAR</div>
            <div className="tag-wave"><span /><span /><span /><span /></div>
          </div>

          <div className="floating-card card-url"><Globe2 size={16} /><span>nfcsmart.com/p/suaempresa</span><Copy size={14} /></div>
          <div className="floating-card card-touch"><MousePointer2 size={16} /><span>Toque detectado</span><strong>+1</strong></div>

          <div className="phone-art">
            <div className="phone-camera" />
            <div className="phone-screen-art">
              <div className="art-cover" />
              <div className="art-avatar">NS</div>
              <strong>Sua empresa</strong>
              <small>Uma página. Tudo o que importa.</small>
              <div className="art-button active">Google Avaliações <ArrowRight size={13} /></div>
              <div className="art-button">WhatsApp <ArrowRight size={13} /></div>
              <div className="art-button">Instagram <ArrowRight size={13} /></div>
              <div className="art-qr"><QrCode size={37} /></div>
            </div>
          </div>
        </div>
      </section>

      <section className="metrics">
        <div><strong>01</strong><span>URL fixa para sua TAG</span></div>
        <div><strong>24/7</strong><span>Sua página sempre disponível</span></div>
        <div><strong>∞</strong><span>Edite sem regravar a TAG</span></div>
      </section>

      <section id="recursos" className="feature-section">
        <div className="section-kicker">POR QUE NFC SMART?</div>
        <h2>Uma página digital que acompanha<br /><span>o seu negócio.</span></h2>
        <div className="feature-grid">
          {features.map(({ icon: Icon, title, text }) => (
            <article className="feature-card" key={title}>
              <div className="feature-icon"><Icon size={20} /></div>
              <h3>{title}</h3>
              <p>{text}</p>
              <div className="feature-line" />
            </article>
          ))}
        </div>
      </section>

      <section id="como-funciona" className="steps-section">
        <div className="steps-intro">
          <div className="section-kicker">COMO FUNCIONA</div>
          <h2>Do toque à sua marca<br /><span>em poucos segundos.</span></h2>
          <p>Você configura uma vez. Depois, pode alterar sua página quando quiser sem precisar reprogramar a TAG NFC.</p>
        </div>
        <div className="steps-list">
          {steps.map(([number, title, text]) => (
            <div className="step" key={number}>
              <span>{number}</span>
              <div><h3>{title}</h3><p>{text}</p></div>
              <ArrowRight size={18} />
            </div>
          ))}
        </div>
      </section>

      <section className="cta-section">
        <Sparkles size={20} />
        <h2>Sua TAG merece mais<br />que um link.</h2>
        <p>Crie uma experiência digital com a cara da sua empresa.</p>
        <Link href="/login" className="hero-primary">Acessar NFC Smart <ArrowRight size={18} /></Link>
      </section>

      <footer className="home-footer">
        <div className="brand"><span className="brand-mark"><Wifi size={15} /></span><span>NFC<span>SMART</span></span></div>
        <span>© 2026 NFC Smart</span>
      </footer>
    </main>
  );
}
