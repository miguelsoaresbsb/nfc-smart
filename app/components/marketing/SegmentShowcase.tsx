"use client";
import { useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { ArrowRight, Check, Globe2, MapPin, MessageCircle, Scissors, ShoppingBag, Utensils, UserRound, Wrench } from "lucide-react";
import { segmentTemplates, type SegmentId } from "@/lib/segment-templates";
const examples: Record<SegmentId, { shortName: string; intro: string; place: string; benefit: string }> = {
  restaurant: { shortName: "Restaurantes", intro: "Do cardápio ao próximo pedido.", place: "No balcão ou na mesa", benefit: "Ofereça um caminho simples para consultar o cardápio, pedir e encontrar seu restaurante." },
  salon: { shortName: "Beleza", intro: "Seu próximo atendimento começa aqui.", place: "Na recepção do salão", benefit: "Apresente seu trabalho e facilite o contato para novos agendamentos." },
  workshop: { shortName: "Oficinas", intro: "Atendimento que segue com o cliente.", place: "No balcão da oficina", benefit: "Deixe orçamento, localização e seus serviços fáceis de encontrar depois da visita." },
  retail: { shortName: "Lojas", intro: "Da visita à próxima escolha.", place: "No caixa da sua loja", benefit: "Reúna catálogo, novidades e atendimento para continuar a conversa com o cliente." },
  professional: { shortName: "Profissionais", intro: "Seu trabalho, sempre à mão.", place: "No seu espaço de atendimento", benefit: "Organize seus serviços, portfólio e canais de contato em uma apresentação profissional." },
};
const icons = [Utensils, Scissors, Wrench, ShoppingBag, UserRound];
export default function SegmentShowcase() {
  const [selected, setSelected] = useState<SegmentId>("restaurant");
  const [activeAction, setActiveAction] = useState<number | null>(null);
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const template = segmentTemplates.find(item => item.id === selected)!;
  const example = examples[selected];
  const selectedIndex = segmentTemplates.findIndex(item => item.id === selected);
  const detail = activeAction === null ? null : template.suggestedActions[activeAction];
  function choose(index: number, focus = false) { setSelected(segmentTemplates[index].id); setActiveAction(null); if (focus) refs.current[index]?.focus(); }
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let next: number | null = null;
    if (event.key === "ArrowRight") next = (index + 1) % segmentTemplates.length;
    if (event.key === "ArrowLeft") next = (index + segmentTemplates.length - 1) % segmentTemplates.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = segmentTemplates.length - 1;
    if (next !== null) { event.preventDefault(); choose(next, true); }
  }
  return <div className="segment-showcase">
    <div className="segment-tabs" role="tablist" aria-label="Modelos por segmento">{segmentTemplates.map((item, index) => { const Icon = icons[index]; return <button key={item.id} id={"segment-tab-" + item.id} type="button" role="tab" aria-selected={selected === item.id} aria-controls="segment-example-panel" tabIndex={selected === item.id ? 0 : -1} ref={node => { refs.current[index] = node; }} onClick={() => choose(index)} onKeyDown={event => navigate(event, index)}><Icon size={18}/><span>{examples[item.id].shortName}</span></button>; })}</div>
    <div className="segment-example-panel" id="segment-example-panel" role="tabpanel" aria-labelledby={"segment-tab-" + selected} tabIndex={0} style={{ "--segment-bg": template.colors.bg, "--segment-primary": template.colors.primary, "--segment-text": template.colors.text, "--segment-secondary": template.colors.secondary, "--segment-button-text": template.colors.buttonText } as CSSProperties}>
      <div className="segment-example-copy"><span className="segment-example-number">MODELO {String(selectedIndex + 1).padStart(2, "0")} / 05</span><h3>{template.name}</h3><p className="segment-example-intro">{example.intro}</p><p>{example.benefit}</p><ul><li><Check size={16}/> Cores e apresentação como ponto de partida</li><li><Check size={16}/> Sugestões de botões para o segmento</li><li><Check size={16}/> Seus dados reais configurados no editor</li></ul><span className="segment-example-place"><MapPin size={17}/>{example.place}</span><p className="segment-disclaimer">Demonstração ilustrativa. Este exemplo não envia mensagens nem realiza pagamentos.</p></div>
      <div className="segment-demo-wrap"><span className="segment-preview-caption">TOQUE NOS BOTÕES PARA EXPLORAR</span><div className="segment-demo-phone"><div className="segment-demo-notch"/><div className="segment-demo-cover"><span>{examples[selected].shortName}</span></div><div className="segment-demo-avatar">{selected === "professional" ? <UserRound size={24}/> : <Globe2 size={24}/>}</div><h4>Sua empresa</h4><p>{template.summary}</p><div className="segment-demo-actions">{template.suggestedActions.slice(0, 4).map((action, index) => <button key={action.type} type="button" aria-pressed={activeAction === index} onClick={() => setActiveAction(index)}><span>{action.type === "whatsapp" ? <MessageCircle size={16}/> : action.type === "maps" ? <MapPin size={16}/> : <Globe2 size={16}/>}</span><b>{action.label}</b><ArrowRight size={14}/></button>)}</div><div className="segment-action-explanation" role="status" aria-live="polite">{detail ? <><b>{detail.label}</b><span>{detail.hint} O destino é definido por você no painel.</span></> : <><b>Experimente um botão</b><span>Veja o que você pode configurar para o cliente.</span></>}</div><small>NFC SMART · EXEMPLO ILUSTRATIVO</small></div></div>
    </div>
  </div>;
}
