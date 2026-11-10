import { safeAuthPath } from "./auth-redirect.ts";

export const RECOVERY_COOKIE = "nfc-recovery-intent";
export const RECOVERY_LIFETIME_SECONDS = 20 * 60;
export const RECOVERY_SUCCESS_MESSAGE = "Se este e-mail estiver cadastrado, você receberá um link para criar uma nova senha. Confira também a pasta de spam.";

/** Compare the browser Origin to the public Host, not Next's internal bind URL. */
export function isSameAuthOrigin(origin: string | null, host: string, protocol: string): boolean {
  if (!origin || !host || !["http:", "https:"].includes(protocol) || /[\s/@\\?#]/.test(host)) return false;
  try {
    const expected = new URL(`${protocol}//${host}`).origin;
    return origin === expected;
  } catch { return false; }
}

/** Intent is a UX gate bound to a verified session, never an authorization token. */
export function recoveryIntent(userId: string, sessionId: string, now = Date.now()): string {
  return `${userId}:${sessionId}:${Math.floor(now / 1000)}`;
}
export function matchesRecoveryIntent(value: string | undefined, userId: string, sessionId: string, now = Date.now()): boolean {
  if (!value || !userId || !sessionId) return false;
  const [user, session, issued, ...extra] = value.split(":");
  const age = Math.floor(now / 1000) - Number(issued);
  return !extra.length && user === userId && session === sessionId && /^\d+$/.test(issued || "") && age >= -60 && age <= RECOVERY_LIFETIME_SECONDS;
}
export function passwordValidation(password: unknown, confirmation: unknown): string | null {
  if (typeof password !== "string" || password.length < 8) return "Use uma senha com pelo menos 8 caracteres.";
  if (password.length > 128) return "Use uma senha com até 128 caracteres.";
  if (password !== confirmation) return "As senhas não coincidem. Confira os dois campos.";
  return null;
}

type EmailType = "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email";
type CallbackAuth = {
  exchangeCodeForSession(code: string, options?: { flowId?: string }): PromiseLike<{ data: unknown; error: unknown }>;
  verifyOtp(params: { token_hash: string; type: EmailType }): PromiseLike<{ error: unknown }>;
};
const emailTypes = new Set<EmailType>(["signup", "invite", "magiclink", "recovery", "email_change", "email"]);

/** A query parameter alone must never establish recovery intent. */
export async function resolveAuthCallback(params: URLSearchParams, auth: CallbackAuth) {
  const next = safeAuthPath(params.get("next"));
  const failure = { path: next.startsWith("/redefinir-senha") || params.get("type") === "recovery" ? "/redefinir-senha?error=expired" : "/login?auth_error=callback", recovery: false, failed: true };
  try {
    if (params.get("error") || params.get("error_code")) return failure;
    const code = params.get("code");
    let recovery = false;
    if (code) {
      const flowId = params.get("sb_flow_id");
      const { data, error } = await auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
      if (error) return failure;
      recovery = Boolean(data && typeof data === "object" && "redirectType" in data && data.redirectType === "recovery");
    } else {
      const token = params.get("token_hash"), type = params.get("type") as EmailType;
      if (!token || !emailTypes.has(type)) return failure;
      const { error } = await auth.verifyOtp({ token_hash: token, type });
      if (error) return failure;
      recovery = type === "recovery";
    }
    return { path: recovery ? "/redefinir-senha" : next.startsWith("/redefinir-senha") ? "/dashboard" : next, recovery, failed: false };
  } catch {
    return failure;
  }
}

type RecoveryUser = { id: string; email?: string };
export type RecoveryAuth = {
  getUser(): PromiseLike<{ data: { user: RecoveryUser | null }; error: unknown }>;
  getClaims(): PromiseLike<{ data: unknown; error: unknown }>;
  updateUser(attributes: { password: string }): PromiseLike<{ error: { code?: string } | null }>;
  signOut(): PromiseLike<{ error: unknown }>;
};
export function verifiedSessionId(data: unknown): string | null {
  if (!data || typeof data !== "object" || !("claims" in data)) return null;
  const claims = data.claims;
  return claims && typeof claims === "object" && "session_id" in claims && typeof claims.session_id === "string" ? claims.session_id : null;
}
export async function verifiedRecoveryUser(auth: Pick<RecoveryAuth, "getUser" | "getClaims">, intent: string | undefined) {
  if (!intent) return null;
  const { data: { user }, error } = await auth.getUser();
  if (error || !user) return null;
  const { data, error: claimsError } = await auth.getClaims();
  const sessionId = verifiedSessionId(data);
  if (claimsError || !sessionId || !matchesRecoveryIntent(intent, user.id, sessionId)) return null;
  return user;
}
export async function finishPasswordRecovery(auth: RecoveryAuth, intent: string | undefined, password: unknown, confirmation: unknown) {
  const validation = passwordValidation(password, confirmation);
  if (validation) return { status: 400, body: { error: validation }, clearIntent: false };
  const user = await verifiedRecoveryUser(auth, intent);
  if (!user) return { status: 401, body: { error: "O link expirou ou já foi utilizado. Solicite um novo link.", expired: true }, clearIntent: true };
  const { error } = await auth.updateUser({ password: password as string });
  if (error) return { status: 400, body: { error: error.code === "same_password" ? "Escolha uma senha diferente da anterior." : error.code === "weak_password" ? "Escolha uma senha mais forte, com letras, números e símbolos." : "Não foi possível atualizar sua senha. Tente novamente." }, clearIntent: false };
  let signoutFailed = false;
  try { const { error } = await auth.signOut(); signoutFailed = Boolean(error); }
  catch { signoutFailed = true; }
  return { status: 200, body: { ok: true, signoutFailed }, clearIntent: true };
}
