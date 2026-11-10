import { publicActionTarget, whatsappNumber } from "./action-target.ts";

type ContactFields = { phone?: string | null; whatsapp?: string | null; phoneEnabled?: boolean; whatsappEnabled?: boolean };
type ActionFields = {
  type: string; url: string; enabled?: boolean; pix_key?: string | null; pix_copy_paste?: string | null;
  pix_amount?: number | null; pix_description?: string | null; pix_qr_code_id?: string | null;
  wifi_ssid?: string | null; wifi_password?: string | null; wifi_security?: string | null;
  wifi_hidden?: boolean | null; wifi_qr_code_id?: string | null;
};

function phoneIdentity(value: string) {
  return whatsappNumber(value.replace(/^tel:/i, ""));
}
function destinationIdentity(type: string, value: string): string | null {
  const target = publicActionTarget(type, value);
  if (!target) return null;
  if (target.startsWith("tel:")) return "phone:" + phoneIdentity(target);
  if (target.startsWith("mailto:")) return "email:" + target.slice(7).toLowerCase();
  const url = new URL(target);
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  if (host === "wa.me" || host === "api.whatsapp.com" || host === "web.whatsapp.com") {
    const raw = host === "wa.me" ? url.pathname.slice(1) : url.searchParams.get("phone") || "";
    if (/^\+?\d{8,15}\/?$/.test(raw)) {
      // A different prefilled message is a distinct action and must be kept.
      return "whatsapp:" + whatsappNumber(raw) + ":" + JSON.stringify(url.searchParams.get("text") || "");
    }
  }
  return target;
}

/** Compare real destinations instead of labels, so renaming cannot create clones. */
export function actionIdentity(action: ActionFields): string | null {
  if (action.type === "pix") {
    if (!action.pix_key && !action.pix_copy_paste && !action.pix_qr_code_id) return null;
    return "pix:" + JSON.stringify([action.pix_key?.trim() || "", action.pix_copy_paste?.trim() || "", action.pix_amount ?? null, action.pix_description?.trim() || "", action.pix_qr_code_id || ""]);
  }
  if (action.type === "wifi") {
    const ssid = action.wifi_ssid?.trim() || "";
    if (!ssid && !action.wifi_qr_code_id) return null;
    const security = action.wifi_security || "WPA";
    return "wifi:" + JSON.stringify([ssid, security, security === "nopass" ? "" : action.wifi_password || "", Boolean(action.wifi_hidden), ssid ? "" : action.wifi_qr_code_id || ""]);
  }
  return destinationIdentity(action.type, action.url);
}

export function contactIdentities(contacts: ContactFields): Set<string> {
  const result = new Set<string>();
  if (contacts.phoneEnabled !== false && contacts.phone?.trim()) {
    const identity = destinationIdentity("phone", contacts.phone);
    if (identity) result.add(identity);
  }
  if (contacts.whatsappEnabled !== false && contacts.whatsapp?.trim()) {
    const identity = destinationIdentity("whatsapp", contacts.whatsapp);
    if (identity) result.add(identity);
  }
  return result;
}

/** Existing records stay intact. Only repeated public controls are omitted. */
export function uniquePublicActions<T extends ActionFields>(actions: readonly T[], contacts: ContactFields = {}): T[] {
  const seen = contactIdentities(contacts);
  return actions.filter(action => {
    if (action.enabled === false) return false;
    const identity = actionIdentity(action);
    if (!identity) return true;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}
