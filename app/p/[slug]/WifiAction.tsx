"use client";

import {useState} from "react";
import {useModal} from "@/lib/use-modal";

type WifiActionData={
  id:string;
  label:string;
  wifi_ssid?:string|null;
  wifi_password?:string|null;
  wifi_security?:string|null;
  wifi_hidden?:boolean|null;
  wifi_qr_code_id?:string|null;
  wifi_qr_code?:{image_url:string;name:string}|null;
};

export function WifiAction({action}:{action:WifiActionData}){
  const [open,setOpen]=useState(false);
  const [copied,setCopied]=useState("");
  const [error,setError]=useState("");
  const dialog=useModal(open,()=>setOpen(false));
  const ssid=action.wifi_ssid||"";
  const password=action.wifi_password||"";
  const security=action.wifi_security||"WPA";


  async function copy(value:string,type:string){
    try{await navigator.clipboard.writeText(value);setError("");setCopied(type);setTimeout(()=>setCopied(""),1800)}catch{setError("Não foi possível copiar automaticamente. Selecione e copie o texto exibido.")}
  }

  return <>
    <button className="bio-action wifi-action" data-action-id={action.id} onClick={()=>setOpen(true)}>
      <span className="wifi-action-icon">⌁</span><b>{action.label}</b><small>↗</small>
    </button>

    {open&&<div className="pix-modal-backdrop wifi-backdrop" onClick={()=>setOpen(false)}>
      <section ref={dialog} role="dialog" aria-modal="true" aria-label="Conecte-se à rede" className="pix-modal wifi-modal" onClick={e=>e.stopPropagation()}>
        <button aria-label="Fechar" className="pix-close" onClick={()=>setOpen(false)}>×</button>
        <div className="wifi-hero"><div className="wifi-orbit wifi-orbit-one"/><div className="wifi-orbit wifi-orbit-two"/><div className="wifi-symbol">⌁</div></div>
        <p className="eyebrow">CONEXÃO WI-FI</p>
        <h2>Conecte-se à rede</h2>
        <p className="wifi-subtitle">Use o QR Code cadastrado ou copie a senha para conectar seu aparelho.</p>
        <div className="wifi-details">
          <div className="wifi-detail"><span>◉</span><div><small>NOME DA REDE</small><strong>{ssid||"Não informado"}</strong></div></div>
          <div className="wifi-detail"><span>●</span><div><small>SEGURANÇA</small><strong>{security==="nopass"?"Rede aberta":security}</strong></div></div>
          {security!=="nopass"&&<div className="wifi-detail"><span>●</span><div><small>SENHA</small><strong>{password||"Não informada"}</strong></div></div>}
        </div>
        {password&&security!=="nopass"&&<button className="wifi-copy-password" aria-label="Copiar senha do Wi-Fi" onClick={()=>copy(password,"password")}><span>{copied==="password"?"✓":"⧉"}</span>{copied==="password"?"Senha copiada!":"Copiar senha do Wi-Fi"}</button>}
        {action.wifi_qr_code?.image_url&&<div className="wifi-qr-modal"><div className="wifi-qr-badge">QR Code Wi‑Fi</div><img className="wifi-qr-image" src={action.wifi_qr_code.image_url} alt={action.wifi_qr_code.name||`QR Code da rede Wi-Fi ${ssid}`} /><div className="wifi-qr-network"><span>QR CODE CADASTRADO</span><b>{action.wifi_qr_code.name||"Wi-Fi"}</b></div></div>}
        {!action.wifi_qr_code?.image_url&&<div className="wifi-qr-network"><span>QR CODE</span><b>Nenhum QR Code Wi‑Fi cadastrado nesta ação.</b></div>}
        {error&&<p role="status">{error}</p>}
        <p className="pix-help">Use a câmera de outro celular para ler o QR Code ou copie a senha para conectar seu aparelho.</p>
      </section>
    </div>}
  </>;
}
