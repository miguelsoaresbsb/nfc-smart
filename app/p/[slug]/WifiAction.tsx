"use client";

import {useEffect,useState} from "react";
import QRCode from "qrcode";

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
  const [qrOpen,setQrOpen]=useState(false);
  const [copied,setCopied]=useState(false);
  const [qr,setQr]=useState("");
  const ssid=action.wifi_ssid||"";
  const password=action.wifi_password||"";
  const security=action.wifi_security||"WPA";
  const wifiConfig=`WIFI:T:${security};S:${ssid.replace(/([\\;,:"])/g,"\\$1")};P:${password.replace(/([\\;,:"])/g,"\\$1")};H:${action.wifi_hidden?"true":"false"};;`;

  useEffect(()=>{
    if(!qrOpen)return;
    let alive=true;
    QRCode.toDataURL(wifiConfig,{width:420,margin:2,errorCorrectionLevel:"M"})
      .then(url=>{if(alive)setQr(url)})
      .catch(()=>{if(alive)setQr("")});
    return()=>{alive=false};
  },[qrOpen,wifiConfig]);

  async function copyPassword(){
    if(!password)return;
    try{
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(()=>setCopied(false),1800);
    }catch{}
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
        <p className="wifi-subtitle">Use a senha ou escaneie o QR Code para conectar rapidamente.</p>
        <div className="wifi-details">
          <div className="wifi-detail"><span>◉</span><div><small>NOME DA REDE</small><strong>{ssid||"Não informado"}</strong></div></div>
          <div className="wifi-detail"><span>●</span><div><small>SEGURANÇA</small><strong>{security==="nopass"?"Rede aberta":security}</strong></div></div>
          {security!=="nopass"&&<div className="wifi-detail"><span>●</span><div><small>SENHA</small><strong>{password||"Não informada"}</strong></div></div>}
        </div>
        {password&&security!=="nopass"&&<button className="wifi-copy-password" onClick={copyPassword}><span>{copied?"✓":"⧉"}</span>{copied?"Senha copiada!":"Copiar somente a senha"}</button>}
        <button className="wifi-qr-button" onClick={()=>setQrOpen(true)}><span>▦</span><div><b>Mostrar QR Code</b><small>Escaneie para conectar à rede</small></div><strong>›</strong></button>
        <p className="pix-help">A senha é copiada separadamente. O QR Code contém os dados necessários para configurar esta rede Wi‑Fi.</p>
      </section>
    </div>}

    {qrOpen&&<div className="pix-modal-backdrop wifi-qr-backdrop" onClick={()=>setQrOpen(false)}>
      <section className="pix-modal wifi-qr-modal" onClick={e=>e.stopPropagation()}>
        <button className="pix-close" onClick={()=>setQrOpen(false)}>×</button>
        <div className="wifi-qr-badge">Wi‑Fi</div>
        <p className="eyebrow">ESCANEAR PARA CONECTAR</p>
        <h2>{ssid||"Rede Wi‑Fi"}</h2>
        <p className="wifi-subtitle">Aponte a câmera do celular para este código.</p>
        {qr?<img className="wifi-qr-image" src={qr} alt={`QR Code da rede Wi-Fi ${ssid}`} />:<div className="wifi-qr-loading">Gerando QR Code…</div>}
        <div className="wifi-qr-network"><span>REDE</span><b>{ssid||"Não informada"}</b></div>
        <button className="wifi-copy-password wifi-close-qr" onClick={()=>setQrOpen(false)}>Voltar</button>
      </section>
    </div>}
  </>;
}
