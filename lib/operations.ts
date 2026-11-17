export type BillingAlertState = "open" | "acknowledged" | "resolved";
export type BillingAlert = {
  id: string; kind: string; severity: "warning" | "critical"; state: BillingAlertState;
  company_id: string | null; company_name: string | null; reason_code: string;
  event_type: string | null; order_ref: string | null; contract_ref: string | null;
  first_seen_at: string; last_seen_at: string; attempts: number; resolved_at: string | null;
};
export type BillingAlertsResult = { items: BillingAlert[]; total: number; active: number; open: number; snapshot_at: string };
export type SalesFunnel = {
  snapshot_at: string; period_days: number; cohort_started_at: string | null;
  registered: number; confirmed: number; approved: number; paid: number; ready: number;
  legacy_active_without_evidence: number;
};

const reasons: Record<string, string> = {
  approved_company_not_found: "Pagamento recebido sem empresa aprovada correspondente. Confira o cadastro e o e-mail do comprador na Cakto.",
  local_subscription_not_found: "A empresa foi localizada, mas sua assinatura não está cadastrada. Confira a aprovação e a assinatura.",
  active_contract_already_linked: "Já existe outro contrato com período ativo para esta empresa. Confira os contratos na Cakto antes de alterar o vínculo.",
  cakto_product_mismatch: "O produto recebido difere do produto vinculado à assinatura. Confira o contrato e a configuração do webhook.",
  invalid_payment_amount: "O valor recebido não corresponde à mensalidade configurada. Confira a venda e o produto na Cakto.",
  invalid_payment_date: "A data do pagamento não pôde ser validada. Confira o evento na Cakto.",
  invalid_payment_period: "O período informado não corresponde ao plano mensal. Confira a cobrança na Cakto.",
  invalid_monthly_recurrence: "A recorrência informada não corresponde ao plano mensal. Confira o produto na Cakto.",
  payment_not_confirmed: "O evento não comprova um pagamento aprovado. Confira o status na Cakto.",
  invalid_payment_currency: "A moeda recebida não corresponde ao plano. Confira o produto na Cakto.",
  missing_required_subscription_fields: "O evento chegou sem os dados necessários para vincular a assinatura. Confira o webhook na Cakto.",
  invalid_event_record: "O evento não passou pela validação. Confira o webhook na Cakto.",
  missing_product_id: "O evento chegou sem identificação válida do produto. Confira o webhook na Cakto.",
  product_not_recurring: "O produto recebido não foi identificado como recorrente. Confira a configuração do plano na Cakto.",
  activation_mismatch: "Há pagamento processado para um período ainda válido, mas a assinatura não corresponde ao período confirmado. Confira o contrato e o histórico de cobrança.",
  subscription_late: "A Cakto informou atraso na assinatura. Confira o contrato; um período já pago continua válido até seu vencimento.",
  subscription_renewal_refused: "A Cakto informou recusa de renovação. Confira a cobrança; um período já pago continua válido até seu vencimento.",
  period_ended_without_confirmation: "O período terminou sem nova confirmação de pagamento. Isso não comprova, por si só, uma cobrança recusada.",
  invalid_expiry: "A assinatura está marcada como ativa sem vencimento definido. Confira o contrato; o acesso pago exige prazo válido.",
  processing_failed: "Não foi possível concluir o processamento. Confira o evento e as tentativas de reenvio na Cakto.",
};
export function billingAlertDescription(reason: string) { return reasons[reason] || reasons.processing_failed; }
export function billingAlertTitle(kind: string) {
  return ({ webhook_failure: "Falha no processamento", activation_mismatch: "Conferir ativação", renewal_issue: "Atenção à renovação", expired_without_renewal: "Sem confirmação de renovação", invalid_subscription: "Assinatura incompleta" } as Record<string, string>)[kind] || "Conferir cobrança";
}
export function operationalDate(value: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return "—";
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
}
