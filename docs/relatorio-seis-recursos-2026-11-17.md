# NFC SMART — atualização de 17/11/2026

## Entregas

1. **Alertas de cobrança:** central administrativa com falhas de processamento, ativação e renovação, filtros e marcação de leitura. O banco confere as condições a cada cinco minutos. Marcar como visto não libera acesso e não apaga a causa. Somente falhas autenticadas do produto configurado entram no monitoramento; corpo do webhook, identidade do comprador, segredos e assinaturas não são gravados nos alertas.
2. **Histórico de conteúdo:** até 30 versões por empresa, em Minha página, incluindo apresentação e botões. A restauração preserva o estado anterior e recusa conflitos de outra aba. Não altera URL, assinatura, aprovação, membros ou permissões. Imagens excluídas não são recuperadas; referências a QR Codes excluídos são removidas com aviso.
3. **Controle de plaquinhas:** cadastro com serial gerado no servidor, vínculo com empresa, personalização, produção, entrega e ativação física. Há arquivamento e registro interno das mudanças. O vínculo fica fixo após o início da produção. O cliente acompanha em Assinatura, inclusive antes da mensalidade. Ativar a peça não concede licença nem grava a TAG automaticamente.
4. **Segunda etapa administrativa:** TOTP obrigatório para operações administrativas, com verificação da assinatura do token, sessão viva, nível AAL2 e fator TOTP confirmado do mesmo usuário. O cadastro inicial fica em `/seguranca-admin`. Há suporte a autenticador de reserva; redefinir a senha não remove o MFA.
5. **Material em PDF:** download A4 em Compartilhar, com nome da empresa, endereço permanente e QR vetorial. O endpoint valida usuário confirmado, aprovação, vínculo e assinatura ativa com vencimento futuro. Não aceita escolher outra empresa ou endereço pela URL. Fontes cobrem português; caracteres fora WinAnsi, como emojis, são substituídos.
6. **Funil administrativo:** cadastro, confirmação de e-mail, aprovação, pagamento comprovado no ledger da Cakto e página pronta. Os períodos usam a data de cadastro da conta. Cada etapa exige a anterior; acessos legados sem comprovante aparecem separados. Página pronta não comprova visita, leitura NFC ou nova venda.

## Segurança e continuidade

- O Supabase estava pausado e foi reativado no mesmo projeto.
- Next.js atualizado de 16.4.4 para 16.4.6 para corrigir o aviso [GHSA-mfr8-8qww-v76h](https://github.com/advisories/GHSA-mfr8-8qww-v76h). Auditoria de dependências sem vulnerabilidades conhecidas na verificação desta entrega.
- Todas as tabelas públicas têm RLS. Notas e auditoria das plaquinhas ficam em esquema privado, sem permissões diretas para clientes. As duas informações do advisor sobre RLS sem políticas nessas tabelas refletem bloqueio por padrão; o acesso ocorre apenas pelas funções administrativas protegidas.
- O advisor ainda informa [proteção contra senhas vazadas desativada](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), recurso indisponível no plano Free atual. Não foi contratado plano pago.
- Corrigidos dois campos com fonte pequena no celular e uma possibilidade de troca de filtro durante a marcação de um alerta.
- Preços preservados: plaquinha R$ 49,90, mensalidade R$ 29,90. As assinaturas existentes mantêm status e vencimentos.

## Validação

- 71 testes automatizados passaram, além de TypeScript e compilação de produção.
- 13 regressões SQL passaram com rollback: MFA, histórico, inventário, alertas/funil e os controles existentes de pagamento, aprovação, papéis, empresas, armazenamento, ordenação e analytics.
- TOTP real validado com identidades temporárias: senha sozinha, código incorreto, token AAL1 antigo e usuário comum foram bloqueados. Apenas AAL2 com sessão/fator vivos foi autorizado.
- PDF real renderizado e QR decodificado para o endereço correto; dez cenários de autorização e erro do endpoint também verificados em ambiente isolado.
- Testes de navegador em 390 e 1280 pixels verificam a central administrativa, autenticadores, histórico, rastreio, filtros, PDF, navegação, legibilidade e bloqueios de acesso.
- Cron de alertas ativo e execuções bem-sucedidas confirmadas no banco. Webhook publicado com autenticação própria preservada; GET retorna 405 e POST sem segredo retorna 401.
- Não foi feita cobrança real nem enviado e-mail a clientes nesta rodada. Esses testes não substituem uma compra real acompanhada no provedor.

## Primeiro uso

O administrador precisará configurar seu próprio aplicativo autenticador no próximo acesso. Leia o QR privado, informe o código e cadastre um dispositivo de reserva. Essa etapa precisa ser feita no dispositivo do titular; nenhum fator foi criado para a conta real do proprietário.

Uma revisão e testes reduzem riscos, mas não garantem ausência absoluta de falhas. Mantenha as dependências atualizadas e acompanhe os alertas de cobrança e os provedores.
