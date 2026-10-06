"use client";

import {useState} from "react";

type WifiActionData={
  id:string;
  label:string;
  wifi_ssid?:string|null;
  wifi_password?:string|null;
  wifi_security?:string|null;
  wifi_hidden?:boolean|null;
};

export function WifiAction({action}:{action:WifiActionData}){
  const [open,setOpen]=useState(false);
  const [copied,setCopied]=useState("");
  const ssid=action.wifi_ssid||"";
  const password=action.wifi_password||"";
  const security=action.wifi_security||"WPA";
  const wifiConfig=`WIFI:T:${security};S:${ssid.replace(/([\\;,:"])/g,"\\$1")};P:${password.replace(/([\\;,:"])/g,"\\$1")};H:${action.wifi_hidden?"true":"false"};;`;

  async function copy(value:string,type:string){
    try{
      await navigator.clipboard.writeText(value);
      setCopied(type);
      setTimeout(()=>setCopied(""),1800);
    }catch{}
  }

  return <>
    <button className="bio-action" data-action-id={action.id} onClick={()=>setOpen(true)}>
      <span>⌁</span><b>{action.label}</b><small>↗</small>
    </button>
    {open&&<div className="pix-modal-backdrop" onClick={()=>setOpen(false)}>
      <section className="pix-modal" onClick={e=>e.stopPropagation()}>
        <button className="pix-close" onClick={()=>setOpen(false)}>×</button>
        <div className="wifi-modal-icon">Wi-Fi</div>
        <p className="eyebrow">CONEXÃO</p>
        <h2>Conectar ao Wi-Fi</h2>
        <div className="wifi-info">
          <div><small>REDE</small><strong>{ssid}</strong></div>
          <div><small>SEGURANÇA</small><strong>{security==="nopass"?"Sem senha":security}</strong></div>
          {security!=="nopass"&&<div><small>SENHA</small><strong>{password||"Não informada"}</strong></div>}
        </div>
        <button className="pix-copy" onClick={()=>copy(wifiConfig,"config")}>{copied==="config"?"Configuração copiada!":"Copiar configuração Wi-Fi"}</button>
        {password&&security!=="nopass"&&<button className="wifi-copy-secondary" onClick={()=>copy(password,"password")}>{copied==="password"?"Senha copiada!":"Copiar senha"}</button>}
        <p className="pix-help">Depois de copiar, abra as configurações de Wi-Fi do celular e conecte-se à rede. A configuração copiada também pode ser usada por aplicativos que reconhecem o formato Wi-Fi.</p>
      </section>
    </div>}
  </>;
}
