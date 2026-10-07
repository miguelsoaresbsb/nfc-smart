"use client";

import {useState} from "react";

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

function escapeWifi(value:string){
  return value.replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/:/g,"\\:").replace(/"/g,'\\"');
}

export function WifiAction({action}:{action:WifiActionData}){
  const [open,setOpen]=useState(false);
  const [copied,setCopied]=useState("");
  const ssid=action.wifi_ssid||"";
  const password=action.wifi_password||"";
  const security=action.wifi_security||"WPA";
  const payload=`WIFI:T:${security};S:${escapeWifi(ssid)};${security!=="nopass"?`P:${escapeWifi(password)};`:""}${action.wifi_hidden?"H:true;":""};`;

  async function copy(value:string,type:string){
    try{await navigator.clipboard.writeText(value);setCopied(type);setTimeout(()=>setCopied(""),1800)}catch{}
  }

  return <>
    <button className="bio-action wifi-action" data-action-id={action.id} onClick={()=>setOpen(true)}>
      <span className="wifi-action-icon">⌁</span><b>{action.label}</b><small>↗</small>
    </button>

    {open&&<div className="pix-modal-backdrop wifi-backdrop" onClick={()=>setOpen(false)}>
      <section className="pix-modal wifi-modal" onClick={e=>e.stopPropagation()}>
        <button className="pix-close" onClick={()=>setOpen(false)}>×</button>
        <div className="wifi-hero"><div className="wifi-orbit wifi-orbit-one"/><div className="wifi-orbit wifi-orbit-two"/><div className="wifi-symbol">⌁</div></div>
        <p className="eyebrow">CONEXÃO WI-FI</p>
        <h2>Conecte-se à rede</h2>
        <p className="wifi-subtitle">Copie a configuração ou use o QR Code cadastrado pela empresa.</p>
        <div className="wifi-details">
          <div className="wifi-detail"><span>◉</span><div><small>NOME DA REDE</small><strong>{ssid||"Não informado"}</strong></div></div>
          <div className="wifi-detail"><span>●</span><div><small>SEGURANÇA</small><strong>{security==="nopass"?"Rede aberta":security}</strong></div></div>
          {security!=="nopass"&&<div className="wifi-detail"><span>●</span><div><small>SENHA</small><strong>{password||"Não informada"}</strong></div></div>}
        </div>
        <button className="wifi-copy-password" onClick={()=>copy(payload,"config")}><span>{copied==="config"?"✓":"⧉"}</span>{copied==="config"?"Configuração copiada!":"Copiar configuração Wi-Fi"}</button>
        {password&&security!=="nopass"&&<button className="wifi-qr-button" onClick={()=>copy(password,"password")}><span>▦</span><div><b>{copied==="password"?"Senha copiada!":"Copiar somente a senha"}</b><small>Copiar a senha da rede</small></div><strong>›</strong></button>}
        {action.wifi_qr_code?.image_url&&<div className="wifi-qr-modal"><div className="wifi-qr-badge">QR Code Wi‑Fi</div><img className="wifi-qr-image" src={action.wifi_qr_code.image_url} alt={action.wifi_qr_code.name||`QR Code da rede Wi-Fi ${ssid}`} /><div className="wifi-qr-network"><span>QR CODE CADASTRADO</span><b>{action.wifi_qr_code.name||"Wi-Fi"}</b></div></div>}
        {!action.wifi_qr_code?.image_url&&<div className="wifi-qr-network"><span>QR CODE</span><b>Nenhum QR Code Wi‑Fi cadastrado nesta ação.</b></div>}
        <p className="pix-help">O NFC SMART não gera QR Code. O QR Code exibido aqui é a imagem que a empresa enviou em <b>Dashboard → QR Codes</b>.</p>
      </section>
    </div>}
  </>;
}
