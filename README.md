# NFC Smart

SaaS para páginas permanentes vinculadas a TAGs NFC. Next.js + Supabase + Vercel.

## Regras

- QR Codes de PIX e Wi-Fi são enviados como imagens existentes. O sistema também gera QR Codes para o endereço permanente da página NFC.
- A URL pública é permanente.
- Os dados de cada empresa são isolados por RLS; visitantes só acessam páginas com assinatura vigente.
- Modelo comercial: R$ 80,00 pela plaquinha física NFC, cobrada separadamente, e R$ 29,90/mês pelo acesso à plataforma digital.
- O acesso depende da aprovação da empresa e do pagamento da assinatura. Cancelar renovações preserva o período pago; reembolso/chargeback revoga o acesso.

## Desenvolvimento e verificações

Use Node 22–24 e execute `npm ci`, `npm run dev` e `npm run build`. Configure localmente as variáveis públicas `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` e `NEXT_PUBLIC_CAKTO_CHECKOUT_URL`. Segredos ficam em `.env.local` ou nas configurações do ambiente, nunca no Git.

A compilação executa os testes automatizados antes de gerar a aplicação. Os testes de regressão ficam em `tests/` e podem ser executados com `node --test tests/*.test.mjs` no Node 24. Os testes SQL usam transações com rollback e devem ser executados após as migrações correspondentes, em uma sessão de administração do banco.

## Recuperação de senha

O login tem uma única opção “Esqueci minha senha”. O fluxo solicita o link em `/recuperar-senha`, valida o código no callback e permite atualizar a senha em `/redefinir-senha` somente com sessão verificada e intenção de recuperação ainda válida. O código de recuperação é de uso único; o marcador da aplicação dura 20 minutos. Após salvar, a sessão é encerrada antes de voltar ao login.

No Supabase, em **Authentication → URL Configuration**, mantenha:

- **Site URL:** `https://nfc-smart-one.vercel.app`.
- **Redirect URLs:** `https://nfc-smart-one.vercel.app/auth/callback` e `https://nfc-smart-one.vercel.app/auth/callback?next=/acesso-pendente`.
- Para desenvolvimento, adicione separadamente `http://localhost:3000/auth/callback`. Cada domínio de preview utilizado para recuperação precisa de sua própria URL permitida; não use curingas amplos em produção.

O modelo de e-mail **Reset Password** pode manter o link padrão `{{ .ConfirmationURL }}`, que funciona com PKCE: a pessoa deve abrir o link no mesmo navegador em que solicitou a recuperação. Para um modelo customizado com validação do hash no servidor, o link também é aceito no formato `{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery`. Não use links que entreguem tokens no fragmento da URL para este fluxo SSR.

