"use client";
import { useState } from "react";
import { publicActionTarget } from "@/lib/action-target";
import "./contact-actions.css";

export function ContactActions({ phone, whatsapp, phoneEnabled = true, whatsappEnabled = true }: {
  phone?: string | null; whatsapp?: string | null; phoneEnabled?: boolean; whatsappEnabled?: boolean;
}) {
  const [copied, setCopied] = useState(false), [error, setError] = useState("");
  const phoneTarget = phoneEnabled && phone ? publicActionTarget("phone", phone) : null;
  const whatsappTarget = whatsappEnabled && whatsapp ? publicActionTarget("whatsapp", whatsapp) : null;
  async function copy() {
    if (!phone) return;
    try { await navigator.clipboard.writeText(phone); setError(""); setCopied(true); setTimeout(() => setCopied(false), 1600); }
    catch { setError("Não foi possível copiar. Selecione o número: " + phone); }
  }
  if (!phoneTarget && !whatsappTarget) return null;
  return <>
    {phoneTarget && <div className="bio-action bio-phone-contact">
      <a className="bio-phone-link" href={phoneTarget} data-contact="phone"><span>☎</span><b>Ligar</b><small>↗</small></a>
      <button className="bio-phone-copy" type="button" onClick={copy} data-contact="phone_copy" aria-label="Copiar número de telefone" title={copied ? "Número copiado" : "Copiar número"}>{copied ? "✓" : "⧉"}</button>
    </div>}
    {whatsappTarget && <a className="bio-action" href={whatsappTarget} target="_blank" rel="noopener noreferrer" data-contact="whatsapp"><span>◉</span><b>WhatsApp</b><small>↗</small></a>}
    {copied && <span className="contact-copy-feedback" role="status">Número copiado.</span>}
    {error && <p role="status">{error}</p>}
  </>;
}
