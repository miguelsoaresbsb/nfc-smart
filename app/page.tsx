import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowRight, Check, ChevronDown, CircleCheck, Fingerprint, Globe2, MapPin, MessageCircle, MousePointerClick, RefreshCw, Smartphone, Wifi } from "lucide-react";
import { formatBRL, MONTHLY_PRICE_CENTS, NFC_TAG_PRICE_CENTS } from "@/lib/commerce";
import SegmentShowcase from "./components/marketing/SegmentShowcase";
import "./marketing.css";
import "./landing-segments.css";

export const metadata: Metadata = {
  title: { absolute: "NFC SMART | Sua empresa, a um toque de distância" },
  description: "Conecte sua plaquinha NFC a uma página com contatos, redes sociais, localização e PIX. Conheça os modelos, os valores e as etapas de ativação.",
  alternates: { canonical: "https://nfc-smart-one.vercel.app" },
};
const benefits = [
  { icon: MessageCircle, title: "Facilite o próximo contato", text: "WhatsApp, telefone, redes sociais e localização no mesmo lugar. O cliente escolhe o que precisa." },
  { icon: RefreshCw, title: "Atualize no seu tempo", text: "Mude informações, imagens e botões no painel. Mantenha o endereço já gravado na sua plaquinha." },
  { icon: MousePointerClick, title: "Entenda as interações", text: "Acompanhe acessos e cliques para saber quais caminhos da sua página recebem mais atenção." },
];
const steps = [
  { number: "01", title: "Solicite seu cadastro", text: "Informe os dados da empresa e confirme seu e-mail. Você acompanha a análise pela sua conta.", detail: "Cadastro sem cobrança" },
  { number: "02", title: "Ative após a aprovação", text: "Com a empresa aprovada, acesse Assinatura e faça o pagamento mensal pelo checkout da Cakto.", detail: "Use o mesmo e-mail da conta" },
  { number: "03", title: "Personalize e compartilhe", text: "Após a confirmação do pagamento, configure sua página, gere o QR Code e use o link na plaquinha NFC.", detail: "Recursos liberados com assinatura ativa" },
];
const questions = [
  { question: "O cliente precisa instalar um aplicativo?", answer: "Não. A página abre no navegador do celular. Para usar a aproximação, o aparelho precisa ser compatível com NFC e estar com a função disponível. O QR Code oferece outra maneira de abrir a página. É necessária conexão com a internet." },
  { question: "O que os valores incluem?", answer: `A plaquinha física NFC personalizada custa ${formatBRL(NFC_TAG_PRICE_CENTS)}, em pagamento único, combinado e cobrado separadamente. A plataforma digital custa ${formatBRL(MONTHLY_PRICE_CENTS)} por mês e inclui a página, o painel de edição, a hospedagem e os recursos apresentados. Produção, entrega e eventuais custos de envio da plaquinha são combinados na contratação física.` },
  { question: "Quando minha página fica disponível?", answer: "Primeiro você confirma seu e-mail e aguarda a aprovação da empresa. Depois, contrata a assinatura no painel. A confirmação do pagamento libera a edição e a página pública. A plaquinha física é contratada separadamente." },
  { question: "Posso editar a página depois de gravar a plaquinha?", answer: "Sim. Ao manter o mesmo endereço público na plaquinha, as alterações salvas no painel aparecem na página sem precisar regravar a TAG. Você pode atualizar seus dados, imagens e botões enquanto a assinatura estiver ativa." },
  { question: "Os modelos já vêm com os dados do meu negócio?", answer: "Os modelos sugerem cores, apresentação e tipos de botão para cada segmento. Você configura seus contatos, links, imagens e dados reais. Nenhuma chave PIX, conta bancária ou contato de exemplo é usado como destino de pagamento." },
  { question: "O que acontece se a assinatura vencer ou eu cancelar?", answer: "O cancelamento interrompe as próximas cobranças. O acesso permanece até o fim do período já pago. Sem uma assinatura ativa e válida, a edição e a página pública ficam indisponíveis. A situação da assinatura pode ser consultada no painel." },
];
export default function Home() {
  return <div className="marketing-page">
    <a className="site-skip-link" href="#main-content">Pular para o conteúdo</a>
    <header className="marketing-header"><div className="marketing-header-inner">
      <Link href="/" className="marketing-brand" aria-label="NFC SMART, início"><span><Wifi size={20}/></span><b>NFC<span>SMART</span></b></Link>
      <nav className="marketing-nav" aria-label="Navegação principal"><a href="#modelos">Modelos</a><a href="#como-funciona">Como funciona</a><a href="#plano">Valores</a><a href="#duvidas">Dúvidas</a></nav>
      <Link href="/login" className="marketing-login">Entrar no painel <ArrowRight size={15}/></Link>
    </div></header>
    <main id="main-content" tabIndex={-1}>
      <section className="marketing-hero marketing-wrap" aria-labelledby="hero-heading">
        <div className="marketing-hero-copy"><span className="marketing-eyebrow"><i/> CONEXÕES QUE COMEÇAM NO SEU BALCÃO</span>
          <h1 id="hero-heading">Seu negócio,<br/>a um <em>toque</em><br/>de distância.</h1>
          <p>Transforme sua plaquinha NFC em uma porta de entrada para a sua empresa. Contatos, redes sociais, localização e PIX em uma página fácil de atualizar.</p>
          <div className="marketing-hero-actions"><Link href="/solicitar-acesso" className="marketing-button marketing-button-dark">Solicitar cadastro <ArrowRight size={18}/></Link><a href="#modelos" className="marketing-button marketing-button-quiet">Explorar os modelos <ArrowDown size={16}/></a></div>
          <p className="marketing-hero-note">Confirme seu e-mail, aguarde a aprovação e ative sua assinatura pelo painel.</p>
          <ul className="marketing-proof"><li><Check size={15}/> Link permanente</li><li><Check size={15}/> Edição pelo celular</li><li><Check size={15}/> NFC + QR Code</li></ul>
        </div>
        <figure className="marketing-product">
          <div className="marketing-product-topline"><span>DO FÍSICO AO DIGITAL</span><span><i/> NFC SMART</span></div>
          <div className="marketing-product-stage">
            <div className="marketing-product-orbit" aria-hidden="true"/>
            <div className="marketing-plaque" aria-label="Ilustração de uma plaquinha NFC para balcão">
              <div className="marketing-plaque-logo"><Wifi size={21}/><b>NFC<span>SMART</span></b></div><div className="marketing-plaque-title">Um toque.<br/>Novas conexões.</div>
              <div className="marketing-plaque-nfc"><Fingerprint size={37} strokeWidth={1.2}/><span>APROXIME<br/>SEU CELULAR</span></div>
              <div className="marketing-plaque-qr"><img src="/marketing/nfc-smart-demo-qr.svg" width={74} height={74} alt="QR Code de demonstração que abre o site NFC SMART"/><span>Ou abra<br/>pela câmera <ArrowRight size={13}/></span></div>
              <div className="marketing-plaque-foot">SUA EMPRESA. SEMPRE POR PERTO.</div>
            </div>
            <div className="marketing-hero-phone" aria-label="Exemplo ilustrativo da página vista pelo cliente"><div className="marketing-phone-notch"/><div className="marketing-phone-cover"><i/><i/><i/></div><div className="marketing-phone-avatar">N</div><b>Seu negócio</b><small>Tudo o que conecta você ao cliente.</small>
              <div className="marketing-phone-links"><span><MessageCircle size={17}/><b>Fale com a gente</b><ArrowRight size={13}/></span><span><Globe2 size={17}/><b>Conheça nosso trabalho</b><ArrowRight size={13}/></span><span><MapPin size={17}/><b>Como chegar</b><ArrowRight size={13}/></span></div><div className="marketing-phone-signature">NFC SMART</div>
            </div>
            <div className="marketing-tap-note"><span><Smartphone size={17}/></span>Toque, abra, conecte.</div>
          </div><figcaption>Visualização ilustrativa da plaquinha e da página. O QR Code acima abre este site.</figcaption>
        </figure>
      </section>
      <section className="marketing-benefits marketing-wrap" aria-label="O que você pode fazer">{benefits.map(({ icon: Icon, title, text }) => <article key={title}><span><Icon size={22}/></span><h2>{title}</h2><p>{text}</p></article>)}</section>
      <section className="marketing-segments-section marketing-wrap" id="modelos" aria-labelledby="segment-heading"><div className="marketing-section-heading"><div><span className="marketing-eyebrow">UM PONTO DE PARTIDA PARA CADA NEGÓCIO</span><h2 id="segment-heading">Seu segmento.<br/><span>A sua identidade.</span></h2></div><p>Experimente os modelos abaixo e veja como a página pode organizar os caminhos mais importantes para o seu cliente.</p></div><SegmentShowcase/></section>
      <section className="marketing-how" id="como-funciona" aria-labelledby="how-heading"><div className="marketing-wrap"><div className="marketing-section-heading"><div><span className="marketing-eyebrow">DO CADASTRO À PÁGINA ATIVA</span><h2 id="how-heading">Um caminho claro<br/><span>para começar.</span></h2></div><p>Você acompanha cada etapa na sua conta. O cadastro inicia a solicitação; os recursos são liberados após aprovação e pagamento.</p></div><ol className="marketing-steps">{steps.map(step => <li key={step.number}><span className="marketing-step-number">{step.number}</span><h3>{step.title}</h3><p>{step.text}</p><span className="marketing-step-detail"><CircleCheck size={15}/>{step.detail}</span></li>)}</ol></div></section>
      <section className="marketing-pricing marketing-wrap" id="plano" aria-labelledby="pricing-heading"><div className="marketing-pricing-copy"><span className="marketing-eyebrow">VALORES SEM CONFUSÃO</span><h2 id="pricing-heading">Uma presença física.<br/><span>Uma página que evolui.</span></h2><p>A plaquinha apresenta o caminho. A assinatura mantém sua página disponível e permite atualizar o conteúdo pelo painel.</p><div className="marketing-physical-price"><span><Fingerprint size={22}/></span><div><h3>Plaquinha NFC personalizada</h3><b>{formatBRL(NFC_TAG_PRICE_CENTS)} <small>· pagamento único</small></b><p>Contratação e cobrança separadas da assinatura. Produção, entrega e envio combinados na contratação física.</p></div></div></div>
        <article className="marketing-plan"><div className="marketing-plan-top"><span>PLATAFORMA DIGITAL</span><span>Plano mensal</span></div><p className="marketing-plan-price"><strong>{formatBRL(MONTHLY_PRICE_CENTS)}</strong><span>/ mês</span></p><p className="marketing-plan-description">A estrutura digital para manter o seu negócio a um toque do cliente.</p><ul><li><Check size={17}/> Página pública com sua identidade</li><li><Check size={17}/> Editor de dados, imagens e cores</li><li><Check size={17}/> Modelos para cinco segmentos</li><li><Check size={17}/> Contatos, redes sociais, localização e PIX</li><li><Check size={17}/> Geração e biblioteca de QR Codes</li><li><Check size={17}/> Relatórios de acessos e interações</li><li><Check size={17}/> Hospedagem e manutenção da plataforma</li></ul><Link href="/solicitar-acesso" className="marketing-button marketing-button-light">Solicitar cadastro <ArrowRight size={18}/></Link><p className="marketing-plan-note">Após a aprovação da empresa, você contrata pelo painel. Mensalidade processada pela Cakto.</p></article>
      </section>
      <section className="marketing-faq marketing-wrap" id="duvidas" aria-labelledby="faq-heading"><div className="marketing-section-heading"><div><span className="marketing-eyebrow">ANTES DO PRIMEIRO TOQUE</span><h2 id="faq-heading">Dúvidas frequentes.</h2></div><p>Entenda o funcionamento da plaquinha, da página e da assinatura antes de solicitar seu cadastro.</p></div><div className="marketing-faq-list">{questions.map(item => <details key={item.question}><summary>{item.question}<ChevronDown size={19}/></summary><p>{item.answer}</p></details>)}</div></section>
    </main>
    <footer className="marketing-footer"><div className="marketing-wrap"><Link href="/" className="marketing-brand" aria-label="NFC SMART, início"><span><Wifi size={19}/></span><b>NFC<span>SMART</span></b></Link><p>O próximo contato começa com um toque.</p><a href="#main-content">Voltar ao início <ArrowRight size={14}/></a></div></footer>
  </div>;
}
