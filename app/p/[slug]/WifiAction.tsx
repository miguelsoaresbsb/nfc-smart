"use client";

import { useId, useState } from "react";
import { Wifi } from "lucide-react";
import { useModal } from "@/lib/use-modal";

type WifiActionData = {
  id: string;
  label: string;
  wifi_ssid?: string | null;
  wifi_password?: string | null;
  wifi_security?: string | null;
  wifi_hidden?: boolean | null;
  wifi_qr_code_id?: string | null;
  wifi_qr_code?: { image_url: string; name: string } | null;
};

export function WifiAction({ action }: { action: WifiActionData }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const titleId = useId();
  const helpId = useId();
  const dialog = useModal(open, () => setOpen(false));
  const ssid = action.wifi_ssid || "";
  const password = action.wifi_password || "";
  const security = action.wifi_security || "WPA";
  const openNetwork = security === "nopass";

  function showNetwork() {
    setCopied(false);
    setError("");
    setOpen(true);
  }

  async function copyPassword() {
    try {
      await navigator.clipboard.writeText(password);
      setError("");
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Não foi possível copiar automaticamente. Selecione e copie a senha exibida acima.");
    }
  }

  return <>
    <button type="button" className="bio-action wifi-action" data-action-id={action.id} aria-haspopup="dialog" onClick={showNetwork}>
      <span className="wifi-action-icon" aria-hidden="true"><Wifi size={26}/></span><b>{action.label}</b><small aria-hidden="true">↗</small>
    </button>
    {open && <div className="pix-modal-backdrop wifi-backdrop" onClick={() => setOpen(false)}>
      <section ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={helpId} className="pix-modal wifi-modal" onClick={event => event.stopPropagation()}>
        <button type="button" aria-label="Fechar" className="pix-close" onClick={() => setOpen(false)}>×</button>
        <div className="wifi-hero" aria-hidden="true"><div className="wifi-symbol"><Wifi size={32}/></div></div>
        <p className="eyebrow">CONEXÃO WI-FI</p>
        <h2 id={titleId}>Conecte-se à rede</h2>
        <p className="wifi-subtitle" id={helpId}>Abra as configurações de Wi-Fi do seu aparelho e selecione a rede abaixo.</p>
        <div className="wifi-details">
          <div className="wifi-detail"><span aria-hidden="true"><Wifi size={18}/></span><div><small>NOME DA REDE</small><strong>{ssid || "Não informado"}</strong></div></div>
          <div className="wifi-detail"><span aria-hidden="true">●</span><div><small>SEGURANÇA</small><strong>{openNetwork ? "Rede aberta · sem senha" : security}</strong></div></div>
          {!openNetwork && <div className="wifi-detail"><span aria-hidden="true">●</span><div><small>SENHA</small><strong>{password || "Não informada"}</strong></div></div>}
        </div>
        {password && !openNetwork && <button type="button" className="wifi-copy-password" aria-label="Copiar senha do Wi-Fi" onClick={copyPassword}><span aria-hidden="true">{copied ? "✓" : "⧉"}</span>{copied ? "Senha copiada!" : "Copiar senha do Wi-Fi"}</button>}
        <p className={"public-copy-status" + (error ? " is-error" : "")} role="status" aria-live="polite">{error || (copied ? "Senha copiada. Cole ao conectar-se à rede nas configurações do aparelho." : "")}</p>
        {action.wifi_qr_code?.image_url && <div className="wifi-qr-modal"><div className="wifi-qr-badge">QR Code Wi-Fi</div><img className="wifi-qr-image" src={action.wifi_qr_code.image_url} alt={action.wifi_qr_code.name || `QR Code da rede Wi-Fi ${ssid}`} width={260} height={260}/><p className="pix-help">Se preferir, use a câmera de outro celular para ler este código.</p></div>}
        {(!ssid || (!openNetwork && !password)) && <p className="pix-help public-dialog-tip">Se os dados estiverem incompletos, peça ajuda à equipe da empresa para conectar-se.</p>}
      </section>
    </div>}
  </>;
}
