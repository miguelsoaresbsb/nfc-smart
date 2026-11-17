export const ADMIN_SECURITY_PATH = "/seguranca-admin";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Only use claims returned by the server's signature-verifying getClaims(). */
export function hasAdminMfaClaims(data: unknown, userId: string): boolean {
  if (!data || typeof data !== "object" || !("claims" in data)) return false;
  const claims = data.claims;
  if (!claims || typeof claims !== "object") return false;
  return "sub" in claims && claims.sub === userId && "aal" in claims && claims.aal === "aal2"
    && "session_id" in claims && typeof claims.session_id === "string" && uuid.test(claims.session_id);
}

export function normalizeTotpCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.replace(/\s/g, "");
  return /^\d{6}$/.test(code) ? code : null;
}

export function totpQrImage(raw: string): string {
  const prefix = "data:image/svg+xml;utf-8,";
  const svg = raw.startsWith(prefix) ? raw.slice(prefix.length) : raw;
  if (!svg.trimStart().startsWith("<svg")) throw new Error("Não foi possível preparar o QR Code do autenticador.");
  return prefix + encodeURIComponent(svg);
}

export function mfaErrorMessage(code: string | undefined): string {
  if (code === "mfa_verification_failed" || code === "mfa_challenge_expired") return "O código não foi aceito. Confira o horário do celular e digite o código mais recente do autenticador.";
  if (code === "over_request_rate_limit" || code === "over_email_send_rate_limit") return "Muitas tentativas em pouco tempo. Aguarde um momento antes de tentar novamente.";
  if (code === "mfa_factor_not_found") return "Este autenticador não está mais disponível. Atualize a página e escolha outro autenticador cadastrado.";
  if (code === "too_many_enrolled_mfa_factors" || code === "mfa_factor_limit_exceeded") return "Você atingiu o limite de autenticadores. Cancele uma configuração incompleta antes de adicionar outro.";
  if (code === "mfa_factor_name_conflict") return "Já existe um autenticador com esse nome. Escolha outro nome ou cancele a configuração incompleta correspondente.";
  if (code === "insufficient_aal" || code === "session_not_found") return "Sua confirmação de segurança expirou. Entre novamente e confirme um autenticador já cadastrado.";
  return "Não foi possível concluir a confirmação agora. Confira a conexão e tente novamente. Não compartilhe códigos nem a chave de configuração.";
}
