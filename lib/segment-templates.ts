export type SegmentId = "restaurant" | "salon" | "workshop" | "retail" | "professional";
export type SegmentColors = { bg: string; primary: string; text: string; secondary: string; buttonText: string };
export type TemplateActionSuggestion = { type: string; label: string; hint: string; placeholder: string };
export type SegmentTemplate = {
  id: SegmentId;
  name: string;
  summary: string;
  description: string;
  colors: SegmentColors;
  suggestedActions: TemplateActionSuggestion[];
};

// Suggested actions deliberately contain no destination: the owner supplies
// the real contact/link/payment details in the one existing action editor.
export const segmentTemplates: SegmentTemplate[] = [
  {
    id: "restaurant", name: "Restaurante e delivery", summary: "Cardápio, pedidos e como chegar.",
    description: "Seu próximo sabor favorito começa aqui. Confira nosso cardápio, faça seu pedido e venha nos visitar.",
    colors: { bg: "#FFF8F0", primary: "#A63724", text: "#35241D", secondary: "#735E53", buttonText: "#FFFFFF" },
    suggestedActions: [
      { type: "website", label: "Ver cardápio", hint: "Link do seu cardápio digital.", placeholder: "https://seu-cardapio.com.br" },
      { type: "whatsapp", label: "Fazer um pedido", hint: "WhatsApp que recebe os pedidos.", placeholder: "(61) 99999-9999" },
      { type: "maps", label: "Como chegar", hint: "Link da localização no mapa.", placeholder: "https://maps.google.com/..." },
      { type: "google", label: "Avalie sua experiência", hint: "Link de avaliação da sua empresa no Google.", placeholder: "https://g.page/r/.../review" },
      { type: "wifi", label: "Conectar ao Wi-Fi", hint: "Dados da rede oferecida aos clientes.", placeholder: "Nome da sua rede" },
    ],
  },
  {
    id: "salon", name: "Salão e beleza", summary: "Agendamentos, portfólio e avaliações.",
    description: "Um momento de cuidado pensado para você. Conheça nosso trabalho e agende seu próximo atendimento.",
    colors: { bg: "#FBF5F7", primary: "#863F60", text: "#372633", secondary: "#786371", buttonText: "#FFFFFF" },
    suggestedActions: [
      { type: "whatsapp", label: "Agendar meu horário", hint: "WhatsApp para agendamentos.", placeholder: "(61) 99999-9999" },
      { type: "instagram", label: "Conheça nosso trabalho", hint: "Perfil profissional no Instagram.", placeholder: "@seusalao" },
      { type: "maps", label: "Como chegar", hint: "Link da localização do salão.", placeholder: "https://maps.google.com/..." },
      { type: "google", label: "Avalie seu atendimento", hint: "Link de avaliações no Google.", placeholder: "https://g.page/r/.../review" },
      { type: "pix", label: "Pagar com PIX", hint: "Sua chave ou QR Code de pagamento.", placeholder: "Sua chave PIX" },
    ],
  },
  {
    id: "workshop", name: "Oficina e serviços automotivos", summary: "Orçamentos, atendimento e localização.",
    description: "Cuidado e confiança para o seu veículo. Fale com nossa equipe, solicite um orçamento e encontre nossa oficina.",
    colors: { bg: "#F0F4F8", primary: "#24527D", text: "#1B2C3D", secondary: "#536779", buttonText: "#FFFFFF" },
    suggestedActions: [
      { type: "whatsapp", label: "Solicitar orçamento", hint: "WhatsApp da equipe de atendimento.", placeholder: "(61) 99999-9999" },
      { type: "maps", label: "Encontrar a oficina", hint: "Link da localização da oficina.", placeholder: "https://maps.google.com/..." },
      { type: "instagram", label: "Veja nossos serviços", hint: "Perfil com os serviços realizados.", placeholder: "@suaoficina" },
      { type: "google", label: "Avalie nosso serviço", hint: "Link de avaliações no Google.", placeholder: "https://g.page/r/.../review" },
    ],
  },
  {
    id: "retail", name: "Loja e comércio", summary: "Catálogo, novidades e contato.",
    description: "Novidades e escolhas especiais para você. Explore nossos produtos, tire suas dúvidas e acompanhe nossas ofertas.",
    colors: { bg: "#F3F7F2", primary: "#356447", text: "#24372B", secondary: "#5D7163", buttonText: "#FFFFFF" },
    suggestedActions: [
      { type: "website", label: "Explorar produtos", hint: "Link da loja ou do catálogo digital.", placeholder: "https://sualoja.com.br" },
      { type: "whatsapp", label: "Falar com a loja", hint: "WhatsApp de atendimento.", placeholder: "(61) 99999-9999" },
      { type: "instagram", label: "Novidades no Instagram", hint: "Perfil da loja no Instagram.", placeholder: "@sualoja" },
      { type: "maps", label: "Visite nossa loja", hint: "Link do endereço no mapa.", placeholder: "https://maps.google.com/..." },
      { type: "pix", label: "Pagar com PIX", hint: "Sua chave ou QR Code de pagamento.", placeholder: "Sua chave PIX" },
    ],
  },
  {
    id: "professional", name: "Profissional autônomo", summary: "Serviços, portfólio e novos contatos.",
    description: "Soluções com atenção aos detalhes e atendimento próximo. Conheça meu trabalho e vamos conversar sobre o que você precisa.",
    colors: { bg: "#F5F4FB", primary: "#5B458D", text: "#302B45", secondary: "#6B6381", buttonText: "#FFFFFF" },
    suggestedActions: [
      { type: "whatsapp", label: "Vamos conversar", hint: "WhatsApp para novos atendimentos.", placeholder: "(61) 99999-9999" },
      { type: "website", label: "Conheça meu trabalho", hint: "Link do seu site ou portfólio.", placeholder: "https://seuportfolio.com.br" },
      { type: "instagram", label: "Acompanhe meu perfil", hint: "Seu perfil profissional no Instagram.", placeholder: "@seuperfil" },
      { type: "google", label: "Avalie meu atendimento", hint: "Link das suas avaliações no Google.", placeholder: "https://g.page/r/.../review" },
    ],
  },
];

export function getSegmentTemplate(id: string | null | undefined): SegmentTemplate | undefined {
  return segmentTemplates.find(template => template.id === id);
}

export function missingTemplateActions(
  template: SegmentTemplate,
  existingActions: ReadonlyArray<{ type: string }>,
  contacts: { whatsapp?: string | null; whatsappEnabled?: boolean; phone?: string | null; phoneEnabled?: boolean } = {},
): TemplateActionSuggestion[] {
  const configured = new Set(existingActions.map(action => action.type));
  if (contacts.whatsapp?.trim() && contacts.whatsappEnabled !== false) configured.add("whatsapp");
  if (contacts.phone?.trim() && contacts.phoneEnabled !== false) configured.add("phone");
  return template.suggestedActions.filter(suggestion => !configured.has(suggestion.type));
}

export function applySegmentDraft<T extends { description: string }>(
  current: T, template: SegmentTemplate, replaceDescription = false,
): T & SegmentColors {
  return {
    ...current,
    ...template.colors,
    description: replaceDescription || !current.description.trim() ? template.description : current.description,
  };
}
