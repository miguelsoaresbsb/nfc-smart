"use client";

import {useState} from "react";

type WiFiActionData={
  id:string;
  label:string;
  wifi_ssid?:string|null;
  wifi_password?:string|null;
  wifi_security?:string|null;
  wifi_hidden?:boolean|null;
  wifi_qr_code_id?:string|null;
  qr_code?:{image_url:string;name:string}|null;
};

function escapeWifi(value:string){
  return value.replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/:/g,"\\:").replace(/"/g,'\\"');
}

export function WiFiAction({action}:{action:WiFiActionData}){
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
    {open&&<div className="pix-modal-backdrop" onClick={()=>setOpen(false)}>
      <section className="pix-modal wifi-modal" onClick={e=>e.stopPropagation()}>
        <button className="pix-close" onClick={()=>setOpen(false)}>×</button>
        <div className="wifi-hero"><div className="wifi-symbol">⌁</div></div>
        <p className="eyebrow">WI-FI</p>
        <h2>Conecte-se ao Wi-Fi</h2>
        <p className="pix-description wifi-subtitle">Copie a configuração ou use o QR Code da empresa para conectar seu celular.</p>
        <div className="wifi-details">
          <div className="wifi-detail"><span>◉</span><div><small>REDE</small><strong>{ssid||"Não configurada"}</strong></div></div>
          <div className="wifi-detail"><span>⌘</span><div><small>SEGURANÇA</small><strong>{security==="nopass"?"Sem senha":security}</strong></div></div>
          {security!=="nopass"&&<div className="wifi-detail"><span>•••</span><div><small>SENHA</small><strong>{password||"Não configurada"}</strong></div></div>}
        </div>
        <button className="wifi-copy-password" onClick={()=>copy(payload,"config")}>{copied==="config"?"Configuração copiada!":"Copiar configuração Wi-Fi"}</button>
        {security!=="nopass"&&password&&<button className="wifi-qr-button" onClick={()=>copy(password,"password")}><span>▣</span><div><b>{copied==="password"?"Senha copiada!":"Copiar senha"}</b><small>Copiar somente a senha da rede</small></div><strong>→</strong></button>}
        {action.qr_code?.image_url&&<button className="wifi-qr-button" onClick={()=>setOpen(true)}><span>▦</span><div><b>QR Code Wi-Fi</b><small>{action.qr_code.name||"Escaneie para conectar"}</small></div><strong>↗</strong></button>}
        {action.qr_code?.image_url&&<div className="wifi-qr-modal"><img className="wifi-qr-image" src={action.qr_code.image_url} alt={action.qr_code.name||"QR Code Wi-Fi"}/><div className="wifi-qr-network"><span>QR CODE CADASTRADO</span><b>{action.qr_code.name||"Wi-Fi"}</b></div></div>}
        <p className="pix-help">O QR Code é a imagem cadastrada pela empresa; o NFC SMART não cria nem altera o QR Code.</p>
      </section>
    </div>}
  </>;
}
