# NFC SMART — experiência móvel e página de vendas

Entrega de 11 de novembro de 2026. Site: https://nfc-smart-one.vercel.app

## Experiência no celular

- Campos de texto e seletores com fonte de pelo menos 16px, sem bloquear o zoom do navegador. Os campos de autenticação têm 52px de altura.
- Controles de fechar, copiar, ordenar e navegar com área de toque de pelo menos 44px. Os botões de fechar PIX e Wi-Fi têm 48px.
- Navegação inferior para as cinco áreas do cliente com assinatura. Assinatura e saída ficam nas opções da conta; clientes sem assinatura veem apenas o início e a assinatura.
- No rodapé móvel, a área de compartilhamento aparece como “Link e QR”, evitando quebrar uma palavra longa em telas estreitas. O destino e o nome acessível continuam sendo Compartilhar.
- Mostrar/ocultar senha com rótulo acessível, suporte a preenchimento automático e preservação do que já foi digitado.
- Erros em português com foco de teclado, indicação de carregamento e liberação do botão para tentar novamente. Falhas de conexão preservam os campos preenchidos.
- Atalhos nativos para pular a navegação, foco visível e respeito à preferência por movimento reduzido.
- Aviso antes de abandonar alterações não salvas no editor, inclusive na navegação interna. A prévia não interrompe o trabalho com uma confirmação desnecessária.
- Botões da página pública em uma coluna nos celulares estreitos, com rótulos legíveis e cores da empresa preservadas.
- Modais PIX e Wi-Fi com instruções claras, fechamento por Escape, contenção e restauração do foco. Se a cópia automática do PIX falhar, o código fica disponível num campo selecionável.
- Tela de assinatura com situação, período pago, explicação do vencimento e um botão para copiar o e-mail correto do pagamento. A consulta pode ser atualizada sem iniciar outra contratação.
- Contagem do painel alinhada aos destinos válidos e únicos que aparecem na página pública.

## Página de vendas

- Nova apresentação visual da plaquinha e de sua relação com a página digital.
- Demonstração interativa dos cinco modelos existentes: restaurante, beleza, oficina, loja e profissional autônomo. As abas funcionam por toque e teclado.
- Botões demonstrativos explicam o que será configurado, sem enviar mensagens ou realizar pagamentos.
- Caminho comercial explícito: cadastro e confirmação de e-mail, aprovação da empresa, pagamento no painel e liberação dos recursos.
- Uma chamada de ação consistente: solicitar cadastro. A página de vendas não encaminha um cliente ainda não aprovado diretamente ao checkout.
- Valores existentes apresentados separadamente: plaquinha física por R$ 80,00, pagamento único; plataforma por R$ 29,90 ao mês. Preços de exibição centralizados para evitar divergências entre a página pública e a assinatura.
- Produção, entrega e eventual envio da plaquinha são tratados na contratação física. O checkout do painel corresponde à mensalidade.
- Perguntas frequentes acessíveis sobre NFC, QR Code, compatibilidade, modelos, edição, pagamento e cancelamento.
- Ícone da marca e imagem de compartilhamento. Links das páginas de empresas usam o nome, a descrição e a logo da própria empresa.

## Verificação

- Build de produção com TypeScript e a suíte de 48 testes automatizados.
- Revisão de dependências de produção com `npm audit --omit=dev`.
- Testes de navegador em 320, 390, 768 e 1440px: leitura, controles, formulários, movimento reduzido, largura, modais e erros de JavaScript/CSP.
- Testes interativos de modelos, FAQ, atalhos de teclado, senha visível e falhas de conexão com as solicitações de autenticação interceptadas antes da rede.
- Testes de interface do painel com dados simulados numa rota exclusivamente local: validação, foco, edição não salva, deduplicação, permissões de leitura, navegação e assinatura. Nenhuma conta real foi usada para esses testes.
- Resultado no navegador: 36 grupos de páginas e modais, 11 de interações e 17 do painel com respostas simuladas; todos passaram na versão compilada, sem substituições de DOM. O fallback de cópia manual do PIX também passou com a permissão da área de transferência negada.
- A rota temporária de testes é removida antes do build de publicação. Ela não integra a versão entregue.
- Nova verificação da versão publicada e consulta dos logs após a publicação.

## Escopo e limites

As regras de confirmação de e-mail, aprovação, assinatura e cobrança permanecem verificadas no servidor e no banco. Esta entrega melhora as interfaces; uma demonstração visual não concede acesso aos recursos pagos.

As imagens da plaquinha são ilustrações identificadas. Não havia fotografias reais do produto disponíveis no projeto, e não foram inventados depoimentos, números de clientes ou endossos.

Esta rodada não inclui uma compra real, emissão de uma plaquinha física ou alteração de planos pagos de terceiros. O recurso de bloqueio de senhas vazadas do Supabase continua dependendo do plano Pro. Não foi contratado nenhum serviço adicional.
