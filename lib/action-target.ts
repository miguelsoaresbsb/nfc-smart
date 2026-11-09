/** Turn the editor's human-friendly input into a safe, absolute public link. */
export function whatsappNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  // Brazilian numbers include a two-digit DDD, including DDD 55.
  return digits.length === 10 || digits.length === 11 ? "55" + digits : digits;
}

function webUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || /[\u0000-\u001f\u007f]/.test(trimmed)) throw new Error("Informe um endereço válido.");
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed);
  const url = new URL(hasScheme ? trimmed : "https://" + trimmed);
  if (!["https:", "http:"].includes(url.protocol) || !url.hostname.includes(".") || url.username || url.password) {
    throw new Error("Use um endereço HTTP ou HTTPS válido.");
  }
  return url.href;
}

export function actionTarget(type: string, input: string): string {
  const value = input.trim();
  if (!value) throw new Error("Informe o destino do botão.");
  if (type === "phone" || (type === "custom" && /^tel:/i.test(value))) {
    const raw = value.replace(/^tel:/i, "");
    const digits = raw.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15 || /[a-z]/i.test(raw)) throw new Error("Informe um telefone válido com DDD.");
    return "tel:" + (raw.trim().startsWith("+") ? "+" : "") + digits;
  }
  if (type === "custom" && /^mailto:/i.test(value)) {
    if (!/^mailto:[^\s@]+@[^\s@]+\.[^\s@]+$/i.test(value)) throw new Error("Informe um e-mail válido.");
    return value;
  }
  if (type === "whatsapp" && /^[+\d\s().-]+$/.test(value)) {
    const digits = whatsappNumber(value);
    if (digits.length < 10 || digits.length > 15) throw new Error("Informe um WhatsApp válido com DDD.");
    return "https://wa.me/" + digits;
  }
  if (type === "instagram" && /^@?[a-z0-9._]+$/i.test(value) && !value.includes("instagram.com")) {
    return "https://www.instagram.com/" + value.replace(/^@/, "") + "/";
  }
  return webUrl(value);
}

/** Reject unsafe legacy URLs too; render their label without a clickable link. */
export function publicActionTarget(type: string, value: string): string | null {
  try { return actionTarget(type, value); } catch { return null; }
}
