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

Os testes de regressão ficam em `tests/` e podem ser executados com `node --test tests/*.test.mjs` no Node 24. Os testes SQL usam transações com rollback e devem ser executados após as migrações correspondentes, em uma sessão de administração do banco.

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