Configure um remetente e um provedor **SMTP personalizado** para enviar a clientes em produção; o envio padrão do Supabase tem limites e restrições de destinatário. As credenciais SMTP ficam apenas no Supabase. O código não precisa de chave de servidor no navegador. Consulte [redirecionamentos](https://supabase.com/docs/guides/auth/redirect-urls) e [SMTP personalizado](https://supabase.com/docs/guides/auth/auth-smtp).

Os testes automatizados verificam o fluxo com respostas simuladas, sem enviar e-mails e sem alterar senhas reais. A entrega real de e-mail, o domínio do remetente e as configurações SMTP devem ser validados na implantação; não são comprovados pelos testes locais.

## Recebimento da Cakto

O recebedor principal é a Edge Function `cakto-webhook` no Supabase. Publique também seu módulo compartilhado `supabase/functions/_shared/cakto.ts`, aplique a migração `atomic_cakto_webhook` antes de publicar e mantenha `verify_jwt=false`: a autenticação desse endpoint é feita pelo segredo do webhook e pela assinatura Cakto.

Configure no ambiente da função:

- `CAKTO_WEBHOOK_SECRET`: o segredo do webhook cadastrado na Cakto.
- `CAKTO_PRODUCT_ID`: produto recorrente da plataforma. O valor padrão preserva o produto já configurado no projeto.
- `CAKTO_MONTHLY_AMOUNT`: valor esperado em reais, padrão `29.90`.
- `SUPABASE_URL` e credencial de servidor: `SUPABASE_SECRET_KEY`, `SUPABASE_SECRET_KEYS.default` ou `SUPABASE_SERVICE_ROLE_KEY`. Nunca use credencial de servidor no navegador.

A rota Vercel `/api/cakto/webhook` encaminha o corpo original e os headers de assinatura para essa função quando não possui segredos próprios. Também pode processar localmente se as credenciais de servidor e `CAKTO_WEBHOOK_SECRET` forem explicitamente configurados na Vercel. Ambos os caminhos usam o mesmo processamento e o RPC `process_cakto_event`, acessível somente ao `service_role`.

Assine os eventos `purchase_approved`, `subscription_renewed`, `subscription_resumed`, `subscription_late_recovered`, `subscription_canceled`, `subscription_paused`, `subscription_late`, `subscription_renewal_refused`, `refund` e `chargeback`. Entregas V1 e V2 são aceitas. O segredo no corpo é obrigatório; quando os headers `X-Cakto-Timestamp` e `X-Cakto-Signature` estão presentes, a assinatura HMAC e a tolerância de cinco minutos também são verificadas. Produtos adicionais de uma entrega em lote são ignorados.

O comprador deve usar o e-mail da conta aprovada. Na primeira compra, o pagamento é vinculado à empresa exata da solicitação aprovada; renovações usam o contrato já vinculado. O ledger e a mudança de assinatura são atômicos e não armazenam o corpo original nem o segredo. Retentativas e eventos de aprovação/renovação para o mesmo pagamento não adicionam períodos em dobro.

A Cakto considera apenas respostas 2xx como sucesso. Segundo a [documentação oficial](https://docs.cakto.com.br/conceitos/webhooks), respostas de erro HTTP não são reenviadas automaticamente: acompanhe o histórico de entregas e reenvie eventos com falha após corrigir a causa. O teste completo de cobrança deve usar uma compra real autorizada ou o ambiente de testes da Cakto; os testes locais não efetuam cobranças.

## Organização do painel

O cliente usa um único menu: Visão geral, Minha página, Botões, Resultados e Compartilhar. A assinatura fica no menu secundário. O administrador tem uma única central em `/admin`; `/dashboard` encaminha o administrador para ela.

- Minha página reúne os modelos por segmento, temas visuais, informações e contatos. Os modelos são prévias até salvar e preservam conteúdo existente sem substituição explícita.
- Botões usa um único formulário para criar e editar. A ordem é salva pelo RPC `reorder_company_actions`, com validação completa da empresa e dos IDs. As sugestões de modelo ignoram tipos já configurados e contatos diretos.
- Compartilhar é o único lugar para copiar o endereço NFC, gerar o QR da página e enviar/baixar imagens de PIX e Wi-Fi. A rota antiga `/dashboard/qr-codes` redireciona para `/dashboard/nfc#qr-codes`.
- Resultados compara períodos de 7, 30 ou 90 dias e acompanha contatos diretos apenas por categoria, sem armazenar números de telefone. A média de cliques por visita não deve ser interpretada como taxa de conversão.

## Controles de acesso e revisão de segurança

A aprovação e o login não dão direito de uso gratuito. Editor, botões, resultados e compartilhamento exigem aprovação vinculada à empresa e assinatura `active` com `expires_at` futuro e não nulo. O cliente sem assinatura acessa somente a situação da conta e a regularização. O servidor e as políticas RLS aplicam a mesma regra, inclusive nas chamadas diretas à API, nos arquivos e na ordenação de botões.

Novos cadastros precisam confirmar o e-mail. As solicitações e o primeiro vínculo de cobrança validam o e-mail confirmado do usuário Auth, sem confiar em `user_metadata`. A página pública usa um cliente anônimo do Supabase; os cookies do proprietário não liberam uma página vencida.

Os ativos de apresentação permanecem em um bucket público para servir as imagens publicadas em URLs conhecidas. A listagem de arquivos é restrita à empresa paga e aos administradores; os uploads e alterações seguem a assinatura e o papel do usuário. Não envie arquivos privados ou documentos para esse bucket.

O webhook processa o pagamento e o ledger na mesma transação; retentativas não duplicam períodos. O período mensal é limitado, e estornos de pedidos anteriores não removem um mês pago por outro pedido. Webhooks, analytics e atualização de senha limitam o corpo durante a leitura.

A regressão SQL em `tests/paid-entitlements.sql` cobre acesso gratuito, isolamento de empresas, papéis e armazenamento. `tests/request-identity.sql` cobre e-mails não confirmados ou de terceiros. `tests/cakto-order-security.sql` cobre pagamentos, períodos e estornos. Os testes usam transações com rollback; nunca libere assinaturas fictícias persistentes em produção.

Configurações que dependem do proprietário no Supabase: validar remetente/SMTP e entrega real dos e-mails; habilitar [proteção contra senhas vazadas](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) conforme disponibilidade do plano. Autenticação de dois fatores na conta administrativa também é recomendada. Nenhuma auditoria elimina todo o risco; repita as verificações em mudanças de autorização, banco ou cobrança.
