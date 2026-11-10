import { actionTarget } from "./action-target.ts";

export const actionTypes = [
  ["whatsapp", "WhatsApp", "wa"], ["instagram", "Instagram", "ig"],
  ["google", "Avaliação do Google", "star"], ["pix", "PIX", "pix"],
  ["website", "Site", "web"], ["phone", "Telefone", "tel"],
  ["maps", "Localização", "map"], ["wifi", "Wi-Fi", "wifi"], ["custom", "Personalizado", "link"],
] as const;
export type ActionType = typeof actionTypes[number][0];
export type ActionForm = {
  type: ActionType; label: string; url: string; pixKeyType: string; pixKey: string;
  pixReceiver: string; pixAmount: string; pixDescription: string; pixCopyPaste: string; pixQrCodeId: string;
  wifiSsid: string; wifiPassword: string; wifiSecurity: string; wifiHidden: boolean; wifiQrCodeId: string;
};
export type EditableAction = {
  id: string; type: string; label: string; url: string; icon: string; position: number; enabled: boolean;
  pix_key_type?: string | null; pix_key?: string | null; pix_receiver_name?: string | null;
  pix_amount?: number | null; pix_description?: string | null; pix_copy_paste?: string | null; pix_qr_code_id?: string | null;
  wifi_ssid?: string | null; wifi_password?: string | null; wifi_security?: string | null;
  wifi_hidden?: boolean | null; wifi_qr_code_id?: string | null;
};
export function emptyActionForm(type: ActionType = "whatsapp", label?: string): ActionForm {
  return { type, label: label ?? actionTypes.find(t => t[0] === type)![1], url: "", pixKeyType: "random", pixKey: "",
    pixReceiver: "", pixAmount: "", pixDescription: "", pixCopyPaste: "", pixQrCodeId: "", wifiSsid: "",
    wifiPassword: "", wifiSecurity: "WPA", wifiHidden: false, wifiQrCodeId: "" };
}
export function formFromAction(action: EditableAction): ActionForm {
  const type = actionTypes.some(t => t[0] === action.type) ? action.type as ActionType : "custom";
  return { ...emptyActionForm(type), label: action.label, url: action.url, pixKeyType: action.pix_key_type || "random",
    pixKey: action.pix_key || "", pixReceiver: action.pix_receiver_name || "", pixAmount: action.pix_amount == null ? "" : String(action.pix_amount),
    pixDescription: action.pix_description || "", pixCopyPaste: action.pix_copy_paste || "", pixQrCodeId: action.pix_qr_code_id || "",
    wifiSsid: action.wifi_ssid || "", wifiPassword: action.wifi_password || "", wifiSecurity: action.wifi_security || "WPA",
    wifiHidden: Boolean(action.wifi_hidden), wifiQrCodeId: action.wifi_qr_code_id || "" };
}
/** Every edit clears fields belonging to the previous type. Visibility/order stay outside the form. */
export function actionPayload(form: ActionForm) {
  const definition = actionTypes.find(type => type[0] === form.type);
  if (!definition) throw new Error("Escolha um tipo de botão válido.");
  const label = form.label.trim();
  if (!label || label.length > 80) throw new Error("Informe um nome de até 80 caracteres para o botão.");
  const payload = {
    type: form.type, label, icon: definition[2],
    url: form.type === "pix" ? "#pix" : form.type === "wifi" ? "#wifi" : actionTarget(form.type, form.url),
    pix_key: null as string | null, pix_key_type: null as string | null, pix_receiver_name: null as string | null,
    pix_amount: null as number | null, pix_description: null as string | null, pix_copy_paste: null as string | null, pix_qr_code_id: null as string | null,
    wifi_ssid: null as string | null, wifi_password: null as string | null, wifi_security: null as string | null,
    wifi_hidden: false, wifi_qr_code_id: null as string | null,
  };
  if (form.type === "pix") {
    if (!form.pixKey.trim() && !form.pixCopyPaste.trim() && !form.pixQrCodeId) throw new Error("Informe uma chave PIX, um código Copia e Cola ou selecione um QR Code.");
    const amount = form.pixAmount.trim() ? Number(form.pixAmount) : null;
    if (amount !== null && (!Number.isFinite(amount) || amount < 0 || amount > 999999999)) throw new Error("Informe um valor PIX válido.");
    if (!["random", "cpf", "cnpj", "phone", "email"].includes(form.pixKeyType)) throw new Error("Escolha um tipo de chave PIX válido.");
    Object.assign(payload, { pix_key: form.pixKey.trim() || null, pix_key_type: form.pixKeyType, pix_receiver_name: form.pixReceiver.trim() || null,
      pix_amount: amount, pix_description: form.pixDescription.trim() || null, pix_copy_paste: form.pixCopyPaste.trim() || null, pix_qr_code_id: form.pixQrCodeId || null });
  }
  if (form.type === "wifi") {
    if (!form.wifiSsid.trim() || new TextEncoder().encode(form.wifiSsid.trim()).length > 32) throw new Error("Informe o nome da rede Wi-Fi com até 32 bytes.");
    if (!["WPA", "WEP", "nopass"].includes(form.wifiSecurity)) throw new Error("Escolha a segurança da rede Wi-Fi.");
    if (form.wifiSecurity !== "nopass" && !form.wifiPassword) throw new Error("Informe a senha do Wi-Fi ou selecione Sem senha.");
    Object.assign(payload, { wifi_ssid: form.wifiSsid.trim(), wifi_password: form.wifiSecurity === "nopass" ? null : form.wifiPassword,
      wifi_security: form.wifiSecurity, wifi_hidden: form.wifiHidden, wifi_qr_code_id: form.wifiQrCodeId || null });
  }
  return payload;
}
export function moveAction<T extends { id: string }>(items: readonly T[], sourceId: string, targetId: string): T[] {
  const source = items.findIndex(item => item.id === sourceId), target = items.findIndex(item => item.id === targetId);
  if (source < 0 || target < 0 || source === target) return [...items];
  const result = [...items], [item] = result.splice(source, 1); result.splice(target, 0, item); return result;
}
